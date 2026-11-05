import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Behavior } from '../../entities/hazards/core';
import { BouncePad, Cannon, Conveyor, OneWay, TransformPad, Zone } from '../../entities/hazards/zones';
import { Crusher, Door, Gear, MovingPlatform, Saw, Spikes, Swing, Tilt } from '../../entities/hazards/movers';
import { Laser, Mirror, Switch } from '../../entities/hazards/beams';
import { Boulder, Bridge, CrateBody, CrumbleBlock, Dominoes, Falling, Tnt } from '../../entities/hazards/breakables';
import type { Tracked } from '../../physics/PhysicsWorld';
import { Geyser, Lava } from '../../entities/hazards/lava';
import { bounceView, cannonView, conveyorView, onewayView, transformView, ViewCtx, zoneView } from './ZoneViews';
import { HazardView, box, glow, line, std, stripedBox } from './hz';

const LANE = CONFIG.render.laneDepth;
const tmp = { x: 0, y: 0, a: 0 };

function follow(t: Tracked, o: THREE.Object3D, alpha: number): void {
  t.at(alpha, tmp);
  o.position.set(tmp.x, tmp.y, o.position.z);
  o.rotation.z = tmp.a;
}

const METAL = () => std(0x6c7580, { metal: 0.5, rough: 0.45 });
const DARK = () => std(0x2b3139, { metal: 0.4 });

function platformView(p: MovingPlatform, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const slab = box(p.d.w, p.h, 3.4, METAL(), 0.08);
  const top = box(p.d.w - 0.3, 0.1, 3.0, std(v.pal.accent, { emissive: v.pal.accent, ei: 0.25 }), 0.03);
  top.position.y = p.h / 2 + 0.03;
  slab.add(top);
  g.add(slab);
  // rail showing where it travels
  g.add(line(new THREE.Vector3(p.d.x, p.d.y, -1.4), new THREE.Vector3(p.d.x2, p.d.y2, -1.4), 0x9aa4b0, 0.45));
  return { object: g, update: (a) => follow(p.tracked, slab, a) };
}

function gearView(gr: Gear): HazardView {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const r = gr.d.r;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3.2, 28).rotateX(Math.PI / 2), std(0x6c7580, { metal: 0.5, rough: 0.45, vc: false }));
  disc.castShadow = disc.receiveShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 3.5, 14).rotateX(Math.PI / 2), std(0xc7ced6, { metal: 0.7, vc: false }));
  body.add(disc, hub);
  const tw = ((Math.PI * r) / gr.teeth) * 1.1;
  for (let i = 0; i < gr.teeth; i++) {
    const a = (i / gr.teeth) * Math.PI * 2;
    const t = box(0.28, tw, 3.2, METAL(), 0.05);
    t.position.set(Math.cos(a) * (r + 0.08), Math.sin(a) * (r + 0.08), 0);
    t.rotation.z = a;
    body.add(t);
  }
  // spokes
  for (let i = 0; i < 3; i++) {
    const s = box(r * 1.4, 0.3, 3.3, DARK(), 0.05);
    s.rotation.z = (i * Math.PI) / 3;
    body.add(s);
  }
  g.add(body);
  return { object: g, update: (a) => follow(gr.tracked, body, a) };
}

function swingView(s: Swing, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = s.d;
  const mount = box(1.4, 0.6, 1.4, DARK(), 0.1);
  mount.position.set(d.x, d.y + 0.2, 0);
  g.add(mount);
  const links: THREE.Mesh[] = [];
  const n = Math.max(3, Math.round(d.len / 0.8));
  for (let i = 0; i < n; i++) {
    const l = box(0.2, 0.62, 0.2, std(0x9aa4b0, { metal: 0.6 }), 0.05);
    links.push(l);
    g.add(l);
  }
  const ball = (d.kind ?? 'ball') === 'ball';
  const end = new THREE.Group();
  if (ball) {
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), std(0x2b2f36, { metal: 0.6, vc: false }));
    sphere.castShadow = true;
    end.add(sphere);
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), std(v.pal.hazard, { emissive: v.pal.hazard, ei: 0.8, vc: false }));
      const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - (2 * (i + 0.5)) / 10), i * 2.4);
      sp.position.copy(dir.clone().multiplyScalar(1.3));
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      end.add(sp);
    }
  } else {
    end.add(box(4.4, 0.4, 3.2, METAL(), 0.08));
    const top = box(4.0, 0.08, 2.9, std(v.pal.accent, { emissive: v.pal.accent, ei: 0.25 }), 0.02);
    top.position.y = 0.22;
    end.add(top);
  }
  g.add(end);
  const dir = new THREE.Vector3();
  return {
    object: g,
    update: (a) => {
      follow(s.tracked, end, a);
      dir.set(end.position.x - d.x, end.position.y - d.y, 0);
      links.forEach((l, i) => {
        const k = (i + 0.5) / n;
        l.position.set(d.x + dir.x * k, d.y + dir.y * k, 0);
        l.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2 + (i % 2 ? 0 : 0);
      });
    },
  };
}

