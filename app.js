(() => {
'use strict';
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeIO = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
const easeO = t => 1 - Math.pow(1 - t, 3);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function tween(ms, fn, ease = x => x) {
  return new Promise(res => { const t0 = performance.now();
    (function f(n) { const k = clamp((n - t0) / ms); fn(ease(k), k); k < 1 ? requestAnimationFrame(f) : res(); })(t0); });
}

/* ====== CHỈNH Ở ĐÂY ====== */
const TEXT5 = 'đè nữa đi, sắp được rồi đó...';
/* ========================= */

const cv = $('#cv'), ctx = cv.getContext('2d');
const daisyWrap = $('#daisyWrap'), svg = $('#daisy'), hit = $('#hit'), flash = $('#flash');
const tC = $('#tC'), tT = $('#tT'), counter = $('#counter'), lb = $('#lb'), photosEl = $('#photos');
const bgm = $('#bgm');
let W, H, DPR, stage = 'intro', mode = 'none', zoom = 1;
let sprites = {}, pols = {};

function setSize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR; sprites = {}; pols = {};
}
setSize();
addEventListener('resize', () => { setSize(); if (stage === 'field' || stage === 'ripple') buildField(); });

/* ---------- text helper ---------- */
function say(el, t) {
  const tk = el._tk = (el._tk || 0) + 1;
  if (t == null) { el.classList.remove('show'); return; }
  if (el.textContent === t) { el.classList.add('show'); return; }
  const had = el.classList.contains('show');
  el.classList.remove('show');
  setTimeout(() => { if (el._tk !== tk) return; el.textContent = t; el.classList.add('show'); }, had ? 350 : 0);
}

/* ---------- AUDIO (hiệu ứng mờ ảo, lãng mạn) ---------- */
let AC, master, rev, pad = null;
function unlockAudio() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = .9; master.connect(AC.destination);
      const len = AC.sampleRate * 3, buf = AC.createBuffer(2, len, AC.sampleRate);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/len, 2.6); }
      rev = AC.createConvolver(); rev.buffer = buf;
      const rg = AC.createGain(); rg.gain.value = .75; rev.connect(rg); rg.connect(master);
    }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
  if (bgm.paused) bgm.play().then(() => $('#musicHint').classList.remove('on')).catch(() => {});
}
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true }));
const PENTA = [0, 2, 4, 7, 9];
const note = i => 293.66 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
function bell(f, vol = .1, dur = 2.4, delay = 0) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime + delay, g = AC.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  [[1, 1], [2, .28], [3.01, .09]].forEach(([m, a]) => { const o = AC.createOscillator(), og = AC.createGain();
    o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .1); });
  g.connect(master); g.connect(rev);
}
const sparkle = (n = 6, v = .06) => { for (let k = 0; k < n; k++) bell(note(5 + k % 5 + Math.floor(k / 5) * 5), v, 1.8, k * .1); };
function padStart() {
  if (!AC || pad) return;
  const out = AC.createGain(); out.gain.value = 0;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(out); out.connect(master); out.connect(rev);
  const oscs = [146.83, 220, 293.66, 369.99, 440].map((f, i) => { const o = AC.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 2) * 4; o.connect(lp); o.start(); return o; });
  pad = { out, lp, oscs };
}
function padSet(p) { if (!pad) return; const t = AC.currentTime; pad.out.gain.setTargetAtTime(.02 + p * .15, t, .15); pad.lp.frequency.setTargetAtTime(300 + p * 2800, t, .15); }
function padStop() { if (!pad) return; const p = pad; pad = null; p.out.gain.setTargetAtTime(0, AC.currentTime, .6); setTimeout(() => p.oscs.forEach(o => { try { o.stop(); } catch (e) {} }), 3500); }

/* ---------- stars ---------- */
for (let i = 0; i < 45; i++) { const s = document.createElement('div'); s.className = 'st'; const z = rnd(1, 2.6);
  s.style.cssText = `left:${rnd(0, 100)}%;top:${rnd(0, 100)}%;width:${z}px;height:${z}px;animation-delay:${rnd(0, 3)}s;animation-duration:${rnd(2, 4.5)}s`; $('#stars').appendChild(s); }

