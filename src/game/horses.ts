/** Horses: rented at stables, ridden on the map (faster, their own stamina, a jump over gaps). */
import type { Database, HorseDef } from '../world/types';

export const DEFAULT_HORSES: HorseDef[] = [
  { id: 'brown_horse', name: 'Brown Horse', tier: 1, price: 200, speed: 8.5, stamina: 100, jump: 3, color: '#8a5a34', mane: '#2a1a12', description: 'A steady old horse: gets you there.' },
  { id: 'grey_steed', name: 'Grey Steed', tier: 2, price: 600, speed: 9.8, stamina: 150, jump: 4, color: '#9a9aa4', mane: '#e8e8f0', description: 'Quick and sure-footed.' },
  { id: 'black_charger', name: 'Black Charger', tier: 3, price: 1500, speed: 11.2, stamina: 220, jump: 5, color: '#3a3238', mane: '#141014', description: 'A warhorse: fast, tireless, and it clears wide gaps.' },
];

export const horseList = (db: Database): HorseDef[] => (db.horses?.length ? db.horses : DEFAULT_HORSES);
export const findHorse = (db: Database, id: string | undefined): HorseDef | undefined => (id ? horseList(db).find((h) => h.id === id) : undefined);
export const stars = (tier: number): string => '★'.repeat(Math.max(1, Math.min(3, Math.round(tier))));

/** How high the rider sits on the horse (tiles). */
export const SEAT = 0.8;
/** The horse drawn a little bigger than a person. */
export const HORSE_SCALE = 1.35;
/** Stamina a second while galloping, a jump, and coming back a second while walking or standing. */
export const GALLOP_COST = 12, JUMP_COST = 18, REST_GAIN = 16;
/** Out of stamina: no galloping until it's back to this share. */
export const RECOVER_AT = 0.3;
