-- ============================================================
-- FILANTROPI MANAGEMENT SYSTEM — SKEMA PRODUKSI SUPABASE v2.3 (TAHAP 3)
-- Jalankan SELURUH file ini di Supabase SQL Editor (Project → SQL Editor).
-- Idempoten: aman dijalankan ulang.
--
-- Isi: 29 tabel + trigger updated_at + RLS penuh + view publik aman
--      + RPC (status pembayaran hanya via webhook/demo-guarded)
--      + trigger saldo program + seed peran/izin/pengaturan
--      + bucket Storage "uploads".
--
-- RED LINE yang ditegakkan skema ini:
--   1. Status payment_transactions → 'berhasil' TIDAK dapat diubah client:
--      hanya service_role (Edge Function payment-webhook) atau
--      admin berizin transactions.verify/correct (konfirmasi manual).
--   2. RPC demo_finalize_payment MENOLAK bekerja bila demo_mode=false.
--   3. Dana zakat/infak/sedekah/wakaf/sosial terpisah per fund_type
--      (financial_transactions.fund_type — saldo = masuk − keluar per dana).
--   4. PII penerima manfaat hanya untuk peran beneficiaries.view.
--   5. Data finansial publik hanya lewat view ft_public (tanpa PII donatur).
-- ============================================================

-- pgcrypto opsional: di Supabase tersedia; di PostgreSQL 13+ murni,
-- gen_random_uuid() sudah bawaan sehingga ekstensi boleh gagal dibuat.
do $$ begin
  create extension if not exists "pgcrypto";
exception when others then
  raise notice 'pgcrypto tidak tersedia — memakai gen_random_uuid() bawaan PostgreSQL 13+.';
end $$;

-- Portabilitas: di luar Supabase (psql lokal) peran anon/authenticated/service_role
-- belum ada; di Supabase ketiganya sudah bawaan sehingga blok ini no-op.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
exception when insufficient_privilege then
  raise notice 'Tidak berhak membuat peran — asumsikan berjalan di Supabase (peran sudah ada).';
end $$;

-- ============================================================
-- 1) PERAN & IZIN (RBAC — 8 peran + modul Outbox Tahap 2)
-- ============================================================
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  permissions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  module text not null,
  action text not null
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid() references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role_key text not null references roles(key),
  role_label text,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role_key text not null references roles(key),
  assigned_at timestamptz not null default now()
);

-- ============================================================
-- 2) PENGATURAN LEMBAGA & ZAKAT
-- ============================================================
create table if not exists institution_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null default 'Lembaga Filantropi',
  tagline text, about text, history text, vision text,
  mission jsonb default '[]',
  address text, phone text, wa text, email text,
  legal_sk text, legal_npwp text, legal_akreditasi text,
  maps_embed_url text, maps_link text,
  banks jsonb default '[]',
  payment_gateway jsonb default '{}',   -- API key TIDAK disimpan di sini (Edge Function secret)
  whatsapp_api jsonb default '{}',      -- token disimpan juga sebagai secret WA_TOKEN
  smtp jsonb default '{}', gemini jsonb default '{}',
  receipt jsonb default '{}', seo jsonb default '{}',
  demo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zakat_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  gold_price_gram numeric not null default 0,
  nisab_gold_gram numeric not null default 85,
  rate_pct numeric not null default 2.5,
  info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_structures (
  id uuid primary key default gen_random_uuid(),
  name text not null, position text not null, level int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ============================================================
-- 3) PROGRAM & KAMPANYE
-- ============================================================
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Pendidikan','Kesehatan','Kemanusiaan','Bantuan Bencana','Pemberdayaan Ekonomi','Sosial & Keagamaan','ZISWAF')),
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  target numeric not null default 0,
  collected numeric not null default 0,      -- dirawat trigger trg_programs_collected
  short_desc text, description text, image_url text,
  status text not null default 'aktif' check (status in ('aktif','nonaktif','selesai')),
  featured boolean not null default false,
  beneficiary_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_programs_category on programs(category);
create index if not exists idx_programs_status on programs(status);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null, slug text unique,
  program_id uuid references programs(id),
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  target numeric not null default 0,
  ends_at timestamptz, short_desc text, image_url text,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_campaigns_status on campaigns(status);