/* ---------- daisy vẽ ---------- */
function drawDaisy(c, x, y, R, pink) {
  c.save(); c.translate(x, y);
  for (let i = 0; i < 5; i++) {
    c.save(); c.rotate(i * Math.PI * 2 / 5); c.beginPath(); c.ellipse(0, -R*.53, R*.355, R*.47, 0, 0, Math.PI * 2);
    const g = c.createRadialGradient(0, -R*.2, R*.05, 0, -R*.5, R*.55);
    if (pink) { g.addColorStop(0, '#fff2f7'); g.addColorStop(1, '#ff9cc4'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8ecf4'); }
    c.fillStyle = g; c.fill(); c.lineWidth = Math.max(.6, R*.02); c.strokeStyle = pink ? 'rgba(220,60,120,.35)' : 'rgba(110,120,150,.3)'; c.stroke(); c.restore();
  }
  const g2 = c.createRadialGradient(-R*.06, -R*.06, R*.02, 0, 0, R*.25);
  g2.addColorStop(0, '#fff3a8'); g2.addColorStop(.55, '#ffd23f'); g2.addColorStop(1, '#eea00c');
  c.beginPath(); c.arc(0, 0, R*.23, 0, 7); c.fillStyle = g2; c.fill(); c.restore();
}
function getSprite(R, pink) {
  R = Math.max(6, Math.round(R / 2) * 2); const key = R + (pink ? 'p' : 'w');
  if (sprites[key]) return sprites[key];
  const G = R * 1.95, S = Math.ceil(G * 2 * DPR), c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.scale(DPR, DPR);
  if (pink) { const g = x.createRadialGradient(G, G, R*.3, G, G, G); g.addColorStop(0, 'rgba(255,120,175,.8)'); g.addColorStop(1, 'rgba(255,120,175,0)'); x.fillStyle = g; x.fillRect(0, 0, G*2, G*2); }
  drawDaisy(x, G, G, R, pink);
  return sprites[key] = { c, s: G * 2 };
}
function putSprite(sp, x, y, rot, sc = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(sp.c, -sp.s/2*sc, -sp.s/2*sc, sp.s*sc, sp.s*sc); ctx.restore();
}

/* ---------- daisy DOM (5 cánh) ---------- */
const petals = [];
function buildDaisy() {
  svg.innerHTML = '<defs><radialGradient id="pg" cx="50%" cy="85%" r="90%"><stop offset="0" stop-color="#fffdf5"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#e6ebf5"/></radialGradient>' +
    '<radialGradient id="cg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#ee9f0c"/></radialGradient></defs>';
  petals.length = 0; const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 5; i++) {
    const g = document.createElementNS(NS, 'g'), e = document.createElementNS(NS, 'ellipse');
    e.setAttribute('cx', 0); e.setAttribute('cy', -62); e.setAttribute('rx', 42); e.setAttribute('ry', 56);
    e.setAttribute('fill', 'url(#pg)'); e.setAttribute('stroke', 'rgba(110,120,160,.4)'); e.setAttribute('stroke-width', 1.5);
    g.appendChild(e); svg.appendChild(g); const p = { g, a: i * 72, x: 0, y: 0, r: 0, o: 1 }; petals.push(p); setP(p);
  }
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 120); c.setAttribute('cy', 120); c.setAttribute('r', 28); c.setAttribute('fill', 'url(#cg)'); svg.appendChild(c);
  for (let i = 0; i < 9; i++) { const d = document.createElementNS(NS, 'circle'), a = rnd(0, 6.28), r = rnd(2, 19);
    d.setAttribute('cx', 120 + Math.cos(a)*r); d.setAttribute('cy', 120 + Math.sin(a)*r); d.setAttribute('r', 2); d.setAttribute('fill', 'rgba(190,110,0,.45)'); svg.appendChild(d); }
}
function setP(p) { p.g.setAttribute('transform', `translate(${120 + p.x} ${120 + p.y}) rotate(${p.a + p.r})`); p.g.style.opacity = p.o; }
async function pluck(p, i) {
  await tween(380, k => { p.r = Math.sin(k * 14) * 5 * (1 - k * .3); setP(p); });
  const ang = (p.a - 90) * Math.PI / 180, ox = Math.cos(ang) * 35, oy = Math.sin(ang) * 35, dr = rnd(-30, 30), rs = rnd(150, 300) * (Math.random() < .5 ? -1 : 1);
  bell(note(i * 2 + 3), .11, 2.6); bell(note(i * 2 + 3) * 2, .03, 2, .08);
  await tween(1500, (e, k) => { p.x = ox * e + dr * e; p.y = oy * e + 330 * e * e; p.r = rs * e; p.o = 1 - clamp((k - .35) / .65); setP(p); });
}

