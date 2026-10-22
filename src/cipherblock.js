// The sealed block: a raymarched 3D object rendered entirely as base64 glyphs.
// Pass 1 raymarches the scene at one sample per character cell.
// Pass 2 draws every cell as a glyph from a font atlas, picked by brightness.
import { B64, reduceMotion } from './util.js';

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_SCENE = `#version 300 es
precision highp float;
uniform vec2 uCell;   // cell size, device px
uniform vec2 uView;   // view size, device px
uniform float uTime;
uniform vec2 uRot;    // yaw, pitch
uniform float uOpen;  // 0..1 split
uniform float uPacket;// 0..1 travel, 0 = hidden
uniform float uRed;   // seal flash
uniform float uPulse; // round heartbeat
uniform float uNotch; // 0..23
uniform float uDist;  // camera distance
out vec4 o;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }

// x: distance, y: material (1 block, 2 core, 3 ring, 4 live notch, 5 packet)
vec2 map(vec3 p) {
  mat3 R = rotX(uRot.y) * rotY(uRot.x);
  vec3 q = R * p;
  float s = 0.03 + uOpen * 0.36;
  vec3 b = vec3(0.56);
  vec3 qa = q + vec3(s, 0., 0.);
  vec3 qb = q - vec3(s, 0., 0.);
  float dA = max(sdRoundBox(qa, b, 0.075), qa.x);
  float dB = max(sdRoundBox(qb, b, 0.075), -qb.x);
  vec2 res = vec2(min(dA, dB), 1.);

  float dCore = length(q) - (0.2 + 0.02 * sin(uTime * 3.0));
  if (dCore < res.x) res = vec2(dCore, 2.);

  vec3 rp = rotX(1.12) * rotY(-uTime * 0.12) * p;
  float dr = sdTorus(rp, vec2(1.04, 0.036));
  float ang = atan(rp.z, rp.x);
  float seg = (ang / 6.2831853 + 0.5) * 24.;
  float idx = floor(seg);
  dr = max(dr, (abs(fract(seg) - 0.5) - 0.33) * 0.27);
  float k = mod(idx - uNotch, 24.);
  if (dr < res.x) res = vec2(dr, (k < 0.5 || k > 23.5) ? 4. : 3.);

  if (uPacket > 0.001 && uPacket < 0.999) {
    float e = uPacket * uPacket * (3. - 2. * uPacket);
    vec3 pp = p - vec3(mix(-2.6, 0., e), 0.22 * sin(uPacket * 3.14159), mix(0.4, 0., e));
    float dp = sdRoundBox(pp, vec3(0.075), 0.02);
    if (dp < res.x) res = vec2(dp, 5.);
  }
  return res;
}

vec3 normal(vec3 p) {
  const vec2 k = vec2(1., -1.);
  const float h = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * h).x + k.yyx * map(p + k.yyx * h).x +
                   k.yxy * map(p + k.yxy * h).x + k.xxx * map(p + k.xxx * h).x);
}

void main() {
  vec2 px = (gl_FragCoord.xy) * uCell;
  vec2 uv = (px - 0.5 * uView) / (0.5 * uView.y);
  vec3 ro = vec3(0., 0., uDist);
  vec3 rd = normalize(vec3(uv * 0.344, -1.));
  float t = 0.;
  vec2 h = vec2(1e9, 0.);
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    h = map(p);
    if (h.x < 0.0018) { hit = true; break; }
    t += h.x * 0.92;
    if (t > uDist + 4.) break;
  }
  if (!hit) { o = vec4(0.); return; }
  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  vec3 L = normalize(vec3(-0.55, 0.72, 0.62));
  float dif = max(dot(n, L), 0.);
  float rim = pow(1. - max(dot(n, -rd), 0.), 2.6);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 28.);
  float lum = 0.07 + 0.7 * dif + 0.34 * rim + 0.42 * spec;
  float m = h.y, red = 0., core = 0., kind = 1.;
  vec3 nl = rotX(uRot.y) * rotY(uRot.x) * n;
  float bevel = 1. - max(abs(nl.x), max(abs(nl.y), abs(nl.z)));
  if (m < 1.5) { lum = lum * (0.9 + uPulse * 0.22) + smoothstep(0.04, 0.22, bevel) * 0.6; red = uRed * (0.35 + 0.65 * dif); }
  else if (m < 2.5) { core = 1.; lum = 1.; }
  else if (m < 3.5) { lum = 0.4 + 0.4 * dif; kind = 0.6; }
  else if (m < 4.5) { lum = 1.; red = 1.; kind = 0.6; }
  else { lum = 1.; }
  o = vec4(clamp(lum, 0., 1.), kind, red, core);
}`;

