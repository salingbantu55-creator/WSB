'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — JEMBATAN SUPABASE ASLI (TAHAP 2)
   SUPA = adapter database Supabase (PostgreSQL) dengan API yang
   IDENTIK dengan DB demo (localStorage), sehingga seluruh modul
   Public Website & Admin Dashboard berjalan TANPA diubah.

   Arsitektur:
   - READ : seluruh tabel ditarik ke cache memori saat init
            (sesuai aturan RLS dari sesi yang aktif), lalu dibaca
            secara sinkron oleh UI — pola offline-first mirror.
   - WRITE: optimistic update di cache + push (upsert/delete)
            ke Supabase secara serial (write-behind).
   - AUTH : Supabase Auth (email+password) untuk admin & donatur;
            profil diambil dari tabel profiles / donors.
   - KEAMANAN:
     * Status "berhasil" HANYA melalui:
       (1) Edge Function payment-webhook → RPC finalize (service role)
       (2) RPC demo_finalize_payment — ditolak server bila demo_mode=false
       (3) manualConfirm oleh admin berizin (transactions.verify)
     * API key gateway/WA/SMTP disimpan sebagai Edge Function secret.
   - Konfigurasi URL + anon key disimpan di localStorage browser.
     Tanpa konfigurasi → aplikasi tetap berjalan MODE DEMO lokal.
   ============================================================ */