/* ---------- Cánh đồng ---------- */
let flowers = [], ripples = [];
function buildField() {
  flowers = []; const step = Math.max(26, Math.min(W, H) / 13); let row = 0;
  for (let y = -step; y < H + step * 1.2; y += step * .78, row++)
    for (let x = -step + (row % 2 ? step / 2 : 0); x < W + step; x += step)
      flowers.push({ x: x + rnd(-.2, .2) * step, y: y + rnd(-.2, .2) * step, R: 17 + Math.floor(Math.random() * 5) * 2, rot: rnd(0, 6.28), ph: rnd(0, 6.28) });
  flowers.push({ x: W/2, y: H/2, R: 25, rot: 0, ph: 0, c: 1 });
  flowers.sort((a, b) => a.y - b.y);
}
function glowI(f, now) {
  let I = 0;
  for (const r of ripples) { const a = (now - r.t0) / 1000; if (a > 3.3) continue;
    const d = Math.hypot(f.x - r.x, f.y - r.y), rad = a * 230;
    const wave = Math.exp(-(((d - rad) / 55) ** 2)) * Math.max(0, 1 - a / 2.8);
    const core = d < rad ? Math.max(0, 1 - d / 230) * Math.exp(-a * .9) * .9 : 0;
    I = Math.max(I, wave * .9, core); }
  return Math.min(1, I);
}
function drawField(now) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2f6b4f'); g.addColorStop(1, '#1b4636'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ripples = ripples.filter(r => now - r.t0 < 3400);
  ctx.save(); ctx.translate(W/2, H/2); ctx.scale(zoom, zoom); ctx.translate(-W/2, -H/2);
  const m = 60 / zoom;
  for (const f of flowers) {
    if (Math.abs(f.x - W/2) * zoom > W/2 + 80 || Math.abs(f.y - H/2) * zoom > H/2 + 80) continue;
    const rot = f.rot + Math.sin(now / 900 + f.ph) * .1; putSprite(getSprite(f.R, 0), f.x, f.y, rot);
    const I = ripples.length ? glowI(f, now) : 0;
    if (I > .02) { ctx.globalAlpha = I; putSprite(getSprite(f.R, 1), f.x, f.y, rot); ctx.globalAlpha = 1; }
  }
  ctx.restore();
}

