import { ATMOSPHERE_GLSL } from './atmosphere.glsl';

export const FULLSCREEN_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const CLOUDS_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform vec3 uCameraPos;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2 uResolution;
uniform int uFrameIndex;

uniform sampler3D uShapeNoise;
uniform sampler3D uDetailNoise;
uniform sampler2D uWeatherMap;
uniform sampler2D uSceneDepth;

uniform float uCloudBottom;
uniform float uCloudTop;
uniform float uEarthRadius;
uniform float uCloudDensity;
uniform vec3 uCloudTopColor;
uniform vec3 uCloudBottomColor;
uniform float uCloudAmbientStrength;
uniform float uAerialFogDensity;

uniform int uRaySteps;
uniform int uLightSteps;
uniform float uEnableDetail;

${ATMOSPHERE_GLSL}

const float WEATHER_SCALE = 1.0 / 24000.0;
const float SHAPE_SCALE = 1.0 / 2550.0;
const float DETAIL_SCALE = 1.0 / 430.0;
const vec2 WIND_VEL = vec2(18.0, 11.0);

float remap(float v, float oldMin, float oldMax, float newMin, float newMax) {
  return newMin + (v - oldMin) / max(0.0001, (oldMax - oldMin)) * (newMax - newMin);
}

// Low-discrepancy screen-space jitter
float ign(vec2 fragCoord) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

// Precision-safe curved-Earth altitude along ray (zero float32 R^2 cancellation)
float curvedAltitude(vec3 p, vec3 origin) {
  vec2 d = p.xz - origin.xz;
  float horizSq = dot(d, d);
  return p.y + horizSq / (2.0 * uEarthRadius);
}

// Precision-safe ray intersection with curved-Earth altitude shell H
vec2 intersectCurvedAlt(float originY, float dirY, float H) {
  float A = max(1e-12, (1.0 - dirY * dirY) / (2.0 * uEarthRadius));
  float B = dirY;
  float C = originY - H;
  float disc = B * B - 4.0 * A * C;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2((-B - s) / (2.0 * A), (-B + s) / (2.0 * A));
}

float getLinearSceneDistance(vec2 uv, vec3 viewRayDir) {
  float rawDepth = texture(uSceneDepth, uv).r;
  if (rawDepth >= 0.99999) return 1e9;
  float ndcZ = rawDepth * 2.0 - 1.0;
  float viewZ = (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - ndcZ * (uCameraFar - uCameraNear));
  return viewZ / max(0.0001, -viewRayDir.z);
}

// Sculpted volumetric cumulus density: crisp billowing cauliflower crowns, flat bases, wispy edges!
float sampleCloudDensity(vec3 pos, float heightFrac, bool useDetail) {
  if (heightFrac <= 0.0 || heightFrac >= 1.0) return 0.0;

  vec2 wind = WIND_VEL * uTime;
  vec2 weatherUv = (pos.xz + wind * 0.45) * WEATHER_SCALE;
  vec4 weather = texture(uWeatherMap, weatherUv);

  float coverage = clamp(weather.r * (0.48 + 0.65 * uCloudDensity), 0.0, 1.0);
  if (coverage < 0.04) return 0.0;

  float cloudType = weather.g;
  float maxH = mix(0.36, 0.98, cloudType);
  float heightGrad = smoothstep(0.0, 0.075, heightFrac) *
                     smoothstep(maxH, max(0.14, maxH - 0.36), heightFrac);
  if (heightGrad <= 0.001) return 0.0;

  vec3 shapePos = pos + vec3(wind.x + heightFrac * 240.0, 0.0, wind.y + heightFrac * 130.0);
  vec4 shape = texture(uShapeNoise, vec3(shapePos.x, shapePos.y * 1.08, shapePos.z) * SHAPE_SCALE);

  float lowFreqFbm = shape.g * 0.625 + shape.b * 0.25 + shape.a * 0.125;
  float baseCloud = clamp(remap(shape.r, (1.0 - lowFreqFbm) * 0.43, 1.0, 0.0, 1.0), 0.0, 1.0);
  baseCloud *= heightGrad;

  float threshold = 1.0 - coverage * 0.92;
  float cloud = clamp(remap(baseCloud, threshold * 0.72, 1.0, 0.0, 1.0), 0.0, 1.0);
  if (cloud <= 0.001) return 0.0;

  // Crisp high-frequency 3D detail Worley erosion carving authentic cauliflower puffs & wispy bases!
  if (useDetail && uEnableDetail > 0.5) {
    vec3 detailPos = pos + vec3(wind.x * 1.35, -uTime * 4.0, wind.y * 1.35);
    vec4 det = texture(uDetailNoise, detailPos * DETAIL_SCALE);
    float highFreqFbm = det.r * 0.625 + det.g * 0.25 + det.b * 0.125;
    float detailMod = mix(highFreqFbm, 1.0 - highFreqFbm, clamp(heightFrac * 4.2, 0.0, 1.0));
    float erosion = detailMod * 0.40 * (1.0 - cloud * 0.32);
    cloud = clamp(remap(cloud, erosion, 1.0, 0.0, 1.0), 0.0, 1.0);
  }

  float density = cloud * smoothstep(0.0, 0.11, heightFrac) * (0.74 + 0.48 * weather.b);
  return density * uCloudDensity;
}

