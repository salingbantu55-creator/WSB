# PANDUAN MIGRASI KE SUPABASE ASLI — Filantropi Management System v2

Panduan lengkap memindahkan aplikasi dari **MODE DEMO (localStorage)** ke **Supabase asli (PostgreSQL + Auth + Edge Functions + Storage)**. Ikuti langkah berurutan; seluruh langkah dapat diselesaikan ±30 menit.

---

## Ringkasan Arsitektur

```
┌─────────────────────── Browser (static hosting: Vercel/Netlify) ───────────────────────┐
│  index.html (Public Website)      admin.html (Panel Admin)                             │
│  assets/js/supabase.js  → adapter DB API identik (cache mirror + write-behind)         │
│  assets/js/auth.js      → Supabase Auth (email + password)                             │
└──────────────┬─────────────────────────────────────────────────────────────────────────┘
               │ anon key (dilindungi RLS)          service_role (HANYA di server)
┌──────────────▼──────────────────────── Supabase ───────────────────────────────────────┐
│  PostgreSQL (29 tabel + RLS penuh + view publik + RPC)                                 │
│  Auth (admin & donatur)      Storage (bucket "uploads")                                │
│  Edge Functions:                                                                      │
│    • payment-webhook  → verifikasi signature Midtrans/Xendit → RPC webhook_finalize    │
│    • whatsapp-send    → Fonnte/Wablas/Twilio/Meta Cloud + Email (Resend)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Aturan yang tetap ditegakkan saat produksi:**
1. Status pembayaran → `berhasil` **hanya** melalui: (a) Edge Function `payment-webhook` setelah verifikasi signature, (b) konfirmasi manual admin berizin `transactions.verify` (tercatat audit), (c) simulasi DEMO yang **ditolak server** bila `demo_mode=false`.
2. API key payment gateway / WhatsApp / email = **Edge Function secrets**, tidak pernah di frontend.
3. Dana zakat/infak/sedekah/wakaf/sosial terpisah per `fund_type`.
4. Data penerima manfaat & jurnal keuangan privat (RLS); publik hanya melihat `ft_public` (tanpa PII) dan penyaluran berstatus `disalurkan`/`selesai`.

---

## LANGKAH 1 — Buat Proyek Supabase

1. Buka <https://supabase.com> → **New project**.
2. Simpan **Database password** (jangan hilangkan).
3. Setelah siap, catat:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon/public key**: (Project Settings → API) — aman untuk frontend.
   - **Service role key**: JANGAN pernah ditempatkan di frontend / repo publik.

## LANGKAH 2 — Jalankan Skema Database

1. Buka **SQL Editor** di dashboard Supabase.
2. Salin seluruh isi `supabase/schema.sql` → **Run**.
3. Verifikasi: Table Editor menampilkan 29 tabel; `roles` berisi 8 peran; `institution_settings` & `zakat_settings` berisi 1 baris; `payment_methods` berisi 9 metode.

Skema ini membuat:
- 29 tabel + trigger `updated_at` otomatis
- **RLS aktif di semua tabel** dengan matriks izin dari `roles.permissions`
- View publik `ft_public` (jurnal tanpa PII) & `public_stats` (statistik agregat)
- RPC: `donation_status`, `demo_finalize_payment` (guard demo), `cancel_donation_public`, `expire_stale_payments`, `increment_news_views`, `webhook_finalize_payment` (produksi)
- Trigger `programs.collected` (saldo terkumpul program dijaga database)
- Trigger `handle_new_user` (profil + peran otomatis saat user Auth dibuat)
- Bucket Storage `uploads` + kebijakan

## LANGKAH 3 — Buat Pengguna Admin & Donatur

1. **Authentication → Users → Add user** → email + password, centang **Auto Confirm**.
   - Contoh admin: `superadmin@lembagaanda.id`
2. SQL Editor — set peran & nama (ulangi per pengguna):

```sql
update profiles set name = 'Nama Anda', role_key = 'super_admin', role_label = 'Super Admin'
where email = 'superadmin@lembagaanda.id';
```

> Pendaftar baru otomatis mendapat peran `pimpinan` (dari trigger). Super Admin dapat mengubah peran siapa pun dari **Admin → Pengguna & Peran**.

3. Donatur **tidak perlu** dibuat manual — mereka mendaftar sendiri dari **Area Donatur**.
   - Disarankan: **Authentication → Providers → Email → matikan "Confirm email"** agar donatur langsung memiliki sesi setelah mendaftar.

## LANGKAH 4 — Deploy Edge Functions

Butuh Supabase CLI (`npm i -g supabase` atau `npx supabase`). Login: `supabase login`, lalu link: `supabase link --project-ref xxxxx`.

```bash
# 1) Webhook pembayaran (tidak butuh JWT karena dipanggil provider)
supabase functions deploy payment-webhook --no-verify-jwt
supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
# gunakan Xendit? selain token di bawah, panggil URL dengan ?provider=xendit
supabase secrets set XENDIT_CALLBACK_TOKEN=xxxxxxxx

# 2) WhatsApp + Email (kuitansi otomatis)
supabase functions deploy whatsapp-send
supabase secrets set WA_PROVIDER=fonnte WA_TOKEN=token-fonnte-anda
# alternatif provider: WA_PROVIDER=wablas|twilio|meta (+ secret terkait)
# email kuitansi (opsional): RESEND_API_KEY=re_xxx EMAIL_FROM="Lembaga <no-reply@domain.id>"
```

- **URL webhook Midtrans** (dashboard Midtrans → Settings → Payment Notification URL):
  `https://xxxxx.supabase.co/functions/v1/payment-webhook`
  Pada pembuatan transaksi di gateway, gunakan `order_id = donation_code`.