/* ---------- Hold: hoa hút vào ---------- */
let parts = [], holding = false, held = 0, spAcc = 0, chimeT = 0, t5 = false;
function spawnPart() {
  if (parts.length > 130) return; const a = rnd(0, 6.28), d = Math.hypot(W, H) * .6;
  parts.push({ x0: W/2 + Math.cos(a) * d, y0: H/2 + Math.sin(a) * d, t: 0, dur: rnd(1.4, 2.5), R: rnd(11, 22), rot: rnd(0, 6.28), vr: rnd(-3, 3), cu: rnd(-1, 1) });
}
function holdFrame(dt) {
  if (stage === 'hold') {
    held = holding ? held + dt : Math.max(0, held - dt * 1.1);
    const p1 = clamp(held / 5), p2 = clamp((held - 5) / 4);
    spAcc += dt * (holding ? 4 + p1 * 30 + p2 * 50 : 0); while (spAcc >= 1) { spAcc--; spawnPart(); }
    daisyWrap.style.transform = `translate(-50%,-50%) scale(${1 + p1 * .1 + p2 * .25})`;
    daisyWrap.style.filter = `drop-shadow(0 0 ${6 + p1 * 28 + p2 * 40}px rgba(255,236,160,${.15 + p1 * .6 + p2 * .25}))`;
    flash.style.transition = 'none'; flash.style.opacity = Math.pow(p2, 1.4);
    padSet(held / 9);
    if (holding && held >= 5 && !t5) { t5 = true; say(tT, TEXT5); }
    chimeT -= dt; if (holding && chimeT <= 0) { chimeT = rnd(.35, .7) - p1 * .2; bell(note(5 + Math.floor(Math.random() * 10)), .025 + p1 * .04, 2); }
    if (held >= 9) finish();
    var gp1 = p1, gp2 = p2;
  } else { gp1 = 1; gp2 = 1; }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.t += dt; const k = q.t / q.dur; if (k >= 1) { parts.splice(i, 1); continue; }
    const e = k * k, cx = W/2, cy = H/2, dx = cx - q.x0, dy = cy - q.y0, L = Math.hypot(dx, dy) || 1, sw = Math.sin(k * Math.PI) * 70 * q.cu;
    const x = q.x0 + dx * e + (-dy / L) * sw, y = q.y0 + dy * e + (dx / L) * sw;
    ctx.globalAlpha = Math.min(1, k * 5) * (1 - Math.pow(k, 5)); putSprite(getSprite(q.R, 0), x, y, q.rot + q.vr * q.t, 1 - .55 * k); ctx.globalAlpha = 1;
  }
  const gR = 70 + gp1 * 70 + gp2 * Math.max(W, H) * 1.2, g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, gR);
  g.addColorStop(0, `rgba(255,246,214,${.9 * Math.min(1, gp1 * 1.5) * (stage === 'hold' ? gp1 : 1)})`);
  g.addColorStop(.4, `rgba(255,190,225,${.4 * gp1})`); g.addColorStop(1, 'rgba(255,170,220,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* ---------- Bó hoa + mưa ---------- */
const imgs = [1, 2, 3, 4, 5].map(i => { const im = new Image(); im.src = `assets/${i}.jpg`; return im; });
function getPol(i) {
  if (pols[i]) return pols[i]; const im = imgs[i];
  if (!im.complete || !im.naturalWidth) return null;
  const w = 70, h = Math.round(w * im.naturalHeight / im.naturalWidth), pad = 6, bot = 16, TW = w + pad * 2 + 16, TH = h + pad + bot + 16;
  const c = document.createElement('canvas'); c.width = TW * DPR; c.height = TH * DPR; const x = c.getContext('2d'); x.scale(DPR, DPR);
  x.shadowColor = 'rgba(255,170,210,.6)'; x.shadowBlur = 10; x.fillStyle = '#fff'; x.fillRect(8, 8, w + pad * 2, h + pad + bot); x.shadowBlur = 0; x.drawImage(im, 8 + pad, 8 + pad, w, h);
  return pols[i] = { c, TW, TH };
}
let bq = null;
function leaf(c, ang) {
  c.save(); c.translate(200, 335); c.rotate(ang * Math.PI / 180); c.beginPath(); c.ellipse(0, -105, 24, 82, 0, 0, 7);
  const g = c.createLinearGradient(-24, 0, 24, 0); g.addColorStop(0, '#2f7a46'); g.addColorStop(1, '#5aae62'); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -25); c.lineTo(0, -180); c.stroke(); c.restore();
}
function renderBouquet(s) {
  const c = document.createElement('canvas'); c.width = 400 * s * DPR; c.height = 470 * s * DPR; const x = c.getContext('2d'); x.scale(s * DPR, s * DPR);
  [-76, -54, -32, -12, 12, 32, 54, 76].forEach(a => leaf(x, a));
  const L = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI * (1.02 + .96 * i / 8); L.push([200 + 140 * Math.cos(a), 215 + 100 * Math.sin(a), 44]); }
  L.push([100, 262, 38], [300, 262, 38], [150, 268, 36], [250, 268, 36]);
  for (let i = 0; i < 6; i++) { const a = Math.PI * (1.05 + .9 * i / 5); L.push([200 + 85 * Math.cos(a), 195 + 70 * Math.sin(a), 46]); }
  L.push([200, 168, 54]);
  L.forEach(([fx, fy, R], i) => { x.strokeStyle = '#4c9a52'; x.lineWidth = 4; x.beginPath(); x.moveTo(fx, fy); x.lineTo(200, 345); x.stroke(); });
  L.forEach(([fx, fy, R], i) => { x.save(); x.shadowColor = 'rgba(40,10,50,.35)'; x.shadowBlur = 8; drawDaisy(x, fx, fy, R, 0); x.restore(); void i; });
  for (let i = 0; i < 34; i++) { const a = Math.PI * rnd(1.0, 2.0), r = rnd(150, 192); x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.arc(200 + r * Math.cos(a), 215 + r * .8 * Math.sin(a), rnd(2, 3.6), 0, 7); x.fill(); }
  x.beginPath(); x.moveTo(70, 268); x.lineTo(205, 300); x.lineTo(200, 456); x.lineTo(172, 456); x.closePath(); x.fillStyle = '#ffb3cd'; x.fill();
  x.beginPath(); x.moveTo(330, 268); x.lineTo(195, 300); x.lineTo(200, 456); x.lineTo(228, 456); x.closePath(); x.fillStyle = '#f9709f'; x.fill();
  x.beginPath(); x.moveTo(205, 300); x.lineTo(200, 456); x.lineTo(214, 456); x.closePath(); x.fillStyle = 'rgba(255,255,255,.25)'; x.fill();
  x.fillStyle = '#fff2c9'; x.save(); x.translate(170, 350); x.rotate(-.3); x.beginPath(); x.ellipse(0, 0, 26, 12, 0, 0, 7); x.fill(); x.restore();
  x.save(); x.translate(230, 350); x.rotate(.3); x.beginPath(); x.ellipse(0, 0, 26, 12, 0, 0, 7); x.fill(); x.restore();
  x.beginPath(); x.arc(200, 351, 10, 0, 7); x.fill(); x.strokeStyle = '#fff2c9'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(193, 358); x.quadraticCurveTo(175, 385, 172, 410); x.moveTo(207, 358); x.quadraticCurveTo(225, 385, 228, 410); x.stroke();
  return c;
}
function initBouquet() {
  const bw = Math.min(W * .94, 430), s = bw / 400;
  bq = { c: renderBouquet(s), s, t0: performance.now(), acc: 0, pt: 1.2, pi: 0, rain: [], sp: Array.from({ length: 26 }, () => ({ a: rnd(0, 6.28), r: rnd(.45, 1.1), ph: rnd(0, 6), z: rnd(3, 7) })) };
}
function bouquetFrame(dt, now) {
  const b = bq, t = (now - b.t0) / 1000; b.acc += dt; b.pt += dt;
  while (b.acc > .11) { b.acc -= .11; b.rain.push({ k: 'd', x: rnd(0, W), y: -40, vy: rnd(70, 150), sa: rnd(8, 26), sf: rnd(.8, 1.8), p: rnd(0, 6), rot: rnd(0, 6), vr: rnd(-1, 1), R: rnd(9, 20), pk: Math.random() < .3 }); }
  if (b.pt > 1.5) { b.pt = 0; b.rain.push({ k: 'p', i: b.pi++ % 5, x: rnd(50, W - 50), y: -80, vy: rnd(80, 115), sa: rnd(10, 22), sf: rnd(.7, 1.3), p: rnd(0, 6), rot: rnd(-.4, .4), vr: rnd(-.4, .4) }); }
  for (let i = b.rain.length - 1; i >= 0; i--) {
    const r = b.rain[i]; r.y += r.vy * dt; r.rot += r.vr * dt; if (r.y > H + 120) { b.rain.splice(i, 1); continue; }
    const x = r.x + Math.sin(now / 1000 * r.sf + r.p) * r.sa;
    if (r.k === 'd') { ctx.globalAlpha = .92; putSprite(getSprite(r.R, r.pk), x, r.y, r.rot); ctx.globalAlpha = 1; }
    else { const pl = getPol(r.i); if (pl) { ctx.save(); ctx.translate(x, r.y); ctx.rotate(r.rot); ctx.drawImage(pl.c, -pl.TW / 2, -pl.TH / 2, pl.TW, pl.TH); ctx.restore(); } }
  }
  const e = easeO(clamp(t / 2.2)), sc = .35 + .65 * e, bx = W / 2, by = Math.max(H * .56, 470 * b.s * .5 + 40) + 200 * b.s * .35;
  const g = ctx.createRadialGradient(bx, by - 150 * b.s, 10, bx, by - 150 * b.s, 260 * b.s); g.addColorStop(0, 'rgba(255,150,200,.4)'); g.addColorStop(1, 'rgba(255,150,200,0)');
  ctx.globalAlpha = e; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(now / 1500) * .02); ctx.scale(sc, sc);
  ctx.drawImage(b.c, -200 * b.s, -(456 * b.s), 400 * b.s, 470 * b.s); ctx.restore(); ctx.globalAlpha = 1;
  for (const q of b.sp) { const a = .5 + .5 * Math.sin(now / 500 + q.ph), x = bx + Math.cos(q.a) * 190 * b.s * q.r, y = by - 220 * b.s + Math.sin(q.a) * 190 * b.s * q.r * .8;
    ctx.save(); ctx.globalAlpha = a * e; ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffd0e8'; ctx.shadowBlur = 8; const z = q.z * a;
    ctx.beginPath(); ctx.moveTo(0, -z); ctx.quadraticCurveTo(0, 0, z, 0); ctx.quadraticCurveTo(0, 0, 0, z); ctx.quadraticCurveTo(0, 0, -z, 0); ctx.quadraticCurveTo(0, 0, 0, -z); ctx.fill(); ctx.restore(); }
}

