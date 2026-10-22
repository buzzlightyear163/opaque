// Pinned /protocol scene: scrolling takes the block through Lock, Wait and Open.
import { SealedCube } from './cube3d.js';
import { roundAt, onTick } from './drand.js';
import { $, $$, fmtInt } from './util.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export async function initScene() {
  const track = $('#sceneTrack');
  const canvas = $('#protoCube');
  if (!track || !canvas) return;
  const steps = $$('#ssteps li');
  const bar = $('#sbar');
  const hud = { payload: $('#sPayload'), round: $('#sRound'), key: $('#sKey'), who: $('#sWho') };

  const cube = new SealedCube(canvas, { zoom: 1.02, idle: false, parallax: false });
  const ok = await cube.init();
  if (!ok) { canvas.hidden = true; return; }
  cube.setPlain('BUY 2.5 SOL $OPAQUE');

  // the scene's own round: N is a few rounds ahead of now, fixed per visit
  const N = roundAt() + 3;
  let last = -1;
  let inView = false;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { rootMargin: '200px 0px' }).observe(track);

  const update = () => {
    const r = track.getBoundingClientRect();
    const span = Math.max(1, track.offsetHeight - window.innerHeight);
    const p = clamp(-r.top / span);
    const close = smooth(0.06, 0.3, p);
    const open = smooth(0.7, 0.9, p);
    const sealed = close * (1 - open);
    cube.set({
      gap: 0.034 + (0.5 - 0.034) * (1 - sealed),
      seam: sealed,
      inner: 1 - sealed,
      yaw: -0.42 + p * 0.84,
      pitch: 0,
    });
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
    const step = p < 0.36 ? 0 : p < 0.68 ? 1 : 2;
    if (step !== last) {
      last = step;
      steps.forEach((li, i) => li.classList.toggle('is-on', i === step));
      hud.round.textContent = fmtInt(N);
      if (step === 0) { hud.payload.textContent = 'BUY 2.5 SOL $OPAQUE'; hud.key.textContent = 'not needed to seal'; hud.who.textContent = 'you, until it closes'; }
      if (step === 1) { hud.payload.textContent = 'age · 378 B ciphertext'; hud.key.innerHTML = '<span class="is-red">does not exist yet</span>'; hud.who.textContent = 'nobody'; }
      if (step === 2) { hud.payload.textContent = 'BUY 2.5 SOL $OPAQUE'; hud.key.textContent = `drand signature #${fmtInt(N)}`; hud.who.textContent = 'everyone, at once'; }
    }
  };

  const loop = () => {
    if (inView) update();
    requestAnimationFrame(loop);
  };
  update();
  loop();
  onTick(() => { if (inView && last === 1) cube.tick(); });
}
