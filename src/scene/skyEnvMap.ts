import * as THREE from 'three';
import type { LightingPreset } from '../core/types';
import { getSunDirection } from '../core/presets';

/**
 * Generates a realistic PMREM sky+sun+cloud-bounce environment map on the GPU
 * so the stealth fighter's metallic RAM paint and gold-tinted canopy reflect
 * the true azure sky, warm sun highlight, and soft cloud deck underneath.
 */
export function buildSkyEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  preset: LightingPreset
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const sunDir = getSunDirection(preset);

  const skyGeo = new THREE.SphereGeometry(50, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uSunDir: { value: sunDir },
      uSunColor: { value: preset.sunColor.clone() },
      uZenith: { value: preset.skyZenith.clone() },
      uHorizon: { value: preset.skyHorizon.clone() },
      uGround: { value: preset.cloudTopColor.clone().multiplyScalar(0.55).add(preset.oceanDeepColor.clone().multiplyScalar(0.45)) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col;
        if (y >= 0.0) {
          col = mix(uHorizon * 1.2, uZenith * 1.35, pow(y, 0.55));
        } else {
          col = mix(uHorizon * 0.95, uGround * 1.15, pow(-y, 0.6));
        }
        // Bright specular sun lobe & cloud belt bounce for metallic chine highlights
        float sunCos = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sunCos, 12.0) * 0.6 + pow(sunCos, 180.0) * 6.5);
        // Subtle sunlit white cloud band near horizon
        float cloudBelt = exp(-abs(y + 0.04) * 7.5);
        col = mix(col, mix(uHorizon, vec3(1.0), 0.45) * 1.25, cloudBelt * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  envScene.add(skyMesh);

  const rt = pmrem.fromScene(envScene, 0.015);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();

  return rt.texture;
}
