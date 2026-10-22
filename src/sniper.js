// A dramatized adversary for the console's side panel. It is labeled as
// simulated in the UI; nothing here reads real network traffic.
import { clock, fmtInt, short } from './util.js';

const IDLE = [
  ['scan', 'order flow'],
  ['scan', 'new packets · all plaintext'],
  ['quote', 'slippage 15% on a 2 SOL buy · +0.41 SOL edge'],
  ['scan', 'priority fees rising'],
  ['bundle', 'front + back legs ready'],
  ['scan', 'waiting for a readable order'],
];

export class Sniper {
  constructor(el) {
    this.el = el;
    this.job = null;
    this.idleTimer = null;
    this.max = 34;
    this.push('boot', 'sniper.exe attached to order flow', 'w');
    this.idle();
  }

  push(tag, msg, cls = '') {
    const p = document.createElement('p');
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = clock(Date.now(), true).slice(6);
    const body = document.createElement('span');
    if (cls) body.className = cls;
    body.textContent = `${tag.padEnd(7)} ${msg}`;
    p.append(ts, body);
    this.el.append(p);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
  }

  idle() {
    clearTimeout(this.idleTimer);
    const next = () => {
      if (!this.job) {
        const [tag, msg] = IDLE[(Math.random() * IDLE.length) | 0];
        this.push(tag, msg);
      }
      this.idleTimer = setTimeout(next, 2200 + Math.random() * 2200);
    };
    this.idleTimer = setTimeout(next, 1600);
  }

  async attack({ round, bytes, hash }) {
    this.job = { round };
    const steps = [
      ['recv', `packet ${bytes} B · age-encryption.org/v1`, 'w'],
      ['parse', `stanza: tlock ${round} 52db9ba7…`],
      ['read', 'payload → ciphertext', 'x'],
      ['quote', 'side ? · amount ? · mint ? · slippage ?', 'x'],
      ['key', `needs drand signature for #${fmtInt(round)}`],
      ['key', 'not published · cannot be computed early', 'x'],
      ['brute', 'chacha20 key space 2^256 · skip', 'x'],
      ['hash', `sha256 ${short(hash, 6, 6)} · no signal`],
    ];
    for (const [tag, msg, cls] of steps) {
      if (!this.job) return;
      await new Promise((r) => setTimeout(r, 140 + Math.random() * 220));
      this.push(tag, msg, cls);
    }
  }

  tick(current) {
    if (!this.job) return;
    const left = this.job.round - current;
    if (left > 0) this.push('poll', `beacon #${fmtInt(this.job.round)} → not yet · ${left} round${left === 1 ? '' : 's'} left`);
  }

  opened(text) {
    if (!this.job) return;
    this.push('beacon', `#${fmtInt(this.job.round)} published`, 'w');
    this.push('read', `${text}`, 'w');
    this.push('front', 'readable by everyone at the same instant', 'x');
    this.push('front', 'no head start · sequence fixed before reveal (sim)', 'x');
    this.job = null;
  }

  stop() { this.job = null; }
}
