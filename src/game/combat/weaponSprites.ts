/**
 * Which LPC weapon sprites things carry (plain data, no renderer: the editor and the Credits use it too).
 */
import type { Database, EnemyDef, ItemDef } from '../../world/types';

/** The LPC weapon list, relative to the project's public folder. */
export const WEAPON_MANIFEST_PATH = 'assets/weapons/weapons.json';

/**
 * The LPC sprite an item is drawn with: its own choice ('' for none), else one for its kind, so weapons made before
 * there were sprites show one too.
 */
export function itemWeaponSprite(d: ItemDef | undefined): string {
  if (!d) return '';
  if (d.sprite !== undefined) return d.sprite;
  if (d.slot === 'shield') return 'shield_round_brown';
  if (d.weapon?.class === 'bow') return 'bow_normal_medium';
  if (d.slot === 'weapon' && d.weapon) return d.weapon.class === 'light' ? 'arming_steel' : 'longsword';
  return '';
}

/** LPC weapon sprites people use when Database → Enemies doesn't choose: by their icon (sword, bow…). */
const ICON_SPRITE: Record<string, string> = { sword: 'arming_steel', greatsword: 'longsword', dagger: 'dagger', bow: 'bow_normal_medium', axe: 'mace' };
export const DEFAULT_ENEMY_WEAPONS = [...new Set(Object.values(ICON_SPRITE))];

/** The weapon sprites an enemy carries: its own choice, else the one matching its icon; shield first. */
export function enemyWeaponSprites(def: EnemyDef, icon: string): string[] {
  const weapon = def.weaponSprite ?? (icon ? ICON_SPRITE[icon] ?? '' : '');
  return [def.behaviour === 'ranged' ? '' : def.shieldSprite ?? '', weapon].filter((x) => !!x);
}

/** Every weapon sprite the game can show: the items' and the enemies' (people with animated sheets). */
export function usedWeaponSprites(db: Database): string[] {
  const out = new Set<string>();
  for (const d of db.items ?? []) { const id = itemWeaponSprite(d); if (id) out.add(id); }
  for (const e of db.enemies ?? []) {
    const person = e.look.character ? db.characters[e.look.character] : undefined;
    if (!person?.anim) continue;
    const icon = e.weapon ?? (e.behaviour === 'ranged' ? 'bow' : 'sword');
    for (const id of enemyWeaponSprites(e, icon)) out.add(id);
  }
  return [...out];
}