function tiltView(t: Tilt): HazardView {
  const g = new THREE.Group();
  const slab = box(t.d.w, 0.44, 3.4, METAL(), 0.08);
  const post = box(0.8, 3, 0.8, DARK(), 0.1);
  post.position.set(t.d.x, t.d.y - 1.7, -0.3);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.6, 12).rotateX(Math.PI / 2), std(0xc7ced6, { metal: 0.7, vc: false }));
  knob.position.set(t.d.x, t.d.y, 0);
  g.add(slab, post, knob);
  return { object: g, update: (a) => follow(t.tracked, slab, a) };
}

function doorView(d: Door, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const slab = stripedBox(d.w, d.d.h, 3.2, v.pal.hazard, 1);
  g.add(slab);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
  lamp.position.set(d.d.x, d.d.y + d.d.h + 0.9, 1.6);
  g.add(lamp);
  const frame = box(d.w + 0.5, 0.5, 3.6, DARK(), 0.08);
  frame.position.set(d.d.x, d.d.y + d.d.h + 0.35, 0);
  g.add(frame);
  return {
    object: g,
    update: (a, t) => {
      follow(d.tracked, slab, a);
      (lamp.material as THREE.MeshBasicMaterial).color.setHex(d.amt > 0.9 ? 0x4cd964 : d.warn && Math.floor(t * 12) % 2 ? 0xffffff : v.pal.hazard);
    },
  };
}

function crusherView(c: Crusher, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const horizontal = c.dir.y === 0;
  const w = c.width;
  const root = new THREE.Group();
  root.position.set(c.d.x, c.d.y, 0);
  root.rotation.z = Math.atan2(c.dir.y, c.dir.x) + Math.PI / 2; // local -y points along dir
  const housing = box(w + 0.9, 1.4, 3.4, DARK(), 0.12);
  housing.position.y = 0.7;
  const shaft = box(0.55, 1, 0.55, std(0xb7bfc8, { metal: 0.7 }), 0.05);
  const head = new THREE.Group();
  head.add(stripedBox(w, c.headHalf * 2, 3.1, v.pal.hazard, 1));
  for (let i = 0; i < Math.round(w / 0.8); i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), std(0xdfe4e8, { metal: 0.7, vc: false }));
    sp.rotation.x = Math.PI;
    sp.position.set(-w / 2 + 0.4 + i * 0.8, -c.headHalf - 0.2, 0.9);
    head.add(sp);
    const sp2 = sp.clone();
    sp2.position.z = -0.9;
    head.add(sp2);
  }
  // warning lamp (glow + shape: a triangle sign) on the housing
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x552200 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), lampMat);
  lamp.position.set(w / 2 + 0.1, 0.7, 1.75);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), glow(v.pal.hazard, 0));
  halo.position.copy(lamp.position);
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 3), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
  tri.position.set(-w / 2 - 0.1, 0.7, 1.75);
  root.add(housing, shaft, head, lamp, halo, tri);
  g.add(root);
  void horizontal;
  return {
    object: g,
    update: (_a, t) => {
      const e = c.ext + (c.state === 'warn' ? c.shake : 0);
      head.position.y = -(e + c.headHalf);
      shaft.scale.y = Math.max(0.01, e + 0.2);
      shaft.position.y = -(e + 0.2) / 2 + 0.2;
      const blink = c.state === 'warn' ? (Math.floor(t * (6 + c.warn * 16)) % 2 ? 1 : 0.2) : c.state === 'slam' || c.state === 'hold' ? 1 : 0;
      lampMat.color.setHex(blink > 0.5 ? v.pal.hazard : 0x552200);
      (halo.material as THREE.MeshBasicMaterial).opacity = blink * 0.6;
      housing.position.x = c.state === 'warn' ? c.shake * 0.6 : 0;
    },
  };
}

