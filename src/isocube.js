// Small SVG version of the sealed block, for the batch queue and icons.
const PLATE = { top: '#f4f5f7', left: '#959ba4', right: '#40454d' };

export function isoCube({ open = false, size = 10 } = {}) {
  const S = size;
  const gap = open ? 0.34 : 0.05;
  const W = Math.ceil(2 * (1 + gap) * 0.866 * S * 2 + 8);
  const H = Math.ceil(4 * S + (1 + gap) * S + 10);
  const cx = W / 2, cy = H / 2 + 1;
  const P = (x, y, z) => `${(cx + (x - z) * 0.866 * S).toFixed(2)},${(cy + (x + z) * 0.5 * S - y * S).toFixed(2)}`;
  const inner = open ? '#ffffff' : '#ff4530';
  let out = '';
  [[-1 - gap, -gap], [gap, 1 + gap]].forEach(([x0, x1], h) => {
    const sideFill = h === 0 ? inner : PLATE.right;
    const cls = h === 0 ? ' class="core"' : '';
    out += `<polygon${cls} points="${P(x1, 1, 1)} ${P(x1, 1, -1)} ${P(x1, -1, -1)} ${P(x1, -1, 1)}" fill="${sideFill}"/>`;
    out += `<polygon points="${P(x0, 1, 1)} ${P(x1, 1, 1)} ${P(x1, -1, 1)} ${P(x0, -1, 1)}" fill="${PLATE.left}"/>`;
    out += `<polygon points="${P(x0, 1, -1)} ${P(x1, 1, -1)} ${P(x1, 1, 1)} ${P(x0, 1, 1)}" fill="${PLATE.top}"/>`;
  });
  if (!open) {
    out += `<polyline class="seam" points="${P(0, 1, -1)} ${P(0, 1, 1)} ${P(0, -1, 1)}" fill="none" stroke="#ff4530" stroke-width="${(S * 0.11).toFixed(2)}" stroke-linejoin="round"/>`;
  }
  return `<svg class="iso${open ? ' is-open' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${out}</svg>`;
}