-- ============================================================
-- 4) DONATUR, DONASI, PEMBAYARAN, KUITANSI
-- ============================================================
create table if not exists donors (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text unique not null, phone text, address text,
  auth_user_id uuid references auth.users(id) on delete set null,  -- Supabase Auth
  verified boolean not null default false,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_donors_email on donors(email);
create index if not exists idx_donors_auth on donors(auth_user_id);

create table if not exists recurring_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references donors(id),
  donor_name text, email text,
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  program_id uuid references programs(id),
  amount numeric not null,
  method_code text not null,
  status text not null default 'aktif' check (status in ('aktif','dibatalkan','jeda')),
  start_date timestamptz default now(), next_charge timestamptz, last_charge timestamptz,
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_recurring_donor on recurring_donations(donor_id);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  donation_code text unique not null,
  donor_id uuid references donors(id),
  donor_name text not null,
  donor_email text, donor_phone text,
  is_anonymous boolean not null default false,
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  program_id uuid references programs(id),
  campaign_id uuid references campaigns(id),
  amount numeric not null check (amount >= 0),
  unique_code int, total_amount numeric not null,
  payment_method_code text not null,
  donation_type text not null default 'sekali' check (donation_type in ('sekali','bulanan')),
  recurring_id uuid references recurring_donations(id),
  message text,
  status text not null default 'menunggu' check (status in ('menunggu','berhasil','gagal','kedaluwarsa','dibatalkan')),
  payment_deadline timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_donations_status on donations(status);
create index if not exists idx_donations_program on donations(program_id);
create index if not exists idx_donations_donor on donations(donor_id);
create index if not exists idx_donations_code on donations(donation_code);

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null,
  type text not null check (type in ('va','qris','ewallet','gateway','transfer_manual')),
  instructions text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
/* TAHAP 3: aktifkan tipe 'transfer_manual' pada instalasi lama
   (constraint lama masih memuat daftar 4 tipe) */
do $$ begin
  alter table payment_methods drop constraint if exists payment_methods_type_check;
  alter table payment_methods add constraint payment_methods_type_check
    check (type in ('va','qris','ewallet','gateway','transfer_manual'));
exception when others then
  raise notice 'penyesuaian constraint payment_methods.type dilewati: %', sqlerrm;
end $$;

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  trx_code text unique not null,
  donation_id uuid not null references donations(id),
  donation_code text,
  amount numeric not null,
  method_code text not null,
  provider text,
  va_number text, provider_reference text,
  status text not null default 'menunggu' check (status in ('menunggu','berhasil','gagal','kedaluwarsa','dibatalkan')),
  expires_at timestamptz, paid_at timestamptz,
  reconciled boolean not null default false, reconciled_at timestamptz, reconciled_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_trx_donation on payment_transactions(donation_id);
create index if not exists idx_trx_status on payment_transactions(status);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null,
  donation_id uuid not null references donations(id),
  trx_code text, amount numeric not null,
  fund_type text, program_name text, donor_name text, method text,
  issued_at timestamptz default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_receipts_donation on receipts(donation_id);

-- ============================================================
-- 5) PENERIMA MANFAAT & PENYALURAN
-- ============================================================
create table if not exists beneficiaries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nik text, phone text, address text,        -- sensitif: RLS ketat + masking UI
  category text, needs text,
  program_id uuid references programs(id),
  photo_consent boolean not null default false,
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists distributions (
  id uuid primary key default gen_random_uuid(),
  dist_number text unique not null,
  program_id uuid references programs(id),
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  beneficiary_id uuid references beneficiaries(id),
  amount numeric not null,
  status text not null default 'diajukan' check (status in ('diajukan','diverifikasi','disetujui','disalurkan','selesai','ditolak')),
  description text, proof_url text, report_note text,
  requested_by text, verified_by text, approved_by text,
  disbursed_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_dist_status on distributions(status);
create index if not exists idx_dist_fund on distributions(fund_type);

-- ============================================================
-- 6) AKUNTANSI (dana terbatas terpisah per fund_type)
-- ============================================================
create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  acc_code text unique not null, name text not null,
  type text not null check (type in ('bank','cash')),
  bank_name text, number text, balance numeric not null default 0,
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists financial_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null,
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  direction text not null check (direction in ('masuk','keluar')),
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  trx_type text not null check (trx_type in ('donasi','penyaluran','penyesuaian')),
  direction text not null check (direction in ('masuk','keluar')),
  fund_type text not null check (fund_type in ('zakat','infak','sedekah','wakaf','sosial')),
  category_code text not null references financial_categories(code),
  amount numeric not null check (amount >= 0),
  ref_code text, description text,
  trx_date timestamptz not null default now(),
  status text not null default 'berhasil',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_fin_fund on financial_transactions(fund_type);
create index if not exists idx_fin_date on financial_transactions(trx_date);

create table if not exists financial_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text unique not null,
  title text not null, period text, year int,
  total_in numeric default 0, total_out numeric default 0,
  status text not null default 'draf' check (status in ('draf','disetujui')),
  note text, approved_at timestamptz, approved_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ============================================================
-- 7) KONTEN
-- ============================================================
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text not null,
  excerpt text, content text, author text, image_url text,
  published boolean not null default false, views int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_news_published on news(published);

create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text, image_url text,
  consent boolean not null default false,
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null, role text, quote text not null,
  approved boolean not null default false, status text not null default 'menunggu',
  photo_consent boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null, answer text not null, order_no int default 1,
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists newsletters (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text,
  status text not null default 'draf' check (status in ('draf','terkirim')),
  sent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null, name text,
  status text not null default 'aktif',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ============================================================
-- 8) NOTIFIKASI (dashboard + outbox WA/Email Tahap 2) & AUDIT
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text,
  type text, target_role text,
  read boolean not null default false,
  -- Tahap 2: outbox WhatsApp / Email
  channel text default 'dashboard',           -- dashboard | whatsapp | email
  wa_status text default null,                -- pending | terkirim | terkirim_manual | gagal
  wa_phone text, wa_message text, wa_ref text, wa_link text,
  wa_via text, wa_sent_at timestamptz, wa_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_notif_unread on notifications(read);
create index if not exists idx_notif_channel on notifications(channel);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  user_name text, user_role text,
  action text not null, entity text not null, entity_id text,
  old_values jsonb, new_values jsonb,
  note text, ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_logs(entity);
create index if not exists idx_audit_user on audit_logs(user_id);

-- ============================================================
-- TRIGGER updated_at otomatis (semua tabel)
-- ============================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['roles','profiles','user_roles','institution_settings','zakat_settings',
    'organization_structures','programs','campaigns','donors','recurring_donations','donations',
    'payment_methods','payment_transactions','receipts','beneficiaries','distributions',
    'financial_accounts','financial_categories','financial_transactions','financial_reports',
    'news','galleries','testimonials','faqs','newsletters','newsletter_subscribers','notifications']
  loop
    execute format('drop trigger if exists trg_updated_at on %I', t);
    execute format('create trigger trg_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ============================================================
-- TRIGGER: saldo terkumpul program (programs.collected)
-- Menjaga angka "terkumpul" tetap benar walau anonim tidak dapat
-- membaca tabel donasi langsung.
-- ============================================================
create or replace function sync_program_collected() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update programs p set collected = coalesce((
    select sum(d.amount) from donations d
    where d.program_id = p.id and d.status = 'berhasil'
  ), 0)
  where p.id in (
    select coalesce(old.program_id, new.program_id)
    union select coalesce(new.program_id, old.program_id)
  );
  return null;
end $$;
drop trigger if exists trg_programs_collected on donations;
create trigger trg_programs_collected after insert or update or delete on donations
for each row execute function sync_program_collected();

-- ============================================================
-- HELPER RLS
-- ============================================================
create or replace function auth_role_key() returns text
language sql stable security definer set search_path = public as $$
  select role_key from profiles where id = auth.uid() and status = 'aktif'
$$;

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from profiles pr join roles r on r.key = pr.role_key
    where pr.id = auth.uid() and pr.status = 'aktif'
      and (r.permissions @> '["*"]'
           or r.permissions ? p
           or r.permissions ? (split_part(p, '.', 1) || '.*'))
  )
$$;

-- ============================================================
-- VIEW PUBLIK AMAN (tanpa PII donatur)
-- ft_public     : jurnal keuangan untuk halaman Transparansi
-- public_stats  : statistik agregat untuk beranda
-- ============================================================
create or replace view ft_public as
select id, trx_type, direction, fund_type, category_code, amount,
  ref_code,
  case when trx_type = 'donasi'
    then 'Donasi ' || initcap(fund_type) || ' — Donatur Baik (' || coalesce(ref_code, '-') || ')'
    else description end as description,
  trx_date, status, created_at, updated_at
from financial_transactions;

