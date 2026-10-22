import './style.css';

document.documentElement.classList.add('has-js');
import { CONFIG, PREVIEW } from './config.js';
import { startNetwork, onBeacon, onStatus, onTick, roundAt, roundTime, PERIOD_MS, waitForBeacon, net } from './drand.js';
import { seal, open, inspect } from './seal.js';
import { SealedCube } from './cube3d.js';
import { initConsole } from './console.js';
import { initBatch } from './batch.js';
import { initCardModal } from './card.js';
import { initScene } from './scene.js';
import { $, $$, fmtInt, countdown, scramble, copyText, reduceMotion } from './util.js';

// ---------- config + static wiring ----------
for (const id of ['ctaBuy', 'tokBuy']) $(`#${id}`).href = CONFIG.pumpUrl;
for (const id of ['tokX', 'footX']) $(`#${id}`).href = CONFIG.xUrl;
if (CONFIG.ca) {
  $('#caRow').hidden = false;
  $('#caVal').textContent = CONFIG.ca;
  $('#caCopy').addEventListener('click', (e) => copyText(CONFIG.ca, e.currentTarget));
}
if (PREVIEW) $('#previewNote').hidden = false;
$$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));

// ---------- live beacon panel ----------
const beaconJson = $('#beaconJson');
const bStatus = $('#bStatus');
function jsonLine(k, v, cls, last = false) {
  return `  <span class="jk">"${k}"</span>: <span class="${cls}">${v}</span>${last ? '' : ','}`;
}
function renderBeacon() {
  const b = net.latest;
  if (PREVIEW) {
    bStatus.textContent = 'blocked in preview';
    bStatus.className = 'beacon-st';
    beaconJson.innerHTML = `<code>{\n${jsonLine('round', fmtInt(roundAt()).replace(/,/g, ''), 'jn')}\n${jsonLine('randomness', '"relay blocked in this preview"', 'js')}\n${jsonLine('signature', '"opens on the deployed site"', 'js', true)}\n}</code>`;
    return;
  }
  if (!b) {
    bStatus.textContent = net.status === 'unreachable' ? 'relay unreachable · retrying' : 'connecting';
    bStatus.className = net.status === 'unreachable' ? 'beacon-st is-bad' : 'beacon-st';
    return;
  }
  const f = net.lastFetch;
  bStatus.textContent = `${f.status || 200} · ${f.ms} ms`;
  bStatus.className = 'beacon-st is-live';
  beaconJson.innerHTML = `<code>{\n${jsonLine('round', b.round, 'jn')}\n${jsonLine('randomness', `"${b.randomness}"`, 'js')}\n${jsonLine('signature', `"${b.signature}"`, 'js', true)}\n}</code>`;
}
// ---------- network + heartbeat ----------
const chip = $('#liveChip');
const liveLabel = $('#liveLabel');
const liveRound = $('#liveRound');
const beat = $('#beat');
const bBar = $('#bBar');
const bNext = $('#bNext');

onStatus((s) => {
  chip.dataset.status = s;
  liveLabel.textContent = { live: 'quicknet', connecting: 'connecting', unreachable: 'relay retrying', preview: 'preview' }[s] || s;
  renderBeacon();
});

const clockN = $('#clockN');
const clockBar = $('#clockBar');
function showRound(r) {
  liveRound.textContent = `#${fmtInt(r)}`;
  const str = fmtInt(r);
  clockN.innerHTML = `${str.slice(0, -3)}<b>${str.slice(-3)}</b>`;
}
showRound(roundAt());
onTick(showRound);

(function beatLoop() {
  const now = Date.now();
  const p = (now - roundTime(roundAt(now))) / PERIOD_MS;
  beat.style.transform = `scaleX(${p.toFixed(4)})`;
  bBar.style.transform = `scaleX(${p.toFixed(4)})`;
  clockBar.style.transform = `scaleX(${p.toFixed(4)})`;
  bNext.textContent = `next round in ${((1 - p) * 3).toFixed(1)}s`;
  requestAnimationFrame(beatLoop);
})();

onBeacon(renderBeacon);
if (PREVIEW) onTick(renderBeacon);

