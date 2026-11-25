import * as THREE from 'three';
import type { StealthFighter } from '../scene/stealthFighter';

/**
 * Custom GLSL3 Mach-Diamond Afterburner Plume Shader:
 * Produces pulsing standing shock diamonds, incandescent blue-white core,
 * warm orange-violet plasma outer cone, and turbulent flickering tail.
 */
function createAfterburnerMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 0.7 },
      uAfterburner: { value: 0.4 },
      uCloudAtten: { value: 1.0 },
      uIsCore: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      out vec2 vUv;
      out vec3 vNormalDir;
      out vec3 vViewDir;

      uniform float uTime;
      uniform float uAfterburner;

      void main() {
        vUv = uv;
        // Subtle high-frequency supersonic exhaust shimmer near tip
        vec3 pos = position;
        float tipFactor = pow(uv.y, 1.5);
        float flutter = sin(uTime * 55.0 + pos.z * 8.0) * 0.025 * tipFactor * (0.4 + uAfterburner);
        pos.x += flutter;
        pos.y += cos(uTime * 48.0 + pos.z * 7.0) * 0.025 * tipFactor * (0.4 + uAfterburner);

        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vNormalDir = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      in vec2 vUv;
      in vec3 vNormalDir;
      in vec3 vViewDir;
      out vec4 fragColor;

      uniform float uTime;
      uniform float uThrottle;
      uniform float uAfterburner;
      uniform float uCloudAtten;
      uniform float uIsCore;

      void main() {
        // vUv.y: 0.0 at nozzle exit -> 1.0 at flame tip
        float t = vUv.y;
        float ndotv = abs(dot(normalize(vNormalDir), normalize(vViewDir)));
        // Soft cylindrical edges so cone never looks like hard polygon geometry
        float edgeFade = pow(clamp(ndotv, 0.0, 1.0), uIsCore > 0.5 ? 1.2 : 1.75);

        // Standing Mach shock diamonds pulsing slightly with supersonic exhaust oscillation
        float pulse = sin(uTime * 62.0) * 0.08 + sin(uTime * 97.0) * 0.05;
        float diamondWave = 0.5 + 0.5 * cos((t * 7.5 - pulse * 0.35) * 6.283185);
        float diamonds = pow(diamondWave, 4.5) * smoothstep(0.02, 0.14, t) * (1.0 - smoothstep(0.55, 0.96, t));

        // High-speed turbulent plasma streaks
        float streak = 0.82 + 0.18 * sin(vUv.x * 25.13 + uTime * 38.0 - t * 18.0);
        float flicker = 0.92 + 0.08 * sin(uTime * 78.0 + t * 12.0);

        // Axial fade from intense nozzle throat to soft tip
        float axial = smoothstep(0.0, 0.05, t) * pow(max(0.0, 1.0 - t), uIsCore > 0.5 ? 1.15 : 1.45);

        // Rich high-contrast jet plasma palette preserving fiery orange-amber & electric violet under ACES Filmic!
        vec3 throatCol = mix(vec3(0.45, 0.52, 2.2), vec3(0.95, 0.45, 2.55), uAfterburner);
        vec3 midCol = mix(vec3(2.2, 0.58, 0.08), vec3(3.6, 0.92, 0.12), uAfterburner);
        vec3 tailCol = vec3(2.1, 0.32, 0.04);
        vec3 diamondCol = vec3(3.8, 2.35, 1.25);

        vec3 col = mix(throatCol, midCol, smoothstep(0.05, 0.36, t));
        col = mix(col, tailCol, smoothstep(0.42, 0.92, t));
        col += diamondCol * diamonds * (1.15 + uAfterburner * 2.65) * (uIsCore > 0.5 ? 1.55 : 0.78);

        float power = (0.36 + uThrottle * 0.78 + uAfterburner * 2.55) * flicker * streak;
        float alpha = axial * edgeFade * power * uCloudAtten;

        if (uIsCore > 0.5) {
          col *= 1.35;
          alpha *= 0.96;
        } else {
          alpha *= 0.84;
        }

        fragColor = vec4(col * clamp(alpha, 0.0, 1.9), clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}

/**
 * Builds a tapered open exhaust cone pointing along +Z from z = 0 to z = 1
 * with UV.y = 0 at nozzle and UV.y = 1 at tip.
 */
function createPlumeConeGeometry(rStart: number, rEnd: number, length: number): THREE.BufferGeometry {
  const segsR = 20;
  const segsZ = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= segsZ; iz++) {
    const v = iz / segsZ;
    const z = v * length;
    // Slight realistic plume expansion then pinch taper
    const bulge = Math.sin(v * Math.PI) * 0.08 * rStart;
    const r = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(v, 0.85)) + bulge;
    for (let ir = 0; ir <= segsR; ir++) {
      const u = ir / segsR;
      const a = u * Math.PI * 2;
      positions.push(Math.cos(a) * r, Math.sin(a) * r * 0.72, z);
      uvs.push(u, v);
    }
    if (iz > 0) {
      const prev = (iz - 1) * (segsR + 1);
      const curr = iz * (segsR + 1);
      for (let ir = 0; ir < segsR; ir++) {
        indices.push(prev + ir, curr + ir, prev + ir + 1);
        indices.push(prev + ir + 1, curr + ir, curr + ir + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Dynamic world-space wingtip vortex condensation ribbon trail
 */
class WingtipRibbon {
  public readonly mesh: THREE.Mesh;
  private readonly maxPts = 64;
  private readonly centers: THREE.Vector3[] = [];
  private readonly rights: THREE.Vector3[] = [];
  private readonly strengths: number[] = [];
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private initialized = false;

  constructor() {
    for (let i = 0; i < this.maxPts; i++) {
      this.centers.push(new THREE.Vector3());
      this.rights.push(new THREE.Vector3(1, 0, 0));
      this.strengths.push(0);
    }

    this.positions = new Float32Array(this.maxPts * 2 * 3);
    this.alphas = new Float32Array(this.maxPts * 2);
    const uvs = new Float32Array(this.maxPts * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i < this.maxPts; i++) {
      const v = i / (this.maxPts - 1);
      uvs[i * 4 + 0] = 0;
      uvs[i * 4 + 1] = v;
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = v;
      if (i < this.maxPts - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aStrength', new THREE.BufferAttribute(this.alphas, 1));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geo.setIndex(indices);

    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0.96, 0.98, 1.0) },
      },
      vertexShader: /* glsl */ `
        in float aStrength;
        out vec2 vUv;
        out float vStrength;
        void main() {
          vUv = uv;
          vStrength = aStrength;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        in float vStrength;
        out vec4 fragColor;
        uniform vec3 uColor;
        void main() {
          // Soft wispy core across ribbon width and smooth dissipation downstream
          float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
          across = pow(clamp(across, 0.0, 1.0), 1.8);
          float along = smoothstep(0.0, 0.05, vUv.y) * pow(max(0.0, 1.0 - vUv.y), 1.55);
          float alpha = across * along * vStrength * 0.58;
          if (alpha < 0.002) discard;
          fragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  public reset(worldPos: THREE.Vector3): void {
    for (let i = 0; i < this.maxPts; i++) {
      this.centers[i].copy(worldPos);
      this.strengths[i] = 0;
    }
    this.initialized = true;
  }

  public update(
    tipWorldPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    strength: number,
    tintColor: THREE.Color
  ): void {
    if (!this.initialized) {
      this.reset(tipWorldPos);
    }

    // Shift trail history back
    for (let i = this.maxPts - 1; i > 0; i--) {
      this.centers[i].copy(this.centers[i - 1]);
      this.strengths[i] = this.strengths[i - 1] * 0.985;
    }
    this.centers[0].copy(tipWorldPos);
    this.strengths[0] = strength;

    const tangent = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i < this.maxPts; i++) {
      const c = this.centers[i];
      if (i < this.maxPts - 1) {
        tangent.subVectors(c, this.centers[i + 1]);
      } else {
        tangent.subVectors(this.centers[i - 1], c);
      }
      if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, -1);
      tangent.normalize();

      toCam.subVectors(cameraPos, c).normalize();
      side.crossVectors(tangent, toCam);
      if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
      side.normalize();

      // Ribbon expands gently as vortex diffuses downstream
      const age = i / (this.maxPts - 1);
      const halfWidth = (0.09 + age * 0.58) * (0.55 + this.strengths[i] * 0.85);

      const idx = i * 6;
      this.positions[idx + 0] = c.x - side.x * halfWidth;
      this.positions[idx + 1] = c.y - side.y * halfWidth;
      this.positions[idx + 2] = c.z - side.z * halfWidth;
      this.positions[idx + 3] = c.x + side.x * halfWidth;
      this.positions[idx + 4] = c.y + side.y * halfWidth;
      this.positions[idx + 5] = c.z + side.z * halfWidth;

      this.alphas[i * 2 + 0] = this.strengths[i];
      this.alphas[i * 2 + 1] = this.strengths[i];
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aStrength.needsUpdate = true;
    this.mat.uniforms.uColor.value.copy(tintColor);
  }

  public dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * Builds high-G over-wing LEX condensation vapor clouds & cloud-piercing volumetric mist rush!
 */
export class FlightEffects {
  public readonly group = new THREE.Group();

  private readonly abOuterMat: THREE.ShaderMaterial;
  private readonly abCoreMat: THREE.ShaderMaterial;
  private readonly leftPlumeGroup = new THREE.Group();
  private readonly rightPlumeGroup = new THREE.Group();

  private readonly leftTrail = new WingtipRibbon();
  private readonly rightTrail = new WingtipRibbon();

  private readonly lexVaporMat: THREE.ShaderMaterial;
  private readonly lexVaporGroup = new THREE.Group();

  private readonly mistMat: THREE.ShaderMaterial;
  private readonly mistGroup = new THREE.Group();
  private readonly mistPlanes: { mesh: THREE.Mesh; offset: THREE.Vector3; speed: number; baseScale: number }[] = [];

  private readonly tmpWorldLeft = new THREE.Vector3();
  private readonly tmpWorldRight = new THREE.Vector3();
  private readonly tmpTint = new THREE.Color();

  constructor(fighter: StealthFighter) {
    // 1. Twin Afterburner Mach-Diamond Plumes (mounted on fighter.fxRoot!)
    const outerGeo = createPlumeConeGeometry(0.36, 0.04, 1.0);
    const coreGeo = createPlumeConeGeometry(0.22, 0.02, 1.0);

    this.abOuterMat = createAfterburnerMaterial();
    this.abCoreMat = createAfterburnerMaterial();
    this.abCoreMat.uniforms.uIsCore.value = 1.0;

    const buildPlume = (target: THREE.Group, localPos: THREE.Vector3) => {
      target.position.copy(localPos);
      target.add(new THREE.Mesh(outerGeo, this.abOuterMat));
      target.add(new THREE.Mesh(coreGeo, this.abCoreMat));
      fighter.fxRoot.add(target);
    };
    buildPlume(this.leftPlumeGroup, fighter.leftEngineLocal);
    buildPlume(this.rightPlumeGroup, fighter.rightEngineLocal);

    // 2. Wingtip Vortex Condensation Ribbons (world space)
    this.group.add(this.leftTrail.mesh, this.rightTrail.mesh);

    // 3. Over-Wing High-G LEX Condensation Vapor Clouds (mounted on fighter.fxRoot)
    this.lexVaporMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uTint: { value: new THREE.Color(0.97, 0.98, 1.0) },
      },
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uTint;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          if (uIntensity < 0.01) discard;
          // Fast supersonic airflow streaks scrolling aft over the swept wings
          vec2 flowUv = vec2(vUv.x * 4.2, vUv.y * 2.8 - uTime * 9.5);
          float n = noise(flowUv) * 0.6 + noise(flowUv * 2.3 + vec2(1.7, -uTime * 6.0)) * 0.4;

          // Sculpt soft triangular aerodynamic condensation sheet
          float maskX = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.35, vUv.x);
          float maskY = smoothstep(0.0, 0.22, vUv.y) * pow(max(0.0, 1.0 - vUv.y), 1.3);
          float wisp = smoothstep(0.24, 0.85, n) * maskX * maskY;
          float alpha = clamp(wisp * uIntensity * 0.72, 0.0, 0.78);
          if (alpha < 0.005) discard;
          fragColor = vec4(uTint, alpha);
        }
      `,
    });

    // Multi-layered curved condensation sheets hugging left & right LERX and upper wings
    const vaporGeo = new THREE.PlaneGeometry(4.6, 6.2, 8, 8);
    vaporGeo.rotateX(-Math.PI / 2);
    // Arch the sheet gently over the fuselage/wing contour
    const vPos = vaporGeo.attributes.position;
    for (let i = 0; i < vPos.count; i++) {
      const vx = vPos.getX(i);
      const vz = vPos.getZ(i);
      const arch = Math.max(0, 1 - (vx * vx) / 6.5) * 0.36;
      vPos.setY(i, arch + (vz + 3.1) * 0.03);
    }
    vaporGeo.computeVertexNormals();

    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 2; layer++) {
        const sheet = new THREE.Mesh(vaporGeo, this.lexVaporMat);
        sheet.position.set(side * (2.55 + layer * 0.35), 0.24 + layer * 0.16, 1.15);
        sheet.rotation.z = -side * (0.07 + layer * 0.05);
        sheet.rotation.y = side * 0.22;
        this.lexVaporGroup.add(sheet);
      }
    }
    fighter.fxRoot.add(this.lexVaporGroup);

    // 4. Organic Cloud-Pierce Wispy Vapor Tendrils (noisy scrolling condensation curling past wings, NEVER speed lines!)
    this.mistMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0.95, 0.98, 1.0) },
      },
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;

        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          if (uOpacity < 0.004) discard;
          vec2 p = vUv * 2.0 - 1.0;
          float rad = 1.0 - dot(p, p);
          if (rad <= 0.0) discard;
          float n = vnoise(vUv * 4.5 + vec2(0.0, -uTime * 3.8)) * 0.65 +
                    vnoise(vUv * 9.5 + vec2(2.3, -uTime * 7.2)) * 0.35;
          float puff = pow(rad, 2.4) * smoothstep(0.28, 0.85, n);
          float alpha = puff * uOpacity * 0.14;
          if (alpha < 0.003) discard;
          fragColor = vec4(uColor, alpha);
        }
      `,
    });

    const mistGeo = new THREE.PlaneGeometry(5.5, 9.5);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(mistGeo, this.mistMat);
      const angle = (i / 18) * Math.PI * 2 + (i % 5) * 0.45;
      const radius = 3.8 + ((i * 17) % 10) * 1.1;
      const zOff = -26 + ((i * 23) % 52);
      const offset = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.65, zOff);
      const baseScale = 0.85 + (i % 4) * 0.35;
      m.scale.set(baseScale, baseScale, 1);
      this.mistGroup.add(m);
      this.mistPlanes.push({
        mesh: m,
        offset,
        speed: 0.72 + (i % 4) * 0.18,
        baseScale,
      });
    }
    this.group.add(this.mistGroup);
  }

  public resetTrails(fighter: StealthFighter): void {
    fighter.root.updateMatrixWorld();
    this.tmpWorldLeft.copy(fighter.leftWingtipLocal).applyMatrix4(fighter.root.matrixWorld);
    this.tmpWorldRight.copy(fighter.rightWingtipLocal).applyMatrix4(fighter.root.matrixWorld);
    this.leftTrail.reset(this.tmpWorldLeft);
    this.rightTrail.reset(this.tmpWorldRight);
  }

  public update(params: {
    fighter: StealthFighter;
    camera: THREE.PerspectiveCamera;
    dt: number;
    timeSec: number;
    speedMs: number;
    throttle: number;
    afterburner: number;
    gForce: number;
    aoaDeg: number;
    cloudDensityAtJet: number;
    cloudAtten: number;
    sunColor: THREE.Color;
    cloudTopColor: THREE.Color;
  }): void {
    const {
      fighter,
      camera,
      dt,
      timeSec,
      speedMs,
      throttle,
      afterburner,
      gForce,
      aoaDeg,
      cloudDensityAtJet,
      cloudAtten,
      sunColor,
      cloudTopColor,
    } = params;

    // 1. Afterburner plume scaling & Mach diamond shader uniforms
    const plumeLen = 1.85 + throttle * 2.8 + afterburner * 7.6;
    const plumeRad = 0.88 + throttle * 0.26 + afterburner * 0.46;
    this.leftPlumeGroup.scale.set(plumeRad, plumeRad, plumeLen);
    this.rightPlumeGroup.scale.set(plumeRad, plumeRad, plumeLen);

    for (const mat of [this.abOuterMat, this.abCoreMat]) {
      mat.uniforms.uTime.value = timeSec;
      mat.uniforms.uThrottle.value = throttle;
      mat.uniforms.uAfterburner.value = afterburner;
      mat.uniforms.uCloudAtten.value = cloudAtten;
    }

    // 2. Wingtip condensation vortices (boosted by high G, AoA, and cloud moisture!)
    fighter.root.updateMatrixWorld();
    this.tmpWorldLeft.copy(fighter.leftWingtipLocal).applyMatrix4(fighter.root.matrixWorld);
    this.tmpWorldRight.copy(fighter.rightWingtipLocal).applyMatrix4(fighter.root.matrixWorld);

    const gExcess = Math.max(0, Math.abs(gForce) - 1.25) / 4.2;
    const humidBoost = Math.min(1.0, cloudDensityAtJet * 2.4);
    const speedFactor = THREE.MathUtils.clamp((speedMs - 110) / 220, 0.15, 1.0);
    const trailStrength = THREE.MathUtils.clamp(
      (0.18 + gExcess * 0.85 + humidBoost * 0.78) * speedFactor,
      0,
      1.0
    );

    this.tmpTint.copy(cloudTopColor).lerp(sunColor, 0.22);
    this.leftTrail.update(this.tmpWorldLeft, camera.position, trailStrength, this.tmpTint);
    this.rightTrail.update(this.tmpWorldRight, camera.position, trailStrength, this.tmpTint);

    // 3. High-G Over-Wing LEX Vapor Condensation Clouds
    const highG = THREE.MathUtils.clamp((Math.abs(gForce) - 1.9) / 3.8, 0, 1);
    const highAoa = THREE.MathUtils.clamp((Math.abs(aoaDeg) - 5.0) / 12.0, 0, 1);
    const vaporIntensity = THREE.MathUtils.clamp(
      Math.max(highG * 0.95, highAoa * 0.75, cloudDensityAtJet * 1.65) * speedFactor,
      0,
      1.0
    );
    this.lexVaporMat.uniforms.uTime.value = timeSec;
    this.lexVaporMat.uniforms.uIntensity.value = vaporIntensity;
    this.lexVaporMat.uniforms.uTint.value.copy(this.tmpTint);

    // 4. Organic Cloud-Pierce Wispy Vapor Tendrils
    const mistStrength = THREE.MathUtils.clamp(cloudDensityAtJet * 2.4, 0, 1.0);
    this.mistMat.uniforms.uTime.value = timeSec;
    this.mistMat.uniforms.uOpacity.value = mistStrength;
    this.mistMat.uniforms.uColor.value.copy(this.tmpTint);
    this.mistGroup.visible = mistStrength > 0.01;

    if (this.mistGroup.visible) {
      this.mistGroup.position.copy(fighter.root.position);
      this.mistGroup.quaternion.copy(fighter.root.quaternion);
      this.mistGroup.updateMatrixWorld();

      const flowStep = Math.max(55, speedMs * 0.36) * dt;
      for (const item of this.mistPlanes) {
        item.offset.z += flowStep * item.speed;
        if (item.offset.z > 26) {
          item.offset.z -= 52;
        }
        item.mesh.position.copy(item.offset);
        item.mesh.lookAt(camera.position);
      }
    }
  }

  public dispose(): void {
    this.abOuterMat.dispose();
    this.abCoreMat.dispose();
    this.leftTrail.dispose();
    this.rightTrail.dispose();
    this.lexVaporMat.dispose();
    this.mistMat.dispose();
  }
}
