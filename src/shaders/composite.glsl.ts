import { ATMOSPHERE_GLSL } from './atmosphere.glsl';

export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform vec3 uCameraPos;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2 uCloudTexelSize;

uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform sampler2D uCloudTex;
uniform sampler2D uWeatherMap;

uniform float uCloudImmersion;

${ATMOSPHERE_GLSL}

float linearizeDepth(float d) {
  if (d >= 0.99999) return 1e6;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - ndc * (uCameraFar - uCameraNear));
}

// Depth-aware bilateral upsample from lower-res cloud buffer -> full resolution
// Eliminates halos around fighter jet silhouette completely!
vec4 sampleCloudBilateral(vec2 uv, float centerLinearD) {
  vec2 cloudRes = 1.0 / uCloudTexelSize;
  vec2 fCoord = uv * cloudRes - 0.5;
  vec2 base = floor(fCoord);
  vec2 f = fract(fCoord);

  vec2 uv00 = (base + vec2(0.5, 0.5)) * uCloudTexelSize;
  vec2 uv10 = (base + vec2(1.5, 0.5)) * uCloudTexelSize;
  vec2 uv01 = (base + vec2(0.5, 1.5)) * uCloudTexelSize;
  vec2 uv11 = (base + vec2(1.5, 1.5)) * uCloudTexelSize;

  float d00 = linearizeDepth(texture(uSceneDepth, uv00).r);
  float d10 = linearizeDepth(texture(uSceneDepth, uv10).r);
  float d01 = linearizeDepth(texture(uSceneDepth, uv01).r);
  float d11 = linearizeDepth(texture(uSceneDepth, uv11).r);

  float w00 = (1.0 - f.x) * (1.0 - f.y) * exp(-abs(d00 - centerLinearD) / max(min(d00, centerLinearD), 2.0) * 14.0);
  float w10 = f.x * (1.0 - f.y) * exp(-abs(d10 - centerLinearD) / max(min(d10, centerLinearD), 2.0) * 14.0);
  float w01 = (1.0 - f.x) * f.y * exp(-abs(d01 - centerLinearD) / max(min(d01, centerLinearD), 2.0) * 14.0);
  float w11 = f.x * f.y * exp(-abs(d11 - centerLinearD) / max(min(d11, centerLinearD), 2.0) * 14.0);

  vec4 c00 = texture(uCloudTex, uv00);
  vec4 c10 = texture(uCloudTex, uv10);
  vec4 c01 = texture(uCloudTex, uv01);
  vec4 c11 = texture(uCloudTex, uv11);

  float wSum = w00 + w10 + w01 + w11;
  if (wSum < 0.0001) {
    // Fallback to nearest depth match
    float bestErr = 1e9;
    vec4 bestCol = c00;
    float e00 = abs(d00 - centerLinearD); if (e00 < bestErr) { bestErr = e00; bestCol = c00; }
    float e10 = abs(d10 - centerLinearD); if (e10 < bestErr) { bestErr = e10; bestCol = c10; }
    float e01 = abs(d01 - centerLinearD); if (e01 < bestErr) { bestErr = e01; bestCol = c01; }
    float e11 = abs(d11 - centerLinearD); if (e11 < bestErr) { bestErr = e11; bestCol = c11; }
    return bestCol;
  }
  return (c00 * w00 + c10 * w10 + c01 * w01 + c11 * w11) / wSum;
}

void main() {
  float rawDepth = texture(uSceneDepth, vUv).r;
  float linearD = linearizeDepth(rawDepth);

  // Reconstruct full-res world ray for razor-sharp sky, sun disc & cirrus
  vec4 clipPos = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  vec3 viewRay = normalize(viewPos.xyz / viewPos.w);
  vec3 rayDir = normalize((uInvView * vec4(viewRay, 0.0)).xyz);

  vec3 baseCol;
  if (rawDepth >= 0.99999) {
    // Pure sky pixel: evaluate Rayleigh/Mie sky + sun disc + high-altitude cirrus
    baseCol = computeAtmosphereSky(rayDir, true);
    baseCol = blendCirrusLayer(baseCol, uCameraPos, rayDir, uWeatherMap);
  } else {
    // Opaque fighter jet or sunlit ocean
    baseCol = texture(uSceneColor, vUv).rgb;
  }

  // Depth-aware volumetric cloud compositing (handles jet in front, inside, or behind clouds!)
  vec4 cloud = sampleCloudBilateral(vUv, linearD);
  vec3 finalCol = baseCol * cloud.a + cloud.rgb;

  // Subtle moist enveloping mist glow when camera/cockpit is directly piercing inside a dense cloud
  if (uCloudImmersion > 0.01) {
    float mist = smoothstep(0.05, 0.85, uCloudImmersion) * 0.24;
    float sunCos = max(dot(rayDir, uSunDir), 0.0);
    vec3 mistCol = mix(uSkyHorizon * 1.05, uSunColor * 1.45, pow(sunCos, 4.0) * 0.65);
    finalCol = mix(finalCol, mistCol, mist * (1.0 - exp(-linearD * 0.025)));
  }

  fragColor = vec4(finalCol, 1.0);
  // Populate hdrFBO depth buffer with exact opaque depth for Pass 4 transparent FX!
  gl_FragDepth = rawDepth;
}
`;
