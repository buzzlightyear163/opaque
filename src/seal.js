import { timelockEncrypt, timelockDecrypt, Buffer } from 'tlock-js';
import { client, INFO } from './drand.js';
import { PREVIEW } from './config.js';

const HEADER = '-----BEGIN AGE ENCRYPTED FILE-----';
const FOOTER = '-----END AGE ENCRYPTED FILE-----';

// Plaintext kept in memory only for the preview build, which cannot reach drand.
const echo = new Map();

export async function seal(text, round) {
  const armored = await timelockEncrypt(round, Buffer.from(text, 'utf8'), client);
  if (PREVIEW) echo.set(armored, text);
  return armored;
}

export async function open(armored) {
  if (PREVIEW) {
    if (!echo.has(armored)) {
      throw Object.assign(new Error('This preview cannot reach drand, so it can only open seals made in this session.'), { preview: true });
    }
    return { text: echo.get(armored), echo: true };
  }
  // tlock refuses to open before the round's time on the local clock.
  // If this machine's clock runs a little slow, wait it out.
  for (let i = 0; i < 50; i++) {
    try {
      const buf = await timelockDecrypt(armored, client);
      return { text: new TextDecoder().decode(buf), echo: false };
    } catch (e) {
      if (/too early/i.test(e.message)) { await new Promise((r) => setTimeout(r, 300)); continue; }
      throw e;
    }
  }
  throw new Error('Timed out waiting for the round to open.');
}

const b64Body = (armored) =>
  armored.trim().replace(HEADER, '').replace(FOOTER, '').replace(/\s+/g, '');

export function inspect(armored) {
  const bin = atob(b64Body(armored));
  const m = bin.match(/-> tlock (\d+) ([0-9a-f]{64})/);
  if (!m) throw new Error('Not a tlock ciphertext.');
  return { round: Number(m[1]), chainHash: m[2], bytes: bin.length, quicknet: m[2] === INFO.hash };
}

export function toLinkToken(armored) {
  return b64Body(armored).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromLinkToken(token) {
  let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const lines = b64.match(/.{1,64}/g) || [];
  return `${HEADER}\n${lines.join('\n')}\n${FOOTER}\n`;
}

export const LINK_PREFIX = 'seal.';

export function linkFor(armored) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#${LINK_PREFIX}${toLinkToken(armored)}`;
}
