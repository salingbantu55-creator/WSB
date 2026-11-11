'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — LAPISAN DATABASE
   Mensimulasikan Supabase (PostgreSQL) menggunakan localStorage.
   Pada produksi, ganti modul ini dengan Supabase Client —
   struktur tabel mengikuti supabase/schema.sql.
   ============================================================ */
/* var (bukan const) agar dapat dialihkan ke adapter Supabase oleh supabase.js */
var DB = (() => {
  const KEY = 'FLMS_DB_V1';
  const VERSION = 1;
  const NOW = () => new Date().toISOString();
  const dAgo = d => new Date(Date.now() - d * 86400000).toISOString();
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  let db = null;

  function blank() {
    return {
      __version: VERSION,
      profiles: [], roles: [], permissions: [], user_roles: [],
      institution_settings: {}, organization_structures: [],
      programs: [], campaigns: [], donors: [], donations: [],
      payment_transactions: [], payment_methods: [], recurring_donations: [], receipts: [],
      beneficiaries: [], distributions: [],
      financial_accounts: [], financial_categories: [], financial_transactions: [], financial_reports: [],
      news: [], galleries: [], testimonials: [], faqs: [],
      newsletters: [], notifications: [], audit_logs: [],
      zakat_settings: {}, newsletter_subscribers: []
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); if (p && p.__version === VERSION) { db = p; migrate(); return; } }
    } catch (e) { console.warn('DB rusak, seed ulang.', e); }
    db = blank(); seed(); migrate(); save();
  }
  /* ---------- MIGRASI DATA LOKAL ANTAR VERSI ---------- */
  function migrate() {
    if (db.__v2) return;
    /* Tahap 2: modul Outbox WhatsApp (notifikasi terjadwal) */
    if (!db.permissions.some(x => x.code === 'outbox.view')) {
      db.permissions.push({ id: U.uid(), code: 'outbox.view', module: 'outbox', action: 'view' });
      db.permissions.push({ id: U.uid(), code: 'outbox.manage', module: 'outbox', action: 'manage' });
      const add = (rk, perms) => { const r = db.roles.find(x => x.key === rk); if (r && !r.permissions.includes('*')) r.permissions = [...new Set([...r.permissions, ...perms])]; };
      add('admin_donasi', ['outbox.view', 'outbox.manage']);
      add('admin_keuangan', ['outbox.view', 'outbox.manage']);
      add('admin_website', ['outbox.view']);
      add('auditor', ['outbox.view']);
    }
    db.__v2 = true; save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('Gagal simpan DB (kuota?)', e); U.toast('Gagal menyimpan data — storage penuh', 'error'); } }
  const all = t => db[t] || [];
  const get = (t, id) => (db[t] || []).find(x => x.id === id);
  const find = (t, fn) => (db[t] || []).filter(fn);
  const one = (t, fn) => (db[t] || []).find(fn);
  function insert(t, data) { const row = { id: U.uid(), created_at: NOW(), updated_at: NOW(), ...data }; db[t].push(row); save(); return row; }
  function update(t, id, patch) { const row = get(t, id); if (!row) return null; Object.assign(row, patch, { updated_at: NOW() }); save(); return row; }
  function remove(t, id) { db[t] = db[t].filter(x => x.id !== id); save(); }

  /* ---------- SINGELTON SETTINGS ---------- */
  const settings = () => db.institution_settings;
  const zakat = () => db.zakat_settings;
  const setSettings = p => { Object.assign(db.institution_settings, p, { updated_at: NOW() }); save(); };
  const setZakat = p => { Object.assign(db.zakat_settings, p, { updated_at: NOW() }); save(); };

  /* ---------- NOMOR OTOMATIS ---------- */
  function code(prefix, table, field, pad = 4) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const n = db[table].filter(x => (x[field] || '').startsWith(`${prefix}${ymd}`)).length + 1;
    return `${prefix}${ymd}-${String(n).padStart(pad, '0')}`;
  }
  function codeMonth(prefix, table, field, pad = 4) {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const n = db[table].filter(x => (x[field] || '').startsWith(`${prefix}${ym}`)).length + 1;
    return `${prefix}${ym}-${String(n).padStart(pad, '0')}`;
  }

  /* ============================================================
     SEED DATA (MODE DEMO)
     ============================================================ */
  function seed() {
    const S = db;

    /* ---------- PERAN & IZIN (RBAC) ---------- */
    const MODULES = [
      { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
      { key: 'programs', label: 'Program', actions: ['view', 'manage'] },
      { key: 'campaigns', label: 'Kampanye', actions: ['view', 'manage'] },
      { key: 'donors', label: 'Donatur', actions: ['view', 'manage', 'export'] },
      { key: 'transactions', label: 'Transaksi', actions: ['view', 'verify', 'correct', 'export'] },
      { key: 'distributions', label: 'Penyaluran Dana', actions: ['view', 'create', 'verify', 'approve', 'disburse'] },
      { key: 'beneficiaries', label: 'Penerima Manfaat', actions: ['view', 'manage', 'view_full'] },
      { key: 'finance', label: 'Laporan Keuangan', actions: ['view', 'manage', 'export', 'approve_reports'] },
      { key: 'content', label: 'Konten Website', actions: ['view', 'manage'] },
      { key: 'users', label: 'Pengguna & Peran', actions: ['view', 'manage'] },
      { key: 'settings', label: 'Pengaturan Sistem', actions: ['view', 'manage'] },
      { key: 'audit', label: 'Audit Trail', actions: ['view'] }
    ];
    S.permissions = MODULES.flatMap(m => m.actions.map(a => ({ id: U.uid(), code: `${m.key}.${a}`, module: m.key, action: a })));
    const P = codes => codes;
    const ROLES = [
      { key: 'super_admin', name: 'Super Admin', desc: 'Akses penuh seluruh modul & konfigurasi sistem', permissions: ['*'] },
      { key: 'admin_website', name: 'Admin Website', desc: 'Mengelola konten publik: berita, galeri, FAQ, testimoni, halaman profil', permissions: P(['dashboard.view', 'programs.view', 'campaigns.manage', 'content.view', 'content.manage', 'beneficiaries.view']) },
      { key: 'admin_program', name: 'Admin Program', desc: 'Mengelola program, kampanye, dan penerima manfaat', permissions: P(['dashboard.view', 'programs.view', 'programs.manage', 'campaigns.view', 'campaigns.manage', 'distributions.view', 'distributions.create', 'beneficiaries.view', 'beneficiaries.manage', 'beneficiaries.view_full']) },
      { key: 'admin_donasi', name: 'Admin Donasi', desc: 'Mengelola donatur, transaksi donasi, dan donasi rutin', permissions: P(['dashboard.view', 'programs.view', 'donors.view', 'donors.manage', 'donors.export', 'transactions.view', 'transactions.verify', 'transactions.export']) },
      { key: 'admin_keuangan', name: 'Admin Keuangan', desc: 'Rekonsiliasi pembayaran, laporan keuangan, verifikasi penyaluran', permissions: P(['dashboard.view', 'programs.view', 'donors.view', 'transactions.view', 'transactions.verify', 'transactions.correct', 'transactions.export', 'distributions.view', 'distributions.create', 'distributions.verify', 'beneficiaries.view', 'finance.view', 'finance.manage', 'finance.export']) },
      { key: 'admin_penyaluran', name: 'Admin Penyaluran', desc: 'Mengoordinasikan penyaluran dana ke penerima manfaat', permissions: P(['dashboard.view', 'programs.view', 'distributions.view', 'distributions.create', 'distributions.disburse', 'beneficiaries.view', 'beneficiaries.manage', 'beneficiaries.view_full', 'finance.view']) },
      { key: 'auditor', name: 'Auditor', desc: 'Memeriksa seluruh transaksi, laporan, dan jejak audit (read-only)', permissions: P(['dashboard.view', 'programs.view', 'campaigns.view', 'donors.view', 'transactions.view', 'transactions.export', 'distributions.view', 'beneficiaries.view', 'finance.view', 'finance.export', 'finance.approve_reports', 'audit.view']) },
      { key: 'pimpinan', name: 'Viewer / Pimpinan', desc: 'Melihat ringkasan, menyetujui penyaluran & laporan', permissions: P(['dashboard.view', 'programs.view', 'campaigns.view', 'donors.view', 'transactions.view', 'distributions.view', 'distributions.approve', 'beneficiaries.view', 'finance.view', 'finance.approve_reports', 'audit.view']) }
    ];
    ROLES.forEach(r => S.roles.push({ id: 'role_' + r.key, created_at: dAgo(200), updated_at: dAgo(200), ...r }));

    /* ---------- PENGGUNA ADMIN ---------- */
    const USERS = [
      ['Ahmad Fauzi, S.E., M.M.', 'superadmin@filantropi.id', 'super_admin', 'Ketua Yayasan / Super Admin'],
      ['Siti Rahma, S.Psi.', 'adminweb@filantropi.id', 'admin_website', 'Admin Website'],
      ['Budi Santoso', 'adminprogram@filantropi.id', 'admin_program', 'Manajer Program'],
      ['Dewi Lestari', 'admindonasi@filantropi.id', 'admin_donasi', 'Admin Donasi'],
      ['Rudi Hartono, S.Ak.', 'adminkeuangan@filantropi.id', 'admin_keuangan', 'Bendahara / Admin Keuangan'],
      ['Andi Pratama', 'adminpenyaluran@filantropi.id', 'admin_penyaluran', 'Koordinator Penyaluran'],
      ['Hendra Wijaya, Ak.', 'auditor@filantropi.id', 'auditor', 'Auditor Internal'],
      ['Ir. H. Muhammad Yusuf', 'pimpinan@filantropi.id', 'pimpinan', 'Pimpinan / Pembina']
    ];
    const pw = window.__hash ? window.__hash('Admin@123') : 'DEMO-HASH';
    USERS.forEach((u, i) => {
      S.profiles.push({ id: 'usr_' + (i + 1), created_at: dAgo(200), updated_at: dAgo(10), name: u[0], email: u[1], password_hash: pw, role_key: u[2], role_label: u[3], status: 'aktif', last_login: dAgo(rnd(1, 9)) });
      S.user_roles.push({ id: U.uid(), user_id: 'usr_' + (i + 1), role_key: u[2], assigned_at: dAgo(200) });
    });

    /* ---------- METODE PEMBAYARAN ---------- */
    [
      ['transfer_manual', 'Transfer Bank Manual — Konfirmasi via WhatsApp', 'transfer_manual', 'Transfer langsung ke rekening resmi lembaga di bawah, lalu kirim bukti transfer ke WhatsApp admin. Status Berhasil setelah admin memverifikasi bukti transfer Anda.', true],
      ['bca_va', 'BCA Virtual Account', 'va', 'Transfer ke nomor Virtual Account BCA sesuai kode yang tertera.', true],
      ['bni_va', 'BNI Virtual Account', 'va', 'Transfer ke nomor Virtual Account BNI sesuai kode yang tertera.', true],
      ['bri_va', 'BRI Virtual Account', 'va', 'Transfer ke nomor Virtual Account BRI sesuai kode yang tertera.', true],
      ['mandiri_va', 'Mandiri Virtual Account', 'va', 'Transfer ke nomor Virtual Account Mandiri sesuai kode yang tertera.', true],
      ['qris', 'QRIS (Semua E-Wallet & M-Banking)', 'qris', 'Pindai kode QRIS menggunakan aplikasi e-wallet atau mobile banking apa pun.', true],
      ['gopay', 'GoPay', 'ewallet', 'Bayar melalui aplikasi Gojek (GoPay).', true],
      ['ovo', 'OVO', 'ewallet', 'Bayar melalui aplikasi OVO.', true],
      ['dana', 'DANA', 'ewallet', 'Bayar melalui aplikasi DANA.', true],
      ['gateway', 'Payment Gateway (Kartu Kredit & Retail)', 'gateway', 'Pembayaran kartu kredit/debit & gerai retail via payment gateway. Aktif setelah API key terkonfigurasi.', false]
    ].forEach(m => S.payment_methods.push({ id: 'pm_' + m[0], code: m[0], name: m[1], type: m[2], instructions: m[3], active: m[4], created_at: dAgo(200) }));

    /* ---------- PENGATURAN LEMBAGA ---------- */
    S.institution_settings = {
      id: 'settings', demo_mode: true, updated_at: NOW(),
      name: 'Yayasan Filantropi Nusantara', tagline: 'Lembaga Filantropi Islam Terpercaya & Transparan',
      about: 'Yayasan Filantropi Nusantara adalah lembaga filantropi Islam yang mengelola zakat, infak, sedekah, dan wakaf (ZISWAF) secara profesional, amanah, dan berbasis teknologi untuk memberdayakan umat.',
      history: 'Berdiri sejak tahun 2015 di Jakarta, Yayasan Filantropi Nusantara tumbuh dari komunitas kecil yang gemar berbagi menjadi lembaga filantropi yang menjangkau ribuan penerima manfaat di berbagai provinsi. Kami percaya bahwa dana umat harus dikelola dengan amanah, akuntabel, dan transparan. Karena itu seluruh penerimaan dan penyaluran dicatat dalam sistem terintegrasi dan dapat dipertanggungjawabkan melalui laporan berkala yang diaudit.',
      vision: 'Menjadi lembaga filantropi terpercaya dan paling berdampak di Indonesia yang memberdayakan umat melalui pengelolaan ZISWAF secara profesional, amanah, dan berkelanjutan.',
      mission: [
        'Mengelola dana zakat, infak, sedekah, dan wakaf secara profesional, syariah, dan amanah.',
        'Menyalurkan bantuan pada program pendidikan, kesehatan, pemberdayaan ekonomi, kemanusiaan, dan tanggap bencana.',
        'Menerapkan tata kelola yang transparan dan akuntabel dengan laporan berkala yang dapat diakses publik.',
        'Meningkatkan literasi filantropi dan menggerakkan kemurahan hati masyarakat.',
        'Membangun kemitraan strategis dengan donatur, pemerintah, dan komunitas untuk dampak yang berkelanjutan.'
      ],
      address: 'Jl. Kemandirian Umat No. 45, Tebet, Jakarta Selatan, DKI Jakarta 12810',
      phone: '021-5551234', wa: '6281234567890', email: 'info@filantropi-nusantara.id',
      legal_sk: 'SK Kemenkumham RI No. AHU-0009876.AH.01.04.Tahun 2015',
      legal_npwp: '98.765.432.1-012.000',
      legal_akreditasi: 'Anggota resmi Forum Zakat (FOZ) & Terdaftar BAZNAS',
      maps_embed_url: '', maps_link: 'https://www.google.com/maps?q=Tebet+Jakarta+Selatan',
      banks: [
        { bank: 'BCA', number: '1234567890', holder: 'Yayasan Filantropi Nusantara' },
        { bank: 'BNI Syariah', number: '9876543210', holder: 'Yayasan Filantropi Nusantara' },
        { bank: 'BSI (Bank Syariah Indonesia)', number: '7214567890', holder: 'YYP Yayasan Filantropi Nusantara' }
      ],
      payment_gateway: { provider: 'midtrans', merchant_id: '', api_key: '', client_key: '', connected: false, note: 'Kunci API disimpan di server (Edge Function), tidak pernah di frontend.' },
      whatsapp_api: { provider: 'Fonnte', token: '', sender: '', connected: false },
      smtp: { host: '', port: 587, user: '', pass: '', from: '', connected: false },
      gemini: { api_key: '', connected: false },
      receipt: { prefix: 'FLM', footer_note: 'Kuitansi ini adalah bukti sah penyaluran dana. Terima kasih atas kepercayaan dan kemurahan hati Anda.', signer_name: 'Rudi Hartono, S.Ak.', signer_title: 'Bendahara Yayasan' },
      seo: { meta_title: 'Yayasan Filantropi Nusantara — Zakat, Infak, Sedekah & Wakaf', meta_description: 'Salurkan zakat, infak, sedekah, dan wakaf Anda melalui lembaga filantropi terpercaya. Transparan, amanah, berdampak.', meta_keywords: 'zakat, infak, sedekah, wakaf, donasi online, lembaga filantropi' }
    };

    /* ---------- PENGATURAN ZAKAT ---------- */
    S.zakat_settings = { gold_price_gram: 1350000, nisab_gold_gram: 85, rate_pct: 2.5, info: 'Bersandar pada standar BAZNAS: nisab penghasilan setara 85 gram emas per tahun, kadar zakat 2,5%.', updated_at: dAgo(5) };

    /* ---------- STRUKTUR ORGANISASI ---------- */
    [
      ['Prof. Dr. H. KH. Abdullah Syafiq, M.A.', 'Ketua Pembina', 1],
      ['H. Ahmad Fauzi, S.E., M.M.', 'Ketua Yayasan', 2],
      ['Ust. H. Muhammad Ridwan, Lc.', 'Pengawas Syariah', 2],
      ['Siti Rahma, S.Psi.', 'Sekretaris', 3],
      ['Rudi Hartono, S.Ak.', 'Bendahara', 3],
      ['Dewi Lestari', 'Manajer Fundraising', 4],
      ['Budi Santoso', 'Manajer Program', 4],
      ['Andi Pratama', 'Koordinator Penyaluran & Relawan', 4]
    ].forEach(o => S.organization_structures.push({ id: U.uid(), name: o[0], position: o[1], level: o[2], created_at: dAgo(200) }));

    /* ---------- PROGRAM (7 KATEGORI) ---------- */
    const PROGRAMS = [
      ['Beasiswa Pendidikan Yatim & Dhuafa', 'Pendidikan', 'zakat', 100000000, 'Mendukung biaya sekolah, seragam, dan kebutuhan belajar anak yatim serta keluarga dhuafa selama satu tahun ajaran.', 'Program beasiswa dirancang untuk memastikan tidak ada anak yatim dan dari keluarga dhuafa yang terputus pendidikannya karena keterbatasan biaya. Penerima manfaat mendapatkan biaya SPP, seragam, buku, dan pendampingan belajar. Penyaluran dilakukan setiap awal semester dengan laporan lengkap kepada para donatur.'],
      ['Klinik Sehat Gratis untuk Lansia', 'Kesehatan', 'sosial', 80000000, 'Pemeriksaan kesehatan, obat-obatan, dan konsultasi gratis untuk lansia dhuafa setiap pekan.', 'Klinik sehat gratis membuka layanan pemeriksaan umum, cek tekanan darah, gula darah, dan pembagian obat gratis bagi lansia dhuafa setiap hari Jumat. Didukung dokter dan relawan medis. Setiap lansia mendapatkan kartu kesehatan dan pendampingan lanjutan bila diperlukan rujukan.'],
      ['Relief Bencana Alam Nusantara', 'Bantuan Bencana', 'sosial', 120000000, 'Respons cepat evakuasi, dapur umum, hunian sementara, dan pemulihan pasca bencana.', 'Tim tanggap bencana kami bergerak cepat dalam 1×24 jam: distribusi paket pangan, dapur umum, selimut, hunian sementara, hingga fase pemulihan (trauma healing dan bantuan modal usaha). Laporan penyaluran diterbitkan berkala dan dapat diakses di halaman transparansi.'],
      ['Modal Usaha Mikro Asnaf', 'Pemberdayaan Ekonomi', 'zakat', 40000000, 'Bantuan modal usaha produktif bagi asnaf agar mandiri dan berhenti menerima bantuan.', 'Pemberdayaan ekonomi asnaf melalui bantuan modal usaha mikro, pelatihan kewirausahaan, dan pendampingan mentor selama 6 bulan. Target: asnaf berhenti dari status penerima zakat dan justru mulai mampu menunaikan zakat. Setiap penerima manfaat dipantau laporan perkembangan usahanya.'],
      ['Wakaf Sumur & Al-Qur\'an', 'ZISWAF', 'wakaf', 50000000, 'Wakaf produktif: sumur air bersih dan mushaf Al-Qur\'an untuk desa-desa yang membutuhkan.', 'Program wakaf produktif membangun sumur bor air bersih untuk desa yang kekurangan air serta menyalurkan mushaf Al-Qur\'an ke masjid, musala, dan tahizul Qur\'an. Nama pewakaf tercatat dalam buku wakaf yayasan. Laporan pembangunan dikirim kepada wakif.'],
      ['Santunan Anak Yatim & Fakir Miskin', 'Sosial & Keagamaan', 'sedekah', 25000000, 'Santunan rutin bulanan bagi anak yatim, fakir miskin, dan ibu tunggal.', 'Santunan rutin setiap bulan untuk anak yatim, fakir miskin, dan ibu tunggal dalam bentuk paket sembako, biaya pendidikan, dan bantuan medis. Dilaksanakan setiap Jumat berkah dengan pendataan mustahik yang diverifikasi langsung oleh amil.'],
      ['Dapur Gizi: Berbagi Paket Pangan', 'Kemanusiaan', 'infak', 20000000, 'Dapur gerobak pangan bergizi gratis untuk fakir miskin, lansia, dan pengembara.', 'Dapur Gizi menyalurkan ribuan porsi makanan bergizi gratis setiap pekan kepada fakir miskin, lansia pengembara, dan pekerja informal di kota besar. Dimasak oleh dapur yayasan dengan standar gizi seimbang, disalurkan langsung ke titik-titik yang terdata.']
    ];
    PROGRAMS.forEach((p, i) => S.programs.push({
      id: 'prog_' + (i + 1), created_at: dAgo(200 - i * 5), updated_at: dAgo(rnd(1, 20)),
      name: p[0] + ' [DEMO]', category: p[1], fund_type: p[2], target: p[3],
      short_desc: p[4], desc: p[5], image: U.placeholder(p[1].toUpperCase(), 800, 500, i),
      status: 'aktif', featured: i < 4, beneficiary_count: rnd(40, 320)
    }));

    /* ---------- KAMPANYE ---------- */
    const CAMPAIGNS = [
      ['Ramadhan Berbagi Kebaikan', 0, 'zakat', 60000000, 24, 'Kampanye zakat & infak terbesar tahun ini: santunan yatim, paket pangan, dan berbagi di bulan penuh keberkahan.'],
      ['Jumat Berkah Setiap Pekan', 6, 'infak', 12000000, 40, 'Infak Jumat berkah untuk dapur gizi dan paket pangan pekanan. Sekecil apa pun sedekahmu, dampaknya nyata.'],
      ['Wakafkan 1 Mushaf Al-Qur\'an', 4, 'wakaf', 25000000, 55, 'Wakafkan mushaf Al-Qur\'an seharga Rp 95.000. Pahalanya mengalir setiap kali dibaca.'],
      ['Peduli Korban Bencana Nusantara', 2, 'sosial', 45000000, 18, 'Bersiap tanggap darurat: pangan, obat, dan hunian sementara bagi penyintas bencana.']
    ];
    CAMPAIGNS.forEach((c, i) => S.campaigns.push({
      id: 'camp_' + (i + 1), created_at: dAgo(60 - i * 7), updated_at: dAgo(rnd(1, 9)),
      title: c[0] + ' [DEMO]', program_id: 'prog_' + (c[1] + 1), fund_type: c[2], target: c[3],
      ends_at: dAgo(-c[4]), short_desc: c[5], image: U.placeholder('KAMPANYE', 800, 500, i + 3),
      status: 'aktif', slug: 'kampanye-' + (i + 1)
    }));

    /* ---------- DONATUR ---------- */
    const DONORS = [
      ['Budi Kurniawan', 'donor1@mail.com', '081234500001', true],
      ['Sari Wulandari', 'sari.wulandari@mail.com', '081234500002', true],
      ['Agus Setiawan', 'agus.setiawan@mail.com', '081234500003', true],
      ['Rina Marlina', 'rina.marlina@mail.com', '081234500004', false],
      ['Hendra Gunawan', 'hendra.gunawan@mail.com', '081234500005', false],
      ['Maya Sari', 'maya.sari@mail.com', '081234500006', false],
      ['Fajar Nugraha', 'fajar.nugraha@mail.com', '081234500007', true],
      ['Lestari Handayani', 'lestari.h@mail.com', '081234500008', false]
    ];
    DONORS.forEach((d, i) => S.donors.push({
      id: 'don_' + (i + 1), created_at: dAgo(180 - i * 12), updated_at: dAgo(rnd(1, 30)),
      name: d[0], email: d[1], phone: d[2], password_hash: window.__hash ? window.__hash('Donatur@123') : 'DEMO-HASH',
      address: '', verified: d[3], status: 'aktif', notes: ''
    }));

    /* ---------- DONASI + TRANSAKSI + KUITANSI (konsisten) ---------- */
    // [daysAgo, donorIdx(-1=anonim), fund, progIdx(-1=tanpa program), amount, method, status]
    const ROWS = [
      [176, 0, 'zakat', 0, 5000000, 'bca_va', 'berhasil'],
      [173, 1, 'infak', 6, 1000000, 'qris', 'berhasil'],
      [169, 2, 'sedekah', 5, 250000, 'gopay', 'berhasil'],
      [166, 3, 'wakaf', 4, 2000000, 'bni_va', 'berhasil'],
      [161, -1, 'zakat', 3, 1500000, 'bri_va', 'berhasil'],
      [152, 0, 'zakat', 0, 2500000, 'bca_va', 'berhasil'],
      [147, 4, 'sosial', 2, 5000000, 'mandiri_va', 'berhasil'],
      [142, 5, 'infak', 6, 750000, 'qris', 'berhasil'],
      [137, 1, 'sedekah', 5, 300000, 'ovo', 'berhasil'],
      [131, 2, 'zakat', 0, 3200000, 'bca_va', 'berhasil'],
      [126, -1, 'sosial', 2, 1000000, 'qris', 'berhasil'],
      [121, 3, 'wakaf', 4, 5000000, 'bni_va', 'berhasil'],
      [116, 6, 'zakat', 3, 1000000, 'qris', 'berhasil'],
      [111, 0, 'infak', 6, 500000, 'gopay', 'berhasil'],
      [106, 7, 'sedekah', 5, 150000, 'dana', 'berhasil'],
      [101, 1, 'zakat', 0, 7500000, 'bca_va', 'berhasil'],
      [96, 2, 'sosial', 2, 2500000, 'bri_va', 'berhasil'],
      [91, 3, 'infak', 6, 1200000, 'qris', 'berhasil'],
      [86, 4, 'wakaf', 4, 3500000, 'bni_va', 'berhasil'],
      [81, 5, 'zakat', 0, 2000000, 'bca_va', 'berhasil'],
      [76, 6, 'sedekah', 5, 500000, 'gopay', 'berhasil'],
      [71, 0, 'sosial', 2, 10000000, 'mandiri_va', 'berhasil'],
      [66, 7, 'infak', 6, 800000, 'qris', 'berhasil'],
      [61, 1, 'zakat', 3, 1500000, 'ovo', 'berhasil'],
      [56, 2, 'zakat', 0, 5000000, 'bca_va', 'berhasil'],
      [51, 3, 'sedekah', 5, 200000, 'dana', 'berhasil'],
      [46, 4, 'infak', 6, 1000000, 'qris', 'berhasil'],
      [41, 5, 'wakaf', 4, 2000000, 'bni_va', 'berhasil'],
      [36, 6, 'zakat', 3, 3000000, 'bri_va', 'berhasil'],
      [33, -1, 'sosial', 2, 2500000, 'qris', 'berhasil'],
      [26, 7, 'zakat', 0, 4500000, 'bca_va', 'berhasil'],
      [21, 0, 'infak', 6, 600000, 'gopay', 'berhasil'],
      [16, 1, 'sedekah', 5, 350000, 'ovo', 'berhasil'],
      [11, 2, 'sosial', 2, 5000000, 'mandiri_va', 'berhasil'],
      [8, 3, 'zakat', 0, 1000000, 'qris', 'berhasil'],
      [6, 4, 'wakaf', 4, 1000000, 'bni_va', 'berhasil'],
      [4, 5, 'infak', 6, 250000, 'qris', 'berhasil'],
      [2, 6, 'zakat', 3, 750000, 'bca_va', 'berhasil'],
      [23, 7, 'sosial', 2, 150000, 'qris', 'menunggu'],
      [1, 0, 'zakat', 0, 500000, 'gopay', 'menunggu'],
      [0, 1, 'infak', 6, 300000, 'qris', 'menunggu'],
      [13, 1, 'infak', 6, 500000, 'ovo', 'kedaluwarsa'],
      [19, 2, 'sedekah', 5, 100000, 'dana', 'gagal'],
      [24, 3, 'zakat', 0, 2000000, 'bca_va', 'dibatalkan']
    ];
    const MESSAGES = ['Semoga bermanfaat untuk umat', 'Bismillah, semoga menjadi amal jariyah', 'Untuk saudara kita yang membutuhkan', 'Barakallahu fiikum', '', 'Semoga cepat dipulihkan'];
    // donasi rutin donor 0
    S.recurring_donations.push({
      id: 'rec_1', created_at: dAgo(152), donor_id: 'don_1', donor_name: 'Budi Kurniawan', email: 'donor1@mail.com',
      fund_type: 'zakat', program_id: 'prog_1', amount: 500000, method_code: 'bca_va', status: 'aktif',
      start_date: dAgo(152), next_charge: dAgo(-9), note: 'Zakat penghasilan bulanan [DEMO]'
    });
    const sorted = [...ROWS].sort((a, b) => b[0] - a[0]);
    const monthReceiptCount = {};
    sorted.forEach((r, idx) => {
      const [d, di, fund, pi, amount, method, status] = r;
      const created = dAgo(d);
      const donor = di >= 0 ? S.donors[di] : null;
      const anon = di < 0;
      const unique = rnd(101, 999);
      const don = {
        id: U.uid(), created_at: created, updated_at: created,
        donation_code: '', donor_id: anon ? null : donor.id,
        donor_name: anon ? 'Hamba Allah' : donor.name, donor_email: anon ? '' : donor.email,
        donor_phone: anon ? '' : donor.phone, is_anonymous: anon,
        fund_type: fund, program_id: pi >= 0 ? 'prog_' + (pi + 1) : null,
        campaign_id: null, amount, unique_code: unique, total_amount: amount + unique,
        payment_method_code: method, status, message: MESSAGES[idx % MESSAGES.length],
        donation_type: (di === 0 && fund === 'zakat' && amount === 2500000) ? 'bulanan' : 'sekali',
        recurring_id: (di === 0 && fund === 'zakat' && amount === 2500000) ? 'rec_1' : null,
        payment_deadline: new Date(new Date(created).getTime() + 86400000).toISOString(),
        paid_at: status === 'berhasil' ? new Date(new Date(created).getTime() + rnd(5, 800) * 60000).toISOString() : null
      };
      don.donation_code = '';
      S.donations.push(don);
      // nomor berdasarkan urutan waktu (indeks pada array yang sudah tersusun)
      const dnum = S.donations.length;
      const dd = new Date(created);
      don.donation_code = `DN${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}${String(dd.getDate()).padStart(2, '0')}-${String(dnum).padStart(4, '0')}`;

      const trx = {
        id: U.uid(), created_at: created, updated_at: created,
        trx_code: `TRX${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}${String(dd.getDate()).padStart(2, '0')}-${String(dnum).padStart(4, '0')}`,
        donation_id: don.id, donation_code: don.donation_code,
        amount: don.total_amount, method_code: method, provider: status === 'berhasil' ? (method.includes('va') ? 'bank_transfer' : method) : '—',
        status, va_number: method.includes('va') ? '88' + String(rnd(10, 99)) + String(1000000000 + Math.floor(Math.random() * 8999999999)) : '',
        paid_at: don.paid_at, expires_at: don.payment_deadline,
        reconciled: status === 'berhasil' && d > 40, reconciled_at: status === 'berhasil' && d > 40 ? dAgo(d - 2) : null, reconciled_note: status === 'berhasil' && d > 40 ? 'Cocok dengan mutasi rekening' : '',
        provider_reference: status === 'berhasil' ? 'WEBHOOK-SEED-' + String(dnum).padStart(4, '0') : ''
      };
      S.payment_transactions.push(trx);

      if (status === 'berhasil') {
        const ym = `${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}`;
        monthReceiptCount[ym] = (monthReceiptCount[ym] || 0) + 1;
        const rno = String(monthReceiptCount[ym]).padStart(4, '0');
        S.receipts.push({
          id: U.uid(), created_at: don.paid_at,
          receipt_no: `RCPT-${ym}-${rno}`, donation_id: don.id, trx_code: trx.trx_code,
          amount: don.amount, fund_type: fund, program_name: pi >= 0 ? S.programs[pi].name : 'Dana Umum',
          donor_name: don.donor_name, method: method, issued_at: don.paid_at
        });
        S.financial_transactions.push({
          id: U.uid(), created_at: don.paid_at, trx_type: 'donasi', direction: 'masuk',
          fund_type: fund, category_code: 'IN-' + fund.toUpperCase(),
          amount: don.amount, ref_code: don.donation_code,
          description: `Donasi ${U.fundLabel(fund)} — ${don.donor_name} (${don.donation_code})`,
          trx_date: don.paid_at, status: 'berhasil'
        });
      }
    });

    /* ---------- PENERIMA MANFAAT (data sensitif — tampil termasking) ---------- */
    [
      ['Aisyah Putri', '3275012345670001', '081234567001', 'Jl. Melati No. 12, Jaktim', 'Anak Yatim', 'Biaya pendidikan & sandang pangan', 0, true],
      ['Keluarga Bpk. Sumarno', '3175023456780002', '081234567002', 'Kampung Melayu, Jaktim', 'Dhuafa', 'Bantuan pangan rutin & perbaikan rumah', 6, true],
      ['Bpk. Abdul Karim', '3175034567890003', '081234567003', 'Pasar Minggu, Jaksel', 'Lansia', 'Biaya pengobatan rutin', 1, true],
      ['Penyintas Banjir Kampung Melayu', '3175045678900004', '081234567004', 'Bara 2, Jaktim', 'Korban Bencana', 'Hunian sementara & modal usaha', 2, false],
      ['Ibu Rohmah', '3175056789010005', '081234567005', 'Cibubur, Jabar', 'Usaha Mikro / Asnaf', 'Modal warung makan', 3, true]
    ].forEach((b, i) => S.beneficiaries.push({
      id: 'ben_' + (i + 1), created_at: dAgo(120 - i * 10), updated_at: dAgo(rnd(1, 15)),
      name: b[0], nik: b[1], phone: b[2], address: b[3], category: b[4],
      needs: b[5], program_id: 'prog_' + (b[6] + 1), photo_consent: b[7], status: 'aktif', data_masked: true
    }));

    /* ---------- PENYALURAN DANA (alur persetujuan) ---------- */
    const dstDate = d => { const dd = new Date(dAgo(d)); return `${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}`; };
    const DIST = [
      ['DST-' + dstDate(70) + '-001', 0, 'zakat', 'prog_1', 'ben_1', 20000000, 'selesai', 70, 'Penyaluran beasiswa semester ganjil untuk 45 anak yatim & dhuafa', 62, 'Berita acara & foto penyaluran terlampir', 55, 'Laporan akhir penyaluran beasiswa telah diverifikasi oleh pengawas syariah.'],
      ['DST-' + dstDate(45) + '-002', 2, 'sosial', 'prog_2', 'ben_3', 15000000, 'disalurkan', 45, 'Operasional klinik sehat gratis kuartal III: obat & tenaga medis', 40, 'Kwitansi pembelian obat & daftar hadir lansia', null, ''],
      ['DST-' + dstDate(3) + '-003', 6, 'infak', 'prog_6', 'ben_2', 4000000, 'disetujui', 3, 'Bahan pangan dapur gizi bulan ini (1.200 porsi)', null, '', null, ''],
      ['DST-' + dstDate(2) + '-004', 4, 'wakaf', 'prog_4', 'ben_5', 8000000, 'diverifikasi', 2, 'Pembangunan sumur wakaf tahap 1 — Desa Sukamaju', null, '', null, ''],
      ['DST-' + dstDate(0) + '-005', 5, 'sedekah', 'prog_5', 'ben_2', 1000000, 'diajukan', 0, 'Santunan paket sembako 20 keluarga fakir miskin', null, '', null, '']
    ];
    DIST.forEach(d => {
      S.distributions.push({
        id: U.uid(), created_at: dAgo(d[7]), updated_at: dAgo(d[7]),
        dist_number: d[0], program_id: d[3], fund_type: d[2], beneficiary_id: d[4],
        amount: d[5], status: d[6], description: d[8],
        proof_file: d[10] ? U.placeholder('BUKTI PENYALURAN', 640, 400, 6) : '',
        report_note: d[12] || '', requested_by: 'Andi Pratama',
        verified_by: ['diverifikasi', 'disetujui', 'disalurkan', 'selesai'].includes(d[6]) ? 'Rudi Hartono' : '',
        approved_by: ['disetujui', 'disalurkan', 'selesai'].includes(d[6]) ? 'Ahmad Fauzi' : '',
        disbursed_at: d[9] ? dAgo(d[9]) : null,
        finished_at: d[11] ? dAgo(d[11]) : null
      });
    });
    // transaksi keuangan pengeluaran untuk yang sudah disalurkan
    S.distributions.filter(x => ['disalurkan', 'selesai'].includes(x.status)).forEach(x => {
      S.financial_transactions.push({
        id: U.uid(), created_at: x.disbursed_at || x.updated_at, trx_type: 'penyaluran', direction: 'keluar',
        fund_type: x.fund_type, category_code: 'OUT-' + x.fund_type.toUpperCase(),
        amount: x.amount, ref_code: x.dist_number, description: `Penyaluran ${U.fundLabel(x.fund_type)} — ${x.description}`,
        trx_date: x.disbursed_at || x.updated_at, status: 'berhasil'
      });
    });

    /* ---------- REKENING & KATEGORI KEUANGAN ---------- */
    S.financial_accounts.push(
      { id: U.uid(), created_at: dAgo(200), acc_code: 'BANK-BCA', name: 'Bank BCA — Operasional', type: 'bank', bank_name: 'BCA', number: '1234567890', balance: 0, status: 'aktif' },
      { id: U.uid(), created_at: dAgo(200), acc_code: 'BANK-BNI', name: 'Bank BNI Syariah — ZISWAF', type: 'bank', bank_name: 'BNI Syariah', number: '9876543210', balance: 0, status: 'aktif' },
      { id: U.uid(), created_at: dAgo(200), acc_code: 'KAS-01', name: 'Kas Kecil Yayasan', type: 'cash', bank_name: '', number: '-', balance: 0, status: 'aktif' }
    );
    ['zakat', 'infak', 'sedekah', 'wakaf', 'sosial'].forEach(f => {
      S.financial_categories.push({ id: U.uid(), created_at: dAgo(200), code: 'IN-' + f.toUpperCase(), name: 'Pemasukan ' + U.fundLabel(f), fund_type: f, direction: 'masuk', status: 'aktif' });
      S.financial_categories.push({ id: U.uid(), created_at: dAgo(200), code: 'OUT-' + f.toUpperCase(), name: 'Penyaluran ' + U.fundLabel(f), fund_type: f, direction: 'keluar', status: 'aktif' });
    });

    /* ---------- LAPORAN KEUANGAN (untuk halaman transparansi) ---------- */
    const q3 = S.financial_transactions.filter(t => new Date(t.trx_date) >= new Date(dAgo(100)) && new Date(t.trx_date) <= new Date(dAgo(10)));
    const q3in = q3.filter(t => t.direction === 'masuk').reduce((s, t) => s + t.amount, 0);
    const q3out = q3.filter(t => t.direction === 'keluar').reduce((s, t) => s + t.amount, 0);
    S.financial_reports.push(
      { id: U.uid(), created_at: dAgo(20), report_code: 'LAP-Q3-2026', title: 'Laporan Keuangan Triwulan III 2026 [DEMO]', period: 'Triwulan III', year: 2026, total_in: q3in, total_out: q3out, status: 'disetujui', note: 'Telah diperiksa auditor internal.', approved_at: dAgo(18), approved_by: 'Hendra Wijaya, Ak.' },
      { id: U.uid(), created_at: dAgo(2), report_code: 'LAP-Q4-DRAFT', title: 'Laporan Keuangan Triwulan IV 2026 (Draf) [DEMO]', period: 'Triwulan IV', year: 2026, total_in: 0, total_out: 0, status: 'draf', note: 'Masih dalam penyusunan.', approved_at: null, approved_by: '' }
    );

    /* ---------- BERITA ---------- */
    [
      ['Penyaluran Beasiswa Semester Ganjil TA 2026/2027 Dimulai', 'Kegiatan', 3, 'Alhamdulillah, sebanyak 45 anak yatim dan putra dari keluarga dhuafa menerima pencairan beasiswa semester ganjil tahun ajaran 2026/2027.',
        'Penyaluran beasiswa dilaksanakan serentak di tiga wilayah binaan. Setiap penerima manfaat menerima biaya pendidikan, perlengkapan sekolah, serta mengikuti kelas mentoring pekanan yang diselenggarakan bersama relawan.\n\nKetua yayasan dalam sambutannya menyampaikan terima kasih kepada seluruh donatur: "Setiap rupiah yang Anda titipkan di amanah kami, kami kelola dan laporkan dengan sebaik-baiknya. Ini bukan bantuan sekali jalan — ini investasi generasi."\n\nSeluruh berita acara penyaluran dan foto kegiatan (dengan izin penerima manfaat) dapat diakses pada halaman Galeri. Laporan penggunaan dana program Beasiswa Pendidikan dapat dipantau pada halaman Transparansi.'],
      ['Klinik Sehat Gratis Melayani 300+ Lansia di Jakarta Timur', 'Kegiatan', 12, 'Layanan pemeriksaan kesehatan gratis untuk lansia dhuafa kembali membuka pendaftaran dengan dukungan relawan medis.',
        'Pada Jumat pekan ini, klinik sehat yayasan melayani lebih dari 300 lansia dengan layanan pemeriksaan umum, cek gula darah dan tekanan darah, konsultasi gizi, hingga pembagian obat gratis.\n\nProgram ini berjalan setiap pekan dan dibiayai penuh dari dana sosial yang diamanahkan donatur. Tim medis terdiri dari dokter umum, perawat, dan mahasiswa kefarmasian yang menjadi relawan tetap.\n\nBagi donatur yang ingin mensponsori operasional klinik, silakan kunjungi halaman Program dan pilih "Klinik Sehat Gratis untuk Lansia".'],
      ['Laporan Transparansi Triwulan III 2026 Telah Terbit', 'Laporan', 20, 'Laporan keuangan triwulan III telah disahkan auditor internal dan kini dapat diunduh publik.',
        'Sesuai komitmen transparansi, yayasan menerbitkan laporan keuangan triwulan III 2026 yang mencakup rincian penerimaan per jenis dana (zakat, infak, sedekah, wakaf, dan dana sosial), penyaluran per program, serta saldo dana.\n\nLaporan telah melalui proses pemeriksaan auditor internal dan disahkan pada rapat pengurus. File laporan dapat diunduh pada halaman Transparansi.\n\nKami mengundang seluruh donatur untuk terus mengawasi pengelolaan dana umat dan menyampaikan masukan melalui kanal resmi yang tersedia.'],
      ['500 Paket Pangan Disalurkan untuk Penyintas Bencana', 'Kegiatan', 28, 'Tim tanggap bencana menyalurkan 500 paket pangan siap masak dan 200 selimut bagi penyintas bencana.',
        'Dalam 1×24 jam sejak kabar bencana diterima, tim respon cepat yayasan bergerak ke lokasi membawa 500 paket pangan siap masak, 200 selimut, dan mendirikan dapur umum yang melayani tiga kali makan per hari.\n\nFase tanggap darurat telah selesai dan saat ini memasuki fase pemulihan: trauma healing untuk anak-anak dan bantuan modal usaha bagi kepala keluarga penyintas.\n\nSeluruh donasi kampanye "Relief Bencana Alam Nusantara" dicatat terpisah dan hanya digunakan untuk keperluan penanganan bencana sesuai amanah donatur.']
    ].forEach((n, i) => S.news.push({
      id: 'news_' + (i + 1), created_at: dAgo(n[2]), updated_at: dAgo(n[2]),
      title: n[0] + ' [DEMO]', category: n[1], excerpt: n[3], content: n[4],
      author: i % 2 ? 'Siti Rahma' : 'Dewi Lestari', image: U.placeholder('BERITA', 800, 460, i + 5),
      published: true, views: rnd(120, 2400)
    }));

    /* ---------- GALERI ---------- */
    [
      ['Penyaluran beasiswa semester ganjil', 'Kegiatan', true],
      ['Dapur gizi menyiapkan 1.000 porsi makanan', 'Kegiatan', true],
      ['Klinik sehat gratis untuk lansia', 'Kesehatan', true],
      ['Distribusi paket pangan korban bencana', 'Bantuan Bencana', true],
      ['Wakaf sumur air bersih desa Sukamaju', 'Wakaf', true],
      ['Santunan anak yatim Jumat berkah', 'Sosial & Keagamaan', true]
    ].forEach((g, i) => S.galleries.push({
      id: 'gal_' + (i + 1), created_at: dAgo(80 - i * 9), title: g[0] + ' [DEMO]', category: g[1],
      image: U.placeholder('GALERI', 640, 420, i + 1), consent: g[2], status: 'aktif'
    }));

    /* ---------- TESTIMONI ---------- */
    [
      ['Aisyah Putri', 'Penerima Beasiswa', 'Alhamdulillah, berkat program beasiswa saya bisa terus bersekolah sampai lulus SMA dan sekarang melanjutkan kuliah. Terima kasih para donatur, doa terbaik untuk kalian semua.', true],
      ['Ibu Rohmah', 'Penerima Modal Usaha', 'Modal usaha dari yayasan mengubah hidup keluarga kami. Warung kecil yang dulu hanya untung sedikit, sekarang bisa menyekolahkan anak saya sampai SMA.', true],
      ['Hj. Fatimah', 'Donatur Tetap', 'Saya rutin menitipkan zakat penghasilan lewat yayasan karena sistemnya transparan — setiap ada penyaluran, laporannya jelas dan bisa saya cek sendiri.', true]
    ].forEach((t, i) => S.testimonials.push({
      id: 'tst_' + (i + 1), created_at: dAgo(60 - i * 15), name: t[0], role: t[1], quote: t[2],
      approved: t[3], photo_consent: true, status: t[3] ? 'disetujui' : 'menunggu'
    }));

    /* ---------- FAQ (6 pertanyaan) ---------- */
    [
      ['Bagaimana cara berdonasi melalui website ini?', 'Pilih program atau buka halaman Donasi, tentukan jumlah dan jenis dana (zakat/infak/sedekah/wakaf), isi data diri (atau pilih donasi anonim), lalu selesaikan pembayaran melalui Virtual Account, QRIS, atau e-wallet. Kuitansi otomatis terbit setelah pembayaran terverifikasi.'],
      ['Apakah pembayaran saya aman?', 'Ya. Seluruh transaksi diproses melalui payment gateway resmi dengan enkripsi dan status pembayaran hanya diperbarui setelah konfirmasi webhook terverifikasi dari penyedia pembayaran — bukan sekadar halaman konfirmasi. Data pribadi Anda dilindungi dan tidak dibagikan.'],
      ['Kapan kuitansi donasi terbit dan bagaimana mendapatkannya?', 'Kuitansi terbit otomatis seketika setelah pembayaran Anda terverifikasi (status Berhasil). Anda dapat mengunduhnya dari halaman status donasi, dari email/WhatsApp notifikasi, atau dari Area Donatur bila Anda memiliki akun.'],
      ['Apakah donasi saya bisa dibatalkan atau dikembalikan?', 'Donasi yang sudah berhasil disalurkan tidak dapat dikembalikan. Namun transaksi yang masih menunggu pembayaran dapat dibatalkan, dan pembayaran yang terlanjur masuk karena kekeliruan dapat diajukan pengembalian dengan menghubungi kami melalui WhatsApp resmi maksimal 3×24 jam.'],
      ['Bagaimana saya bisa memantau penggunaan dana yang saya donasikan?', 'Halaman Transparansi memuat saldo per jenis dana, seluruh penyaluran yang telah dilakukan, dan laporan keuangan berkala yang telah disahkan. Data diambil langsung dari transaksi terverifikasi pada sistem — bukan angka manual.'],
      ['Bagaimana cara menjadi relawan atau mengajukan bantuan?', 'Untuk menjadi relawan, hubungi kami melalui tombol WhatsApp yang tersedia. Pengajuan bantuan (mustahik) dapat diajukan oleh tokoh masyarakat, RT/RW, atau pihak lembaga dengan membawa data pendukung; tim kami akan melakukan verifikasi lapangan.']
    ].forEach((f, i) => S.faqs.push({ id: 'faq_' + (i + 1), created_at: dAgo(200), question: f[0], answer: f[1], order: i + 1, status: 'aktif' }));

    /* ---------- LAINNYA ---------- */
    [
      ['Bapak Darmawan', 'darmawan@mail.com'], ['Umi Kulsum', 'umi.k@mail.com'], ['Reza Fahlevi', 'reza.f@mail.com']
    ].forEach(s => S.newsletter_subscribers.push({ id: U.uid(), created_at: dAgo(rnd(2, 40)), email: s[1], name: s[0], status: 'aktif' }));

    S.notifications.push(
      { id: U.uid(), created_at: dAgo(0.2), title: 'Donasi baru menunggu pembayaran', desc: 'Donasi infak Rp 300.000 menunggu konfirmasi pembayaran.', type: 'donasi', target_role: 'admin_donasi', read: false },
      { id: U.uid(), created_at: dAgo(0.5), title: 'Pengajuan penyaluran baru', desc: 'DST-…-005 (sedekah Rp 1.000.000) menunggu verifikasi keuangan.', type: 'penyaluran', target_role: 'admin_keuangan', read: false }
    );
    S.audit_logs.push({ id: U.uid(), created_at: dAgo(0.9), user: 'Sistem', role: '-', action: 'system.seed', entity: 'database', entity_id: '-', old_values: null, new_values: null, note: 'Inisialisasi data demo (MODE DEMO aktif)' });

    /* ---------- LAPORAN BULANAN (newsletter internal) ---------- */
    S.newsletters.push({ id: U.uid(), created_at: dAgo(30), title: 'Buletin Ramadhan: Rekap Donasi & Penyaluran', body: 'Bismillah, berikut rekap aktivitas filantropi bulan ini…', status: 'draf', sent_at: null });
  }

  /* ============================================================
     HELPER DOMAIN
     ============================================================ */
  const programRaised = pid => db.donations.filter(d => d.program_id === pid && d.status === 'berhasil').reduce((s, d) => s + d.amount, 0);
  const fundIncome = fund => db.financial_transactions.filter(t => t.fund_type === fund && t.direction === 'masuk' && t.status === 'berhasil').reduce((s, t) => s + t.amount, 0);
  const fundSpent = fund => db.financial_transactions.filter(t => t.fund_type === fund && t.direction === 'keluar' && t.status === 'berhasil').reduce((s, t) => s + t.amount, 0);
  const fundBalance = fund => fundIncome(fund) - fundSpent(fund);
  const fundBalances = () => { const o = {}; Object.keys(U.FUNDS).forEach(f => o[f] = fundBalance(f)); return o; };

  function stats() {
    const now = new Date();
    const sumDon = from => db.donations.filter(d => d.status === 'berhasil' && (!from || new Date(d.paid_at) >= from)).reduce((s, d) => s + d.amount, 0);
    const distributed = db.distributions.filter(x => ['disalurkan', 'selesai'].includes(x.status)).reduce((s, x) => s + x.amount, 0);
    return {
      today: sumDon(new Date(now.getFullYear(), now.getMonth(), now.getDate())),
      month: sumDon(new Date(now.getFullYear(), now.getMonth(), 1)),
      year: sumDon(new Date(now.getFullYear(), 0, 1)),
      total: sumDon(null),
      donors: db.donors.length, programs: db.programs.filter(p => p.status === 'aktif').length,
      distributed, balances: fundBalances(),
      pending: db.donations.filter(d => d.status === 'menunggu').length,
      beneficiaries: db.beneficiaries.length
    };
  }
  function monthlySeries(n = 12) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const from = new Date(d.getFullYear(), d.getMonth(), 1), to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const v = db.donations.filter(x => x.status === 'berhasil' && new Date(x.paid_at) >= from && new Date(x.paid_at) < to).reduce((s, x) => s + x.amount, 0);
      arr.push({ label: d.toLocaleDateString('id-ID', { month: 'short' }), value: v });
    }
    return arr;
  }
  function fundSeries() {
    return Object.keys(U.FUNDS).map(f => ({ label: U.fundLabel(f), value: fundIncome(f), color: U.FUNDS[f].color }));
  }

  /* ---------- KEDALUWARSA OTOMATIS (24 jam) ---------- */
  function expireStale() {
    let n = 0;
    db.payment_transactions.filter(t => t.status === 'menunggu' && t.expires_at && new Date(t.expires_at) < new Date()).forEach(t => {
      update('payment_transactions', t.id, { status: 'kedaluwarsa' });
      const don = get('donations', t.donation_id);
      if (don && don.status === 'menunggu') update('donations', don.id, { status: 'kedaluwarsa' });
      audit('system.auto_expire', 'payment_transactions', t.id, null, null, 'Kedaluwarsa otomatis (batas waktu pembayaran 24 jam terlampaui)');
      n++;
    });
    return n;
  }

  /* ---------- PIPELINE KEBERHASILAN PEMBAYARAN ----------
     SATU-SATUNYA jalur status menjadi "berhasil":
     1) webhookSuccess()  — dari webhook payment gateway yang terverifikasi
        (pada mode demo: simulasi bertanda DEMO),
     2) manualConfirm()   — konfirmasi manual hasil rekonsiliasi bank oleh
        admin berwenang, WAJIB mencatat audit trail.
     Menerbitkan kuitansi otomatis + transaksi keuangan + notifikasi. */
  function finalizeSuccess(trx, providerRef, auditAction, note) {
    const now = NOW();
    const don = get('donations', trx.donation_id);
    update('payment_transactions', trx.id, { status: 'berhasil', paid_at: now, provider_reference: providerRef });
    if (don) update('donations', don.id, { status: 'berhasil', paid_at: now });
    let rcpt = one('receipts', r => r.donation_id === trx.donation_id);
    if (!rcpt && don) {
      const dd = new Date();
      const ym = `${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, '0')}`;
      const nn = db.receipts.filter(r => (r.receipt_no || '').startsWith('RCPT-' + ym)).length + 1;
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
    notify('Pembayaran donasi berhasil', `Donasi ${don ? don.donation_code : ''} sebesar ${U.fmtRp(don ? don.total_amount : 0)} telah terverifikasi via webhook.`, 'donasi', null);
    /* Tahap 2: antrekan notifikasi WhatsApp & Email kuitansi otomatis */
    if (window.WA && don && rcpt) { try { WA.queueDonationSuccess(don, rcpt); } catch (e) { console.warn('WA queue gagal', e); } }
    audit(auditAction, 'payment_transactions', trx.id, { status: 'menunggu' }, { status: 'berhasil' }, note || '');
    return { ok: true, trx: get('payment_transactions', trx.id), donation: don, receipt: rcpt };
  }

  function webhookSuccess(ref, meta = {}) {
    let trx = one('payment_transactions', t => t.trx_code === ref);
    if (!trx) {
      const donByCode = one('donations', d => d.donation_code === ref);
      if (donByCode) trx = one('payment_transactions', t => t.donation_id === donByCode.id);
    }
    if (!trx) return { ok: false, message: 'Kode transaksi tidak ditemukan.' };
    if (trx.status === 'berhasil') return { ok: false, message: 'Transaksi ini sudah berstatus Berhasil.' };
    if (trx.status !== 'menunggu') return { ok: false, message: 'Transaksi sudah berstatus ' + ((U.STATUSES[trx.status] || {}).label || trx.status) + ' dan tidak dapat diproses.' };
    if (!db.institution_settings.demo_mode && !meta.fromServer) return { ok: false, message: 'Simulasi pembayaran hanya tersedia pada MODE DEMO. Di produksi, status hanya berubah melalui webhook payment gateway yang terverifikasi.' };
    return finalizeSuccess(trx, 'WEBHOOK-DEMO-' + U.uid().slice(0, 8).toUpperCase(), 'webhook.payment_success',
      meta.note || 'Simulasi webhook (MODE DEMO). Di produksi, status HANYA diubah oleh webhook payment gateway yang terverifikasi.');
  }

  function manualConfirm(trxId, note) {
    const trx = get('payment_transactions', trxId);
    if (!trx) return { ok: false, message: 'Transaksi tidak ditemukan.' };
    if (trx.status !== 'menunggu') return { ok: false, message: 'Hanya transaksi Menunggu Pembayaran yang dapat dikonfirmasi manual.' };
    return finalizeSuccess(trx, 'MANUAL-' + U.uid().slice(0, 8).toUpperCase(), 'transaction.manual_confirm',
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

  /* ---------- AUDIT & NOTIFIKASI ---------- */
  function audit(action, entity, entity_id, old_values, new_values, note) {
    /* guard typeof: Auth adalah `const` global (tidak menjadi window.Auth) */
    const adm = (typeof Auth !== 'undefined') ? Auth.currentAdmin() : null;
    return insert('audit_logs', {
      user: adm ? adm.name : 'Sistem', role: adm ? adm.role_label : '-', user_id: adm ? adm.id : null,
      action, entity, entity_id: entity_id || '-',
      old_values: old_values ? JSON.stringify(old_values) : null,
      new_values: new_values ? JSON.stringify(new_values) : null, note: note || ''
    });
  }
  const notify = (title, desc, type, target_role) => insert('notifications', { title, desc, type, target_role: target_role || null, read: false });
  const unreadNotifications = roleKey => db.notifications.filter(n => !n.read && (!n.target_role || n.target_role === roleKey)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  /* ---------- BACKUP ---------- */
  const exportAll = () => JSON.parse(JSON.stringify(db));
  function importAll(data) { if (!data || data.__version !== VERSION) return false; db = data; save(); return true; }
  function resetDemo() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }

  return {
    KEY, get db() { return db; }, load, save, all, get, find, one, insert, update, remove,
    settings, zakat, setSettings, setZakat, code, codeMonth,
    programRaised, fundIncome, fundSpent, fundBalance, fundBalances, stats, monthlySeries, fundSeries,
    expireStale, webhookSuccess, manualConfirm, failTransaction,
    audit, notify, unreadNotifications, exportAll, importAll, resetDemo
  };
})();
