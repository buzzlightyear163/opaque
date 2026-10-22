// Share card: a 16:9 PNG drawn on canvas, ready to post on X.
import { B64, fmtInt } from './util.js';
import { CONFIG, PREVIEW } from './config.js';

const W = 1600;
const H = 900;
const C = { void: '#050506', line: '#1d2026', dim: '#646a73', mute: '#9aa0a9', text: '#e9ebee', seal: '#ff4530' };

const utc = (ms) => (ms ? new Date(ms).toISOString().slice(11, 19) + ' UTC' : 'via sealed link');
const dur = (ms) => {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(s % 3600 ? 1 : 0)}h`;
};

function font(ctx, weight, size, family = 'mono', condensed = true) {
  const fam = family === 'mono'
    ? '"Martian Mono", ui-monospace, Menlo, monospace'
    : '"Instrument Sans", system-ui, sans-serif';
  ctx.font = `${weight} ${condensed && family === 'mono' ? 'condensed ' : ''}${size}px ${fam}`;
  try { ctx.fontStretch = condensed && family === 'mono' ? 'condensed' : 'normal'; } catch { /* noop */ }
}

const hash = (a, b, k) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };

// The sealed block, same as the brand graphics: a solid isometric cube split
// down x = 0, ciphertext laid in each face's plane, light leaking from the seam.
function drawCube(ctx, cx, cy, S, { open = false, plain = '' } = {}) {
  const gap = open ? 0.22 : 0.04;
  const P = (x, y, z) => [cx + (x - z) * 0.866 * S, cy + (x + z) * 0.5 * S - y * S];
  const plates = { top: '#f4f5f7', left: '#959ba4', right: '#40454d', inner: open ? '#0c0d0f' : '#ff4530' };
  const inks = { top: '#b3b8bf', left: '#737982', right: '#2e3238', inner: open ? '#ffffff' : '#c9301c' };
  const weights = { top: 700, left: 600, right: 500, inner: 700 };
  const faces = [];
  [[-1 - gap, -gap], [gap, 1 + gap]].forEach(([x0, x1], h) => {
    faces.push({ kind: h === 0 ? 'inner' : 'right', h, poly: [P(x1, 1, 1), P(x1, 1, -1), P(x1, -1, -1), P(x1, -1, 1)], m: [0.866, -0.5, 0, 1, ...P(x1, 1, 1)], len: [2 * S, 2 * S] });
    faces.push({ kind: 'left', h, poly: [P(x0, 1, 1), P(x1, 1, 1), P(x1, -1, 1), P(x0, -1, 1)], m: [0.866, 0.5, 0, 1, ...P(x0, 1, 1)], len: [(x1 - x0) * S, 2 * S] });
    faces.push({ kind: 'top', h, poly: [P(x0, 1, -1), P(x1, 1, -1), P(x1, 1, 1), P(x0, 1, 1)], m: [0.866, 0.5, -0.866, 0.5, ...P(x0, 1, -1)], len: [(x1 - x0) * S, 2 * S] });
  });
  const path = (poly) => { ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  const cw = S * 0.075, ch = cw * 1.6;
  const text = plain.replace(/\s+/g, '');
  for (const f of faces) {
    ctx.save();
    path(f.poly);
    ctx.fillStyle = plates[f.kind];
    ctx.fill();
    ctx.clip();
    ctx.transform(...f.m);
    ctx.fillStyle = inks[f.kind];
    font(ctx, weights[f.kind], ch * 0.74, 'mono', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isPlain = f.kind === 'inner' && open && text;
    const seed = { top: 1, left: 2, right: 3, inner: 4 }[f.kind] + f.h * 10;
    for (let j = 0; j < f.len[1] / ch + 1; j++) {
      for (let i = 0; i < f.len[0] / cw + 1; i++) {
        const t = isPlain ? text[(i + j * 3) % text.length] : B64[(hash(i, j, seed) * 64) | 0];
        ctx.fillText(t, i * cw + cw / 2, j * ch + ch / 2);
      }
    }
    ctx.restore();
  }
  // light from the seam: red while sealed, white once open
  const seam = [P(0, 1, -1), P(0, 1, 1), P(0, -1, 1)];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = open
    ? [[2, 'rgba(255,255,255,0.5)', 3], [18, 'rgba(255,255,255,0.2)', 22]]
    : [[3, 'rgba(255,90,60,0.9)', 4], [16, 'rgba(255,69,48,0.55)', 14], [44, 'rgba(255,69,48,0.3)', 34]];
  for (const [blur, color, w] of glow) {
    ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...seam[0]);
    ctx.lineTo(...seam[1]);
    ctx.lineTo(...seam[2]);
    ctx.stroke();
  }
  ctx.restore();
}

// Brand mark: the same cube in miniature.
function drawMark(ctx, x, y, s) {
  const pts = (arr) => { ctx.beginPath(); arr.forEach(([a, b], k) => (k ? ctx.lineTo(x + a * s, y + b * s) : ctx.moveTo(x + a * s, y + b * s))); ctx.closePath(); };
  pts([[10, 1.6], [18.2, 6.3], [10, 11], [1.8, 6.3]]); ctx.fillStyle = '#f4f5f7'; ctx.fill();
  pts([[1.8, 6.3], [10, 11], [10, 20.4], [1.8, 15.7]]); ctx.fillStyle = '#959ba4'; ctx.fill();
  pts([[10, 11], [18.2, 6.3], [18.2, 15.7], [10, 20.4]]); ctx.fillStyle = '#40454d'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 14.1 * s, y + 3.95 * s); ctx.lineTo(x + 5.9 * s, y + 8.65 * s); ctx.lineTo(x + 5.9 * s, y + 18.05 * s);
  ctx.strokeStyle = '#ff4530'; ctx.lineWidth = 1.4 * s; ctx.lineJoin = 'round'; ctx.stroke();
}

export async function renderCard(job) {
  try {
    await Promise.all([
      document.fonts.load('500 40px "Martian Mono"'),
      document.fonts.load('400 24px "Instrument Sans"'),
    ]);
  } catch { /* fallback fonts */ }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const open = !!job.openedText;
  const M = 80;

  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, W, H);

  // frame
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(M / 2, M / 2, W - M, H - M);

  ctx.save();
  const sp = ctx.createRadialGradient(1180, 470, 0, 1180, 470, 520);
  sp.addColorStop(0, '#1f2227'); sp.addColorStop(1, 'rgba(5,5,6,0)');
  ctx.fillStyle = sp; ctx.fillRect(560, 0, 1040, 900);
  ctx.restore();
  drawCube(ctx, 1180, 470, 150, { open, plain: job.openedText || '' });

  // wordmark
  const mx = M, my = M + 4;
  drawMark(ctx, mx, my - 2, 1.6);
  ctx.fillStyle = C.text;
  font(ctx, 600, 26, 'mono', false);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('OPAQUE', mx + 46, my + 16);

  // status pill
  font(ctx, 500, 20, 'mono', false);
  const label = open ? 'OPENED' : 'SEALED';
  const pw = ctx.measureText(label).width + 56;
  const px = M, py = M + 72;
  ctx.strokeStyle = open ? C.text : C.seal;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, 42);
  ctx.fillStyle = open ? C.text : C.seal;
  ctx.beginPath();
  ctx.arc(px + 22, py + 21, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(label, px + 38, py + 22);

  // headline
  ctx.fillStyle = C.text;
  ctx.textBaseline = 'alphabetic';
  if (open) {
    font(ctx, 500, 92, 'mono', true);
    const words = job.openedText.slice(0, 60).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > 760 && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, M, 330 + i * 92));
    font(ctx, 400, 26, 'sans');
    ctx.fillStyle = C.mute;
    ctx.fillText(job.incoming ? 'Read early by: nobody.' : `Sealed ${dur(job.lockedMs)} before reveal. Read early by: nobody.`, M, 330 + Math.min(3, lines.length) * 92 + 6);
  } else {
    font(ctx, 500, 124, 'mono', true);
    ctx.fillText('Front-run', M, 352);
    ctx.fillText('this.', M, 470);
  }

  // rows
  const rows = open
    ? [['SEALED', utc(job.sealedAt)], ['OPENED', `round ${fmtInt(job.round)}`], ['LOCKED', dur(job.lockedMs)]]
    : [['SEALED', utc(job.sealedAt)], ['OPENS', `round ${fmtInt(job.round)}`], ['LOCK', dur(job.lockedMs)]];
  rows.forEach(([k, v], i) => {
    const y = 620 + i * 44;
    font(ctx, 500, 18, 'mono', false);
    ctx.fillStyle = C.dim;
    ctx.fillText(k, M, y);
    font(ctx, 500, 22, 'mono', false);
    ctx.fillStyle = C.text;
    ctx.fillText(v, M + 140, y);
  });

  // footer
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(M, H - M - 46);
  ctx.lineTo(W - M, H - M - 46);
  ctx.stroke();
  font(ctx, 400, 21, 'sans');
  ctx.fillStyle = C.mute;
  ctx.fillText(open
    ? 'Opened with drand quicknet’s public signature. Everyone saw it at the same instant.'
    : 'Encrypted to drand quicknet. Nobody can read it before that round. Not even OPAQUE.', M, H - M - 8);
  font(ctx, 500, 22, 'mono', false);
  ctx.fillStyle = C.text;
  ctx.textAlign = 'right';
  ctx.fillText(CONFIG.ticker, W - M, H - M - 8);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

let currentUrl = null;
let currentBlob = null;

export async function showCard(job) {
  const modal = document.getElementById('cardModal');
  const img = document.getElementById('cardImg');
  const post = document.getElementById('cardPost');
  const blob = await renderCard(job);
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentBlob = blob;
  currentUrl = URL.createObjectURL(blob);
  img.src = currentUrl;

  const text = job.openedText
    ? `${job.openedText}\n\n${job.incoming ? '' : `Sealed for ${dur(job.lockedMs)}. `}Read early by: nobody.\n\n${CONFIG.ticker}`
    : `Front-run this.\n\nSealed to drand round ${fmtInt(job.round)}. Opens on the second.\n\n${CONFIG.ticker}`;
  const params = new URLSearchParams({ text });
  if (!job.openedText && job.link && /^https?:/.test(job.link)) params.set('url', job.link);
  post.href = `https://x.com/intent/post?${params}`;

  modal.hidden = false;
  document.getElementById('cardClose').focus();
}

export function initCardModal() {
  const modal = document.getElementById('cardModal');
  const close = () => { modal.hidden = true; };
  document.getElementById('cardClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  // the sandboxed preview cannot hand out files; the deployed site can
  if (PREVIEW) document.getElementById('cardSave').hidden = true;
  document.getElementById('cardSave').addEventListener('click', () => {
    if (!currentUrl) return;
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = 'opaque-seal.png';
    document.body.append(a);
    a.click();
    a.remove();
  });
  const copyBtn = document.getElementById('cardCopy');
  copyBtn.addEventListener('click', async () => {
    if (!currentBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentBlob })]);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Right-click the image to copy';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy image'; }, 1800);
  });
}