create or replace view public_stats as
select
  (select count(*) from donors where status = 'aktif') as donors,
  (select count(*) from beneficiaries) as beneficiaries,
  (select coalesce(sum(amount), 0) from donations where status = 'berhasil') as total_donation,
  (select count(*) from donations where status = 'berhasil') as total_transactions,
  (select coalesce(sum(amount), 0) from distributions where status in ('disalurkan','selesai')) as total_distributed;

grant select on ft_public to anon, authenticated;
grant select on public_stats to anon, authenticated;

-- ============================================================
-- RPC STATUS PEMBAYARAN (jalur resmi satu-satunya)
-- ============================================================

/* (1) Status & kuitansi donasi publik — akses dengan kode (code-gated) */
create or replace function donation_status(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d donations; t payment_transactions; r receipts;
begin
  select * into d from donations where donation_code = upper(trim(p_code)) or donation_code = trim(p_code);
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode donasi tidak ditemukan'); end if;
  select * into t from payment_transactions where donation_id = d.id limit 1;
  select * into r from receipts where donation_id = d.id limit 1;
  return jsonb_build_object('ok', true, 'donation', to_jsonb(d), 'transaction', to_jsonb(t), 'receipt', to_jsonb(r));
end $$;

/* (2) Finalisasi SIMULASI (DEMO) — ditolak bila demo_mode = false.
      Di produksi, status diubah oleh Edge Function payment-webhook
      (service_role) yang memverifikasi signature provider. */
create or replace function demo_finalize_payment(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d donations; t payment_transactions; r receipts;
  ym text; nn int; now_ts timestamptz := now();
begin
  if not coalesce((select demo_mode from institution_settings limit 1), false) then
    return jsonb_build_object('ok', false, 'message',
      'MODE DEMO nonaktif. Status pembayaran hanya diubah webhook payment gateway terverifikasi.');
  end if;
  select * into t from payment_transactions
    where trx_code = trim(p_code) or donation_code = trim(p_code) limit 1;
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode transaksi tidak ditemukan.'); end if;
  if t.status = 'berhasil' then return jsonb_build_object('ok', false, 'message', 'Transaksi sudah Berhasil.'); end if;
  if t.status <> 'menunggu' then return jsonb_build_object('ok', false, 'message', 'Transaksi sudah berstatus ' || t.status); end if;

  perform pg_advisory_xact_lock(778801); -- serialisasi penerbitan nomor kuitansi
  select * into d from donations where id = t.donation_id;
  update payment_transactions set status = 'berhasil', paid_at = now_ts,
    provider_reference = 'WEBHOOK-DEMO-' || upper(substr(gen_random_uuid()::text, 1, 8))
    where id = t.id;
  update donations set status = 'berhasil', paid_at = now_ts where id = d.id;

  select * into r from receipts where donation_id = d.id limit 1;
  if not found then
    ym := to_char(now_ts, 'YYYYMM');
    select count(*) + 1 into nn from receipts where receipt_no like 'RCPT-' || ym || '-%';
    insert into receipts (receipt_no, donation_id, trx_code, amount, fund_type, program_name, donor_name, method, issued_at)
    values ('RCPT-' || ym || '-' || lpad(nn::text, 4, '0'), d.id, t.trx_code, d.amount, d.fund_type,
      coalesce((select name from programs where id = d.program_id), 'Dana Umum'),
      d.donor_name, d.payment_method_code, now_ts)
    returning * into r;
  end if;

  insert into financial_transactions (trx_type, direction, fund_type, category_code, amount, ref_code, description, trx_date, status)
  values ('donasi', 'masuk', d.fund_type, 'IN-' || upper(d.fund_type), d.amount, d.donation_code,
    'Donasi ' || initcap(d.fund_type) || ' — ' || d.donor_name || ' (' || d.donation_code || ')', now_ts, 'berhasil');

  if d.recurring_id is not null then
    update recurring_donations set next_charge = now_ts + interval '30 days', last_charge = now_ts where id = d.recurring_id;
  end if;

  insert into notifications (title, description, type, read)
  values ('Pembayaran donasi berhasil', 'Donasi ' || d.donation_code || ' terverifikasi via webhook (DEMO).', 'donasi', false);

  insert into audit_logs (user_name, user_role, action, entity, entity_id, old_values, new_values, note)
  values ('Sistem', '-', 'webhook.payment_success', 'payment_transactions', t.id::text,
    jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', 'berhasil'),
    'Simulasi webhook (MODE DEMO). Produksi: hanya Edge Function payment-webhook.');

  return jsonb_build_object('ok', true, 'donation_id', d.id, 'receipt_no', r.receipt_no);
end $$;

/* (3) Pembatalan donasi oleh donatur (hanya saat menunggu) */
create or replace function cancel_donation_public(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d donations;
begin
  select * into d from donations where donation_code = trim(p_code);
  if not found or d.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'message', 'Donasi tidak dapat dibatalkan.');
  end if;
  update donations set status = 'dibatalkan' where id = d.id;
  update payment_transactions set status = 'dibatalkan' where donation_id = d.id and status = 'menunggu';
  update recurring_donations set status = 'dibatalkan' where id = d.recurring_id;
  insert into audit_logs (user_name, user_role, action, entity, entity_id, old_values, new_values, note)
  values ('Sistem', '-', 'donation.cancel_by_donor', 'donations', d.id::text,
    jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', 'dibatalkan'), 'Dibatalkan oleh donatur');
  return jsonb_build_object('ok', true);
end $$;

/* (4) Kedaluwarsa otomatis (>24 jam) */
create or replace function expire_stale_payments() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select * from payment_transactions where status = 'menunggu' and expires_at < now()
  loop
    update payment_transactions set status = 'kedaluwarsa' where id = r.id;
    update donations set status = 'kedaluwarsa' where id = r.donation_id and status = 'menunggu';
    insert into audit_logs (user_name, user_role, action, entity, entity_id, note)
    values ('Sistem', '-', 'system.auto_expire', 'payment_transactions', r.id::text,
      'Kedaluwarsa otomatis (batas 24 jam terlampaui)');
    n := n + 1;
  end loop;
  return n;
end $$;

/* (5) Penambah view berita */
create or replace function increment_news_views(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update news set views = views + 1 where id = p_id;
$$;

/* (6) FINALISASI PRODUKSI dari Edge Function payment-webhook (service_role).
      Dipanggil SETELAH signature provider terverifikasi di server.
      p_success=false menandai transaksi gagal. */
create or replace function webhook_finalize_payment(p_code text, p_provider_ref text, p_note text, p_success boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t payment_transactions; d donations; r receipts; ym text; nn int; now_ts timestamptz := now();
begin
  select * into t from payment_transactions
    where trx_code = trim(p_code) or donation_code = trim(p_code) limit 1;
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode transaksi tidak ditemukan: ' || p_code); end if;
  if t.status = 'berhasil' then
    return jsonb_build_object('ok', true, 'message', 'Sudah diproses sebelumnya (idempoten).', 'receipt_no',
      (select receipt_no from receipts where donation_id = t.donation_id limit 1));
  end if;
  if t.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'message', 'Transaksi sudah berstatus ' || t.status || ' — webhook diabaikan.');
  end if;

  perform pg_advisory_xact_lock(778801); -- serialisasi penerbitan nomor kuitansi
  if not p_success then
    update payment_transactions set status = 'gagal', provider_reference = p_provider_ref where id = t.id;
    update donations set status = 'gagal' where id = t.donation_id and status = 'menunggu';
    insert into audit_logs (user_name, user_role, action, entity, entity_id, old_values, new_values, note)
    values ('Sistem', '-', 'webhook.payment_failed', 'payment_transactions', t.id::text,
      jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', 'gagal'), p_note);
    return jsonb_build_object('ok', true, 'status', 'gagal');
  end if;

  select * into d from donations where id = t.donation_id;
  update payment_transactions set status = 'berhasil', paid_at = now_ts, provider_reference = p_provider_ref where id = t.id;
  update donations set status = 'berhasil', paid_at = now_ts where id = d.id;

  select * into r from receipts where donation_id = d.id limit 1;
  if not found then
    ym := to_char(now_ts, 'YYYYMM');
    select count(*) + 1 into nn from receipts where receipt_no like 'RCPT-' || ym || '-%';
    insert into receipts (receipt_no, donation_id, trx_code, amount, fund_type, program_name, donor_name, method, issued_at)
    values ('RCPT-' || ym || '-' || lpad(nn::text, 4, '0'), d.id, t.trx_code, d.amount, d.fund_type,
      coalesce((select name from programs where id = d.program_id), 'Dana Umum'),
      d.donor_name, d.payment_method_code, now_ts)
    returning * into r;
  end if;

  insert into financial_transactions (trx_type, direction, fund_type, category_code, amount, ref_code, description, trx_date, status)
  values ('donasi', 'masuk', d.fund_type, 'IN-' || upper(d.fund_type), d.amount, d.donation_code,
    'Donasi ' || initcap(d.fund_type) || ' — ' || d.donor_name || ' (' || d.donation_code || ')', now_ts, 'berhasil');

  if d.recurring_id is not null then
    update recurring_donations set next_charge = now_ts + interval '30 days', last_charge = now_ts where id = d.recurring_id;
  end if;

  insert into notifications (title, description, type, read)
  values ('Pembayaran donasi berhasil', 'Donasi ' || d.donation_code || ' sebesar ' || d.amount || ' terverifikasi via webhook.', 'donasi', false);

  insert into audit_logs (user_name, user_role, action, entity, entity_id, old_values, new_values, note)
  values ('Sistem', '-', 'webhook.payment_success', 'payment_transactions', t.id::text,
    jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', 'berhasil'), p_note);

  return jsonb_build_object('ok', true, 'status', 'berhasil', 'receipt_no', r.receipt_no, 'donation_code', d.donation_code);
end $$;

grant execute on function donation_status(text) to anon, authenticated;
grant execute on function demo_finalize_payment(text) to anon, authenticated;
grant execute on function cancel_donation_public(text) to anon, authenticated;
grant execute on function expire_stale_payments() to anon, authenticated;
grant execute on function increment_news_views(uuid) to anon, authenticated;

-- RED LINE: webhook_finalize_payment hanya boleh dipanggil service_role
-- (Edge Function payment-webhook). Kunci pintu dari anon/authenticated/public:
revoke execute on function webhook_finalize_payment(text, text, text, boolean) from public;
grant execute on function webhook_finalize_payment(text, text, text, boolean) to service_role;

/* ============================================================
   TAHAP 3 — TRANSFER MANUAL + KONFIRMASI WHATSAPP
   Alur: donatur transfer ke rekening lembaga → kirim bukti via WA
   → admin berizin transactions.verify memverifikasi di panel →
   server menfinalisasi (status, kuitansi, jurnal, audit) atomik.
   ============================================================ */

/* (7) Verifikasi manual oleh ADMIN (bukan webhook!) — security definer.
      Satu-satunya jalur admin untuk menaikkan status menjadi 'berhasil';
      menggantikan penulisan tabel langsung dari klien agar kuitansi +
      jurnal keuangan + audit SELALU dibuat atomik di server. */
create or replace function admin_verify_payment(p_code text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t payment_transactions; d donations; r receipts; ym text; nn int; now_ts timestamptz := now();
  adm_name text; adm_role text;
begin
  /* hanya pengguna login berizin transactions.verify */
  if auth.uid() is null or not has_perm('transactions.verify') then
    return jsonb_build_object('ok', false, 'message', 'Akses ditolak — memerlukan izin transactions.verify.');
  end if;
  if p_note is null or length(trim(p_note)) < 3 then
    return jsonb_build_object('ok', false, 'message', 'Catatan verifikasi wajib diisi (minimal 3 karakter) — tercatat pada Audit Trail.');
  end if;

  select * into t from payment_transactions
    where trx_code = upper(trim(p_code)) or donation_code = upper(trim(p_code)) limit 1;
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode transaksi tidak ditemukan: ' || p_code); end if;
  if t.status = 'berhasil' then return jsonb_build_object('ok', false, 'message', 'Transaksi sudah Berhasil.'); end if;
  if t.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'message', 'Transaksi sudah berstatus ' || t.status || ' dan tidak dapat dikonfirmasi manual.');
  end if;

  perform pg_advisory_xact_lock(778801); -- serialisasi penerbitan nomor kuitansi
  select * into d from donations where id = t.donation_id;
  select coalesce(name, email), coalesce(role_key, '-') into adm_name, adm_role
    from profiles where id = auth.uid();

  update payment_transactions set status = 'berhasil', paid_at = now_ts,
    provider_reference = 'MANUAL-' || upper(substr(gen_random_uuid()::text, 1, 8))
    where id = t.id;
  update donations set status = 'berhasil', paid_at = now_ts where id = d.id;

  select * into r from receipts where donation_id = d.id limit 1;
  if not found then
    ym := to_char(now_ts, 'YYYYMM');
    select count(*) + 1 into nn from receipts where receipt_no like 'RCPT-' || ym || '-%';
    insert into receipts (receipt_no, donation_id, trx_code, amount, fund_type, program_name, donor_name, method, issued_at)
    values ('RCPT-' || ym || '-' || lpad(nn::text, 4, '0'), d.id, t.trx_code, d.amount, d.fund_type,
      coalesce((select name from programs where id = d.program_id), 'Dana Umum'),
      d.donor_name, d.payment_method_code, now_ts)
    returning * into r;
  end if;

  insert into financial_transactions (trx_type, direction, fund_type, category_code, amount, ref_code, description, trx_date, status)
  values ('donasi', 'masuk', d.fund_type, 'IN-' || upper(d.fund_type), d.amount, d.donation_code,
    'Donasi ' || initcap(d.fund_type) || ' — ' || d.donor_name || ' (' || d.donation_code || ')', now_ts, 'berhasil');

  if d.recurring_id is not null then
    update recurring_donations set next_charge = now_ts + interval '30 days', last_charge = now_ts where id = d.recurring_id;
  end if;

  insert into notifications (title, description, type, read)
  values ('Pembayaran donasi berhasil', 'Donasi ' || d.donation_code || ' sebesar ' || d.amount || ' diverifikasi manual oleh admin.', 'donasi', false);

  insert into audit_logs (user_name, user_role, action, entity, entity_id, old_values, new_values, note)
  values (coalesce(adm_name, 'Admin'), adm_role, 'transaction.manual_confirm', 'payment_transactions', t.id::text,
    jsonb_build_object('status', 'menunggu'), jsonb_build_object('status', 'berhasil'),
    'Verifikasi manual bukti transfer (konfirmasi WhatsApp donatur). ' || trim(p_note));

  return jsonb_build_object('ok', true, 'status', 'berhasil', 'receipt_no', r.receipt_no,
    'donation_code', d.donation_code, 'verified_by', coalesce(adm_name, 'Admin'));
end $$;

-- hanya pengguna login; anon/public tidak boleh:
revoke execute on function admin_verify_payment(text, text) from public;
grant execute on function admin_verify_payment(text, text) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','profiles','user_roles','institution_settings',
    'zakat_settings','organization_structures','programs','campaigns','donors','recurring_donations',
    'donations','payment_methods','payment_transactions','receipts','beneficiaries','distributions',
    'financial_accounts','financial_categories','financial_transactions','financial_reports',
    'news','galleries','testimonials','faqs','newsletters','newsletter_subscribers','notifications','audit_logs']
  loop
    execute format('alter table %I enable row level security', t);
    -- CATATAN: tanpa FORCE RLS — pemilik tabel (postgres) melewati RLS sehingga
    -- view ft_public / public_stats tetap dapat dibaca publik (baris sudah dimasking).
  end loop;
end $$;

-- ---------- KONTEN PUBLIK (baca publik) ----------
drop policy if exists pub_programs on programs;
create policy pub_programs on programs for select
  using (status = 'aktif' or has_perm('programs.view'));
drop policy if exists adm_programs on programs;
create policy adm_programs on programs for all
  using (has_perm('programs.manage')) with check (has_perm('programs.manage'));

drop policy if exists pub_campaigns on campaigns;
create policy pub_campaigns on campaigns for select
  using (status = 'aktif' or has_perm('campaigns.view'));
drop policy if exists adm_campaigns on campaigns;
create policy adm_campaigns on campaigns for all
  using (has_perm('campaigns.manage')) with check (has_perm('campaigns.manage'));

drop policy if exists pub_news on news;
create policy pub_news on news for select using (published = true or has_perm('content.view'));
drop policy if exists adm_news on news;
create policy adm_news on news for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists pub_galleries on galleries;
create policy pub_galleries on galleries for select using (status = 'aktif' or has_perm('content.view'));
drop policy if exists adm_galleries on galleries;
create policy adm_galleries on galleries for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists pub_testimonials on testimonials;
create policy pub_testimonials on testimonials for select using (approved = true or has_perm('content.view'));
drop policy if exists adm_testimonials on testimonials;
create policy adm_testimonials on testimonials for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists pub_faqs on faqs;
create policy pub_faqs on faqs for select using (status = 'aktif' or has_perm('content.view'));
drop policy if exists adm_faqs on faqs;
create policy adm_faqs on faqs for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists pub_org on organization_structures;
create policy pub_org on organization_structures for select using (true);
drop policy if exists adm_org on organization_structures;
create policy adm_org on organization_structures for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists pub_settings on institution_settings;
create policy pub_settings on institution_settings for select using (true);
drop policy if exists adm_settings on institution_settings;
create policy adm_settings on institution_settings for update using (has_perm('settings.manage')) with check (has_perm('settings.manage'));

drop policy if exists pub_zakat on zakat_settings;
create policy pub_zakat on zakat_settings for select using (true);
drop policy if exists adm_zakat on zakat_settings;
create policy adm_zakat on zakat_settings for update using (has_perm('settings.manage')) with check (has_perm('settings.manage'));

drop policy if exists pub_pm on payment_methods;
create policy pub_pm on payment_methods for select using (active = true or has_perm('settings.manage'));
drop policy if exists adm_pm on payment_methods;
create policy adm_pm on payment_methods for all using (has_perm('settings.manage')) with check (has_perm('settings.manage'));

drop policy if exists pub_reports on financial_reports;
create policy pub_reports on financial_reports for select
  using (status = 'disetujui' or has_perm('finance.view'));
drop policy if exists adm_reports on financial_reports;
create policy adm_reports on financial_reports for all
  using (has_perm('finance.manage') or has_perm('finance.approve_reports')) with check (has_perm('finance.manage'));

-- ---------- DONATUR ----------
drop policy if exists own_donors on donors;
create policy own_donors on donors for select
  using (auth_user_id = auth.uid() or email = coalesce(auth.jwt() ->> 'email', '') or has_perm('donors.view'));
drop policy if exists ins_donors on donors;
create policy ins_donors on donors for insert with check (auth.uid() is not null);  -- registrasi mandiri (session signUp) / admin
drop policy if exists upd_donors on donors;
create policy upd_donors on donors for update
  using (auth_user_id = auth.uid() or has_perm('donors.manage')) with check (auth_user_id = auth.uid() or has_perm('donors.manage'));
drop policy if exists del_donors on donors;
create policy del_donors on donors for delete using (has_perm('donors.manage'));

drop policy if exists own_recurring on recurring_donations;
create policy own_recurring on recurring_donations for select
  using (donor_id in (select id from donors where auth_user_id = auth.uid() or email = coalesce(auth.jwt() ->> 'email','')) or has_perm('donors.manage'));
drop policy if exists ins_recurring on recurring_donations;
create policy ins_recurring on recurring_donations for insert with check (true);
drop policy if exists upd_recurring on recurring_donations;
create policy upd_recurring on recurring_donations for update
  using (donor_id in (select id from donors where auth_user_id = auth.uid()) or has_perm('donors.manage'))
  with check (donor_id in (select id from donors where auth_user_id = auth.uid()) or has_perm('donors.manage'));

-- ---------- DONASI & PEMBAYARAN ----------
-- Donasi publik: SIAPA PUN boleh MEMBUAT (form donasi tanpa akun),
-- membaca hanya admin / pemilik baris. Status publik via RPC donation_status().
drop policy if exists ins_donations on donations;
create policy ins_donations on donations for insert with check (true);
drop policy if exists sel_donations on donations;
create policy sel_donations on donations for select
  using (has_perm('transactions.view')
    or donor_id in (select id from donors where auth_user_id = auth.uid() or email = coalesce(auth.jwt() ->> 'email','')));
-- UPDATE: hanya admin berizin (verify/correct). service_role (webhook) bypass RLS.
drop policy if exists upd_donations on donations;
create policy upd_donations on donations for update
  using (has_perm('transactions.verify') or has_perm('transactions.correct'))
  with check (has_perm('transactions.verify') or has_perm('transactions.correct'));

drop policy if exists ins_trx on payment_transactions;
create policy ins_trx on payment_transactions for insert with check (true);
drop policy if exists sel_trx on payment_transactions;
create policy sel_trx on payment_transactions for select
  using (has_perm('transactions.view')
    or donation_id in (select d.id from donations d join donors o on o.id = d.donor_id
      where o.auth_user_id = auth.uid() or o.email = coalesce(auth.jwt() ->> 'email','')));
drop policy if exists upd_trx on payment_transactions;
create policy upd_trx on payment_transactions for update
  using (has_perm('transactions.verify') or has_perm('transactions.correct'))
  with check (has_perm('transactions.verify') or has_perm('transactions.correct'));

-- Kuitansi: terbit otomatis via RPC/service; baca publik (model verifikasi
-- kuitansi dengan nomor unik — sama seperti praktik lembaga filantropi umum)
drop policy if exists ins_receipts on receipts;
create policy ins_receipts on receipts for insert with check (has_perm('transactions.verify') or has_perm('finance.manage'));
drop policy if exists sel_receipts on receipts;
create policy sel_receipts on receipts for select using (true);

drop policy if exists adm_users on profiles;
create policy adm_users on profiles for select using (id = auth.uid() or has_perm('users.view'));
drop policy if exists ins_users on profiles;
create policy ins_users on profiles for insert with check (id = auth.uid() or has_perm('users.manage'));
drop policy if exists upd_users on profiles;
create policy upd_users on profiles for update using (id = auth.uid() or has_perm('users.manage')) with check (id = auth.uid() or has_perm('users.manage'));
drop policy if exists del_users on profiles;
create policy del_users on profiles for delete using (has_perm('users.manage'));

drop policy if exists sel_roles on roles;
create policy sel_roles on roles for select using (has_perm('users.view') or has_perm('settings.view'));
drop policy if exists adm_roles on roles;
create policy adm_roles on roles for all using (has_perm('users.manage')) with check (has_perm('users.manage'));

drop policy if exists sel_perms on permissions;
create policy sel_perms on permissions for select using (has_perm('users.view'));
drop policy if exists adm_perms on permissions;
create policy adm_perms on permissions for all using (has_perm('users.manage')) with check (has_perm('users.manage'));

drop policy if exists sel_userroles on user_roles;
create policy sel_userroles on user_roles for select using (user_id = auth.uid() or has_perm('users.view'));
drop policy if exists adm_userroles on user_roles;
create policy adm_userroles on user_roles for all using (has_perm('users.manage')) with check (has_perm('users.manage'));

-- ---------- PENERIMA MANFAAT (privat) ----------
drop policy if exists sel_ben on beneficiaries;
create policy sel_ben on beneficiaries for select using (has_perm('beneficiaries.view'));
drop policy if exists adm_ben on beneficiaries;
create policy adm_ben on beneficiaries for all using (has_perm('beneficiaries.manage')) with check (has_perm('beneficiaries.manage'));

-- ---------- PENYALURAN (publik melihat yang telah disalurkan) ----------
drop policy if exists sel_dist on distributions;
create policy sel_dist on distributions for select
  using (status in ('disalurkan','selesai') or has_perm('distributions.view'));
drop policy if exists ins_dist on distributions;
create policy ins_dist on distributions for insert with check (has_perm('distributions.create'));
drop policy if exists upd_dist on distributions;
create policy upd_dist on distributions for update using (has_perm('distributions.verify') or has_perm('distributions.approve') or has_perm('distributions.disburse') or has_perm('distributions.create'))
  with check (has_perm('distributions.verify') or has_perm('distributions.approve') or has_perm('distributions.disburse') or has_perm('distributions.create'));

-- ---------- KEUANGAN (privat; publik via view ft_public) ----------
drop policy if exists sel_fin on financial_transactions;
create policy sel_fin on financial_transactions for select using (has_perm('finance.view') or has_perm('transactions.view'));
drop policy if exists ins_fin on financial_transactions;
create policy ins_fin on financial_transactions for insert with check (has_perm('finance.manage'));  -- jurnal dibuat sistem/RPC (bypass) atau admin keuangan
drop policy if exists adm_fin on financial_transactions;
create policy adm_fin on financial_transactions for update using (has_perm('finance.manage')) with check (has_perm('finance.manage'));

drop policy if exists sel_finacc on financial_accounts;
create policy sel_finacc on financial_accounts for select using (has_perm('finance.view'));
drop policy if exists adm_finacc on financial_accounts;
create policy adm_finacc on financial_accounts for all using (has_perm('finance.manage')) with check (has_perm('finance.manage'));

drop policy if exists sel_fincat on financial_categories;
create policy sel_fincat on financial_categories for select using (has_perm('finance.view') or true); -- kategori dibutuhkan FK insert donasi
drop policy if exists adm_fincat on financial_categories;
create policy adm_fincat on financial_categories for all using (has_perm('finance.manage')) with check (has_perm('finance.manage'));

-- ---------- NOTIFIKASI, NEWSLETTER, AUDIT ----------
drop policy if exists sel_notif on notifications;
create policy sel_notif on notifications for select using (auth.uid() is not null);
drop policy if exists ins_notif on notifications;
create policy ins_notif on notifications for insert with check (true);  -- sistem & outbox
drop policy if exists upd_notif on notifications;
create policy upd_notif on notifications for update using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists ins_nlsub on newsletter_subscribers;
create policy ins_nlsub on newsletter_subscribers for insert with check (true);
drop policy if exists sel_nlsub on newsletter_subscribers;
create policy sel_nlsub on newsletter_subscribers for select using (has_perm('content.view'));
drop policy if exists adm_nlsub on newsletter_subscribers;
create policy adm_nlsub on newsletter_subscribers for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists sel_newsletters on newsletters;
create policy sel_newsletters on newsletters for select using (has_perm('content.view'));
drop policy if exists adm_newsletters on newsletters;
create policy adm_newsletters on newsletters for all using (has_perm('content.manage')) with check (has_perm('content.manage'));

drop policy if exists ins_audit on audit_logs;
create policy ins_audit on audit_logs for insert with check (true);  -- jejak sistem
drop policy if exists sel_audit on audit_logs;
create policy sel_audit on audit_logs for select using (has_perm('audit.view'));

-- ============================================================
-- TRIGGER AUTH: profil otomatis saat user baru mendaftar
-- ============================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role_key, role_label)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role_key', 'pimpinan'),
    coalesce((select name from roles where key = coalesce(new.raw_user_meta_data ->> 'role_key', 'pimpinan')), 'Viewer / Pimpinan')
  ) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role_key)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'role_key', 'pimpinan'));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ============================================================
