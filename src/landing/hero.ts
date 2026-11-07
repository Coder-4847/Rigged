import { THEMES } from '../levels/themes';

/**
 * Landing hero: a lightweight 2D-canvas loop (no Three.js, so the page loads fast) of the car driving
 * over floating toy islands and rope bridges, past low-poly mountains standing in the sea. The palette cross-fades
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
    const speed = reduced ? 0 : 18; // m/s
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
    const baseY = H * 0.7;
    const gy = (wx: number) => baseY - ground(wx) * ppm;
    const toPx = (wx: number) => (wx - scroll) * ppm + W * 0.32;
    const seaY = baseY + 2.9 * ppm;
    const period = 46;
    const isl = 34;
    /** Road height in px: the island surface, or a straight plank bridge between islands. */
    const road = (wx: number) => {
      const k = Math.floor(wx / period);
      const local = wx - k * period;
      if (local <= isl) return gy(wx);
      const u = (local - isl) / (period - isl);
      return gy(k * period + isl) * (1 - u) + gy((k + 1) * period) * u;
    };

    // low-poly mountains standing in the sea (lit face + shaded face), three parallax layers
    const layers = [
      { sp: 0.06, h: 0.5, w: 260, k: 0 },
      { sp: 0.14, h: 0.38, w: 190, k: 1 },
      { sp: 0.26, h: 0.26, w: 140, k: 2 },
    ];
    for (const L of layers) {
      const col = hex(A.bg[L.k]);
      const colB = hex(B.bg[L.k]);
      const lit = mix(col.map((c) => Math.min(255, c * 1.12)) as [number, number, number], colB.map((c) => Math.min(255, c * 1.12)) as [number, number, number], f);
      const dark = mix(col.map((c) => c * 0.8) as [number, number, number], colB.map((c) => c * 0.8) as [number, number, number], f);
      const off = scroll * ppm * L.sp;
      const i0 = Math.floor(off / L.w);
      for (let i = i0 - 2; i < i0 + W / L.w + 2; i++) {
        const x = i * L.w - off + hash(i * 7 + L.k) * L.w * 0.4;
        const hh = H * L.h * (0.55 + hash(i * 3 + L.k) * 0.6);
        const half = L.w * (0.55 + hash(i + L.k * 5) * 0.35);
        const peakX = x + half * (0.85 + hash(i * 11) * 0.3);
        const base = seaY + 6;
        ctx.fillStyle = lit;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.lineTo(peakX, base - hh);
        ctx.lineTo(peakX + half * 0.18, base);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(peakX - 1, base);
        ctx.lineTo(peakX, base - hh);
        ctx.lineTo(x + half * 2, base);
        ctx.closePath();
        ctx.fill();
      }
    }
    // clouds (puffy rounded)
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 340 - scroll * ppm * 0.04 - t * 6) % (W + 400)) - 100;
      const x = cx < -200 ? cx + W + 400 : cx;
      const y = H * (0.08 + 0.16 * hash(i + 9));
      const w = 90 + 50 * hash(i);
      rr(ctx, x, y, w, 26, 13);
      rr(ctx, x + w * 0.2, y - 16, w * 0.5, 30, 15);
    }

    // the sea, with drifting ripple dashes
    const sea = mix(hex(A.sea), hex(B.sea), f);
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, W, H - seaY);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const ry = seaY + 10 + hash(i * 5.3) * (H - seaY - 14);
      const depthK = (ry - seaY) / (H - seaY);
      const rx = ((hash(i * 2.1) * W * 1.4 - scroll * ppm * (0.3 + depthK * 0.9) - t * 12) % (W + 80) + W + 80) % (W + 80) - 40;
      const rw = 12 + depthK * 26;
      ctx.beginPath();
      ctx.moveTo(rx - rw / 2, ry);
      ctx.quadraticCurveTo(rx - rw / 4, ry - 4, rx, ry);
      ctx.quadraticCurveTo(rx + rw / 4, ry + 4, rx + rw / 2, ry);
      ctx.stroke();
    }

    // floating islands: brick front faces + thick grass tops, joined by little rope bridges
    const top = mix(hex(A.top), hex(B.top), f);
    const dirtC = hex(A.dirt);
    const dirtD = hex(B.dirt);
    const dirt = mix(dirtC, dirtD, f);
    const mortar = mix(dirtC.map((c) => c * 0.72) as [number, number, number], dirtD.map((c) => c * 0.72) as [number, number, number], f);
    const k0 = Math.floor((scroll - W * 0.32 / ppm) / period) - 1;
    for (let k = k0; k < k0 + W / ppm / period + 3; k++) {
      const x0 = k * period;
      const x1 = x0 + isl;
      // island body
      ctx.beginPath();
      ctx.moveTo(toPx(x0), seaY + 4);
      for (let wx = x0; wx <= x1; wx += 0.5) ctx.lineTo(toPx(wx), gy(wx));
      ctx.lineTo(toPx(x1), seaY + 4);
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = dirt;
      ctx.fill();
      ctx.clip();
      // bricks
      ctx.fillStyle = mortar;
      const bh = 0.8 * ppm;
      for (let row = 0; row < 8; row++) {
        const y = baseY - 2.2 * ppm + row * bh;
        ctx.fillRect(toPx(x0) - 2, y, isl * ppm + 4, 3);
        for (let bx = x0 + (row % 2) * 0.8; bx < x1; bx += 1.6) ctx.fillRect(toPx(bx), y, 3, bh);
      }
      ctx.restore();
      // foam where it meets the sea
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      rr(ctx, toPx(x0) - 6, seaY - 2, isl * ppm + 12, 6, 3);
      // grass slab
      ctx.beginPath();
      for (let wx = x0 - 0.15; wx <= x1 + 0.15; wx += 0.5) {
        const px = toPx(wx);
        const y = gy(Math.min(x1, Math.max(x0, wx)));
        if (wx === x0 - 0.15) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      for (let wx = x1 + 0.15; wx >= x0 - 0.15; wx -= 0.5) ctx.lineTo(toPx(wx), gy(Math.min(x1, Math.max(x0, wx))) + 0.75 * ppm);
      ctx.closePath();
      ctx.fillStyle = top;
      ctx.fill();
      // bridge to the next island
      const bx0 = x1;
      const bx1 = x0 + period;
      const y0 = gy(bx0);
      const y1 = gy(bx1);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const px = toPx(bx0 + (bx1 - bx0) * u0) + 2;
        const py = y0 + (y1 - y0) * u0;
        ctx.fillStyle = '#c98a4b';
        ctx.fillRect(px, py - 2, ((bx1 - bx0) * ppm) / n - 4, 0.38 * ppm);
      }
      ctx.strokeStyle = '#f0deb4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(toPx(bx0), y0 - 0.9 * ppm);
      ctx.quadraticCurveTo(toPx((bx0 + bx1) / 2), (y0 + y1) / 2 - 0.5 * ppm, toPx(bx1), y1 - 0.9 * ppm);
      ctx.stroke();
      ctx.fillStyle = '#d98b6a';
      for (const [px, py] of [[toPx(bx0), y0], [toPx(bx1), y1]]) ctx.fillRect(px - 0.3 * ppm, py - 1.2 * ppm, 0.6 * ppm, 1.3 * ppm);
    }

    // roadside trees / rocks (blocky, two-tone) from a hash so they scroll consistently
    for (let m = Math.floor(scroll - 14); m < scroll + W / ppm; m += 1) {
      const r = hash(m * 1.7);
      if (r < 0.88) continue;
      const wx = m + r * 3;
      const local = ((wx % period) + period) % period;
      if (local < 1.5 || local > isl - 1.5) continue;
      const px = toPx(wx);
      const y = gy(wx) + 2;
      const s = ppm * (0.9 + hash(m + 3) * 0.9);
      if (hash(m) > 0.35) {
        ctx.fillStyle = '#7a5232';
        ctx.fillRect(px - s * 0.14, y - s * 1.4, s * 0.28, s * 1.4);
        ctx.fillStyle = mix(hex(A.top), [0, 0, 0], 0.18);
        rr(ctx, px - s * 0.8, y - s * 2.5, s * 1.6, s * 1.2, s * 0.25);
        ctx.fillStyle = mix(hex(A.top), [255, 255, 255], 0.08);
        rr(ctx, px - s * 0.55, y - s * 3.2, s * 1.1, s * 0.9, s * 0.22);
      } else {
        ctx.fillStyle = '#a3a9b2';
        rr(ctx, px - s * 0.6, y - s * 0.8, s * 1.2, s * 0.8, s * 0.2);
      }
    }

    // car
    const carX = W * 0.32;
    const wr = ppm * 0.66;
    const rearX = scroll - 1.2;
    const frontX = scroll + 1.2;
    const bob = reduced ? 0 : Math.sin(t * 11) * 0.03;
    const yR = road(rearX) - wr - bob * ppm;
    const yF = road(frontX) - wr + bob * ppm;
    const ang = Math.atan2(yF - yR, 2.4 * ppm);
    const cx = carX;
    const cy = (yR + yF) / 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(cx, (road(scroll) + 4), ppm * 2.1, ppm * 0.28, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const u = ppm; // 1 metre
    ctx.fillStyle = '#ffc21a';
    rr(ctx, -1.75 * u, -0.42 * u, 3.5 * u, 0.82 * u, 0.16 * u);
    ctx.fillStyle = '#e0a000';
    ctx.fillRect(-1.7 * u, 0.16 * u, 3.4 * u, 0.22 * u);
    ctx.fillStyle = '#ffc21a';
    rr(ctx, -1.15 * u, -1.18 * u, 1.95 * u, 0.86 * u, 0.12 * u);
    ctx.fillStyle = '#f6f4ee';
    rr(ctx, -1.2 * u, -1.32 * u, 2.05 * u, 0.2 * u, 0.08 * u);
    ctx.fillStyle = '#7cc4e8';
    rr(ctx, -1.0 * u, -1.06 * u, 0.75 * u, 0.56 * u, 0.06 * u);
    rr(ctx, -0.12 * u, -1.06 * u, 0.8 * u, 0.56 * u, 0.06 * u);
    ctx.fillStyle = '#f2c9a0';
    ctx.fillRect(-0.55 * u, -0.98 * u, 0.3 * u, 0.3 * u);
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(-0.58 * u, -1.04 * u, 0.36 * u, 0.1 * u);
    ctx.fillStyle = '#232830';
    ctx.fillRect(-1.95 * u, -0.1 * u, 0.22 * u, 0.42 * u);
    ctx.fillRect(1.73 * u, -0.1 * u, 0.22 * u, 0.42 * u);
    ctx.fillStyle = '#fff2c4';
    ctx.fillRect(1.66 * u, -0.3 * u, 0.12 * u, 0.2 * u);
    ctx.fillStyle = '#ff2a1a';
    ctx.fillRect(-1.8 * u, -0.3 * u, 0.1 * u, 0.2 * u);
    ctx.restore();
    // wheels (drawn in world-space so they follow the ground, treads spin)
    for (const [wx, wy] of [
      [carX - 1.2 * ppm, yR],
      [carX + 1.2 * ppm, yF],
    ] as const) {
      ctx.save();
      ctx.translate(wx, wy + wr * 0.3);
      ctx.rotate((scroll / 0.62) % (Math.PI * 2));
      ctx.fillStyle = '#24272d';
      for (let k = 0; k < 12; k++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(-wr * 0.2, -wr * 1.08, wr * 0.4, wr * 0.3);
      }
      ctx.beginPath();
      ctx.arc(0, 0, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a5058';
      ctx.beginPath();
      ctx.arc(0, 0, wr * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffc21a';
      ctx.beginPath();
      ctx.arc(0, 0, wr * 0.16, 0, Math.PI * 2);
      ctx.fill();
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
