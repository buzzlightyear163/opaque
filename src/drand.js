// drand quicknet: a public randomness beacon run by a threshold of independent
// operators. Round N's BLS signature is published every 3 seconds and is the
// key that opens anything sealed to round N.
import { defaultChainInfo } from 'tlock-js';
import { PREVIEW } from './config.js';

export const INFO = defaultChainInfo; // quicknet, bls-unchained-g1-rfc9380
export const PERIOD_MS = INFO.period * 1000;
const GENESIS_MS = INFO.genesis_time * 1000;

export const roundAt = (ms = Date.now()) => Math.floor((ms - GENESIS_MS) / PERIOD_MS) + 1;
export const roundTime = (round) => GENESIS_MS + (round - 1) * PERIOD_MS;

const RELAYS = [
  'https://api.drand.sh',
  'https://api2.drand.sh',
  'https://api3.drand.sh',
  'https://drand.cloudflare.com',
].map((host) => `${host}/${INFO.hash}`);

let relayIdx = 0;
const cache = new Map();
let latest = null;
let fails = 0;
let lastFetch = { ms: 0, path: '', status: 0 };

const beaconSubs = new Set();
const statusSubs = new Set();
const tickSubs = new Set();

export const net = {
  status: PREVIEW ? 'preview' : 'connecting', // connecting | live | unreachable | preview
  get latest() { return latest; },
  get lastFetch() { return lastFetch; },
  get relay() { return RELAYS[relayIdx]; },
};

function setStatus(s) {
  if (net.status === s) return;
  net.status = s;
  statusSubs.forEach((fn) => fn(s));
}

export function onBeacon(fn) { beaconSubs.add(fn); if (latest) fn(latest); return () => beaconSubs.delete(fn); }
export function onStatus(fn) { statusSubs.add(fn); fn(net.status); return () => statusSubs.delete(fn); }
// Fires on every round boundary from the local clock (visual heartbeat only).
export function onTick(fn) { tickSubs.add(fn); return () => tickSubs.delete(fn); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(path) {
  let lastErr;
  for (let i = 0; i < RELAYS.length; i++) {
    const idx = (relayIdx + i) % RELAYS.length;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const t0 = performance.now();
    try {
      const res = await fetch(`${RELAYS[idx]}${path}`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      lastFetch = { ms: Math.round(performance.now() - t0), path, status: res.status };
      if (res.status === 404 || res.status === 425) {
        const e = new Error(`round not published yet (${res.status})`);
        e.notYet = true;
        throw e;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      relayIdx = idx;
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.notYet) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('drand relays unreachable');
}

function keep(b) {
  const beacon = { round: b.round, randomness: b.randomness, signature: b.signature };
  cache.set(beacon.round, beacon);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  if (!latest || beacon.round > latest.round) {
    latest = beacon;
    beaconSubs.forEach((fn) => fn(beacon));
  }
  return beacon;
}

export async function fetchLatest() {
  if (PREVIEW) throw Object.assign(new Error('drand relays are blocked in the preview'), { preview: true });
  try {
    const b = keep(await getJSON('/public/latest'));
    fails = 0;
    setStatus('live');
    return b;
  } catch (e) {
    if (++fails >= 2) setStatus('unreachable');
    throw e;
  }
}

export async function getBeacon(round) {
  if (cache.has(round)) return cache.get(round);
  if (PREVIEW) throw Object.assign(new Error('drand relays are blocked in the preview'), { preview: true });
  const b = keep(await getJSON(`/public/${round}`));
  return b;
}

// Resolves once round N's signature has been published and fetched.
export function waitForBeacon(round, { signal } = {}) {
  if (PREVIEW) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ round, preview: true }), Math.max(0, roundTime(round) - Date.now() + 120));
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
    });
  }
  return new Promise((resolve, reject) => {
    let done = false;
    let busy = false;
    const finish = (b) => { if (done) return; done = true; off(); clearInterval(iv); resolve(b); };
    const check = async () => {
      if (done || busy) return;
      if (cache.has(round)) return finish(cache.get(round));
      if (Date.now() < roundTime(round) - 200 && !(latest && latest.round >= round)) return;
      busy = true;
      try { finish(await getBeacon(round)); } catch { /* not yet, or relay hiccup: next check */ }
      busy = false;
    };
    const off = onBeacon(check);
    const iv = setInterval(check, 700);
    signal?.addEventListener('abort', () => { done = true; off(); clearInterval(iv); reject(new DOMException('aborted', 'AbortError')); });
    check();
  });
}

// The ChainClient shape tlock-js expects. Chain info is pinned locally, so
// sealing needs no network at all; opening asks a relay for one signature,
// which drand-client verifies against the quicknet public key.
export const client = {
  options: {
    disableBeaconVerification: false,
    noCache: false,
    chainVerificationParams: { chainHash: INFO.hash, publicKey: INFO.public_key },
  },
  chain: () => ({ baseUrl: RELAYS[relayIdx], info: async () => INFO }),
  latest: () => fetchLatest(),
  get: (round) => getBeacon(round),
};

// --- heartbeat + poller ---------------------------------------------------
let pollTimer = null;
let tickTimer = null;

function scheduleTick() {
  clearTimeout(tickTimer);
  const next = roundAt() + 1;
  tickTimer = setTimeout(() => {
    tickSubs.forEach((fn) => fn(next));
    scheduleTick();
  }, Math.max(20, roundTime(next) - Date.now()));
}

async function pollFor(target) {
  for (let i = 0; i < 6; i++) {
    try {
      const b = await fetchLatest();
      if (b.round >= target) return;
    } catch { /* counted in fetchLatest */ }
    await sleep(350 + i * 300);
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (PREVIEW || document.hidden) return;
  const next = roundAt() + 1;
  pollTimer = setTimeout(async () => {
    await pollFor(next);
    schedulePoll();
  }, Math.max(40, roundTime(next) - Date.now() + 220));
}

export function startNetwork() {
  scheduleTick();
  if (PREVIEW) return;
  fetchLatest().catch(() => {});
  schedulePoll();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(pollTimer); return; }
    fetchLatest().catch(() => {});
    schedulePoll();
    scheduleTick();
  });
}
