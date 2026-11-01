/**
 * Impact materials: what an enemy is made of decides the sound of a sword or arrow hitting it and the bits that fly
 * off (Database → Enemies → Impact). No three.js and no DOM, so it can be tested on its own.
 */
import type { SfxName } from '../../audio/synth';
import type { EnemyDef, ImpactFx, Material } from '../../world/types';

export const MATERIALS: Material[] = ['flesh', 'plant', 'metal', 'stone', 'wood', 'bone', 'liquid', 'gel', 'crystal', 'spirit', 'cloth'];
export const IMPACT_FX: ImpactFx[] = ['blood', 'sparks', 'stone', 'wood', 'splash', 'bone', 'crystal', 'wisps'];

export const MATERIAL_INFO: Record<Material, { name: string; sound: SfxName; fx: ImpactFx[]; color?: string }> = {
  flesh: { name: 'Flesh (a squish)', sound: 'hitFlesh', fx: ['blood'] },
  plant: { name: 'Plant (a vine chop)', sound: 'hitPlant', fx: ['blood', 'wood'], color: '#7fbf3f' },
  metal: { name: 'Metal (a ding)', sound: 'hitMetal', fx: ['sparks'] },
  stone: { name: 'Stone (a crack)', sound: 'hitStone', fx: ['stone'] },
  wood: { name: 'Wood (a knock)', sound: 'hitWood', fx: ['wood'] },
  bone: { name: 'Bone (a clack)', sound: 'hitBone', fx: ['bone'] },
  liquid: { name: 'Liquid (a splash)', sound: 'hitLiquid', fx: ['splash'] },
  gel: { name: 'Gel / slime (a squelch)', sound: 'hitGel', fx: ['splash'], color: '#6fdc5a' },
  crystal: { name: 'Crystal (a chime)', sound: 'hitCrystal', fx: ['crystal', 'sparks'] },
  spirit: { name: 'Spirit / ethereal (a whoosh)', sound: 'hitSpirit', fx: ['wisps'] },
  cloth: { name: 'Cloth (a thud)', sound: 'hitCloth', fx: [] },
};

export const FX_INFO: Record<ImpactFx, { name: string; color: string; recolour: boolean }> = {
  blood: { name: 'Blood (recolour it for ooze, sap, ichor)', color: '#c8202a', recolour: true },
  sparks: { name: 'Sparks', color: '#ffe08a', recolour: true },
  stone: { name: 'Stone bits', color: '#9a948a', recolour: true },
  wood: { name: 'Wood chips', color: '#a8743e', recolour: true },
  splash: { name: 'Water / gel splash', color: '#7fc8ff', recolour: true },
  bone: { name: 'Bone shards', color: '#efe6cf', recolour: false },
  crystal: { name: 'Crystal shards', color: '#b8f0ff', recolour: true },
  wisps: { name: 'Wisps', color: '#d0c8ff', recolour: true },
};

/** An enemy's material: set, or a guess for older databases (slimes are gel, the undead bone, the rest flesh). */
export function materialOf(d: Pick<EnemyDef, 'material' | 'name' | 'undead'>): Material {
  if (d.material && MATERIAL_INFO[d.material]) return d.material;
  const n = d.name.toLowerCase();
  if (/slime|ooze|jelly|blob/.test(n)) return 'gel';
  if (/skeleton|bone/.test(n) || d.undead) return 'bone';
  if (/golem|gargoyle|stone|rock/.test(n)) return 'stone';
  if (/ghost|wisp|spirit|wraith|phantom/.test(n)) return 'spirit';
  if (/vine|plant|treant|flower|shroom/.test(n)) return 'plant';
  if (/armou?r|knight|machine|automaton/.test(n)) return 'metal';
  return 'flesh';
}

/** What a hit on this enemy sounds like and what flies off (at most two effects, each with its colour). */
export function impactOf(d: Pick<EnemyDef, 'material' | 'name' | 'undead' | 'impactFx'>): { sound: SfxName; fx: { kind: ImpactFx; color: string }[] } {
  const m = MATERIAL_INFO[materialOf(d)];
  const list = d.impactFx ?? m.fx.map((kind) => ({ kind, color: undefined as string | undefined }));
  return {
    sound: m.sound,
    fx: list.filter((f) => FX_INFO[f.kind]).slice(0, 2).map((f, i) => ({ kind: f.kind, color: f.color ?? (d.impactFx || i ? undefined : m.color) ?? FX_INFO[f.kind].color })),
  };
}
