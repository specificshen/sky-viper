import * as THREE from 'three';
import { OCEAN_FRAG, OCEAN_VERT } from '../shaders/ocean.glsl';
import type { LightingPreset } from '../core/types';
import { getSunDirection } from '../core/presets';

export class SunlitOcean {
  public readonly mesh: THREE.Mesh;
  public readonly material: THREE.ShaderMaterial;

  constructor(weatherTexture: THREE.DataTexture, preset: LightingPreset) {
    // 320km x 320km subdivided ocean sheet sliding smoothly under the aircraft (eliminates horizon edge seam!)
    const geo = new THREE.PlaneGeometry(320000, 320000, 16, 16);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      depthWrite: true,
      depthTest: true,
      uniforms: {
        uCameraPos: { value: new THREE.Vector3() },
        uWeatherMap: { value: weatherTexture },
        uSunDir: { value: getSunDirection(preset) },
        uSunColor: { value: preset.sunColor.clone() },
        uSunIntensity: { value: preset.sunIntensity },
        uSkyZenith: { value: preset.skyZenith.clone() },
        uSkyHorizon: { value: preset.skyHorizon.clone() },
        uSkyGround: { value: preset.skyGround.clone() },
        uCameraAlt: { value: 2200 },
        uCirrusStrength: { value: preset.cirrusStrength },
        uTime: { value: 0 },
        uOceanDeepColor: { value: preset.oceanDeepColor.clone() },
        uOceanShallowColor: { value: preset.oceanShallowColor.clone() },
        uCloudDensity: { value: 0.92 },
        uAerialFogDensity: { value: preset.aerialFogDensity },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0;
    this.mesh.frustumCulled = false;
  }

  public applyPreset(preset: LightingPreset): void {
    const u = this.material.uniforms;
    u.uSunDir.value.copy(getSunDirection(preset));
    u.uSunColor.value.copy(preset.sunColor);
    u.uSunIntensity.value = preset.sunIntensity;
    u.uSkyZenith.value.copy(preset.skyZenith);
    u.uSkyHorizon.value.copy(preset.skyHorizon);
    u.uSkyGround.value.copy(preset.skyGround);
    u.uOceanDeepColor.value.copy(preset.oceanDeepColor);
    u.uOceanShallowColor.value.copy(preset.oceanShallowColor);
    u.uAerialFogDensity.value = preset.aerialFogDensity;
    u.uCirrusStrength.value = preset.cirrusStrength;
  }

  public update(cameraPos: THREE.Vector3, timeSec: number, cloudDensity: number): void {
    // Center ocean mesh smoothly beneath camera XZ so world is boundless
    this.mesh.position.x = cameraPos.x;
    this.mesh.position.z = cameraPos.z;
    const u = this.material.uniforms;
    u.uCameraPos.value.copy(cameraPos);
    u.uCameraAlt.value = Math.max(0, cameraPos.y);
    u.uTime.value = timeSec;
    u.uCloudDensity.value = cloudDensity;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
