// Demo batch: orders generated in the browser, really sealed to the same
// upcoming round, then opened together in the order they were sealed.
import { seal, open } from './seal.js';
import { roundAt, roundTime, waitForBeacon } from './drand.js';
import { $, clock, countdown, fmtInt, sha256Hex, short } from './util.js';
import { isoCube } from './isocube.js';

const SLOTS = 6;

const TICKERS = ['$OPAQUE', '$KORA', '$VELT', '$NODE', '$HALO', '$RIFT', '$MOTE', '$LUMA'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomOrder() {
  const side = Math.random() < 0.72 ? 'BUY' : 'SELL';
  const amt = [0.4, 0.75, 1, 1.5, 2, 2.5, 3.2, 5, 8, 12][(Math.random() * 10) | 0];
  return `${side} ${amt} SOL ${TICKERS[(Math.random() * TICKERS.length) | 0]}`;
}

export function initBatch() {
  const section = $('#batch');
  const rowsEl = $('#batchRows');
  const idEl = $('#batchId');
  const countEl = $('#batchCount');
  const etaEl = $('#batchEta');
  const readEl = $('#batchRead');
  const queueEl = $('#queue');
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = `<div class="slot-cube"></div><span class="slot-pos">#${String(i + 1).padStart(2, '0')}</span><span class="slot-lbl">empty</span>`;
    queueEl.append(el);
    slots.push(el);
  }
  const resetSlots = () => slots.forEach((el) => {
    el.className = 'slot';
    el.querySelector('.slot-cube').innerHTML = '';
    el.querySelector('.slot-lbl').textContent = 'empty';
  });
  const fillSlot = (i, hash) => {
    const el = slots[i];
    if (!el) return;
    el.className = 'slot is-sealed';
    el.querySelector('.slot-cube').innerHTML = isoCube({ size: 15 });
    el.querySelector('.slot-lbl').textContent = short(hash, 4, 4);
  };
  const openSlot = (i, text) => {
    const el = slots[i];
    if (!el) return;
    el.className = 'slot is-open';
    el.querySelector('.slot-cube').innerHTML = isoCube({ size: 15, open: true });
    el.querySelector('.slot-lbl').textContent = text;
  };

  let visible = false;
  let running = false;
  let wakers = [];
  let target = 0;
  let rows = [];
  let phase = 'idle';

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { wakers.forEach((w) => w()); wakers = []; if (!running) loop(); }
  }, { rootMargin: '200px 0px' });
  io.observe(section);

  const whenVisible = () => (visible ? Promise.resolve() : new Promise((r) => wakers.push(r)));

  function header() {
    countEl.textContent = String(rows.length);
    readEl.textContent = `${rows.filter((r) => r.text).length} / ${rows.length}`;
  }

  setInterval(() => {
    if (!target) return;
    if (phase === 'sealing' || phase === 'waiting') {
      const left = roundTime(target) - Date.now();
      etaEl.textContent = left > 0 ? countdown(left) : 'fetching';
    } else if (phase === 'open') {
      etaEl.textContent = 'opened';
    }
  }, 100);

  function rowEl(r) {
    const el = document.createElement('div');
    el.className = 'brow is-new';
    el.setAttribute('role', 'row');
    el.innerHTML = '<span class="pos" role="cell"></span><span role="cell" class="at"></span><span class="pay" role="cell"></span><span role="cell" class="rd"></span><span role="cell"><span class="state"></span></span>';
    el.querySelector('.pos').textContent = `#${String(r.pos).padStart(2, '0')}`;
    el.querySelector('.at').textContent = clock(r.at, true);
    el.querySelector('.pay').textContent = `age · ${short(r.hash, 10, 6)}`;
    el.querySelector('.rd').textContent = fmtInt(target);
    el.querySelector('.state').textContent = 'sealed';
    return el;
  }

  async function loop() {
    running = true;
    for (;;) {
      await whenVisible();
      const now = roundAt();
      target = Math.ceil((now + 6) / 5) * 5; // a batch round every 15s, 18-30s out
      idEl.textContent = fmtInt(target / 5);
      rows = [];
      rowsEl.textContent = '';
      resetSlots();
      phase = 'sealing';
      header();

      const deadline = roundTime(target) - 3500;
      for (let i = 0; i < 6; i++) {
        await sleep(900 + Math.random() * 1700);
        if (Date.now() > deadline) break;
        const text = randomOrder();
        const at = Date.now();
        let armored;
        try { armored = await seal(text, target); } catch { continue; }
        const r = { pos: rows.length + 1, at, armored, hash: await sha256Hex(armored), text: null };
        rows.push(r);
        r.el = rowEl(r);
        rowsEl.append(r.el);
        fillSlot(r.pos - 1, r.hash);
        header();
      }

      phase = 'waiting';
      try {
        await waitForBeacon(target);
      } catch { continue; }

      queueEl.classList.add('flash');
      setTimeout(() => queueEl.classList.remove('flash'), 900);
      for (const r of rows) {
        try {
          const res = await open(r.armored);
          r.text = res.text;
          openSlot(r.pos - 1, res.text);
          r.el.classList.remove('is-new');
          r.el.classList.add('is-open');
          r.el.querySelector('.pay').textContent = res.text;
          r.el.querySelector('.state').textContent = 'opened';
        } catch {
          r.el.querySelector('.state').textContent = 'error';
        }
        header();
        await sleep(70);
      }
      phase = 'open';
      await sleep(6500);
    }
  }
}