-- SEED DATA PRODUKSI
-- ============================================================
insert into roles (key, name, description, permissions) values
  ('super_admin','Super Admin','Akses penuh seluruh modul & konfigurasi sistem','["*"]'),
  ('admin_website','Admin Website','Mengelola konten publik: berita, galeri, FAQ, testimoni, halaman profil','["dashboard.view","programs.view","campaigns.view","campaigns.manage","content.view","content.manage","beneficiaries.view","outbox.view"]'),
  ('admin_program','Admin Program','Mengelola program, kampanye, dan penerima manfaat','["dashboard.view","programs.view","programs.manage","campaigns.view","campaigns.manage","distributions.view","distributions.create","beneficiaries.view","beneficiaries.manage","beneficiaries.view_full"]'),
  ('admin_donasi','Admin Donasi','Mengelola donatur, transaksi donasi, dan donasi rutin','["dashboard.view","programs.view","donors.view","donors.manage","donors.export","transactions.view","transactions.verify","transactions.export","outbox.view","outbox.manage"]'),
  ('admin_keuangan','Admin Keuangan','Rekonsiliasi pembayaran, laporan keuangan, verifikasi penyaluran','["dashboard.view","programs.view","donors.view","transactions.view","transactions.verify","transactions.correct","transactions.export","distributions.view","distributions.create","distributions.verify","beneficiaries.view","finance.view","finance.manage","finance.export","outbox.view","outbox.manage"]'),
  ('admin_penyaluran','Admin Penyaluran','Mengoordinasikan penyaluran dana ke penerima manfaat','["dashboard.view","programs.view","distributions.view","distributions.create","distributions.disburse","beneficiaries.view","beneficiaries.manage","beneficiaries.view_full","finance.view"]'),
  ('auditor','Auditor','Memeriksa seluruh transaksi, laporan, dan jejak audit (read-only)','["dashboard.view","programs.view","campaigns.view","donors.view","transactions.view","transactions.export","distributions.view","beneficiaries.view","finance.view","finance.export","finance.approve_reports","audit.view","outbox.view"]'),
  ('pimpinan','Viewer / Pimpinan','Melihat ringkasan, menyetujui penyaluran & laporan','["dashboard.view","programs.view","campaigns.view","donors.view","transactions.view","distributions.view","distributions.approve","beneficiaries.view","finance.view","finance.approve_reports","audit.view"]')
