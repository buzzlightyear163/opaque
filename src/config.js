// Everything you need to edit before launch lives here.
export const CONFIG = {
  ticker: '$OPAQUE',
  // Paste the pump.fun contract address once the coin is live.
  // While it is empty, the CA row is hidden.
  ca: '5LLVtPjVrErVNQ7JZ94oS7nKCoWBTBfkMLx6B6CUpump',
  // Link to the coin page on pump.fun once it exists.
  pumpUrl: 'https://pump.fun/coin/5LLVtPjVrErVNQ7JZ94oS7nKCoWBTBfkMLx6B6CUpump',
  // Project X account.
  xUrl: 'https://x.com/Opaqueorders',
};

// True only in the single-file preview build (vite --mode artifact).
// The preview runs inside a sandbox that blocks requests to drand,
// so seals made in that session open from a local echo instead.
export const PREVIEW = import.meta.env.MODE === 'artifact';
