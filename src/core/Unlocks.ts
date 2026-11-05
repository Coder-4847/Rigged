import { DECALS, PAINTS, VEHICLES, VEHICLE_IDS, VehicleDef, VehicleId } from '../config';
import type { Save } from './Save';

/** Stars needed per vehicle (300 exist in total). */
export const VEHICLE_STARS: Record<VehicleId, number> = { hatch: 0, jeep: 10, buggy: 30, monster: 60, muscle: 100, mini: 150 };

export type UnlockKind = 'vehicle' | 'paint' | 'decal';

export interface UnlockItem {
  key: string;
  kind: UnlockKind;
  name: string;
  /** Human-readable requirement. */
  need: string;
  unlocked: boolean;
}

export const vehicleUnlocked = (save: Save, id: VehicleId): boolean => save.totalStars() >= VEHICLE_STARS[id];
export const paintUnlocked = (save: Save, color: number): boolean => save.totalStars() >= (PAINTS.find((p) => p.color === color)?.stars ?? 0);
/** A decal opens when you've cleared 8 of the 10 levels of its world. */
export const decalUnlocked = (save: Save, id: string): boolean => {
  const w = DECALS.find((d) => d.id === id)?.world ?? 0;
  return w === 0 || save.worldStats(w).done >= 8;
};

/** Everything unlockable with its current state. */
export function allItems(save: Save): UnlockItem[] {
  const stars = save.totalStars();
  const out: UnlockItem[] = [];
  for (const id of VEHICLE_IDS)
    out.push({ key: `v:${id}`, kind: 'vehicle', name: VEHICLES[id].name, need: `${VEHICLE_STARS[id]} ★ (you have ${stars})`, unlocked: vehicleUnlocked(save, id) });
  for (const p of PAINTS) out.push({ key: `p:${p.color}`, kind: 'paint', name: `${p.name} paint`, need: `${p.stars} ★ (you have ${stars})`, unlocked: stars >= p.stars });
  for (const d of DECALS) {
    const done = d.world ? save.worldStats(d.world).done : 8;
    out.push({ key: `d:${d.id}`, kind: 'decal', name: d.name, need: `Clear 8 levels in World ${d.world} (${Math.min(done, 8)}/8)`, unlocked: decalUnlocked(save, d.id) });
  }
  return out;
}

export const unlockedKeys = (save: Save): Set<string> => new Set(allItems(save).filter((i) => i.unlocked).map((i) => i.key));

/** Items unlocked now that weren't in `before`. */
export function newlyUnlocked(save: Save, before: Set<string>): UnlockItem[] {
  return allItems(save).filter((i) => i.unlocked && !before.has(i.key));
}

/** Fall back to defaults if the saved garage choice isn't (or is no longer) unlocked. */
export function sanitizeGarage(save: Save): { vehicle: VehicleId; color: number; decal: string } {
  const g = save.data.garage;
  const vehicle = (VEHICLE_IDS as string[]).includes(g.vehicle) && vehicleUnlocked(save, g.vehicle as VehicleId) ? (g.vehicle as VehicleId) : 'hatch';
  const color = PAINTS.some((p) => p.color === g.color) && paintUnlocked(save, g.color) ? g.color : PAINTS[0].color;
  const decal = DECALS.some((d) => d.id === g.decal) && decalUnlocked(save, g.decal) ? g.decal : 'none';
  return { vehicle, color, decal };
}

/** Rough mass from the shape densities (used only for the garage stat bars). */
export function approxMass(d: VehicleDef): number {
  const body = d.body.hx * 2 * d.body.hy * 2 * d.body.density;
  const cabin = d.cabin.hx * 2 * d.cabin.hy * 2 * d.cabin.density;
  const wheels = 2 * Math.PI * d.wheel.radius ** 2 * d.wheel.density;
  return body + cabin + wheels;
}

/** 0..1 stat bars for the garage (relative to the whole roster, so bars compare across vehicles). */
export function stats(d: VehicleDef): Record<'Speed' | 'Pickup' | 'Grip' | 'Air control' | 'Heft', number> {
  const m = approxMass(d);
  const drive = d.motor.drive[0] + d.motor.drive[1];
  const pickup = (d.motor.torque * drive) / d.wheel.radius / m;
  const inertia = m * (d.body.hx * 2) ** 2;
  const air = (d.air.tilt * m * 2.2) / inertia + d.air.maxAngVel * 0.12;
  return {
    Speed: Math.min(1, d.motor.maxSpeed / 23),
    Pickup: Math.min(1, pickup / 38),
    Grip: Math.min(1, (d.wheel.friction + d.wheel.frontFriction * 0.5) / 3.2),
    'Air control': Math.min(1, air / 1.7),
    Heft: Math.min(1, m / 11),
  };
}
