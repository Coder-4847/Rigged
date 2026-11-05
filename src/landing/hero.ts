import { THEMES } from '../levels/themes';

/**
 * Landing hero: a lightweight 2D-canvas loop (no Three.js, so the page loads fast) of the car driving
 * through the worlds with three parallax silhouette layers, dust and clouds. The palette cross-fades
 * from world to world.
 */
const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ground height in metres at world x: rolling hills with a couple of harmonics. */
const ground = (x: number): number => 1.4 * Math.sin(x * 0.055) + 0.9 * Math.sin(x * 0.121 + 1.3) + 0.35 * Math.sin(x * 0.37 + 0.4);

export function startHero(canvas: HTMLCanvasElement, reduced: boolean): { stop(): void } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { stop() {} };
  let W = 1;
  let H = 1;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(2, canvas.clientWidth);
    H = Math.max(2, canvas.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const dust: Array<{ x: number; y: number; vx: number; vy: number; life: number; r: number }> = [];
  let t = 0;
  let scroll = 0;
  let raf = 0;
  let last = 0;
  let running = true;
  let worldIdx = 0;
  let fade = 0; // 0..1 cross-fade toward the next world
  let phaseT = 0;

  const draw = (dt: number) => {
    t += dt;
    const speed = reduced ? 0 : 15; // m/s
    scroll += speed * dt;
    phaseT += dt;
    // palette cross-fade: hold 9 s, fade 2.5 s
    if (phaseT > 9) {
      fade = Math.min(1, (phaseT - 9) / 2.5);
      if (fade >= 1) {
        worldIdx = (worldIdx + 1) % 10;
        fade = 0;
        phaseT = 0;
      }
    }
    const A = THEMES[worldIdx + 1];
    const B = THEMES[((worldIdx + 1) % 10) + 1];
    const f = fade * fade * (3 - 2 * fade);
    const skyTop = mix(hex(A.skyTop), hex(B.skyTop), f);
    const skyBot = mix(hex(A.skyHorizon), hex(B.skyHorizon), f);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, skyTop);
    grd.addColorStop(0.7, skyBot);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    const ppm = H / 15; // pixels per metre
    const baseY = H * 0.74;
    const gy = (wx: number) => baseY - ground(wx) * ppm;

    // parallax silhouette layers (stepped blocks)
    const layers = [
      { sp: 0.1, h: 0.34, w: 150, k: 0 },
      { sp: 0.2, h: 0.27, w: 110, k: 1 },
      { sp: 0.36, h: 0.2, w: 80, k: 2 },
    ];
    for (const L of layers) {
      ctx.fillStyle = mix(hex(A.bg[L.k]), hex(B.bg[L.k]), f);
      const off = scroll * ppm * L.sp;
      const i0 = Math.floor(off / L.w);
      for (let i = i0 - 1; i < i0 + W / L.w + 2; i++) {
        const x = i * L.w - off;
        const hh = H * L.h * (0.45 + hash(i * 3 + L.k) * 0.65);
        // stepped pyramid
        for (let s = 0; s < 4; s++) {
          const ww = L.w * (1 - s / 4.4);
          ctx.fillRect(x + (L.w - ww) / 2, baseY - hh * (s + 1) / 4 - 40, ww, hh / 4 + 2);
        }
        ctx.fillRect(x, baseY - 40, L.w, H);
      }
    }
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 340 - scroll * ppm * 0.05 - t * 6) % (W + 400)) - 100;
      const x = cx < -200 ? cx + W + 400 : cx;
      const y = H * (0.1 + 0.18 * hash(i + 9));
      ctx.fillRect(x, y, 90 + 40 * hash(i), 18);
      ctx.fillRect(x + 18, y - 12, 60, 14);
    }

    // ground
    const top = mix(hex(A.top), hex(B.top), f);
    const dirt = mix(hex(A.dirt), hex(B.dirt), f);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) ctx.lineTo(px, gy(scroll + (px - W * 0.32) / ppm));
    ctx.lineTo(W + 8, H);
    ctx.closePath();
    ctx.fillStyle = dirt;
    ctx.fill();
    ctx.beginPath();
    for (let px = 0; px <= W + 8; px += 8) {
      const y = gy(scroll + (px - W * 0.32) / ppm);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = top;
    ctx.lineWidth = ppm * 0.7;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // roadside blocks (trees / rocks) from a hash so they scroll consistently
    for (let m = Math.floor(scroll - 14); m < scroll + W / ppm; m += 1) {
      const r = hash(m * 1.7);
      if (r < 0.9) continue;
      const wx = m + r * 3;
      const px = (wx - scroll) * ppm + W * 0.32;
      const y = gy(wx);
      ctx.fillStyle = hash(m) > 0.5 ? mix(hex(A.top), [0, 0, 0], 0.25) : 'rgba(150,155,165,1)';
      const s = ppm * (0.9 + hash(m + 3) * 0.9);
      ctx.fillRect(px - s * 0.45, y - s * 1.9, s * 0.9, s * 1.9);
      ctx.fillRect(px - s * 0.8, y - s * 2.6, s * 1.6, s * 1.1);
    }

    // car
    const carX = W * 0.32;
    const wr = ppm * 0.52;
    const rearX = scroll - 1.2;
    const frontX = scroll + 1.2;
    const bob = reduced ? 0 : Math.sin(t * 11) * 0.03;
    const yR = gy(rearX) - wr - bob * ppm;
    const yF = gy(frontX) - wr + bob * ppm;
    const ang = Math.atan2(yF - yR, 2.4 * ppm);
    const cx = carX;
    const cy = (yR + yF) / 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(cx, (gy(scroll) + 4), ppm * 2.1, ppm * 0.28, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const u = ppm; // 1 metre
    ctx.fillStyle = '#e8553a';
    rr(ctx, -1.75 * u, -0.32 * u, 3.5 * u, 0.78 * u, 0.14 * u);
    ctx.fillStyle = '#c9402a';
    ctx.fillRect(-1.7 * u, 0.2 * u, 3.4 * u, 0.26 * u);
    ctx.fillStyle = '#e8553a';
    ctx.beginPath();
    ctx.moveTo(-1.2 * u, -0.32 * u);
    ctx.lineTo(0.75 * u, -0.32 * u);
    ctx.lineTo(0.35 * u, -0.98 * u);
    ctx.lineTo(-1.1 * u, -0.98 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7cc4e8';
    ctx.beginPath();
    ctx.moveTo(-1.02 * u, -0.4 * u);
    ctx.lineTo(0.62 * u, -0.4 * u);
    ctx.lineTo(0.3 * u, -0.88 * u);
    ctx.lineTo(-0.98 * u, -0.88 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.fillRect(-0.4 * u, -0.82 * u, 0.32 * u, 0.3 * u);
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(-0.44 * u, -0.9 * u, 0.4 * u, 0.12 * u);
    ctx.fillStyle = '#232830';
    ctx.fillRect(-1.95 * u, -0.1 * u, 0.2 * u, 0.5 * u);
    ctx.fillRect(1.75 * u, -0.05 * u, 0.2 * u, 0.5 * u);
    ctx.fillStyle = '#fff2c4';
    ctx.fillRect(1.68 * u, -0.12 * u, 0.12 * u, 0.2 * u);
    ctx.fillStyle = '#ff2a1a';
    ctx.fillRect(-1.8 * u, -0.1 * u, 0.1 * u, 0.2 * u);
    ctx.fillStyle = '#232830';
    ctx.fillRect(-1.75 * u, -1.08 * u, 0.8 * u, 0.1 * u);
    ctx.restore();
    // wheels (drawn in world-space so they follow the ground, spokes spin)
    for (const [wx, wy] of [
      [carX - 1.2 * ppm, yR],
      [carX + 1.2 * ppm, yF],
    ] as const) {
      ctx.save();
      ctx.translate(wx, wy + wr * 0.3);
      ctx.rotate((scroll / 0.52) % (Math.PI * 2));
      ctx.fillStyle = '#1b1e23';
      ctx.beginPath();
      ctx.arc(0, 0, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dfe4e8';
      ctx.beginPath();
      ctx.arc(0, 0, wr * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#232830';
      for (let k = 0; k < 3; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.fillRect(-wr * 0.58, -wr * 0.07, wr * 1.16, wr * 0.14);
      }
      ctx.restore();
    }
    // dust behind the rear wheel
    if (!reduced && Math.random() < dt * 40) dust.push({ x: carX - 1.4 * ppm, y: yR + wr * 1.1, vx: -30 - Math.random() * 40, vy: -20 - Math.random() * 30, life: 0.6, r: 3 + Math.random() * 5 });
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.life -= dt;
      if (p.life <= 0) {
        dust.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      ctx.fillStyle = `rgba(230,220,190,${Math.min(0.7, p.life)})`;
      ctx.fillRect(p.x, p.y, p.r * p.life * 1.6, p.r * p.life * 1.6);
    }
  };

  const loop = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt);
  };
  last = performance.now();
  if (reduced) draw(0.016);
  else raf = requestAnimationFrame(loop);
  // pause when the tab is hidden
  const vis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (running && !reduced) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', vis);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
    },
  };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
