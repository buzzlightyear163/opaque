// The sealed block in 3D: two halves of a cube covered in ciphertext, a red
// seam that glows while the order is sealed, and the plaintext on the inner
// faces once the round opens. Same object as the brand graphics.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { B64, reduceMotion } from './util.js';

const CELL = 1024 / 24;          // glyph cell width in texture px (24 columns per full face)
const CELL_H = CELL * 1.62;
const SEAM_RED = new THREE.Color(1, 0.27, 0.19);

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A face texture: a plate colour with a grid of glyphs carved into it.
function faceCanvas({ w = 1024, h = 1024, plate, ink, weight = 700, seed = 1, text = null }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = plate;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink;
  g.font = `${weight} ${Math.round(CELL_H * 0.66)}px "Martian Mono", ui-monospace, monospace`;
  try { g.fontStretch = 'condensed'; } catch { /* older engines */ }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const r = rand(seed);
  const cols = Math.round(w / CELL);
  const rows = Math.ceil(h / CELL_H);
  const chars = text ? text.replace(/\s+/g, '') : null;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const ch = chars ? chars[(i + j * 3) % chars.length] : B64[(r() * 64) | 0];
      g.fillText(ch, (i + 0.5) * (w / cols), (j + 0.5) * CELL_H + 2);
    }
  }
  return c;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class SealedCube {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = { zoom: 1, bloom: 1, idle: true, parallax: true, ...opts };
    // animated state (current values) and their targets
    this.s = { gap: 0.034, seam: 1, inner: 0, flash: 0, yaw: 0, pitch: 0 };
    this.t = { gap: 0.034, seam: 1, inner: 0 };
    this.mouse = [0, 0];
    this.par = [0, 0];
    this.packet = null;
    this.closeTimer = 0;
    this.visible = true;
    this.manual = false; // scroll-driven: state set from outside each frame
    this.ok = false;
  }

  async init() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return false;
    }
    try { await document.fonts.load('700 40px "Martian Mono"'); } catch { /* fallback mono */ }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    // scene.background is resolved per render target, so it survives the composer
    scene.background = new THREE.Color(this.opts.bg ?? 0x050506);
    this.scene = scene;
    const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
    this.cam = cam;

    // light from the upper left, like the graphics: top brightest, left mid, right dark
    // ratios match the graphics: top ~#f4f5f7, left ~#959ba4, right ~#40454d
    // (three.js lights are physical: intensity x PI matches a unit Lambert response)
    scene.add(new THREE.AmbientLight(0xffffff, 0.05 * Math.PI));
    const key = new THREE.DirectionalLight(0xffffff, 1.08 * Math.PI);
    key.position.set(0.15, 9.6, 2.9);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d2e0, 0.05 * Math.PI);
    fill.position.set(6, 1, 1);
    scene.add(fill);
    this.coreLight = new THREE.PointLight(0xffffff, 0, 3.2, 2);
    scene.add(this.coreLight);

    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tex = (cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    const plate = '#eceef1';
    const ink = '#9ca2aa';
    const full = (seed) => tex(faceCanvas({ plate, ink, seed }));
    const half = (seed) => tex(faceCanvas({ w: 512, plate, ink, seed }));
    this.innerTex = [];
    const innerMat = () => {
      const t = tex(faceCanvas({ plate: '#0c0d0f', ink: '#24272c', weight: 600, seed: 99 }));
      this.innerTex.push(t);
      return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
    };
    const mat = (map) => new THREE.MeshLambertMaterial({ map });

    // two halves, each 1 x 2 x 2. Box material order: +x, -x, +y, -y, +z, -z
    const geo = new THREE.BoxGeometry(1, 2, 2);
    this.innerMats = [innerMat(), innerMat()];
    const left = new THREE.Mesh(geo, [this.innerMats[0], mat(full(3)), mat(half(5)), mat(half(7)), mat(half(9)), mat(half(11))]);
    const right = new THREE.Mesh(geo, [mat(full(13)), this.innerMats[1], mat(half(15)), mat(half(17)), mat(half(19)), mat(half(21))]);
    this.halves = [left, right];

    // the seam: an emissive slab between the halves, pushed into HDR so only it blooms
    const seamMat = new THREE.MeshBasicMaterial({ color: SEAM_RED.clone(), toneMapped: false });
    this.seamMat = seamMat;
    this.seam = new THREE.Mesh(new THREE.BoxGeometry(1, 1.996, 1.996), seamMat);

    // incoming order packet
    this.packetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false }));
    this.packetMesh.visible = false;

    const group = new THREE.Group();
    group.add(left, right, this.seam, this.packetMesh);
    scene.add(group);
    this.group = group;

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75 * this.opts.bloom, 0.32, 1.0);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { rootMargin: '120px' });
    this.io.observe(this.canvas);

    if (this.opts.parallax) {
      const host = this.canvas.parentElement;
      host.addEventListener('pointermove', (e) => {
        const r = this.canvas.getBoundingClientRect();
        this.mouse = [((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2];
      });
      host.addEventListener('pointerleave', () => { this.mouse = [0, 0]; });
    }

    this.still = reduceMotion();
    this.clock = new THREE.Clock();
    this.ok = true;
    renderer.setAnimationLoop(() => this.frame());
    return true;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.cam.aspect = w / h;
    // fit the cube: narrower viewports pull the camera back
    const fit = Math.max(1, 0.95 / Math.min(1, w / h));
    const d = 13.2 * fit / this.opts.zoom;
    this.cam.position.set(d * 0.62, d * 0.5, d * 0.62);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();
  }

  // --- choreography --------------------------------------------------------
  seal() {
    clearTimeout(this.closeTimer);
    this.close();
    this.packet = { t0: performance.now(), dur: this.still ? 1 : 850 };
  }

  open(text, hold = 3600) {
    if (text) this.setPlain(text);
    this.t.gap = 0.46;
    this.t.seam = 0;
    this.t.inner = 1;
    clearTimeout(this.closeTimer);
    if (hold) this.closeTimer = setTimeout(() => this.close(), hold);
  }

  close() {
    this.t.gap = 0.034;
    this.t.seam = 1;
    this.t.inner = 0;
  }

  tick() { this.s.flash = Math.max(this.s.flash, 0.35); }

  setPlain(text) {
    if (text === this.plain) return;
    this.plain = text;
    const cv = faceCanvas({ plate: '#0c0d0f', ink: '#ffffff', weight: 700, text });
    for (const t of this.innerTex) {
      t.image = cv;
      t.needsUpdate = true;
    }
  }

  // scroll-driven: set the scene directly (values 0..1)
  set(values) {
    this.manual = true;
    Object.assign(this.t, values);
  }

  frame() {
    if (!this.visible || document.hidden) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    const s = this.s, t = this.t;
    const k = this.manual ? 14 : 5.5;
    s.gap = damp(s.gap, t.gap, k, dt);
    s.seam = damp(s.seam, t.seam, k * 1.4, dt);
    s.inner = damp(s.inner, t.inner, k, dt);
    s.flash = Math.max(0, s.flash - dt * 1.6);

    // packet flying into the seam
    if (this.packet) {
      const p = Math.min(1, (performance.now() - this.packet.t0) / this.packet.dur);
      const e = ease(p);
      this.packetMesh.visible = p < 1;
      this.packetMesh.position.set(-3.2 * (1 - e), 1.9 * (1 - e) + Math.sin(e * Math.PI) * 0.4, 2.4 * (1 - e));
      this.packetMesh.scale.setScalar(1 - e * 0.6);
      if (p >= 1) { this.packet = null; s.flash = 1; }
    }

    const half = s.gap / 2;
    this.halves[0].position.x = -0.5 - half;
    this.halves[1].position.x = 0.5 + half;
    // the glowing core stays hairline-thin and fades out as the halves part
    const seamW = Math.max(0.0001, Math.min(s.gap, 0.034) * 0.9 * Math.min(1, s.seam * 1.2));
    this.seam.scale.set(seamW, 1, 1);
    const glow = s.seam * (1 + s.flash * 1.8);
    this.seamMat.color.copy(SEAM_RED).multiplyScalar(Math.max(0.001, glow * 2.6));
    this.seam.visible = s.seam > 0.04;
    for (const m of this.innerMats) m.emissiveIntensity = s.inner * 1.3;
    this.coreLight.intensity = s.inner * 1.6;

    // idle drift + parallax, keeping the isometric read
    this.par[0] = damp(this.par[0], this.mouse[0], 3, dt);
    this.par[1] = damp(this.par[1], this.mouse[1], 3, dt);
    const idle = this.opts.idle && !this.still ? Math.sin(time * 0.35) * 0.16 : 0;
    const yaw = (this.manual ? (t.yaw || 0) : idle) + this.par[0] * 0.22;
    const pitch = (this.manual ? (t.pitch || 0) : Math.sin(time * 0.27) * 0.03) + this.par[1] * 0.08;
    this.group.rotation.set(pitch, yaw, 0);

    this.composer.render();
  }
}
