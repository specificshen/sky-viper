export const BLOOM_EXTRACT_FRAG = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uHdrTex;
uniform float uThreshold;

void main() {
  vec3 col = texture(uHdrTex, vUv).rgb;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float knee = 0.45;
  float soft = luma - uThreshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.00001);
  float contrib = max(soft, luma - uThreshold) / max(luma, 0.0001);
  vec3 bright = col * max(contrib, 0.0);
  // Clamp extreme spikes so bloom stays silky & cinema-grade
  bright = min(bright, vec3(8.0));
  fragColor = vec4(bright, 1.0);
}
`;

export const BLOOM_BLUR_FRAG = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uDirection;

void main() {
  // 9-tap Gaussian separable blur
  vec3 sum = texture(uTex, vUv).rgb * 0.2270270270;
  sum += texture(uTex, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uTex, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
  sum += texture(uTex, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
  sum += texture(uTex, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(sum, 1.0);
}
`;

export const TONEMAP_FRAG = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uHdrTex;
uniform sampler2D uBloomTex;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uEnableBloom;

// Fitted ACES Filmic Tone Mapping (Stephen Hill / Krzysztof Narkowicz refined)
vec3 acesFilm(vec3 x) {
  const mat3 acesIn = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  const mat3 acesOut = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
  );
  vec3 v = acesIn * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(acesOut * (a / b), 0.0, 1.0);
}

void main() {
  vec3 hdr = texture(uHdrTex, vUv).rgb;
  if (uEnableBloom > 0.5) {
    vec3 bloom = texture(uBloomTex, vUv).rgb;
    hdr += bloom * uBloomStrength;
  }

  hdr *= uExposure;
  vec3 color = acesFilm(hdr);

  // Subtle cinematic edge vignette (keeps center crisp, frames wide sky)
  vec2 q = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(q, q) * 0.075;
  color *= clamp(vig, 0.85, 1.0);

  // Linear -> sRGB encoding
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  // Micro triangular dither to eliminate any 8-bit sky gradient banding
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color += dither / 255.0;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