const FS_GLYPH = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uCell;       // device px
uniform vec2 uGrid;       // cols, rows
uniform vec2 uAtlasGrid;  // atlas cols, rows
uniform int uRamp[64];
uniform int uRampLen;
uniform int uPlain[48];
uniform int uPlainLen;
uniform float uTime;
uniform vec2 uMouse;      // device px, bottom-left, x < 0 when absent
uniform float uField;
uniform vec3 uText;
uniform vec3 uDim;
uniform vec3 uRedC;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 cell = floor(fc / uCell);
  if (cell.x >= uGrid.x || cell.y >= uGrid.y) { o = vec4(0.); return; }
  vec2 inCell = fract(fc / uCell);
  vec4 s = texelFetch(uScene, ivec2(cell), 0);
  float h = hash(cell);
  float h2 = hash(cell + floor(uTime * (1.6 + h * 3.2) + h * 9.));
  int glyph;
  vec3 col;
  float a;
  if (s.g > 0.01) {
    float lum = s.r;
    if (s.a > 0.5 && uPlainLen > 0) {
      int k = int(mod(cell.x + cell.y * 5.0 + floor(uTime * 6.), float(uPlainLen)));
      glyph = uPlain[k];
      col = vec3(1.);
      a = 1.;
    } else {
      float fi = lum * float(uRampLen - 1);
      int idx = int(clamp(fi + (h2 - 0.5) * 2.4, 0., float(uRampLen - 1)));
      glyph = uRamp[idx];
      a = 0.22 + 0.78 * lum;
      col = mix(uDim, uText, smoothstep(0.12, 0.82, lum));
      col = mix(col, uRedC, clamp(s.b, 0., 1.));
      if (s.g < 0.9) a *= 0.8;
    }
  } else {
    float present = step(0.64, hash(cell * 1.37 + floor(uTime * 0.3 + h * 6.)));
    float d = uMouse.x < 0. ? 1e9 : length((cell + 0.5) * uCell - uMouse) / uCell.y;
    float probe = exp(-d * d / 70.);
    vec2 g = (cell + 0.5) / uGrid;
    float edge = min(min(g.x, 1. - g.x), min(g.y, 1. - g.y));
    float vig = smoothstep(0.0, 0.22, edge);
    a = (0.055 + probe * 0.42) * present * uField * vig;
    if (a < 0.004) { o = vec4(0.); return; }
    glyph = uRamp[int(h2 * float(uRampLen - 1))];
    col = mix(uDim, uText, probe * 0.7);
  }
  float gx = mod(float(glyph), uAtlasGrid.x);
  float gy = floor(float(glyph) / uAtlasGrid.x);
  vec2 auv = vec2((gx + inCell.x) / uAtlasGrid.x, (gy + 1. - inCell.y) / uAtlasGrid.y);
  float cov = texture(uAtlas, auv).r;
  float alpha = cov * a;
  o = vec4(col * alpha, alpha);
}`;

const ATLAS_COLS = 16;
const ATLAS_ROWS = 6; // printable ASCII 32..126

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const hexToRgb = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CipherBlock {
  constructor(canvas, { cell = [8, 14], field = 1, colors } = {}) {
    this.canvas = canvas;
    this.cellCss = cell;
    this.field = field;
    this.colors = colors || { text: '#e9ebee', dim: '#4a4f57', red: '#ff4530' };
    this.mouse = [-1, -1];
    this.target = [0, 0];
    this.par = [0, 0];
    this.notch = 0;
    this.pulse = 0;
    this.red = 0;
    this.packet = null;
    this.openAnim = null;
    this.openV = 0;
    this.plain = [];
    this.visible = true;
    this.t0 = performance.now();
    this.ok = false;
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return false;
    this.gl = gl;
    try {
      this.scene = program(gl, FS_SCENE);
      this.glyph = program(gl, FS_GLYPH);
    } catch (e) {
      console.warn('[opaque] shader', e);
      return false;
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sceneTex = gl.createTexture();
    this.fbo = gl.createFramebuffer();
    this.atlasTex = gl.createTexture();

    try { await document.fonts.load('500 24px "Martian Mono"'); } catch { /* fallback mono */ }
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(this.canvas);

    const host = this.canvas.parentElement;
    host.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      this.mouse = [x * this.dpr, (r.height - y) * this.dpr];
      this.target = [(x / r.width - 0.5) * 2, (y / r.height - 0.5) * 2];
    });
    host.addEventListener('pointerleave', () => { this.mouse = [-1, -1]; this.target = [0, 0]; });

    this.ok = true;
    this.still = reduceMotion();
    requestAnimationFrame((t) => this.frame(t));
    return true;
  }

  buildAtlas() {
    const [cw, ch] = this.cellPx;
    const c = document.createElement('canvas');
    c.width = cw * ATLAS_COLS;
    c.height = ch * ATLAS_ROWS;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const size = Math.round(ch * 0.74);
    x.font = `500 ${size}px "Martian Mono", ui-monospace, Menlo, monospace`;
    try { x.fontStretch = 'condensed'; } catch { /* older browsers */ }
    for (let i = 0; i < 95; i++) {
      const col = i % ATLAS_COLS;
      const row = Math.floor(i / ATLAS_COLS);
      x.fillText(String.fromCharCode(32 + i), col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
    // order the base64 alphabet by ink coverage -> brightness ramp
    const data = x.getImageData(0, 0, c.width, c.height).data;
    const cover = (i) => {
      const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
      let sum = 0;
      for (let yy = row * ch; yy < (row + 1) * ch; yy++) {
        for (let xx = col * cw; xx < (col + 1) * cw; xx++) sum += data[(yy * c.width + xx) * 4];
      }
      return sum;
    };
    const chars = (B64 + '.:').split('');
    const ramp = chars.map((ch2) => ({ i: ch2.charCodeAt(0) - 32, v: cover(ch2.charCodeAt(0) - 32) }))
      .sort((a, b) => a.v - b.v)
      .map((r) => r.i)
      .slice(0, 64);
    this.ramp = ramp;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize() {
    const gl = this.gl;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const narrow = r.width < 520;
    const cell = narrow ? [7, 12] : this.cellCss;
    this.cellPx = [Math.max(4, Math.round(cell[0] * dpr)), Math.max(6, Math.round(cell[1] * dpr))];
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.grid = [Math.ceil(w / this.cellPx[0]), Math.ceil(h / this.cellPx[1])];
    this.dist = narrow ? 3.9 : 3.55;

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.grid[0], this.grid[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.buildAtlas();
    if (this.still) this.draw(performance.now());
  }

  // --- choreography -------------------------------------------------------
  seal() {
    this.packet = { t0: performance.now(), dur: 900 };
  }

  open(text) {
    const codes = [...text.replace(/\s+/g, '')]
      .map((c) => c.charCodeAt(0) - 32)
      .filter((c) => c >= 1 && c < 95)
      .slice(0, 48);
    this.plain = codes;
    this.openAnim = { t0: performance.now() };
  }

  tick(round) {
    this.notch = round % 24;
    this.pulse = 1;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.visible || document.hidden) return;
    if (this.still && !this.packet && !this.openAnim) {
      if (now - (this.lastStill || 0) < 1000) return;
      this.lastStill = now;
    }
    this.draw(now);
  }

  draw(now) {
    const gl = this.gl;
    const t = (now - this.t0) / 1000;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;

    // parallax
    this.par[0] += (this.target[0] - this.par[0]) * Math.min(1, dt * 3);
    this.par[1] += (this.target[1] - this.par[1]) * Math.min(1, dt * 3);
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.red = Math.max(0, this.red - dt * 0.7);

    let packet = 0;
    if (this.packet) {
      const p = (now - this.packet.t0) / this.packet.dur;
      if (p >= 1) { this.packet = null; this.red = 1; this.pulse = 1; } else packet = Math.max(0.0011, p);
    }

    if (this.openAnim) {
      const e = (now - this.openAnim.t0) / 1000;
      if (e < 0.75) this.openV = easeOut(e / 0.75);
      else if (e < 3.4) this.openV = 1;
      else if (e < 4.4) this.openV = 1 - easeInOut((e - 3.4) / 1.0);
      else { this.openV = 0; this.openAnim = null; this.plain = []; }
    }

    // free spin; while opening, turn the seam to face the camera so the split reads
    const yawFree = 0.62 + (this.still ? 0.6 : t * 0.16) + this.par[0] * 0.28;
    if (this.openAnim && this.openAnim.snap == null) {
      this.openAnim.snap = Math.round((yawFree - 0.38) / Math.PI) * Math.PI + 0.38;
    }
    const blend = this.openAnim ? easeInOut(Math.min(1, this.openV * 1.15)) : 0;
    const yaw = blend > 0 ? yawFree + (this.openAnim.snap - yawFree) * blend : yawFree;
    const pitch = -0.46 + this.par[1] * 0.16 + Math.sin(t * 0.5) * 0.03;

    // pass 1: scene at cell resolution
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.grid[0], this.grid[1]);
    gl.disable(gl.BLEND);
    const S = this.scene;
    gl.useProgram(S.p);
    gl.uniform2f(S.u.uCell, this.cellPx[0], this.cellPx[1]);
    gl.uniform2f(S.u.uView, this.canvas.width, this.canvas.height);
    gl.uniform1f(S.u.uTime, t);
    gl.uniform2f(S.u.uRot, yaw, pitch);
    gl.uniform1f(S.u.uOpen, this.openV);
    gl.uniform1f(S.u.uPacket, packet);
    gl.uniform1f(S.u.uRed, this.red);
    gl.uniform1f(S.u.uPulse, this.pulse);
    gl.uniform1f(S.u.uNotch, this.notch);
    gl.uniform1f(S.u.uDist, this.dist);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: glyphs
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const G = this.glyph;
    gl.useProgram(G.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(G.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(G.u.uAtlas, 1);
    gl.uniform2f(G.u.uCell, this.cellPx[0], this.cellPx[1]);
    gl.uniform2f(G.u.uGrid, this.grid[0], this.grid[1]);
    gl.uniform2f(G.u.uAtlasGrid, ATLAS_COLS, ATLAS_ROWS);
    const ramp = new Int32Array(64);
    ramp.set(this.ramp);
    gl.uniform1iv(G.u.uRamp, ramp);
    gl.uniform1i(G.u.uRampLen, this.ramp.length);
    const plain = new Int32Array(48);
    plain.set(this.plain);
    gl.uniform1iv(G.u.uPlain, plain);
    gl.uniform1i(G.u.uPlainLen, this.plain.length);
    gl.uniform1f(G.u.uTime, this.still ? 0 : t);
    gl.uniform2f(G.u.uMouse, this.mouse[0], this.mouse[1]);
    gl.uniform1f(G.u.uField, this.field);
    gl.uniform3fv(G.u.uText, hexToRgb(this.colors.text));
    gl.uniform3fv(G.u.uDim, hexToRgb(this.colors.dim));
    gl.uniform3fv(G.u.uRedC, hexToRgb(this.colors.red));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
