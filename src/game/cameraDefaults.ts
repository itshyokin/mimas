/** The camera over the maps (Database → Camera). No three.js, so the editor can use it too. */
import type { OverworldCamera } from '../world/types';

/** The handheld-style default: steep, with standing sprites leaning back to face it. */
export const DEFAULT_OVERWORLD_CAMERA: Required<OverworldCamera> = { pitch: 56, distance: 14.5, fov: 30, lean: 55 };
/** The original HD-2D camera (low, sprites upright). */
export const CLASSIC_OVERWORLD_CAMERA: Required<OverworldCamera> = { pitch: 42.4, distance: 15.6, fov: 30, lean: 0 };
/** Straight down like a 2D RPG (Update 143): sprites lie flat facing it, a narrow view so it looks nearly flat (about 10 tiles tall). */
export const TOPDOWN_OVERWORLD_CAMERA: Required<OverworldCamera> = { pitch: 90, distance: 38, fov: 15, lean: 100 };
