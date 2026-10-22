export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const fmtInt = (n) => Number(n).toLocaleString('en-US');
export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function clock(ms = Date.now(), withMs = false) {
  const d = new Date(ms);
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return withMs ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

export function countdown(ms) {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenth = Math.floor((t % 1000) / 100);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}.${tenth}`;
}

export const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const randChar = () => B64[(Math.random() * 64) | 0];

export async function sha256Hex(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle needs a secure context; fall back to a short FNV hash for display only
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
  }
}

export const short = (hex, a = 4, b = 4) => `${hex.slice(0, a)}…${hex.slice(-b)}`;

// Scramble an element's text through base64 glyphs and resolve to `final`.
export function scramble(el, final, { duration = 900, keep = '' } = {}) {
  if (reduceMotion()) { el.textContent = final; return Promise.resolve(); }
  return new Promise((resolve) => {
    const start = performance.now();
    const len = final.length;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const settled = Math.floor(p * len);
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = final[i];
        s += i < settled || c === ' ' || keep.includes(c) ? c : randChar();
      }
      el.textContent = s;
      if (p < 1) requestAnimationFrame(step); else { el.textContent = final; resolve(); }
    };
    requestAnimationFrame(step);
  });
}

export async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (btn) {
    const label = btn.dataset.label || btn.textContent;
    btn.dataset.label = label;
    btn.textContent = ok ? 'copied' : 'select + copy';
    setTimeout(() => { btn.textContent = label; }, 1400);
  }
  return ok;
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
  return value;
}
