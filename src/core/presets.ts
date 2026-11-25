import * as THREE from 'three';
import type {
  LightingPreset,
  LightingPresetId,
  QualityProfile,
  ResolvedQuality,
} from './types';

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  midday: {
    id: 'midday',
    labelZh: '正午晴空',
    labelEn: 'Midday Sky',
    sunElevationDeg: 36,
    sunAzimuthDeg: 38,
    sunColor: new THREE.Color(1.0, 0.975, 0.93),
    sunIntensity: 3.35,
    skyZenith: new THREE.Color(0.022, 0.165, 0.62),
    skyHorizon: new THREE.Color(0.42, 0.74, 0.99),
    skyGround: new THREE.Color(0.11, 0.28, 0.48),
    cloudTopColor: new THREE.Color(1.0, 0.998, 0.99),
    cloudBottomColor: new THREE.Color(0.46, 0.62, 0.84),
    cloudAmbientStrength: 0.72,
    oceanDeepColor: new THREE.Color(0.01, 0.085, 0.26),
    oceanShallowColor: new THREE.Color(0.04, 0.25, 0.48),
    aerialFogDensity: 0.000026,
    exposure: 1.02,
    bloomStrength: 0.26,
    bloomThreshold: 1.32,
    cirrusStrength: 0.45,
  },
  sunset: {
    id: 'sunset',
    labelZh: '黄金日落',
    labelEn: 'Golden Sunset',
    sunElevationDeg: 10.5,
    sunAzimuthDeg: 32,
    sunColor: new THREE.Color(1.0, 0.56, 0.24),
    sunIntensity: 3.75,
    skyZenith: new THREE.Color(0.04, 0.12, 0.38),
    skyHorizon: new THREE.Color(0.98, 0.56, 0.29),
    skyGround: new THREE.Color(0.22, 0.15, 0.25),
    cloudTopColor: new THREE.Color(1.0, 0.80, 0.56),
    cloudBottomColor: new THREE.Color(0.28, 0.27, 0.48),
    cloudAmbientStrength: 0.62,
    oceanDeepColor: new THREE.Color(0.018, 0.048, 0.14),
    oceanShallowColor: new THREE.Color(0.16, 0.14, 0.24),
    aerialFogDensity: 0.000034,
    exposure: 1.04,
    bloomStrength: 0.36,
    bloomThreshold: 1.15,
    cirrusStrength: 0.58,
  },
  stratosphere: {
    id: 'stratosphere',
    labelZh: '高空平流层',
    labelEn: 'Stratosphere',
    sunElevationDeg: 26,
    sunAzimuthDeg: 48,
    sunColor: new THREE.Color(0.98, 0.99, 1.0),
    sunIntensity: 3.55,
    skyZenith: new THREE.Color(0.006, 0.032, 0.19),
    skyHorizon: new THREE.Color(0.22, 0.52, 0.93),
    skyGround: new THREE.Color(0.08, 0.22, 0.44),
    cloudTopColor: new THREE.Color(0.99, 0.998, 1.0),
    cloudBottomColor: new THREE.Color(0.32, 0.48, 0.76),
    cloudAmbientStrength: 0.66,
    oceanDeepColor: new THREE.Color(0.006, 0.04, 0.15),
    oceanShallowColor: new THREE.Color(0.025, 0.14, 0.34),
    aerialFogDensity: 0.000022,
    exposure: 1.04,
    bloomStrength: 0.30,
    bloomThreshold: 1.26,
    cirrusStrength: 0.65,
  },
};

export const QUALITY_PROFILES: Record<ResolvedQuality, QualityProfile> = {
  ultra: {
    id: 'ultra',
    labelZh: '极致',
    labelEn: 'Ultra',
    cloudScale: 0.85,
    maxPixelRatio: 1.5,
    raySteps: 80,
    lightSteps: 5,
    enableDenoise: true,
    enableBloom: true,
    enableDetailNoise: true,
  },
  high: {
    id: 'high',
    labelZh: '高',
    labelEn: 'High',
    cloudScale: 0.68,
    maxPixelRatio: 1.25,
    raySteps: 64,
    lightSteps: 5,
    enableDenoise: true,
    enableBloom: true,
    enableDetailNoise: true,
  },
  medium: {
    id: 'medium',
    labelZh: '中',
    labelEn: 'Med',
    cloudScale: 0.52,
    maxPixelRatio: 1.0,
    raySteps: 50,
    lightSteps: 4,
    enableDenoise: true,
    enableBloom: true,
    enableDetailNoise: true,
  },
  low: {
    id: 'low',
    labelZh: '流畅',
    labelEn: 'Low',
    cloudScale: 0.38,
    maxPixelRatio: 1.0,
    raySteps: 40,
    lightSteps: 4,
    enableDenoise: true,
    enableBloom: true,
    enableDetailNoise: true,
  },
};

export function getSunDirection(preset: LightingPreset): THREE.Vector3 {
  const elev = THREE.MathUtils.degToRad(preset.sunElevationDeg);
  const azim = THREE.MathUtils.degToRad(preset.sunAzimuthDeg);
  return new THREE.Vector3(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    -Math.cos(elev) * Math.cos(azim)
  ).normalize();
}

export const CLOUD_LAYER_BOTTOM = 1200;
export const CLOUD_LAYER_TOP = 3550;
export const CLOUD_LAYER_THICKNESS = CLOUD_LAYER_TOP - CLOUD_LAYER_BOTTOM;
export const EARTH_RADIUS = 6371000;
