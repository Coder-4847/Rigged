import * as THREE from 'three';
import { CONFIG, QualityName } from '../config';

/** Owns the WebGL renderer, scene, lights and sky. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  quality: QualityName = 'med';
  width = 1;
  height = 1;
  /** Fired after resize so UI/camera can react. */
  onResize?: () => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, 1, 700);

    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x7a9cc0, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4dc, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.setSky(0x9fd3ff, 0xf6efe0);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored?.());

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    this.setQuality('med');
    this.resize();
  }

  /** Vertical gradient sky + matching fog. */
  setSky(top: number, horizon: number): void {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#' + top.toString(16).padStart(6, '0'));
    grad.addColorStop(1, '#' + horizon.toString(16).padStart(6, '0'));
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = new THREE.Fog(horizon, 120, 460);
  }

  setQuality(q: QualityName): void {
    this.quality = q;
    const cfg = CONFIG.quality[q];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    this.gl.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    this.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    // Materials must recompile when shadows toggle.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }

  /** Keep the sun (and shadow frustum) centred on the action. */
  followSun(x: number, y: number): void {
    this.sun.position.set(x - 16, y + 30, 26);
    this.sun.target.position.set(x, y, 0);
  }

  render(): void {
    this.gl.render(this.scene, this.camera);
  }
}
