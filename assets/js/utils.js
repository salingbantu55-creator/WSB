'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — UTILITAS GLOBAL (U.*)
   ============================================================ */

/* SHA-256 murni JS (demo; pada produksi gunakan Supabase Auth) */
window.__hash = function (str) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const maxWord = Math.pow(2, 32);
  let result = '';
  const ascii = unescape(encodeURIComponent(String(str)));
  const words = [];
  const asciiBitLength = ascii.length * 8;
  const hash = window.__hash.h = window.__hash.h || [];
  const k = window.__hash.k = window.__hash.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  let a = ascii + '\x80';
  while (a.length % 64 - 56) a += '\x00';
  for (let i = 0; i < a.length; i++) {
    const j = a.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);
  let h2 = hash.slice(0, 8);
  for (let j2 = 0; j2 < words.length;) {
    const w = words.slice(j2, j2 += 16);
    const oldHash = h2;
    h2 = h2.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const aa = h2[0], e = h2[4];
      const temp1 = h2[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & h2[5]) ^ ((~e) & h2[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0);
      const temp2 = (rightRotate(aa, 2) ^ rightRotate(aa, 13) ^ rightRotate(aa, 22))
        + ((aa & h2[1]) ^ (aa & h2[2]) ^ (h2[1] & h2[2]));
      h2 = [(temp1 + temp2) | 0].concat(h2);
      h2[4] = (h2[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) h2[i] = (h2[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++)
    for (let j = 3; j + 1; j--) {
      const b = (h2[i] >> (j * 8)) & 255;
      result += ((b < 16) ? '0' : '') + b.toString(16);
    }
  return result;
};

const U = (() => {

  /* ---------- FORMAT ---------- */
  const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const fmtNum = n => (Number(n) || 0).toLocaleString('id-ID');
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
  const fmtShort = iso => iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const timeAgo = iso => {
    if (!iso) return '-';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
    return fmtShort(iso);
  };
  const daysLeft = iso => Math.ceil((new Date(iso) - Date.now()) / 86400000);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- IKON SVG (feather-style) ---------- */
  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    wallet: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkcircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    chevdown: '<polyline points="6 9 12 15 18 9"/>',
    chevright: '<polyline points="9 18 15 12 9 6"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
  };
  const icon = (name, size = 18, extra = '') =>
    `<svg ${extra} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.info}</svg>`;

  /* ---------- GAMBAR PLACEHOLDER (SVG offline) ---------- */
  const THEMES = [
    ['#14532d', '#22c55e'], ['#166534', '#d4a017'], ['#0f3d24', '#15803d'],
    ['#3a5a40', '#e9b949'], ['#1b4332', '#74c69d'], ['#14532d', '#95d5b2'],
    ['#0a2e18', '#52b788'], ['#132a13', '#d4a017']
  ];
  const placeholder = (text, w = 800, h = 500, seed = 0) => {
    const [c1, c2] = THEMES[Math.abs(seed) % THEMES.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <circle cx="${w * .82}" cy="${h * .18}" r="${h * .28}" fill="rgba(255,255,255,.08)"/>
      <circle cx="${w * .12}" cy="${h * .88}" r="${h * .22}" fill="rgba(255,255,255,.07)"/>
      <text x="50%" y="52%" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.max(20, h * .085)}" font-weight="bold" fill="rgba(255,255,255,.92)">${String(text).replace(/[<>&]/g, '')}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  };
  const logoSvg = (size = 44) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" fill="#166534"/><circle cx="24" cy="24" r="22" stroke="#d4a017" stroke-width="2.5"/>
    <path d="M24 34c0 0-9-5.6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 12-9 12z" fill="#e9b949"/>
    <path d="M24 15v10M19.5 18.5h9" stroke="#166534" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  /* ---------- TOAST ---------- */
  const toast = (msg, type = 'success') => {
    let root = $('#toast-root');
    if (!root) { root = document.createElement('div'); root.id = 'toast-root'; document.body.appendChild(root); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = icon(type === 'error' ? 'alert' : type === 'warn' ? 'alert' : type === 'info' ? 'info' : 'checkcircle', 18) + `<span>${esc(msg)}</span>`;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; setTimeout(() => t.remove(), 400); }, 3600);
  };

  /* ---------- MODAL ---------- */
  const closeModal = () => { const m = document.getElementById('modal-active'); if (m) { m.remove(); document.body.style.overflow = ''; } };
  const modal = (title, body, footer = '', opts = {}) => {
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'modal-active';
    ov.innerHTML = `<div class="modal-box ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="modal-x" data-close aria-label="Tutup">&times;</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    return ov;
  };
  const confirmDialog = (title, msg, okLabel = 'Ya, Lanjutkan', danger = true) => {
    return new Promise(res => {
      let settled = false;
      const m = modal(title, `<p class="confirm-msg">${msg}</p>`,
        `<button class="btn btn-ghost" data-close>Batal</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(okLabel)}</button>`);
      m.querySelector('#cf-ok').onclick = () => { settled = true; closeModal(); res(true); };
      const obs = new MutationObserver(() => {
        if (!document.getElementById('modal-active')) { obs.disconnect(); if (!settled) res(false); }
      });
      obs.observe(document.body, { childList: true });
    });
  };

  /* ---------- CETAK / PDF ---------- */
  const printHTML = (title, bodyHTML) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${esc(title)}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;font-size:13.5px;margin:28px}
        h1{font-size:20px;color:#14532d} h2{font-size:16px;color:#14532d;margin:18px 0 8px}
        table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0}
        th{background:#f0fdf4;color:#14532d;text-align:left;padding:8px 10px;border:1px solid #d1d5db}
        td{padding:8px 10px;border:1px solid #e5e7eb}
        .rp{text-align:right}
        .head{display:flex;justify-content:space-between;border-bottom:3px solid #d4a017;padding-bottom:14px;margin-bottom:18px}
        .muted{color:#6b7280;font-size:12px}
        .total{font-size:16px;font-weight:800;color:#14532d}
        .stamp{border:2px solid #166534;color:#166534;font-weight:800;padding:4px 12px;border-radius:6px;display:inline-block}
        @page{margin:16mm}
      </style></head><body>${bodyHTML}
      <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
      </body></html>`);
    doc.close();
    setTimeout(() => f.remove(), 4000);
  };

  /* ---------- EXPORT ---------- */
  const downloadBlob = (filename, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };
  const exportXLS = (filename, title, headers, rows) => {
    const th = headers.map(h => `<th style="background:#166534;color:#ffffff;border:1px solid #0f3d24">${esc(h)}</th>`).join('');
    const tr = rows.map(r => '<tr>' + r.map(c => `<td style="border:1px solid #d1d5db;mso-number-format:'\\@'">${esc(c)}</td>`).join('') + '</tr>').join('');
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(title).slice(0, 28)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1"><caption style="font-weight:bold;font-size:15px;text-align:left">${esc(title)} — ${fmtDateTime(new Date().toISOString())}</caption><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
    downloadBlob(filename, new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    toast('File Excel berhasil diunduh: ' + filename);
  };
  const downloadJSON = (filename, data) => {
    downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    toast('File backup berhasil diunduh: ' + filename);
  };

  /* ---------- LABEL DOMAIN ---------- */
  const FUNDS = {
    zakat: { label: 'Zakat', color: '#166534', bg: '#dcfce7' },
    infak: { label: 'Infak', color: '#b45309', bg: '#fef3c7' },
    sedekah: { label: 'Sedekah', color: '#1d4ed8', bg: '#dbeafe' },
    wakaf: { label: 'Wakaf', color: '#6d28d9', bg: '#ede9fe' },
    sosial: { label: 'Dana Sosial Lainnya', color: '#0e7490', bg: '#cffafe' }
  };
  const fundLabel = f => (FUNDS[f] || { label: f }).label;
  const fundBadge = f => { const m = FUNDS[f] || { label: f, color: '#374151', bg: '#f3f4f6' }; return `<span class="fund-chip" style="background:${m.bg};color:${m.color}">${esc(m.label)}</span>`; };
  const STATUSES = {
    menunggu: { label: 'Menunggu Pembayaran', cls: 'badge-amber' },
    berhasil: { label: 'Berhasil', cls: 'badge-green' },
    gagal: { label: 'Gagal', cls: 'badge-red' },
    kedaluwarsa: { label: 'Kedaluwarsa', cls: 'badge-gray' },
    dibatalkan: { label: 'Dibatalkan', cls: 'badge-gray' }
  };
  const statusBadge = s => { const m = STATUSES[s] || { label: s, cls: 'badge-gray' }; return `<span class="badge ${m.cls}">${esc(m.label)}</span>`; };
  const DIST_STATUS = {
    diajukan: { label: 'Diajukan', cls: 'badge-blue' },
    diverifikasi: { label: 'Diverifikasi', cls: 'badge-amber' },
    disetujui: { label: 'Disetujui', cls: 'badge-gold' },
    disalurkan: { label: 'Disalurkan', cls: 'badge-green' },
    selesai: { label: 'Selesai', cls: 'badge-green' },
    ditolak: { label: 'Ditolak', cls: 'badge-red' }
  };
  const distBadge = s => { const m = DIST_STATUS[s] || { label: s, cls: 'badge-gray' }; return `<span class="badge ${m.cls}">${esc(m.label)}</span>`; };

  /* ---------- PRIVASI ---------- */
  const masked = v => {
    const s = String(v || '');
    if (s.length <= 4) return '••••';
    return s.slice(0, 4) + '••••••••' + s.slice(-2);
  };

  /* ---------- GAMBAR UPLOAD (resize otomatis agar hemat storage) ---------- */
  const readImageResized = (file, maxW = 820, cb) => {
    if (!file || !file.type.startsWith('image/')) { toast('File harus berupa gambar', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  /* ---------- SALIN ---------- */
  const copyText = async t => {
    try { await navigator.clipboard.writeText(t); toast('Berhasil disalin ke clipboard'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); toast('Berhasil disalin ke clipboard');
    }
  };

  const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  return {
    fmtRp, fmtNum, fmtDate, fmtShort, fmtDateTime, timeAgo, daysLeft, esc, uid,
    $, $$, debounce, icon, placeholder, logoSvg, toast, modal, closeModal, confirmDialog,
    printHTML, downloadBlob, exportXLS, downloadJSON,
    FUNDS, fundLabel, fundBadge, STATUSES, statusBadge, DIST_STATUS, distBadge,
    masked, readImageResized, copyText, initials
  };
})();
