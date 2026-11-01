/** Starting points for new lights. Every value can be changed afterwards in the inspector. */
import type { AreaLightData, PointLightData, SpotLightData } from '../world/types';

type Without<T> = Omit<T, 'type' | 'x' | 'z'>;
export interface LightPreset { name: string; values: Without<PointLightData> | Without<SpotLightData> | Without<AreaLightData> }

export const LIGHT_PRESETS: { point: LightPreset[]; spot: LightPreset[]; area: LightPreset[] } = {
  point: [
    { name: 'Torch glow', values: { color: '#ffb35c', intensity: 2.2, radius: 7, y: 1.3, flicker: 'fire', schedule: 'nightBoost' } },
    { name: 'Street lamp', values: { color: '#ffd9a0', intensity: 2.5, radius: 8, y: 2.2, flicker: 'none', schedule: 'night' } },
    { name: 'Candle', values: { color: '#ffc27a', intensity: 1.2, radius: 4, y: 0.8, flicker: 'candle', schedule: 'always' } },
    { name: 'Magic', values: { color: '#8fb7ff', intensity: 2, radius: 6, y: 1.2, flicker: 'pulse', schedule: 'always' } },
  ],
  spot: [
    { name: 'Flashlight', values: { color: '#fff2d0', intensity: 3, radius: 10, y: 1.4, dir: 'down', angle: 40, tilt: 30, schedule: 'always' } },
    { name: 'Window beam', values: { color: '#ffd59a', intensity: 2.5, radius: 7, y: 2.5, dir: 'down', angle: 70, tilt: 55, schedule: 'night' } },
    { name: 'Searchlight', values: { color: '#d8f0ff', intensity: 4, radius: 16, y: 3, dir: 'down', angle: 22, tilt: 20, schedule: 'night', shadows: true } },
  ],
  area: [
    { name: 'Forest shade', values: { shape: 'rect', w: 6, h: 4, feather: 1.5, color: '#7d9cc8', intensity: 0.7, schedule: 'always' } },
    { name: 'Warm glow', values: { shape: 'ellipse', w: 5, h: 4, feather: 1.5, color: '#ffbf7a', intensity: 1.35, schedule: 'always' } },
    { name: 'Moonbeam', values: { shape: 'ellipse', w: 3, h: 3, feather: 1, color: '#bcd4ff', intensity: 1.6, schedule: 'night' } },
    { name: 'Eerie', values: { shape: 'rect', w: 6, h: 6, feather: 2, color: '#a98bd6', intensity: 0.8, schedule: 'always' } },
  ],
};
