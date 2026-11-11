'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — PUBLIC WEBSITE
   Rute: #/ (beranda), profil, program, donasi, pembayaran,
   cek-status, transparansi, berita, kalkulator-zakat, galeri,
   faq, area-donatur, kuitansi.
   ============================================================ */
const PublicApp = (() => {
  const appEl = () => document.getElementById('app');

  /* ---------- ROUTER ---------- */
  const ROUTES = [
    ['/', pageHome], ['/profil', pageProfil], ['/program', pagePrograms],
    ['/program/:id', pageProgramDetail], ['/donasi', pageDonasi],
    ['/pembayaran/:code', pagePembayaran], ['/cek-status', pageCekStatus],
    ['/transparansi', pageTransparansi], ['/berita', pageBerita],
    ['/berita/:id', pageBeritaDetail], ['/kalkulator-zakat', pageZakat],
    ['/galeri', pageGaleri], ['/faq', pageFaq], ['/area-donatur', pageAreaDonatur],
    ['/kuitansi/:code', pageKuitansi]
  ];
  function parseHash() {
    let h = location.hash.slice(1) || '/';
    if (!h.startsWith('/')) h = '/' + h;
    const parts = h.split('?');
    return { path: parts[0] || '/', params: new URLSearchParams(parts[1] || '') };
  }
  function matchRoute(path) {
    const seg = path.split('/').filter(Boolean);
    for (const [pattern, fn] of ROUTES) {
      const ps = pattern.split('/').filter(Boolean);
      if (pattern === '/' && seg.length === 0) return { fn, m: {} };
      if (ps.length !== seg.length) continue;
      const m = {}; let ok = true;
      ps.forEach((p, i) => { if (p.startsWith(':')) m[p.slice(1)] = decodeURIComponent(seg[i]); else if (p !== seg[i]) ok = false; });
      if (ok) return { fn, m };
    }
    return { fn: page404, m: {} };
  }
  function route() {
    const { path, params } = parseHash();
    const { fn, m } = matchRoute(path);
    U.closeModal();
    fn(m, params);
    window.scrollTo({ top: 0 });
    updateActiveNav();
  }
  function updateActiveNav() {
    const { path } = parseHash();
    document.querySelectorAll('#navbar a[data-path]').forEach(a => {
      const p = a.getAttribute('data-path');
      a.classList.toggle('active', p === '/' ? path === '/' : path.startsWith(p));
    });
  }

  /* ---------- INIT ---------- */
  function init() {
    DB.load();
    const n = DB.expireStale();
    if (n) U.toast(n + ' transaksi melewati batas 24 jam → Kedaluwarsa (otomatis)', 'info');
    renderBanner(); renderTopbar(); renderNav(); renderFooter(); applySeo();
    window.addEventListener('hashchange', route);
    route();
  }
  function applySeo() {
    const s = DB.settings();
    if (s.seo && s.seo.meta_title) document.title = s.seo.meta_title;
    const md = document.querySelector('meta[name="description"]');
    if (md && s.seo && s.seo.meta_description) md.setAttribute('content', s.seo.meta_description);
  }
  function renderBanner() {
    const s = DB.settings();
    const el = document.getElementById('demo-banner');
    if (!s.demo_mode || sessionStorage.getItem('flms_demo_dismiss')) { el.innerHTML = ''; return; }
    el.innerHTML = `<b>MODE DEMO</b> — Aplikasi berjalan dengan data simulasi. Status pembayaran hanya diubah melalui simulasi webhook bertanda DEMO; di produksi hanya webhook payment gateway terverifikasi. <button onclick="PA.dismissDemo()" aria-label="Tutup">&times;</button>`;
  }
  function renderTopbar() {
    const s = DB.settings();
    document.getElementById('topbar').innerHTML = `<div class="container">
      <div class="tb-item tb-hide">${U.icon('phone', 13)}&nbsp;${U.esc(s.phone)} &nbsp;·&nbsp; ${U.icon('mail', 13)}&nbsp;${U.esc(s.email)}</div>
      <div class="tb-item">${U.icon('heart', 13)}&nbsp;Zakat · Infak · Sedekah · Wakaf &nbsp;|&nbsp; <a href="#/area-donatur">Area Donatur</a> &nbsp;|&nbsp; <a href="#" onclick="return PA.openAdminLogin()" title="Masuk panel pengelola lembaga">${U.icon('lock', 13)}&nbsp;Portal Pengelola</a></div>
    </div>`;
  }
  const NAV_LINKS = [['Beranda', '/'], ['Profil', '/profil'], ['Program', '/program'], ['Transparansi', '/transparansi'], ['Berita', '/berita'], ['Kalkulator Zakat', '/kalkulator-zakat'], ['Galeri', '/galeri'], ['FAQ', '/faq']];
  function renderNav() {
    const s = DB.settings();
    document.getElementById('navbar').innerHTML = `<div class="container">
      <a class="brand" href="#/">${U.logoSvg(44)}<span>${U.esc(s.name)}<small>Filantropi Management System</small></span></a>
      <ul class="nav-links">${NAV_LINKS.map(l => `<li><a href="#${l[1]}" data-path="${l[1]}">${l[0]}</a></li>`).join('')}</ul>
      <div class="nav-cta">
        <a class="btn btn-ghost btn-sm" href="#" onclick="return PA.openAdminLogin()" title="Masuk panel pengelola lembaga">${U.icon('lock', 15)} Masuk</a>
        <a class="btn btn-ghost btn-sm" href="#/area-donatur">${U.icon('user', 15)} Area Donatur</a>
        <a class="btn btn-gold" href="#/donasi">${U.icon('heart', 16)} DONASI SEKARANG</a>
      </div>
      <button class="hamburger" onclick="PA.toggleMenu()" aria-label="Menu">${U.icon('menu', 24)}</button>
    </div>`;
    document.getElementById('mobile-menu').innerHTML =
      NAV_LINKS.map(l => `<a href="#${l[1]}">${l[0]}</a>`).join('') +
      `<a href="#/area-donatur">Area Donatur</a><a href="#" onclick="return PA.openAdminLogin()">${'\ud83d\udd12'} Portal Pengelola</a><a href="#/donasi" style="color:var(--green-700);font-weight:800">DONASI SEKARANG →</a>`;
    const wa = document.getElementById('wa-float');
    wa.href = `https://wa.me/${(s.wa || '').replace(/\D/g, '')}?text=${encodeURIComponent('Assalamualaikum, saya ingin bertanya tentang donasi ' + s.name)}`;
  }
  function renderFooter() {
    const s = DB.settings();
    document.getElementById('site-footer').innerHTML = `<div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="#/" style="color:#fff">${U.logoSvg(42)}<span style="color:#fff">${U.esc(s.name)}<small>Filantropi Management System</small></span></a>
          <p style="font-size:13.5px;margin-top:14px;color:#cbd5e1">${U.esc(s.tagline)}. ${U.esc((s.about || '').slice(0, 150))}…</p>
          <div class="fi" style="margin-top:12px">${U.icon('pin', 15)} ${U.esc(s.address)}</div>
        </div>
        <div>
          <h4>Tautan Cepat</h4>
          <ul>
            <li><a href="#/profil">Profil Lembaga</a></li>
            <li><a href="#/program">Program &amp; Kampanye</a></li>
            <li><a href="#/transparansi">Transparansi Dana</a></li>
            <li><a href="#/berita">Berita &amp; Dokumentasi</a></li>
            <li><a href="#/kalkulator-zakat">Kalkulator Zakat</a></li>
            <li><a href="#/galeri">Galeri &amp; Testimoni</a></li>
            <li><a href="#/faq">FAQ</a></li>
            <li><a href="#/area-donatur">Area Donatur</a></li>
            <li><a href="#" onclick="return PA.openAdminLogin()">Portal Pengelola (Masuk Admin)</a></li>
          </ul>
        </div>
        <div>
          <h4>Jenis Dana</h4>
          <ul>${Object.values(U.FUNDS).map(f => `<li><a href="#/donasi?fund=${Object.keys(U.FUNDS).find(k => U.FUNDS[k] === f)}">${f.label}</a></li>`).join('')}</ul>
          <h4 style="margin-top:18px">Rekening Resmi</h4>
          ${(s.banks || []).map(b => `<div class="fi">${U.icon('wallet', 14)} ${U.esc(b.bank)} · ${U.esc(b.number)}</div>`).join('')}
        </div>
        <div>
          <h4>Kontak &amp; Newsletter</h4>
          <div class="fi">${U.icon('phone', 15)} ${U.esc(s.phone)}</div>
          <div class="fi">${U.icon('mail', 15)} ${U.esc(s.email)}</div>
          <div class="fi">${U.icon('chat', 15)} WhatsApp: +${U.esc(s.wa)}</div>
          <p style="font-size:13px;margin-top:12px;color:#a7f3d0">Dapatkan kabar penyaluran &amp; laporan transparansi tiap bulan.</p>
          <div class="newsletter-form">
            <input class="input" id="nl-email" type="email" placeholder="Email Anda" aria-label="Email newsletter">
            <button class="btn btn-gold" onclick="PA.subscribe()">${U.icon('send', 15)}</button>
          </div>
          <p class="hint" style="color:#86efac" id="nl-msg"></p>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${U.esc(s.name)}. Seluruh hak cipta. ${s.demo_mode ? '· MODE DEMO' : ''}</span>
        <span>SK: ${U.esc(s.legal_sk)} · NPWP: ${U.esc(s.legal_npwp)}</span>
      </div>
    </div>`;
  }

  /* ---------- KOMPONEN ---------- */
  const pageHero = (title, sub, crumbs = []) => `
    <div class="page-hero"><div class="container">
      ${crumbs.length ? `<div class="breadcrumb">${crumbs.map((c, i) => (i ? ' › ' : '') + `<a href="${c[1]}">${c[0]}</a>`).join('')}</div>` : ''}
      <h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}
    </div></div>`;
  const pctOf = (raised, target) => Math.min(100, target ? Math.round(raised / target * 100) : 0);
  const programCard = p => {
    const raised = DB.programRaised(p.id), pct = pctOf(raised, p.target);
    return `<div class="card program-card">
      <div class="pc-img" style="background-image:url('${p.image}')"><span class="badge badge-gold">${U.esc(p.category)}</span></div>
      <div class="pc-body">
        <h3>${U.esc(p.name)}</h3>
        <p class="pc-desc">${U.esc(p.short_desc)}</p>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="mini-stat"><span>Terkumpul: <b>${U.fmtRp(raised)}</b></span><span>${pct}% dari ${U.fmtRp(p.target)}</span></div>
        <a class="btn btn-primary btn-block" href="#/donasi?program=${p.id}">${U.icon('heart', 15)} DONASI SEKARANG</a>
        <a href="#/program/${p.id}" class="hint" style="text-align:center">Lihat detail program →</a>
      </div></div>`;
  };
  const campaignCard = c => {
    const p = DB.get('programs', c.program_id);
    const raised = p ? DB.programRaised(p.id) : 0, pct = pctOf(raised, c.target);
    const dl = U.daysLeft(c.ends_at);
    return `<div class="card program-card">
      <div class="pc-img" style="background-image:url('${c.image || (p && p.image) || ''}')">
        <span class="badge badge-amber">${U.icon('clock', 12)} ${dl > 0 ? dl + ' hari lagi' : 'Segera berakhir'}</span></div>
      <div class="pc-body">
        <h3>${U.esc(c.title)}</h3>
        <p class="pc-desc">${U.esc(c.short_desc)}</p>
        <div class="progress"><i class="gold" style="width:${pct}%"></i></div>
        <div class="mini-stat"><span>Terkumpul: <b>${U.fmtRp(raised)}</b></span><span>${pct}% dari ${U.fmtRp(c.target)}</span></div>
        <a class="btn btn-gold btn-block" href="#/donasi?program=${c.program_id}&fund=${c.fund_type}">${U.icon('heart', 15)} DONASI KAMPANYE</a>
      </div></div>`;
  };

  /* ============================================================
     HALAMAN: BERANDA
     ============================================================ */
  function pageHome() {
    const st = DB.stats();
    const programs = DB.find('programs', p => p.status === 'aktif' && p.featured).slice(0, 6);
    const campaigns = DB.find('campaigns', c => c.status === 'aktif').slice(0, 3);
    const news = DB.find('news', n => n.published).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
    const testi = DB.find('testimonials', t => t.approved).slice(0, 3);
    const gal = DB.all('galleries').filter(g => g.status === 'aktif').slice(0, 4);
    const balances = st.balances;
    appEl().innerHTML = `
    <section class="hero"><div class="container">
      <div class="hero-inner">
        <span class="kicker">${U.icon('shield', 14)} Amanah · Transparan · Terintegrasi</span>
        <h1>Berbagi Kebaikan,<br><em>Menguatkan Umat</em></h1>
        <p>Kelola zakat, infak, sedekah, dan wakaf Anda bersama lembaga filantropi terpercaya. Setiap transaksi terverifikasi, setiap penyaluran tercatat, setiap laporan terbuka.</p>
        <div class="hero-actions">
          <a class="btn btn-gold btn-lg" href="#/donasi">${U.icon('heart', 18)} DONASI SEKARANG</a>
          <a class="btn btn-white btn-lg" href="#/program">${U.icon('layers', 18)} Lihat Program</a>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hs"><b>${U.fmtRp(st.total)}</b><span>Total Dana Terverifikasi</span></div>
        <div class="hs"><b>${U.fmtNum(st.donors)}+</b><span>Donatur Telah Bergabung</span></div>
        <div class="hs"><b>${U.fmtNum(st.programs)}</b><span>Program Aktif</span></div>
        <div class="hs"><b>${U.fmtRp(st.distributed)}</b><span>Penyaluran Dana</span></div>
      </div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><span class="kicker-g">Sedang Berjalan</span><h2>Kampanye Pilihan</h2>
      <p>Bergabunglah dalam kampanye yang sedang menggalang dana saat ini.</p></div>
      <div class="grid grid-3">${campaigns.map(campaignCard).join('')}</div>
    </div></section>

    <section class="section alt"><div class="container">
      <div class="section-head"><span class="kicker-g">Program Kami</span><h2>Salurkan Kebaikan pada 7 Bidang</h2>
      <p>Pendidikan, kesehatan, kemanusiaan, tanggap bencana, pemberdayaan ekonomi, sosial-keagamaan, dan ZISWAF.</p></div>
      <div class="grid grid-3">${programs.map(programCard).join('')}</div>
      <div style="text-align:center;margin-top:34px"><a class="btn btn-outline btn-lg" href="#/program">Lihat Semua Program ${U.icon('chevright', 16)}</a></div>
    </div></section>

    <section class="section" style="background:linear-gradient(120deg,var(--green-800),var(--green-700));color:#fff">
      <div class="container" style="display:flex;gap:30px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:280px">
          <h2 style="color:#fff;font-size:26px">Sudahkah Anda Menunaikan Zakat Tahun Ini?</h2>
          <p style="color:#d1fae5;margin-top:10px">Hitung kewajiban zakat penghasilan, emas, perdagangan, dan tabungan Anda dengan nisab yang selalu diperbarui.</p>
        </div>
        <a class="btn btn-gold btn-lg" href="#/kalkulator-zakat">${U.icon('pie', 18)} HITUNG ZAKAT ANDA</a>
      </div>
    </section>

    <section class="section"><div class="container">
      <div class="section-head"><span class="kicker-g">Transparansi</span><h2>Saldo Dana per Amanah Donatur</h2>
      <p>Data diambil langsung dari transaksi terverifikasi di sistem — bukan angka manual. Dana terbatas (zakat/infak/sedekah/wakaf) dicatat dan disalurkan secara terpisah.</p></div>
      <div class="grid grid-4" style="grid-template-columns:repeat(5,1fr)">
        ${Object.keys(U.FUNDS).map(f => `<div class="card card-pad" style="text-align:center">
          ${U.fundBadge(f)}<div style="font-size:20px;font-weight:800;color:var(--green-800);margin-top:10px">${U.fmtRp(balances[f])}</div>
          <div class="hint">saldo tersedia</div></div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="#/transparansi">${U.icon('file', 16)} Lihat Laporan Transparansi Lengkap</a></div>
    </div></section>

    <section class="section alt"><div class="container">
      <div class="section-head"><span class="kicker-g">Cerita Manfaat</span><h2>Dari Mereka yang Merasakan</h2></div>
      <div class="grid grid-3">${testi.map(t => `<div class="card testi-card">
        <div style="color:var(--gold-500)">${U.icon('star', 18)}</div>
        <p class="quote">"${U.esc(t.quote)}"</p>
        <div class="testi-who"><div class="avatar">${U.initials(t.name)}</div>
        <div><b style="font-size:14px">${U.esc(t.name)}</b><div class="hint">${U.esc(t.role)}</div></div></div>
      </div>`).join('')}</div>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><span class="kicker-g">Berita &amp; Dokumentasi</span><h2>Kabar Terbaru</h2></div>
      <div class="grid" style="max-width:820px;margin:0 auto">
        ${news.map(n => `<div class="news-item card" style="padding:14px;border:1px solid var(--gray-200)">
          <a href="#/berita/${n.id}" class="nimg" style="background-image:url('${n.image}')"></a>
          <div><span class="badge badge-green">${U.esc(n.category)}</span>
          <h4><a href="#/berita/${n.id}" style="color:var(--gray-900)">${U.esc(n.title)}</a></h4>
          <p class="pc-desc">${U.esc(n.excerpt)}</p>
          <div class="meta" style="margin-top:6px"><span>${U.icon('calendar', 12)} ${U.fmtShort(n.created_at)}</span><span>${U.icon('user', 12)} ${U.esc(n.author)}</span></div></div>
        </div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:26px"><a class="btn btn-outline" href="#/berita">Semua Berita ${U.icon('chevright', 15)}</a></div>
    </div></section>

    <section class="section alt"><div class="container">
      <div class="section-head"><span class="kicker-g">Galeri</span><h2>Momen Kebaikan</h2>
      <p>Setiap foto mempublikasikan kegiatan dengan izin dari penerima manfaat.</p></div>
      <div class="grid grid-4">${gal.map(g => `<a class="card" href="#/galeri" style="overflow:hidden;display:block">
        <img src="${g.image}" alt="${U.esc(g.title)}" style="height:150px;width:100%;object-fit:cover" loading="lazy">
        <div class="card-pad" style="padding:12px 14px"><b style="font-size:13px">${U.esc(g.title)}</b></div></a>`).join('')}</div>
    </div></section>`;
  }

  function page404() {
    appEl().innerHTML = `<div class="section" style="text-align:center">
      <div style="font-size:64px">🌿</div><h1 style="font-size:28px;margin:10px 0">Halaman tidak ditemukan</h1>
      <p style="color:var(--gray-500)">Maaf, halaman yang Anda tuju tidak tersedia.</p>
      <a class="btn btn-primary" href="#/" style="margin-top:18px">Kembali ke Beranda</a></div>`;
  }

  /* ============================================================
     HALAMAN: PROFIL LEMBAGA
     ============================================================ */
  function pageProfil() {
    const s = DB.settings();
    const org = DB.all('organization_structures').sort((a, b) => a.level - b.level);
    const levels = [...new Set(org.map(o => o.level))];
    appEl().innerHTML = `
    ${pageHero('Profil Lembaga', s.tagline, [['Beranda', '#/'], ['Profil', '#/profil']])}
    <section class="section"><div class="container two-col">
      <div>
        <h2 style="font-size:22px;margin-bottom:12px">Sejarah Berdirinya</h2>
        <p style="color:var(--gray-600);margin-bottom:26px">${U.esc(s.history)}</p>
        <h2 style="font-size:22px;margin-bottom:12px">Visi</h2>
        <div class="note-box" style="margin-bottom:24px">${U.esc(s.vision)}</div>
        <h2 style="font-size:22px;margin-bottom:12px">Misi</h2>
        <ol style="color:var(--gray-600);padding-left:20px;display:grid;gap:8px">${s.mission.map(m => `<li>${U.esc(m)}</li>`).join('')}</ol>
        <h2 style="font-size:22px;margin:30px 0 12px">Legalitas &amp; Kepercayaan</h2>
        <div class="grid grid-3">
          <div class="card card-pad"><div class="icon-circle" style="width:40px;height:40px">${U.icon('shield', 18)}</div>
            <b style="display:block;margin-top:10px;font-size:13px">Akta &amp; SK</b><span class="hint">${U.esc(s.legal_sk)}</span></div>
          <div class="card card-pad"><div class="icon-circle" style="width:40px;height:40px">${U.icon('wallet', 18)}</div>
            <b style="display:block;margin-top:10px;font-size:13px">NPWP</b><span class="hint">${U.esc(s.legal_npwp)}</span></div>
          <div class="card card-pad"><div class="icon-circle" style="width:40px;height:40px">${U.icon('award', 18)}</div>
            <b style="display:block;margin-top:10px;font-size:13px">Akreditasi</b><span class="hint">${U.esc(s.legal_akreditasi)}</span></div>
        </div>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:17px;margin-bottom:14px">Hubungi Kami</h3>
        <div class="fi" style="display:flex;gap:9px;margin-bottom:10px;font-size:14px">${U.icon('pin', 16)} <span>${U.esc(s.address)}</span></div>
        <div class="fi" style="display:flex;gap:9px;margin-bottom:10px;font-size:14px">${U.icon('phone', 16)} ${U.esc(s.phone)}</div>
        <div class="fi" style="display:flex;gap:9px;margin-bottom:10px;font-size:14px">${U.icon('mail', 16)} ${U.esc(s.email)}</div>
        <a class="btn btn-primary btn-block" style="margin-top:8px;background:#25d366" target="_blank" rel="noopener"
           href="https://wa.me/${(s.wa || '').replace(/\D/g, '')}?text=${encodeURIComponent('Assalamualaikum, saya ingin bertanya tentang ' + s.name)}">
           ${U.icon('chat', 16)} Chat WhatsApp Resmi</a>
        <div class="divider"></div>
        <h3 style="font-size:15px;margin-bottom:10px">Lokasi Kami</h3>
        ${s.maps_embed_url
          ? `<iframe src="${U.esc(s.maps_embed_url)}" width="100%" height="220" style="border:0;border-radius:10px" loading="lazy" title="Peta lokasi"></iframe>`
          : `<div class="info-box" style="text-align:center;padding:26px">
               <b style="display:block;margin-bottom:6px">PETA: BELUM TERHUBUNG</b>
               <span>Google Maps embed belum dikonfigurasi oleh admin. Atur pada <b>Admin → Pengaturan Sistem → Identitas &amp; Kontak</b>.</span>
               <div style="margin-top:10px"><a class="btn btn-sm btn-outline" target="_blank" rel="noopener" href="${U.esc(s.maps_link || '#')}">${U.icon('external', 14)} Buka di Google Maps</a></div>
             </div>`}
      </div>
    </div></section>
    <section class="section alt"><div class="container">
      <div class="section-head"><span class="kicker-g">Struktur Organisasi</span><h2>Tim Pengurus Yayasan</h2></div>
      ${levels.map(l => `<div class="grid" style="grid-template-columns:repeat(${Math.min(org.filter(o => o.level === l).length, 4)},1fr);margin-bottom:16px;justify-items:center">
        ${org.filter(o => o.level === l).map(o => `<div class="org-node" style="min-width:190px"><b>${U.esc(o.name)}</b><span>${U.esc(o.position)}</span></div>`).join('')}
      </div>`).join('')}
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: DAFTAR PROGRAM
     ============================================================ */
  function pagePrograms(m, params) {
    const cats = ['Semua', ...new Set(DB.all('programs').map(p => p.category))];
    const active = params.get('cat') || 'Semua';
    const q = (params.get('q') || '').toLowerCase();
    let list = DB.find('programs', p => p.status === 'aktif');
    if (active !== 'Semua') list = list.filter(p => p.category === active);
    if (q) list = list.filter(p => (p.name + ' ' + p.short_desc).toLowerCase().includes(q));
    appEl().innerHTML = `
    ${pageHero('Program Filantropi', 'Pilih program kebaikan pada 7 bidang: Pendidikan, Kesehatan, Kemanusiaan, Tanggap Bencana, Pemberdayaan Ekonomi, Sosial &amp; Keagamaan, dan ZISWAF.', [['Beranda', '#/'], ['Program', '#/program']])}
    <section class="section"><div class="container">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:26px">
        ${cats.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#/program?cat=${encodeURIComponent(c)}${q ? '&q=' + encodeURIComponent(q) : ''}">${U.esc(c)}</a>`).join('')}
        <div style="margin-left:auto;position:relative;min-width:230px">
          <input class="input" id="prog-q" placeholder="${U.icon('search', 12)} Cari program…" value="${U.esc(params.get('q') || '')}"
            onkeydown="if(event.key==='Enter')PA.searchProgram(this.value)">
        </div>
      </div>
      ${list.length ? `<div class="grid grid-3">${list.map(programCard).join('')}</div>`
        : `<div class="empty card"><div class="eicon">🔍</div>Tidak ada program yang cocok dengan filter.</div>`}
    </div></section>`;
  }

  function pageProgramDetail(m) {
    const p = DB.get('programs', m.id);
    if (!p || p.status === 'nonaktif') return page404();
    const raised = DB.programRaised(p.id), pct = pctOf(raised, p.target);
    const dists = DB.find('distributions', d => d.program_id === p.id && ['disalurkan', 'selesai'].includes(d.status));
    const others = DB.find('programs', x => x.status === 'aktif' && x.id !== p.id).slice(0, 3);
    appEl().innerHTML = `
    ${pageHero(U.esc(p.name), '', [['Beranda', '#/'], ['Program', '#/program'], [p.category, '#/program?cat=' + encodeURIComponent(p.category)]])}
    <section class="section"><div class="container two-col">
      <div>
        <img src="${p.image}" alt="${U.esc(p.name)}" style="border-radius:14px;width:100%;max-height:340px;object-fit:cover">
        <div style="display:flex;gap:8px;margin:16px 0">
          <span class="badge badge-gold">${U.esc(p.category)}</span>${U.fundBadge(p.fund_type)}
          <span class="badge badge-green">${U.icon('users', 12)} ${U.fmtNum(p.beneficiary_count)}+ penerima manfaat</span>
        </div>
        <h2 style="font-size:20px;margin-bottom:10px">Tentang Program</h2>
        <p style="color:var(--gray-600);white-space:pre-line">${U.esc(p.desc)}</p>
        ${dists.length ? `<h2 style="font-size:20px;margin:26px 0 12px">Riwayat Penyaluran Program Ini</h2>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Uraian</th><th style="text-align:right">Jumlah</th><th>Status</th></tr></thead>
        <tbody>${dists.map(d => `<tr><td class="strong">${U.esc(d.dist_number)}</td><td>${U.fmtShort(d.disbursed_at || d.created_at)}</td><td>${U.esc(d.description)}</td><td class="strong" style="text-align:right">${U.fmtRp(d.amount)}</td><td>${U.distBadge(d.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="card card-pad" style="position:sticky;top:90px">
        <h3 style="font-size:16px;margin-bottom:14px">Dukung Program Ini</h3>
        <div class="progress" style="height:12px"><i style="width:${pct}%"></i></div>
        <div class="mini-stat" style="margin-top:10px;font-size:13.5px"><span>Terkumpul</span><b style="font-size:17px">${U.fmtRp(raised)}</b></div>
        <div class="mini-stat"><span>Target</span><b>${U.fmtRp(p.target)}</b></div>
        <div class="mini-stat"><span>Tercapai</span><b>${pct}%</b></div>
        <a class="btn btn-gold btn-lg btn-block" style="margin-top:16px" href="#/donasi?program=${p.id}&fund=${p.fund_type}">${U.icon('heart', 17)} DONASI SEKARANG</a>
        <div class="divider"></div>
        <p class="hint">${U.icon('shield', 13)} Dana tercatat pada jenis amanah <b>${U.fundLabel(p.fund_type)}</b> dan hanya digunakan sesuai peruntukannya. Status pembayaran diperbarui otomatis setelah webhook payment gateway terverifikasi.</p>
        <div class="divider"></div>
        <b style="font-size:13.5px">Program Lainnya</b>
        ${others.map(o => `<a href="#/program/${o.id}" class="mini-stat" style="margin-top:10px;display:flex"><span>${U.esc(o.name)}</span><b>${U.icon('chevright', 14)}</b></a>`).join('')}
      </div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: FORM DONASI
     ============================================================ */
  function pageDonasi(m, params) {
    const s = DB.settings();
    const programs = DB.find('programs', p => p.status === 'aktif');
    const methods = DB.find('payment_methods', x => x.active);
    const gw = methods.find(x => x.type === 'gateway');
    const gwConnected = s.payment_gateway && s.payment_gateway.connected;
    const preProg = params.get('program') || '';
    const preFund = params.get('fund') || 'zakat';
    const preAmount = params.get('amount') || '';
    appEl().innerHTML = `
    ${pageHero('Formulir Donasi', 'Isi formulir berikut. Kuitansi otomatis terbit seketika setelah pembayaran terverifikasi.', [['Beranda', '#/'], ['Donasi', '#/donasi']])}
    <section class="section"><div class="container two-col">
      <form id="donation-form" onsubmit="return PA.submitDonation(event)">
        <div class="card card-pad">
          <h3 style="font-size:16px">1 · Jenis Dana &amp; Peruntukan</h3>
          <label>Jenis dana <span class="req">*</span></label>
          <select class="select" id="d-fund">
            ${Object.keys(U.FUNDS).map(f => `<option value="${f}" ${f === preFund ? 'selected' : ''}>${U.FUNDS[f].label}</option>`).join('')}
          </select>
          <label>Peruntukan program (opsional)</label>
          <select class="select" id="d-program">
            <option value="">— Dana Umum (dikelola lembaga sesuai prioritas) —</option>
            ${programs.map(p => `<option value="${p.id}" ${p.id === preProg ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}
          </select>
          <p class="hint">${U.icon('info', 12)} Dana terbatas (zakat/infak/sedekah/wakaf) dicatat terpisah dan <b>tidak boleh tercampur</b> dengan dana lain.</p>
        </div>

        <div class="card card-pad" style="margin-top:18px">
          <h3 style="font-size:16px">2 · Nominal Donasi</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px" id="quick-amounts">
            ${[50000, 100000, 250000, 500000, 1000000, 2500000].map(a => `<button type="button" class="chip" onclick="PA.setAmount(${a})">${U.fmtRp(a)}</button>`).join('')}
          </div>
          <label>Nominal (Rp) <span class="req">*</span></label>
          <input class="input" id="d-amount" type="number" min="10000" step="1000" placeholder="minimal Rp 10.000" value="${U.esc(preAmount)}" required>
          <label class="check"><input type="checkbox" id="d-recurring"> Jadikan donasi rutin bulanan (otomatis terjadwal tiap bulan)</label>
        </div>

        <div class="card card-pad" style="margin-top:18px">
          <h3 style="font-size:16px">3 · Data Donatur</h3>
          <div class="form-grid">
            <div><label>Nama lengkap <span class="req">*</span></label><input class="input" id="d-name" placeholder="Nama Anda" required></div>
            <div><label>Nomor WhatsApp <span class="req">*</span></label><input class="input" id="d-phone" placeholder="08xxxxxxxxxx" required></div>
            <div><label>Email</label><input class="input" id="d-email" type="email" placeholder="untuk kirim kuitansi (opsional)"></div>
            <div><label>Doa / pesan</label><input class="input" id="d-message" placeholder="Semoga bermanfaat…"></div>
          </div>
          <label class="check"><input type="checkbox" id="d-anon"> Tampilkan sebagai <b>Hamba Allah</b> (donasi anonim) pada publik &amp; laporan</label>
          <label class="check"><input type="checkbox" id="d-agree" required> Saya menyetujui data diproses sesuai kebijakan privasi dan memahami bahwa status pembayaran hanya berubah setelah verifikasi sistem.</label>
        </div>

        <div class="card card-pad" style="margin-top:18px">
          <h3 style="font-size:16px">4 · Metode Pembayaran</h3>
          ${(function(){
            const tm = methods.find(x => x.type === 'transfer_manual');
            if (!tm) return '';
            const banks = (s.banks || []);
            return `<div style="margin-top:12px">
            <span class="lb" style="margin:0 0 8px">Transfer Bank Manual</span>
            <label class="check" style="border:1.5px solid var(--gold-500);border-radius:10px;padding:10px 12px;margin:0;cursor:pointer;background:var(--gold-100)">
              <input type="radio" name="d-method" value="${tm.code}" required style="margin-top:1px">
              <span><b style="font-size:13.5px">${U.esc(tm.name)}</b>
              <span class="badge badge-green" style="margin-left:6px">PALING MUDAH</span>
              <span class="hint" style="margin:0">${U.esc(tm.instructions)}${banks.length ? ' Rekening tujuan: ' + banks.map(b => U.esc(b.bank)).join(', ') + '.' : ''}</span></span>
            </label></div>`;
          })()}
          ${['va', 'qris', 'ewallet'].map(t => `<div style="margin-top:12px">
            <span class="lb" style="margin:0 0 8px">${t === 'va' ? 'Transfer Bank / Virtual Account' : t === 'qris' ? 'QRIS' : 'E-Wallet'}</span>
            <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:9px">
              ${methods.filter(x => x.type === t).map(x => `
                <label class="check" style="border:1.5px solid var(--gray-200);border-radius:10px;padding:10px 12px;margin:0;cursor:pointer">
                  <input type="radio" name="d-method" value="${x.code}" required style="margin-top:1px">
                  <span><b style="font-size:13.5px">${U.esc(x.name)}</b><span class="hint" style="margin:0">${U.esc(x.instructions)}</span></span>
                </label>`).join('')}
            </div></div>`).join('')}
          ${gw ? `<div style="margin-top:12px">
            <span class="lb" style="margin:0 0 8px">Payment Gateway (Kartu Kredit &amp; Gerai Retail)</span>
            <label class="check" style="border:1.5px dashed var(--gray-300);border-radius:10px;padding:10px 12px;margin:0;opacity:.75;cursor:not-allowed">
              <input type="radio" disabled>
              <span><b style="font-size:13.5px">${U.esc(gw.name)}</b>
              <span class="badge badge-red" style="margin-left:6px">BELUM TERHUBUNG</span>
              <span class="hint" style="margin:0">API key payment gateway belum dikonfigurasi admin. Hubungi pengelola atau gunakan metode lain.</span></span>
            </label></div>` : ''}
        </div>
      </form>

      <div>
        <div class="card card-pad" style="position:sticky;top:90px">
          <h3 style="font-size:16px;margin-bottom:12px">Ringkasan Donasi</h3>
          <div id="sum-body">
            <div class="mini-stat"><span>Jenis dana</span><b id="sum-fund">${U.fundLabel(preFund)}</b></div>
            <div class="mini-stat"><span>Program</span><b id="sum-prog">Dana Umum</b></div>
            <div class="mini-stat"><span>Nominal</span><b id="sum-amount" style="font-size:18px">${U.fmtRp(Number(preAmount) || 0)}</b></div>
          </div>
          <div class="divider"></div>
          <div class="success-box" style="font-size:12.5px">
            ${U.icon('shield', 14)} <b>Aman &amp; Akuntabel:</b> status pembayaran <b>hanya</b> diubah oleh sistem setelah webhook payment gateway terverifikasi. Kuitansi resmi otomatis terbit setelah status <b>Berhasil</b>.
          </div>
          <button class="btn btn-gold btn-lg btn-block" style="margin-top:14px" onclick="document.getElementById('donation-form').requestSubmit()">
            ${U.icon('heart', 16)} LANJUTKAN PEMBAYARAN
          </button>
          <p class="hint" style="margin-top:10px">Donasi anonim tidak memerlukan akun. Bila Anda ingin riwayat donasi tersimpan, gunakan <a href="#/area-donatur">Area Donatur</a>.</p>
        </div>
      </div>
    </div></section>`;
    // sinkron ringkasan
    const sync = () => {
      const fund = U.$('#d-fund').value, prog = U.$('#d-program'), amt = Number(U.$('#d-amount').value) || 0;
      U.$('#sum-fund').textContent = U.fundLabel(fund);
      U.$('#sum-prog').textContent = prog.value ? prog.options[prog.selectedIndex].text : 'Dana Umum';
      U.$('#sum-amount').textContent = U.fmtRp(amt);
    };
    ['#d-fund', '#d-program', '#d-amount'].forEach(sel => U.$(sel).addEventListener('input', sync));
    sync();
  }

  /* ============================================================
     HALAMAN: INSTRUKSI PEMBAYARAN & STATUS
     ============================================================ */
  async function pagePembayaran(m) {
    /* Tahap 2 (Supabase): hidrasi satu donasi via RPC code-gated bila cache publik kosong */
    if (DB.__supa && !DB.one('donations', d => d.donation_code === m.code)) await SUPA.hydrateDonation(m.code);
    const don = DB.one('donations', d => d.donation_code === m.code);
    if (!don) return page404();
    const trx = DB.one('payment_transactions', t => t.donation_id === don.id);
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    const prog = don.program_id ? DB.get('programs', don.program_id) : null;
    const s = DB.settings();
    let timerId = null;
    appEl().innerHTML = `
    ${pageHero('Instruksi Pembayaran', 'Selesaikan pembayaran sebelum batas waktu. Status donasi diperbarui otomatis oleh sistem.', [['Beranda', '#/'], ['Cek Status', '#/cek-status'], ['Donasi ' + don.donation_code, '#']])}
    <section class="section"><div class="container" style="max-width:760px">
      <div class="card card-pad" style="text-align:center;margin-bottom:18px">
        <div class="hint">Kode Donasi Anda</div>
        <div style="font-size:24px;font-weight:800;color:var(--green-800);letter-spacing:1px">${U.esc(don.donation_code)}</div>
        <div style="margin-top:10px" id="pay-status">${U.statusBadge(don.status)}</div>
        ${don.status === 'menunggu' ? `<div class="amount-big" style="margin-top:14px">${U.fmtRp(don.total_amount)}</div>
        <div class="hint">(termasuk kode unik ${U.fmtNum(don.unique_code)} untuk verifikasi otomatis)</div>
        <div class="note-box" style="margin-top:14px" id="pay-timer">${U.icon('clock', 14)} Menghitung sisa waktu…</div>` : ''}
      </div>

      ${don.status === 'menunggu' ? `
      <div class="card card-pad">
        <h3 style="font-size:16px;margin-bottom:6px">${U.esc(method ? method.name : don.payment_method_code)}</h3>
        <p class="hint" style="margin-bottom:14px">${U.esc(method ? method.instructions : '')}</p>
        ${method && method.type === 'va' && trx.va_number ? `
          <div class="lb">Nomor Virtual Account</div>
          <div class="va-number">${U.esc(trx.va_number)}</div>
          <button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="PA.copy('${U.esc(trx.va_number)}')">${U.icon('copy', 14)} Salin Nomor VA</button>
          <p class="hint">Transfer <b>tepat sesuai nominal ${U.fmtRp(don.total_amount)}</b> (termasuk 3 digit kode unik) agar verifikasi otomatis berjalan.</p>` : ''}
        ${method && method.type === 'transfer_manual' ? (function(){
          const banks = (s.banks || []);
          const adminWa = (s.wa || '').replace(/\D/g, '');
          return `
          <div class="success-box" style="margin-bottom:14px">
            <b>3 langkah mudah:</b>&nbsp; 1) Transfer ke rekening lembaga di bawah &nbsp;·&nbsp;
            2) Klik tombol WhatsApp — kirimkan bukti transfer (screenshot m-banking / mutasi) &nbsp;·&nbsp;
            3) Admin memverifikasi → status <b>Berhasil</b> + kuitansi otomatis terbit di halaman ini.
          </div>
          ${banks.length ? `<div class="lb">Rekening Tujuan Resmi ${U.esc(s.name || 'Lembaga')}</div>
          ${banks.map(b => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px solid var(--gray-200);border-radius:10px;padding:12px 14px;margin-top:9px">
              <div>
                <div style="font-weight:700;font-size:14px">${U.esc(b.bank)}</div>
                <div style="font-size:19px;font-weight:800;letter-spacing:1px;color:var(--green-800)">${U.esc(b.number)}</div>
                <div class="hint" style="margin:2px 0 0">a.n. ${U.esc(b.holder || s.name || '')}</div>
              </div>
              <button class="btn btn-outline btn-sm" onclick="PA.copy('${U.esc(b.number)}')">${U.icon('copy', 14)} Salin</button>
            </div>`).join('')}
          <p class="hint" style="margin-top:10px">Transfer <b>tepat sesuai nominal ${U.fmtRp(don.total_amount)}</b> (termasuk 3 digit kode unik <b>${U.fmtNum(don.unique_code)}</b>) — kode unik memudahkan verifikasi jumlah transfer Anda.</p>` : `
          <div class="note-box">Rekening bank lembaga belum diatur — silakan hubungi admin via WhatsApp untuk memperoleh nomor rekening resmi.</div>`}
          <div class="divider"></div>
          <div class="lb">Konfirmasi Pembayaran</div>
          ${window.WA && adminWa ? `
          <button class="btn btn-lg btn-block" style="background:#25d366;color:#fff;border-color:#25d366" onclick="PA.waConfirm('${don.donation_code}')">
            ${U.icon('chat', 16)} KIRIM BUKTI TRANSFER KE WHATSAPP ADMIN
          </button>
          <p class="hint" style="margin-top:8px">Pesan konfirmasi (kode donasi, nama, jumlah) sudah terisi otomatis ke WA admin <b>+${U.esc(adminWa)}</b> — cukup lampirkan screenshot bukti transfer lalu kirim.</p>` : `
          <div class="note-box">Nomor WhatsApp admin belum diatur di sistem. Salin kode donasi <b>${U.esc(don.donation_code)}</b> dan kirimkan bukti transfer Anda ke kontak resmi lembaga.</div>`}
          <div class="status-steps" style="margin-top:14px">
            <span class="badge badge-amber">1 · Anda Transfer</span>
            <span class="badge badge-amber">2 · Kirim Bukti via WhatsApp</span>
            <span class="badge badge-outline">3 · Verifikasi Admin</span>
            <span class="badge badge-outline">4 · Berhasil + Kuitansi Otomatis</span>
          </div>
          <div class="danger-box" style="margin-top:14px">
            <b>Keamanan:</b> status <b>Berhasil</b> hanya ditetapkan oleh admin lembaga setelah bukti transfer Anda dicocokkan dengan mutasi rekening resmi — bukan oleh balasan WhatsApp apa pun. Verifikasi tercatat pada audit trail sistem.
          </div>`;
        })() : ''}
        ${method && method.type === 'qris' ? `
          <div class="lb">Pindai QRIS</div>
          <div class="qr-box">${U.icon('image', 30)}<br>Kode QRIS statis/terverifikasi muncul di sini<br>(dihasilkan payment gateway)</div>
          <p class="hint">Buka aplikasi e-wallet / m-banking apa pun → pindai → pastikan nominal ${U.fmtRp(don.total_amount)}.</p>` : ''}
        ${method && method.type === 'ewallet' ? `
          <div class="info-box" style="margin-top:8px">
            <b>Langkah pembayaran ${U.esc(method.name)}:</b><br>
            1. Buka aplikasi ${U.esc(method.name)} → menu Bayar / Scan.<br>
            2. Masukkan nomor tujuan merchant yayasan (akan muncul dari payment gateway).<br>
            3. Bayar <b>tepat ${U.fmtRp(don.total_amount)}</b>.<br>
            4. Status donasi berubah otomatis setelah webhook terverifikasi.
          </div>` : ''}
        <div class="divider"></div>
        <div class="status-steps">
          <span class="badge badge-amber">1 · Menunggu Pembayaran</span>
          <span class="badge badge-outline">2 · Webhook Terverifikasi</span>
          <span class="badge badge-outline">3 · Berhasil + Kuitansi Otomatis</span>
        </div>
        <div class="danger-box" style="margin-top:14px">
          <b>Penting:</b> kami tidak pernah menandai donasi "Berhasil" hanya karena Anda kembali dari aplikasi pembayaran.
          Status hanya diperbarui oleh <b>webhook terverifikasi</b> dari penyedia pembayaran.
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          ${s.demo_mode ? `<button class="btn btn-gold" onclick="PA.simWebhook('${don.donation_code}')">${U.icon('zap', 15)} Simulasikan Webhook Pembayaran (DEMO)</button>` : ''}
          ${window.WA ? `<button class="btn btn-outline" onclick="PA.waPay('${don.donation_code}')">${U.icon('chat', 15)} Kirim Instruksi ke WhatsApp Saya</button>` : ''}
          <button class="btn btn-ghost" onclick="PA.cancelDonation('${don.donation_code}')">${U.icon('x', 15)} Batalkan Donasi</button>
        </div>
      </div>` : ''}

      ${don.status === 'berhasil' ? `
      <div class="card card-pad" style="text-align:center">
        <div style="font-size:46px">✅</div>
        <h3 style="font-size:19px;margin:8px 0">Jazakallahu Khairan — Donasi Berhasil!</h3>
        <p style="color:var(--gray-500)">Pembayaran Anda telah terverifikasi sistem dan kuitansi resmi telah terbit otomatis.</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#/kuitansi/${don.donation_code}">${U.icon('file', 15)} Lihat / Unduh Kuitansi</a>
          ${window.WA ? `<button class="btn btn-outline" style="background:#25d366;color:#fff;border-color:#25d366" onclick="PA.donWa('${don.donation_code}')">${U.icon('chat', 15)} Kirim Kuitansi via WhatsApp</button>` : ''}
          <a class="btn btn-outline" href="#/transparansi">${U.icon('eye', 15)} Lihat Penyaluran Dana</a>
        </div>
      </div>` : ''}

      ${['gagal', 'kedaluwarsa', 'dibatalkan'].includes(don.status) ? `
      <div class="card card-pad" style="text-align:center">
        <div class="danger-box" style="text-align:left"><b>Donasi berstatus ${U.STATUSES[don.status].label}.</b>
        ${don.status === 'kedaluwarsa' ? ' Batas waktu pembayaran 24 jam telah terlampaui. ' : don.status === 'gagal' ? ' Pembayaran tidak dapat diproses. ' : ' Anda telah membatalkan donasi ini. '}
        Silakan buat donasi baru bila ingin melanjutkan niat baik Anda.</div>
        <a class="btn btn-primary" style="margin-top:14px" href="#/donasi?fund=${don.fund_type}${don.program_id ? '&program=' + don.program_id : ''}">Donasi Lagi</a>
      </div>` : ''}

      <div class="card card-pad" style="margin-top:18px">
        <h3 style="font-size:15px;margin-bottom:10px">Rincian Donasi</h3>
        <div class="mini-stat"><span>Jenis dana</span><b>${U.fundLabel(don.fund_type)}</b></div>
        <div class="mini-stat"><span>Program</span><b>${U.esc(prog ? prog.name : 'Dana Umum')}</b></div>
        <div class="mini-stat"><span>Donatur</span><b>${don.is_anonymous ? 'Hamba Allah' : U.esc(don.donor_name)}</b></div>
        <div class="mini-stat"><span>Metode</span><b>${U.esc(method ? method.name : don.payment_method_code)}</b></div>
        <div class="mini-stat"><span>Donasi rutin</span><b>${don.donation_type === 'bulanan' ? 'Ya, bulanan' : 'Sekali'}</b></div>
        <div class="mini-stat"><span>Batas bayar</span><b>${U.fmtDateTime(don.payment_deadline)}</b></div>
      </div>
    </div></section>`;
    if (don.status === 'menunggu') {
      const tick = () => {
        const el = U.$('#pay-timer');
        if (!el) { clearInterval(timerId); return; }
        const left = new Date(don.payment_deadline) - Date.now();
        if (left <= 0) { clearInterval(timerId); U.toast('Waktu pembayaran habis, status diperbarui.', 'warn'); route(); return; }
        const hh = Math.floor(left / 3600000), mm = Math.floor(left % 3600000 / 60000), ss = Math.floor(left % 60000 / 1000);
        el.innerHTML = `${U.icon('clock', 14)} Sisa waktu pembayaran: <b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}</b>`;
      };
      tick(); timerId = setInterval(tick, 1000);
    }
  }

  function pageCekStatus() {
    appEl().innerHTML = `
    ${pageHero('Cek Status Donasi', 'Masukkan kode donasi (contoh: DN20261110-0001) untuk melihat status pembayaran dan mengunduh kuitansi.', [['Beranda', '#/'], ['Cek Status', '#/cek-status']])}
    <section class="section"><div class="container" style="max-width:620px">
      <div class="card card-pad">
        <label>Kode donasi / kode transaksi <span class="req">*</span></label>
        <input class="input" id="cs-code" placeholder="DN20261110-0001" onkeydown="if(event.key==='Enter')PA.checkStatus()">
        <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="PA.checkStatus()">${U.icon('search', 15)} Cek Status</button>
      </div>
      <div class="info-box" style="margin-top:16px">Kode donasi tercantum pada halaman instruksi pembayaran, notifikasi email/WhatsApp, dan kuitansi.</div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: TRANSPARANSI
     ============================================================ */
  function pageTransparansi(m, params) {
    const years = [...new Set(DB.all('financial_transactions').map(t => new Date(t.trx_date).getFullYear()))].sort((a, b) => b - a);
    const y = Number(params.get('y')) || (years[0] || new Date().getFullYear());
    const inYear = t => new Date(t.trx_date).getFullYear() === y;
    const trx = DB.find('financial_transactions', t => inYear(t) && t.status === 'berhasil');
    const funds = Object.keys(U.FUNDS).map(f => {
      const ft = trx.filter(t => t.fund_type === f);
      return { fund: f, masuk: ft.filter(t => t.direction === 'masuk').reduce((s, t) => s + t.amount, 0), keluar: ft.filter(t => t.direction === 'keluar').reduce((s, t) => s + t.amount, 0) };
    });
    const dists = DB.find('distributions', d => ['disalurkan', 'selesai'].includes(d.status) && d.disbursed_at && new Date(d.disbursed_at).getFullYear() === y)
      .sort((a, b) => new Date(b.disbursed_at) - new Date(a.disbursed_at));
    const reports = DB.find('financial_reports', r => r.status === 'disetujui');
    const totalIn = funds.reduce((s, f) => s + f.masuk, 0), totalOut = funds.reduce((s, f) => s + f.keluar, 0);
    appEl().innerHTML = `
    ${pageHero('Transparansi Dana', 'Seluruh angka di bawah dihitung otomatis dari transaksi terverifikasi pada sistem. Dana terbatas (zakat, infak, sedekah, wakaf) dikelola terpisah sesuai amanah donatur.', [['Beranda', '#/'], ['Transparansi', '#/transparansi']])}
    <section class="section"><div class="container">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:22px">
        <b>Periode:</b>
        ${years.map(yy => `<a class="chip ${yy === y ? 'active' : ''}" href="#/transparansi?y=${yy}">${yy}</a>`).join('')}
        <span style="flex:1"></span>
        <button class="btn btn-outline btn-sm" onclick="PA.transExport('pdf','${y}')">${U.icon('download', 13)} Unduh Laporan PDF</button>
        <button class="btn btn-outline btn-sm" onclick="PA.transExport('xlsx','${y}')">${U.icon('download', 13)} Excel</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(5,1fr)">
        ${funds.map(f => `<div class="card card-pad">
          ${U.fundBadge(f.fund)}
          <div style="margin-top:12px;font-size:12.5px;color:var(--gray-500)">Penerimaan</div>
          <b style="font-size:15px;color:var(--green-800)">${U.fmtRp(f.masuk)}</b>
          <div style="margin-top:8px;font-size:12.5px;color:var(--gray-500)">Penyaluran</div>
          <b style="font-size:15px;color:var(--red-600)">${U.fmtRp(f.keluar)}</b>
          <div class="divider" style="margin:10px 0"></div>
          <div class="mini-stat"><span>Saldo</span><b>${U.fmtRp(f.masuk - f.keluar)}</b></div>
        </div>`).join('')}
      </div>
      <div class="note-box" style="margin-top:16px">${U.icon('shield', 14)} Total penerimaan <b>${U.fmtRp(totalIn)}</b> · total penyaluran <b>${U.fmtRp(totalOut)}</b> · saldo gabungan <b>${U.fmtRp(totalIn - totalOut)}</b> pada tahun ${y}. Setiap penyaluran melewati alur persetujuan berjenjang dan tercatat pada audit trail.</div>

      <h2 style="font-size:20px;margin:34px 0 14px">Riwayat Penyaluran Dana (${y})</h2>
      ${dists.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Program</th><th>Jenis Dana</th><th>Uraian</th><th style="text-align:right">Jumlah</th><th>Status</th></tr></thead>
        <tbody>${dists.map(d => { const p = DB.get('programs', d.program_id); return `<tr>
          <td class="strong">${U.esc(d.dist_number)}</td><td>${U.fmtShort(d.disbursed_at)}</td>
          <td>${U.esc(p ? p.name : '-')}</td><td>${U.fundBadge(d.fund_type)}</td>
          <td style="max-width:260px">${U.esc(d.description)}</td>
          <td class="strong" style="text-align:right">${U.fmtRp(d.amount)}</td><td>${U.distBadge(d.status)}</td></tr>`; }).join('')}</tbody>
      </table></div>` : `<div class="empty card">Belum ada penyaluran pada periode ini.</div>`}

      <h2 style="font-size:20px;margin:34px 0 14px">Laporan Keuangan Resmi</h2>
      <div class="grid grid-2">
        ${reports.length ? reports.map(r => `<div class="card card-pad" style="display:flex;gap:14px;align-items:center">
          <div class="icon-circle">${U.icon('file', 20)}</div>
          <div style="flex:1"><b>${U.esc(r.title)}</b><div class="hint">${U.fmtShort(r.created_at)} · Disahkan ${U.esc(r.approved_by || '-')}</div></div>
          <button class="btn btn-outline btn-sm" onclick="PA.printReport('${r.id}')">${U.icon('printer', 14)} Unduh PDF</button>
        </div>`).join('') : `<div class="empty card">Laporan akan terbit setelah disahkan.</div>`}
      </div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: BERITA
     ============================================================ */
  function pageBerita(m, params) {
    const cats = ['Semua', ...new Set(DB.find('news', n => n.published).map(n => n.category))];
    const cat = params.get('cat') || 'Semua';
    let list = DB.find('news', n => n.published).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (cat !== 'Semua') list = list.filter(n => n.category === cat);
    appEl().innerHTML = `
    ${pageHero('Berita &amp; Dokumentasi', 'Kabar kegiatan, laporan penyaluran, dan dokumentasi program yayasan.', [['Beranda', '#/'], ['Berita', '#/berita']])}
    <section class="section"><div class="container" style="max-width:860px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
        ${cats.map(c => `<a class="chip ${c === cat ? 'active' : ''}" href="#/berita?cat=${encodeURIComponent(c)}">${U.esc(c)}</a>`).join('')}
      </div>
      ${list.length ? list.map(n => `<div class="news-item card" style="padding:16px;border:1px solid var(--gray-200);margin-bottom:14px">
        <a href="#/berita/${n.id}" class="nimg" style="width:200px;height:130px;background-image:url('${n.image}')"></a>
        <div><span class="badge badge-green">${U.esc(n.category)}</span>
        <h4 style="font-size:17px"><a href="#/berita/${n.id}" style="color:var(--gray-900)">${U.esc(n.title)}</a></h4>
        <p class="pc-desc" style="-webkit-line-clamp:3">${U.esc(n.excerpt)}</p>
        <div class="meta" style="margin-top:8px"><span>${U.icon('calendar', 12)} ${U.fmtDate(n.created_at)}</span><span>${U.icon('user', 12)} ${U.esc(n.author)}</span><span>${U.icon('eye', 12)} ${U.fmtNum(n.views)} dibaca</span></div>
        <a class="btn btn-outline btn-sm" style="margin-top:10px" href="#/berita/${n.id}">Baca Selengkapnya ${U.icon('chevright', 13)}</a></div>
      </div>`).join('') : `<div class="empty card">Belum ada berita pada kategori ini.</div>`}
    </div></section>`;
  }

  function pageBeritaDetail(m) {
    const n = DB.get('news', m.id);
    if (!n || !n.published) return page404();
    DB.update('news', n.id, { views: (n.views || 0) + 1 });
    const others = DB.find('news', x => x.published && x.id !== n.id).slice(0, 3);
    const shareUrl = encodeURIComponent(location.href);
    const shareTitle = encodeURIComponent(n.title);
    appEl().innerHTML = `
    ${pageHero('', '', [['Beranda', '#/'], ['Berita', '#/berita'], [n.category, '#/berita?cat=' + encodeURIComponent(n.category)]])}
    <section class="section"><div class="container two-col">
      <article>
        <h1 style="font-size:26px;margin-bottom:12px">${U.esc(n.title)}</h1>
        <div class="meta" style="display:flex;gap:14px;color:var(--gray-500);font-size:13px;margin-bottom:18px">
          <span>${U.icon('calendar', 13)} ${U.fmtDate(n.created_at)}</span>
          <span>${U.icon('user', 13)} ${U.esc(n.author)}</span>
          <span>${U.icon('eye', 13)} ${U.fmtNum(n.views + 1)} dibaca</span>
          <span class="badge badge-green">${U.esc(n.category)}</span>
        </div>
        <img src="${n.image}" alt="${U.esc(n.title)}" style="border-radius:14px;margin-bottom:18px;max-height:380px;width:100%;object-fit:cover">
        <div style="color:var(--gray-700);font-size:15.5px;line-height:1.85;white-space:pre-line">${U.esc(n.content)}</div>
        <div class="card card-pad" style="margin-top:26px">
          <b style="font-size:14px">Bagikan artikel ini:</b>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <a class="btn btn-sm btn-primary" style="background:#25d366" target="_blank" rel="noopener" href="https://wa.me/?text=${shareTitle}%20${shareUrl}">WhatsApp</a>
            <a class="btn btn-sm btn-primary" style="background:#1877f2" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">Facebook</a>
            <a class="btn btn-sm" style="background:#111;color:#fff" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}">X / Twitter</a>
            <a class="btn btn-sm" style="background:#229ed9;color:#fff" target="_blank" rel="noopener" href="https://t.me/share/url?url=${shareUrl}&text=${shareTitle}">Telegram</a>
            <button class="btn btn-sm btn-ghost" onclick="PA.copy('${shareUrl}')">${U.icon('copy', 13)} Salin Tautan</button>
          </div>
        </div>
      </article>
      <div>
        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:12px">Berita Lainnya</h3>
          ${others.map(o => `<a href="#/berita/${o.id}" class="mini-stat" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
            <b style="font-size:13.5px;color:var(--gray-800)">${U.esc(o.title)}</b><span class="hint">${U.fmtShort(o.created_at)}</span></a>`).join('')}
          <a class="btn btn-outline btn-sm btn-block" style="margin-top:14px" href="#/berita">Semua Berita</a>
        </div>
        <div class="card card-pad" style="margin-top:18px;background:var(--green-50);border-color:var(--green-100)">
          <b style="color:var(--green-900)">Ikut Berdonasi?</b>
          <p class="hint" style="margin:8px 0">Setiap kontribusi tercatat transparan dan kuitansinya otomatis.</p>
          <a class="btn btn-gold btn-block" href="#/donasi">${U.icon('heart', 15)} DONASI SEKARANG</a>
        </div>
      </div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: KALKULATOR ZAKAT
     ============================================================ */
  function pageZakat() {
    const z = DB.zakat();
    const nisabRp = z.nisab_gold_gram * z.gold_price_gram;
    appEl().innerHTML = `
    ${pageHero('Kalkulator Zakat', 'Hitung kewajiban zakat Anda: penghasilan, emas/perak, perdagangan, dan tabungan. Parameter nisab &amp; harga emas dikelola admin dan selalu diperbarui.', [['Beranda', '#/'], ['Kalkulator Zakat', '#/kalkulator-zakat']])}
    <section class="section"><div class="container" style="max-width:820px">
      <div class="info-box">
        <b>Informasi Nisab (diperbarui admin):</b> Harga emas saat ini <b>${U.fmtRp(z.gold_price_gram)}/gram</b> ·
        Nisab emas <b>${z.nisab_gold_gram} gram</b> ≈ <b>${U.fmtRp(nisabRp)}</b> · Kadar zakat <b>${z.rate_pct}%</b>. ${U.esc(z.info || '')}
      </div>
      <div class="tabs" style="margin-top:22px">
        <button class="tab active" id="zt-penghasilan" onclick="PA.ztab('penghasilan')">Zakat Penghasilan</button>
        <button class="tab" id="zt-emas" onclick="PA.ztab('emas')">Zakat Emas / Perak</button>
        <button class="tab" id="zt-perdagangan" onclick="PA.ztab('perdagangan')">Zakat Perdagangan</button>
        <button class="tab" id="zt-tabungan" onclick="PA.ztab('tabungan')">Zakat Tabungan / MP</button>
      </div>

      <div class="card card-pad" id="zp-penghasilan">
        <h3 style="font-size:16px;margin-bottom:4px">Zakat Penghasilan (Profesi)</h3>
        <p class="hint">Wajib zakat bila penghasilan setahun mencapai setara ${z.nisab_gold_gram} gram emas (${U.fmtRp(nisabRp)}). Kadar ${z.rate_pct}%.</p>
        <div class="form-row">
          <div><label>Penghasilan bulanan (Rp)</label><input class="input" type="number" id="zi-main" placeholder="mis. 8.000.000"></div>
          <div><label>Penghasilan lain / bonus / THR (setahun)</label><input class="input" type="number" id="zi-other" placeholder="mis. 10.000.000"></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" onclick="PA.zakatCalc('penghasilan')">${U.icon('pie', 15)} Hitung Zakat Penghasilan</button>
      </div>

      <div class="card card-pad" id="zp-emas" style="display:none">
        <h3 style="font-size:16px;margin-bottom:4px">Zakat Emas / Perak</h3>
        <p class="hint">Wajib bila simpanan mencapai ${z.nisab_gold_gram} gram emas dan telah dimiliki 1 tahun (haul).</p>
        <div class="form-row">
          <div><label>Jumlah emas (gram)</label><input class="input" type="number" id="ze-gram" placeholder="mis. 100"></div>
          <div><label>Nilai per gram (Rp) — kosongkan = harga hari ini</label><input class="input" type="number" id="ze-price" placeholder="${U.fmtRp(z.gold_price_gram).replace('Rp ', '')}"></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" onclick="PA.zakatCalc('emas')">${U.icon('pie', 15)} Hitung Zakat Emas</button>
      </div>

      <div class="card card-pad" id="zp-perdagangan" style="display:none">
        <h3 style="font-size:16px;margin-bottom:4px">Zakat Perdagangan</h3>
        <p class="hint">Aset lancar usaha (kas, barang dagangan, piutang) dikurangi utang jangka pendek, bila ≥ nisab, kadar ${z.rate_pct}%.</p>
        <div class="form-row">
          <div><label>Aset lancar (kas + barang + piutang)</label><input class="input" type="number" id="zd-aset" placeholder="mis. 150.000.000"></div>
          <div><label>Hutang jangka pendek</label><input class="input" type="number" id="zd-hutang" placeholder="mis. 30.000.000"></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" onclick="PA.zakatCalc('perdagangan')">${U.icon('pie', 15)} Hitung Zakat Dagang</button>
      </div>

      <div class="card card-pad" id="zp-tabungan" style="display:none">
        <h3 style="font-size:16px;margin-bottom:4px">Zakat Tabungan / Deposito / Managed Fund</h3>
        <p class="hint">Total saldo yang telah dimiliki 1 tahun, bila ≥ nisab (${U.fmtRp(nisabRp)}), kadar ${z.rate_pct}%.</p>
        <div class="form-row">
          <div><label>Total saldo tabungan + deposito + anggaran bulanan tersisa</label><input class="input" type="number" id="zt-saldo" placeholder="mis. 120.000.000"></div>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" onclick="PA.zakatCalc('tabungan')">${U.icon('pie', 15)} Hitung Zakat Tabungan</button>
      </div>

      <div id="z-result" style="margin-top:20px"></div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: GALERI & TESTIMONI
     ============================================================ */
  function pageGaleri() {
    const gal = DB.find('galleries', g => g.status === 'aktif');
    const testi = DB.find('testimonials', t => t.approved);
    appEl().innerHTML = `
    ${pageHero('Galeri &amp; Testimoni', 'Dokumentasi kegiatan (dipublikasikan dengan izin penerima manfaat) dan cerita manfaat.', [['Beranda', '#/'], ['Galeri', '#/galeri']])}
    <section class="section"><div class="container">
      <div class="grid grid-3">${gal.map(g => `<a class="card" style="overflow:hidden" href="javascript:void 0" onclick="PA.lightbox('${g.id}')">
        <img src="${g.image}" alt="${U.esc(g.title)}" style="height:200px;width:100%;object-fit:cover" loading="lazy">
        <div class="card-pad" style="padding:13px 15px"><b style="font-size:13.5px">${U.esc(g.title)}</b>
        <div class="hint">${U.esc(g.category)} · ${U.fmtShort(g.created_at)} ${g.consent ? '· ' + U.icon('checkcircle', 11) + ' izin pemilik foto' : ''}</div></div></a>`).join('')}
      </div>
      <div class="note-box" style="margin-top:18px">${U.icon('shield', 14)} Kebijakan privasi: foto &amp; identitas penerima manfaat hanya ditampilkan bila telah memberikan persetujuan (consent), dan data sensitif selalu dimasking.</div>
    </div></section>
    <section class="section alt"><div class="container">
      <div class="section-head"><span class="kicker-g">Testimoni</span><h2>Suara Penerima &amp; Donatur</h2></div>
      <div class="grid grid-3">${testi.map(t => `<div class="card testi-card">
        <div style="color:var(--gold-500)">${U.icon('star', 18)}</div>
        <p class="quote">"${U.esc(t.quote)}"</p>
        <div class="testi-who"><div class="avatar">${U.initials(t.name)}</div>
        <div><b style="font-size:14px">${U.esc(t.name)}</b><div class="hint">${U.esc(t.role)}</div></div></div>
      </div>`).join('')}</div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: FAQ
     ============================================================ */
  function pageFaq() {
    const faqs = DB.find('faqs', f => f.status === 'aktif').sort((a, b) => (a.order || 0) - (b.order || 0));
    const s = DB.settings();
    appEl().innerHTML = `
    ${pageHero('Pertanyaan Umum (FAQ)', 'Enam pertanyaan yang paling sering diajukan donatur.', [['Beranda', '#/'], ['FAQ', '#/faq']])}
    <section class="section"><div class="container" style="max-width:760px">
      ${faqs.map((f, i) => `<div class="acc" id="acc-${i}">
        <button class="acc-head" onclick="PA.toggleAcc(${i})">${U.esc(f.question)}<span class="acc-caret">${U.icon('chevdown', 17)}</span></button>
        <div class="acc-body">${U.esc(f.answer)}</div>
      </div>`).join('')}
      <div class="card card-pad" style="margin-top:26px;text-align:center;background:var(--green-50);border-color:var(--green-100)">
        <b style="color:var(--green-900)">Masih ada pertanyaan?</b>
        <p class="hint" style="margin:6px 0 12px">Tim kami siap membantu melalui WhatsApp resmi ${U.esc(s.wa)}.</p>
        <a class="btn btn-primary" style="background:#25d366" target="_blank" rel="noopener" href="https://wa.me/${(s.wa || '').replace(/\D/g, '')}">${U.icon('chat', 15)} Chat WhatsApp</a>
      </div>
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: AREA DONATUR
     ============================================================ */
  function pageAreaDonatur() {
    const me = DonorAuth.currentDonor();
    if (!me) {
      appEl().innerHTML = `
      ${pageHero('Area Donatur', 'Masuk untuk melihat riwayat donasi, mengunduh kuitansi, dan mengelola donasi rutin. Donasi anonim tidak memerlukan akun.', [['Beranda', '#/'], ['Area Donatur', '#/area-donatur']])}
      <section class="section"><div class="container" style="max-width:860px">
        <div class="grid grid-2">
          <form class="card card-pad" onsubmit="return PA.donorLogin(event)">
            <h3 style="font-size:17px;margin-bottom:6px">Masuk</h3>
            <label>Email</label><input class="input" id="dl-email" type="email" required>
            <label>Password</label><input class="input" id="dl-pass" type="password" required>
            <button class="btn btn-primary btn-block" style="margin-top:16px">${U.icon('lock', 15)} Masuk</button>
            <p class="hint" style="margin-top:10px">Demo: <b>donor1@mail.com</b> / <b>Donatur@123</b></p>
          </form>
          <form class="card card-pad" onsubmit="return PA.donorRegister(event)">
            <h3 style="font-size:17px;margin-bottom:6px">Daftar Akun Baru</h3>
            <label>Nama lengkap</label><input class="input" id="dr-name" required>
            <div class="form-row">
              <div><label>Email</label><input class="input" id="dr-email" type="email" required></div>
              <div><label>WhatsApp</label><input class="input" id="dr-phone" placeholder="08xx…"></div>
            </div>
            <label>Password (min. 6 karakter)</label><input class="input" id="dr-pass" type="password" minlength="6" required>
            <button class="btn btn-gold btn-block" style="margin-top:16px">${U.icon('user', 15)} Daftar</button>
          </form>
        </div>
      </div></section>`;
      return;
    }
    // sudah login → dashboard donatur
    const myDons = DB.find('donations', d => d.donor_id === me.id || ((d.donor_email || '').toLowerCase() === me.email.toLowerCase()))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const totalBerhasil = myDons.filter(d => d.status === 'berhasil').reduce((s, d) => s + d.amount, 0);
    const recs = DB.find('recurring_donations', r => r.donor_id === me.id);
    const tab = (new URLSearchParams(location.hash.split('?')[1] || '')).get('t') || 'riwayat';
    appEl().innerHTML = `
    ${pageHero('Assalamualaikum, ' + U.esc(me.name), 'Kelola riwayat donasi, kuitansi, dan donasi rutin Anda.', [['Beranda', '#/'], ['Area Donatur', '#/area-donatur']])}
    <section class="section"><div class="container" style="max-width:980px">
      <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:22px">
        <div class="stat-card"><div class="sc-icon" style="background:var(--green-50);color:var(--green-700)">${U.icon('heart', 20)}</div>
          <div><b>${U.fmtRp(totalBerhasil)}</b><span>Total donasi berhasil</span></div></div>
        <div class="stat-card"><div class="sc-icon" style="background:var(--gold-100);color:var(--gold-600)">${U.icon('file', 20)}</div>
          <div><b>${U.fmtNum(myDons.filter(d => d.status === 'berhasil').length)}</b><span>Transaksi berhasil</span></div></div>
        <div class="stat-card"><div class="sc-icon" style="background:var(--blue-50);color:var(--blue-600)">${U.icon('repeat', 20)}</div>
          <div><b>${U.fmtNum(recs.filter(r => r.status === 'aktif').length)}</b><span>Donasi rutin aktif</span></div></div>
      </div>
      <div class="tabs">
        <a class="tab ${tab === 'riwayat' ? 'active' : ''}" href="#/area-donatur?t=riwayat">Riwayat Donasi</a>
        <a class="tab ${tab === 'rutin' ? 'active' : ''}" href="#/area-donatur?t=rutin">Donasi Rutin</a>
        <a class="tab ${tab === 'akun' ? 'active' : ''}" href="#/area-donatur?t=akun">Pengaturan Akun</a>
      </div>
      ${tab === 'riwayat' ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="PA.donorExport('xlsx')">${U.icon('download', 13)} Unduh Excel</button>
        <button class="btn btn-sm btn-outline" onclick="PA.donorExport('pdf')">${U.icon('file', 13)} Unduh PDF</button>
      </div><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Kode</th><th>Tanggal</th><th>Jenis Dana</th><th>Program</th><th style="text-align:right">Nominal</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${myDons.length ? myDons.map(d => { const p = d.program_id ? DB.get('programs', d.program_id) : null; return `<tr>
          <td class="strong">${U.esc(d.donation_code)}</td><td>${U.fmtShort(d.created_at)}</td>
          <td>${U.fundBadge(d.fund_type)}</td><td>${U.esc(p ? p.name : 'Dana Umum')}</td>
          <td class="strong" style="text-align:right">${U.fmtRp(d.amount)}</td><td>${U.statusBadge(d.status)}</td>
          <td>${d.status === 'berhasil' ? `<a class="btn btn-sm btn-outline" href="#/kuitansi/${d.donation_code}">${U.icon('file', 13)} Kuitansi</a>`
            : d.status === 'menunggu' ? `<a class="btn btn-sm btn-gold" href="#/pembayaran/${d.donation_code}">Bayar</a>` : '-'}</td></tr>`; }).join('')
        : `<tr><td colspan="7"><div class="empty">Belum ada donasi tercatat. <a href="#/donasi">Mulai berdonasi →</a></div></td></tr>`}</tbody>
      </table></div>` : ''}
      ${tab === 'rutin' ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Jenis Dana</th><th>Program</th><th style="text-align:right">Nominal/bulan</th><th>Metode</th><th>Pencarian berikutnya</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${recs.length ? recs.map(r => { const p = r.program_id ? DB.get('programs', r.program_id) : null; return `<tr>
          <td>${U.fundBadge(r.fund_type)}</td><td>${U.esc(p ? p.name : 'Dana Umum')}</td>
          <td class="strong" style="text-align:right">${U.fmtRp(r.amount)}</td><td>${U.esc(r.method_code)}</td>
          <td>${U.fmtShort(r.next_charge)}</td><td>${r.status === 'aktif' ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Dibatalkan</span>'}</td>
          <td>${r.status === 'aktif' ? `<button class="btn btn-sm btn-danger" onclick="PA.cancelRecurring('${r.id}')">Batalkan</button>` : '-'}</td></tr>`; }).join('')
        : `<tr><td colspan="7"><div class="empty">Belum ada donasi rutin. Aktifkan saat berdonasi dengan mencentang "donasi rutin bulanan".</div></td></tr>`}</tbody>
      </table></div>` : ''}
      ${tab === 'akun' ? `<div class="grid grid-2">
        <form class="card card-pad" onsubmit="return PA.donorUpdate(event)">
          <h3 style="font-size:16px;margin-bottom:6px">Profil Saya</h3>
          <label>Nama lengkap</label><input class="input" id="dp-name" value="${U.esc(me.name)}" required>
          <label>Nomor WhatsApp</label><input class="input" id="dp-phone" value="${U.esc(me.phone || '')}">
          <label>Alamat</label><textarea class="textarea" id="dp-address">${U.esc(me.address || '')}</textarea>
          <button class="btn btn-primary btn-block" style="margin-top:14px">Simpan Perubahan</button>
        </form>
        <form class="card card-pad" onsubmit="return PA.donorChangePass(event)">
          <h3 style="font-size:16px;margin-bottom:6px">Ganti Password</h3>
          <label>Password lama</label><input class="input" id="dc-old" type="password" required>
          <label>Password baru (min. 6 karakter)</label><input class="input" id="dc-new" type="password" minlength="6" required>
          <button class="btn btn-outline btn-block" style="margin-top:14px">${U.icon('key', 15)} Ganti Password</button>
          <div class="divider"></div>
          <button type="button" class="btn btn-danger btn-block" onclick="PA.donorLogout()">${U.icon('logout', 15)} Keluar dari Area Donatur</button>
        </form>
      </div>` : ''}
    </div></section>`;
  }

  /* ============================================================
     HALAMAN: KUITANSI
     ============================================================ */
  async function pageKuitansi(m) {
    if (DB.__supa && !DB.one('donations', d => d.donation_code === m.code)) await SUPA.hydrateDonation(m.code);
    const don = DB.one('donations', d => d.donation_code === m.code);
    if (!don) return page404();
    const r = DB.one('receipts', x => x.donation_id === don.id);
    const s = DB.settings();
    if (don.status !== 'berhasil' || !r) {
      appEl().innerHTML = `<div class="section" style="text-align:center"><div class="container" style="max-width:560px">
        <div class="card card-pad"><div style="font-size:40px">⏳</div>
        <h2 style="margin:10px 0">Kuitansi belum terbit</h2>
        <p style="color:var(--gray-500)">Kuitansi otomatis terbit setelah status pembayaran <b>Berhasil</b> (terverifikasi webhook).</p>
        <div style="margin-top:14px">${U.statusBadge(don.status)}</div>
        <a class="btn btn-primary" style="margin-top:16px" href="#/pembayaran/${don.donation_code}">Lihat Status Pembayaran</a></div>
      </div></div>`;
      return;
    }
    const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
    appEl().innerHTML = `
    <section class="section"><div class="container" style="max-width:760px">
      <div class="receipt">
        <div class="r-head">
          <div style="display:flex;gap:12px;align-items:center">${U.logoSvg(46)}
            <div><b style="font-size:15px">${U.esc(s.name)}</b><div style="font-size:11px;color:#d1fae5">${U.esc(s.address)}</div></div></div>
          <div style="text-align:right"><div class="stamp">TERVERIFIKASI</div><div style="font-size:11px;margin-top:6px;color:#d1fae5">Kuitansi No.</div><b style="font-size:14px">${U.esc(r.receipt_no)}</b></div>
        </div>
        <div class="r-body">
          <div style="font-size:17px;font-weight:800;color:var(--green-900);margin-bottom:4px">KUITANSI DONASI RESMI</div>
          <p class="hint" style="margin-bottom:14px">Diterima dari: <b style="color:var(--gray-800)">${don.is_anonymous ? 'Hamba Allah' : U.esc(don.donor_name)}</b> · Kode donasi ${U.esc(don.donation_code)}</p>
          <div class="r-row"><span>Tanggal pembayaran</span><b>${U.fmtDateTime(don.paid_at)}</b></div>
          <div class="r-row"><span>Jenis dana</span><b>${U.fundLabel(don.fund_type)}</b></div>
          <div class="r-row"><span>Peruntukan program</span><b>${U.esc(r.program_name)}</b></div>
          <div class="r-row"><span>Metode pembayaran</span><b>${U.esc(method ? method.name : don.payment_method_code)}</b></div>
          <div class="r-row"><span>Kode transaksi</span><b>${U.esc(r.trx_code)}</b></div>
          <div class="r-row"><span>Status</span><b style="color:var(--green-700)">BERHASIL (terverifikasi webhook)</b></div>
          <div class="r-total"><span>Jumlah donasi</span><b>${U.fmtRp(r.amount)}</b></div>
          ${don.message ? `<div class="r-row"><span>Doa / pesan donatur</span><b style="font-style:italic">"${U.esc(don.message)}"</b></div>` : ''}
        </div>
        <div class="r-foot">
          <span style="max-width:380px">${U.esc(s.receipt.footer_note)}</span>
          <div style="text-align:center"><div style="font-weight:700;border-top:1px solid var(--gray-400);padding-top:6px;min-width:170px">${U.esc(s.receipt.signer_name)}<br><span style="font-weight:400;font-size:10.5px">${U.esc(s.receipt.signer_title)}</span></div></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap" class="no-print">
        <button class="btn btn-primary" onclick="PA.donPdf('${don.donation_code}')">${U.icon('download', 15)} Unduh PDF Kuitansi</button>
        ${window.WA ? `<button class="btn btn-outline" style="background:#25d366;color:#fff;border-color:#25d366" onclick="PA.donWa('${don.donation_code}')">${U.icon('chat', 15)} Kirim via WhatsApp</button>` : ''}
        <button class="btn btn-outline" onclick="PA.printReceipt('${don.donation_code}')">${U.icon('printer', 15)} Cetak</button>
        <a class="btn btn-outline" href="#/pembayaran/${don.donation_code}">Detail Transaksi</a>
      </div>
      <p class="hint" style="text-align:center;margin-top:12px">Kuitansi ini adalah dokumen sah penyaluran dana dan telah tercatat pada sistem donasi ${U.esc(s.name)}.</p>
    </div></section>`;
  }

  /* ---------- OBJEK AKSI PUBLIK (dipanggil dari onclick) ---------- */
  window.PA = {
    dismissDemo() { sessionStorage.setItem('flms_demo_dismiss', '1'); renderBanner(); },
    toggleMenu() { document.getElementById('mobile-menu').classList.toggle('open'); },

    /* ---------- PORTAL PENGELOLA: login admin dari website publik ----------
       Sesi dibagikan satu origin (localStorage + Supabase Auth), sehingga
       setelah login di sini, admin.html langsung membuka dashboard. */
    openAdminLogin() {
      const mm = document.getElementById('mobile-menu');
      if (mm) mm.classList.remove('open');
      const cur = Auth.currentAdmin();
      if (cur) {
        U.toast('Anda sudah masuk sebagai ' + cur.name + ' — membuka panel admin…');
        setTimeout(() => { location.href = 'admin.html'; }, 400);
        return false;
      }
      const supaOn = !!(window.SUPA && SUPA.active());
      const demoHint = !supaOn && DB.settings().demo_mode ? `
        <div class="note-box" style="margin-top:14px;font-size:12px;line-height:1.8">
          <b>MODE DEMO — kredensial uji:</b><br>
          Super Admin: <b>superadmin@filantropi.id</b> · Admin Donasi: <b>admindonasi@filantropi.id</b> · Auditor: <b>auditor@filantropi.id</b><br>
          Password semua akun: <b>Admin@123</b><br>
          <span style="color:#92400e">Pada mode Supabase, gunakan email &amp; password akun yang dibuat di Supabase Auth.</span>
        </div>` : '';
      U.modal(U.icon('lock', 18) + ' Portal Pengelola', `
        <p class="hint" style="margin-top:0">Masuk untuk pengurus/pengelola lembaga. Setelah login, Anda diarahkan ke Panel Admin.</p>
        <form onsubmit="return PA.adminLogin(event)">
          <label>Email</label>
          <input class="input" id="al-email" type="email" required autocomplete="username" placeholder="nama@lembaga.id">
          <label>Password</label>
          <input class="input" id="al-pass" type="password" required autocomplete="current-password" placeholder="••••••••">
          <button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" id="al-btn">${U.icon('lock', 16)} MASUK KE PANEL ADMIN</button>
        </form>
        ${demoHint}
        <p class="hint" style="margin-top:12px;text-align:center">Donatur? Silakan gunakan <a href="#/area-donatur" onclick="U.closeModal()">Area Donatur</a>.</p>`);
      setTimeout(() => { const el = U.$('#al-email'); if (el) el.focus(); }, 80);
      return false;
    },
    async adminLogin(e) {
      e.preventDefault();
      const btn = U.$('#al-btn');
      const setBtn = (html, dis) => { if (btn) { btn.innerHTML = html; btn.disabled = dis; } };
      setBtn('Memeriksa…', true);
      try {
        const r = await Auth.adminLogin((U.$('#al-email').value || '').trim(), U.$('#al-pass').value);
        if (!r || !r.ok) {
          U.toast((r && r.message) || 'Login gagal.', 'error');
          setBtn(U.icon('lock', 16) + ' MASUK KE PANEL ADMIN', false);
          return false;
        }
        U.toast('Login berhasil — mengalihkan ke Panel Admin…');
        setTimeout(() => { location.href = 'admin.html'; }, 450);
      } catch (err) {
        U.toast('Login gagal: ' + (err && err.message ? err.message : err), 'error');
        setBtn(U.icon('lock', 16) + ' MASUK KE PANEL ADMIN', false);
      }
      return false;
    },

    subscribe() {
      const el = U.$('#nl-email'), msg = U.$('#nl-msg');
      const email = (el.value || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = 'Format email tidak valid.'; msg.style.color = '#fca5a5'; return; }
      if (DB.one('newsletter_subscribers', x => x.email === email)) { msg.textContent = 'Email ini sudah terdaftar.'; msg.style.color = '#fca5a5'; return; }
      DB.insert('newsletter_subscribers', { email, name: '', status: 'aktif' });
      DB.audit('newsletter.subscribe', 'newsletter_subscribers', email, null, null, 'Langganan newsletter dari footer');
      el.value = ''; msg.textContent = 'Jazakallahu khairan! Email Anda telah terdaftar.'; msg.style.color = '#86efac';
      U.toast('Berhasil berlangganan newsletter');
    },
    copy(t) { U.copyText(t); },
    searchProgram(q) { location.hash = '#/program?q=' + encodeURIComponent(q); },
    setAmount(a) { U.$('#d-amount').value = a; U.$('#d-amount').dispatchEvent(new Event('input')); },
    submitDonation(e) {
      e.preventDefault();
      const s = DB.settings();
      const fund = U.$('#d-fund').value;
      const program_id = U.$('#d-program').value || null;
      const amount = Number(U.$('#d-amount').value);
      const recurring = U.$('#d-recurring').checked;
      const anon = U.$('#d-anon').checked;
      const name = U.$('#d-name').value.trim();
      const phone = U.$('#d-phone').value.trim();
      const email = U.$('#d-email').value.trim();
      const message = U.$('#d-message').value.trim();
      const method = (document.querySelector('input[name="d-method"]:checked') || {}).value;
      if (!method) { U.toast('Pilih metode pembayaran terlebih dahulu.', 'error'); return false; }
      if (!amount || amount < 10000) { U.toast('Nominal donasi minimal Rp 10.000.', 'error'); return false; }
      if (!anon && (!name || !phone)) { U.toast('Nama dan nomor WhatsApp wajib diisi (atau centang donasi anonim).', 'error'); return false; }
      if (anon) { if (!phone) { U.toast('Nomor WhatsApp tetap wajib untuk notifikasi status.', 'error'); return false; } }
      if (method === 'gateway') { U.toast('Payment gateway belum terhubung (BELUM TERHUBUNG). Gunakan metode lain.', 'error'); return false; }
      // kaitkan donatur bila sedang login / email cocok
      const me = DonorAuth.currentDonor();
      let donor_id = me ? me.id : null;
      if (!donor_id && email) {
        const ex = DB.one('donors', d => (d.email || '').toLowerCase() === email.toLowerCase());
        if (ex) donor_id = ex.id;
      }
      let recurring_id = null;
      if (recurring) {
        const rec = DB.insert('recurring_donations', {
          donor_id, donor_name: anon ? 'Hamba Allah' : name, email, fund_type: fund,
          program_id, amount, method_code: method, status: 'aktif',
          start_date: new Date().toISOString(), next_charge: new Date(Date.now() + 30 * 86400000).toISOString(),
          note: 'Dibuat dari formulir donasi publik'
        });
        recurring_id = rec.id;
      }
      const unique = 101 + Math.floor(Math.random() * 899);
      const don = DB.insert('donations', {
        donation_code: '', donor_id, donor_name: anon ? 'Hamba Allah' : name, donor_email: email,
        donor_phone: phone, is_anonymous: anon, fund_type: fund, program_id, campaign_id: null,
        amount, unique_code: unique, total_amount: amount + unique, payment_method_code: method,
        status: 'menunggu', message, donation_type: recurring ? 'bulanan' : 'sekali', recurring_id,
        payment_deadline: new Date(Date.now() + 24 * 3600000).toISOString(), paid_at: null
      });
      DB.update('donations', don.id, { donation_code: DB.code('DN', 'donations', 'donation_code', 4) });
      const methodRow = DB.one('payment_methods', x => x.code === method);
      const trx = DB.insert('payment_transactions', {
        trx_code: '', donation_id: don.id, donation_code: don.donation_code,
        amount: don.total_amount, method_code: method,
        provider: methodRow && methodRow.type === 'transfer_manual' ? 'manual_transfer' : 'pending_webhook',
        status: 'menunggu',
        va_number: methodRow && methodRow.type === 'va'
          ? '88' + String(Math.floor(Math.random() * 90) + 10) + String(Date.now()).slice(-10)
          : '',
        paid_at: null, expires_at: don.payment_deadline, reconciled: false, reconciled_note: '', provider_reference: ''
      });
      DB.update('payment_transactions', trx.id, { trx_code: DB.code('TRX', 'payment_transactions', 'trx_code', 4) });
      DB.audit('donation.create', 'donations', don.id, null, { donation_code: don.donation_code, amount, fund, method }, 'Donasi baru dibuat dari website publik' + (anon ? ' (anonim)' : ''));
      DB.notify('Donasi baru menunggu pembayaran', `${don.donation_code} — ${U.fundLabel(fund)} ${U.fmtRp(amount)} (${method})`, 'donasi', 'admin_donasi');
      /* Tahap 2: antrekan instruksi pembayaran ke WhatsApp donatur */
      if (window.WA) { try { WA.queueDonationPending(don); } catch (e2) { console.warn(e2); } }
      U.toast('Donasi dibuat! Silakan selesaikan pembayaran.');
      location.hash = '#/pembayaran/' + don.donation_code;
      return false;
    },
    async simWebhook(code) {
      if (DB.__supa) {
        /* Supabase: server menegakkan aturan via RPC demo_finalize_payment (ditolak bila demo_mode=false) */
        const res = await SUPA.webhookSuccessSupa(code);
        if (!res.ok) { U.toast(res.message, 'error'); route(); return; }
        U.toast('Webhook (DEMO via server) terverifikasi → status BERHASIL. Kuitansi otomatis terbit.');
        route();
        return;
      }
      const res = DB.webhookSuccess(code, {});
      if (!res.ok) { U.toast(res.message, 'error'); return; }
      U.toast('Webhook (DEMO) terverifikasi → status BERHASIL. Kuitansi otomatis terbit.');
      route();
    },
    cancelDonation(code) {
      const don = DB.one('donations', d => d.donation_code === code);
      if (!don || don.status !== 'menunggu') { U.toast('Donasi tidak dapat dibatalkan.', 'error'); return; }
      U.confirmDialog('Batalkan Donasi?', 'Donasi ' + code + ' akan berstatus Dibatalkan dan tidak dapat dilanjutkan.', 'Ya, Batalkan').then(async ok => {
        if (!ok) return;
        if (DB.__supa) {
          const r = await DB.cancelDonationPublic(code);
          if (!r || !r.ok) { U.toast((r && r.message) || 'Gagal membatalkan donasi.', 'error'); route(); return; }
        } else {
          DB.update('donations', don.id, { status: 'dibatalkan' });
          const trx = DB.one('payment_transactions', t => t.donation_id === don.id);
          if (trx) DB.update('payment_transactions', trx.id, { status: 'dibatalkan' });
          if (don.recurring_id) DB.update('recurring_donations', don.recurring_id, { status: 'dibatalkan' });
        }
        DB.audit('donation.cancel_by_donor', 'donations', don.id, { status: 'menunggu' }, { status: 'dibatalkan' }, 'Dibatalkan oleh donatur');
        U.toast('Donasi dibatalkan.');
        route();
      });
    },
    async checkStatus() {
      const c = (U.$('#cs-code').value || '').trim().toUpperCase();
      if (!c) { U.toast('Masukkan kode donasi.', 'warn'); return; }
      if (DB.__supa && !DB.one('donations', d => d.donation_code === c)) await SUPA.hydrateDonation(c);
      const don = DB.one('donations', d => d.donation_code === c) || DB.one('donations', d => {
        const t = DB.one('payment_transactions', x => x.trx_code === c);
        return t && t.donation_id === d.id;
      });
      if (!don) { U.toast('Kode tidak ditemukan. Periksa kembali.', 'error'); return; }
      location.hash = '#/pembayaran/' + don.donation_code;
    },
    /* ---------- TAHAP 2: WHATSAPP & EKSPOR LANJUTAN ---------- */
    waPay(code) { if (window.WA) WA.sendPublicPayment(code); },
    donWa(code) { if (window.WA) WA.sendPublicReceipt(code); },
    waConfirm(code) { if (window.WA) WA.sendTransferConfirmation(code); },
    donPdf(code) {
      const don = DB.one('donations', d => d.donation_code === code);
      const r = don && DB.one('receipts', x => x.donation_id === don.id);
      if (!don || !r || don.status !== 'berhasil') { U.toast('Kuitansi belum tersedia — status pembayaran belum Berhasil.', 'error'); return; }
      const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
      X.receiptPDF(don, r, DB.settings(), method);
    },
    transExport(type, y) {
      y = Number(y);
      const inYear = t => new Date(t.trx_date).getFullYear() === y;
      const trx = DB.find('financial_transactions', t => inYear(t) && t.status === 'berhasil');
      const funds = Object.keys(U.FUNDS).map(f => {
        const ft = trx.filter(t => t.fund_type === f);
        return { fund: f, masuk: ft.filter(t => t.direction === 'masuk').reduce((s, t) => s + Number(t.amount), 0), keluar: ft.filter(t => t.direction === 'keluar').reduce((s, t) => s + Number(t.amount), 0), saldo: DB.fundBalance(f) };
      });
      const dists = DB.find('distributions', d => ['disalurkan', 'selesai'].includes(d.status) && d.disbursed_at && new Date(d.disbursed_at).getFullYear() === y)
        .map(d => ({ ...d, program_name: d.program_id ? (DB.get('programs', d.program_id) || {}).name : '-' }))
        .sort((a, b) => new Date(b.disbursed_at) - new Date(a.disbursed_at));
      const s = DB.settings();
      if (type === 'pdf') {
        const d = X.financeReportPDF({
          title: 'Laporan Transparansi Dana ' + y, year: y, periodNote: 'Periode Tahun ' + y + ' — data transaksi terverifikasi',
          funds, jurnal: trx.sort((a, b) => new Date(a.trx_date) - new Date(b.trx_date)), distributions: dists, s
        });
        d.save('laporan-transparansi-' + y + '.pdf');
      } else {
        X.xlsx('laporan-transparansi-' + y + '.xlsx', [
          { name: 'Ringkasan', title: 'Ringkasan per Jenis Dana ' + y, headers: ['Jenis Dana', 'Penerimaan (Rp)', 'Penyaluran (Rp)', 'Saldo Berjalan (Rp)'], rows: funds.map(f => [U.fundLabel(f.fund), f.masuk, f.keluar, f.saldo]), widths: [24, 20, 20, 20], numCols: [1, 2, 3] },
          { name: 'Penyaluran', title: 'Riwayat Penyaluran ' + y, headers: ['Nomor', 'Tanggal', 'Program', 'Jenis Dana', 'Uraian', 'Jumlah (Rp)'], rows: dists.map(d => [d.dist_number, U.fmtShort(d.disbursed_at), d.program_name, U.fundLabel(d.fund_type), d.description, Number(d.amount)]), widths: [18, 14, 30, 14, 40, 16], numCols: [5] },
          { name: 'Jurnal', title: 'Jurnal Transaksi Terverifikasi ' + y, headers: ['Tanggal', 'Kategori', 'Jenis Dana', 'Uraian', 'Ref', 'Arah', 'Jumlah (Rp)'], rows: trx.map(t => [U.fmtShort(t.trx_date), t.category_code, U.fundLabel(t.fund_type), t.description, t.ref_code, t.direction, Number(t.amount)]), widths: [14, 16, 14, 44, 18, 10, 16], numCols: [6] }
        ]);
      }
    },
    donorExport(type) {
      const me = DonorAuth.currentDonor();
      if (!me) { U.toast('Silakan masuk terlebih dahulu.', 'error'); return; }
      const myDons = DB.find('donations', d => d.donor_id === me.id || ((d.donor_email || '').toLowerCase() === me.email.toLowerCase()))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const rows = myDons.map(d => { const p = d.program_id ? DB.get('programs', d.program_id) : null; return [d.donation_code, U.fmtShort(d.created_at), U.fundLabel(d.fund_type), p ? p.name : 'Dana Umum', d.donation_type === 'bulanan' ? 'Bulanan' : 'Sekali', Number(d.amount), Number(d.total_amount || d.amount), (U.STATUSES[d.status] || {}).label || d.status]; });
      if (type === 'xlsx') {
        X.xlsx('riwayat-donasi-' + me.email.split('@')[0] + '.xlsx', [{ name: 'Riwayat Donasi', title: 'Riwayat Donasi — ' + me.name, headers: ['Kode', 'Tanggal', 'Jenis Dana', 'Program', 'Tipe', 'Nominal (Rp)', 'Total Bayar (Rp)', 'Status'], rows, widths: [20, 14, 14, 32, 10, 16, 16, 16], numCols: [5, 6] }]);
      } else {
        X.tablePDF('riwayat-donasi-' + me.email.split('@')[0] + '.pdf', 'Riwayat Donasi — ' + me.name,
          ['Kode', 'Tanggal', 'Jenis Dana', 'Program', 'Nominal', 'Status'],
          myDons.map(d => { const p = d.program_id ? DB.get('programs', d.program_id) : null; return [d.donation_code, U.fmtShort(d.created_at), U.fundLabel(d.fund_type), p ? p.name : 'Dana Umum', U.fmtRp(d.amount), (U.STATUSES[d.status] || {}).label || d.status]; }),
          { widths: [0.16, 0.12, 0.13, 0.33, 0.13, 0.13], numCols: [4], note: 'Dokumen riwayat donasi pribadi — dihasilkan dari Area Donatur.' });
      }
    },
    ztab(name) {
      ['penghasilan', 'emas', 'perdagangan', 'tabungan'].forEach(t => {
        const p = U.$('#zp-' + t); if (p) p.style.display = t === name ? '' : 'none';
        const tb = U.$('#zt-' + t); if (tb) tb.classList.toggle('active', t === name);
      });
      const r = U.$('#z-result'); if (r) r.innerHTML = '';
    },
    zakatCalc(type) {
      const z = DB.zakat();
      const rate = z.rate_pct / 100;
      const nisabRp = z.nisab_gold_gram * z.gold_price_gram;
      const num = id => Number((U.$(id) || {}).value) || 0;
      let html = '', bayar = 0;
      if (type === 'penghasilan') {
        const inc = num('#zi-main'), other = num('#zi-other');
        const monthly = inc + other / 12;
        const annual = monthly * 12;
        const wajib = annual >= nisabRp;
        bayar = wajib ? monthly * rate : 0;
        html = `<div class="card card-pad" style="border-color:var(--green-600)">
          <h3 style="font-size:16px">Hasil: Zakat Penghasilan</h3>
          <div class="mini-stat" style="margin-top:10px"><span>Penghasilan bulanan rata-rata</span><b>${U.fmtRp(monthly)}</b></div>
          <div class="mini-stat"><span>Setahun (termasuk THR/bonus)</span><b>${U.fmtRp(annual)}</b></div>
          <div class="mini-stat"><span>Nisab (${z.nisab_gold_gram} gr emas)</span><b>${U.fmtRp(nisabRp)}/tahun</b></div>
          <div class="mini-stat"><span>Status</span><b>${wajib ? '<span class="badge badge-green">WAJIB ZAKAT</span>' : '<span class="badge badge-blue">BELUM WAJIB</span>'}</b></div>
          ${wajib ? `<div class="r-total" style="margin-top:12px"><span>Zakat ${z.rate_pct}% per bulan</span><b>${U.fmtRp(bayar)}</b></div>` : `<p class="hint" style="margin-top:10px">Penghasilan tahunan Anda belum mencapai nisab. Tetap disunnahkan berinfak/sedekah.</p>`}
          ${wajib ? `<a class="btn btn-gold btn-block" style="margin-top:12px" href="#/donasi?fund=zakat&amount=${Math.round(bayar)}">${U.icon('heart', 15)} Tunaikan via Sistem Ini</a>` : ''}
        </div>`;
      } else if (type === 'emas') {
        const gram = num('#ze-gram'), price = num('#ze-price') || z.gold_price_gram;
        const val = gram * price;
        const wajib = gram >= z.nisab_gold_gram;
        bayar = wajib ? val * rate : 0;
        html = `<div class="card card-pad" style="border-color:var(--green-600)">
          <h3 style="font-size:16px">Hasil: Zakat Emas/Perak</h3>
          <div class="mini-stat" style="margin-top:10px"><span>Total nilai simpanan</span><b>${U.fmtRp(val)} (${gram} gr)</b></div>
          <div class="mini-stat"><span>Nisab</span><b>${z.nisab_gold_gram} gram (${U.fmtRp(nisabRp)})</b></div>
          <div class="mini-stat"><span>Status</span><b>${wajib ? '<span class="badge badge-green">WAJIB ZAKAT</span>' : '<span class="badge badge-blue">BELUM WAJIB</span>'}</b></div>
          ${wajib ? `<div class="r-total" style="margin-top:12px"><span>Zakat ${z.rate_pct}%</span><b>${U.fmtRp(bayar)}</b></div>
          <a class="btn btn-gold btn-block" style="margin-top:12px" href="#/donasi?fund=zakat&amount=${Math.round(bayar)}">${U.icon('heart', 15)} Tunaikan via Sistem Ini</a>` : `<p class="hint" style="margin-top:10px">Simpanan emas Anda belum mencapai nisab ${z.nisab_gold_gram} gram.</p>`}
        </div>`;
      } else if (type === 'perdagangan') {
        const aset = num('#zd-aset'), hutang = num('#zd-hutang');
        const net = aset - hutang;
        const wajib = net >= nisabRp;
        bayar = wajib ? net * rate : 0;
        html = `<div class="card card-pad" style="border-color:var(--green-600)">
          <h3 style="font-size:16px">Hasil: Zakat Perdagangan</h3>
          <div class="mini-stat" style="margin-top:10px"><span>Aset lancar − utang lancar</span><b>${U.fmtRp(net)}</b></div>
          <div class="mini-stat"><span>Nisab</span><b>${U.fmtRp(nisabRp)}</b></div>
          <div class="mini-stat"><span>Status</span><b>${wajib ? '<span class="badge badge-green">WAJIB ZAKAT</span>' : '<span class="badge badge-blue">BELUM WAJIB</span>'}</b></div>
          ${wajib ? `<div class="r-total" style="margin-top:12px"><span>Zakat ${z.rate_pct}%</span><b>${U.fmtRp(bayar)}</b></div>
          <a class="btn btn-gold btn-block" style="margin-top:12px" href="#/donasi?fund=zakat&amount=${Math.round(bayar)}">${U.icon('heart', 15)} Tunaikan via Sistem Ini</a>` : `<p class="hint" style="margin-top:10px">Aset bersih belum mencapai nisab.</p>`}
        </div>`;
      } else if (type === 'tabungan') {
        const saldo = num('#zt-saldo');
        const wajib = saldo >= nisabRp;
        bayar = wajib ? saldo * rate : 0;
        html = `<div class="card card-pad" style="border-color:var(--green-600)">
          <h3 style="font-size:16px">Hasil: Zakat Tabungan/MP</h3>
          <div class="mini-stat" style="margin-top:10px"><span>Total saldo (dimiliki ≥ 1 tahun)</span><b>${U.fmtRp(saldo)}</b></div>
          <div class="mini-stat"><span>Nisab</span><b>${U.fmtRp(nisabRp)}</b></div>
          <div class="mini-stat"><span>Status</span><b>${wajib ? '<span class="badge badge-green">WAJIB ZAKAT</span>' : '<span class="badge badge-blue">BELUM WAJIB</span>'}</b></div>
          ${wajib ? `<div class="r-total" style="margin-top:12px"><span>Zakat ${z.rate_pct}%</span><b>${U.fmtRp(bayar)}</b></div>
          <a class="btn btn-gold btn-block" style="margin-top:12px" href="#/donasi?fund=zakat&amount=${Math.round(bayar)}">${U.icon('heart', 15)} Tunaikan via Sistem Ini</a>` : `<p class="hint" style="margin-top:10px">Saldo belum mencapai nisab.</p>`}
        </div>`;
      }
      U.$('#z-result').innerHTML = html;
      if (bayar > 0) U.toast('Zakat yang perlu ditunaikan: ' + U.fmtRp(bayar));
    },
    toggleAcc(i) { U.$('#acc-' + i).classList.toggle('open'); },
    lightbox(gid) {
      const g = DB.get('galleries', gid);
      if (!g) return;
      U.modal(U.esc(g.title), `<img src="${g.image}" alt="${U.esc(g.title)}" style="width:100%;border-radius:10px">
        <p class="hint" style="margin-top:10px">${U.esc(g.category)} · ${U.fmtDate(g.created_at)} ${g.consent ? '· ' + U.icon('checkcircle', 12) + ' dipublikasikan dengan izin pemilik foto' : ''}</p>`);
    },
    printReport(rid) {
      const r = DB.get('financial_reports', rid);
      if (!r) return;
      const rows = DB.find('financial_transactions', t => t.status === 'berhasil')
        .sort((a, b) => new Date(a.trx_date) - new Date(b.trx_date));
      const inRows = rows.filter(t => t.direction === 'masuk'), outRows = rows.filter(t => t.direction === 'keluar');
      const sum = a => a.reduce((s, t) => s + t.amount, 0);
      U.printHTML(r.title, `
        <div class="head"><div><h1>${U.esc(DB.settings().name)}</h1>
        <div class="muted">${U.esc(DB.settings().address)}</div></div>
        <div style="text-align:right"><b>LAPORAN KEUANGAN RESMI</b><div class="muted">${U.esc(r.report_code)} · ${U.esc(r.period)} ${r.year}</div>
        <div class="muted">Status: DISAHKAN (${U.esc(r.approved_by || '-')})</div></div></div>
        <h2>A. Penerimaan per Jenis Dana</h2>
        <table><thead><tr><th>Jenis Dana</th><th class="rp">Jumlah</th></tr></thead><tbody>
        ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(inRows.filter(t => t.fund_type === f).reduce((s, t) => s + t.amount, 0))}</td></tr>`).join('')}
        <tr><th>Total Penerimaan</th><th class="rp">${U.fmtRp(sum(inRows))}</th></tr></tbody></table>
        <h2>B. Penyaluran per Jenis Dana</h2>
        <table><thead><tr><th>Jenis Dana</th><th class="rp">Jumlah</th></tr></thead><tbody>
        ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(outRows.filter(t => t.fund_type === f).reduce((s, t) => s + t.amount, 0))}</td></tr>`).join('')}
        <tr><th>Total Penyaluran</th><th class="rp">${U.fmtRp(sum(outRows))}</th></tr></tbody></table>
        <h2>C. Saldo per Jenis Dana</h2>
        <table><thead><tr><th>Jenis Dana</th><th class="rp">Saldo</th></tr></thead><tbody>
        ${Object.keys(U.FUNDS).map(f => `<tr><td>${U.fundLabel(f)}</td><td class="rp">${U.fmtRp(DB.fundBalance(f))}</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="margin-top:16px">${U.esc(r.note || '')}<br>Laporan ini dihasilkan otomatis dari transaksi terverifikasi pada ${U.fmtDateTime(new Date().toISOString())}.</p>
        <div style="text-align:right;margin-top:26px"><div style="display:inline-block;border-top:1px solid #333;padding-top:6px;min-width:200px">${U.esc(DB.settings().receipt.signer_name)}<br><span class="muted">${U.esc(DB.settings().receipt.signer_title)}</span></div></div>`);
    },
    printReceipt(code) {
      const don = DB.one('donations', d => d.donation_code === code);
      const r = don && DB.one('receipts', x => x.donation_id === don.id);
      if (!don || !r) { U.toast('Kuitansi belum tersedia.', 'error'); return; }
      const s = DB.settings();
      const method = DB.one('payment_methods', x => x.code === don.payment_method_code);
      U.printHTML('Kuitansi ' + r.receipt_no, `
        <div class="head"><div><h1>${U.esc(s.name)}</h1><div class="muted">${U.esc(s.address)} · ${U.esc(s.phone)}</div></div>
        <div style="text-align:right"><b>KUITANSI DONASI</b><div class="muted">No. ${U.esc(r.receipt_no)}</div></div></div>
        <table style="margin-top:14px"><tbody>
          <tr><th style="width:220px">Diterima dari</th><td><b>${don.is_anonymous ? 'Hamba Allah' : U.esc(don.donor_name)}</b></td></tr>
          <tr><th>Tanggal bayar</th><td>${U.fmtDateTime(don.paid_at)}</td></tr>
          <tr><th>Jenis dana</th><td>${U.fundLabel(don.fund_type)}</td></tr>
          <tr><th>Peruntukan</th><td>${U.esc(r.program_name)}</td></tr>
          <tr><th>Metode pembayaran</th><td>${U.esc(method ? method.name : don.payment_method_code)}</td></tr>
          <tr><th>Kode donasi / transaksi</th><td>${U.esc(don.donation_code)} / ${U.esc(r.trx_code)}</td></tr>
          <tr><th>Status</th><td><span class="stamp">BERHASIL — TERVERIFIKASI</span></td></tr>
          <tr><th>Jumlah</th><td class="total">${U.fmtRp(r.amount)}</td></tr>
        </tbody></table>
        <p class="muted" style="margin-top:14px">${U.esc(s.receipt.footer_note)}</p>
        <div style="text-align:right;margin-top:26px"><div style="display:inline-block;border-top:1px solid #333;padding-top:6px;min-width:200px">${U.esc(s.receipt.signer_name)}<br><span class="muted">${U.esc(s.receipt.signer_title)}</span></div></div>`);
    },
    cancelRecurring(rid) {
      U.confirmDialog('Batalkan Donasi Rutin?', 'Jadwal donasi bulanan ini akan dihentikan.', 'Ya, Batalkan').then(ok => {
        if (!ok) return;
        DB.update('recurring_donations', rid, { status: 'dibatalkan' });
        DB.audit('recurring.cancel_by_donor', 'recurring_donations', rid, { status: 'aktif' }, { status: 'dibatalkan' }, 'Dibatalkan donatur');
        U.toast('Donasi rutin dibatalkan.');
        route();
      });
    },
    async donorLogin(e) {
      e.preventDefault();
      const r = await DonorAuth.donorLogin(U.$('#dl-email').value, U.$('#dl-pass').value);
      if (!r.ok) { U.toast(r.message, 'error'); return false; }
      U.toast('Assalamualaikum, ' + r.donor.name + '!');
      location.hash = '#/area-donatur'; route();
      return false;
    },
    async donorRegister(e) {
      e.preventDefault();
      const r = await DonorAuth.donorRegister(U.$('#dr-name').value, U.$('#dr-email').value, U.$('#dr-phone').value, U.$('#dr-pass').value);
      if (!r.ok) { U.toast(r.message, 'error'); return false; }
      U.toast('Pendaftaran berhasil. Selamat berdonasi!');
      location.hash = '#/area-donatur'; route();
      return false;
    },
    donorLogout() { DonorAuth.donorLogout(); U.toast('Anda telah keluar.'); location.hash = '#/area-donatur'; route(); },
    donorUpdate(e) {
      e.preventDefault();
      const me = DonorAuth.currentDonor();
      const res = DonorAuth.updateProfile(me.id, { name: U.$('#dp-name').value, phone: U.$('#dp-phone').value, address: U.$('#dp-address').value });
      U.toast(res.ok ? 'Profil diperbarui.' : res.message, res.ok ? 'success' : 'error');
      if (res.ok) route();
      return false;
    },
    donorChangePass(e) {
      e.preventDefault();
      const me = DonorAuth.currentDonor();
      const res = DonorAuth.changePassword(me.id, U.$('#dc-old').value, U.$('#dc-new').value);
      U.toast(res.ok ? 'Password berhasil diganti.' : res.message, res.ok ? 'success' : 'error');
      if (res.ok) e.target.reset();
      return false;
    }
  };

  return { init, route };
})();