on conflict (key) do update set
  name = excluded.name, description = excluded.description, permissions = excluded.permissions;

insert into permissions (code, module, action)
select m.module || '.' || m.action, m.module, m.action
from (values
  ('dashboard','view'),
  ('programs','view'),('programs','manage'),
  ('campaigns','view'),('campaigns','manage'),
  ('donors','view'),('donors','manage'),('donors','export'),
  ('transactions','view'),('transactions','verify'),('transactions','correct'),('transactions','export'),
  ('distributions','view'),('distributions','create'),('distributions','verify'),('distributions','approve'),('distributions','disburse'),
  ('beneficiaries','view'),('beneficiaries','manage'),('beneficiaries','view_full'),
  ('finance','view'),('finance','manage'),('finance','export'),('finance','approve_reports'),
  ('content','view'),('content','manage'),
  ('users','view'),('users','manage'),
  ('settings','view'),('settings','manage'),
  ('outbox','view'),('outbox','manage'),
  ('audit','view')
) as m(module, action)
on conflict (code) do nothing;

insert into institution_settings (singleton, name, tagline, about, mission, banks, payment_gateway, whatsapp_api, smtp, receipt, seo, demo_mode)
values (true, 'Lembaga Filantropi', 'Lembaga Filantropi Terpercaya & Transparan',
  'Lembaga filantropi yang mengelola zakat, infak, sedekah, dan wakaf (ZISWAF) secara profesional, amanah, dan berbasis teknologi.',
  '[]'::jsonb,
  '[{"bank":"BCA","number":"1234567890","holder":"Lembaga Filantropi"}]'::jsonb,
  '{"provider":"midtrans","connected":false}'::jsonb,
  '{"provider":"Fonnte","connected":false}'::jsonb,
  '{"connected":false}'::jsonb,
  '{"prefix":"FLM","signer_name":"Bendahara","signer_title":"Bendahara Lembaga","footer_note":"Kuitansi ini adalah bukti sah penyaluran dana."}'::jsonb,
  '{"meta_title":"Lembaga Filantropi — Zakat, Infak, Sedekah & Wakaf"}'::jsonb,
  false)