- **URL webhook Xendit**:
  `https://xxxxx.supabase.co/functions/v1/payment-webhook?provider=xendit`
  gunakan `external_id = donation_code`.

> Tanpa langkah ini, donasi tetap dapat dibuat; statusnya berubah via **konfirmasi manual rekonsiliasi** oleh Admin Keuangan/Donasi (tetap sesuai aturan). Integrasi WhatsApp berjalan **manual (tautan wa.me)** sampai `WA_TOKEN` diisi.

## LANGKAH 5 — Hubungkan Aplikasi

1. Jalankan aplikasi (`python3 -m http.server 8080`), buka `admin.html` → login **mode demo** (`superadmin@filantropi.id` / `Admin@123`).
2. **Pengaturan Sistem → Supabase (Produksi)**:
   - Isi **Supabase URL** + **Anon key** → **Uji Koneksi** → bila "Koneksi BERHASIL" → **Simpan & Muat Ulang**.
3. Aplikasi memuat ulang dan kini membaca/menulis langsung ke Supabase. Login dengan akun admin yang dibuat di Langkah 3.

## LANGKAH 6 — Migrasi Data (opsional, dari demo lokal)

Sebelum mengisi kredensial (masih mode demo):

1. **Pengaturan Sistem → Supabase (Produksi)** →
   - **SQL Migrasi — Konten & Keuangan**: program, kampanye, berita, galeri, testimoni, FAQ, struktur organisasi, jurnal keuangan, laporan.
   - **SQL Migrasi — Lengkap + Donasi**: di atas **plus** donatur, donasi, transaksi, kuitansi, penyaluran, penerima manfaat, donasi rutin (mengandung data pribadi — hanya untuk proyek Anda).
2. Jalankan file `.sql` yang terunduh di **SQL Editor** (setelah Langkah 2). UUID diregenerasi otomatis dan relasi dipetakan ulang.
3. **Pengaturan Sistem → Identitas**: perbarui nama lembaga, kontak, rekening — lalu **matikan MODE DEMO** (checkbox).

## LANGKAH 7 — Nonaktifkan Mode Demo

**Pengaturan Sistem → Identitas** → hilangkan centang **MODE DEMO**. Efeknya:
- Banner demo & tombol "Simulasikan Webhook (DEMO)" hilang dari halaman publik.
- RPC `demo_finalize_payment` **menolak** dipanggil (ditegakkan server, bukan hanya UI).

## LANGKAH 8 — Deploy Frontend

1. Push folder ini ke GitHub.
2. Import ke **Vercel/Netlify** sebagai *static site* (tanpa build step, output = root).
3. Opsional: tempatkan `supabase/` di luar folder publik agar tidak ikut ter-publish.
4. HTTPS otomatis; aktifkan juga **backups** harian di Supabase (Database → Backups).

---

## Checklist Verifikasi Akhir

| # | Uji | Hasil diharapkan |
|---|-----|------------------|
| 1 | Buka website publik tanpa login | Beranda tampil; statistik dari `public_stats`; transparansi dari `ft_public` |
| 2 | Buat donasi (tanpa akun) | Baris baru di tabel `donations` & `payment_transactions`; instruksi VA tampil |
| 3 | Mode demo aktif → klik Simulasikan Webhook | Status **Berhasil**, kuitansi terbit, jurnal masuk — semua via RPC server |
| 4 | Matikan demo → tombol simulasi hilang; panggil RPC manual | Server **menolak** |
| 5 | Admin Donasi/Keuangan → Transaksi → Konfirmasi manual | Berhasil + catatan wajib + tercatat Audit Trail |
| 6 | Kuitansi → Unduh PDF / Kirim via WhatsApp | File PDF terunduh; wa.me terbuka dengan pesan terisi |
| 7 | Outbox WhatsApp (admin) | Pesan kuitansi masuk antrean; kirim manual/API sesuai konfigurasi |
| 8 | Ekspor Excel/PDF (Transaksi, Donatur, Keuangan, Penyaluran, Audit, Transparansi) | File `.xlsx`/`.pdf` asli terunduh |
| 9 | Penyaluran melebihi saldo kategori | Ditolak sistem |
| 10 | Pimpinan login | Sidebar hanya modul berizin (RBAC aktif dari `roles.permissions`) |

## Pemecahan Masalah

| Gejala | Penyebab & solusi |
|--------|-------------------|
| "Supabase gagal terhubung" saat load | URL/anon key salah, atau jaringan memblokir CDN jsdelivr. Periksa `FLMS_SUPABASE_CFG` di localStorage |
| Uji koneksi gagal: *relation "roles" does not exist* | `schema.sql` belum dijalankan / proyek berbeda |
| Login admin gagal "Profil admin tidak ditemukan" | User Auth dibuat tanpa profil — jalankan `update profiles … where email=…` (Langkah 3) |
| Donasi baru muncul tapi admin tidak melihatnya | Klik **Muat Ulang Data** (Pengaturan → Supabase) atau refresh; cache admin diperbarui saat login |
| "Gagal sinkron ke Supabase" toast | Kebijakan RLS menolak aksi — peran Anda kurang izin; periksa matriks di Pengguna & Peran |
| Kuitansi WA tidak otomatis | `WA_TOKEN`/`WA_PROVIDER` belum diset → mode manual (wa.me) dipakai; ikuti Langkah 4 |
| View transparansi kosong | Tidak ada jurnal berstatus `berhasil` — pastikan migrasi SQL dijalankan / ada donasi terverifikasi |

---

*Filantropi Management System v2.0 — Tahap 2: WhatsApp integration, PDF/Excel lanjutan, migrasi Supabase asli.*