/* ---------- vòng lặp ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  if (mode === 'field') drawField(now); else if (mode === 'hold') holdFrame(dt); else if (mode === 'bouquet') bouquetFrame(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- Trò chơi ảnh ---------- */
let found = 0, gameStart = false;
function placePhotos() {
  const mg = 62, top = 125, bot = H - 150;
  let cand = shuffle(flowers.filter(f => !f.c && f.x > mg && f.x < W - mg && f.y > top && f.y < bot)), picks = [];
  for (const dmin of [110, 80, 40]) { picks = []; for (const f of cand) { if (picks.every(p => Math.hypot(p.x - f.x, p.y - f.y) > dmin)) picks.push(f); if (picks.length === 5) break; } if (picks.length === 5) break; }
  const order = shuffle([1, 2, 3, 4, 5]);
  picks.forEach((f, i) => {
    const d = document.createElement('div'); d.className = 'ph'; d.style.cssText = `left:${f.x}px;top:${f.y}px;--r:${rnd(-9, 9)}deg;animation-delay:${i * .15}s`;
    d.innerHTML = `<img src="assets/${order[i]}.jpg" alt="">`; d.addEventListener('pointerdown', ev => onPhoto(ev, d, order[i])); photosEl.appendChild(d);
  });
}
let lbOpen = false;
function onPhoto(ev, d, n) {
  if (stage !== 'game' || lbOpen) return; ev.stopPropagation(); lbOpen = true;
  sparkle(6, .07); lb.querySelector('img').src = `assets/${n}.jpg`; lb.classList.add('on');
  const close = async () => {
    lb.removeEventListener('pointerdown', close); lb.classList.remove('on'); d.classList.add('gone'); setTimeout(() => d.remove(), 600);
    found++; counter.textContent = `✿ ${found} / 5`; bell(note(4 + found * 2), .08, 2.4); await sleep(500); lbOpen = false;
    if (found === 5) toHold();
  };
  setTimeout(() => lb.addEventListener('pointerdown', close), 400);
}
async function startGame() {
  stage = 'game'; say(tC, null); say(tT, 'có trò chơi cho mày nè!'); counter.textContent = '✿ 0 / 5'; counter.classList.add('show'); placePhotos(); sparkle(4, .05);
}
addEventListener('pointerdown', e => {
  if (stage === 'field') { stage = 'ripple'; say(tC, null); setTimeout(startGame, 3000); }
  if (stage === 'ripple') { ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now() }); const n = Math.floor(Math.random() * 10); bell(note(n + 3), .07, 2.6); bell(note(n + 3) * 2, .025, 2, .1); }
});

