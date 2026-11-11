'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — ADMIN DASHBOARD
   Modul: Dashboard, Program, Kampanye, Donatur, Transaksi,
   Penyaluran Dana, Penerima Manfaat, Laporan Keuangan, Konten,
   Pengguna & Peran (RBAC), Pengaturan Sistem, Audit Trail.
   ============================================================ */
const AdminApp = (() => {
  const root = () => document.getElementById('admin-root');
  const pg = () => document.getElementById('page');

  const MENU = [
    ['UTAMA', [['/dashboard', 'Dashboard', 'chart', 'dashboard.view'], ['/program', 'Program', 'layers', 'programs.view'], ['/kampanye', 'Kampanye', 'target', 'campaigns.view']]],
    ['DONASI & KEUANGAN', [['/donatur', 'Donatur', 'users', 'donors.view'], ['/transaksi', 'Transaksi', 'wallet', 'transactions.view'], ['/penyaluran', 'Penyaluran Dana', 'send', 'distributions.view'], ['/penerima', 'Penerima Manfaat', 'heart', 'beneficiaries.view'], ['/keuangan', 'Laporan Keuangan', 'file', 'finance.view']]],
    ['KONTEN & SISTEM', [['/konten', 'Konten Website', 'image', 'content.view'], ['/pengguna', 'Pengguna & Peran', 'shield', 'users.view'], ['/pengaturan', 'Pengaturan Sistem', 'settings', 'settings.view'], ['/wa-outbox', 'Outbox WhatsApp', 'send', 'outbox.view'], ['/audit', 'Audit Trail', 'activity', 'audit.view']]]
  ];
  const TITLES = { '/login': 'Masuk', '/dashboard': 'Dashboard Utama', '/program': 'Manajemen Program', '/kampanye': 'Manajemen Kampanye', '/donatur': 'Manajemen Donatur', '/transaksi': 'Manajemen Transaksi', '/penyaluran': 'Manajemen Penyaluran Dana', '/penerima': 'Penerima Manfaat', '/keuangan': 'Laporan Keuangan', '/konten': 'Manajemen Konten Website', '/pengguna': 'Pengguna & Peran (RBAC)', '/pengaturan': 'Pengaturan Sistem', '/wa-outbox': 'Outbox WhatsApp & Email', '/audit': 'Audit Trail' };

  function parseHash() {
    let h = location.hash.slice(1) || '/dashboard';
    if (!h.startsWith('/')) h = '/' + h;
    const parts = h.split('?');
    return { path: parts[0] || '/dashboard', params: new URLSearchParams(parts[1] || '') };
  }
  const tbl = (heads, rows) => `<div class="table-wrap"><table class="tbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const statCard = (label, value, ic, bg, color) => `<div class="stat-card"><div class="sc-icon" style="background:${bg};color:${color}">${U.icon(ic, 20)}</div><div><b>${value}</b><span>${label}</span></div></div>`;
  const deny = () => { pg().innerHTML = `<div class="panel"><div class="panel-body"><div class="empty"><div class="eicon">🚫</div><b>Akses ditolak</b><p class="hint" style="margin-top:6px">Peran Anda tidak memiliki izin untuk modul ini. Hubungi Super Admin bila diperlukan.</p></div></div></div>`; };
  const num = sel => Number((U.$(sel) || {}).value) || 0;
  const val = sel => ((U.$(sel) || {}).value || '').trim();

  /* ---------- ROUTER ---------- */
  function route() {
    DB.load();
    const u = Auth.currentAdmin();
    const { path, params } = parseHash();
    if (!u && path !== '/login') { location.hash = '#/login'; return; }
    if (u && path === '/login') { location.hash = '#/dashboard'; return; }
    const found = [['/login', pageLogin], ...MENU.flatMap(g => g[1].map(m => [m[0], PAGES[m[0]]]))].find(r => r[0] === path);
    if (!found) return page404();
    if (u) renderLayout(u, path);
    const perm = (MENU.flatMap(g => g[1]).find(m => m[0] === path) || [])[3];
    if (u && perm && !Auth.can(perm, u)) return deny();
    found[1](params, u);
    window.scrollTo({ top: 0 });
    U.closeModal();
  }
  function renderLayout(u, path) {
    const unread = DB.unreadNotifications(u.role_key).length;
    root().innerHTML = `
    <div class="admin-body">
      <aside class="sidebar">
        <div class="sb-brand">${U.logoSvg(40)}<div><b>Panel Admin</b><small>FILANTROPI MS</small></div></div>
        <nav class="sb-nav">
          ${MENU.map(g => `<div class="sb-group">${g[0]}</div>` + g[1].filter(m => Auth.can(m[3], u)).map(m =>
            `<a class="sb-link ${path === m[0] ? 'active' : ''}" href="#${m[0]}">${U.icon(m[2], 17)} <span>${m[1]}</span>${m[0] === '/transaksi' && DB.stats().pending ? `<span class="sb-badge">${DB.stats().pending}</span>` : ''}</a>`).join('')).join('')}
        </nav>
        <div class="sb-foot">
          <a class="sb-link" href="index.html#/">${U.icon('external', 16)} <span>Buka Website Publik</span></a>
          <div class="sb-user" style="margin-top:10px;padding:0 6px"><div class="avatar">${U.initials(u.name)}</div><div><b>${U.esc(u.name)}</b><small>${U.esc(u.role_label)}</small></div></div>
          <button class="sb-link" style="margin-top:8px;color:#fca5a5" onclick="AA.logout()">${U.icon('logout', 16)} <span>Keluar</span></button>
        </div>
      </aside>
      <div class="main-area">
        <div class="topnav">
          <div class="page-title">${TITLES[path] || ''}</div>
          <div class="right">
            <span class="badge ${DB.settings().demo_mode ? 'badge-amber' : 'badge-green'}">${DB.settings().demo_mode ? 'MODE DEMO' : 'PRODUKSI'}</span>
            <div class="bell-wrap">
              <button class="bell-btn" onclick="AA.toggleBell(event)">${U.icon('bell', 17)}${unread ? `<span class="bell-dot">${unread}</span>` : ''}</button>
              <div class="bell-menu" id="bell-menu">${bellHtml(u)}</div>
            </div>
            <a class="btn btn-sm btn-ghost" href="index.html#/">${U.icon('external', 14)} Website</a>
          </div>
        </div>
        <div id="page"></div>
      </div>
    </div>`;
  }
  function bellHtml(u) {
    const items = DB.unreadNotifications(u.role_key).slice(0, 12);
    return `<div class="bm-head"><b>Notifikasi</b><button class="btn btn-sm btn-ghost" onclick="AA.markAllRead()">Tandai dibaca</button></div>
      <div class="bm-list">${items.length ? items.map(n => `<div class="bm-item unread"><b>${U.esc(n.title)}</b><small>${U.esc(n.desc)}<br>${U.timeAgo(n.created_at)}</small></div>`).join('') : '<div class="empty" style="padding:20px">Tidak ada notifikasi baru.</div>'}</div>`;
  }
  function page404() { pg().innerHTML = `<div class="panel"><div class="panel-body"><div class="empty"><div class="eicon">🧭</div>Halaman admin tidak ditemukan.</div></div></div>`; }

  /* ============================================================
     LOGIN
     ============================================================ */
  function pageLogin() {
    const s = DB.settings();
    root().innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <div style="text-align:center;margin-bottom:22px">${U.logoSvg(56)}
        <h2 style="font-size:20px;margin-top:10px">Panel Admin</h2>
        <p class="hint">${U.esc(s.name)}</p></div>
      <form onsubmit="return AA.login(event)">
        <label>Email</label><input class="input" id="lg-email" type="email" required autocomplete="username">
        <label>Password</label><input class="input" id="lg-pass" type="password" required autocomplete="current-password">
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:18px">${U.icon('lock', 16)} MASUK</button>
      </form>
      ${s.demo_mode ? `<div class="note-box" style="margin-top:18px">
        <b>MODE DEMO — kredensial uji:</b>
        <div style="margin-top:8px;font-size:12px;line-height:1.9">
          Super Admin: <b>superadmin@filantropi.id</b><br>Admin Keuangan: <b>adminkeuangan@filantropi.id</b><br>
          Admin Penyaluran: <b>adminpenyaluran@filantropi.id</b><br>Auditor: <b>auditor@filantropi.id</b><br>
          Pimpinan: <b>pimpinan@filantropi.id</b> · lainnya: adminweb/adminprogram/admindonasi@filantropi.id<br>
          Password semua akun: <b>Admin@123</b>
        </div></div>` : ''}
      <p class="hint" style="text-align:center;margin-top:16px"><a href="index.html#/">← Kembali ke website publik</a></p>
    </div></div>`;
  }

  /* ============================================================
     DASHBOARD UTAMA
     ============================================================ */
  function pageDashboard(params, u) {
    const st = DB.stats();
    const pending = DB.find('donations', d => d.status === 'menunggu');
    const latest = [...DB.all('payment_transactions')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 7);
    const nearTarget = DB.find('campaigns', c => c.status === 'aktif').map(c => {
      const p = c.program_id ? DB.get('programs', c.program_id) : null;
      const raised = p ? DB.programRaised(p.id) : 0;
      return { c, pct: Math.min(100, c.target ? Math.round(raised / c.target * 100) : 0) };
    }).filter(x => x.pct >= 55).sort((a, b) => b.pct - a.pct).slice(0, 5);
    pg().innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px">
      ${statCard('Donasi Hari Ini', U.fmtRp(st.today), 'heart', 'var(--green-50)', 'var(--green-700)')}
      ${statCard('Donasi Bulan Ini', U.fmtRp(st.month), 'calendar', 'var(--gold-100)', 'var(--gold-600)')}
      ${statCard('Donasi Tahun Ini', U.fmtRp(st.year), 'trend', 'var(--blue-50)', 'var(--blue-600)')}
      ${statCard('Total Penyaluran', U.fmtRp(st.distributed), 'send', 'var(--gray-100)', 'var(--gray-700)')}
    </div>
    <div class="grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
      ${Object.keys(U.FUNDS).map(f => `<div class="card card-pad" style="padding:14px 16px">${U.fundBadge(f)}
        <div style="font-size:17px;font-weight:800;color:var(--green-800);margin-top:8px">${U.fmtRp(st.balances[f])}</div>
        <div class="hint">saldo ${U.fundLabel(f)}</div></div>`).join('')}
    </div>
    <div class="grid" style="grid-template-columns:2fr 1fr;margin-bottom:20px">
      <div class="panel"><div class="panel-head"><h3>${U.icon('trend', 16)} Tren Donasi 12 Bulan</h3>
        <div class="right"><span class="badge badge-green">hanya transaksi terverifikasi</span></div></div>
        <div class="panel-body"><canvas id="ch-month"></canvas></div></div>
      <div class="panel"><div class="panel-head"><h3>${U.icon('pie', 16)} Penerimaan per Jenis Dana</h3></div>
        <div class="panel-body"><canvas id="ch-fund"></canvas></div></div>
    </div>
    <div class="grid" style="grid-template-columns:3fr 2fr">
      <div class="panel"><div class="panel-head"><h3>${U.icon('wallet', 16)} Transaksi Terbaru</h3>
        <div class="right"><a class="btn btn-sm btn-outline" href="#/transaksi">Semua Transaksi ${U.icon('chevright', 13)}</a></div></div>
        ${tbl(['Kode', 'Tanggal', 'Donatur', 'Dana', 'Total', 'Status'], latest.map(t => {
          const d = DB.get('donations', t.donation_id) || {};
          return `<tr><td class="strong">${U.esc(t.trx_code)}</td><td>${U.fmtShort(t.created_at)}</td>
          <td>${U.esc(d.donor_name || '-')}</td><td>${U.fundBadge(d.fund_type)}</td>
          <td class="strong">${U.fmtRp(t.amount)}</td><td>${U.statusBadge(t.status)}</td></tr>`;
        }).join(''))}
      </div>
      <div>
        <div class="panel" style="margin-bottom:20px"><div class="panel-head"><h3>${U.icon('alert', 16)} Kampanye Mendekati Target</h3></div>
          <div class="panel-body">${nearTarget.length ? nearTarget.map(x => `<div style="margin-bottom:14px">
            <div class="mini-stat"><span>${U.esc(x.c.title)}</span><b>${x.pct}%</b></div>
            <div class="progress"><i style="width:${x.pct}%"></i></div></div>`).join('') : '<div class="empty">Belum ada kampanye mendekati target.</div>'}</div></div>
        <div class="panel"><div class="panel-head"><h3>${U.icon('clock', 16)} Menunggu Pembayaran (${pending.length})</h3></div>
          <div class="panel-body">${pending.length ? pending.slice(0, 4).map(d => `<div class="mini-stat" style="padding:6px 0;border-bottom:1px solid var(--gray-100)">
            <span>${U.esc(d.donation_code)} · ${U.fundBadge(d.fund_type)}</span><b>${U.fmtRp(d.total_amount)}</b></div>`).join('') +
            `<a class="btn btn-sm btn-outline btn-block" style="margin-top:10px" href="#/transaksi?status=menunggu">Kelola Transaksi Menunggu</a>` : '<div class="empty">Tidak ada transaksi menunggu.</div>'}</div></div>
      </div>
    </div>`;
    Charts.line(U.$('#ch-month'), DB.monthlySeries(12));
    Charts.donut(U.$('#ch-fund'), DB.fundSeries());
  }

  /* ============================================================
     MODUL: PROGRAM
     ============================================================ */
  function pageProgram(params, u) {
    const canManage = Auth.can('programs.manage', u);
    const q = (params.get('q') || '').toLowerCase();
    let list = DB.all('programs');
    if (q) list = list.filter(p => (p.name + p.category).toLowerCase().includes(q));
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('layers', 16)} Daftar Program (${list.length})</h3>
        <div class="right">
          <input class="input" style="width:220px" placeholder="Cari program…" value="${U.esc(params.get('q') || '')}"
            onkeydown="if(event.key==='Enter')location.hash='#/program?q='+encodeURIComponent(this.value)">
          ${canManage ? `<button class="btn btn-primary" onclick="AA.progForm()">+ Tambah Program</button>` : ''}
        </div></div>
      <div class="panel-body">
        ${tbl(['Gambar', 'Nama Program', 'Kategori', 'Jenis Dana', 'Target', 'Terkumpul', 'Progres', 'Status', 'Aksi'], list.map(p => {
          const raised = DB.programRaised(p.id), pct = Math.min(100, Math.round(raised / p.target * 100));
          return `<tr>
            <td><img src="${p.image}" style="width:64px;height:42px;object-fit:cover;border-radius:7px" alt=""></td>
            <td class="strong">${U.esc(p.name)}</td><td>${U.esc(p.category)}</td><td>${U.fundBadge(p.fund_type)}</td>
            <td>${U.fmtRp(p.target)}</td><td>${U.fmtRp(raised)}</td>
            <td style="min-width:110px"><div class="progress"><i style="width:${pct}%"></i></div><span class="hint">${pct}%</span></td>
            <td>${p.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : p.status === 'selesai' ? '<span class="badge badge-blue">Selesai</span>' : '<span class="badge badge-gray">Nonaktif</span>'}${p.featured ? ' <span class="badge badge-gold">Unggulan</span>' : ''}</td>
            <td><div class="tbl-actions">
              ${canManage ? `<button class="icon-btn" title="Ubah" onclick="AA.progForm('${p.id}')">${U.icon('edit', 15)}</button>
              <button class="icon-btn danger" title="Hapus" onclick="AA.progDel('${p.id}')">${U.icon('trash', 15)}</button>` : '-'}
            </div></td></tr>`;
        }).join('') || '<tr><td colspan="9"><div class="empty">Belum ada program.</div></td></tr>')}
      </div>
    </div>`;
  }
  function progForm(id) {
    const p = id ? DB.get('programs', id) : null;
    const cats = ['Pendidikan', 'Kesehatan', 'Kemanusiaan', 'Bantuan Bencana', 'Pemberdayaan Ekonomi', 'Sosial & Keagamaan', 'ZISWAF'];
    const m = U.modal(p ? 'Ubah Program' : 'Tambah Program', `
      <label>Nama program <span class="req">*</span></label><input class="input" id="pf-name" value="${U.esc(p ? p.name : '')}">
      <div class="form-grid">
        <div><label>Kategori</label><select class="select" id="pf-cat">${cats.map(c => `<option ${p && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>Jenis dana amanah</label><select class="select" id="pf-fund">${Object.keys(U.FUNDS).map(f => `<option value="${f}" ${p && p.fund_type === f ? 'selected' : ''}>${U.FUNDS[f].label}</option>`).join('')}</select></div>
      </div>
      <label>Target dana (Rp) <span class="req">*</span></label><input class="input" id="pf-target" type="number" min="1000" value="${p ? p.target : ''}">
      <label>Ringkasan singkat</label><input class="input" id="pf-short" value="${U.esc(p ? p.short_desc : '')}">
      <label>Deskripsi lengkap</label><textarea class="textarea" id="pf-desc">${U.esc(p ? p.desc : '')}</textarea>
      <label>Gambar program</label><input class="input" type="file" id="pf-img" accept="image/*" onchange="AA.pickImg(this)">
      <input type="hidden" id="pf-imgdata" value="${p ? p.image : ''}">
      <div class="form-grid">
        <div><label>Status</label><select class="select" id="pf-status">
          <option value="aktif" ${p && p.status === 'aktif' ? 'selected' : ''}>Aktif</option>
          <option value="nonaktif" ${p && p.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option>
          <option value="selesai" ${p && p.status === 'selesai' ? 'selected' : ''}>Selesai</option></select></div>
        <div><label>&nbsp;</label><label class="check"><input type="checkbox" id="pf-feat" ${p && p.featured ? 'checked' : ''}> Tampilkan sebagai unggulan</label></div>
      </div>
      <p class="hint">Jumlah terkumpul dihitung otomatis dari donasi berstatus <b>Berhasil</b>.</p>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.progSave('${id || ''}')">Simpan</button>`, { wide: true });
  }
  function progSave(id) {
    const name = val('#pf-name'), target = num('#pf-target');
    if (!name) { U.toast('Nama program wajib diisi.', 'error'); return; }
    if (!target) { U.toast('Target dana wajib diisi.', 'error'); return; }
    const data = {
      name, category: val('#pf-cat'), fund_type: val('#pf-fund'), target,
      short_desc: val('#pf-short'), desc: val('#pf-desc'),
      image: val('#pf-imgdata') || U.placeholder(val('#pf-cat').toUpperCase(), 800, 500, Math.floor(Math.random() * 8)),
      status: val('#pf-status'), featured: U.$('#pf-feat').checked
    };
    if (id) {
      const old = DB.get('programs', id);
      DB.update('programs', id, data);
      DB.audit('program.update', 'programs', id, { name: old.name, target: old.target, status: old.status }, { name, target, status: data.status }, 'Perubahan program');
      U.toast('Program diperbarui.');
    } else {
      const row = DB.insert('programs', { ...data, beneficiary_count: 0 });
      DB.audit('program.create', 'programs', row.id, null, { name }, 'Program baru dibuat');
      U.toast('Program baru ditambahkan.');
    }
    U.closeModal(); route();
  }
  function progDel(id) {
    const p = DB.get('programs', id);
    const used = DB.one('donations', d => d.program_id === id) || DB.one('distributions', d => d.program_id === id);
    U.confirmDialog('Hapus Program?', `Program "${U.esc(p.name)}" akan dihapus permanen.${used ? ' <b>Perhatian: program ini telah memiliki donasi/penyaluran tercatat.</b>' : ''}`, 'Ya, Hapus').then(ok => {
      if (!ok) return;
      DB.update('programs', id, { status: 'nonaktif' });
      DB.audit('program.archive', 'programs', id, { name: p.name, status: p.status }, { status: 'nonaktif' }, used ? 'Dinonaktifkan (memiliki riwayat transaksi) alih-alih dihapus demi integritas data' : 'Dinonaktifkan');
      U.toast('Program dinonaktifkan (arsip) demi menjaga integritas riwayat transaksi.', 'info');
      route();
    });
  }

  /* ============================================================
     MODUL: KAMPANYE
     ============================================================ */
  function pageKampanye(params, u) {
    const canManage = Auth.can('campaigns.manage', u);
    const list = DB.all('campaigns').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('target', 16)} Daftar Kampanye (${list.length})</h3>
        <div class="right">${canManage ? `<button class="btn btn-primary" onclick="AA.campForm()">+ Tambah Kampanye</button>` : ''}</div></div>
      <div class="panel-body">
        ${tbl(['Kampanye', 'Program Terkait', 'Jenis Dana', 'Target', 'Berakhir', 'Progres', 'Status', 'Aksi'], list.map(c => {
          const p = c.program_id ? DB.get('programs', c.program_id) : null;
          const raised = p ? DB.programRaised(p.id) : 0;
          const pct = Math.min(100, c.target ? Math.round(raised / c.target * 100) : 0);
          const dl = U.daysLeft(c.ends_at);
          return `<tr><td class="strong" style="max-width:240px">${U.esc(c.title)}</td>
            <td>${U.esc(p ? p.name : '-')}</td><td>${U.fundBadge(c.fund_type)}</td>
            <td>${U.fmtRp(c.target)}</td><td>${U.fmtShort(c.ends_at)}<br><span class="hint">${dl > 0 ? dl + ' hari lagi' : 'telah berakhir'}</span></td>
            <td style="min-width:100px"><div class="progress"><i style="width:${pct}%"></i></div><span class="hint">${pct}%</span></td>
            <td>${c.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>'}</td>
            <td><div class="tbl-actions">
              ${canManage ? `<button class="icon-btn" onclick="AA.campForm('${c.id}')">${U.icon('edit', 15)}</button>
              ${c.status === 'aktif' ? `<button class="icon-btn" title="Hentikan" onclick="AA.campToggle('${c.id}')">${U.icon('x', 15)}</button>` : `<button class="icon-btn" title="Aktifkan" onclick="AA.campToggle('${c.id}')">${U.icon('check', 15)}</button>`}
              <button class="icon-btn danger" onclick="AA.campDel('${c.id}')">${U.icon('trash', 15)}</button>` : '-'}
            </div></td></tr>`;
        }).join('') || '<tr><td colspan="8"><div class="empty">Belum ada kampanye.</div></td></tr>')}
      </div>
    </div>`;
  }
  function campForm(id) {
    const c = id ? DB.get('campaigns', id) : null;
    const programs = DB.all('programs');
    U.modal(c ? 'Ubah Kampanye' : 'Tambah Kampanye', `
      <label>Judul kampanye <span class="req">*</span></label><input class="input" id="cf-title" value="${U.esc(c ? c.title : '')}">
      <div class="form-grid">
        <div><label>Program terkait</label><select class="select" id="cf-prog">${programs.map(p => `<option value="${p.id}" ${c && c.program_id === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select></div>
        <div><label>Jenis dana</label><select class="select" id="cf-fund">${Object.keys(U.FUNDS).map(f => `<option value="${f}" ${c && c.fund_type === f ? 'selected' : ''}>${U.FUNDS[f].label}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div><label>Target dana (Rp) <span class="req">*</span></label><input class="input" id="cf-target" type="number" value="${c ? c.target : ''}"></div>
        <div><label>Tanggal berakhir</label><input class="input" id="cf-end" type="date" value="${c ? c.ends_at.slice(0, 10) : ''}"></div>
      </div>
      <label>Deskripsi singkat</label><textarea class="textarea" id="cf-desc">${U.esc(c ? c.short_desc : '')}</textarea>
      <label>Gambar kampanye</label><input class="input" type="file" id="cf-img" accept="image/*" onchange="AA.pickImg(this)">
      <input type="hidden" id="cf-imgdata" value="${c ? c.image || '' : ''}">`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.campSave('${id || ''}')">Simpan</button>`, { wide: true });
  }
  function campSave(id) {
    const title = val('#cf-title'), target = num('#cf-target'), end = val('#cf-end');
    if (!title || !target || !end) { U.toast('Judul, target, dan tanggal berakhir wajib diisi.', 'error'); return; }
    const data = {
      title, program_id: val('#cf-prog'), fund_type: val('#cf-fund'), target,
      ends_at: new Date(end + 'T23:59:59').toISOString(), short_desc: val('#cf-desc'),
      image: val('#cf-imgdata') || U.placeholder('KAMPANYE', 800, 500, Math.floor(Math.random() * 8))
    };
    if (id) { DB.update('campaigns', id, data); DB.audit('campaign.update', 'campaigns', id, null, { title }, ''); U.toast('Kampanye diperbarui.'); }
    else { const r = DB.insert('campaigns', { ...data, status: 'aktif', slug: 'kampanye-' + Date.now() }); DB.audit('campaign.create', 'campaigns', r.id, null, { title }, ''); U.toast('Kampanye dibuat.'); }
    U.closeModal(); route();
  }
  function campToggle(id) {
    const c = DB.get('campaigns', id);
    DB.update('campaigns', id, { status: c.status === 'aktif' ? 'nonaktif' : 'aktif' });
    DB.audit('campaign.toggle', 'campaigns', id, { status: c.status }, { status: c.status === 'aktif' ? 'nonaktif' : 'aktif' }, '');
    route();
  }
  function campDel(id) {
    const c = DB.get('campaigns', id);
    U.confirmDialog('Hapus Kampanye?', `"${U.esc(c.title)}" akan dihapus permanen.`, 'Ya, Hapus').then(ok => {
      if (!ok) return;
      DB.remove('campaigns', id);
      DB.audit('campaign.delete', 'campaigns', id, { title: c.title }, null, '');
      U.toast('Kampanye dihapus.'); route();
    });
  }

  /* ============================================================
     MODUL: DONATUR
     ============================================================ */
  function pageDonatur(params, u) {
    const canManage = Auth.can('donors.manage', u), canExport = Auth.can('donors.export', u);
    const q = (params.get('q') || '').toLowerCase();
    let list = DB.all('donors');
    if (q) list = list.filter(d => (d.name + d.email + (d.phone || '')).toLowerCase().includes(q));
    const totalOf = d => DB.find('donations', x => x.donor_id === d.id && x.status === 'berhasil').reduce((s, x) => s + x.amount, 0);
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('users', 16)} Data Donatur (${list.length})</h3>
        <div class="right">
          <input class="input" style="width:220px" placeholder="Cari nama/email/HP…" value="${U.esc(params.get('q') || '')}"
            onkeydown="if(event.key==='Enter')location.hash='#/donatur?q='+encodeURIComponent(this.value)">
          ${canExport ? `<button class="btn btn-outline" onclick="AA.donExport()">${U.icon('download', 15)} Ekspor Excel</button>
          <button class="btn btn-outline" onclick="AA.donExportPdf()">${U.icon('file', 15)} PDF</button>` : ''}
          ${canManage ? `<button class="btn btn-primary" onclick="AA.donForm()">+ Tambah Donatur</button>` : ''}
        </div></div>
      <div class="panel-body">
        ${tbl(['Nama', 'Email', 'WhatsApp', 'Terverifikasi', 'Total Donasi (Berhasil)', 'Bergabung', 'Aksi'], list.map(d => `<tr>
          <td class="strong">${U.esc(d.name)}</td><td>${U.esc(d.email)}</td><td>${U.esc(d.phone || '-')}</td>
          <td>${d.verified ? '<span class="badge badge-green">Ya</span>' : '<span class="badge badge-gray">Belum</span>'}</td>
          <td class="strong">${U.fmtRp(totalOf(d))}</td><td>${U.fmtShort(d.created_at)}</td>
          <td><div class="tbl-actions">
            <button class="icon-btn" title="Riwayat" onclick="AA.donDetail('${d.id}')">${U.icon('eye', 15)}</button>
            ${canManage ? `<button class="icon-btn" onclick="AA.donForm('${d.id}')">${U.icon('edit', 15)}</button>
            <button class="icon-btn danger" onclick="AA.donDel('${d.id}')">${U.icon('trash', 15)}</button>` : ''}
          </div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Belum ada donatur.</div></td></tr>')}
      </div>
    </div>
    <div class="panel" style="margin-top:20px"><div class="panel-head"><h3>${U.icon('repeat', 16)} Donasi Rutin Aktif</h3></div>
      <div class="panel-body">
        ${tbl(['Donatur', 'Jenis Dana', 'Nominal', 'Metode', 'Penarikan Berikutnya', 'Status', 'Aksi'],
          DB.find('recurring_donations', r => r.status === 'aktif').map(r => `<tr>
          <td class="strong">${U.esc(r.donor_name)}</td><td>${U.fundBadge(r.fund_type)}</td>
          <td>${U.fmtRp(r.amount)}</td><td>${U.esc(r.method_code)}</td><td>${U.fmtShort(r.next_charge)}</td>
          <td><span class="badge badge-green">Aktif</span></td>
          <td><button class="btn btn-sm btn-ghost" onclick="AA.recCancel('${r.id}')">Hentikan</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Tidak ada donasi rutin aktif.</div></td></tr>')}
      </div></div>`;
  }
  function donDetail(id) {
    const d = DB.get('donors', id);
    const hist = DB.find('donations', x => x.donor_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const berhasil = hist.filter(x => x.status === 'berhasil');
    U.modal('Riwayat Donatur: ' + U.esc(d.name), `
      <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
        ${statCard('Total Donasi', U.fmtRp(berhasil.reduce((s, x) => s + x.amount, 0)), 'heart', 'var(--green-50)', 'var(--green-700)')}
        ${statCard('Transaksi Berhasil', U.fmtNum(berhasil.length), 'checkcircle', 'var(--blue-50)', 'var(--blue-600)')}
        ${statCard('Bergabung', U.fmtShort(d.created_at), 'calendar', 'var(--gold-100)', 'var(--gold-600)')}
      </div>
      ${tbl(['Kode', 'Tanggal', 'Dana', 'Nominal', 'Status'], hist.slice(0, 15).map(x => `<tr>
        <td class="strong">${U.esc(x.donation_code)}</td><td>${U.fmtShort(x.created_at)}</td>
        <td>${U.fundBadge(x.fund_type)}</td><td>${U.fmtRp(x.amount)}</td><td>${U.statusBadge(x.status)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Belum ada donasi.</div></td></tr>')}`,
      `<button class="btn btn-ghost" data-close>Tutup</button>`, { wide: true });
  }
  function donForm(id) {
    const d = id ? DB.get('donors', id) : null;
    U.modal(d ? 'Ubah Donatur' : 'Tambah Donatur', `
      <label>Nama lengkap <span class="req">*</span></label><input class="input" id="df-name" value="${U.esc(d ? d.name : '')}">
      <div class="form-grid">
        <div><label>Email <span class="req">*</span></label><input class="input" id="df-email" type="email" value="${U.esc(d ? d.email : '')}"></div>
        <div><label>WhatsApp</label><input class="input" id="df-phone" value="${U.esc(d ? d.phone || '' : '')}"></div>
      </div>
      <label>Alamat</label><textarea class="textarea" id="df-address">${U.esc(d ? d.address || '' : '')}</textarea>
      ${d ? '' : `<label>Password awal (opsional)</label><input class="input" id="df-pass" type="text" placeholder="minimal 6 karakter">`}
      <div class="form-grid">
        <div><label>Status</label><select class="select" id="df-status"><option value="aktif" ${d && d.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${d && d.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
        <div><label>&nbsp;</label><label class="check"><input type="checkbox" id="df-verified" ${d && d.verified ? 'checked' : ''}> Tandai terverifikasi</label></div>
      </div>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.donSave('${id || ''}')">Simpan</button>`);
  }
  function donSave(id) {
    const name = val('#df-name'), email = val('#df-email').toLowerCase();
    if (!name || !email) { U.toast('Nama dan email wajib diisi.', 'error'); return; }
    const dup = DB.one('donors', x => x.email.toLowerCase() === email && x.id !== id);
    if (dup) { U.toast('Email sudah terdaftar pada donatur lain.', 'error'); return; }
    const data = { name, email, phone: val('#df-phone'), address: val('#df-address'), status: val('#df-status'), verified: U.$('#df-verified').checked };
    if (id) {
      const old = DB.get('donors', id);
      DB.update('donors', id, data);
      DB.audit('donor.update', 'donors', id, { name: old.name, email: old.email, status: old.status }, { ...data }, 'Perubahan data donatur oleh admin');
      U.toast('Donatur diperbarui.');
    } else {
      const pass = val('#df-pass');
      const row = DB.insert('donors', { ...data, password_hash: pass ? window.__hash(pass) : null });
      DB.audit('donor.create', 'donors', row.id, null, { name, email }, 'Donatur baru oleh admin');
      U.toast('Donatur ditambahkan.');
    }
    U.closeModal(); route();
  }
  function donDel(id) {
    const d = DB.get('donors', id);
    const used = DB.one('donations', x => x.donor_id === id);
    U.confirmDialog('Hapus Donatur?', `"${U.esc(d.name)}" akan dihapus permanen.${used ? ' <b>Donatur ini memiliki riwayat donasi — data donasi tetap tersimpan.</b>' : ''}`, 'Ya, Hapus').then(ok => {
      if (!ok) return;
      DB.remove('donors', id);
      DB.audit('donor.delete', 'donors', id, { name: d.name, email: d.email }, null, used ? 'Donatur dihapus, riwayat donasi dipertahankan' : '');
      U.toast('Donatur dihapus.'); route();
    });
  }
  function donExport() {
    const rows = DB.all('donors').map(d => {
      const h = DB.find('donations', x => x.donor_id === d.id && x.status === 'berhasil');
      return [d.name, d.email, d.phone || '', d.verified ? 'Ya' : 'Tidak', h.length, h.reduce((s, x) => s + Number(x.amount), 0), U.fmtShort(d.created_at)];
    });
    X.tableXLSX('data-donatur-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Data Donatur',
      ['Nama', 'Email', 'WhatsApp', 'Terverifikasi', 'Jumlah Transaksi Berhasil', 'Total Donasi (Rp)', 'Bergabung'], rows, { numCols: [4, 5], widths: [24, 26, 16, 14, 22, 18, 14] });
    DB.audit('donors.export', 'donors', '-', null, { total: rows.length }, 'Ekspor data donatur (Excel .xlsx)');
  }
  function donExportPdf() {
    X.tablePDF('data-donatur.pdf', 'Data Donatur', ['Nama', 'Email', 'WhatsApp', 'Total Donasi', 'Bergabung'],
      DB.all('donors').map(d => { const h = DB.find('donations', x => x.donor_id === d.id && x.status === 'berhasil'); return [d.name, d.email, d.phone || '', U.fmtRp(h.reduce((s, x) => s + Number(x.amount), 0)), U.fmtShort(d.created_at)]; }),
      { widths: [0.24, 0.26, 0.16, 0.18, 0.16], numCols: [3], institution: DB.settings() });
  }
  function recCancel(rid) {
    U.confirmDialog('Hentikan Donasi Rutin?', 'Jadwal donasi bulanan akan dihentikan.', 'Ya, Hentikan').then(ok => {
      if (!ok) return;
      DB.update('recurring_donations', rid, { status: 'dibatalkan' });
      DB.audit('recurring.cancel_by_admin', 'recurring_donations', rid, { status: 'aktif' }, { status: 'dibatalkan' }, '');
      route();
    });
  }

  /* ============================================================
     MODUL: TRANSAKSI (+ Rekonsiliasi)
     ============================================================ */
  function pageTransaksi(params, u) {
    const canVerify = Auth.can('transactions.verify', u), canCorrect = Auth.can('transactions.correct', u), canExport = Auth.can('transactions.export', u);
    const fStatus = params.get('status') || '', fFund = params.get('fund') || '', fRec = params.get('rec') || '', q = (params.get('q') || '').toLowerCase();
    let list = [...DB.all('payment_transactions')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (fStatus) list = list.filter(t => t.status === fStatus);
    if (fRec === 'belum') list = list.filter(t => t.status === 'berhasil' && !t.reconciled);
    const rows = list.filter(t => {
      const d = DB.get('donations', t.donation_id) || {};
      if (fFund && d.fund_type !== fFund) return false;
      if (q && !((t.trx_code + (d.donation_code || '') + (d.donor_name || '')).toLowerCase().includes(q))) return false;
      return true;
    });
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('wallet', 16)} Transaksi Pembayaran (${rows.length})</h3>
        <div class="right">
          <button class="btn btn-sm ${fStatus === 'menunggu' ? 'btn-gold' : 'btn-ghost'}" onclick="location.hash='#/transaksi?status=menunggu'">Menunggu (${DB.find('payment_transactions', t => t.status === 'menunggu').length})</button>
          <button class="btn btn-sm ${fRec === 'belum' ? 'btn-primary' : 'btn-ghost'}" onclick="location.hash='${fRec === 'belum' ? '#/transaksi' : '#/transaksi?rec=belum'}'">Belum Direkonsiliasi</button>
          ${canExport ? `<button class="btn btn-outline" onclick="AA.trxExport()">${U.icon('download', 15)} Ekspor Excel</button>
          <button class="btn btn-outline" onclick="AA.trxExportPdf()">${U.icon('file', 15)} PDF</button>` : ''}
        </div></div>
      <div class="panel-body">
        <div class="filter-bar" style="margin-bottom:14px">
          <div class="f"><label>Status</label><select class="select" onchange="location.hash='#/transaksi?status='+this.value${fFund ? "+'&fund=" + fFund + "'" : ''}">
            <option value="">Semua</option>${Object.keys(U.STATUSES).map(s => `<option value="${s}" ${s === fStatus ? 'selected' : ''}>${U.STATUSES[s].label}</option>`).join('')}</select></div>
          <div class="f"><label>Jenis Dana</label><select class="select" onchange="location.hash='#/transaksi?fund='+this.value${fStatus ? "+'&status=" + fStatus + "'" : ''}">
            <option value="">Semua</option>${Object.keys(U.FUNDS).map(f => `<option value="${f}" ${f === fFund ? 'selected' : ''}>${U.FUNDS[f].label}</option>`).join('')}</select></div>
          <div class="f grow"><label>Cari</label><input class="input" placeholder="Kode / donatur…" value="${U.esc(params.get('q') || '')}"
            onkeydown="if(event.key==='Enter')location.hash='#/transaksi?q='+encodeURIComponent(this.value)"></div>
        </div>
        ${tbl(['Kode Transaksi', 'Tanggal', 'Donatur', 'Dana', 'Metode', 'Total', 'Status', 'Rekonsiliasi', 'Aksi'], rows.slice(0, 60).map(t => {
          const d = DB.get('donations', t.donation_id) || {};
          return `<tr>
            <td class="strong">${U.esc(t.trx_code)}<br><span class="hint">${U.esc(d.donation_code || '')}</span></td>
            <td>${U.fmtShort(t.created_at)}</td>
            <td>${U.esc(d.donor_name || '-')}</td><td>${U.fundBadge(d.fund_type)}</td>
            <td>${U.esc(t.method_code)}</td><td class="strong">${U.fmtRp(t.amount)}</td>
            <td>${U.statusBadge(t.status)}</td>
            <td>${t.status === 'berhasil' ? (t.reconciled ? '<span class="badge badge-green">Ya</span>' : '<span class="badge badge-amber">Belum</span>') : '-'}</td>
            <td><div class="tbl-actions">
              <button class="icon-btn" title="Detail" onclick="AA.trxDetail('${t.id}')">${U.icon('eye', 15)}</button>
              ${t.status === 'menunggu' && canVerify ? `<button class="icon-btn" title="Konfirmasi manual" onclick="AA.trxVerify('${t.id}')">${U.icon('check', 15)}</button>
              <button class="icon-btn danger" title="Tandai gagal" onclick="AA.trxFail('${t.id}')">${U.icon('x', 15)}</button>` : ''}
              ${t.status === 'berhasil' && !t.reconciled && canVerify ? `<button class="icon-btn" title="Rekonsiliasi" onclick="AA.trxReconcile('${t.id}')">${U.icon('refresh', 15)}</button>` : ''}
              ${t.status === 'berhasil' && canCorrect ? `<button class="icon-btn" title="Koreksi (audit)" onclick="AA.trxCorrect('${t.id}')">${U.icon('edit', 15)}</button>` : ''}
            </div></td></tr>`;
        }).join('') || '<tr><td colspan="9"><div class="empty">Tidak ada transaksi yang cocok.</div></td></tr>')}
        ${rows.length > 60 ? `<p class="hint" style="margin-top:10px">Menampilkan 60 dari ${rows.length} transaksi — gunakan filter.</p>` : ''}
      </div>
    </div>
    <div class="note-box" style="margin-top:16px">${U.icon('shield', 14)} <b>Aturan integritas:</b> status pembayaran menjadi <b>Berhasil</b> hanya melalui (1) webhook payment gateway terverifikasi, atau (2) konfirmasi manual rekonsiliasi bank oleh admin berwenang. Transaksi <b>Berhasil</b> tidak dapat diubah sembarangan — setiap koreksi wajib menyertakan alasan dan tercatat pada <a href="#/audit" style="text-decoration:underline">Audit Trail</a>.</div>`;
  }
  function trxDetail(id) {
    const t = DB.get('payment_transactions', id);
    const d = DB.get('donations', t.donation_id) || {};
    const prog = d.program_id ? DB.get('programs', d.program_id) : null;
    const r = DB.one('receipts', x => x.donation_id === t.donation_id);
    U.modal('Detail Transaksi ' + U.esc(t.trx_code), `
      <div class="status-steps" style="margin-bottom:14px">${U.statusBadge(t.status)} ${t.reconciled ? '<span class="badge badge-green">Direkonsiliasi</span>' : ''}</div>
      <div class="mini-stat"><span>Kode transaksi</span><b>${U.esc(t.trx_code)}</b></div>
      <div class="mini-stat"><span>Kode donasi</span><b>${U.esc(d.donation_code || '-')}</b></div>
      <div class="mini-stat"><span>Donatur</span><b>${d.is_anonymous ? 'Hamba Allah (anonim)' : U.esc(d.donor_name || '-')} ${d.donor_phone ? '· ' + U.esc(d.donor_phone) : ''}</b></div>
      <div class="mini-stat"><span>Email</span><b>${U.esc(d.donor_email || '-')}</b></div>
      <div class="mini-stat"><span>Jenis dana / program</span><b>${U.fundLabel(d.fund_type)} · ${U.esc(prog ? prog.name : 'Dana Umum')}</b></div>
      <div class="mini-stat"><span>Nominal + kode unik</span><b>${U.fmtRp(d.amount)} + ${U.fmtNum(d.unique_code)}</b></div>
      <div class="mini-stat"><span>Total dibayar</span><b>${U.fmtRp(t.amount)}</b></div>
      <div class="mini-stat"><span>Metode</span><b>${U.esc(t.method_code)} · ${U.esc(t.provider || '-')}</b></div>
      ${t.va_number ? `<div class="mini-stat"><span>VA</span><b>${U.esc(t.va_number)}</b></div>` : ''}
      <div class="mini-stat"><span>Dibuat</span><b>${U.fmtDateTime(t.created_at)}</b></div>
      <div class="mini-stat"><span>Kedaluwarsa</span><b>${U.fmtDateTime(t.expires_at)}</b></div>
      <div class="mini-stat"><span>Dibayar</span><b>${t.paid_at ? U.fmtDateTime(t.paid_at) : '-'}</b></div>
      <div class="mini-stat"><span>Ref. provider</span><b>${U.esc(t.provider_reference || '-')}</b></div>
      ${r ? `<div class="success-box" style="margin-top:12px">Kuitansi terbit: <b>${U.esc(r.receipt_no)}</b></div>` : ''}
      <div class="mini-stat" style="margin-top:10px"><span>Pesan donatur</span><b>${U.esc(d.message || '-')}</b></div>`,
      `<button class="btn btn-ghost" data-close>Tutup</button>` + (r ? `<button class="btn btn-primary" onclick="AA.openReceipt('${d.donation_code}')">${U.icon('file', 14)} Kuitansi</button>` : ''), { wide: true });
  }
  function trxVerify(id) {
    const t = DB.get('payment_transactions', id);
    const d = t ? DB.get('donations', t.donation_id) || {} : {};
    const m = t ? DB.one('payment_methods', x => x.code === t.method_code) : null;
    const manual = m && m.type === 'transfer_manual';
    U.modal('Konfirmasi Manual (Verifikasi Pembayaran)', `
      <div class="danger-box">Gunakan hanya bila pembayaran <b>benar-benar telah diverifikasi pada mutasi rekening</b> ${manual ? '(cocokkan bukti transfer yang dikirim donatur via WhatsApp dengan mutasi bank — total harus tepat ' + U.fmtRp(t.amount) + ')' : ''}. Tindakan ini tercatat pada Audit Trail dengan identitas Anda.</div>
      <div class="mini-stat"><span>Kode donasi</span><b>${U.esc(d.donation_code || '-')}</b></div>
      <div class="mini-stat"><span>Donatur</span><b>${d.is_anonymous ? 'Hamba Allah (anonim)' : U.esc(d.donor_name || '-')} ${d.donor_phone ? '· ' + U.esc(d.donor_phone) : ''}</b></div>
      <div class="mini-stat"><span>Total dibayar</span><b>${t ? U.fmtRp(t.amount) : '-'}</b></div>
      ${manual && d.donor_phone ? `<a class="btn btn-sm btn-block" style="background:#25d366;color:#fff;border-color:#25d366;margin:10px 0" target="_blank" rel="noopener" href="https://wa.me/${String(WA.normalizePhone(d.donor_phone))}?text=${encodeURIComponent('Assalamualaikum ' + (d.is_anonymous ? '' : d.donor_name) + ', donasi ' + (d.donation_code || '') + ' kami telah terima. Terima kasih atas donasinya.')}">${U.icon('chat', 14)} Chat Donatur via WhatsApp</a>` : ''}
      <label>Catatan konfirmasi (wajib — tercatat di audit)</label>
      <textarea class="textarea" id="tv-note" placeholder="mis. Cocok dengan mutasi BCA 10/11, ref 123456 — bukti transfer diterima via WhatsApp"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.trxVerifyDo('${id}')">Konfirmasi Berhasil</button>`);
  }
  async function trxVerifyDo(id) {
    const note = val('#tv-note');
    if (!note) { U.toast('Catatan konfirmasi wajib diisi.', 'error'); return; }
    U.toast('Memproses verifikasi…');
    const res = await DB.manualConfirm(id, note);
    if (!res.ok) { U.toast(res.message, 'error'); return; }
    U.closeModal(); U.toast('Transaksi dikonfirmasi BERHASIL. Kuitansi otomatis terbit.'); route();
  }
  function trxFail(id) {
    U.confirmDialog('Tandai Gagal?', 'Transaksi akan berstatus Gagal (mis. pembayaran tidak ditemukan di rekening).', 'Ya, Tandai Gagal').then(ok => {
      if (!ok) return;
      const res = DB.failTransaction(id, 'Ditandai gagal oleh admin (dana tidak ditemukan)');
      U.toast(res.ok ? 'Transaksi ditandai gagal.' : res.message, res.ok ? 'success' : 'error');
      route();
    });
  }
  function trxReconcile(id) {
    U.modal('Rekonsiliasi Transaksi', `
      <p style="color:var(--gray-600)">Tandai transaksi ini telah cocok dengan mutasi rekening bank.</p>
      <label>Catatan rekonsiliasi (wajib)</label><textarea class="textarea" id="tr-note" placeholder="mis. Match mutasi BCA 12/11"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.trxReconcileDo('${id}')">Tandai Terekonsiliasi</button>`);
  }
  function trxReconcileDo(id) {
    const note = val('#tr-note');
    if (!note) { U.toast('Catatan wajib diisi.', 'error'); return; }
    DB.update('payment_transactions', id, { reconciled: true, reconciled_at: new Date().toISOString(), reconciled_note: note });
    DB.audit('transaction.reconcile', 'payment_transactions', id, { reconciled: false }, { reconciled: true }, note);
    U.closeModal(); U.toast('Transaksi ditandai terekonsiliasi.'); route();
  }
  function trxCorrect(id) {
    const t = DB.get('payment_transactions', id);
    const d = DB.get('donations', t.donation_id);
    const programs = DB.all('programs');
    U.modal('Koreksi Data Transaksi (Berhasil)', `
      <div class="danger-box">Transaksi <b>Berhasil</b> terkunci dari perubahan sembarangan. Koreksi hanya untuk pembetulan data, wajib menyertakan <b>alasan</b>, dan seluruh nilai lama→baru tercatat di Audit Trail.</div>
      <div class="form-grid">
        <div><label>Nama donatur</label><input class="input" id="tc-name" value="${U.esc(d.donor_name)}"></div>
        <div><label>WhatsApp</label><input class="input" id="tc-phone" value="${U.esc(d.donor_phone || '')}"></div>
        <div><label>Email</label><input class="input" id="tc-email" value="${U.esc(d.donor_email || '')}"></div>
        <div><label>Program</label><select class="select" id="tc-prog"><option value="">Dana Umum</option>
          ${programs.map(p => `<option value="${p.id}" ${d.program_id === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select></div>
      </div>
      <label>Pesan donatur</label><input class="input" id="tc-msg" value="${U.esc(d.message || '')}">
      <label>Alasan koreksi (wajib) <span class="req">*</span></label><textarea class="textarea" id="tc-reason" placeholder="mis. Salah ketik nama donatur"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-danger" onclick="AA.trxCorrectDo('${id}')">Simpan Koreksi</button>`, { wide: true });
  }
  function trxCorrectDo(id) {
    const reason = val('#tc-reason');
    if (!reason) { U.toast('Alasan koreksi wajib diisi.', 'error'); return; }
    const t = DB.get('payment_transactions', id);
    const d = DB.get('donations', t.donation_id);
    const patch = {
      donor_name: val('#tc-name'), donor_phone: val('#tc-phone'),
      donor_email: val('#tc-email'), program_id: val('#tc-prog') || null, message: val('#tc-msg')
    };
    const oldV = { donor_name: d.donor_name, donor_phone: d.donor_phone, donor_email: d.donor_email, program_id: d.program_id, message: d.message };
    DB.update('donations', d.id, patch);
    DB.audit('transaction.correct', 'donations', d.id, oldV, patch, reason + ` (transaksi ${t.trx_code})`);
    U.closeModal(); U.toast('Koreksi tersimpan & tercatat di Audit Trail.'); route();
  }
  function trxExport() {
    const rows = [...DB.all('payment_transactions')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(t => {
      const d = DB.get('donations', t.donation_id) || {};
      const p = d.program_id ? DB.get('programs', d.program_id) : null;
      return [t.trx_code, U.fmtDateTime(t.created_at), d.donation_code || '', d.is_anonymous ? 'Hamba Allah' : (d.donor_name || ''), d.donor_email || '', U.fundLabel(d.fund_type), p ? p.name : 'Dana Umum', t.method_code, Number(d.amount || 0), Number(d.unique_code || 0), Number(t.amount), (U.STATUSES[t.status] || {}).label || t.status, t.reconciled ? 'Ya' : 'Belum'];
    });
    X.tableXLSX('transaksi-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Semua Transaksi',
      ['Kode Transaksi', 'Tanggal', 'Kode Donasi', 'Donatur', 'Email', 'Jenis Dana', 'Program', 'Metode', 'Nominal', 'Kode Unik', 'Total', 'Status', 'Rekonsiliasi'], rows, { numCols: [8, 9, 10], widths: [22, 18, 20, 20, 24, 14, 26, 14, 16, 12, 16, 16, 14] });
    DB.audit('transactions.export', 'payment_transactions', '-', null, { total: rows.length }, 'Ekspor transaksi (Excel .xlsx)');
  }
  function trxExportPdf() {
    X.tablePDF('transaksi.pdf', 'Rekap Transaksi Pembayaran', ['Kode', 'Tanggal', 'Donatur', 'Dana', 'Metode', 'Total', 'Status'],
      [...DB.all('payment_transactions')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 300).map(t => {
        const d = DB.get('donations', t.donation_id) || {};
        return [t.trx_code, U.fmtShort(t.created_at), d.is_anonymous ? 'Hamba Allah' : (d.donor_name || '-'), U.fundLabel(d.fund_type), t.method_code, Number(t.amount), (U.STATUSES[t.status] || {}).label || t.status];
      }),
      { widths: [0.18, 0.11, 0.22, 0.13, 0.12, 0.13, 0.11], numCols: [5], institution: DB.settings(), landscape: true, note: 'Maksimal 300 transaksi terbaru. Gunakan Ekspor Excel untuk data lengkap.' });
  }
  function openReceipt(code) { U.closeModal(); location.hash = '#/kuitansi/' + code; }

  /* ============================================================
     MODUL: PENYALURAN DANA (alur persetujuan berjenjang)
     diajukan → diverifikasi (Keuangan) → disetujui (Pimpinan/SA)
     → disalurkan (Penyaluran, saldo kategori dipotong) → selesai
     ============================================================ */
  function pagePenyaluran(params, u) {
    const can = a => Auth.can('distributions.' + a, u);
    const list = [...DB.all('distributions')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const steps = ['diajukan', 'diverifikasi', 'disetujui', 'disalurkan', 'selesai'];
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('send', 16)} Penyaluran Dana (${list.length})</h3>
        <div class="right">
          <button class="btn btn-outline" onclick="AA.distExport()">${U.icon('download', 15)} Ekspor</button>
          ${can('create') ? `<button class="btn btn-primary" onclick="AA.distForm()">+ Ajukan Penyaluran</button>` : ''}
        </div></div>
      <div class="panel-body">
        ${tbl(['Nomor', 'Program', 'Dana', 'Jumlah', 'Status Alur', 'Aksi'], list.map(d => {
          const p = DB.get('programs', d.program_id);
          const idx = steps.indexOf(d.status);
          return `<tr><td class="strong">${U.esc(d.dist_number)}</td>
            <td style="max-width:230px"><b>${U.esc(p ? p.name : '-')}</b><br><span class="hint">${U.esc(d.description)}</span></td>
            <td>${U.fundBadge(d.fund_type)}</td><td class="strong">${U.fmtRp(d.amount)}</td>
            <td style="min-width:250px"><div class="status-steps">${steps.map((s, i) => d.status === 'ditolak' ? '' :
              `<span class="badge ${i < idx ? 'badge-green' : i === idx ? 'badge-gold' : 'badge-outline'}" style="font-size:10px">${i < idx ? '✓ ' : ''}${U.DIST_STATUS[s].label}</span>`).join('→'.replace('→', '·'))}</div>
              <div style="margin-top:5px">${U.distBadge(d.status)}</div></td>
            <td><div class="tbl-actions">
              ${d.status === 'diajukan' && can('verify') ? `<button class="icon-btn" title="Verifikasi" onclick="AA.distVerify('${d.id}')">${U.icon('eye', 15)}</button>
              <button class="icon-btn danger" title="Tolak" onclick="AA.distReject('${d.id}')">${U.icon('x', 15)}</button>` : ''}
              ${d.status === 'diverifikasi' && can('approve') ? `<button class="icon-btn" title="Setujui" onclick="AA.distApprove('${d.id}')">${U.icon('check', 15)}</button>
              <button class="icon-btn danger" title="Tolak" onclick="AA.distReject('${d.id}')">${U.icon('x', 15)}</button>` : ''}
              ${d.status === 'disetujui' && can('disburse') ? `<button class="icon-btn" title="Salurkan + bukti" onclick="AA.distDisburse('${d.id}')">${U.icon('send', 15)}</button>` : ''}
              ${d.status === 'disalurkan' ? `<button class="icon-btn" title="Laporan penyaluran" onclick="AA.distFinish('${d.id}')">${U.icon('file', 15)}</button>` : ''}
              ${d.proof_file ? `<button class="icon-btn" title="Lihat bukti" onclick="AA.viewProof('${d.id}')">${U.icon('image', 15)}</button>` : ''}
            </div></td></tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty">Belum ada penyaluran.</div></td></tr>')}
      </div>
    </div>
    <div class="note-box" style="margin-top:16px">${U.icon('shield', 14)} <b>Kewajiban pemisahan dana:</b> penyaluran hanya boleh menggunakan saldo pada <b>jenis dana yang sama</b> dengan amanah donatur (zakat ≠ infak ≠ sedekah ≠ wakaf). Saldo dipotong otomatis saat status menjadi <b>Disalurkan</b> dan tervalidasi terhadap saldo kategori — pengajuan yang melebihi saldo akan ditolak sistem.</div>`;
  }
  function distForm() {
    const programs = DB.find('programs', p => p.status !== 'nonaktif');
    const bens = DB.find('beneficiaries', b => b.status === 'aktif');
    const bal = DB.fundBalances();
    U.modal('Ajukan Penyaluran Dana', `
      <div class="info-box">Nomor dokumen dibuat otomatis (DST-YYYYMM-XXX). Alur: Diajukan → Diverifikasi (Keuangan) → Disetujui (Pimpinan) → Disalurkan → Selesai.</div>
      <div class="form-grid">
        <div><label>Program penyaluran <span class="req">*</span></label><select class="select" id="dt-prog" onchange="AA.distSyncBal()">${programs.map(p => `<option value="${p.id}" data-fund="${p.fund_type}">${U.esc(p.name)}</option>`).join('')}</select></div>
        <div><label>Jenis dana (otomatis mengikuti program)</label><input class="input" id="dt-fund" disabled></div>
      </div>
      <div class="form-grid">
        <div><label>Jumlah (Rp) <span class="req">*</span></label><input class="input" id="dt-amount" type="number" min="1"></div>
        <div><label>Penerima manfaat / kelompok</label><select class="select" id="dt-ben"><option value="">— Umum / kelompok —</option>${bens.map(b => `<option value="${b.id}">${U.esc(b.name)}</option>`).join('')}</select></div>
      </div>
      <div class="success-box" id="dt-bal">Saldo tersedia: -</div>
      <label>Uraian penggunaan dana <span class="req">*</span></label><textarea class="textarea" id="dt-desc" placeholder="mis. Penyaluran beasiswa 45 anak yatim semester ganjil"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.distSave()">Ajukan</button>`, { wide: true });
    AA.distSyncBal();
  }
  function distSyncBal() {
    const sel = U.$('#dt-prog');
    const fund = sel.options[sel.selectedIndex].getAttribute('data-fund');
    U.$('#dt-fund').value = U.fundLabel(fund) + ' (' + fund + ')';
    U.$('#dt-bal').innerHTML = `Saldo tersedia pada dana <b>${U.fundLabel(fund)}</b>: <b>${U.fmtRp(DB.fundBalance(fund))}</b>`;
  }
  function distSave() {
    const amount = num('#dt-amount'), desc = val('#dt-desc');
    const sel = U.$('#dt-prog');
    const fund = sel.options[sel.selectedIndex].getAttribute('data-fund');
    if (!amount) { U.toast('Jumlah wajib diisi.', 'error'); return; }
    if (amount > DB.fundBalance(fund)) { U.toast('Pengajuan MELEBIHI saldo dana ' + U.fundLabel(fund) + '. Penyaluran lintas kategori dilarang.', 'error'); return; }
    if (!desc) { U.toast('Uraian penggunaan wajib diisi.', 'error'); return; }
    const u = Auth.currentAdmin();
    const row = DB.insert('distributions', {
      dist_number: DB.codeMonth('DST', 'distributions', 'dist_number', 3),
      program_id: sel.value, fund_type: fund, beneficiary_id: val('#dt-ben') || null,
      amount, status: 'diajukan', description: desc, proof_file: '', report_note: '',
      requested_by: u.name, verified_by: '', approved_by: '', disbursed_at: null, finished_at: null
    });
    DB.audit('distribution.create', 'distributions', row.id, null, { dist_number: row.dist_number, amount, fund }, 'Pengajuan penyaluran baru');
    DB.notify('Pengajuan penyaluran baru', `${row.dist_number} (${U.fundLabel(fund)} ${U.fmtRp(amount)}) menunggu verifikasi keuangan.`, 'penyaluran', 'admin_keuangan');
    U.closeModal(); U.toast('Pengajuan penyaluran dibuat.'); route();
  }
  function distVerify(id) {
    const d = DB.get('distributions', id);
    const u = Auth.currentAdmin();
    DB.update('distributions', id, { status: 'diverifikasi', verified_by: u.name });
    DB.audit('distribution.verify', 'distributions', id, { status: d.status }, { status: 'diverifikasi' }, 'Diverifikasi Admin Keuangan');
    DB.notify('Penyaluran diverifikasi', `${d.dist_number} menunggu persetujuan pimpinan.`, 'penyaluran', 'super_admin');
    U.toast('Penyaluran diverifikasi.'); route();
  }
  function distApprove(id) {
    const d = DB.get('distributions', id);
    const u = Auth.currentAdmin();
    DB.update('distributions', id, { status: 'disetujui', approved_by: u.name });
    DB.audit('distribution.approve', 'distributions', id, { status: d.status }, { status: 'disetujui' }, 'Disetujui pimpinan');
    DB.notify('Penyaluran disetujui', `${d.dist_number} siap disalurkan oleh tim penyaluran.`, 'penyaluran', 'admin_penyaluran');
    U.toast('Penyaluran disetujui.'); route();
  }
  function distDisburse(id) {
    const d = DB.get('distributions', id);
    U.modal('Salurkan Dana & Unggah Bukti', `
      <div class="info-box">Saldo <b>${U.fundLabel(d.fund_type)}</b> saat ini: <b>${U.fmtRp(DB.fundBalance(d.fund_type))}</b>. Dana akan dipotong dari kategori yang sama.</div>
      <label>Bukti penyaluran (foto/kwitansi)</label>
      <input class="input" type="file" id="dd-proof" accept="image/*" onchange="AA.pickImg(this)">
      <input type="hidden" id="dd-proofdata" value="">
      <label>Catatan penyaluran</label><textarea class="textarea" id="dd-note" placeholder="mis. Disalurkan langsung ke penerima pada 10 Nov 2026"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.distDisburseDo('${id}')">Salurkan Sekarang</button>`);
  }
  function distDisburseDo(id) {
    const d = DB.get('distributions', id);
    const bal = DB.fundBalance(d.fund_type);
    if (d.amount > bal) { U.toast('Saldo ' + U.fundLabel(d.fund_type) + ' tidak mencukupi (' + U.fmtRp(bal) + '). Transaksi dibatalkan.', 'error'); return; }
    // transaksi keuangan pengeluaran + potong saldo
    DB.insert('financial_transactions', {
      trx_type: 'penyaluran', direction: 'keluar', fund_type: d.fund_type,
      category_code: 'OUT-' + d.fund_type.toUpperCase(), amount: d.amount, ref_code: d.dist_number,
      description: 'Penyaluran ' + U.fundLabel(d.fund_type) + ' — ' + d.description,
      trx_date: new Date().toISOString(), status: 'berhasil'
    });
    const u = Auth.currentAdmin();
    DB.update('distributions', id, { status: 'disalurkan', disbursed_at: new Date().toISOString(), proof_file: val('#dd-proofdata') || U.placeholder('BUKTI PENYALURAN', 640, 400, Math.floor(Math.random() * 8)), report_note: val('#dd-note') });
    DB.audit('distribution.disburse', 'distributions', id, { status: d.status }, { status: 'disalurkan', amount: d.amount }, 'Dana dipotong dari saldo ' + U.fundLabel(d.fund_type) + '; bukti terunggah');
    U.closeModal(); U.toast('Dana disalurkan. Saldo kategori telah diperbarui.'); route();
  }
  function distFinish(id) {
    U.modal('Laporan Penyaluran (Selesai)', `
      <label>Ringkasan hasil penyaluran</label>
      <textarea class="textarea" id="df-note" placeholder="mis. 45 penerima manfaat menerima beasiswa; berita acara terlampir"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.distFinishDo('${id}')">Tandai Selesai</button>`);
  }
  function distFinishDo(id) {
    const d = DB.get('distributions', id);
    DB.update('distributions', id, { status: 'selesai', finished_at: new Date().toISOString(), report_note: val('#df-note') || d.report_note });
    DB.audit('distribution.finish', 'distributions', id, { status: d.status }, { status: 'selesai' }, '');
    U.closeModal(); U.toast('Penyaluran ditandai selesai.'); route();
  }
  function distReject(id) {
    U.modal('Tolak Pengajuan Penyaluran', `
      <label>Alasan penolakan (wajib)</label><textarea class="textarea" id="dr-note"></textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-danger" onclick="AA.distRejectDo('${id}')">Tolak</button>`);
  }
  function distRejectDo(id) {
    const reason = val('#dr-note');
    if (!reason) { U.toast('Alasan wajib diisi.', 'error'); return; }
    const d = DB.get('distributions', id);
    DB.update('distributions', id, { status: 'ditolak', report_note: 'DITOLAK: ' + reason });
    DB.audit('distribution.reject', 'distributions', id, { status: d.status }, { status: 'ditolak' }, reason);
    U.closeModal(); U.toast('Pengajuan ditolak.'); route();
  }
  function viewProof(id) {
    const d = DB.get('distributions', id);
    U.modal('Bukti Penyaluran ' + U.esc(d.dist_number), `<img src="${d.proof_file}" style="width:100%;border-radius:10px">` +
      (d.report_note ? `<p class="hint" style="margin-top:10px">${U.esc(d.report_note)}</p>` : ''));
  }

  /* ============================================================
     MODUL: PENERIMA MANFAAT (privasi termasking)
     ============================================================ */
  function pagePenerima(params, u) {
    const canManage = Auth.can('beneficiaries.manage', u);
    const canFull = Auth.can('beneficiaries.view_full', u);
    const showFull = params.get('full') === '1' && canFull;
    const list = DB.all('beneficiaries');
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('heart', 16)} Data Penerima Manfaat (${list.length})</h3>
        <div class="right">
          ${canFull ? `<button class="btn btn-sm ${showFull ? 'btn-danger' : 'btn-ghost'}" onclick="location.hash='${showFull ? '#/penerima' : '#/penerima?full=1'}'">${U.icon(showFull ? 'eyeoff' : 'eye', 14)} ${showFull ? 'Sembunyikan data lengkap' : 'Tampilkan data lengkap (berwenang)'}</button>` : ''}
          ${canManage ? `<button class="btn btn-primary" onclick="AA.benForm()">+ Tambah Penerima</button>` : ''}
        </div></div>
      <div class="panel-body">
        ${!canFull ? `<div class="info-box" style="margin-bottom:12px">${U.icon('lock', 14)} Data identitas sensitif (NIK/HP) <b>dimasking</b> sesuai peran Anda. Peran dengan izin <code>beneficiaries.view_full</code> dapat membukanya.</div>` : ''}
        ${tbl(['Nama', 'Kategori', 'NIK', 'Telepon', 'Alamat', 'Kebutuhan', 'Program', 'Aksi'], list.map(b => {
          const p = b.program_id ? DB.get('programs', b.program_id) : null;
          return `<tr><td class="strong">${U.esc(b.name)}</td><td><span class="badge badge-gold">${U.esc(b.category)}</span></td>
          <td>${showFull ? U.esc(b.nik) : U.masked(b.nik)}</td>
          <td>${showFull ? U.esc(b.phone) : U.masked(b.phone)}</td>
          <td style="max-width:180px">${U.esc(b.address)}</td><td style="max-width:180px">${U.esc(b.needs)}</td>
          <td>${U.esc(p ? p.name : '-')}</td>
          <td><div class="tbl-actions">
            ${canManage ? `<button class="icon-btn" onclick="AA.benForm('${b.id}')">${U.icon('edit', 15)}</button>
            <button class="icon-btn danger" onclick="AA.benDel('${b.id}')">${U.icon('trash', 15)}</button>` : '-'}
          </div></td></tr>`;
        }).join('') || '<tr><td colspan="8"><div class="empty">Belum ada data penerima manfaat.</div></td></tr>')}
      </div>
    </div>`;
  }
  function benForm(id) {
    const b = id ? DB.get('beneficiaries', id) : null;
    const programs = DB.all('programs');
    U.modal(b ? 'Ubah Penerima Manfaat' : 'Tambah Penerima Manfaat', `
      <div class="info-box">Data pribadi dilindungi: hanya peran berwenang yang dapat melihat tanpa masking.</div>
      <div class="form-grid">
        <div><label>Nama <span class="req">*</span></label><input class="input" id="bf-name" value="${U.esc(b ? b.name : '')}"></div>
        <div><label>Kategori</label><select class="select" id="bf-cat">${['Anak Yatim', 'Dhuafa', 'Fakir Miskin', 'Lansia', 'Korban Bencana', 'Usaha Mikro / Asnaf', 'Lainnya'].map(c => `<option ${b && b.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>NIK</label><input class="input" id="bf-nik" value="${U.esc(b ? b.nik : '')}" maxlength="16"></div>
        <div><label>Telepon</label><input class="input" id="bf-phone" value="${U.esc(b ? b.phone : '')}"></div>
      </div>
      <label>Alamat</label><input class="input" id="bf-address" value="${U.esc(b ? b.address : '')}">
      <label>Kebutuhan</label><input class="input" id="bf-needs" value="${U.esc(b ? b.needs : '')}">
      <div class="form-grid">
        <div><label>Program terkait</label><select class="select" id="bf-prog"><option value="">—</option>${programs.map(p => `<option value="${p.id}" ${b && b.program_id === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select></div>
        <div><label>&nbsp;</label><label class="check"><input type="checkbox" id="bf-consent" ${b && b.photo_consent ? 'checked' : ''}> Persetujuan publikasi foto/cerita</label></div>
      </div>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.benSave('${id || ''}')">Simpan</button>`, { wide: true });
  }
  function benSave(id) {
    const name = val('#bf-name');
    if (!name) { U.toast('Nama wajib diisi.', 'error'); return; }
    const data = { name, category: val('#bf-cat'), nik: val('#bf-nik'), phone: val('#bf-phone'), address: val('#bf-address'), needs: val('#bf-needs'), program_id: val('#bf-prog') || null, photo_consent: U.$('#bf-consent').checked };
    if (id) { DB.update('beneficiaries', id, data); DB.audit('beneficiary.update', 'beneficiaries', id, null, { name }, 'Pembaruan penerima manfaat'); U.toast('Data diperbarui.'); }
    else { const r = DB.insert('beneficiaries', { ...data, status: 'aktif', data_masked: true }); DB.audit('beneficiary.create', 'beneficiaries', r.id, null, { name }, 'Penerima manfaat baru'); U.toast('Penerima manfaat ditambahkan.'); }
    U.closeModal(); route();
  }
  function benDel(id) {
    const b = DB.get('beneficiaries', id);
    U.confirmDialog('Hapus Penerima Manfaat?', `"${U.esc(b.name)}" akan dihapus permanen dari data terproteksi.`, 'Ya, Hapus').then(ok => {
      if (!ok) return;
      DB.remove('beneficiaries', id);
      DB.audit('beneficiary.delete', 'beneficiaries', id, { name: b.name }, null, '');
      U.toast('Data dihapus.'); route();
    });
  }

  /* ============================================================
     MODUL: LAPORAN KEUANGAN
     ============================================================ */
  function pageKeuangan(params, u) {
    const tab = params.get('t') || 'ringkasan';
    const canManage = Auth.can('finance.manage', u), canExport = Auth.can('finance.export', u), canApprove = Auth.can('finance.approve_reports', u);
    const y = Number(params.get('y')) || new Date().getFullYear();
    const inYear = t => new Date(t.trx_date).getFullYear() === y;
    const trxY = DB.find('financial_transactions', t => inYear(t) && t.status === 'berhasil');
    const funds = Object.keys(U.FUNDS).map(f => {
      const ft = trxY.filter(t => t.fund_type === f);
      return { fund: f, masuk: ft.filter(t => t.direction === 'masuk').reduce((s, t) => s + t.amount, 0), keluar: ft.filter(t => t.direction === 'keluar').reduce((s, t) => s + t.amount, 0), saldo: DB.fundBalance(f) };
    });
    let body = '';
    if (tab === 'ringkasan') {
      body = `
      ${tbl(['Jenis Dana', 'Penerimaan ' + y, 'Penyaluran ' + y, 'Saldo Berjalan (semua periode)'], funds.map(f => `<tr>
        <td>${U.fundBadge(f.fund)}</td><td class="strong" style="color:var(--green-700)">${U.fmtRp(f.masuk)}</td>
        <td class="strong" style="color:var(--red-600)">${U.fmtRp(f.keluar)}</td><td class="strong">${U.fmtRp(f.saldo)}</td></tr>`).join('') +
        `<tr style="background:var(--green-50)"><td class="strong">TOTAL</td><td class="strong">${U.fmtRp(funds.reduce((s, f) => s + f.masuk, 0))}</td>
        <td class="strong">${U.fmtRp(funds.reduce((s, f) => s + f.keluar, 0))}</td><td class="strong">${U.fmtRp(funds.reduce((s, f) => s + f.saldo, 0))}</td></tr>`)}
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:20px">
        <div class="panel"><div class="panel-head"><h3>${U.icon('wallet', 15)} Rekening &amp; Kas</h3></div>
          <div class="panel-body">${tbl(['Rekening', 'Jenis', 'Nomor', 'Status'], DB.all('financial_accounts').map(a => `<tr>
            <td class="strong">${U.esc(a.name)}</td><td>${a.type === 'bank' ? 'Bank' : 'Kas'}</td><td>${U.esc(a.bank_name)} ${U.esc(a.number)}</td>
            <td><span class="badge badge-green">${U.esc(a.status)}</span></td></tr>`).join(''))}</div></div>
        <div class="panel"><div class="panel-head"><h3>${U.icon('file', 15)} Laporan Berkala</h3>
          <div class="right">${canManage ? `<button class="btn btn-sm btn-primary" onclick="AA.repGen()">+ Buat Laporan Periode</button>` : ''}</div></div>
          <div class="panel-body">${tbl(['Kode', 'Judul', 'Periode', 'Status', 'Aksi'], DB.all('financial_reports').map(r => `<tr>
            <td class="strong">${U.esc(r.report_code)}</td><td>${U.esc(r.title)}</td><td>${U.esc(r.period)} ${r.year}</td>
            <td>${r.status === 'disetujui' ? '<span class="badge badge-green">Disetujui</span>' : '<span class="badge badge-amber">Draf</span>'}</td>
            <td><div class="tbl-actions">
              <button class="icon-btn" title="Cetak PDF" onclick="AA.repPrint('${r.id}')">${U.icon('printer', 15)}</button>
              ${r.status === 'draf' && canApprove ? `<button class="icon-btn" title="Setujui" onclick="AA.repApprove('${r.id}')">${U.icon('check', 15)}</button>` : ''}
            </div></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Belum ada laporan.</div></td></tr>')}</div></div>
      </div>`;
    } else if (tab === 'transaksi') {
      const list = [...DB.all('financial_transactions')].sort((a, b) => new Date(b.trx_date) - new Date(a.trx_date)).slice(0, 80);
      body = tbl(['Tanggal', 'Kategori', 'Jenis Dana', 'Uraian', 'Ref', 'Arah', 'Jumlah'],
        list.map(t => `<tr><td>${U.fmtShort(t.trx_date)}</td><td>${U.esc(t.category_code)}</td><td>${U.fundBadge(t.fund_type)}</td>
        <td style="max-width:280px">${U.esc(t.description)}</td><td>${U.esc(t.ref_code)}</td>
        <td>${t.direction === 'masuk' ? '<span class="badge badge-green">Masuk</span>' : '<span class="badge badge-red">Keluar</span>'}</td>
        <td class="strong" style="text-align:right;color:${t.direction === 'masuk' ? 'var(--green-700)' : 'var(--red-600)'}">${t.direction === 'masuk' ? '+' : '−'}${U.fmtRp(t.amount)}</td></tr>`).join(''));
    } else if (tab === 'kategori') {
      body = tbl(['Kode', 'Nama Kategori', 'Jenis Dana', 'Arah', 'Status'], DB.all('financial_categories').map(c => `<tr>
        <td class="strong">${U.esc(c.code)}</td><td>${U.esc(c.name)}</td><td>${U.fundBadge(c.fund_type)}</td>
        <td>${c.direction === 'masuk' ? 'Pemasukan' : 'Pengeluaran'}</td><td><span class="badge badge-green">${U.esc(c.status)}</span></td></tr>`).join(''));
    }
    pg().innerHTML = `
    <div class="tabs">
      <a class="tab ${tab === 'ringkasan' ? 'active' : ''}" href="#/keuangan?t=ringkasan&y=${y}">Ringkasan ${y}</a>
      <a class="tab ${tab === 'transaksi' ? 'active' : ''}" href="#/keuangan?t=transaksi">Jurnal Transaksi</a>
      <a class="tab ${tab === 'kategori' ? 'active' : ''}" href="#/keuangan?t=kategori">Kategori &amp; Rekening</a>
      <div style="margin-left:auto;display:flex;gap:8px">
        ${tab === 'ringkasan' ? [...new Set(DB.all('financial_transactions').map(t => new Date(t.trx_date).getFullYear()))].sort((a, b) => b - a).map(yy => `<a class="chip ${yy === y ? 'active' : ''}" href="#/keuangan?t=ringkasan&y=${yy}">${yy}</a>`).join('') : ''}
        ${canExport ? `<button class="btn btn-sm btn-outline" onclick="AA.finExport('${tab}','${y}')">${U.icon('download', 14)} Excel</button>
        <button class="btn btn-sm btn-outline" onclick="AA.finPrint('${tab}','${y}')">${U.icon('printer', 14)} PDF</button>` : ''}
      </div>
    </div>
    <div class="panel"><div class="panel-head"><h3>${U.icon('file', 16)} ${tab === 'ringkasan' ? 'Ringkasan per Jenis Dana' : tab === 'transaksi' ? 'Jurnal Transaksi Keuangan' : 'Kategori Keuangan'}</h3></div>
    <div class="panel-body">${body}</div></div>
    <div class="note-box" style="margin-top:14px">${U.icon('shield', 14)} Dana terbatas (zakat/infak/sedekah/wakaf) <b>dicatat &amp; dipotong per kategori terpisah</b> — saldo tidak boleh saling menutupi. Seluruh baris jurnal dihasilkan otomatis dari transaksi terverifikasi.</div>`;
  }
  function repGen() {
    const now = new Date();
    U.modal('Buat Laporan Periode', `
      <div class="form-grid">
        <div><label>Tahun</label><input class="input" id="rg-year" type="number" value="${now.getFullYear()}"></div>
        <div><label>Periode</label><select class="select" id="rg-period"><option>Triwulan I</option><option>Triwulan II</option><option>Triwulan III</option><option>Triwulan IV</option><option>Semester I</option><option>Semester II</option><option>Tahunan</option></select></div>
      </div>
      <label>Judul laporan</label><input class="input" id="rg-title" placeholder="mis. Laporan Keuangan Triwulan IV 2026">`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.repGenDo()">Buat (Draf)</button>`);
  }
  function repGenDo() {
    const title = val('#rg-title');
    if (!title) { U.toast('Judul wajib diisi.', 'error'); return; }
    const r = DB.insert('financial_reports', {
      report_code: DB.codeMonth('LAP', 'financial_reports', 'report_code', 3),
      title, period: val('#rg-period'), year: num('#rg-year'), total_in: 0, total_out: 0, status: 'draf', note: '', approved_at: null, approved_by: ''
    });
    DB.audit('report.create', 'financial_reports', r.id, null, { title }, '');
    U.closeModal(); U.toast('Laporan draf dibuat.'); route();
  }
  function repApprove(id) {
    const u = Auth.currentAdmin();
    const r = DB.get('financial_reports', id);
    DB.update('financial_reports', id, { status: 'disetujui', approved_at: new Date().toISOString(), approved_by: u.name });
    DB.audit('report.approve', 'financial_reports', id, { status: r.status }, { status: 'disetujui' }, 'Laporan disetujui & tampil di halaman Transparansi publik');
    U.toast('Laporan disetujui & terbit di Transparansi.'); route();
  }
  function repPrint(id) { printReportById(id); }
  function finExport(tab, y) {
    const year = Number(y) || new Date().getFullYear();
    const inYear = t => new Date(t.trx_date).getFullYear() === year;
    const trxY = DB.find('financial_transactions', t => inYear(t) && t.status === 'berhasil');
    const funds = Object.keys(U.FUNDS).map(f => {
      const ft = trxY.filter(t => t.fund_type === f);
      return [U.fundLabel(f), ft.filter(t => t.direction === 'masuk').reduce((s, t) => s + Number(t.amount), 0), ft.filter(t => t.direction === 'keluar').reduce((s, t) => s + Number(t.amount), 0), DB.fundBalance(f)];
    });
    const jurnal = [...DB.all('financial_transactions')].sort((a, b) => new Date(a.trx_date) - new Date(b.trx_date))
      .map(t => [U.fmtShort(t.trx_date), t.category_code, U.fundLabel(t.fund_type), t.description, t.ref_code, t.direction, Number(t.amount), (t.status)]);
    X.xlsx('laporan-keuangan-' + year + '.xlsx', [
      { name: 'Ringkasan ' + year, title: 'Ringkasan per Jenis Dana ' + year, headers: ['Jenis Dana', 'Penerimaan (Rp)', 'Penyaluran (Rp)', 'Saldo Berjalan (Rp)'], rows: funds, widths: [24, 20, 20, 20], numCols: [1, 2, 3] },
      { name: 'Jurnal', title: 'Jurnal Transaksi Keuangan (semua periode)', headers: ['Tanggal', 'Kategori', 'Jenis Dana', 'Uraian', 'Ref', 'Arah', 'Jumlah (Rp)', 'Status'], rows: jurnal, widths: [14, 16, 14, 46, 18, 10, 16, 12], numCols: [6] },
      { name: 'Penyaluran', title: 'Penyaluran Dana per Jenis Dana', headers: ['Nomor', 'Program', 'Jenis Dana', 'Penerima Manfaat', 'Uraian', 'Jumlah (Rp)', 'Status', 'Tanggal Salur'], rows: DB.all('distributions').map(d => [d.dist_number, (DB.get('programs', d.program_id) || {}).name || '-', U.fundLabel(d.fund_type), (DB.get('beneficiaries', d.beneficiary_id) || {}).name || '-', d.description, Number(d.amount), (U.DIST_STATUS[d.status] || {}).label || d.status, U.fmtShort(d.disbursed_at)]), widths: [18, 28, 14, 22, 40, 16, 12, 14], numCols: [5] }
    ]);
    DB.audit('finance.export', 'financial_transactions', '-', null, { tab, year }, 'Ekspor laporan keuangan (Excel workbook 3 sheet)');
  }
  function finPrint(tab, y) {
    const year = Number(y) || new Date().getFullYear();
    const inYear = t => new Date(t.trx_date).getFullYear() === year;
    const trxY = DB.find('financial_transactions', t => inYear(t) && t.status === 'berhasil');
    const funds = Object.keys(U.FUNDS).map(f => {
      const ft = trxY.filter(t => t.fund_type === f);
      return { fund: f, masuk: ft.filter(t => t.direction === 'masuk').reduce((s, t) => s + Number(t.amount), 0), keluar: ft.filter(t => t.direction === 'keluar').reduce((s, t) => s + Number(t.amount), 0), saldo: DB.fundBalance(f) };
    });
    const jurnal = [...DB.all('financial_transactions')].filter(t => inYear(t) && t.status === 'berhasil').sort((a, b) => new Date(a.trx_date) - new Date(b.trx_date));
    const dists = DB.all('distributions').filter(d => d.disbursed_at && new Date(d.disbursed_at).getFullYear() === year)
      .map(d => ({ ...d, program_name: (DB.get('programs', d.program_id) || {}).name || '-' }));
    const d = X.financeReportPDF({
      title: 'Laporan Keuangan ' + year, year, periodNote: 'Periode Tahun ' + year,
      funds, jurnal, distributions: dists, s: DB.settings()
    });
    d.save('laporan-keuangan-' + year + '.pdf');
  }

  /* ============================================================
     MODUL: KONTEN WEBSITE (berita, galeri, testimoni, FAQ, profil)
     ============================================================ */
  function pageKonten(params, u) {
    const tab = params.get('t') || 'berita';
    const canManage = Auth.can('content.manage', u);
    let body = '';
    if (tab === 'berita') {
      body = tbl(['Judul', 'Kategori', 'Penulis', 'Tanggal', 'Dilihat', 'Publikasi', 'Aksi'], DB.all('news').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(n => `<tr>
        <td class="strong" style="max-width:280px">${U.esc(n.title)}</td><td><span class="badge badge-green">${U.esc(n.category)}</span></td>
        <td>${U.esc(n.author)}</td><td>${U.fmtShort(n.created_at)}</td><td>${U.fmtNum(n.views || 0)}</td>
        <td>${n.published ? '<span class="badge badge-green">Terbit</span>' : '<span class="badge badge-gray">Draf</span>'}</td>
        <td><div class="tbl-actions">${canManage ? `<button class="icon-btn" onclick="AA.newsForm('${n.id}')">${U.icon('edit', 15)}</button>
        <button class="icon-btn danger" onclick="AA.newsDel('${n.id}')">${U.icon('trash', 15)}</button>` : '-'}</div></td></tr>`).join(''));
    } else if (tab === 'galeri') {
      body = tbl(['Gambar', 'Judul', 'Kategori', 'Izin Foto', 'Status', 'Aksi'], DB.all('galleries').map(g => `<tr>
        <td><img src="${g.image}" style="width:64px;height:42px;object-fit:cover;border-radius:7px"></td>
        <td class="strong">${U.esc(g.title)}</td><td>${U.esc(g.category)}</td>
        <td>${g.consent ? '<span class="badge badge-green">Ada izin</span>' : '<span class="badge badge-red">Tanpa izin</span>'}</td>
        <td>${g.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>'}</td>
        <td><div class="tbl-actions">${canManage ? `<button class="icon-btn" onclick="AA.galForm('${g.id}')">${U.icon('edit', 15)}</button>
        <button class="icon-btn danger" onclick="AA.galDel('${g.id}')">${U.icon('trash', 15)}</button>` : '-'}</div></td></tr>`).join(''));
    } else if (tab === 'testimoni') {
      body = tbl(['Nama', 'Peran', 'Testimoni', 'Status', 'Aksi'], DB.all('testimonials').map(t => `<tr>
        <td class="strong">${U.esc(t.name)}</td><td>${U.esc(t.role)}</td><td style="max-width:320px">${U.esc(t.quote)}</td>
        <td>${t.approved ? '<span class="badge badge-green">Disetujui</span>' : '<span class="badge badge-amber">Menunggu</span>'}</td>
        <td><div class="tbl-actions">${canManage ? (t.approved
          ? `<button class="icon-btn" title="Batalkan persetujuan" onclick="AA.tstToggle('${t.id}')">${U.icon('x', 15)}</button>`
          : `<button class="icon-btn" title="Setujui" onclick="AA.tstToggle('${t.id}')">${U.icon('check', 15)}</button>`) + `<button class="icon-btn" onclick="AA.tstForm('${t.id}')">${U.icon('edit', 15)}</button>
        <button class="icon-btn danger" onclick="AA.tstDel('${t.id}')">${U.icon('trash', 15)}</button>` : '-'}</div></td></tr>`).join(''));
    } else if (tab === 'faq') {
      body = tbl(['No', 'Pertanyaan', 'Status', 'Aksi'], DB.all('faqs').sort((a, b) => (a.order || 0) - (b.order || 0)).map(f => `<tr>
        <td>${f.order}</td><td class="strong" style="max-width:420px">${U.esc(f.question)}</td>
        <td>${f.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>'}</td>
        <td><div class="tbl-actions">${canManage ? `<button class="icon-btn" onclick="AA.faqForm('${f.id}')">${U.icon('edit', 15)}</button>
        <button class="icon-btn danger" onclick="AA.faqDel('${f.id}')">${U.icon('trash', 15)}</button>` : '-'}</div></td></tr>`).join(''));
    } else if (tab === 'profil') {
      const s = DB.settings();
      body = `
      <div class="form-grid">
        <div><label>Tentang (ringkas)</label><textarea class="textarea" id="ct-about">${U.esc(s.about)}</textarea></div>
        <div><label>Sejarah</label><textarea class="textarea" id="ct-history" style="min-height:130px">${U.esc(s.history)}</textarea></div>
        <div><label>Visi</label><textarea class="textarea" id="ct-vision">${U.esc(s.vision)}</textarea></div>
        <div><label>Misi (satu per baris)</label><textarea class="textarea" id="ct-mission" style="min-height:130px">${U.esc(s.mission.join('\n'))}</textarea></div>
        <div><label>SK / Legalitas</label><input class="input" id="ct-sk" value="${U.esc(s.legal_sk)}"></div>
        <div><label>NPWP</label><input class="input" id="ct-npwp" value="${U.esc(s.legal_npwp)}"></div>
        <div><label>Akreditasi / keanggotaan</label><input class="input" id="ct-akre" value="${U.esc(s.legal_akreditasi)}"></div>
        <div><label>Alamat</label><input class="input" id="ct-address" value="${U.esc(s.address)}"></div>
        <div><label>Telepon</label><input class="input" id="ct-phone" value="${U.esc(s.phone)}"></div>
        <div><label>WhatsApp (62…)</label><input class="input" id="ct-wa" value="${U.esc(s.wa)}"></div>
        <div><label>Email</label><input class="input" id="ct-email" value="${U.esc(s.email)}"></div>
        <div><label>Google Maps embed URL</label><input class="input" id="ct-maps" value="${U.esc(s.maps_embed_url)}" placeholder="https://www.google.com/maps/embed?pb=…"></div>
      </div>
      ${canManage ? `<button class="btn btn-primary" style="margin-top:16px" onclick="AA.profileSave()">${U.icon('check', 15)} Simpan Konten Profil</button>` : ''}
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:16px">Struktur Organisasi</h3>
      ${canManage ? `<button class="btn btn-sm btn-primary" onclick="AA.orgForm()">+ Tambah Pengurus</button>` : ''}</div>
      ${tbl(['Nama', 'Jabatan', 'Level', 'Aksi'], DB.all('organization_structures').sort((a, b) => a.level - b.level).map(o => `<tr>
        <td class="strong">${U.esc(o.name)}</td><td>${U.esc(o.position)}</td><td>${o.level}</td>
        <td><div class="tbl-actions">${canManage ? `<button class="icon-btn" onclick="AA.orgForm('${o.id}')">${U.icon('edit', 15)}</button>
        <button class="icon-btn danger" onclick="AA.orgDel('${o.id}')">${U.icon('trash', 15)}</button>` : '-'}</div></td></tr>`).join(''))}`;
    }
    pg().innerHTML = `
    <div class="tabs">
      ${[['berita', 'Berita'], ['galeri', 'Galeri'], ['testimoni', 'Testimoni'], ['faq', 'FAQ'], ['profil', 'Profil &amp; Struktur']].map(t => `<a class="tab ${tab === t[0] ? 'active' : ''}" href="#/konten?t=${t[0]}">${t[1]}</a>`).join('')}
      <div style="margin-left:auto">${tab !== 'profil' && canManage ? `<button class="btn btn-sm btn-primary" onclick="AA.${tab === 'berita' ? 'newsForm' : tab === 'galeri' ? 'galForm' : tab === 'testimoni' ? 'tstForm' : 'faqForm'}()">+ Tambah</button>` : ''}</div>
    </div>
    <div class="panel"><div class="panel-head"><h3>${U.icon('image', 16)} Konten: ${tab}</h3></div><div class="panel-body">${body}</div></div>`;
  }
  function newsForm(id) {
    const n = id ? DB.get('news', id) : null;
    const u = Auth.currentAdmin();
    U.modal(n ? 'Ubah Berita' : 'Tulis Berita Baru', `
      <label>Judul <span class="req">*</span></label><input class="input" id="nf-title" value="${U.esc(n ? n.title : '')}">
      <div class="form-grid">
        <div><label>Kategori</label><select class="select" id="nf-cat">${['Kegiatan', 'Laporan', 'Pengumuman', 'Artikel'].map(c => `<option ${n && n.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>Penulis</label><input class="input" id="nf-author" value="${U.esc(n ? n.author : u.name)}"></div>
      </div>
      <label>Ringkasan (excerpt)</label><textarea class="textarea" id="nf-ex">${U.esc(n ? n.excerpt : '')}</textarea>
      <label>Isi artikel (paragraf dipisah baris kosong)</label><textarea class="textarea" id="nf-content" style="min-height:160px">${U.esc(n ? n.content : '')}</textarea>
      <label>Gambar utama</label><input class="input" type="file" id="nf-img" accept="image/*" onchange="AA.pickImg(this)">
      <input type="hidden" id="nf-imgdata" value="${n ? n.image : ''}">
      <label class="check"><input type="checkbox" id="nf-pub" ${!n || n.published ? 'checked' : ''}> Terbitkan di website publik</label>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.newsSave('${id || ''}')">Simpan</button>`, { wide: true });
  }
  function newsSave(id) {
    const title = val('#nf-title');
    if (!title) { U.toast('Judul wajib diisi.', 'error'); return; }
    const data = { title, category: val('#nf-cat'), author: val('#nf-author'), excerpt: val('#nf-ex'), content: val('#nf-content'), image: val('#nf-imgdata') || U.placeholder('BERITA', 800, 460, Math.floor(Math.random() * 8)), published: U.$('#nf-pub').checked };
    if (id) { DB.update('news', id, data); DB.audit('news.update', 'news', id, null, { title }, ''); U.toast('Berita diperbarui.'); }
    else { const r = DB.insert('news', { ...data, views: 0 }); DB.audit('news.create', 'news', r.id, null, { title }, ''); U.toast('Berita tersimpan.'); }
    U.closeModal(); route();
  }
  function newsDel(id) {
    const n = DB.get('news', id);
    U.confirmDialog('Hapus Berita?', `"${U.esc(n.title)}" akan dihapus.`, 'Ya, Hapus').then(ok => { if (!ok) return; DB.remove('news', id); DB.audit('news.delete', 'news', id, { title: n.title }, null, ''); U.toast('Berita dihapus.'); route(); });
  }
  function galForm(id) {
    const g = id ? DB.get('galleries', id) : null;
    U.modal(g ? 'Ubah Galeri' : 'Tambah Foto Galeri', `
      <label>Judul/foto caption <span class="req">*</span></label><input class="input" id="gf-title" value="${U.esc(g ? g.title : '')}">
      <label>Kategori</label><select class="select" id="gf-cat">${['Kegiatan', 'Kesehatan', 'Pendidikan', 'Bantuan Bencana', 'Wakaf', 'Sosial & Keagamaan', 'Pemberdayaan'].map(c => `<option ${g && g.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label>Gambar</label><input class="input" type="file" id="gf-img" accept="image/*" onchange="AA.pickImg(this)">
      <input type="hidden" id="gf-imgdata" value="${g ? g.image : ''}">
      <label class="check"><input type="checkbox" id="gf-consent" ${!g || g.consent ? 'checked' : ''}> Pemilik foto memberikan izin publikasi (consent)</label>
      <label class="check"><input type="checkbox" id="gf-active" ${!g || g.status === 'aktif' ? 'checked' : ''}> Tampilkan di galeri publik</label>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.galSave('${id || ''}')">Simpan</button>`);
  }
  function galSave(id) {
    const title = val('#gf-title');
    if (!title) { U.toast('Judul wajib diisi.', 'error'); return; }
    const data = { title, category: val('#gf-cat'), image: val('#gf-imgdata') || U.placeholder('GALERI', 640, 420, Math.floor(Math.random() * 8)), consent: U.$('#gf-consent').checked, status: U.$('#gf-active').checked ? 'aktif' : 'nonaktif' };
    if (id) { DB.update('galleries', id, data); DB.audit('gallery.update', 'galleries', id, null, { title }, ''); U.toast('Galeri diperbarui.'); }
    else { const r = DB.insert('galleries', data); DB.audit('gallery.create', 'galleries', r.id, null, { title }, ''); U.toast('Foto ditambahkan.'); }
    U.closeModal(); route();
  }
  function galDel(id) {
    const g = DB.get('galleries', id);
    U.confirmDialog('Hapus Foto?', `"${U.esc(g.title)}" akan dihapus.`, 'Ya, Hapus').then(ok => { if (!ok) return; DB.remove('galleries', id); DB.audit('gallery.delete', 'galleries', id, { title: g.title }, null, ''); U.toast('Foto dihapus.'); route(); });
  }
  function tstForm(id) {
    const t = id ? DB.get('testimonials', id) : null;
    U.modal(t ? 'Ubah Testimoni' : 'Tambah Testimoni', `
      <div class="form-grid">
        <div><label>Nama <span class="req">*</span></label><input class="input" id="tf-name" value="${U.esc(t ? t.name : '')}"></div>
        <div><label>Peran (mis. Penerima Beasiswa)</label><input class="input" id="tf-role" value="${U.esc(t ? t.role : '')}"></div>
      </div>
      <label>Isi testimoni</label><textarea class="textarea" id="tf-quote">${U.esc(t ? t.quote : '')}</textarea>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.tstSave('${id || ''}')">Simpan</button>`);
  }
  function tstSave(id) {
    const name = val('#tf-name');
    if (!name || !val('#tf-quote')) { U.toast('Nama & isi testimoni wajib.', 'error'); return; }
    const data = { name, role: val('#tf-role'), quote: val('#tf-quote') };
    if (id) { DB.update('testimonials', id, data); DB.audit('testimonial.update', 'testimonials', id, null, { name }, ''); U.toast('Testimoni diperbarui.'); }
    else { const r = DB.insert('testimonials', { ...data, approved: false, photo_consent: true, status: 'menunggu' }); DB.audit('testimonial.create', 'testimonials', r.id, null, { name }, ''); U.toast('Testimoni ditambahkan (menunggu persetujuan).'); }
    U.closeModal(); route();
  }
  function tstToggle(id) {
    const t = DB.get('testimonials', id);
    DB.update('testimonials', id, { approved: !t.approved, status: !t.approved ? 'disetujui' : 'menunggu' });
    DB.audit('testimonial.moderate', 'testimonials', id, { approved: t.approved }, { approved: !t.approved }, '');
    route();
  }
  function tstDel(id) {
    const t = DB.get('testimonials', id);
    U.confirmDialog('Hapus Testimoni?', `"${U.esc(t.name)}" akan dihapus.`, 'Ya, Hapus').then(ok => { if (!ok) return; DB.remove('testimonials', id); DB.audit('testimonial.delete', 'testimonials', id, { name: t.name }, null, ''); U.toast('Testimoni dihapus.'); route(); });
  }
  function faqForm(id) {
    const f = id ? DB.get('faqs', id) : null;
    U.modal(f ? 'Ubah FAQ' : 'Tambah FAQ', `
      <label>Pertanyaan <span class="req">*</span></label><input class="input" id="ff-q" value="${U.esc(f ? f.question : '')}">
      <label>Jawaban</label><textarea class="textarea" id="ff-a">${U.esc(f ? f.answer : '')}</textarea>
      <div class="form-grid">
        <div><label>Urutan</label><input class="input" id="ff-order" type="number" value="${f ? f.order : DB.all('faqs').length + 1}"></div>
        <div><label>Status</label><select class="select" id="ff-status"><option value="aktif" ${f && f.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${f && f.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
      </div>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.faqSave('${id || ''}')">Simpan</button>`);
  }
  function faqSave(id) {
    if (!val('#ff-q') || !val('#ff-a')) { U.toast('Pertanyaan & jawaban wajib.', 'error'); return; }
    const data = { question: val('#ff-q'), answer: val('#ff-a'), order: num('#ff-order'), status: val('#ff-status') };
    if (id) { DB.update('faqs', id, data); DB.audit('faq.update', 'faqs', id, null, { question: data.question }, ''); U.toast('FAQ diperbarui.'); }
    else { const r = DB.insert('faqs', data); DB.audit('faq.create', 'faqs', r.id, null, { question: data.question }, ''); U.toast('FAQ ditambahkan.'); }
    U.closeModal(); route();
  }
  function faqDel(id) {
    const f = DB.get('faqs', id);
    U.confirmDialog('Hapus FAQ?', 'Pertanyaan akan dihapus dari halaman publik.', 'Ya, Hapus').then(ok => { if (!ok) return; DB.remove('faqs', id); DB.audit('faq.delete', 'faqs', id, { question: f.question }, null, ''); U.toast('FAQ dihapus.'); route(); });
  }
  function profileSave() {
    DB.setSettings({
      about: val('#ct-about'), history: val('#ct-history'), vision: val('#ct-vision'),
      mission: val('#ct-mission').split('\n').map(x => x.trim()).filter(Boolean),
      legal_sk: val('#ct-sk'), legal_npwp: val('#ct-npwp'), legal_akreditasi: val('#ct-akre'),
      address: val('#ct-address'), phone: val('#ct-phone'), wa: val('#ct-wa'), email: val('#ct-email'),
      maps_embed_url: val('#ct-maps')
    });
    DB.audit('content.profile_save', 'institution_settings', 'settings', null, null, 'Konten halaman profil diperbarui');
    U.toast('Konten profil tersimpan. Halaman publik langsung diperbarui.');
    route();
  }
  function orgForm(id) {
    const o = id ? DB.get('organization_structures', id) : null;
    U.modal(o ? 'Ubah Pengurus' : 'Tambah Pengurus', `
      <label>Nama <span class="req">*</span></label><input class="input" id="of-name" value="${U.esc(o ? o.name : '')}">
      <div class="form-grid">
        <div><label>Jabatan</label><input class="input" id="of-pos" value="${U.esc(o ? o.position : '')}"></div>
        <div><label>Level (1 teratas)</label><input class="input" id="of-level" type="number" min="1" value="${o ? o.level : 1}"></div>
      </div>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.orgSave('${id || ''}')">Simpan</button>`);
  }
  function orgSave(id) {
    if (!val('#of-name')) { U.toast('Nama wajib diisi.', 'error'); return; }
    const data = { name: val('#of-name'), position: val('#of-pos'), level: num('#of-level') };
    if (id) { DB.update('organization_structures', id, data); DB.audit('org.update', 'organization_structures', id, null, data, ''); }
    else { const r = DB.insert('organization_structures', data); DB.audit('org.create', 'organization_structures', r.id, null, data, ''); }
    U.closeModal(); U.toast('Struktur organisasi diperbarui.'); route();
  }
  function orgDel(id) {
    U.confirmDialog('Hapus Pengurus?', 'Data akan dihapus dari struktur organisasi.', 'Ya, Hapus').then(ok => { if (!ok) return; DB.remove('organization_structures', id); DB.audit('org.delete', 'organization_structures', id, null, null, ''); U.toast('Data dihapus.'); route(); });
  }

  /* ============================================================
     MODUL: PENGGUNA & PERAN (RBAC)
     ============================================================ */
  function pagePengguna(params, u) {
    const tab = params.get('t') || 'pengguna';
    const canManage = Auth.can('users.manage', u);
    let body = '';
    if (tab === 'pengguna') {
      body = tbl(['Nama', 'Email', 'Peran', 'Status', 'Login Terakhir', 'Aksi'], DB.all('profiles').map(p => `<tr>
        <td class="strong">${U.esc(p.name)}</td><td>${U.esc(p.email)}</td>
        <td><span class="badge badge-gold">${U.esc(p.role_label)}</span></td>
        <td>${p.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-red">Nonaktif</span>'}</td>
        <td>${p.last_login ? U.timeAgo(p.last_login) : 'belum pernah'}</td>
        <td><div class="tbl-actions">${canManage ? `
          <button class="icon-btn" title="Ubah" onclick="AA.usrForm('${p.id}')">${U.icon('edit', 15)}</button>
          <button class="icon-btn" title="Reset password" onclick="AA.usrReset('${p.id}')">${U.icon('key', 15)}</button>
          <button class="icon-btn" title="${p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}" onclick="AA.usrToggle('${p.id}')">${p.status === 'aktif' ? U.icon('x', 15) : U.icon('check', 15)}</button>
          ${p.id !== u.id ? `<button class="icon-btn danger" title="Hapus" onclick="AA.usrDel('${p.id}')">${U.icon('trash', 15)}</button>` : ''}` : '-'}</div></td></tr>`).join(''));
    } else {
      const roles = DB.all('roles');
      const perms = DB.all('permissions');
      body = `<div class="info-box" style="margin-bottom:12px">Matriks izin per peran. <code>*</code> = akses penuh (Super Admin). Perubahan hanya oleh <b>Super Admin</b> dan tercatat di Audit Trail.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Izin (modul.aksi)</th>${roles.map(r => `<th style="text-align:center">${r.name}</th>`).join('')}</tr></thead><tbody>
      ${perms.map(pm => `<tr><td class="strong">${pm.code}</td>${roles.map(r => `<td style="text-align:center">
        <input type="checkbox" data-perm="${pm.code}" data-role="${r.key}" ${r.permissions.includes('*') || r.permissions.includes(pm.code) ? 'checked' : ''} ${r.permissions.includes('*') || !canManage ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      ${canManage ? `<button class="btn btn-primary" style="margin-top:16px" onclick="AA.matrixSave()">${U.icon('check', 15)} Simpan Matriks Izin</button>` : ''}`;
    }
    pg().innerHTML = `
    <div class="tabs">
      <a class="tab ${tab === 'pengguna' ? 'active' : ''}" href="#/pengguna?t=pengguna">Pengguna (${DB.all('profiles').length})</a>
      <a class="tab ${tab === 'peran' ? 'active' : ''}" href="#/pengguna?t=peran">Peran &amp; Matriks Izin</a>
      <div style="margin-left:auto">${tab === 'pengguna' && canManage ? `<button class="btn btn-sm btn-primary" onclick="AA.usrForm()">+ Tambah Pengguna</button>` : ''}</div>
    </div>
    <div class="panel"><div class="panel-head"><h3>${U.icon('shield', 16)} ${tab === 'pengguna' ? 'Manajemen Pengguna Admin' : 'Kontrol Akses Berbasis Peran (8 peran)'}</h3></div>
    <div class="panel-body">${body}</div></div>`;
  }
  function usrForm(id) {
    const p = id ? DB.get('profiles', id) : null;
    const roles = DB.all('roles');
    U.modal(p ? 'Ubah Pengguna' : 'Tambah Pengguna Admin', `
      <label>Nama lengkap <span class="req">*</span></label><input class="input" id="uf-name" value="${U.esc(p ? p.name : '')}">
      <div class="form-grid">
        <div><label>Email <span class="req">*</span></label><input class="input" id="uf-email" type="email" value="${U.esc(p ? p.email : '')}"></div>
        <div><label>Peran</label><select class="select" id="uf-role">${roles.map(r => `<option value="${r.key}" ${p && p.role_key === r.key ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
      </div>
      ${p ? '' : `<label>Password awal</label><input class="input" id="uf-pass" type="text" placeholder="minimal 6 karakter">`}
      <div class="form-grid">
        <div><label>Status</label><select class="select" id="uf-status"><option value="aktif" ${p && p.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${p && p.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
      </div>`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.usrSave('${id || ''}')">Simpan</button>`);
  }
  function usrSave(id) {
    const name = val('#uf-name'), email = val('#uf-email');
    if (!name || !email) { U.toast('Nama & email wajib.', 'error'); return; }
    if (id) {
      const res = Auth.updateUser(id, { name, email, role_key: val('#uf-role'), status: val('#uf-status') });
      if (!res.ok) { U.toast(res.message, 'error'); return; }
      U.toast('Pengguna diperbarui.');
    } else {
      const res = Auth.createUser({ name, email, role_key: val('#uf-role'), password: val('#uf-pass') });
      if (!res.ok) { U.toast(res.message, 'error'); return; }
      U.toast('Pengguna dibuat.');
    }
    U.closeModal(); route();
  }
  function usrReset(id) {
    U.modal('Reset Password', `
      <label>Password baru (min. 6 karakter)</label><input class="input" id="ur-pass" type="text">`,
      `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" onclick="AA.usrResetDo('${id}')">Reset</button>`);
  }
  function usrResetDo(id) {
    const res = Auth.resetPassword(id, val('#ur-pass'));
    if (!res.ok) { U.toast(res.message, 'error'); return; }
    U.closeModal(); U.toast('Password direset.'); route();
  }
  function usrToggle(id) { Auth.toggleUser(id); route(); }
  function usrDel(id) {
    const p = DB.get('profiles', id);
    U.confirmDialog('Hapus Pengguna?', `"${U.esc(p.name)}" tidak dapat masuk lagi.`, 'Ya, Hapus').then(ok => { if (!ok) return; Auth.deleteUser(id); U.toast('Pengguna dihapus.'); route(); });
  }
  function matrixSave() {
    const checks = document.querySelectorAll('input[data-perm][data-role]:not(:disabled)');
    const byRole = {};
    checks.forEach(c => {
      const k = c.getAttribute('data-role');
      byRole[k] = byRole[k] || [];
      if (c.checked) byRole[k].push(c.getAttribute('data-perm'));
    });
    let n = 0;
    Object.keys(byRole).forEach(k => { const res = Auth.saveRolePermissions(k, byRole[k]); if (res.ok) n++; });
    U.toast(n + ' peran diperbarui & tercatat di Audit Trail.');
    route();
  }

  /* ============================================================
     MODUL: PENGATURAN SISTEM
     ============================================================ */
  function pagePengaturan(params, u) {
    const tab = params.get('t') || 'identitas';
    const s = DB.settings(), z = DB.zakat();
    const badge = ok => ok ? '<span class="badge badge-green">TERHUBUNG</span>' : '<span class="badge badge-red">BELUM TERHUBUNG</span>';
    let body = '';
    if (tab === 'identitas') {
      body = `<div class="form-grid">
        <div><label>Nama lembaga</label><input class="input" id="st-name" value="${U.esc(s.name)}"></div>
        <div><label>Tagline</label><input class="input" id="st-tag" value="${U.esc(s.tagline)}"></div>
        <div><label>Alamat</label><input class="input" id="st-addr" value="${U.esc(s.address)}"></div>
        <div><label>Telepon</label><input class="input" id="st-phone" value="${U.esc(s.phone)}"></div>
        <div><label>WhatsApp (62…)</label><input class="input" id="st-wa" value="${U.esc(s.wa)}"></div>
        <div><label>Email</label><input class="input" id="st-email" value="${U.esc(s.email)}"></div>
        <div><label>Google Maps embed URL</label><input class="input" id="st-maps" value="${U.esc(s.maps_embed_url)}" placeholder="https://www.google.com/maps/embed?pb=…"></div>
        <div><label>Link peta (fallback)</label><input class="input" id="st-mapslink" value="${U.esc(s.maps_link)}"></div>
      </div>
      <label class="check"><input type="checkbox" id="st-demo" ${s.demo_mode ? 'checked' : ''}> MODE DEMO aktif (banner demo &amp; simulasi webhook diizinkan)</label>
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.setIdSave()">${U.icon('check', 15)} Simpan Identitas</button>`;
    } else if (tab === 'bank') {
      body = `<p class="hint" style="margin-bottom:10px">Rekening resmi yang ditampilkan pada website publik &amp; instruksi donasi.</p>
      ${tbl(['Bank', 'Nomor', 'Atas Nama', 'Aksi'], s.banks.map((b, i) => `<tr>
        <td><input class="input" value="${U.esc(b.bank)}" onchange="AA.bankEdit(${i},'bank',this.value)"></td>
        <td><input class="input" value="${U.esc(b.number)}" onchange="AA.bankEdit(${i},'number',this.value)"></td>
        <td><input class="input" value="${U.esc(b.holder)}" onchange="AA.bankEdit(${i},'holder',this.value)"></td>
        <td><button class="icon-btn danger" onclick="AA.bankDel(${i})">${U.icon('trash', 15)}</button></td></tr>`).join(''))}
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.bankAdd()">+ Tambah Rekening</button>`;
    } else if (tab === 'gateway') {
      const g = s.payment_gateway;
      body = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px"><b>Status:</b> ${badge(g.connected)}
        <span class="hint">Webhook endpoint (Edge Function): <code>POST /functions/v1/payment-webhook</code> — verifikasi signature sebelum update status.</span></div>
      <div class="form-grid">
        <div><label>Provider</label><select class="select" id="gw-provider">${['midtrans', 'xendit', 'tripay', 'duitku', 'lainnya'].map(p => `<option ${g.provider === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div><label>Merchant / Client ID</label><input class="input" id="gw-merchant" value="${U.esc(g.merchant_id)}"></div>
        <div><label>Server API Key (rahasia)</label><input class="input" id="gw-key" type="password" value="${U.esc(g.api_key)}" placeholder="kosongkan bila tidak berubah"></div>
        <div><label>Client Key (publik)</label><input class="input" id="gw-client" value="${U.esc(g.client_key)}"></div>
      </div>
      <div class="danger-box" style="margin-top:12px">Pada produksi, <b>server API key hanya disimpan di server (Supabase Edge Function secret)</b> — tidak pernah dikirim ke browser. Status menjadi TERHUBUNG hanya setelah API key terisi &amp; webhook terverifikasi.</div>
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.gwSave()">${U.icon('check', 15)} Simpan Konfigurasi Gateway</button>`;
    } else if (tab === 'integrasi') {
      const w = s.whatsapp_api, sm = s.smtp, gm = s.gemini;
      body = `
      <div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>WhatsApp API</h3><div class="right">${badge(w.connected)}</div></div>
        <div class="panel-body"><div class="form-grid">
          <div><label>Provider</label><select class="select" id="wa-provider">${['Fonnte', 'WABLAS', 'Twilio', 'Meta Cloud API'].map(p => `<option ${w.provider === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div><label>Token API</label><input class="input" id="wa-token" type="password" value="${U.esc(w.token)}"></div>
          <div><label>Nomor pengirim</label><input class="input" id="wa-sender" value="${U.esc(w.sender)}" placeholder="62812…"></div>
        </div>
        <div class="info-box" style="margin-top:10px">Mode kirim saat ini: <b>${(window.WA && WA.status().connected) ? 'API otomatis via ' + U.esc(WA.status().provider) + ' (Edge Function)' : 'MANUAL (tautan wa.me)'}</b>. Token disimpan sebagai <b>secret Edge Function</b> pada produksi — bukan di frontend. Antrean notifikasi dikelola di modul <a href="#/wa-outbox" style="text-decoration:underline">Outbox WhatsApp</a>.</div>
        <button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="AA.waTest()">${U.icon('send', 14)} Kirim Pesan Uji WhatsApp</button>
        </div></div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>Email / SMTP (kuitansi &amp notifikasi)</h3><div class="right">${badge(sm.connected)}</div></div>
        <div class="panel-body"><div class="form-grid">
          <div><label>SMTP host</label><input class="input" id="sm-host" value="${U.esc(sm.host)}" placeholder="smtp.gmail.com"></div>
          <div><label>Port</label><input class="input" id="sm-port" type="number" value="${sm.port || 587}"></div>
          <div><label>Username</label><input class="input" id="sm-user" value="${U.esc(sm.user)}"></div>
          <div><label>Password</label><input class="input" id="sm-pass" type="password" value="${U.esc(sm.pass)}"></div>
          <div><label>Alamat pengirim (from)</label><input class="input" id="sm-from" value="${U.esc(sm.from)}"></div>
        </div></div></div>
      <div class="panel"><div class="panel-head"><h3>AI Assistant (Gemini) — opsional</h3><div class="right">${badge(gm.connected)}</div></div>
        <div class="panel-body"><div class="form-grid">
          <div><label>Gemini API Key</label><input class="input" id="gm-key" type="password" value="${U.esc(gm.api_key)}" placeholder="untuk draf berita &amp; laporan (Tahap 3)"></div>
        </div></div></div>
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.intSave()">${U.icon('check', 15)} Simpan Integrasi</button>`;
    } else if (tab === 'kuitansi') {
      const r = s.receipt;
      body = `<div class="form-grid">
        <div><label>Prefix nomor kuitansi</label><input class="input" id="rc-prefix" value="${U.esc(r.prefix)}"></div>
        <div><label>Penandatangan</label><input class="input" id="rc-signer" value="${U.esc(r.signer_name)}"></div>
        <div><label>Jabatan penandatangan</label><input class="input" id="rc-title" value="${U.esc(r.signer_title)}"></div>
      </div>
      <label>Catatan kaki kuitansi</label><textarea class="textarea" id="rc-note">${U.esc(r.footer_note)}</textarea>
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.rcSave()">${U.icon('check', 15)} Simpan Pengaturan Kuitansi</button>`;
    } else if (tab === 'seo') {
      const se = s.seo;
      body = `<div class="form-grid">
        <div><label>Meta title</label><input class="input" id="se-title" value="${U.esc(se.meta_title)}"></div>
        <div><label>Meta description</label><input class="input" id="se-desc" value="${U.esc(se.meta_description)}"></div>
      </div>
      <label>Meta keywords</label><input class="input" id="se-key" value="${U.esc(se.meta_keywords)}">
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.seoSave()">${U.icon('check', 15)} Simpan SEO</button>`;
    } else if (tab === 'zakat') {
      body = `<div class="form-grid">
        <div><label>Harga emas per gram (Rp)</label><input class="input" id="zk-gold" type="number" value="${z.gold_price_gram}"></div>
        <div><label>Nisab emas (gram)</label><input class="input" id="zk-nisab" type="number" value="${z.nisab_gold_gram}"></div>
        <div><label>Kadar zakat (%)</label><input class="input" id="zk-rate" type="number" step="0.1" value="${z.rate_pct}"></div>
      </div>
      <label>Catatan standar (tampil di kalkulator publik)</label><textarea class="textarea" id="zk-info">${U.esc(z.info)}</textarea>
      <div class="info-box" style="margin-top:10px">Nisab penghasilan terhitung: <b>${U.fmtRp(z.nisab_gold_gram * z.gold_price_gram)}</b> per tahun.</div>
      <button class="btn btn-primary" style="margin-top:14px" onclick="AA.zkSave()">${U.icon('check', 15)} Simpan Parameter Zakat</button>`;
    } else if (tab === 'supabase') {
      const c = window.SUPA ? SUPA.cfg() : { url: '', anon: '' };
      const on = window.SUPA && SUPA.active();
      body = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px"><b>Status:</b> ${on ? '<span class="badge badge-green">TERHUBUNG</span>' : '<span class="badge badge-amber">MODE DEMO LOKAL</span>'}
        <span class="hint">${on ? 'Aplikasi membaca & menulis langsung ke Supabase (PostgreSQL) sesuai aturan RLS.' : 'Data tersimpan di localStorage browser. Isi kredensial untuk bermigrasi ke Supabase asli.'}</span></div>
      <div class="form-grid">
        <div><label>Supabase URL</label><input class="input" id="sb-url" value="${U.esc(c.url)}" placeholder="https://xxxxx.supabase.co"></div>
        <div><label>Anon / public API key</label><input class="input" id="sb-anon" type="password" value="${U.esc(c.anon)}" placeholder="eyJhbGciOi…"></div>
      </div>
      <div class="info-box" style="margin-top:12px">Anon key aman untuk frontend karena dilindungi Row Level Security. <b>Service role key TIDAK BOLEH</b> berada di frontend. Langkah lengkap ada di berkas <b>MIGRASI-SUPABASE.md</b>: (1) jalankan supabase/schema.sql di SQL Editor, (2) buat pengguna di Authentication, (3) deploy Edge Functions payment-webhook / whatsapp-send / email-send, (4) isi kredensial di sini, (5) ekspor SQL migrasi data lokal.</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="AA.supaSave()">${U.icon('check', 15)} Simpan & Muat Ulang</button>
        <button class="btn btn-outline" onclick="AA.supaTest()">${U.icon('zap', 15)} Uji Koneksi</button>
        <button class="btn btn-outline" onclick="AA.supaMigrate(false)">${U.icon('download', 15)} SQL Migrasi — Konten & Keuangan</button>
        <button class="btn btn-outline" onclick="AA.supaMigrate(true)">${U.icon('download', 15)} SQL Migrasi — Lengkap + Donasi</button>
        ${on ? `<button class="btn btn-ghost" onclick="location.reload()">${U.icon('refresh', 15)} Muat Ulang Data</button>` : ''}
        <button class="btn btn-danger" onclick="AA.supaDisconnect()">${U.icon('logout', 15)} Putuskan (kembali DEMO)</button>
      </div>`;
    } else if (tab === 'backup') {
      body = `<div class="grid grid-2">
        <div class="card card-pad"><b>Ekspor Seluruh Data</b><p class="hint" style="margin:8px 0">Unduh salinan JSON seluruh basis data (29 tabel) untuk cadangan atau migrasi ke Supabase.</p>
          <button class="btn btn-primary" onclick="AA.backupExport()">${U.icon('download', 15)} Unduh Backup JSON</button></div>
        <div class="card card-pad"><b>Pulihkan dari Backup</b><p class="hint" style="margin:8px 0">Impor file backup JSON (menimpa data saat ini).</p>
          <input class="input" type="file" id="bk-file" accept="application/json" onchange="AA.backupImport(this)"></div>
        <div class="card card-pad" style="border-color:#fecaca"><b style="color:var(--red-600)">Reset Data Demo</b><p class="hint" style="margin:8px 0">Menghapus seluruh perubahan dan mengembalikan data seed demo awal.</p>
          <button class="btn btn-danger" onclick="AA.backupReset()">${U.icon('refresh', 15)} Reset ke Data Demo</button></div>
        <div class="card card-pad"><b>Status Sistem</b><p class="hint" style="margin:8px 0">Mode: <b>${s.demo_mode ? 'DEMO' : 'PRODUKSI'}</b> · Gateway: ${s.payment_gateway.connected ? 'TERHUBUNG' : 'BELUM TERHUBUNG'} · WA API: ${s.whatsapp_api.connected ? 'TERHUBUNG' : 'BELUM TERHUBUNG'} · SMTP: ${s.smtp.connected ? 'TERHUBUNG' : 'BELUM TERHUBUNG'}</p></div>
      </div>`;
    }
    pg().innerHTML = `
    <div class="tabs">${[['identitas', 'Identitas &amp; Kontak'], ['bank', 'Rekening Bank'], ['gateway', 'Payment Gateway'], ['integrasi', 'Integrasi Lain'], ['kuitansi', 'Kuitansi'], ['seo', 'SEO'], ['zakat', 'Kalkulator Zakat'], ['supabase', 'Supabase (Produksi)'], ['backup', 'Backup &amp; Data']].map(t => `<a class="tab ${tab === t[0] ? 'active' : ''}" href="#/pengaturan?t=${t[0]}">${t[1]}</a>`).join('')}</div>
    <div class="panel"><div class="panel-head"><h3>${U.icon('settings', 16)} Pengaturan: ${tab}</h3></div><div class="panel-body">${body}</div></div>`;
  }

  /* ============================================================
     MODUL: OUTBOX WHATSAPP & EMAIL (Tahap 2)
     ============================================================ */
  function pageWaOutbox(params, u) {
    const ch = params.get('ch') || '';
    const list = WA.rows(ch);
    const st = WA.status();
    const canManage = Auth.can('outbox.manage', u);
    const pending = DB.find('notifications', n => n.channel && n.wa_status === 'pending').length;
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('send', 16)} Outbox Notifikasi (${list.length})</h3>
        <div class="right">
          <span style="margin-right:8px">WhatsApp: ${WA.statusBadge()}</span>
          ${canManage ? `<button class="btn btn-sm btn-primary" onclick="AA.outboxSendAll()">${U.icon('send', 14)} Kirim ${pending} Menunggu</button>
          <button class="btn btn-outline btn-sm" onclick="AA.waTest()">${U.icon('zap', 14)} Pesan Uji</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="AA.outboxExport()">${U.icon('download', 14)} Excel</button>
        </div></div>
      <div class="panel-body">
        <div class="filter-bar" style="margin-bottom:12px">
          <div class="f"><label>Kanal</label><select class="select" onchange="location.hash='#/wa-outbox'+(this.value?'?ch='+this.value:'')">
            <option value="">Semua</option><option value="whatsapp" ${ch === 'whatsapp' ? 'selected' : ''}>WhatsApp</option><option value="email" ${ch === 'email' ? 'selected' : ''}>Email</option></select></div>
          <div class="f grow"><span class="hint">Mode kirim: <b>${st.connected ? 'API otomatis via ' + U.esc(st.provider) + ' (Edge Function whatsapp-send)' : 'MANUAL — tautan wa.me dibuka per pesan (klik ikon kirim). Untuk kirim otomatis: isi Token API di Pengaturan → Integrasi + aktifkan Supabase.'}</b></span></div>
        </div>
        ${tbl(['Waktu', 'Kanal', 'Tujuan', 'Pesan', 'Status', 'Aksi'], list.slice(0, 100).map(n => `<tr>
          <td>${U.fmtDateTime(n.created_at)}</td>
          <td>${n.channel === 'email' ? '<span class="badge badge-blue">Email</span>' : '<span class="badge badge-green">WhatsApp</span>'}</td>
          <td class="strong">${U.esc(n.wa_phone || '-')}</td>
          <td style="max-width:300px"><b>${U.esc(n.title)}</b><br><span class="hint">${U.esc((n.wa_message || '').slice(0, 80))}…</span></td>
          <td>${WA.wBadge(n.wa_status)}${n.wa_error ? `<br><span class="hint">${U.esc(String(n.wa_error).slice(0, 60))}</span>` : ''}</td>
          <td><div class="tbl-actions">
            <button class="icon-btn" title="Lihat pesan" onclick="AA.outboxView('${n.id}')">${U.icon('eye', 14)}</button>
            ${n.wa_status !== 'terkirim' ? `<button class="icon-btn" title="Kirim" onclick="AA.outboxSend('${n.id}')">${U.icon('send', 14)}</button>` : ''}
          </div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Belum ada pesan dalam antrean. Pesan dibuat otomatis saat donasi dibuat & saat pembayaran terverifikasi.</div></td></tr>')}
      </div>
    </div>`;
  }
  function outboxView(id) {
    const n = DB.get('notifications', id);
    if (!n) return;
    U.modal('Detail Pesan — ' + U.esc(n.title), `
      <div class="mini-stat"><span>Kanal</span><b>${n.channel === 'email' ? 'Email (SMTP)' : 'WhatsApp'}</b></div>
      <div class="mini-stat"><span>Tujuan</span><b>${U.esc(n.wa_phone || '-')}</b></div>
      <div class="mini-stat"><span>Referensi</span><b>${U.esc(n.wa_ref || '-')}</b></div>
      <div class="mini-stat"><span>Status</span><b>${WA.wBadge(n.wa_status)}</b></div>
      <div class="mini-stat"><span>Terjadwal</span><b>${U.fmtDateTime(n.created_at)}</b></div>
      <label style="margin-top:10px">Isi pesan</label>
      <pre style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap">${U.esc(n.wa_message || '')}</pre>`,
      `<button class="btn btn-ghost" data-close>Tutup</button>${n.wa_status !== 'terkirim' ? `<button class="btn btn-primary" onclick="AA.outboxSend('${n.id}')">${U.icon('send', 14)} Kirim Sekarang</button>` : ''}`, { wide: true });
  }
  async function outboxSend(id) {
    U.toast('Memproses pengiriman…', 'info');
    const res = await WA.sendOne(id, { fallbackManual: true });
    U.toast(res.ok ? (res.via === 'api' ? 'Terkirim via API.' : 'Tautan wa.me/mailto dibuka — pesan dikirim dari akun Anda (manual).') : res.message, res.ok ? 'success' : 'error');
    route();
  }
  async function outboxSendAll() {
    U.toast('Memproses seluruh pesan menunggu…', 'info');
    const r = await WA.sendPending(20);
    U.toast(r.total ? `${r.ok}/${r.total} pesan diproses — periksa status pada tabel.` : 'Tidak ada pesan menunggu.');
    route();
  }
  function outboxExport() {
    X.tableXLSX('outbox-notifikasi-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Outbox Notifikasi',
      ['Waktu', 'Kanal', 'Tujuan', 'Judul', 'Status', 'Referensi'],
      WA.rows().map(n => [U.fmtDateTime(n.created_at), n.channel, n.wa_phone || '', n.title, (WA.WSTATUS[n.wa_status] || {}).label || n.wa_status, n.wa_ref || '']),
      { widths: [20, 12, 18, 40, 16, 20] });
  }

  /* ============================================================
     MODUL: AUDIT TRAIL
     ============================================================ */
  function pageAudit(params, u) {
    const q = (params.get('q') || '').toLowerCase(), ent = params.get('ent') || '';
    let list = [...DB.all('audit_logs')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const ents = [...new Set(list.map(x => x.entity))];
    if (ent) list = list.filter(x => x.entity === ent);
    if (q) list = list.filter(x => (x.user + ' ' + x.action + ' ' + x.entity + ' ' + (x.note || '')).toLowerCase().includes(q));
    pg().innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${U.icon('activity', 16)} Jejak Audit (${list.length} entri)</h3>
        <div class="right">
          <button class="btn btn-outline btn-sm" onclick="AA.auditExport()">${U.icon('download', 14)} Ekspor Excel</button>
          <select class="select" style="width:180px" onchange="location.hash='#/audit?ent='+this.value">
            <option value="">Semua entitas</option>${ents.map(e => `<option ${e === ent ? 'selected' : ''}>${e}</option>`).join('')}</select>
          <input class="input" style="width:200px" placeholder="Cari pengguna/aksi…" value="${U.esc(params.get('q') || '')}"
            onkeydown="if(event.key==='Enter')location.hash='#/audit?q='+encodeURIComponent(this.value)">
        </div></div>
      <div class="panel-body">
        ${tbl(['Waktu', 'Pengguna', 'Peran', 'Aksi', 'Entitas', 'Catatan', ''], list.slice(0, 100).map(x => `<tr>
          <td>${U.fmtDateTime(x.created_at)}</td><td class="strong">${U.esc(x.user)}</td><td>${U.esc(x.role)}</td>
          <td><code>${U.esc(x.action)}</code></td><td>${U.esc(x.entity)}</td>
          <td style="max-width:260px">${U.esc((x.note || '').slice(0, 90))}${(x.note || '').length > 90 ? '…' : ''}</td>
          <td><button class="icon-btn" onclick="AA.auditDetail('${x.id}')">${U.icon('eye', 14)}</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Belum ada jejak audit.</div></td></tr>')}
        ${list.length > 100 ? `<p class="hint" style="margin-top:10px">Menampilkan 100 dari ${list.length} entri — gunakan filter.</p>` : ''}
      </div>
    </div>`;
  }
  function auditDetail(id) {
    const x = DB.get('audit_logs', id);
    const pre = v => v ? `<pre style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:10px;font-size:11.5px;overflow-x:auto;white-space:pre-wrap">${U.esc(JSON.stringify(JSON.parse(v), null, 2))}</pre>` : '<span class="hint">—</span>';
    U.modal('Detail Jejak Audit', `
      <div class="mini-stat"><span>Waktu</span><b>${U.fmtDateTime(x.created_at)}</b></div>
      <div class="mini-stat"><span>Pengguna</span><b>${U.esc(x.user)} (${U.esc(x.role)})</b></div>
      <div class="mini-stat"><span>Aksi</span><b><code>${U.esc(x.action)}</code></b></div>
      <div class="mini-stat"><span>Entitas / ID</span><b>${U.esc(x.entity)} / ${U.esc(x.entity_id)}</b></div>
      <div class="mini-stat"><span>Catatan</span><b>${U.esc(x.note || '-')}</b></div>
      <div class="divider"></div>
      <b style="font-size:13px">Nilai lama</b>${pre(x.old_values)}
      <b style="font-size:13px">Nilai baru</b>${pre(x.new_values)}`, `<button class="btn btn-ghost" data-close>Tutup</button>`, { wide: true });
  }

  /* ---------- CETAK LAPORAN DARI ADMIN ---------- */
  function printReportById(id) {
    const r = DB.get('financial_reports', id);
    if (!r) return;
    const rows = DB.find('financial_transactions', t => t.status === 'berhasil');
    const inRows = rows.filter(t => t.direction === 'masuk'), outRows = rows.filter(t => t.direction === 'keluar');
    const s = DB.settings();
    U.printHTML(r.title, `
      <div class="head"><div><h1>${U.esc(s.name)}</h1><div class="muted">${U.esc(s.address)}</div></div>
      <div style="text-align:right"><b>LAPORAN KEUANGAN RESMI</b><div class="muted">${U.esc(r.report_code)} · ${U.esc(r.period)} ${r.year}</div>
      <div class="muted">Status: ${r.status.toUpperCase()}${r.approved_by ? ' (' + U.esc(r.approved_by) + ')' : ''}</div></div></div>
      <h2>A. Penerimaan per Jenis Dana</h2>
      <table><thead><tr><th>Jenis Dana</th><th class="rp">Jumlah</th></tr></thead><tbody>
      ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(inRows.filter(t => t.fund_type === f).reduce((x, t) => x + t.amount, 0))}</td></tr>`).join('')}
      <tr><th>Total</th><th class="rp">${U.fmtRp(inRows.reduce((x, t) => x + t.amount, 0))}</th></tr></tbody></table>
      <h2>B. Penyaluran per Jenis Dana</h2>
      <table><thead><tr><th>Jenis Dana</th><th class="rp">Jumlah</th></tr></thead><tbody>
      ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(outRows.filter(t => t.fund_type === f).reduce((x, t) => x + t.amount, 0))}</td></tr>`).join('')}
      <tr><th>Total</th><th class="rp">${U.fmtRp(outRows.reduce((x, t) => x + t.amount, 0))}</th></tr></tbody></table>
      <h2>C. Saldo per Jenis Dana</h2>
      <table><thead><tr><th>Jenis Dana</th><th class="rp">Saldo</th></tr></thead><tbody>
      ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(DB.fundBalance(f))}</td></tr>`).join('')}</tbody></table>
      <p class="muted" style="margin-top:16px">${U.esc(r.note || '')} Dihasilkan otomatis dari transaksi terverifikasi pada ${U.fmtDateTime(new Date().toISOString())}.</p>
      <div style="text-align:right;margin-top:26px"><div style="display:inline-block;border-top:1px solid #333;padding-top:6px;min-width:200px">${U.esc(s.receipt.signer_name)}<br><span class="muted">${U.esc(s.receipt.signer_title)}</span></div></div>`);
  }

  /* ---------- AKSI GLOBAL ADMIN ---------- */
  window.AA = {
    async login(e) {
      e.preventDefault();
      const res = await Auth.adminLogin(val('#lg-email'), U.$('#lg-pass').value);
      if (!res.ok) { U.toast(res.message, 'error'); return false; }
      U.toast('Selamat datang, ' + res.user.name + '!');
      location.hash = '#/dashboard';
      return false;
    },
    logout() {
      Auth.adminLogout();
      U.toast('Anda telah keluar dari panel admin.');
      location.hash = '#/login';
      route();
    },
    toggleBell(e) {
      e.stopPropagation();
      const m = U.$('#bell-menu');
      if (m) m.classList.toggle('open');
    },
    markAllRead() {
      const u = Auth.currentAdmin();
      DB.all('notifications').forEach(n => { if (!n.target_role || n.target_role === u.role_key) n.read = true; });
      DB.save();
      U.toast('Semua notifikasi ditandai dibaca.');
      route();
    },
    pickImg(el) {
      if (!el.files || !el.files[0]) return;
      U.readImageResized(el.files[0], 820, data => {
        const hid = document.getElementById(el.id + 'data');
        if (hid) hid.value = data;
        U.toast('Gambar siap disimpan (' + Math.round(data.length / 1024) + ' KB).');
      });
    },
    openReceipt,
    printReportById,
    progForm, progSave: id => progSave(id), progDel,
    campForm, campToggle, campDel, campSave: id => campSave(id),
    donForm, donDetail, donExport, donExportPdf, recCancel, donSave: id => donSave(id), donDel,
    trxDetail, trxVerify, trxVerifyDo, trxFail, trxReconcile, trxReconcileDo, trxCorrect, trxCorrectDo, trxExport, trxExportPdf,
    distForm, distSyncBal, distSave, distVerify, distApprove, distDisburse, distDisburseDo, distFinish, distFinishDo, distReject, distRejectDo, viewProof,
    benForm, benSave: id => benSave(id), benDel,
    repGen, repGenDo, repApprove, finExport, finPrint, repPrint: id => printReportById(id),
    newsForm, newsSave: id => newsSave(id), newsDel, galForm, galSave: id => galSave(id), galDel,
    tstForm, tstSave: id => tstSave(id), tstToggle, tstDel, faqForm, faqSave: id => faqSave(id), faqDel,
    profileSave, orgForm, orgSave: id => orgSave(id), orgDel,
    usrForm, usrSave: id => usrSave(id), usrReset, usrResetDo, usrToggle, usrDel, matrixSave,
    setIdSave() {
      DB.setSettings({
        name: val('#st-name'), tagline: val('#st-tag'), address: val('#st-addr'), phone: val('#st-phone'),
        wa: val('#st-wa'), email: val('#st-email'), maps_embed_url: val('#st-maps'), maps_link: val('#st-mapslink'),
        demo_mode: U.$('#st-demo').checked
      });
      DB.audit('settings.identity', 'institution_settings', 'settings', null, null, 'Identitas & kontak lembaga diperbarui');
      U.toast('Identitas tersimpan.');
      route();
    },
    bankEdit(i, k, v) { const b = DB.settings().banks; b[i][k] = v; DB.setSettings({ banks: b }); DB.audit('settings.bank_edit', 'institution_settings', 'settings', null, null, 'Rekening diubah'); },
    bankDel(i) { const b = DB.settings().banks; b.splice(i, 1); DB.setSettings({ banks: b }); DB.audit('settings.bank_delete', 'institution_settings', 'settings', null, null, ''); U.toast('Rekening dihapus.'); route(); },
    bankAdd() { const b = DB.settings().banks; b.push({ bank: 'Bank Baru', number: '', holder: DB.settings().name }); DB.setSettings({ banks: b }); DB.audit('settings.bank_add', 'institution_settings', 'settings', null, null, ''); route(); },
    gwSave() {
      const g = { ...DB.settings().payment_gateway };
      g.provider = val('#gw-provider'); g.merchant_id = val('#gw-merchant'); g.client_key = val('#gw-client');
      const k = val('#gw-key');
      if (k) g.api_key = k;
      g.connected = !!g.api_key;
      DB.setSettings({ payment_gateway: g });
      DB.audit('settings.gateway', 'institution_settings', 'settings', null, { provider: g.provider, connected: g.connected }, g.connected ? 'API key tersimpan. Produksi: simpan sebagai Edge Function secret, frontend hanya client key.' : 'API key kosong → BELUM TERHUBUNG');
      U.toast(g.connected ? 'Gateway TERHUBUNG (mode demo). Di produksi: pasang webhook + verifikasi signature di Edge Function.' : 'Konfigurasi disimpan — status BELUM TERHUBUNG (API key kosong).', g.connected ? 'success' : 'warn');
      route();
    },
    intSave() {
      const w = { provider: val('#wa-provider'), token: val('#wa-token'), sender: val('#wa-sender'), connected: !!val('#wa-token') };
      const sm = { host: val('#sm-host'), port: num('#sm-port'), user: val('#sm-user'), pass: val('#sm-pass'), from: val('#sm-from'), connected: !!(val('#sm-host') && val('#sm-user')) };
      const gm = { api_key: val('#gm-key'), connected: !!val('#gm-key') };
      DB.setSettings({ whatsapp_api: w, smtp: sm, gemini: gm });
      DB.audit('settings.integrations', 'institution_settings', 'settings', null, { wa: w.connected, smtp: sm.connected, gemini: gm.connected }, 'Konfigurasi integrasi diperbarui');
      U.toast('Integrasi tersimpan.');
      route();
    },
    rcSave() {
      DB.setSettings({ receipt: { prefix: val('#rc-prefix'), footer_note: val('#rc-note'), signer_name: val('#rc-signer'), signer_title: val('#rc-title') } });
      DB.audit('settings.receipt', 'institution_settings', 'settings', null, null, 'Pengaturan kuitansi diperbarui');
      U.toast('Pengaturan kuitansi tersimpan.');
      route();
    },
    seoSave() {
      DB.setSettings({ seo: { meta_title: val('#se-title'), meta_description: val('#se-desc'), meta_keywords: val('#se-key') } });
      DB.audit('settings.seo', 'institution_settings', 'settings', null, null, 'SEO diperbarui');
      U.toast('SEO tersimpan.');
      route();
    },
    zkSave() {
      DB.setZakat({ gold_price_gram: num('#zk-gold'), nisab_gold_gram: num('#zk-nisab'), rate_pct: num('#zk-rate'), info: val('#zk-info') });
      DB.audit('settings.zakat', 'zakat_settings', 'settings', null, null, 'Parameter kalkulator zakat diperbarui');
      U.toast('Parameter zakat tersimpan.');
      route();
    },
    backupExport() { U.downloadJSON('backup-filantropi-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json', DB.exportAll()); },
    backupImport(el) {
      const f = el.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = e => {
        try {
          const ok = DB.importAll(JSON.parse(e.target.result));
          if (ok) { U.toast('Backup berhasil dipulihkan.'); route(); } else U.toast('Format backup tidak valid.', 'error');
        } catch (err) { U.toast('File tidak dapat dibaca.', 'error'); }
      };
      rd.readAsText(f);
    },
    backupReset() {
      U.confirmDialog('Reset Data Demo?', 'SELURUH data akan dihapus dan dikembalikan ke seed demo awal. Tindakan ini tidak dapat dibatalkan.', 'Ya, Reset Semua').then(ok => {
        if (!ok) return;
        DB.resetDemo();
      });
    },
    /* ---------- TAHAP 2: OUTBOX, WHATSAPP, SUPABASE, EKSPOR ---------- */
    waTest: () => WA.testSend(),
    outboxView, outboxSend, outboxSendAll, outboxExport,
    distExport() {
      X.tableXLSX('penyaluran-dana.xlsx', 'Penyaluran Dana',
        ['Nomor', 'Program', 'Jenis Dana', 'Penerima Manfaat', 'Uraian', 'Jumlah (Rp)', 'Status', 'Tanggal Salur', 'Diajukan Oleh'],
        DB.all('distributions').map(d => [d.dist_number, (DB.get('programs', d.program_id) || {}).name || '-', U.fundLabel(d.fund_type), (DB.get('beneficiaries', d.beneficiary_id) || {}).name || '-', d.description, Number(d.amount), (U.DIST_STATUS[d.status] || {}).label || d.status, U.fmtShort(d.disbursed_at), d.requested_by || '']),
        { numCols: [5], widths: [18, 28, 14, 22, 42, 16, 12, 14, 18] });
      DB.audit('distributions.export', 'distributions', '-', null, null, 'Ekspor penyaluran (Excel .xlsx)');
    },
    auditExport() {
      X.tableXLSX('audit-trail.xlsx', 'Jejak Audit',
        ['Waktu', 'Pengguna', 'Peran', 'Aksi', 'Entitas', 'ID Entitas', 'Catatan'],
        [...DB.all('audit_logs')].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(x => [U.fmtDateTime(x.created_at), x.user, x.role, x.action, x.entity, x.entity_id, x.note || '']),
        { widths: [20, 20, 16, 26, 20, 20, 50] });
      DB.audit('audit.export', 'audit_logs', '-', null, null, 'Ekspor jejak audit (Excel .xlsx)');
    },
    supaSave() {
      const url = val('#sb-url'), anon = val('#sb-anon');
      if (!url || !anon) { U.toast('Supabase URL dan anon key wajib diisi.', 'error'); return; }
      SUPA.saveCfg(url, anon);
      DB.audit('settings.supabase', 'institution_settings', 'settings', null, { url }, 'Konfigurasi Supabase disimpan — memuat ulang aplikasi');
      U.toast('Tersimpan. Memuat ulang aplikasi dengan Supabase…');
      setTimeout(() => location.reload(), 900);
    },
    async supaTest() {
      const url = val('#sb-url'), anon = val('#sb-anon');
      if (!url || !anon) { U.toast('Isi URL dan anon key terlebih dahulu.', 'error'); return; }
      U.toast('Menguji koneksi ke Supabase…', 'info');
      const r = await SUPA.testConnection(url, anon);
      U.toast(r.message, r.ok ? 'success' : 'error');
    },
    supaDisconnect() {
      U.confirmDialog('Putuskan Supabase?', 'Aplikasi akan kembali ke MODE DEMO lokal. Data pada proyek Supabase tidak terhapus.', 'Ya, Putuskan').then(ok => {
        if (!ok) return;
        SUPA.clearCfg();
        location.reload();
      });
    },
    supaMigrate(full) {
      SUPA.downloadMigrationSQL(full);
      DB.audit('settings.supabase_migrate', 'institution_settings', 'settings', null, { full }, full ? 'Ekspor SQL migrasi lengkap (termasuk donasi & donatur)' : 'Ekspor SQL migrasi konten & keuangan');
    },
    auditDetail
  };
  document.addEventListener('click', e => {
    const bm = document.getElementById('bell-menu');
    if (bm && bm.classList.contains('open') && !e.target.closest('.bell-wrap')) bm.classList.remove('open');
  });

  /* ---------- PETA RUTE ---------- */
  const PAGES = {
    '/login': pageLogin, '/dashboard': pageDashboard, '/program': pageProgram, '/kampanye': pageKampanye,
    '/donatur': pageDonatur, '/transaksi': pageTransaksi, '/penyaluran': pagePenyaluran, '/penerima': pagePenerima,
    '/keuangan': pageKeuangan, '/konten': pageKonten, '/pengguna': pagePengguna, '/pengaturan': pagePengaturan,
    '/wa-outbox': pageWaOutbox, '/audit': pageAudit
  };
  return { init: () => { window.addEventListener('hashchange', route); route(); } };
})();