on conflict (singleton) do nothing;

insert into zakat_settings (singleton, gold_price_gram, nisab_gold_gram, rate_pct, info)
values (true, 1350000, 85, 2.5, 'Bersandar pada standar BAZNAS: nisab penghasilan setara 85 gram emas per tahun, kadar zakat 2,5%. Perbarui harga emas secara berkala.')
on conflict (singleton) do nothing;

insert into payment_methods (code, name, type, instructions, active) values
  ('transfer_manual','Transfer Bank Manual — Konfirmasi via WhatsApp','transfer_manual','Transfer langsung ke rekening resmi lembaga di bawah, lalu kirim bukti transfer ke WhatsApp admin. Status Berhasil setelah admin memverifikasi bukti transfer Anda.',true),
  ('bca_va','BCA Virtual Account','va','Transfer ke nomor Virtual Account BCA sesuai kode yang tertera.',true),
  ('bni_va','BNI Virtual Account','va','Transfer ke nomor Virtual Account BNI sesuai kode yang tertera.',true),
  ('bri_va','BRI Virtual Account','va','Transfer ke nomor Virtual Account BRI sesuai kode yang tertera.',true),
  ('mandiri_va','Mandiri Virtual Account','va','Transfer ke nomor Virtual Account Mandiri sesuai kode yang tertera.',true),
  ('qris','QRIS (Semua E-Wallet & M-Banking)','qris','Pindai kode QRIS menggunakan aplikasi e-wallet atau mobile banking apa pun.',true),
  ('gopay','GoPay','ewallet','Bayar melalui aplikasi Gojek (GoPay).',true),
  ('ovo','OVO','ewallet','Bayar melalui aplikasi OVO.',true),
  ('dana','DANA','ewallet','Bayar melalui aplikasi DANA.',true),
  ('gateway','Payment Gateway (Kartu Kredit & Retail)','gateway','Pembayaran kartu kredit/debit & gerai retail via payment gateway. Aktif setelah API key terkonfigurasi di server.',false)
