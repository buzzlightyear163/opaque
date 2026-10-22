# OPAQUE — orders encrypted to the future

Landing page and live demo for $OPAQUE. Orders are sealed in the browser with
real timelock encryption (tlock-js, drand quicknet) and open the moment the
target round's signature is published. Execution on pump.fun is simulated.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
```

## Deploy (Vercel)

Import the repo, framework preset **Vite**, build command `npm run build`,
output directory `dist`. No environment variables, no API keys.

## Before launch

Edit `src/config.js`:

- `ca` — the pump.fun contract address (the CA row stays hidden while empty)
- `pumpUrl` — the coin page on pump.fun
- `xUrl` — the project's X account

## What is real

- `src/seal.js` — `timelockEncrypt` / `timelockDecrypt` from tlock-js
- `src/drand.js` — quicknet chain info pinned locally; beacons fetched from
  api.drand.sh (with api2, api3 and drand.cloudflare.com as fallbacks) and
  verified against the quicknet public key
- Sealed links (`#seal.<ciphertext>`) carry the whole ciphertext in the URL
  fragment, so they work without a server

Any seal opens with drand's own CLI: `tle -d order.age`

## Files

| file | what |
| --- | --- |
| `src/main.js` | wiring: header beacon, hero loop, threat pane, protocol panel |
| `src/console.js` | the seal console |
| `src/cipherblock.js` | WebGL2 ASCII renderer for the hero block |
| `src/batch.js` | demo batch, really sealed and opened |
| `src/sniper.js` | the simulated adversary log |
| `src/card.js` | 16:9 share card (PNG) |
| `scripts/verify-tlock.mjs` | offline check: seal + open against a real quicknet signature |

`npm run build:preview` makes a single-file build for sandboxed previews where
drand cannot be reached; seals there open from a local echo and the page says so.