// ---------- hero cipher field ----------
(function fillHeroTex() {
  const el = $('#heroTex');
  if (!el) return;
  const bytes = new Uint8Array(48 * 60);
  crypto.getRandomValues(bytes);
  const lines = [];
  for (let i = 0; i < 60; i++) {
    let bin = '';
    for (let j = 0; j < 48 * 2; j++) bin += String.fromCharCode(bytes[(i * 48 + j) % bytes.length]);
    lines.push(btoa(bin));
  }
  el.textContent = lines.join('\n');
})();

// ---------- hero word ----------
const fw = $('#futureWord');
if (!reduceMotion()) {
  setTimeout(() => scramble(fw, 'future', { duration: 1100 }), 500);
  setInterval(() => { if (!document.hidden) scramble(fw, 'future', { duration: 1100 }); }, 9000);
}

// ---------- hero block + ambient seal loop ----------
const block = new SealedCube($('#block'), { zoom: 1 });
const hudObj = $('#hudObj');
const hudRound = $('#hudRound');
const hudState = $('#hudState');
const hudSniper = $('#hudSniper');

const HOUSE = ['BUY 3.2 SOL $OPAQUE', 'BUY 0.75 SOL $OPAQUE', 'BUY 12 SOL $OPAQUE', 'BUY 1.5 SOL $OPAQUE', 'BUY 4.2 SOL $OPAQUE', 'SELL 2 SOL $KORA'];
let heroVisible = true;
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe($('#stage'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitHero = async () => { while (!heroVisible || document.hidden) await sleep(400); };

function setState(html) { hudState.innerHTML = html; }

async function heroLoop() {
  let i = 0;
  for (;;) {
    await waitHero();
    const text = HOUSE[i++ % HOUSE.length];
    const target = roundAt() + 4;
    hudObj.textContent = 'sealed_order.age';
    hudRound.textContent = `round ${fmtInt(target)}`;
    hudSniper.textContent = 'watching';
    setState('sealing');
    block.seal();
    let armored;
    try { armored = await seal(text, target); } catch { await sleep(3000); continue; }
    await sleep(900);
    hudSniper.textContent = 'unreadable';
    const t = roundTime(target);
    let done = false;
    const tick = () => {
      if (done) return;
      const left = t - Date.now();
      setState(left > 0
        ? `<span class="is-red">SEALED</span> · opens in ${countdown(left)}`
        : 'round reached · fetching signature');
      requestAnimationFrame(tick);
    };
    tick();
    try {
      await waitForBeacon(target);
      const res = await open(armored);
      done = true;
      block.open(res.text, 0);
      hudObj.textContent = res.text;
      setState('OPENED · read early by: nobody');
      hudSniper.textContent = 'too late';
    } catch {
      done = true;
      setState('waiting for drand relay');
    }
    await sleep(5200);
  }
}

block.init().then((ok) => {
  if (!ok) $('#stage').classList.add('no-gl');
  heroLoop();
});

// ---------- threat pane: the same order, really sealed ----------
(async () => {
  const json = '{"side":"BUY","amount":"2.5 SOL","mint":"$OPAQUE","slippage":"15%","signer":"7xKX…f3Qe"}';
  const target = roundAt() + 1200; // about an hour out
  try {
    const armored = await seal(json, target);
    const info = inspect(armored);
    const body = armored.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    $('#swCipher').textContent = body.slice(160, 208);
    $('#swRound').textContent = `opens round ${fmtInt(info.round)}`;
    $('#threatNote').textContent = `The same order, sealed just now to round ${fmtInt(info.round)}, about an hour from now. Nothing in it can be read or priced until then.`;
  } catch { /* leave placeholder */ }
})();

// ---------- reveal on scroll ----------
(function reveals() {
  const els = $$('.sec-head, .term, .sandwich, .facts, .batch, .verify, .status, .token-main, .token-art, .beacon-row, .foot-top');
  if (reduceMotion() || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  els.forEach((el) => { el.classList.add('rv'); io.observe(el); });
})();

// ---------- the rest ----------
initCardModal();
initConsole({ block });
initBatch();
initScene();
startNetwork();
