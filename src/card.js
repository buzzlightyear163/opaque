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

// An isometric block drawn from base64 glyphs, split down the seam.
function drawBlock(ctx, cx, cy, size, { open = false, plain = '' } = {}) {
  const cw = 15, ch = 24;
  const s = size / 2;
  const iso = (x, y, z) => [cx + (x - z) * 0.866 * s, cy + (x + z) * 0.5 * s - y * s];
  const gap = open ? 0.34 : 0.03;
  const halves = [-1, 1];
  font(ctx, 500, 19, 'mono', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const seeded = (i, j) => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const faces = [];
  for (const side of halves) {
    const ox = side * gap;
    // each half spans x in [0,1] or [-1,0] in local units, shifted by ox
    const x0 = side < 0 ? -1 + ox : 0 + ox;
    const x1 = side < 0 ? 0 + ox : 1 + ox;
    faces.push({ lum: 0.92, pts: [iso(x0, 1, -1), iso(x1, 1, -1), iso(x1, 1, 1), iso(x0, 1, 1)] });   // top
    faces.push({ lum: 0.5, pts: [iso(x0, 1, 1), iso(x1, 1, 1), iso(x1, -1, 1), iso(x0, -1, 1)] });    // front (z=1)
    faces.push({ lum: 0.26, pts: [iso(x1, 1, 1), iso(x1, 1, -1), iso(x1, -1, -1), iso(x1, -1, 1)] }); // right side
  }
  const inside = (px, py, pts) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const core = open ? { x: cx, y: cy, r: s * 0.42 } : null;
  const plainChars = plain.replace(/\s+/g, '');
  const x0 = cx - size * 1.25, x1 = cx + size * 1.25, y0 = cy - size * 1.1, y1 = cy + size * 1.1;
  for (let y = y0, j = 0; y < y1; y += ch, j++) {
    for (let x = x0, i = 0; x < x1; x += cw, i++) {
      const px = x + cw / 2, py = y + ch / 2;
      let lum = -1;
      for (const f of faces) if (inside(px, py, f.pts)) lum = Math.max(lum, f.lum);
      const r = seeded(i, j);
      if (core && Math.hypot(px - core.x, py - core.y) < core.r && plainChars) {
        ctx.fillStyle = C.text;
        ctx.globalAlpha = 1;
        ctx.fillText(plainChars[(i + j * 5) % plainChars.length], px, py);
        continue;
      }
      if (lum < 0) {
        if (r > 0.82) {
          ctx.globalAlpha = 0.07;
          ctx.fillStyle = C.mute;
          ctx.fillText(B64[(r * 997) % 64 | 0], px, py);
        }
        continue;
      }
      const l = Math.min(1, Math.max(0, lum + (r - 0.5) * 0.22));
      ctx.globalAlpha = 0.25 + l * 0.75;
      ctx.fillStyle = l > 0.6 ? C.text : C.mute;
      const ramp = 'ilj1tfr7Iczvx3sJLT2nuoeaYZy5FkhSE4P6w9dbqpXVK0gUGOCAHDNRmBQM8W';
      const idx = Math.min(ramp.length - 1, Math.floor(l * (ramp.length - 1) + (r - 0.5) * 6));
      ctx.fillText(ramp[Math.max(0, idx)], px, py);
    }
  }
  ctx.globalAlpha = 1;
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

  drawBlock(ctx, 1170, 450, 250, { open, plain: job.openedText || '' });

  // wordmark
  ctx.fillStyle = C.text;
  const mx = M, my = M + 4;
  ctx.fillRect(mx, my, 13, 30);
  ctx.fillRect(mx + 17, my, 13, 30);
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
