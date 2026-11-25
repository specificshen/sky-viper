import * as THREE from 'three';

export type LightingPresetId = 'midday' | 'sunset' | 'stratosphere';
export type CameraMode = 'chase' | 'cockpit' | 'orbit';
export type QualitySetting = 'auto' | 'ultra' | 'high' | 'medium' | 'low';
export type ResolvedQuality = 'ultra' | 'high' | 'medium' | 'low';

export interface LightingPreset {
  id: LightingPresetId;
  labelZh: string;
  labelEn: string;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyGround: THREE.Color;
  cloudTopColor: THREE.Color;
  cloudBottomColor: THREE.Color;
  cloudAmbientStrength: number;
  oceanDeepColor: THREE.Color;
  oceanShallowColor: THREE.Color;
  aerialFogDensity: number;
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  cirrusStrength: number;
}

export interface QualityProfile {
  id: ResolvedQuality;
  labelZh: string;
  labelEn: string;
  cloudScale: number;
  maxPixelRatio: number;
  raySteps: number;
  lightSteps: number;
  enableDenoise: boolean;
  enableBloom: boolean;
  enableDetailNoise: boolean;
}

export interface FlightTelemetry {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  speedMs: number;
  knots: number;
  mach: number;
  altitudeM: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  gForce: number;
  aoaDeg: number;
  throttle: number;
  afterburner: number;
  cloudDensity: number;
  autopilot: boolean;
  controlSurfacePitch: number;
  controlSurfaceRoll: number;
  controlSurfaceYaw: number;
}

export interface SimSettings {
  lighting: LightingPresetId;
  cameraMode: CameraMode;
  quality: QualitySetting;
  cloudDensity: number;
  autopilot: boolean;
  mouseFlight: boolean;
  audioEnabled: boolean;
  uiHidden: boolean;
}