/* ---------- Hold ---------- */
hit.addEventListener('pointerdown', e => { if (stage !== 'hold') return; e.preventDefault(); holding = true; say(tT, null); padStart(); });
const release = () => { if (!holding) return; holding = false; t5 = false; if (stage === 'hold') say(tT, 'tao kêu mày đè mà???'); };
['pointerup', 'pointercancel', 'blur'].forEach(ev => addEventListener(ev, release));
addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Các màn ---------- */
async function toHold() {
  stage = 'zoomin'; say(tT, null); counter.classList.remove('show'); await sleep(900);
  buildDaisy(); await tween(2400, k => zoom = 1 + 4 * k, easeIO);
  daisyWrap.classList.add('on'); cv.style.transition = 'opacity 1s'; cv.style.opacity = 0; await sleep(1100);
  mode = 'hold'; cv.style.transition = 'none'; cv.style.opacity = 1; parts = []; held = 0; holding = false;
  stage = 'hold'; hit.classList.add('on'); say(tT, 'đè vô cái bông hoa đi con ngu');
}
async function finish() {
  if (stage !== 'hold') return; stage = 'done'; holding = false; hit.classList.remove('on'); padStop(); say(tT, null);
  [0, 2, 4, 7, 9, 12].forEach((n, i) => bell(note(n), .09, 4, i * .12)); flash.style.transition = 'opacity .5s'; flash.style.opacity = 1;
  await sleep(1200); daisyWrap.classList.remove('on'); daisyWrap.style.filter = ''; daisyWrap.style.transform = 'translate(-50%,-50%)'; $('#bg2').classList.add('on');
  parts = []; initBouquet(); mode = 'bouquet'; await sleep(400);
  flash.style.transition = 'opacity 3.4s ease'; flash.style.opacity = 0; sparkle(10, .06); await sleep(2300);
  document.querySelectorAll('#caption span').forEach((s, i) => setTimeout(() => s.classList.add('show'), i * 1500));
  setTimeout(() => sparkle(8, .05), 2000);
}
async function main() {
  buildDaisy();
  bgm.volume = .75; bgm.play().catch(() => $('#musicHint').classList.add('on'));
  const intro = $('#intro'); await sleep(500); intro.classList.add('show'); await sleep(5200); intro.classList.remove('show'); await sleep(1700);
  stage = 'daisy'; daisyWrap.classList.add('on'); await sleep(1300);
  const order = shuffle([0, 1, 2, 3, 4]); const words = ['thương', 'không thương', 'thương', 'không thương', 'thương!'];
  for (let i = 0; i < 5; i++) { say(tT, words[i]); await pluck(petals[order[i]], i); await sleep(450); }
  await sleep(500); say(tT, null);
  stage = 'zoom'; buildField(); zoom = 5; mode = 'field'; cv.style.transition = 'opacity 1s'; cv.style.opacity = 1; daisyWrap.classList.remove('on');
  sparkle(5, .05); await tween(3800, k => zoom = 5 - 4 * k, easeIO);
  await sleep(500); stage = 'field'; say(tC, 'bấm đại vô màn hình đi trân');
}
main();
})();
