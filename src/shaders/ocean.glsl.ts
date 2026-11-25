import { ATMOSPHERE_GLSL } from './atmosphere.glsl';

export const OCEAN_VERT = /* glsl */ `
out vec3 vWorldPos;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const OCEAN_FRAG = /* glsl */ `
precision highp float;

in vec3 vWorldPos;
out vec4 fragColor;

uniform vec3 uCameraPos;
uniform sampler2D uWeatherMap;
uniform vec3 uOceanDeepColor;
uniform vec3 uOceanShallowColor;
uniform float uCloudDensity;
uniform float uAerialFogDensity;

${ATMOSPHERE_GLSL}

const float WEATHER_SCALE = 1.0 / 24000.0;
const vec2 WIND_VEL = vec2(18.0, 11.0);

// Fast smooth 2D value noise for animated ocean swells & ripples
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float waveHeight(vec2 p, float distFade) {
  float t = uTime;
  float h = 0.0;
  h += vnoise(p * 0.008 + vec2(t * 0.14, t * 0.09)) * 0.55;
  h += vnoise(p * 0.023 - vec2(t * 0.21, -t * 0.16)) * 0.28 * distFade;
  h += vnoise(p * 0.068 + vec2(-t * 0.34, t * 0.28)) * 0.14 * distFade * distFade;
  return h;
}

void main() {
  vec3 toFrag = vWorldPos - uCameraPos;
  float dist = length(toFrag);
  vec3 viewDir = toFrag / max(dist, 0.001);

  // Distance anti-aliasing for wave normals so far ocean never shimmers
  float distFade = exp(-dist * 0.00018);
  float eps = mix(6.5, 1.4, distFade);

  float hC = waveHeight(vWorldPos.xz, distFade);
  float hX = waveHeight(vWorldPos.xz + vec2(eps, 0.0), distFade);
  float hZ = waveHeight(vWorldPos.xz + vec2(0.0, eps), distFade);

  float normalStrength = mix(0.28, 1.35, distFade);
  vec3 normal = normalize(vec3((hC - hX) * normalStrength, 1.0, (hC - hZ) * normalStrength));

  // Project sun ray from ocean point up to cumulus deck (y = 2100m) for soft cloud shadows!
  float cloudAlt = 2100.0;
  vec2 shadowOffset = uSunDir.xz / max(uSunDir.y, 0.14) * cloudAlt;
  vec2 wind = WIND_VEL * uTime * 0.45;
  vec2 weatherUv = (vWorldPos.xz + shadowOffset + wind) * WEATHER_SCALE;
  float cloudCov = texture(uWeatherMap, weatherUv).r * clamp(uCloudDensity, 0.2, 1.4);
  float cloudShadow = 1.0 - smoothstep(0.26, 0.78, cloudCov) * 0.68;

  // Schlick Fresnel reflection of physically-based sky
  float ndotv = max(dot(normal, -viewDir), 0.001);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndotv, 5.0);

  vec3 reflDir = reflect(viewDir, normal);
  reflDir.y = max(reflDir.y, 0.015);
  vec3 skyRefl = computeAtmosphereSky(reflDir, false);

  // Deep ocean diffuse body color with sunlit teal scatter
  float ndotl = max(dot(normal, uSunDir), 0.0);
  vec3 waterBody = mix(uOceanDeepColor, uOceanShallowColor, pow(1.0 - ndotv, 2.0) * 0.45 + ndotl * 0.35);
  waterBody *= (0.45 + 0.55 * cloudShadow);

  // Crisp sparkling solar glitter path on ocean waves
  vec3 halfVec = normalize(uSunDir - viewDir);
  float ndoth = max(dot(normal, halfVec), 0.0);
  float specBroad = pow(ndoth, 64.0) * 0.35;
  float specTight = pow(ndoth, 420.0) * 3.8;
  vec3 sunGlint = uSunColor * uSunIntensity * (specBroad + specTight) * cloudShadow;

  vec3 oceanCol = mix(waterBody, skyRefl * (0.62 + 0.38 * cloudShadow), clamp(fresnel * 0.88 + 0.08, 0.0, 0.94));
  oceanCol += sunGlint;

  // Smooth exponential aerial perspective into exact atmospheric horizon sky (ZERO horizon seam!)
  float horizonFog = 1.0 - exp(-dist * uAerialFogDensity * 1.25);
  float edgeFade = smoothstep(55000.0, 125000.0, dist);
  vec3 horizonSky = computeAtmosphereSky(vec3(viewDir.x, max(viewDir.y, -0.004), viewDir.z), false);
  oceanCol = mix(oceanCol, horizonSky, clamp(max(horizonFog, edgeFade), 0.0, 1.0));

  fragColor = vec4(oceanCol, 1.0);
}
`;
