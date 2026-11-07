/** Per-world visual palettes. 3–4 main colours + one accent reserved for hazards. */
export interface WorldTheme {
  name: string;
  skyTop: number;
  skyHorizon: number;
  /** Fog colour = horizon. */
  dirt: number;
  top: number;
  /** Colours of the 3 parallax silhouette layers (far -> near). */
  bg: [number, number, number];
  bgShape: 'mountains' | 'towers' | 'spires' | 'pipes' | 'blobs';
  dust: number[];
  /** Hazard warning accent (consistent everywhere: readable at a glance). */
  hazard: number;
  /** Menu accent. */
  accent: number;
  sun: number;
  /** What the islands float in: a colour and a kind (animated water, molten lava, glowing goo or open space). */
  sea: number;
  seaKind: 'water' | 'lava' | 'goo' | 'void';
  /** Front-face pattern of the terrain blocks. */
  face: 'brick' | 'stone' | 'plate';
}

export const THEMES: Record<number, WorldTheme> = {
  1: { name: 'Grasslands', skyTop: 0x2f8fff, skyHorizon: 0xbfe8ff, dirt: 0xd08a62, top: 0x7cd64f, bg: [0x9fd0ff, 0x6db4fa, 0x4a9cf2], bgShape: 'mountains', dust: [0xe8d6a8, 0xc9e8a0], hazard: 0xff5a36, accent: 0xffb52e, sun: 0xfff4dc, sea: 0x2fb4ff, seaKind: 'water', face: 'brick' },
  2: { name: 'Desert Ruins', skyTop: 0x3aa0ff, skyHorizon: 0xffe3b0, dirt: 0xd9925a, top: 0xf2cc72, bg: [0xffc98f, 0xf0a868, 0xdb8a4e], bgShape: 'mountains', dust: [0xf0d79c, 0xd8b474], hazard: 0xff5a36, accent: 0xffd166, sun: 0xffe6bc, sea: 0x2ec8d8, seaKind: 'water', face: 'brick' },
  3: { name: 'Frostbite', skyTop: 0x4aa8ff, skyHorizon: 0xe6f6ff, dirt: 0x8cb8de, top: 0xf2fbff, bg: [0xd6ecff, 0xa9d4f7, 0x7fb8ee], bgShape: 'spires', dust: [0xffffff, 0xdcecf7], hazard: 0xff5a36, accent: 0x6ee7ff, sun: 0xf0f8ff, sea: 0x4fb6e8, seaKind: 'water', face: 'stone' },
  4: { name: 'Factory', skyTop: 0x5d8fc2, skyHorizon: 0xf0d9b8, dirt: 0x707c8a, top: 0xa9b2bd, bg: [0xb4bcc6, 0x8f9aa8, 0x6d7a8a], bgShape: 'pipes', dust: [0xb4b8bd, 0x8e939a], hazard: 0xff5a36, accent: 0xffb52e, sun: 0xffe8c8, sea: 0x48b45c, seaKind: 'goo', face: 'plate' },
  5: { name: 'Laser Lab', skyTop: 0x16224a, skyHorizon: 0x4a6fb0, dirt: 0x34477a, top: 0x6f92c8, bg: [0x3a5490, 0x2c4278, 0x213360], bgShape: 'towers', dust: [0x9db8d8, 0x7a95b8], hazard: 0xff3b5c, accent: 0x5cf2ff, sun: 0xc8dcff, sea: 0x1aa6c8, seaKind: 'goo', face: 'plate' },
  6: { name: 'Magnet Mines', skyTop: 0x2c2346, skyHorizon: 0x7a5a8c, dirt: 0x6a4e74, top: 0x9b7fb0, bg: [0x5e4a78, 0x4a3a62, 0x382c4c], bgShape: 'blobs', dust: [0x9a8aa4, 0x7b6a83], hazard: 0xff5a36, accent: 0xc77dff, sun: 0xe0ccff, sea: 0x3a4f9a, seaKind: 'water', face: 'stone' },
  7: { name: 'Skyline', skyTop: 0x3f7ff0, skyHorizon: 0xffd2b0, dirt: 0x7a8496, top: 0xa6b0c2, bg: [0xb8c8ec, 0x8ea6dc, 0x6f88c8], bgShape: 'towers', dust: [0xd0d4dc, 0xaab0bc], hazard: 0xff5a36, accent: 0xff8fb1, sun: 0xffe3c0, sea: 0x4f8fe0, seaKind: 'water', face: 'brick' },
  8: { name: 'Lava Core', skyTop: 0x2e1218, skyHorizon: 0xb8452a, dirt: 0x5a3a34, top: 0x8a6a5c, bg: [0x7a3424, 0x5a2418, 0x401810], bgShape: 'mountains', dust: [0x9a5a3e, 0x6a4a3e], hazard: 0xffd23a, accent: 0xff8a3d, sun: 0xffb074, sea: 0xff6a1a, seaKind: 'lava', face: 'stone' },
  9: { name: 'Zero-G Station', skyTop: 0x070b1c, skyHorizon: 0x2b3a76, dirt: 0x46518a, top: 0x8e9cdc, bg: [0x2a3670, 0x1e2856, 0x141c40], bgShape: 'pipes', dust: [0xb0baf0, 0x8a96d0], hazard: 0xff5a36, accent: 0x7affc8, sun: 0xc8d4ff, sea: 0x0b1030, seaKind: 'void', face: 'plate' },
  10: { name: 'Chaos Circuit', skyTop: 0x34197a, skyHorizon: 0xff7ab8, dirt: 0x5a3f8a, top: 0xb98bff, bg: [0x8a5fd0, 0x6a46b0, 0x4e3290], bgShape: 'towers', dust: [0xffd2ff, 0xc9a2ff], hazard: 0xffe03a, accent: 0xff5ad1, sun: 0xffe0f4, sea: 0xc23fae, seaKind: 'goo', face: 'brick' },
};

/** Terrain colours for non-default surfaces (same shape cue everywhere: lighter/shinier = slippery, etc.). */
export const SURFACE_STYLE: Record<string, { dirt: number; top: number }> = {
  ice: { dirt: 0x7fb4e0, top: 0xbfeaff },
  snow: { dirt: 0x9dc0dc, top: 0xffffff },
  sand: { dirt: 0xd49a58, top: 0xf4d682 },
  metal: { dirt: 0x5f6b78, top: 0xa3adb8 },
  rock: { dirt: 0x6e7078, top: 0xa0a2aa },
  goo: { dirt: 0x5a2f8f, top: 0xb46cf0 },
};
