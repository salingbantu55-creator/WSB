'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — GRAFIK CANVAS RINGAN
   (tanpa dependensi eksternal, aman offline)
   ============================================================ */
const Charts = (() => {

  function prep(canvas, height = 240) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    canvas.width = w * dpr; canvas.height = height * dpr;
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h: height };
  }

  /* ---------- GARIS / AREA ---------- */
  function line(canvas, data, opts = {}) {
    const { ctx, w, h } = prep(canvas, opts.height || 240);
    const padL = 62, padR = 14, padT = 16, padB = 30;
    const iw = w - padL - padR, ih = h - padT - padB;
    const max = Math.max(...data.map(d => d.value), 1) * 1.15;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px Segoe UI, Arial';
    // grid
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#6b7280';
    for (let i = 0; i <= 4; i++) {
      const y = padT + ih - (ih * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(shortRp(max * i / 4), padL - 8, y + 4);
    }
    // area
    const pts = data.map((d, i) => ({ x: padL + (iw * (data.length === 1 ? 1 : i / (data.length - 1))), y: padT + ih - (ih * d.value / max) }));
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(22,101,52,.28)'); grad.addColorStop(1, 'rgba(22,101,52,.02)');
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padT + ih); ctx.lineTo(pts[0].x, padT + ih); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // garis
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = opts.color || '#166534'; ctx.lineWidth = 2.6; ctx.stroke();
    // titik
    pts.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = opts.color || '#166534'; ctx.lineWidth = 2.2; ctx.stroke();
    });
    // label sumbu X
    ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center';
    const step = Math.ceil(data.length / 12);
    data.forEach((d, i) => { if (i % step === 0) ctx.fillText(d.label, padL + (iw * (data.length === 1 ? 1 : i / (data.length - 1))), h - 9); });
  }

  /* ---------- DONUT ---------- */
  function donut(canvas, data, opts = {}) {
    const { ctx, w, h } = prep(canvas, opts.height || 240);
    ctx.clearRect(0, 0, w, h);
    const total = data.reduce((s, d) => s + d.value, 0);
    const cx = Math.min(w * .32, 130), cy = h / 2, r = Math.min(cy - 18, 86);
    if (!total) {
      ctx.fillStyle = '#9ca3af'; ctx.font = '13px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText('Belum ada data', w / 2, cy); return;
    }
    let ang = -Math.PI / 2;
    data.forEach(d => {
      const a = (d.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, ang, ang + a); ctx.closePath();
      ctx.fillStyle = d.color; ctx.fill();
      ang += a;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r * .62, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#111827'; ctx.font = 'bold 15px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(shortRp(total), cx, cy + 2);
    ctx.fillStyle = '#6b7280'; ctx.font = '10.5px Segoe UI';
    ctx.fillText('Total', cx, cy + 18);
    // legenda
    let ly = cy - data.length * 12 + 6;
    ctx.textAlign = 'left';
    data.forEach(d => {
      ctx.fillStyle = d.color; ctx.fillRect(w * .58, ly - 7, 11, 11);
      ctx.fillStyle = '#374151'; ctx.font = '12px Segoe UI';
      const pct = total ? Math.round(d.value / total * 100) : 0;
      ctx.fillText(`${d.label} — ${pct}%`, w * .58 + 18, ly + 3);
      ly += 24;
    });
  }

  /* ---------- BATANG ---------- */
  function bar(canvas, data, opts = {}) {
    const { ctx, w, h } = prep(canvas, opts.height || 240);
    const padL = 62, padR = 10, padT = 16, padB = 30;
    const iw = w - padL - padR, ih = h - padT - padB;
    const max = Math.max(...data.map(d => d.value), 1) * 1.12;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#e5e7eb'; ctx.font = '11px Segoe UI';
    for (let i = 0; i <= 4; i++) {
      const y = padT + ih - (ih * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = '#6b7280'; ctx.textAlign = 'right';
      ctx.fillText(shortRp(max * i / 4), padL - 8, y + 4);
    }
    const bw = Math.min(46, iw / data.length * .55);
    data.forEach((d, i) => {
      const x = padL + (iw / data.length) * (i + .5) - bw / 2;
      const bh = ih * d.value / max;
      const g = ctx.createLinearGradient(0, padT + ih - bh, 0, padT + ih);
      g.addColorStop(0, d.color || '#22c55e'); g.addColorStop(1, d.color2 || '#166534');
      ctx.fillStyle = g;
      roundRect(ctx, x, padT + ih - bh, bw, Math.max(bh, 2), 5); ctx.fill();
      ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.font = '11px Segoe UI';
      ctx.fillText(d.label, x + bw / 2, h - 9);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shortRp(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (n >= 1e6) return (n / 1e6).toFixed(0) + ' jt';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' rb';
    return String(n);
  }

  return { line, donut, bar, shortRp };
})();
