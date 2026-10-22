// The seal console: compose an order, seal it to a future drand round for real,
// count down, and open it the moment that round's signature is published.
import { seal, open, inspect, linkFor, fromLinkToken, LINK_PREFIX } from './seal.js';
import { roundAt, roundTime, onTick, waitForBeacon } from './drand.js';
import { PREVIEW } from './config.js';
import { $, clock, countdown, fmtInt, sha256Hex, short, copyText } from './util.js';
import { Sniper } from './sniper.js';
import { showCard } from './card.js';

export function initConsole({ block, onSealed } = {}) {
  const form = $('#cmd');
  const out = $('#out');
  const run = $('#runBtn');
  const sideBtn = $('#fSide');
  const amount = $('#fAmount');
  const mint = $('#fMint');
  const opens = $('#fOpens');
  const count = $('#count');
  const countBig = $('#countBig');
  const countSub = $('#countSub');
  const countLabel = $('#countLabel');
  const rounds = $('#rounds');
  const reveal = $('#reveal');
  const revealText = $('#revealText');
  const revealMeta = $('#revealMeta');
  const cipherWrap = $('#cipherWrap');
  const cipherOut = $('#cipherOut');
  const cipherBytes = $('#cipherBytes');
  const actions = $('#actions');
  const sniper = new Sniper($('#sniperLog'));

  let ms = 10000;
  let job = null;
  let ctl = null;
  let raf = 0;

  // ---- output helpers ----
  function line(key, value, cls = '') {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    const k = document.createElement('span');
    k.className = 'lk';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    p.append(k, v);
    out.append(p);
    return v;
  }
  const clear = () => { out.textContent = ''; };

  function boot() {
    clear();
    line('opaque', 'v0.1 · tlock-js 0.9.0 · drand quicknet');
    line('chain', '52db9ba7…e971 · 3s rounds · bls-unchained-g1-rfc9380');
    line('ready', 'set an order and press seal', 'ok');
  }

  // ---- controls ----
  sideBtn.addEventListener('click', () => {
    const next = sideBtn.dataset.side === 'BUY' ? 'SELL' : 'BUY';
    sideBtn.dataset.side = next;
    sideBtn.textContent = next;
  });
  opens.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ms]');
    if (!b) return;
    opens.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    ms = Number(b.dataset.ms);
  });
  opens.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...opens.querySelectorAll('button')];
    const i = btns.findIndex((x) => x.getAttribute('aria-checked') === 'true');
    const n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    n.click();
    n.focus();
  });
  amount.addEventListener('input', () => { amount.value = amount.value.replace(/[^0-9.]/g, '').slice(0, 8); });
  mint.addEventListener('input', () => { mint.value = mint.value.replace(/[^$A-Za-z0-9]/g, '').slice(0, 12); });

  function readOrder() {
    const amt = Number(amount.value);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 100000) throw new Error('Amount must be a number above 0.');
    let m = mint.value.trim().replace(/^\$+/, '').toUpperCase();
    if (!/^[A-Z0-9]{1,11}$/.test(m)) throw new Error('Ticker can use letters and digits, up to 11 characters.');
    const amtStr = String(Math.round(amt * 1e4) / 1e4);
    return `${sideBtn.dataset.side} ${amtStr} SOL $${m}`;
  }

  // ---- render pieces ----
  function showCipher(armored, info) {
    cipherOut.textContent = armored.trim();
    cipherBytes.textContent = `${info.bytes} B · round ${fmtInt(info.round)}`;
    cipherWrap.hidden = false;
  }

  function buildRounds(total) {
    rounds.textContent = '';
    if (total <= 40) {
      for (let i = 0; i < total; i++) rounds.append(document.createElement('i'));
    } else {
      const t = document.createElement('i');
      t.className = 'rounds-text';
      rounds.append(t);
    }
  }

  function startCountdown(target, startRound) {
    cancelAnimationFrame(raf);
    const total = Math.max(1, target - startRound);
    buildRounds(total);
    const opensAt = roundTime(target);
    countSub.textContent = `round ${fmtInt(target)} · ${clock(opensAt)}`;
    countLabel.textContent = 'sealed · opens in';
    count.hidden = false;
    const loop = () => {
      const left = opensAt - Date.now();
      countBig.textContent = `T−${countdown(left)}`;
      const done = Math.min(total, Math.max(0, roundAt() - startRound));
      if (total <= 40) {
        [...rounds.children].forEach((el, i) => el.classList.toggle('done', i < done));
      } else {
        rounds.firstElementChild.textContent = `${fmtInt(total - done)} of ${fmtInt(total)} rounds left`;
      }
      if (left <= 0) {
        countLabel.textContent = 'round reached · fetching signature';
        countBig.textContent = 'T−00:00.0';
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  }

  async function waitAndOpen(j) {
    try {
      const beacon = await waitForBeacon(j.round, { signal: ctl.signal });
      if (job !== j) return;
      if (beacon.preview) {
        line('beacon', `#${fmtInt(j.round)} · relay blocked in preview · local echo`);
      } else {
        line('beacon', `#${fmtInt(j.round)} published · sig ${short(beacon.signature, 8, 6)}`);
      }
      const res = await open(j.armored);
      if (job !== j) return;
      if (!res.echo) line('verify', 'signature valid for the quicknet public key');
      line('✓ open', res.text, 'ok');
      j.openedText = res.text;
      cancelAnimationFrame(raf);
      count.hidden = true;
      revealText.textContent = res.text.slice(0, 140);
      revealMeta.textContent = j.incoming
        ? `Opened at round ${fmtInt(j.round)} · read early by: nobody`
        : `Sealed ${countdownWords(roundTime(j.round) - j.sealedAt)} before reveal · read early by: nobody`;
      reveal.hidden = false;
      block?.open(res.text);
      sniper.opened(res.text.slice(0, 80));
      $('#aCard').textContent = 'share card';
    } catch (e) {
      if (e.name === 'AbortError' || job !== j) return;
      line('✗ error', e.message, 'err');
      countLabel.textContent = 'could not open';
    }
  }

  const countdownWords = (d) => {
    const s = Math.round(d / 1000);
    if (s < 90) return `${s}s`;
    if (s < 5400) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  function reset() {
    ctl?.abort();
    cancelAnimationFrame(raf);
    sniper.stop();
    job = null;
    count.hidden = true;
    reveal.hidden = true;
    cipherWrap.hidden = true;
    actions.hidden = true;
    run.disabled = false;
  }

  // ---- seal ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (run.disabled) return;
    let text;
    try { text = readOrder(); } catch (err) { line('✗ input', err.message, 'err'); return; }
    reset();
    run.disabled = true;
    ctl = new AbortController();
    clear();
    const now = Date.now();
    const startRound = roundAt(now);
    let target = roundAt(now + ms);
    if (roundTime(target) < now + ms) target += 1;
    if (target <= startRound) target = startRound + 1;

    line('order', `${text}  (last moment it is readable)`);
    line('target', `round ${fmtInt(target)} · opens ${clock(roundTime(target))} (in ${((roundTime(target) - now) / 1000).toFixed(1)}s)`);
    const ibe = line('ibe', 'encrypting to the round identity on BLS12-381…');
    block?.seal();

    let armored;
    const t0 = performance.now();
    try {
      armored = await seal(text, target);
    } catch (err) {
      line('✗ error', err.message, 'err');
      run.disabled = false;
      return;
    }
    const took = Math.round(performance.now() - t0);
    ibe.textContent = `key wrapped to round ${fmtInt(target)} · ${took} ms`;
    const info = inspect(armored);
    const hash = await sha256Hex(armored);
    line('age', `${info.bytes} B · chacha20-poly1305 payload`);
    line('✓ seal', `sha256 ${short(hash, 8, 6)} · the key does not exist yet`, 'ok');

    job = { armored, round: target, sealedAt: now, lockedMs: roundTime(target) - now, link: linkFor(armored), hash };
    showCipher(armored, info);
    actions.hidden = false;
    run.disabled = false;
    startCountdown(target, startRound);
    sniper.attack({ round: target, bytes: info.bytes, hash });
    onSealed?.(job);
    waitAndOpen(job);
  });

  // ---- actions ----
  $('#aLink').addEventListener('click', (e) => job && copyText(job.link, e.currentTarget));
  $('#aCipher').addEventListener('click', (e) => job && copyText(job.armored.trim(), e.currentTarget));
  $('#aCard').addEventListener('click', () => job && showCard(job));
  $('#aAgain').addEventListener('click', () => { reset(); boot(); amount.focus(); });

  onTick((r) => {
    block?.tick(r);
    sniper.tick(r);
  });

  // ---- incoming sealed link ----
  function handleLink() {
    const h = location.hash.slice(1);
    if (!h.startsWith(LINK_PREFIX)) return false;
    let armored, info;
    try {
      armored = fromLinkToken(h.slice(LINK_PREFIX.length));
      info = inspect(armored);
      if (!info.quicknet) throw new Error('This seal targets a different drand network.');
    } catch (err) {
      clear();
      line('✗ link', err.message || 'This link does not contain a valid seal.', 'err');
      return true;
    }
    reset();
    ctl = new AbortController();
    clear();
    line('link', `sealed order received · ${info.bytes} B`);
    const t = roundTime(info.round);
    const past = t <= Date.now();
    line('target', `round ${fmtInt(info.round)} · ${past ? 'already open' : `opens ${clock(t)}`}`);
    line('state', past ? 'fetching the signature…' : 'nobody can read this until that round, including whoever sent it to you', 'ok');
    job = { armored, round: info.round, sealedAt: null, lockedMs: null, incoming: true, link: location.href, hash: '' };
    showCipher(armored, info);
    actions.hidden = false;
    if (!past) startCountdown(info.round, roundAt());
    sniper.attack({ round: info.round, bytes: info.bytes, hash: '0000000000000000' });
    if (PREVIEW) {
      line('✗ preview', 'This preview cannot reach drand, so it can only open seals made in this session.', 'err');
    } else {
      waitAndOpen(job);
    }
    requestAnimationFrame(() => document.getElementById('seal').scrollIntoView({ behavior: 'smooth' }));
    return true;
  }

  boot();
  handleLink();
  window.addEventListener('hashchange', handleLink);
}
