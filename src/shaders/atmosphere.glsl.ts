// Shared physically-inspired Rayleigh + Mie atmospheric sky & high-altitude cirrus GLSL utilities
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform float uCameraAlt;
uniform float uCirrusStrength;
uniform float uTime;

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(0.0001, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));
}

// Physically-inspired vibrant Rayleigh + Mie atmospheric sky with seamless horizon transition
vec3 computeAtmosphereSky(vec3 rayDir, bool includeSunDisc) {
  float y = rayDir.y;
  float altFactor = clamp(uCameraAlt / 12000.0, 0.0, 1.0);

  // Zenith deepens into rich cobalt-indigo as aircraft climbs toward stratosphere
  vec3 zenithCol = mix(uSkyZenith, uSkyZenith * vec3(0.28, 0.42, 0.68), altFactor * 0.85);
  vec3 horizonCol = mix(uSkyHorizon, uSkyHorizon * vec3(0.84, 0.90, 1.0), altFactor * 0.35);

  float elev = max(y, 0.0);
  float rayleighT = pow(1.0 - elev, 4.0);
  vec3 sky = mix(zenithCol, horizonCol, rayleighT);

  // Luminous atmospheric scattering glow hugging the horizon seamlessly (no dark gap!)
  float horizonGlow = exp(-abs(y) * 16.0);
  sky += horizonCol * horizonGlow * 0.14;

  // Below horizon: stay seamlessly matched to horizon fog down to -0.05 rad, then gently deepen
  if (y < -0.025) {
    float belowT = smoothstep(-0.025, -0.35, y);
    sky = mix(sky, uSkyGround, belowT * 0.85);
  }

  // Sun Mie forward scattering halo & aureole
  float sunCos = dot(rayDir, uSunDir);
  float sunElev = max(uSunDir.y, 0.0);
  float sunsetBoost = 1.0 + pow(1.0 - sunElev, 3.0) * 1.45;

  float mieWide = pow(max(sunCos, 0.0), 7.0) * 0.24 * sunsetBoost;
  float mieTight = pow(max(sunCos, 0.0), 72.0) * 0.62;
  float mieCore = pow(max(sunCos, 0.0), 560.0) * 1.65;
  sky += uSunColor * (mieWide + mieTight + mieCore) * smoothstep(-0.18, 0.06, y);

  if (includeSunDisc) {
    float sunDisc = smoothstep(0.99935, 0.99980, sunCos);
    sky += uSunColor * uSunIntensity * 6.5 * sunDisc * smoothstep(-0.04, 0.015, y);
  }

  return sky;
}

// High-altitude wispy cirrus streaks at y = 8200m
vec3 blendCirrusLayer(vec3 skyCol, vec3 rayOrigin, vec3 rayDir, sampler2D weatherMap) {
  if (uCirrusStrength <= 0.01) return skyCol;
  float cirrusAlt = 8200.0;
  float dy = rayDir.y;
  float altDiff = cirrusAlt - rayOrigin.y;
  if ((altDiff > 0.0 && dy <= 0.025) || (altDiff < 0.0 && dy >= -0.025)) {
    return skyCol;
  }
  float t = altDiff / dy;
  if (t <= 0.0 || t > 180000.0) return skyCol;

  vec3 hit = rayOrigin + rayDir * t;
  vec2 uv1 = hit.xz * 0.000018 + vec2(uTime * 0.00042, uTime * 0.00016);
  vec2 uv2 = hit.xz * 0.000046 + vec2(-uTime * 0.00024, uTime * 0.00032);

  float c1 = texture(weatherMap, uv1).a;
  float c2 = texture(weatherMap, uv2).a;
  float wisps = smoothstep(0.32, 0.88, c1 * 0.70 + c2 * 0.45);
  float fade = smoothstep(0.025, 0.22, abs(dy)) * exp(-t * 0.000015);
  float alpha = clamp(wisps * uCirrusStrength * fade * 0.65, 0.0, 0.58);

  float sunCos = dot(rayDir, uSunDir);
  float silver = pow(max(sunCos, 0.0), 10.0) * 0.75 + 0.35;
  vec3 cirrusCol = mix(uSkyHorizon * 1.1, uSunColor * 1.45, clamp(silver, 0.0, 1.0));
  return mix(skyCol, cirrusCol, alpha);
}
`;