function sawView(s: Saw, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = s.d;
  if (d.x2 !== undefined && d.y2 !== undefined) g.add(line(new THREE.Vector3(d.x, d.y, -1.2), new THREE.Vector3(d.x2, d.y2, -1.2), 0x808a96, 0.7));
  const blade = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.86, s.r * 0.86, 0.24, 28).rotateX(Math.PI / 2), std(0xcfd6dc, { metal: 0.85, rough: 0.25, vc: false }));
  disc.castShadow = true;
  blade.add(disc);
  const teeth = 14;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 3), std(0xe6ebef, { metal: 0.85, rough: 0.25, vc: false }));
    t.position.set(Math.cos(a) * s.r * 0.95, Math.sin(a) * s.r * 0.95, 0);
    t.rotation.z = a - Math.PI / 2;
    t.scale.z = 0.5;
    blade.add(t);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
  blade.add(hub);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 1.05, s.r * 1.05, 0.05, 28).rotateX(Math.PI / 2), glow(v.pal.hazard, 0.25));
  blade.add(halo);
  g.add(blade);
  return { object: g, update: (a) => follow(s.tracked, blade, a) };
}

function spikesView(s: Spikes, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = s.d;
  const step = d.w / s.count;
  const mat = std(v.pal.hazard, { emissive: v.pal.hazard, ei: 0.45, metal: 0.3, vc: false });
  const root = new THREE.Group();
  root.position.set(d.x, d.y, 0);
  root.rotation.z = d.angle ?? 0;
  for (let i = 0; i < s.count; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(step * 0.5, 0.8, 4), mat);
    c.position.set(i * step + step / 2, 0.4, 0);
    c.rotation.y = Math.PI / 4;
    c.scale.z = 3.2;
    c.castShadow = true;
    root.add(c);
  }
  const base = box(d.w, 0.18, 3.4, DARK(), 0.04);
  base.position.set(d.w / 2, 0.02, 0);
  root.add(base);
  g.add(root);
  return { object: g, update: () => undefined };
}

function laserView(l: Laser, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = l.d;
  const emitter = new THREE.Group();
  emitter.position.set(d.x, d.y, 0);
  const housing = box(1.0, 1.0, 1.4, DARK(), 0.15);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 12).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
  lens.position.x = 0.6;
  emitter.add(housing, lens);
  g.add(emitter);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = new THREE.MeshBasicMaterial({ color: v.pal.hazard, transparent: true, opacity: 0.55, depthWrite: false });
  const chargeMat = new THREE.MeshBasicMaterial({ color: v.pal.hazard, transparent: true, opacity: 0.4, depthWrite: false });
  const segs: Array<{ core: THREE.Mesh; glow: THREE.Mesh; charge: THREE.Mesh }> = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 5; i++) {
    const s = { core: new THREE.Mesh(unit, coreMat), glow: new THREE.Mesh(unit, glowMat), charge: new THREE.Mesh(unit, chargeMat) };
    segs.push(s);
    g.add(s.core, s.glow, s.charge);
  }
  const place = (m: THREE.Mesh, x0: number, y0: number, x1: number, y1: number, thick: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    m.scale.set(len, thick, thick);
  };
  void LANE;
  return {
    object: g,
    update: (_a, t) => {
      emitter.rotation.z = l.angle;
      (lens.material as THREE.MeshBasicMaterial).color.setHex(l.isOn ? 0xffffff : l.charge > 0 ? (Math.floor(t * 18) % 2 ? v.pal.hazard : 0x552200) : 0x552200);
      segs.forEach((s, i) => {
        const seg = l.segs[i];
        const on = !!seg && l.isOn;
        const preview = !!seg && !l.isOn && l.charge > 0;
        s.core.visible = on;
        s.glow.visible = on;
        s.charge.visible = preview;
        if (seg) {
          const flick = 1 + Math.sin(t * 60) * 0.08;
          if (on) {
            place(s.core, seg.x0, seg.y0, seg.x1, seg.y1, 0.12);
            place(s.glow, seg.x0, seg.y0, seg.x1, seg.y1, 0.5 * flick);
          }
          if (preview) {
            place(s.charge, seg.x0, seg.y0, seg.x1, seg.y1, 0.04 + l.charge * 0.1);
            chargeMat.opacity = 0.25 + l.charge * 0.5;
          }
        }
      });
    },
  };
}

