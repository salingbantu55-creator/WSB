'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — INTEGRASI WHATSAPP (TAHAP 2)
   WA = modul notifikasi WhatsApp:
   1. OUTBOX  — antrean pesan tersimpan di tabel notifications
                (channel: 'whatsapp' | 'email') dengan status terkirim.
   2. KIRIM API — melalui Supabase Edge Function `whatsapp-send`
      (token API di server, TIDAK pernah di frontend). Provider:
      Fonnte / Wablas / Twilio / Meta Cloud API.
   3. KIRIM MANUAL — tautan wa.me (selalu berfungsi, tanpa API).
   4. Status TERHUBUNG hanya bila token + Edge Function tersedia;
      selain itu tampil BELUM TERHUBUNG sesuai spesifikasi.
   ============================================================ */
const WA = (() => {

  /* ---------- STATUS KONEKSI ---------- */
  function status() {
    const w = (DB.settings() || {}).whatsapp_api || {};
    const hasToken = !!w.token;
    const hasApiPath = !!(window.SUPA && SUPA.active && SUPA.cfg().url);
    return {
      provider: w.provider || '-',
      hasToken, hasApiPath,
      connected: hasToken && hasApiPath,          // kirim otomatis via server
      manual: !hasToken || !hasApiPath,           // fallback wa.me
      mode: hasToken && hasApiPath ? 'api' : 'manual'
    };
  }
  const statusBadge = () => {
    const st = status();
    return st.connected
      ? '<span class="badge badge-green">TERHUBUNG</span>'
      : '<span class="badge badge-red">BELUM TERHUBUNG</span>';
  };

  /* ---------- NOMOR & TAUTAN ---------- */
  function normalizePhone(p) {
    let s = String(p || '').replace(/[^0-9]/g, '');
    if (s.startsWith('0')) s = '62' + s.slice(1);
    else if (s.startsWith('8')) s = '62' + s;
    else if (s.startsWith('+62')) s = s.slice(1);
    return s;
  }
  const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
  const appUrl = () => location.origin + location.pathname.replace(/admin\.html$/, 'index.html');

  /* ---------- PEMBENTUK PESAN (Indonesian) ---------- */
  function donationMessage(don, receipt, s, method) {
    const L = [];
    L.push('*' + (s.name || 'Lembaga Filantropi').toUpperCase() + '*');
    L.push(receipt ? 'Kuitansi Donasi Resmi' : 'Instruksi Pembayaran Donasi');
    L.push('');
    L.push('Kode Donasi : ' + don.donation_code);
    if (receipt) {
      L.push('No. Kuitansi : ' + receipt.receipt_no);
      L.push('Status       : *BERHASIL — TERVERIFIKASI*');
    } else {
      L.push('Status       : Menunggu Pembayaran');
    }
    L.push('Donatur      : ' + (don.is_anonymous ? 'Hamba Allah' : don.donor_name));
    L.push('Jenis Dana   : ' + U.fundLabel(don.fund_type));
    const prog = don.program_id ? DB.get('programs', don.program_id) : null;
    L.push('Peruntukan   : ' + (prog ? prog.name : 'Dana Umum'));
    L.push('Jumlah       : ' + U.fmtRp(receipt ? receipt.amount : don.total_amount));
    if (receipt) {
      L.push('Metode       : ' + (method ? method.name : don.payment_method_code));
      L.push('');
      L.push('Unduh kuitansi PDF (klik dari ponsel):');
      L.push(appUrl() + '#/kuitansi/' + don.donation_code);
    } else {
      L.push('Batas bayar  : ' + U.fmtDateTime(don.payment_deadline));
      L.push('');
      L.push('Selesaikan pembayaran:');
      L.push(appUrl() + '#/pembayaran/' + don.donation_code);
    }
    L.push('');
    L.push('Terima kasih atas kepercayaan dan kemurahan hati Anda.');
    L.push('_Pesan otomatis — Filantropi Management System_' + (s.demo_mode ? ' [DEMO]' : ''));
    return L.join('\n');
  }
  function distributionMessage(dist, s) {
    const prog = dist.program_id ? DB.get('programs', dist.program_id) : null;
    return ['*' + (s.name || 'Lembaga').toUpperCase() + '*', 'Notifikasi Penyaluran Dana', '',
      'No. Penyaluran : ' + dist.dist_number,
      'Jenis Dana     : ' + U.fundLabel(dist.fund_type),
      'Program        : ' + (prog ? prog.name : '-'),
      'Jumlah         : ' + U.fmtRp(dist.amount),
      'Status         : ' + (U.DIST_STATUS[dist.status] || {}).label,
      '',
      '_Pesan otomatis — Filantropi Management System_'].join('\n');
  }

  /* ---------- ANTREAN (OUTBOX) ---------- */
  function queue({ channel, title, desc, type, target_role, phone, message, ref_code }) {
    const st = status();
    return DB.insert('notifications', {
      title, desc: desc || '', type: type || 'notifikasi',
      target_role: target_role || null, read: false,
      channel: channel || 'whatsapp',
      wa_status: 'pending', wa_phone: normalizePhone(phone || ''),
      wa_message: message || '', wa_ref: ref_code || '',
      wa_link: phone ? waLink(phone, message || '') : '',
      wa_via: st.mode, wa_sent_at: null, wa_error: ''
    });
  }

  function queueDonationSuccess(don, receipt) {
    const s = DB.settings();
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    const msg = donationMessage(don, receipt, s, method);
    if (don.donor_phone) queue({ channel: 'whatsapp', title: 'Kuitansi via WhatsApp — ' + don.donation_code, desc: 'Pesan kuitansi untuk ' + (don.is_anonymous ? 'Hamba Allah' : don.donor_name), type: 'donasi', target_role: null, phone: don.donor_phone, message: msg, ref_code: don.donation_code });
    if (don.donor_email) {
      const em = DB.insert('notifications', { title: 'Kuitansi via Email — ' + don.donation_code, desc: 'Kuitansi ' + receipt.receipt_no + ' untuk ' + don.donor_email, type: 'donasi', target_role: null, read: false, channel: 'email', wa_status: 'pending', wa_phone: don.donor_email, wa_message: msg, wa_ref: don.donation_code, wa_link: '', wa_via: 'smtp', wa_sent_at: null, wa_error: '' });
      return em;
    }
    return null;
  }

  function queueDonationPending(don) {
    const s = DB.settings();
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    if (!don.donor_phone) return null;
    const msg = donationMessage(don, null, s, method);
    return queue({ channel: 'whatsapp', title: 'Instruksi bayar via WhatsApp — ' + don.donation_code, desc: 'Pengingat pembayaran donasi ' + don.donation_code, type: 'donasi', target_role: null, phone: don.donor_phone, message: msg, ref_code: don.donation_code });
  }

  function queueDistribution(dist) {
    const s = DB.settings();
    const msg = distributionMessage(dist, s);
    return queue({ channel: 'whatsapp', title: 'Penyaluran ' + dist.dist_number, desc: 'Notifikasi status penyaluran dana', type: 'penyaluran', target_role: 'admin_penyaluran', phone: (DB.settings().wa || '').replace(/[^0-9]/g, '') || '', message: msg, ref_code: dist.dist_number });
  }

  /* ---------- PENGIRIMAN ---------- */
  async function sendViaApi(row) {
    const cfg = SUPA.cfg();
    const sb = SUPA.client();
    const { data: sessData } = await sb.auth.getSession();
    const token = sessData && sessData.session ? sessData.session.access_token : null;
    const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/whatsapp-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anon,
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify({
        channel: row.channel || 'whatsapp',
        to: row.wa_phone, message: row.wa_message,
        subject: row.title, ref: row.wa_ref
      })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) throw new Error(out.error || ('HTTP ' + res.status));
    return out;
  }

  async function sendOne(id, opts = {}) {
    const row = DB.get('notifications', id);
    if (!row) return { ok: false, message: 'Antrean tidak ditemukan.' };
    if (row.wa_status === 'terkirim' && !opts.force) return { ok: false, message: 'Pesan sudah terkirim.' };
    const st = status();
    if (st.connected) {
      try {
        await sendViaApi(row);
        DB.update('notifications', id, { wa_status: 'terkirim', wa_sent_at: new Date().toISOString(), wa_error: '' });
        return { ok: true, via: 'api' };
      } catch (e) {
        DB.update('notifications', id, { wa_status: 'gagal', wa_error: String(e.message || e).slice(0, 200) });
        if (!opts.fallbackManual) return { ok: false, message: 'Gagal kirim via API: ' + (e.message || e) + '. Gunakan kirim manual (wa.me).' };
      }
    }
    /* fallback / manual: buka tautan wa.me (WhatsApp Web / aplikasi ponsel) */
    if (row.channel === 'email') {
      const url = 'mailto:' + row.wa_phone + '?subject=' + encodeURIComponent(row.title || 'Kuitansi Donasi') + '&body=' + encodeURIComponent(row.wa_message || '');
      window.open(url, '_blank');
    } else {
      const link = row.wa_link || waLink(row.wa_phone, row.wa_message);
      window.open(link, '_blank');
    }
    DB.update('notifications', id, { wa_status: 'terkirim_manual', wa_sent_at: new Date().toISOString(), wa_error: '' });
    return { ok: true, via: 'manual' };
  }

  async function sendPending(limit = 10) {
    const rows = DB.find('notifications', n => n.channel && n.wa_status === 'pending').slice(0, limit);
    let ok = 0;
    for (const r of rows) { const res = await sendOne(r.id, { fallbackManual: false }); if (res.ok) ok++; }
    return { total: rows.length, ok };
  }

  /* Test kirim dari halaman Pengaturan */
  async function testSend() {
    const s = DB.settings();
    const adm = (typeof Auth !== 'undefined') ? Auth.currentAdmin() : null;
    const to = (adm && adm.phone) || s.wa || '';
    if (!to) { U.toast('Nomor WhatsApp tujuan belum diatur (Pengaturan → Identitas → WhatsApp).', 'error'); return; }
    const st = status();
    const msg = ['*' + s.name + '*', 'Uji Koneksi WhatsApp — Filantropi Management System', '',
      'Bila Anda menerima pesan ini, integrasi WhatsApp berfungsi.',
      'Mode kirim: ' + (st.connected ? 'API (' + st.provider + ' via Edge Function)' : 'Manual (tautan wa.me)'),
      'Waktu: ' + new Date().toLocaleString('id-ID')].join('\n');
    const row = queue({ channel: 'whatsapp', title: 'Uji koneksi WhatsApp', desc: 'Pesan uji dari Pengaturan Sistem', type: 'sistem', phone: to, message: msg, ref_code: 'TEST' });
    const res = await sendOne(row.id, { fallbackManual: true, force: true });
    U.toast(res.via === 'api' ? 'Test TERKIRIM via API (' + st.provider + '). Antrean diperbarui.'
      : res.via === 'manual' ? 'Tautan wa.me dibuka — kirim manual. Untuk kirim otomatis: isi Token API + aktifkan Supabase (Edge Function).'
      : res.message, res.ok ? 'success' : 'error');
    if (window.AA && typeof route === 'function') route();
  }

  /* ---------- AKSI PUBLIK (tanpa admin) ---------- */
  function sendPublicReceipt(code) {
    const don = DB.one('donations', d => d.donation_code === code);
    if (!don) { U.toast('Donasi tidak ditemukan.', 'error'); return; }
    const receipt = DB.one('receipts', x => x.donation_id === don.id);
    const s = DB.settings();
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    const msg = donationMessage(don, receipt, s, method);
    const phone = don.donor_phone || '';
    if (!phone) { U.toast('Nomor WhatsApp tidak tersedia untuk donasi ini. Salin pesan secara manual.', 'warn'); U.copyText(msg); return; }
    DB.audit ? null : null;
    window.open(waLink(phone, msg), '_blank');
    U.toast('WhatsApp dibuka — tekan kirim untuk mengunduh kuitansi ke WhatsApp Anda.');
  }

  function sendPublicPayment(code) {
    const don = DB.one('donations', d => d.donation_code === code);
    if (!don) return;
    const s = DB.settings();
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    const msg = donationMessage(don, null, s, method);
    if (!don.donor_phone) { U.copyText(msg); return; }
    window.open(waLink(don.donor_phone, msg), '_blank');
    U.toast('Instruksi pembayaran dibuka di WhatsApp.');
  }

  /* ---------- TAHAP 3: KONFIRMASI TRANSFER MANUAL KE ADMIN ----------
     Donatur klik tombol → wa.me ke NOMOR ADMIN (settings.wa) dengan pesan
     berisi kode donasi + rincian; donatur cukup melampirkan screenshot
     bukti transfer lalu mengirim. Admin memverifikasi di panel admin. */
  function transferConfirmMessage(don, s) {
    const prog = don.program_id ? DB.get('programs', don.program_id) : null;
    const banks = (s.banks || []);
    const L = [];
    L.push('*' + (s.name || 'Lembaga Filantropi').toUpperCase() + '*');
    L.push('Konfirmasi Donasi — Transfer Bank Manual');
    L.push('');
    L.push('Kode Donasi : *' + don.donation_code + '*');
    L.push('Donatur     : ' + (don.is_anonymous ? 'Hamba Allah' : don.donor_name));
    L.push('No. WA      : ' + (don.donor_phone || '-'));
    L.push('Jenis Dana  : ' + U.fundLabel(don.fund_type));
    L.push('Peruntukan  : ' + (prog ? prog.name : 'Dana Umum'));
    L.push('Jumlah Transfer : *' + U.fmtRp(don.total_amount) + '*');
    if (banks.length) L.push('Rekening tujuan : ' + banks.map(b => b.bank).join(' / '));
    L.push('');
    L.push('_Saya telah mentransfer ke rekening lembaga dan melampirkan bukti transfer (screenshot) pada pesan ini._');
    L.push('');
    L.push('Mohon admin memverifikasi donasi saya. Terima kasih.');
    if (s.demo_mode) L.push('[DEMO]');
    return L.join('\n');
  }

  function sendTransferConfirmation(code) {
    const don = DB.one('donations', d => d.donation_code === code);
    if (!don) { U.toast('Donasi tidak ditemukan.', 'error'); return; }
    const s = DB.settings();
    const msg = transferConfirmMessage(don, s);
    const admin = (s.wa || '').trim();
    if (!admin) {
      U.copyText(msg);
      U.toast('Nomor WA admin belum diatur — pesan konfirmasi disalin, kirimkan ke kontak resmi lembaga.', 'warn');
      return;
    }
    window.open(waLink(admin, msg), '_blank');
    U.toast('WhatsApp admin dibuka — lampirkan screenshot bukti transfer lalu kirim.');
    /* catat ke outbox (jejak konfirmasi donatur) */
    try {
      queue({ channel: 'whatsapp', title: 'Konfirmasi transfer manual — ' + don.donation_code,
        desc: 'Donatur mengirim bukti transfer via WhatsApp ke admin', type: 'donasi',
        target_role: 'admin_donasi', phone: admin, message: msg, ref_code: don.donation_code });
    } catch (e) { console.warn(e); }
  }

  /* ---------- DATA OUTBOX ---------- */
  const rows = channel => DB.find('notifications', n => !!n.channel)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(n => !channel || n.channel === channel);
  const WSTATUS = {
    pending: { label: 'Menunggu', cls: 'badge-amber' },
    terkirim: { label: 'Terkirim (API)', cls: 'badge-green' },
    terkirim_manual: { label: 'Terkirim Manual', cls: 'badge-blue' },
    gagal: { label: 'Gagal', cls: 'badge-red' }
  };
  const wBadge = s2 => { const m = WSTATUS[s2] || { label: s2 || '-', cls: 'badge-gray' }; return `<span class="badge ${m.cls}">${m.label}</span>`; };

  return { status, statusBadge, normalizePhone, waLink, donationMessage, distributionMessage, queue, queueDonationSuccess, queueDonationPending, queueDistribution, sendOne, sendPending, testSend, sendPublicReceipt, sendPublicPayment, transferConfirmMessage, sendTransferConfirmation, rows, WSTATUS, wBadge };
})();

/* ekspos ke window agar guard `window.WA` di modul lain berfungsi */
window.WA = WA;