on conflict (code) do nothing;

insert into financial_categories (code, name, fund_type, direction) values
  ('IN-ZAKAT','Pemasukan Zakat','zakat','masuk'), ('OUT-ZAKAT','Penyaluran Zakat','zakat','keluar'),
  ('IN-INFAK','Pemasukan Infak','infak','masuk'), ('OUT-INFAK','Penyaluran Infak','infak','keluar'),
  ('IN-SEDEKAH','Pemasukan Sedekah','sedekah','masuk'), ('OUT-SEDEKAH','Penyaluran Sedekah','sedekah','keluar'),
  ('IN-WAKAF','Pemasukan Wakaf','wakaf','masuk'), ('OUT-WAKAF','Penyaluran Wakaf','wakaf','keluar'),
  ('IN-SOSIAL','Pemasukan Dana Sosial','sosial','masuk'), ('OUT-SOSIAL','Penyaluran Dana Sosial','sosial','keluar')
on conflict (code) do nothing;

insert into financial_accounts (acc_code, name, type, bank_name, number) values
  ('BANK-UTAMA','Rekening Operasional Utama','bank','BCA','1234567890'),
  ('BANK-ZISWAF','Rekening ZISWAF','bank','BNI Syariah','9876543210'),
  ('KAS-01','Kas Kecil','cash','','-')
