// Offline check: seals an order to a past quicknet round and opens it with
// that round's real, published signature (captured from api.drand.sh).
// A tampered signature must be rejected.
import tl from 'tlock-js';
const { timelockEncrypt, timelockDecrypt, defaultChainInfo, Buffer, roundAt } = tl;
const beacon = {"round":33265141,"randomness":"44e176a19a9e85275406ff51ebe2038d5d383d1f3fdeb69623ddba44e4c97b0b","signature":"a1cecd933b2b00f01c34f8849e428e4cdd8edf80065a73f416eb73367550a0663e2a4787ef9c07363555f781ed247344"};
const client = {
  options: { disableBeaconVerification: false, noCache: false, chainVerificationParams: { chainHash: defaultChainInfo.hash, publicKey: defaultChainInfo.public_key } },
  chain: () => ({ baseUrl: 'x', info: async () => defaultChainInfo }),
  latest: async () => beacon,
  get: async (r) => { if (r !== beacon.round) throw new Error('no beacon'); return beacon; },
};
console.log('now round', roundAt(Date.now(), defaultChainInfo));
const ct = await timelockEncrypt(beacon.round, Buffer.from('BUY 2.5 SOL $OPAQUE'), client);
console.log(ct); console.log('len', ct.length);
const pt = await timelockDecrypt(ct, client);
console.log('decrypted:', pt.toString());
// tamper test: wrong signature should fail
const bad = {...client, get: async () => ({...beacon, signature: beacon.signature.replace(/^a1/,'a2')})};
try { await timelockDecrypt(ct, bad); console.log('BAD: decrypted with wrong sig'); } catch(e) { console.log('wrong sig rejected:', e.message.slice(0,80)); }
