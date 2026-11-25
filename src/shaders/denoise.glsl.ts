export const DENOISE_FRAG = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uCloudTex;
uniform sampler2D uSceneDepth;
uniform vec2 uTexelSize;
uniform float uCameraNear;
uniform float uCameraFar;

float linearizeDepth(float d) {
  if (d >= 0.99999) return 1e6;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - ndc * (uCameraFar - uCameraNear));
}

void main() {
  vec4 center = texture(uCloudTex, vUv);
  float centerD = linearizeDepth(texture(uSceneDepth, vUv).r);

  vec4 sum = center * 2.4;
  float wSum = 2.4;

  // Tight 3x3 depth-preserving edge filter: removes micro-dither while preserving razor-crisp
  // cumulus cauliflower puffs and fighter jet silhouettes!
  const vec2 offsets[8] = vec2[8](
    vec2(-1.0,  0.0), vec2( 1.0,  0.0), vec2( 0.0, -1.0), vec2( 0.0,  1.0),
    vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0), vec2( 1.0,  1.0)
  );
  const float spatialW[8] = float[8](
    1.5, 1.5, 1.5, 1.5,
    0.85, 0.85, 0.85, 0.85
  );

  for (int i = 0; i < 8; i++) {
    vec2 uv = vUv + offsets[i] * uTexelSize;
    float d = linearizeDepth(texture(uSceneDepth, uv).r);
    float relDiff = abs(d - centerD) / max(min(d, centerD), 2.0);
    float depthW = exp(-relDiff * 12.0);
    vec4 s = texture(uCloudTex, uv);
    float transDiff = abs(s.a - center.a);
    float rangeW = exp(-transDiff * 1.8);
    float w = spatialW[i] * depthW * rangeW;
    sum += s * w;
    wSum += w;
  }

  fragColor = sum / max(wSum, 0.0001);
}
`;