function mirrorView(m: Mirror): HazardView {
  const g = new THREE.Group();
  const frame = box(m.w + 0.3, 0.4, 1.0, DARK(), 0.08);
  const face = new THREE.Mesh(new THREE.BoxGeometry(m.w, 0.14, 2.2), new THREE.MeshStandardMaterial({ color: 0xbfeeff, metalness: 1, roughness: 0.05, emissive: 0x3aa6c9, emissiveIntensity: 0.35 }));
  g.add(frame, face);
  g.position.set(m.d.x, m.d.y, 0);
  g.rotation.z = m.d.angle;
  return { object: g, update: () => undefined };
}

function switchView(s: Switch, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const base = box(2.4, 0.22, 2.4, DARK(), 0.06);
  base.position.set(s.d.x, s.d.y + 0.11, 0);
  const matBtn = new THREE.MeshStandardMaterial({ color: v.pal.hazard, emissive: v.pal.hazard, emissiveIntensity: 0.7, roughness: 0.4 });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.28, 18), matBtn);
  btn.castShadow = true;
  g.add(base, btn);
  return {
    object: g,
    update: () => {
      btn.position.set(s.d.x, s.d.y + 0.36 - s.press * 0.2, 0);
      if (s.on) {
        matBtn.color.setHex(0x4cd964);
        matBtn.emissive.setHex(0x1f9c3a);
      } else {
        matBtn.color.setHex(v.pal.hazard);
        matBtn.emissive.setHex(v.pal.hazard);
      }
    },
  };
}

function crumbleView(c: CrumbleBlock, v: ViewCtx, plank = false): HazardView {
  const g = new THREE.Group();
  const w = c.d.w;
  const h = c.d.h;
  const root = new THREE.Group();
  const n = plank ? 1 : Math.max(1, Math.round(w / 1.6));
  const color = v.world === 3 ? 0xbfe6ff : plank ? 0xb88445 : 0xa68b6b;
  for (let i = 0; i < n; i++) {
    const b = box(w / n - 0.04, h, 3.2, std(color, { rough: 0.95 }), 0.1);
    b.position.x = -w / 2 + (w / n) * (i + 0.5);
    root.add(b);
    if (!plank) {
      const crack = box(0.08, h * 0.7, 3.25, std(0x4a3a28, { vc: false }), 0.01);
      crack.position.set(b.position.x + 0.2, 0, 0);
      root.add(crack);
    }
  }
  g.add(root);
  return {
    object: g,
    update: (a, t) => {
      follow(c.tracked, root, a);
      if (c.state === 'shaking') {
        const k = c.shake;
        root.position.x += Math.sin(t * 70) * 0.06 * k;
        root.position.y += Math.sin(t * 83) * 0.05 * k;
      }
    },
  };
}

function fallingView(f: Falling, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const obj = new THREE.Group();
  const d = f.d;
  if (d.kind === 'icicle') {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 6), std(0xcdeeff, { rough: 0.1, metal: 0.1, emissive: 0x7fd0ff, ei: 0.25, vc: false }));
    c.rotation.x = Math.PI;
    c.castShadow = true;
    obj.add(c);
  } else if (d.kind === 'rock') {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), std(0x8a8f98, { rough: 0.95, vc: false }));
    r.castShadow = true;
    obj.add(r);
  } else {
    obj.add(box(3, 0.9, 0.3, std(0xc8a05a), 0.06));
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 3), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
    tri.position.z = 0.2;
    obj.add(tri);
  }
  g.add(obj);
  // warning shadow on the ground (shape + flashing, not colour alone): a flashing ring + exclamation triangle
  const mark = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: v.pal.hazard, transparent: true, opacity: 0.8, depthWrite: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  mark.add(ring, dot);
  mark.position.set(d.x, f.groundY + 0.12, 0);
  mark.visible = false;
  g.add(mark);
  return {
    object: g,
    update: (a, t) => {
      follow(f.tracked, obj, a);
      if (f.state === 'warn') obj.position.x += f.shake;
      mark.visible = f.state === 'warn';
      if (mark.visible) {
        const s = 0.6 + f.warn * 1.3;
        mark.scale.set(s * 1.4, 1, s * 1.4);
        ring.visible = Math.floor(t * (5 + f.warn * 12)) % 2 === 0;
      }
    },
  };
}