on conflict (acc_code) do nothing;

-- Deduplikasi FAQ dari eksekusi lama, lalu kunci unik agar seed idempoten:
delete from faqs f where exists (select 1 from faqs g where g.question = f.question and g.id < f.id);
create unique index if not exists ux_faqs_question on faqs (question);

insert into faqs (question, answer, order_no) values
  ('Bagaimana cara berdonasi melalui website ini?','Pilih program atau buka halaman Donasi, tentukan jumlah dan jenis dana (zakat/infak/sedekah/wakaf), isi data diri (atau pilih donasi anonim), lalu selesaikan pembayaran melalui Virtual Account, QRIS, atau e-wallet. Kuitansi otomatis terbit setelah pembayaran terverifikasi.',1),
  ('Apakah pembayaran saya aman?','Ya. Seluruh transaksi diproses melalui payment gateway resmi dan status pembayaran hanya diperbarui setelah konfirmasi webhook terverifikasi dari penyedia pembayaran — bukan sekadar halaman konfirmasi.',2),
  ('Kapan kuitansi donasi terbit?','Kuitansi terbit otomatis seketika setelah pembayaran terverifikasi (status Berhasil). Anda dapat mengunduhnya dari halaman status donasi, notifikasi WhatsApp/email, atau Area Donatur.',3),
  ('Apakah donasi saya bisa dibatalkan?','Donasi yang masih menunggu pembayaran dapat dibatalkan sendiri melalui halaman instruksi pembayaran. Dana yang telah berhasil dikumpulkan dan disalurkan tidak dapat dikembalikan.',4),
  ('Bagaimana saya bisa memantau penggunaan dana?','Halaman Transparansi memuat saldo per jenis dana, seluruh penyaluran, dan laporan keuangan berkala yang telah disahkan — dihitung langsung dari transaksi terverifikasi.',5),
  ('Bagaimana cara menghubungi pengelola?','Gunakan tombol WhatsApp mengapung di seluruh halaman, atau kirim pesan melalui nomor resmi lembaga pada halaman Profil.',6)
on conflict (question) do nothing;

-- ============================================================
-- STORAGE: bucket "uploads" (gambar program/berita/galeri/bukti)
-- ============================================================
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists "publik baca uploads" on storage.objects;
create policy "publik baca uploads" on storage.objects for select
  using (bucket_id = 'uploads');
drop policy if exists "admin unggah uploads" on storage.objects;
create policy "admin unggah uploads" on storage.objects for insert
  with check (bucket_id = 'uploads' and (has_perm('content.manage') or has_perm('programs.manage') or has_perm('distributions.disburse')));
drop policy if exists "admin ubah uploads" on storage.objects;
create policy "admin ubah uploads" on storage.objects for update
  using (bucket_id = 'uploads' and (has_perm('content.manage') or has_perm('programs.manage')));
drop policy if exists "admin hapus uploads" on storage.objects;
create policy "admin hapus uploads" on storage.objects for delete
  using (bucket_id = 'uploads' and (has_perm('content.manage') or has_perm('programs.manage')));

-- ============================================================
-- SELESAI. Langkah berikutnya lihat MIGRASI-SUPABASE.md:
--   1. Buat pengguna admin di Authentication (email+password)
--   2. Set role_key di tabel profiles (default: pimpinan)
--   3. Deploy Edge Functions payment-webhook / whatsapp-send / email-send
--   4. Isi URL + anon key di Admin → Pengaturan → Supabase (Produksi)
--   5. Jalankan SQL Migrasi data (Admin → Pengaturan → Supabase)
-- ============================================================