const SUPA = (() => {
  const CKEY = 'FLMS_SUPABASE_CFG';
  let cfg = { url: '', anon: '' };
  try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(CKEY) || '{}') }; } catch (e) {}
  let client = null, active = false, loadError = '';

  const configured = () => !!(cfg.url && cfg.anon);

  function saveCfg(url, anon) {
    cfg = { url: (url || '').trim().replace(/\/$/, ''), anon: (anon || '').trim() };
    localStorage.setItem(CKEY, JSON.stringify(cfg));
  }
  function clearCfg() { cfg = { url: '', anon: '' }; localStorage.removeItem(CKEY); }

  function loadScript() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Gagal memuat pustaka Supabase (butuh koneksi internet)'));
      document.head.appendChild(s);
      setTimeout(() => rej(new Error('Timeout memuat pustaka Supabase')), 15000);
    });
  }

  /* Uji koneksi dari tab Pengaturan → Supabase (tanpa menyimpan konfigurasi) */
  async function testConnection(url, anon) {
    try {
      await loadScript();
      const c = window.supabase.createClient((url || '').trim().replace(/\/$/, ''), (anon || '').trim());
      const { error } = await c.from('roles').select('id').limit(1);
      if (error) return { ok: false, message: 'Gagal: ' + error.message + ' — pastikan supabase/schema.sql sudah dijalankan & anon key benar.' };
      return { ok: true, message: 'Koneksi BERHASIL — skema ditemukan & dapat diakses. Tekan "Simpan & Muat Ulang" untuk mengaktifkan Supabase.' };
    } catch (e) { return { ok: false, message: 'Koneksi gagal: ' + (e.message || e) }; }
  }

  /* ---------- CACHE (bentuk identik dengan DB lokal) ---------- */
  const TABLES = ['roles', 'permissions', 'user_roles', 'profiles', 'organization_structures',
    'programs', 'campaigns', 'donors', 'donations', 'payment_transactions', 'payment_methods',
    'recurring_donations', 'receipts', 'beneficiaries', 'distributions', 'financial_accounts',
    'financial_categories', 'financial_transactions', 'financial_reports', 'news', 'galleries',
    'testimonials', 'faqs', 'newsletters', 'notifications', 'audit_logs', 'newsletter_subscribers'];
  const cache = {};
  TABLES.forEach(t => cache[t] = []);
  cache.institution_settings = {};
  cache.zakat_settings = {};
  cache.__stats = null;
  cache.__public = true;   // true = sesi publik (tanpa admin/donatur)

  /* ---------- WRITE-BEHIND (serial) ---------- */
  let chain = Promise.resolve();
  let syncFailShown = false;
  function enqueue(fn) {
    chain = chain.then(fn).catch(e => {
      console.error('[SUPA] write gagal:', e);
      if (!syncFailShown) { syncFailShown = true; U.toast('Perubahan belum tersinkron ke Supabase: ' + (e.message || e), 'error'); }
    });
    return chain;
  }
  const push = (t, row) => enqueue(async () => {
    const clean = { ...row };
    delete clean.__local;
    const { error } = await client.from(t).upsert(clean, { onConflict: 'id' });
    if (error) throw error;
  });
  const pushDelete = (t, id) => enqueue(async () => {
    const { error } = await client.from(t).delete().eq('id', id);
    if (error) throw error;
  });

  /* ---------- PULL (sesuai RLS sesi aktif) ---------- */
  async function pullOne(t, useView) {
    const { data, error } = await client.from(useView || t).select('*');
    if (error) { console.warn('[SUPA] pull', t, error.message); cache[t] = cache[t] || []; return; }
    cache[t] = data || [];
  }
  async function pullSingleton(t, key) {
    const { data, error } = await client.from(t).select('*').limit(1);
    if (error) { console.warn('[SUPA] pull', t, error.message); return; }
    cache[key] = (data && data[0]) || cache[key] || {};
  }
  async function whoAmI() {
    const { data: sData } = await client.auth.getSession();
    const session = sData && sData.session;
    if (!session) return { session: null, profile: null, donor: null };
    let profile = null;
    try {
      const { data } = await client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      profile = data;
    } catch (e) {}
    if (!profile) {
      try {
        const { data } = await client.from('donors').select('*').eq('auth_user_id', session.user.id).maybeSingle();
        if (data) return { session, profile: null, donor: data };
      } catch (e) {}
    }
    return { session, profile, donor: null };
  }

  async function pull() {
    const { session, profile, donor } = await whoAmI();
    const isAdmin = !!(profile && profile.status === 'aktif');
    const isDonor = !!donor || (!profile && !!session);
    cache.__public = !isAdmin && !isDonor;
    cache.__session = session ? { user_id: session.user.id, email: session.user.email } : null;

    /* tabel publik (RLS menyaring baris) */
    await Promise.all([
      pullSingleton('institution_settings', 'institution_settings'),
      pullSingleton('zakat_settings', 'zakat_settings'),
      pullOne('payment_methods'), pullOne('programs'), pullOne('campaigns'),
      pullOne('news'), pullOne('galleries'), pullOne('testimonials'), pullOne('faqs'),
      pullOne('financial_reports'), pullOne('distributions'), pullOne('organization_structures'),
      pullOne('newsletters')
    ]);
    if (isAdmin) {
      await Promise.all([
        pullOne('roles'), pullOne('permissions'), pullOne('user_roles'), pullOne('profiles'),
        pullOne('donors'), pullOne('donations'), pullOne('payment_transactions'), pullOne('receipts'),
        pullOne('recurring_donations'), pullOne('beneficiaries'), pullOne('notifications'),
        pullOne('audit_logs'), pullOne('financial_transactions'), pullOne('financial_categories'),
        pullOne('financial_accounts'), pullOne('newsletter_subscribers')
      ]);
      cache.__stats = null;
    } else if (isDonor) {
      /* RLS: donatur hanya melihat baris miliknya */
      await Promise.all([
        pullOne('donors'), pullOne('donations'), pullOne('payment_transactions'),
        pullOne('receipts'), pullOne('recurring_donations')
      ]);
      cache.profiles = []; cache.roles = []; cache.user_roles = []; cache.audit_logs = [];
      cache.notifications = []; cache.beneficiaries = []; cache.newsletter_subscribers = [];
      await pullPublicFinance();
    } else {
      /* sesi publik anonim */
      cache.donations = []; cache.payment_transactions = []; cache.receipts = [];
      cache.donors = []; cache.recurring_donations = []; cache.beneficiaries = [];
      cache.profiles = []; cache.roles = []; cache.user_roles = []; cache.permissions = [];
      cache.audit_logs = []; cache.notifications = []; cache.newsletter_subscribers = [];
      await pullPublicFinance();
    }
  }
  async function pullPublicFinance() {
    /* ft_public = view aman tanpa PII donatur; public_stats = statistik agregat */
    await pullOne('financial_transactions', 'ft_public');
    try {
      const { data, error } = await client.from('public_stats').select('*').limit(1);
      if (!error && data && data[0]) cache.__stats = data[0];
    } catch (e) {}
  }

  async function refreshAdminTables() {
    await Promise.all([
      pullOne('roles'), pullOne('permissions'), pullOne('user_roles'), pullOne('profiles'),
      pullOne('donors'), pullOne('donations'), pullOne('payment_transactions'), pullOne('receipts'),
      pullOne('recurring_donations'), pullOne('beneficiaries'), pullOne('notifications'),
      pullOne('audit_logs'), pullOne('financial_transactions'), pullOne('financial_categories'),
      pullOne('financial_accounts'), pullOne('newsletter_subscribers')
    ]);
    cache.__public = false; cache.__stats = null;
  }
  async function refreshDonorTables() {
    await Promise.all([
      pullOne('donors'), pullOne('donations'), pullOne('payment_transactions'),
      pullOne('receipts'), pullOne('recurring_donations')
    ]);
    cache.__public = false;
  }

  /* Hidrasi satu donasi (halaman status/kuitansi publik) via RPC code-gated */
  async function hydrateDonation(code) {
    if (!active) return false;
    try {
      const { data, error } = await client.rpc('donation_status', { p_code: code });
      if (error || !data || !data.ok) return false;
      const put = (t, row) => { if (row && !cache[t].some(x => x.id === row.id)) cache[t].push(row); };
      put('donations', data.donation); put('payment_transactions', data.transaction); put('receipts', data.receipt);
      return true;
    } catch (e) { console.warn('[SUPA] hydrateDonation', e); return false; }
  }

  /* ============================================================
     ADAPTER — API identik dengan DB lokal
     ============================================================ */
  const NOW = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : U.uid());
  const all = t => cache[t] || [];
  const get = (t, id) => (cache[t] || []).find(x => x.id === id);
  const find = (t, fn) => (cache[t] || []).filter(fn);
  const one = (t, fn) => (cache[t] || []).find(fn);
  function insert(t, data) {
    const row = { id: uuid(), created_at: NOW(), updated_at: NOW(), ...data };
    cache[t].push(row);
    push(t, row);
    return row;
  }
  function update(t, id, patch) {
    const row = get(t, id); if (!row) return null;
    Object.assign(row, patch, { updated_at: NOW() });
    if (t === 'institution_settings' || t === 'zakat_settings') push(t, row);
    else push(t, row);
    return row;
  }
  function remove(t, id) {
    cache[t] = (cache[t] || []).filter(x => x.id !== id);
    pushDelete(t, id);
  }

  const settings = () => cache.institution_settings;
  const zakat = () => cache.zakat_settings;
  const setSettings = p => { Object.assign(cache.institution_settings, p, { updated_at: NOW() }); push('institution_settings', cache.institution_settings); };
  const setZakat = p => { Object.assign(cache.zakat_settings, p, { updated_at: NOW() }); push('zakat_settings', cache.zakat_settings); };

  function code(prefix, table, field, pad = 4) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const n = (cache[table] || []).filter(x => (x[field] || '').startsWith(`${prefix}${ymd}`)).length + 1;
    return `${prefix}${ymd}-${String(n).padStart(pad, '0')}`;
  }
  function codeMonth(prefix, table, field, pad = 4) {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const n = (cache[table] || []).filter(x => (x[field] || '').startsWith(`${prefix}${ym}`)).length + 1;
    return `${prefix}${ym}-${String(n).padStart(pad, '0')}`;
  }

  /* ---------- AGREGAT KEUANGAN ---------- */
  const fundIncome = fund => (cache.financial_transactions || []).filter(t => t.fund_type === fund && t.direction === 'masuk' && t.status === 'berhasil').reduce((s, t) => s + Number(t.amount), 0);
  const fundSpent = fund => (cache.financial_transactions || []).filter(t => t.fund_type === fund && t.direction === 'keluar' && t.status === 'berhasil').reduce((s, t) => s + Number(t.amount), 0);
  const fundBalance = fund => fundIncome(fund) - fundSpent(fund);
  const fundBalances = () => { const o = {}; Object.keys(U.FUNDS).forEach(f => o[f] = fundBalance(f)); return o; };
  const programRaised = pid => {
    const dons = cache.donations || [];
    if (dons.length) return dons.filter(d => d.program_id === pid && d.status === 'berhasil').reduce((s, d) => s + Number(d.amount), 0);
    /* sesi publik: gunakan kolom collected yang dirawat trigger database */
    const p = get('programs', pid);
    return p ? Number(p.collected || 0) : 0;
  };

  function stats() {
    const now = new Date();
    const dons = cache.donations || [];
    let sumDon;
    if (dons.length) {
      sumDon = from => dons.filter(d => d.status === 'berhasil' && (!from || new Date(d.paid_at) >= from)).reduce((s, d) => s + Number(d.amount), 0);
    } else {
      const ft = cache.financial_transactions || [];
      sumDon = from => ft.filter(t => t.trx_type === 'donasi' && t.direction === 'masuk' && t.status === 'berhasil' && (!from || new Date(t.trx_date) >= from)).reduce((s, t) => s + Number(t.amount), 0);
    }
    const st = cache.__stats || {};
    const distributed = (cache.distributions || []).filter(x => ['disalurkan', 'selesai'].includes(x.status)).reduce((s, x) => s + Number(x.amount), 0);
    return {
      today: sumDon(new Date(now.getFullYear(), now.getMonth(), now.getDate())),
      month: sumDon(new Date(now.getFullYear(), now.getMonth(), 1)),
      year: sumDon(new Date(now.getFullYear(), 0, 1)),
      total: sumDon(null) || Number(st.total_donation || 0),
      donors: cache.donors.length || Number(st.donors || 0),
      programs: cache.programs.filter(p => p.status === 'aktif').length,
      distributed, balances: fundBalances(),
      pending: cache.donations.filter(d => d.status === 'menunggu').length,
      beneficiaries: cache.beneficiaries.length || Number(st.beneficiaries || 0)
    };
  }
  function monthlySeries(n = 12) {
    const src = cache.donations.length ? { rows: cache.donations, dateKey: 'paid_at', type: null } : { rows: (cache.financial_transactions || []).filter(t => t.trx_type === 'donasi' && t.direction === 'masuk'), dateKey: 'trx_date', type: 'ft' };
    const arr = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const from = new Date(d.getFullYear(), d.getMonth(), 1), to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const v = src.rows.filter(x => x.status === 'berhasil' && new Date(x[src.dateKey]) >= from && new Date(x[src.dateKey]) < to).reduce((s, x) => s + Number(x.amount), 0);
      arr.push({ label: d.toLocaleDateString('id-ID', { month: 'short' }), value: v });
    }
    return arr;
  }
  function fundSeries() {
    return Object.keys(U.FUNDS).map(f => ({ label: U.fundLabel(f), value: fundIncome(f), color: U.FUNDS[f].color }));
  }

  /* ---------- STATUS PEMBAYARAN (red line ditegakkan) ---------- */
  function expireStale() {
    let n = 0;
    (cache.payment_transactions || []).filter(t => t.status === 'menunggu' && t.expires_at && new Date(t.expires_at) < new Date()).forEach(t => {
      update('payment_transactions', t.id, { status: 'kedaluwarsa' });
      const don = get('donations', t.donation_id);
      if (don && don.status === 'menunggu') update('donations', don.id, { status: 'kedaluwarsa' });
      n++;
    });
    /* server menegakkan hal yang sama (security definer) */
    enqueue(async () => { try { await client.rpc('expire_stale_payments'); } catch (e) {} });
    return n;
  }

  function finalizeSuccessLocal(trx, providerRef, auditAction, note) {
    const now = NOW();
    const don = get('donations', trx.donation_id);
    update('payment_transactions', trx.id, { status: 'berhasil', paid_at: now, provider_reference: providerRef });
    if (don) update('donations', don.id, { status: 'berhasil', paid_at: now });
    let rcpt = one('receipts', r => r.donation_id === trx.donation_id);
    if (!rcpt && don) {
      const dd = new Date();
      const ym = `${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}`;
      const nn = cache.receipts.filter(r => (r.receipt_no || '').startsWith('RCPT-' + ym)).length + 1;
      rcpt = insert('receipts', {
        receipt_no: `RCPT-${ym}-${String(nn).padStart(4, '0')}`, donation_id: don.id, trx_code: trx.trx_code,
        amount: don.amount, fund_type: don.fund_type,
        program_name: don.program_id ? (get('programs', don.program_id) || {}).name : 'Dana Umum',
        donor_name: don.donor_name, method: don.payment_method_code, issued_at: now
      });
    }
    if (don) insert('financial_transactions', {
      trx_type: 'donasi', direction: 'masuk', fund_type: don.fund_type,
      category_code: 'IN-' + don.fund_type.toUpperCase(), amount: don.amount, ref_code: don.donation_code,
      description: `Donasi ${U.fundLabel(don.fund_type)} — ${don.donor_name} (${don.donation_code})`,
      trx_date: now, status: 'berhasil'
    });
    if (don && don.recurring_id) {
      const rec = get('recurring_donations', don.recurring_id);
      if (rec) update('recurring_donations', rec.id, { next_charge: new Date(Date.now() + 30 * 86400000).toISOString(), last_charge: now });
    }
    notify('Pembayaran donasi berhasil', `Donasi ${don ? don.donation_code : ''} sebesar ${U.fmtRp(don ? don.total_amount : 0)} telah terverifikasi.`, 'donasi', null);
    audit(auditAction, 'payment_transactions', trx.id, { status: 'menunggu' }, { status: 'berhasil' }, note || '');
    if (don && rcpt && window.WA) WA.queueDonationSuccess(don, rcpt);
    return { ok: true, trx: get('payment_transactions', trx.id), donation: don, receipt: rcpt };
  }

  async function webhookSuccessSupa(ref) {
    const s = settings();
    if (!s.demo_mode) return { ok: false, message: 'Di mode produksi, status HANYA diubah oleh webhook payment gateway terverifikasi (Edge Function payment-webhook). Simulasi dinonaktifkan.' };
    try {
      const { data, error } = await client.rpc('demo_finalize_payment', { p_code: ref });
      if (error) return { ok: false, message: error.message };
      if (!data || data.ok === false) return { ok: false, message: data && data.message ? data.message : 'Transaksi tidak dapat diproses.' };
      /* muat ulang baris terdampak dari server */
      await Promise.all([
        pullOne('donations'), pullOne('payment_transactions'), pullOne('receipts'),
        pullOne('financial_transactions'), pullOne('notifications'), pullOne('audit_logs'),
        pullOne('programs')
      ]);
      const trx = one('payment_transactions', t => t.trx_code === ref || t.donation_code === ref);
      const don = trx ? get('donations', trx.donation_id) : null;
      const rcpt = don ? one('receipts', r => r.donation_id === don.id) : null;
      return { ok: true, trx, donation: don, receipt: rcpt };
    } catch (e) { return { ok: false, message: String(e.message || e) }; }
  }

  function webhookSuccess(ref, meta = {}) {
    if (!active) return null; /* tidak terpakai di mode lokal — DB lokal menangani */
    const trx = one('payment_transactions', t => t.trx_code === ref);
    if (!trx) {
      const donByCode = one('donations', d => d.donation_code === ref);
      if (donByCode) {
        /* publik: hidrasi dulu bila cache kosong */
        return { ok: false, pending: donByCode.donation_code };
      }
      return { ok: false, message: 'Kode transaksi tidak ditemukan.' };
    }
    if (trx.status === 'berhasil') return { ok: false, message: 'Transaksi ini sudah berstatus Berhasil.' };
    if (trx.status !== 'menunggu') return { ok: false, message: 'Transaksi sudah berstatus ' + ((U.STATUSES[trx.status] || {}).label || trx.status) + ' dan tidak dapat diproses.' };
    return finalizeSuccessLocal(trx, 'WEBHOOK-DEMO-' + U.uid().slice(0, 8).toUpperCase(), 'webhook.payment_success',
      meta.note || 'Simulasi webhook (MODE DEMO). Produksi: hanya webhook terverifikasi via Edge Function.');
  }

  /* TAHAP 3: verifikasi manual admin → RPC server-side (atomik):
     status + kuitansi + jurnal keuangan + audit dibuat di SATU transaksi
     oleh admin_verify_payment (guard has_perm('transactions.verify') di server). */
  async function manualConfirm(trxId, note) {
    const trx = get('payment_transactions', trxId);
    if (!trx) return { ok: false, message: 'Transaksi tidak ditemukan.' };
    if (trx.status !== 'menunggu') return { ok: false, message: 'Hanya transaksi Menunggu Pembayaran yang dapat dikonfirmasi manual.' };
    if (active && client) {
      try {
        const { data, error } = await client.rpc('admin_verify_payment', { p_code: trx.trx_code, p_note: note || '' });
        if (error) {
          /* skema lama (RPC belum ada) → jatuh ke jalur tulis-lokal lama */
          if (!/PGRST|could not find|function .* does not exist|schema/i.test(error.message || '')) {
            return { ok: false, message: error.message };
          }
        } else if (data) {
          if (data.ok === false) return { ok: false, message: data.message || 'Verifikasi ditolak server.' };
          /* muat ulang baris terdampak dari server (satu sumber kebenaran) */
          await Promise.all([
            pullOne('donations'), pullOne('payment_transactions'), pullOne('receipts'),
            pullOne('financial_transactions'), pullOne('notifications'), pullOne('audit_logs'),
            pullOne('programs')
          ]);
          const trx2 = get('payment_transactions', trxId);
          const don = trx2 ? get('donations', trx2.donation_id) : null;
          const rcpt = don ? one('receipts', r => r.donation_id === don.id) : null;
          if (don && rcpt && window.WA) WA.queueDonationSuccess(don, rcpt);
          return { ok: true, receipt_no: data.receipt_no, verified_by: data.verified_by, trx: trx2, donation: don, receipt: rcpt };
        }
      } catch (e) { /* jatuh ke jalur lokal di bawah */ }
    }
    return finalizeSuccessLocal(trx, 'MANUAL-' + U.uid().slice(0, 8).toUpperCase(), 'transaction.manual_confirm',
      note || 'Konfirmasi manual oleh admin hasil rekonsiliasi bank (tercatat di audit trail).');
  }

  function failTransaction(trxId, reason) {
    const trx = get('payment_transactions', trxId);
    if (!trx || trx.status !== 'menunggu') return { ok: false, message: 'Transaksi tidak dapat dibatalkan/gagal-kan.' };
    update('payment_transactions', trx.id, { status: 'gagal', paid_at: null });
    const don = get('donations', trx.donation_id);
    if (don) update('donations', don.id, { status: 'gagal' });
    audit('transaction.mark_failed', 'payment_transactions', trx.id, { status: 'menunggu' }, { status: 'gagal' }, reason || '');
    return { ok: true };
  }

  /* Pembatalan oleh donatur (publik) — RPC security definer menegakkan aturan */
  async function cancelDonationPublic(codeRef) {
    const don = one('donations', d => d.donation_code === codeRef);
    if (!don || don.status !== 'menunggu') return { ok: false, message: 'Donasi tidak dapat dibatalkan.' };
    if (active) {
      try {
        const { data, error } = await client.rpc('cancel_donation_public', { p_code: codeRef });
        if (error || !data || data.ok === false) return { ok: false, message: (data && data.message) || (error && error.message) || 'Gagal membatalkan.' };
        await pullOne('donations'); await pullOne('payment_transactions');
        return { ok: true };
      } catch (e) { return { ok: false, message: String(e.message || e) }; }
    }
    return null; /* mode lokal: diproses pemanggil */
  }

  async function incrementNewsViews(id) {
    const n2 = get('news', id);
    if (n2) n2.views = (n2.views || 0) + 1;
    if (active) enqueue(async () => { try { await client.rpc('increment_news_views', { p_id: id }); } catch (e) {} });
  }

  /* ---------- AUDIT & NOTIFIKASI ---------- */
  function audit(action, entity, entity_id, old_values, new_values, note) {
    const adm = window.Auth ? Auth.currentAdmin() : null;
    return insert('audit_logs', {
      user: adm ? adm.name : 'Sistem', role: adm ? adm.role_label : '-', user_id: adm ? adm.id : null,
      action, entity, entity_id: entity_id || '-',
      old_values: old_values ? JSON.stringify(old_values) : null,
      new_values: new_values ? JSON.stringify(new_values) : null, note: note || ''
    });
  }
  const notify = (title, desc, type, target_role) => insert('notifications', { title, desc, type, target_role: target_role || null, read: false });
  const unreadNotifications = roleKey => (cache.notifications || []).filter(n => !n.read && (!n.target_role || n.target_role === roleKey)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  /* ---------- BACKUP ---------- */
  const exportAll = () => JSON.parse(JSON.stringify(cache));
  const importAll = () => { U.toast('Impor backup hanya tersedia pada mode DEMO lokal.', 'warn'); return false; };
  const save = () => {}; /* tulisan otomatis di-push */
  /* Kompatibilitas API dengan DB lokal: load() versi lokal membaca localStorage,
     sedangkan pada mode Supabase cache sudah ditarik oleh pull() SEBELUM DB dialihkan
     ke adapter (lihat init). Tanpa ini, PublicApp.init()/AdminApp.init() yang memanggil
     DB.load() crash dengan "DB.load is not a function" tepat setelah Supabase terhubung.
     Segarkan manual tetap tersedia via SUPA.pull() / tombol "Muat Ulang Data"
     (Pengaturan → Supabase). */
  const load = () => {};
  function resetDemo() { clearCfg(); location.reload(); }

  const adapter = {
    /* dasar */
    load, save, all, get, find, one, insert, update, remove, save,
    settings, zakat, setSettings, setZakat, code, codeMonth,
    programRaised, fundIncome, fundSpent, fundBalance, fundBalances, stats, monthlySeries, fundSeries,
    expireStale, webhookSuccess, manualConfirm, failTransaction,
    cancelDonationPublic, incrementNewsViews,
    audit, notify, unreadNotifications, exportAll, importAll, resetDemo,
    get db() { return cache; },
    __supa: true
  };

  /* ============================================================
     AUTH (Supabase Auth)
     ============================================================ */
  async function adminLogin(email, password) {
    email = String(email || '').trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: 'Login Supabase gagal: ' + error.message };
    const { data: prof, error: perr } = await client.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (perr || !prof) {
      await client.auth.signOut();
      let msg = 'Profil admin tidak ditemukan. Hubungi Super Admin.';
      try { /* akun bisa jadi donatur, bukan pengelola */
        const { data: d } = await client.from('donors').select('id').eq('auth_user_id', data.user.id).maybeSingle();
        if (d) msg = 'Akun ini terdaftar sebagai DONATUR. Silakan masuk melalui Area Donatur di website publik.';
      } catch (e) {}
      return { ok: false, message: msg };
    }
    if (prof.status !== 'aktif') { await client.auth.signOut(); return { ok: false, message: 'Akun dinonaktifkan. Hubungi Super Admin.' }; }
    await refreshAdminTables();
    localStorage.setItem('FLMS_ADMIN_SESSION', JSON.stringify({ user_id: prof.id, name: prof.name, role_key: prof.role_key, role_label: prof.role_label || '', login_at: NOW(), exp: Date.now() + 8 * 3600000 }));
    await enqueue(async () => { await client.from('profiles').update({ last_login: NOW() }).eq('id', prof.id); });
    audit('auth.login', 'profiles', prof.id, null, null, 'Login admin berhasil (Supabase Auth)');
    return { ok: true, user: prof };
  }
  async function adminLogout() {
    try { await client.auth.signOut(); } catch (e) {}
    await pull();
  }
  async function donorLogin(email, password) {
    email = String(email || '').trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: 'Login gagal: ' + error.message };
    const { data: d } = await client.from('donors').select('*').eq('auth_user_id', data.user.id).maybeSingle();
    if (!d) return { ok: false, message: 'Profil donatur tidak ditemukan.' };
    await refreshDonorTables();
    localStorage.setItem('FLMS_DONOR_SESSION', JSON.stringify({ donor_id: d.id, login_at: NOW() }));
    return { ok: true, donor: d };
  }
  async function donorRegister(name, email, phone, password) {
    email = String(email || '').trim().toLowerCase();
    if (!name || !email || !password) return { ok: false, message: 'Nama, email, dan password wajib diisi.' };
    if (password.length < 6) return { ok: false, message: 'Password minimal 6 karakter.' };
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { ok: false, message: error.message };
    const authUid = data && data.user ? data.user.id : null;
    const row = { id: uuid(), created_at: NOW(), updated_at: NOW(), name, email, phone: phone || '', auth_user_id: authUid, address: '', verified: !!authUid, status: 'aktif', notes: '' };
    cache.donors.push(row);
    await push('donors', row).catch(() => {});
    if (data.session) {
      await refreshDonorTables();
      localStorage.setItem('FLMS_DONOR_SESSION', JSON.stringify({ donor_id: row.id, login_at: NOW() }));
    } else {
      U.toast('Pendaftaran tercatat. Cek email untuk verifikasi bila konfirmasi aktif.', 'info');
    }
    audit('donor.register', 'donors', row.id, null, { email }, 'Registrasi donatur (Supabase Auth)');
    return { ok: true, donor: row };
  }
  async function donorLogout() { try { await client.auth.signOut(); } catch (e) {} await pull(); }

  /* ============================================================
     GENERATOR SQL MIGRASI (dari data DEMO lokal → Supabase)
     ============================================================ */
  const q = v => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (v instanceof Date) return `'${v.toISOString()}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  function buildMigrationSQL(opts = {}) {
    const local = JSON.parse(localStorage.getItem('FLMS_DB_V1') || 'null');
    if (!local) return '-- Data demo lokal tidak ditemukan.';
    const idMap = {};
    const mapId = (t, oldId) => { if (!oldId) return null; idMap[t] = idMap[t] || {}; if (!idMap[t][oldId]) idMap[t][oldId] = uuid(); return `'${idMap[t][oldId]}'::uuid`; };
    const newId = (t, oldId) => (oldId && idMap[t] && idMap[t][oldId]) ? `'${idMap[t][oldId]}'::uuid` : 'NULL';
    const ins = (t, cols, vals) => `insert into ${t} (${cols.join(',')}) values\n${vals.map(v => `  (${v.join(',')})`).join(',\n')}\non conflict do nothing;\n`;
    const L = ['-- ============================================================',
      '-- SQL MIGRASI DATA — Filantropi Management System',
      `-- Dibuat: ${new Date().toISOString()}${opts.full ? ' — TERMASUK data donasi & donatur' : ' — hanya konten & keuangan'}`,
      '-- Jalankan di Supabase SQL Editor SETELAH supabase/schema.sql.',
      '-- ============================================================', ''];
    /* id lama → uuid baru (regenerasi agar valid uuid) */
    ['programs', 'campaigns', 'donors', 'beneficiaries', 'news', 'galleries', 'testimonials', 'faqs',
      'organization_structures', 'recurring_donations', 'donations', 'payment_transactions', 'receipts',
      'distributions', 'financial_transactions', 'financial_accounts', 'financial_reports'
    ].forEach(t => (local[t] || []).forEach(r => mapId(t, r.id)));

    L.push('-- Konten lembaga');
    L.push(ins('organization_structures', ['id', 'name', 'position', 'level', 'created_at'],
      (local.organization_structures || []).map(r => [newId('organization_structures', r.id), q(r.name), q(r.position), r.level || 1, q(r.created_at)])));
    L.push(ins('news', ['id', 'title', 'category', 'excerpt', 'content', 'author', 'image_url', 'published', 'views', 'created_at'],
      (local.news || []).map(r => [newId('news', r.id), q(r.title), q(r.category), q(r.excerpt), q(r.content), q(r.author), q(r.image), r.published, r.views || 0, q(r.created_at)])));
    L.push(ins('galleries', ['id', 'title', 'category', 'image_url', 'consent', 'status', 'created_at'],
      (local.galleries || []).map(r => [newId('galleries', r.id), q(r.title), q(r.category), q(r.image), r.consent, q(r.status), q(r.created_at)])));
    L.push(ins('testimonials', ['id', 'name', 'role', 'quote', 'approved', 'photo_consent', 'status', 'created_at'],
      (local.testimonials || []).map(r => [newId('testimonials', r.id), q(r.name), q(r.role), q(r.quote), r.approved, r.photo_consent, q(r.status), q(r.created_at)])));
    L.push(ins('faqs', ['id', 'question', 'answer', 'order_no', 'status', 'created_at'],
      (local.faqs || []).map(r => [newId('faqs', r.id), q(r.question), q(r.answer), r.order || 1, q(r.status), q(r.created_at)])));

    L.push('-- Program & kampanye');
    L.push(ins('programs', ['id', 'name', 'category', 'fund_type', 'target', 'short_desc', 'description', 'image_url', 'status', 'featured', 'beneficiary_count', 'created_at'],
      (local.programs || []).map(r => [newId('programs', r.id), q(r.name), q(r.category), q(r.fund_type), r.target, q(r.short_desc), q(r.desc), q(r.image), q(r.status), !!r.featured, r.beneficiary_count || 0, q(r.created_at)])));
    L.push(ins('campaigns', ['id', 'title', 'slug', 'program_id', 'fund_type', 'target', 'ends_at', 'short_desc', 'image_url', 'status', 'created_at'],
      (local.campaigns || []).map(r => [newId('campaigns', r.id), q(r.title), q(r.slug), newId('programs', r.program_id), q(r.fund_type), r.target, q(r.ends_at), q(r.short_desc), q(r.image), q(r.status), q(r.created_at)])));

    L.push('-- Keuangan (saldo diperhitungkan ulang dari transaksi)');
    L.push(ins('financial_accounts', ['id', 'acc_code', 'name', 'type', 'bank_name', 'number', 'balance', 'status', 'created_at'],
      (local.financial_accounts || []).map(r => [newId('financial_accounts', r.id), q(r.acc_code), q(r.name), q(r.type), q(r.bank_name), q(r.number), 0, q(r.status), q(r.created_at)])));
    L.push(ins('financial_transactions', ['id', 'trx_type', 'direction', 'fund_type', 'category_code', 'amount', 'ref_code', 'description', 'trx_date', 'status', 'created_at'],
      (local.financial_transactions || []).map(r => [newId('financial_transactions', r.id), q(r.trx_type), q(r.direction), q(r.fund_type), q(r.category_code), r.amount, q(r.ref_code), q(r.description), q(r.trx_date), q(r.status), q(r.created_at)])));
    L.push(ins('financial_reports', ['id', 'report_code', 'title', 'period', 'year', 'total_in', 'total_out', 'status', 'note', 'approved_at', 'approved_by', 'created_at'],
      (local.financial_reports || []).map(r => [newId('financial_reports', r.id), q(r.report_code), q(r.title), q(r.period), r.year, r.total_in || 0, r.total_out || 0, q(r.status), q(r.note), q(r.approved_at), q(r.approved_by), q(r.created_at)])));

    if (opts.full) {
      L.push('-- Donatur & donasi (mengandung data pribadi — gunakan di proyek sendiri)');
      L.push(ins('donors', ['id', 'name', 'email', 'phone', 'verified', 'status', 'notes', 'created_at'],
        (local.donors || []).map(r => [newId('donors', r.id), q(r.name), q(r.email), q(r.phone), !!r.verified, q(r.status), q(r.notes), q(r.created_at)])));
      L.push(ins('beneficiaries', ['id', 'name', 'nik', 'phone', 'address', 'category', 'needs', 'program_id', 'photo_consent', 'status', 'created_at'],
        (local.beneficiaries || []).map(r => [newId('beneficiaries', r.id), q(r.name), q(r.nik), q(r.phone), q(r.address), q(r.category), q(r.needs), newId('programs', r.program_id), !!r.photo_consent, q(r.status), q(r.created_at)])));
      L.push(ins('distributions', ['id', 'dist_number', 'program_id', 'fund_type', 'beneficiary_id', 'amount', 'status', 'description', 'proof_url', 'report_note', 'requested_by', 'verified_by', 'approved_by', 'disbursed_at', 'finished_at', 'created_at'],
        (local.distributions || []).map(r => [newId('distributions', r.id), q(r.dist_number), newId('programs', r.program_id), q(r.fund_type), newId('beneficiaries', r.beneficiary_id), r.amount, q(r.status), q(r.description), '', q(r.report_note), q(r.requested_by), q(r.verified_by), q(r.approved_by), q(r.disbursed_at), q(r.finished_at), q(r.created_at)])));
      L.push(ins('recurring_donations', ['id', 'donor_id', 'donor_name', 'email', 'fund_type', 'program_id', 'amount', 'method_code', 'status', 'start_date', 'next_charge', 'note', 'created_at'],
        (local.recurring_donations || []).map(r => [newId('recurring_donations', r.id), newId('donors', r.donor_id), q(r.donor_name), q(r.email), q(r.fund_type), newId('programs', r.program_id), r.amount, q(r.method_code), q(r.status), q(r.start_date), q(r.next_charge), q(r.note), q(r.created_at)])));
      L.push(ins('donations', ['id', 'donation_code', 'donor_id', 'donor_name', 'donor_email', 'donor_phone', 'is_anonymous', 'fund_type', 'program_id', 'amount', 'unique_code', 'total_amount', 'payment_method_code', 'donation_type', 'recurring_id', 'message', 'status', 'payment_deadline', 'paid_at', 'created_at'],
        (local.donations || []).map(r => [newId('donations', r.id), q(r.donation_code), newId('donors', r.donor_id), q(r.donor_name), q(r.donor_email), q(r.donor_phone), !!r.is_anonymous, q(r.fund_type), newId('programs', r.program_id), r.amount, r.unique_code, r.total_amount, q(r.payment_method_code), q(r.donation_type), newId('recurring_donations', r.recurring_id), q(r.message), q(r.status), q(r.payment_deadline), q(r.paid_at), q(r.created_at)])));
      L.push(ins('payment_transactions', ['id', 'trx_code', 'donation_id', 'donation_code', 'amount', 'method_code', 'provider', 'va_number', 'provider_reference', 'status', 'expires_at', 'paid_at', 'reconciled', 'reconciled_at', 'reconciled_note', 'created_at'],
        (local.payment_transactions || []).map(r => [newId('payment_transactions', r.id), q(r.trx_code), newId('donations', r.donation_id), q(r.donation_code), r.amount, q(r.method_code), q(r.provider), q(r.va_number), q(r.provider_reference), q(r.status), q(r.expires_at), q(r.paid_at), !!r.reconciled, q(r.reconciled_at), q(r.reconciled_note), q(r.created_at)])));
      L.push(ins('receipts', ['id', 'receipt_no', 'donation_id', 'trx_code', 'amount', 'fund_type', 'program_name', 'donor_name', 'method', 'issued_at', 'created_at'],
        (local.receipts || []).map(r => [newId('receipts', r.id), q(r.receipt_no), newId('donations', r.donation_id), q(r.trx_code), r.amount, q(r.fund_type), q(r.program_name), q(r.donor_name), q(r.method), q(r.issued_at), q(r.created_at)])));
    }
    L.push('', '-- Selesai. Periksa data melalui Table Editor, lalu nonaktifkan MODE DEMO',
      '-- (Pengaturan Sistem → Identitas) dan konfigurasikan URL Supabase pada tab Supabase.');
    return L.join('\n');
  }
  function downloadMigrationSQL(full) {
    const sql = buildMigrationSQL({ full });
    U.downloadBlob(full ? 'migrasi-data-lengkap.sql' : 'migrasi-data-konten.sql',
      new Blob([sql], { type: 'application/sql' }));
  }

  /* ============================================================
     BRIDGE INIT
     ============================================================ */
  async function init(done) {
    if (!configured()) return done();
    try {
      await loadScript();
      client = window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: true, autoRefreshToken: true } });
      active = true;
      await pull();
      DB = adapter; /* alihkan seluruh aplikasi ke Supabase */
      console.info('[SUPA] Terhubung:', cfg.url);
    } catch (e) {
      loadError = String(e.message || e);
      console.error('[SUPA]', loadError);
      U.toast('Supabase gagal terhubung (' + loadError + ') — berjalan pada MODE DEMO lokal.', 'error');
    }
    done();
  }

  const clientFn = () => client;
  return {
    cfg: () => ({ ...cfg }), saveCfg, clearCfg, configured, active: () => active, error: () => loadError,
    client: clientFn, init, pull, refreshAdminTables, refreshDonorTables, hydrateDonation, testConnection,
    adminLogin, adminLogout, donorLogin, donorRegister, donorLogout,
    buildMigrationSQL, downloadMigrationSQL,
    adapter: () => adapter
  };
})();

/* Alias lama + ekspos ke window agar guard `window.SUPA` (auth.js, admin.js) berfungsi */
const SupabaseBridge = SUPA;
window.SUPA = SUPA;
window.SupabaseBridge = SUPA;