function crateView(c: CrateBody): HazardView {
  const g = new THREE.Group();
  const b = box(c.size, c.size, c.size, c.metal ? std(0x7d8793, { metal: 0.7, rough: 0.4 }) : std(0xb98650, { rough: 0.9 }), 0.08);
  for (const s of [-1, 1]) {
    const plank = box(c.size * 1.01, 0.12, c.size * 1.01, c.metal ? std(0x4b535c, { metal: 0.6, vc: false }) : std(0x8a5f34, { vc: false }), 0.02);
    plank.position.y = s * c.size * 0.32;
    b.add(plank);
  }
  g.add(b);
  return { object: g, update: (a) => follow(c.tracked, b, a) };
}

function boulderView(b: Boulder): HazardView {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 1), std(0x8c8479, { rough: 1, vc: false }));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return { object: g, update: (a) => follow(b.tracked, m, a) };
}

function tntView(t: Tnt, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c93a2b';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f5e9d2';
  x.fillRect(0, 44, 128, 40);
  x.fillStyle = '#7a1a10';
  x.font = '900 34px system-ui, sans-serif';
  x.textAlign = 'center';
  x.fillText('TNT', 64, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mat);
  b.castShadow = true;
  const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: v.pal.hazard }));
  fuse.position.set(0.2, 0.75, 0);
  b.add(fuse);
  g.add(b);
  return {
    object: g,
    update: (a, time) => {
      follow(t.tracked, b, a);
      b.visible = !t.exploded;
      if (t.fuse >= 0) {
        const on = Math.floor(time * 16) % 2 === 0;
        mat.emissive.setHex(on ? 0xffffff : 0x000000);
        mat.emissiveIntensity = on ? 0.9 : 0;
      } else mat.emissive.setHex(0);
    },
  };
}

function dominoView(d: Dominoes): HazardView {
  const g = new THREE.Group();
  const meshes = d.bodies.map((_, i) => {
    const m = box(0.34, 2.2, 1.8, std([0xf2f2f2, 0xff7a7a, 0x7ad0ff, 0xffe066][i % 4]), 0.05);
    g.add(m);
    return m;
  });
  return { object: g, update: (a) => meshes.forEach((m, i) => follow(d.tracked[i], m, a)) };
}

function lavaView(l: Lava, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = l.d;
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5a14, emissive: 0xff3a00, emissiveIntensity: 1.1, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(d.w, l.h, 5.6), mat);
  body.position.z = 0;
  g.add(body);
  // brighter crust band on top + drifting dark flecks so the surface reads as molten
  const crust = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.35, 5.7), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  g.add(crust);
  const glowTop = new THREE.Mesh(new THREE.BoxGeometry(d.w, 1.6, 5.8), new THREE.MeshBasicMaterial({ color: v.pal.hazard, transparent: true, opacity: 0.22, depthWrite: false }));
  g.add(glowTop);
  const n = Math.max(6, Math.floor(d.w / 6));
  const flecks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x5a1a00 }), n);
  flecks.frustumCulled = false;
  g.add(flecks);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  return {
    object: g,
    update: (a, t) => {
      l.tracked.at(a, tmp);
      const top = tmp.y + l.h / 2;
      body.position.set(d.x + d.w / 2, tmp.y, 0);
      crust.position.set(d.x + d.w / 2, top - 0.1, 0);
      glowTop.position.set(d.x + d.w / 2, top + 0.6, 0);
      mat.emissiveIntensity = 0.9 + Math.sin(t * 3 + d.x) * 0.2;
      for (let i = 0; i < n; i++) {
        const x = d.x + ((i * 37.7 + t * (1.2 + (i % 3) * 0.5)) % d.w);
        m.compose(new THREE.Vector3(x, top + 0.05, ((i * 13) % 5) - 2.5), q, new THREE.Vector3(1.6 + (i % 4) * 0.5, 0.12, 0.8));
        flecks.setMatrixAt(i, m);
      }
      flecks.instanceMatrix.needsUpdate = true;
    },
  };
}

