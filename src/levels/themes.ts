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
}

export const THEMES: Record<number, WorldTheme> = {
  1: { name: 'Grasslands', skyTop: 0x7cc4ff, skyHorizon: 0xf2ecd8, dirt: 0x7a5a3c, top: 0x6fae4a, bg: [0xbcd7e6, 0x9cc2c0, 0x7fae8a], bgShape: 'mountains', dust: [0xd8c7a0, 0xbfa97a], hazard: 0xff5a36, accent: 0xffb52e, sun: 0xfff1d6 },
  2: { name: 'Desert Ruins', skyTop: 0xf4a261, skyHorizon: 0xfbe3b5, dirt: 0xb5733a, top: 0xe3b866, bg: [0xe8c08c, 0xd9a46c, 0xc48a56], bgShape: 'mountains', dust: [0xe8cf94, 0xd1b070], hazard: 0xff5a36, accent: 0xffd166, sun: 0xffe0b0 },
  3: { name: 'Frostbite', skyTop: 0x9cc7e8, skyHorizon: 0xe9f4fb, dirt: 0x8fb4cf, top: 0xeaf6fc, bg: [0xcfe3f1, 0xb4d2e6, 0x98bdd8], bgShape: 'spires', dust: [0xffffff, 0xdcecf7], hazard: 0xff5a36, accent: 0x6ee7ff, sun: 0xeaf4ff },
  4: { name: 'Factory', skyTop: 0x6c7a89, skyHorizon: 0xc9c2b0, dirt: 0x4b5560, top: 0x8b9199, bg: [0x8d939a, 0x747b84, 0x5c636c], bgShape: 'pipes', dust: [0xa4a8ad, 0x7e838a], hazard: 0xff5a36, accent: 0xffb52e, sun: 0xffe8c8 },
  5: { name: 'Laser Lab', skyTop: 0x1e2a44, skyHorizon: 0x4f6a8f, dirt: 0x2c3a52, top: 0x5a7596, bg: [0x33466a, 0x2a3a5a, 0x203049], bgShape: 'towers', dust: [0x9db8d8, 0x7a95b8], hazard: 0xff3b5c, accent: 0x5cf2ff, sun: 0xc8dcff },
  6: { name: 'Magnet Mines', skyTop: 0x2a2433, skyHorizon: 0x594a63, dirt: 0x3d3441, top: 0x6b5a73, bg: [0x4a3f52, 0x3a3142, 0x2c2433], bgShape: 'blobs', dust: [0x8a7a94, 0x6b5a73], hazard: 0xff5a36, accent: 0xc77dff, sun: 0xd8c0ff },
  7: { name: 'Skyline', skyTop: 0x5f8fe8, skyHorizon: 0xffd9b0, dirt: 0x58606e, top: 0x8993a3, bg: [0xa9b9d6, 0x8c9fc2, 0x6f84ab], bgShape: 'towers', dust: [0xd0d4dc, 0xaab0bc], hazard: 0xff5a36, accent: 0xff8fb1, sun: 0xffe3c0 },
  8: { name: 'Lava Core', skyTop: 0x3a1a1a, skyHorizon: 0x8a3b24, dirt: 0x3b2a28, top: 0x6a4a3e, bg: [0x5a2d24, 0x472018, 0x351610], bgShape: 'mountains', dust: [0x9a5a3e, 0x6a4a3e], hazard: 0xffd23a, accent: 0xff8a3d, sun: 0xffb074 },
  9: { name: 'Zero-G Station', skyTop: 0x0b1020, skyHorizon: 0x2b3a66, dirt: 0x3a4468, top: 0x7e8cc0, bg: [0x1b2548, 0x141c38, 0x0e1428], bgShape: 'pipes', dust: [0xb0baf0, 0x8a96d0], hazard: 0xff5a36, accent: 0x7affc8, sun: 0xb8c8ff },
  10: { name: 'Chaos Circuit', skyTop: 0x2a1a4a, skyHorizon: 0xd96fa8, dirt: 0x3c2f5a, top: 0xa77bff, bg: [0x5a3f8f, 0x45306f, 0x33245a], bgShape: 'towers', dust: [0xffd2ff, 0xc9a2ff], hazard: 0xffe03a, accent: 0xff5ad1, sun: 0xffd9f0 },
};