// Tight 5-tap exponentially spaced sun march for crisp billow relief & self-shadowing
float marchSunOpticalDepth(vec3 pos, vec3 camOrigin) {
  float thickness = uCloudTop - uCloudBottom;
  const float offsets[5] = float[5](28.0, 80.0, 185.0, 385.0, 720.0);
  const float weights[5] = float[5](40.0, 78.0, 142.0, 240.0, 365.0);

  float opticalDepth = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= uLightSteps) break;
    vec3 p = pos + uSunDir * offsets[i];
    float alt = curvedAltitude(p, camOrigin);
    float h = (alt - uCloudBottom) / thickness;
    if (h >= 1.0 || h <= 0.0) break;
    float d = sampleCloudDensity(p, h, i < 2);
    opticalDepth += d * weights[i];
  }
  return opticalDepth;
}

void main() {
  vec4 clipPos = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  vec3 viewRay = normalize(viewPos.xyz / viewPos.w);
  vec3 rayDir = normalize((uInvView * vec4(viewRay, 0.0)).xyz);
  vec3 rayOrigin = uCameraPos;

  float sceneDist = getLinearSceneDistance(vUv, viewRay);
  float thickness = uCloudTop - uCloudBottom;
  float camAlt = rayOrigin.y;

  vec2 hitBot = intersectCurvedAlt(camAlt, rayDir.y, uCloudBottom);
  vec2 hitTop = intersectCurvedAlt(camAlt, rayDir.y, uCloudTop);

  float tStart = 0.0;
  float tEnd = 0.0;

  if (camAlt < uCloudBottom) {
    if (hitBot.y > 0.0 && hitTop.y > 0.0) {
      tStart = hitBot.y;
      tEnd = hitTop.y;
    }
  } else if (camAlt > uCloudTop) {
    if (hitTop.x > 0.0 && hitTop.y > hitTop.x) {
      tStart = hitTop.x;
      tEnd = (hitBot.x > hitTop.x) ? hitBot.x : hitTop.y;
    }
  } else {
    tStart = 0.0;
    if (hitBot.x > 0.0) {
      tEnd = hitBot.x;
    } else if (hitTop.y > 0.0) {
      tEnd = hitTop.y;
    }
  }

  float maxMarchDist = 38000.0;
  tEnd = min(tEnd, maxMarchDist);
  tEnd = min(tEnd, sceneDist);

  if (tEnd <= tStart + 0.25) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Dual-lobe Henyey-Greenstein phase: intense silver-lining forward scatter + radiant back-scatter
  float cosTheta = dot(rayDir, uSunDir);
  float phase0 = mix(hgPhase(cosTheta, 0.78), hgPhase(cosTheta, -0.24), 0.34);
  float phase1 = mix(hgPhase(cosTheta, 0.40), 0.25 / 3.14159265, 0.45);
  float phase2 = 0.25 / 3.14159265;

  const float SIGMA_T = 0.0195;

  vec3 scatteredLight = vec3(0.0);
  float transmittance = 1.0;
  float weightedDist = 0.0;
  float weightSum = 0.0;

  float jitter = ign(gl_FragCoord.xy);
  bool isNearScene = (sceneDist < 260.0);

  // Calibrated deterministic geometric step schedule guaranteed to reach full 38km horizon cleanly
  // inside exact uRaySteps budget on ALL quality presets (Low/Med/High/Ultra), with adaptive
  // half-step refinement on cloud entry to eliminate edge stipple on thin sunlit wisps!
  int maxSteps = isNearScene ? min(uRaySteps, 20) : uRaySteps;
  float stepsF = float(maxSteps);
  float minStep = isNearScene ? max(0.85, (tEnd - tStart) / stepsF) : (2100.0 / stepsF);
  float growthRate = isNearScene ? 0.01 : clamp(5.3 / stepsF, 0.060, 0.140);

  float t = tStart + jitter * minStep;
  bool inCloud = false;

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps || t >= tEnd || transmittance < 0.016) break;

    float baseStep = max(minStep, (t - tStart) * growthRate);
    float stepSize = inCloud ? max(minStep * 0.9, baseStep * 0.62) : baseStep;
    if (t + stepSize > tEnd) {
      stepSize = max(0.05, tEnd - t);
    }

    vec3 samplePos = rayOrigin + rayDir * (t + stepSize * 0.5);
    float alt = curvedAltitude(samplePos, rayOrigin);
    float h = (alt - uCloudBottom) / thickness;

    float density = sampleCloudDensity(samplePos, h, t < 16000.0);

    // First-hit backtrack refinement: if we jumped into a thin cloud edge on a coarse empty-air step,
    // step back half a step and re-integrate finely so thin wispy fringes stay silky smooth!
    if (density > 0.0018 && !inCloud && stepSize > minStep * 1.45) {
      inCloud = true;
      t = max(tStart, t - stepSize * 0.35);
      continue;
    }

    if (density > 0.0018) {
      inCloud = true;
      float optDepth = marchSunOpticalDepth(samplePos, rayOrigin) * SIGMA_T;

      // Multi-scattering 3-octave shading with rich crisp cauliflower self-shadowing!
      float ms0 = exp(-optDepth) * phase0;
      float ms1 = exp(-optDepth * 0.34) * phase1 * 0.60;
      float ms2 = exp(-optDepth * 0.12) * phase2 * 0.36;

      // Sculptural Beer-powder micro-crevice detail (crisp billow depth, clean sky-blue shadow floor)
      float powder = 1.0 - exp(-optDepth * 2.4);
      float powderTerm = mix(1.0, clamp(powder * 1.50, 0.54, 1.22), 0.44 * (1.0 - max(0.0, cosTheta)));

      vec3 directLight = uSunColor * uSunIntensity * (ms0 * powderTerm + ms1 + ms2) * 2.95;

      float heightShade = smoothstep(0.04, 0.80, h);
      float sunWrap = exp(-optDepth * 0.28);
      vec3 topAmb = mix(uSkyHorizon * 0.62, uCloudTopColor * 1.08, 0.62);
      vec3 ambientCol = mix(uCloudBottomColor, topAmb, heightShade);
      float ao = mix(0.56, 1.0, heightShade) * mix(0.76, 1.0, exp(-density * 1.8));
      vec3 ambientLight = ambientCol * uCloudAmbientStrength * ao * (0.72 + 0.28 * sunWrap);

      vec3 luminance = (directLight + ambientLight) * uCloudTopColor;

      // Energy-conserving analytical step integration
      float extinction = density * SIGMA_T;
      float stepTrans = exp(-extinction * stepSize);
      vec3 integScatt = luminance * (1.0 - stepTrans);

      scatteredLight += transmittance * integScatt;

      float w = transmittance * (1.0 - stepTrans);
      weightedDist += t * w;
      weightSum += w;

      transmittance *= stepTrans;
    } else {
      inCloud = false;
    }

    t += stepSize;
  }

  // Smooth aerial perspective blending distant cumulus seamlessly into the cerulean horizon
  if (weightSum > 0.0001) {
    float avgDist = weightedDist / weightSum;
    float fogT = 1.0 - exp(-avgDist * uAerialFogDensity);
    vec3 horizonSky = computeAtmosphereSky(rayDir, false);
    float opacity = 1.0 - transmittance;
    scatteredLight = mix(scatteredLight, horizonSky * opacity, clamp(fogT * 0.82, 0.0, 0.88));
  }

  fragColor = vec4(scatteredLight, transmittance);
}
`;