function geyserView(gz: Geyser, v: ViewCtx): HazardView {
  const g = new THREE.Group();
  const d = gz.d;
  const vent = box(gz.w + 0.8, 0.5, 3, std(0x2b2f36, { metal: 0.3 }), 0.1);
  vent.position.set(d.x, d.y + 0.1, 0);
  g.add(vent);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(gz.w * 0.7, 0.1, 2), new THREE.MeshBasicMaterial({ color: 0xff3a00 }));
  hole.position.set(d.x, d.y + 0.38, 0);
  g.add(hole);
  const colMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55, depthWrite: false });
  const col = new THREE.Mesh(new THREE.BoxGeometry(gz.w * 0.8, 1, 2.2), colMat);
  g.add(col);
  const core = new THREE.Mesh(new THREE.BoxGeometry(gz.w * 0.4, 1, 1.4), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  g.add(core);
  const n = 10;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffb02e }), n);
  sparks.frustumCulled = false;
  g.add(sparks);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  void v;
  return {
    object: g,
    update: (_a, t) => {
      const erupt = gz.state === 'erupt';
      const h = erupt ? gz.height * (0.75 + Math.sin(t * 30) * 0.05) : 0;
      col.visible = core.visible = erupt;
      if (erupt) {
        col.scale.y = h;
        col.position.set(d.x, d.y + h / 2, 0);
        core.scale.y = h * 0.85;
        core.position.set(d.x, d.y + h * 0.43, 0);
      }
      (hole.material as THREE.MeshBasicMaterial).color.setHex(gz.state === 'warn' && Math.floor(t * (8 + gz.warn * 16)) % 2 ? 0xffffff : 0xff3a00);
      vent.position.x = d.x + (gz.state === 'warn' ? Math.sin(t * 90) * 0.06 * gz.warn : 0);
      for (let i = 0; i < n; i++) {
        const live = gz.state !== 'idle';
        const k = (t * (gz.state === 'erupt' ? 1.6 : 0.8) + i / n) % 1;
        const hh = gz.state === 'erupt' ? gz.height : 1.2 + gz.warn * 1.6;
        m.compose(new THREE.Vector3(d.x + Math.sin(i * 9.3 + t * 3) * gz.w * 0.4, d.y + 0.5 + k * hh, 0), q, new THREE.Vector3(live ? 0.28 : 0, live ? 0.28 : 0, 0.28));
        sparks.setMatrixAt(i, m);
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}

function seesawSkip(): null {
  return null;
}

/** Create the view for a behavior, or null if it has none (seesaws are handled by LevelView). */
export function makeHazardView(b: Behavior, v: ViewCtx): HazardView | null {
  if (b instanceof Zone) return zoneView(b, v);
  if (b instanceof Conveyor) return conveyorView(b, v);
  if (b instanceof BouncePad) return bounceView(b);
  if (b instanceof Cannon) return cannonView(b);
  if (b instanceof OneWay) return onewayView(b);
  if (b instanceof TransformPad) return transformView(b);
  if (b instanceof MovingPlatform) return platformView(b, v);
  if (b instanceof Gear) return gearView(b);
  if (b instanceof Swing) return swingView(b, v);
  if (b instanceof Tilt) return tiltView(b);
  if (b instanceof Door) return doorView(b, v);
  if (b instanceof Crusher) return crusherView(b, v);
  if (b instanceof Saw) return sawView(b, v);
  if (b instanceof Spikes) return spikesView(b, v);
  if (b instanceof Laser) return laserView(b, v);
  if (b instanceof Mirror) return mirrorView(b);
  if (b instanceof Switch) return switchView(b, v);
  if (b instanceof Bridge) {
    const views = b.planks.map((p) => crumbleView(p, v, true));
    const g = new THREE.Group();
    views.forEach((x) => g.add(x.object));
    return { object: g, update: (a, t, dt) => views.forEach((x) => x.update(a, t, dt)) };
  }
  if (b instanceof CrumbleBlock) return crumbleView(b, v);
  if (b instanceof Falling) return fallingView(b, v);
  if (b instanceof CrateBody) return crateView(b);
  if (b instanceof Boulder) return boulderView(b);
  if (b instanceof Tnt) return tntView(b, v);
  if (b instanceof Dominoes) return dominoView(b);
  if (b instanceof Lava) return lavaView(b, v);
  if (b instanceof Geyser) return geyserView(b, v);
  return seesawSkip();
}
