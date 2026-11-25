import * as THREE from 'three';
import { CLOUD_LAYER_BOTTOM, CLOUD_LAYER_THICKNESS } from '../core/presets';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function remap(v: number, oldMin: number, oldMax: number, newMin: number, newMax: number): number {
  return newMin + ((v - oldMin) / (oldMax - oldMin)) * (newMax - newMin);
}

class TileablePerlin3D {
  private readonly gradX: Float32Array;
  private readonly gradY: Float32Array;
  private readonly gradZ: Float32Array;
  private readonly period: number;

  constructor(period: number, seed: number) {
    this.period = period;
    const count = period * period * period;
    this.gradX = new Float32Array(count);
    this.gradY = new Float32Array(count);
    this.gradZ = new Float32Array(count);
    const rng = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      this.gradX[i] = s * Math.cos(theta);
      this.gradY[i] = s * Math.sin(theta);
      this.gradZ[i] = u;
    }
  }

  private dot(ix: number, iy: number, iz: number, dx: number, dy: number, dz: number): number {
    const p = this.period;
    const x = ((ix % p) + p) % p;
    const y = ((iy % p) + p) % p;
    const z = ((iz % p) + p) % p;
    const idx = (z * p + y) * p + x;
    return this.gradX[idx] * dx + this.gradY[idx] * dy + this.gradZ[idx] * dz;
  }

  sample(nx: number, ny: number, nz: number): number {
    const p = this.period;
    const x = nx * p;
    const y = ny * p;
    const z = nz * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);

    const n000 = this.dot(x0, y0, z0, fx, fy, fz);
    const n100 = this.dot(x0 + 1, y0, z0, fx - 1, fy, fz);
    const n010 = this.dot(x0, y0 + 1, z0, fx, fy - 1, fz);
    const n110 = this.dot(x0 + 1, y0 + 1, z0, fx - 1, fy - 1, fz);
    const n001 = this.dot(x0, y0, z0 + 1, fx, fy, fz - 1);
    const n101 = this.dot(x0 + 1, y0, z0 + 1, fx - 1, fy, fz - 1);
    const n011 = this.dot(x0, y0 + 1, z0 + 1, fx, fy - 1, fz - 1);
    const n111 = this.dot(x0 + 1, y0 + 1, z0 + 1, fx - 1, fy - 1, fz - 1);

    const nx00 = lerp(n000, n100, u);
    const nx10 = lerp(n010, n110, u);
    const nx01 = lerp(n001, n101, u);
    const nx11 = lerp(n011, n111, u);
    const nxy0 = lerp(nx00, nx10, v);
    const nxy1 = lerp(nx01, nx11, v);
    return clamp(lerp(nxy0, nxy1, w) * 0.78 + 0.5, 0, 1);
  }
}

class TileableWorley3D {
  private readonly ptsX: Float32Array;
  private readonly ptsY: Float32Array;
  private readonly ptsZ: Float32Array;
  private readonly cells: number;

  constructor(cells: number, seed: number) {
    this.cells = cells;
    const total = cells * cells * cells;
    this.ptsX = new Float32Array(total);
    this.ptsY = new Float32Array(total);
    this.ptsZ = new Float32Array(total);
    const rng = mulberry32(seed);
    for (let i = 0; i < total; i++) {
      this.ptsX[i] = 0.08 + rng() * 0.84;
      this.ptsY[i] = 0.08 + rng() * 0.84;
      this.ptsZ[i] = 0.08 + rng() * 0.84;
    }
  }

  sampleInverted(nx: number, ny: number, nz: number): number {
    const c = this.cells;
    const x = nx * c;
    const y = ny * c;
    const z = nz * c;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const cz = Math.floor(z);
    const fx = x - cx;
    const fy = y - cy;
    const fz = z - cz;

    let minDistSq = 10.0;
    for (let dz = -1; dz <= 1; dz++) {
      const wz = (((cz + dz) % c) + c) % c;
      const zOff = wz * c;
      for (let dy = -1; dy <= 1; dy++) {
        const wy = (((cy + dy) % c) + c) % c;
        const yzOff = (zOff + wy) * c;
        for (let dx = -1; dx <= 1; dx++) {
          const wx = (((cx + dx) % c) + c) % c;
          const idx = yzOff + wx;
          const px = dx + this.ptsX[idx] - fx;
          const py = dy + this.ptsY[idx] - fy;
          const pz = dz + this.ptsZ[idx] - fz;
          const d2 = px * px + py * py + pz * pz;
          if (d2 < minDistSq) minDistSq = d2;
        }
      }
    }
    return clamp(1.0 - Math.sqrt(minDistSq), 0, 1);
  }
}

class TileablePerlin2D {
  private readonly gx: Float32Array;
  private readonly gy: Float32Array;
  private readonly period: number;

  constructor(period: number, seed: number) {
    this.period = period;
    const count = period * period;
    this.gx = new Float32Array(count);
    this.gy = new Float32Array(count);
    const rng = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  private dot(ix: number, iy: number, dx: number, dy: number): number {
    const p = this.period;
    const x = ((ix % p) + p) % p;
    const y = ((iy % p) + p) % p;
    const idx = y * p + x;
    return this.gx[idx] * dx + this.gy[idx] * dy;
  }

  sample(nx: number, ny: number): number {
    const p = this.period;
    const x = nx * p;
    const y = ny * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fade(fx);
    const v = fade(fy);
    const n00 = this.dot(x0, y0, fx, fy);
    const n10 = this.dot(x0 + 1, y0, fx - 1, fy);
    const n01 = this.dot(x0, y0 + 1, fx, fy - 1);
    const n11 = this.dot(x0 + 1, y0 + 1, fx - 1, fy - 1);
    return clamp(lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 0.78 + 0.5, 0, 1);
  }
}

export interface CloudTextureSet {
  shapeTexture: THREE.Data3DTexture;
  detailTexture: THREE.Data3DTexture;
  weatherTexture: THREE.DataTexture;
  shapeSize: number;
  weatherSize: number;
  shapeData: Uint8Array;
  weatherData: Uint8Array;
  sampleDensityAtWorldPos: (
    worldPos: THREE.Vector3,
    timeSec: number,
    cloudDensityScale: number
  ) => number;
  dispose: () => void;
}

// Sculpted distinct cumulus clusters (2.5-6 km wide) with wide blue-sky valleys & sparkling ocean between them!
export const WEATHER_WORLD_SCALE = 1 / 24000;
export const SHAPE_WORLD_SCALE = 1 / 2550;
export const WIND_VEL_X = 18.0;
export const WIND_VEL_Z = 11.0;

export function generateCloudTextures(): CloudTextureSet {
  const shapeSize = 64;
  const detailSize = 32;
  const weatherSize = 256;

  // 1. 3D Base Shape Noise (64^3 RGBA): crisp billowy cauliflower Perlin-Worley + 3 Worley octaves
  const p4 = new TileablePerlin3D(4, 101);
  const p8 = new TileablePerlin3D(8, 202);
  const p16 = new TileablePerlin3D(16, 303);
  const w4 = new TileableWorley3D(4, 404);
  const w8 = new TileableWorley3D(8, 505);
  const w16 = new TileableWorley3D(16, 606);

  const shapeData = new Uint8Array(shapeSize * shapeSize * shapeSize * 4);
  let ptr = 0;
  for (let z = 0; z < shapeSize; z++) {
    const nz = z / shapeSize;
    for (let y = 0; y < shapeSize; y++) {
      const ny = y / shapeSize;
      for (let x = 0; x < shapeSize; x++) {
        const nx = x / shapeSize;
        const perlinFbm =
          p4.sample(nx, ny, nz) * 0.52 +
          p8.sample(nx, ny, nz) * 0.31 +
          p16.sample(nx, ny, nz) * 0.17;
        const g = w4.sampleInverted(nx, ny, nz);
        const b = w8.sampleInverted(nx, ny, nz);
        const a = w16.sampleInverted(nx, ny, nz);
        const worleyFbm = g * 0.625 + b * 0.25 + a * 0.125;
        // Blend Perlin + inverted Worley for sculpted rounded cumulus lobes with deep crevices
        const perlinWorley = clamp(perlinFbm * 0.42 + worleyFbm * 0.58, 0, 1);

        shapeData[ptr++] = Math.round(perlinWorley * 255);
        shapeData[ptr++] = Math.round(g * 255);
        shapeData[ptr++] = Math.round(b * 255);
        shapeData[ptr++] = Math.round(a * 255);
      }
    }
  }

  const shapeTexture = new THREE.Data3DTexture(shapeData, shapeSize, shapeSize, shapeSize);
  shapeTexture.format = THREE.RGBAFormat;
  shapeTexture.type = THREE.UnsignedByteType;
  shapeTexture.minFilter = THREE.LinearFilter;
  shapeTexture.magFilter = THREE.LinearFilter;
  shapeTexture.wrapS = THREE.RepeatWrapping;
  shapeTexture.wrapT = THREE.RepeatWrapping;
  shapeTexture.wrapR = THREE.RepeatWrapping;
  shapeTexture.unpackAlignment = 1;
  shapeTexture.needsUpdate = true;

  // 2. 3D Detail Erosion Noise (32^3 RGBA): crisp high-frequency cauliflower billows & wispy edges
  const dw4 = new TileableWorley3D(4, 707);
  const dw8 = new TileableWorley3D(8, 808);
  const dw14 = new TileableWorley3D(14, 909);
  const dp6 = new TileablePerlin3D(6, 1010);

  const detailData = new Uint8Array(detailSize * detailSize * detailSize * 4);
  ptr = 0;
  for (let z = 0; z < detailSize; z++) {
    const nz = z / detailSize;
    for (let y = 0; y < detailSize; y++) {
      const ny = y / detailSize;
      for (let x = 0; x < detailSize; x++) {
        const nx = x / detailSize;
        detailData[ptr++] = Math.round(dw4.sampleInverted(nx, ny, nz) * 255);
        detailData[ptr++] = Math.round(dw8.sampleInverted(nx, ny, nz) * 255);
        detailData[ptr++] = Math.round(dw14.sampleInverted(nx, ny, nz) * 255);
        detailData[ptr++] = Math.round(dp6.sample(nx, ny, nz) * 255);
      }
    }
  }

  const detailTexture = new THREE.Data3DTexture(detailData, detailSize, detailSize, detailSize);
  detailTexture.format = THREE.RGBAFormat;
  detailTexture.type = THREE.UnsignedByteType;
  detailTexture.minFilter = THREE.LinearFilter;
  detailTexture.magFilter = THREE.LinearFilter;
  detailTexture.wrapS = THREE.RepeatWrapping;
  detailTexture.wrapT = THREE.RepeatWrapping;
  detailTexture.wrapR = THREE.RepeatWrapping;
  detailTexture.unpackAlignment = 1;
  detailTexture.needsUpdate = true;

  // 3. 2D Weather / Coverage / Cloud Type / Cirrus Map (256x256 RGBA)
  // Carefully sculpted so ~45-55% of the sky is vibrant blue ocean/sky canyons and
  // ~45-55% forms dramatic distinct towering cumulus islands & cloud streets!
  const c2a = new TileablePerlin2D(3, 2111);
  const c2b = new TileablePerlin2D(6, 2212);
  const c2c = new TileablePerlin2D(12, 2313);
  const c2d = new TileablePerlin2D(24, 2414);
  const t2a = new TileablePerlin2D(4, 2515);
  const t2b = new TileablePerlin2D(9, 2616);
  const cirA = new TileablePerlin2D(5, 2717);
  const cirB = new TileablePerlin2D(11, 2818);
  const cirC = new TileablePerlin2D(22, 2919);

  const weatherData = new Uint8Array(weatherSize * weatherSize * 4);
  ptr = 0;
  for (let y = 0; y < weatherSize; y++) {
    const v = y / weatherSize;
    for (let x = 0; x < weatherSize; x++) {
      const u = x / weatherSize;

      const warpX = (t2a.sample(u, v) - 0.5) * 0.14;
      const warpY = (t2b.sample(u + 0.37, v + 0.61) - 0.5) * 0.14;
      const wu = u + warpX;
      const wv = v + warpY;

      const rawCov =
        c2a.sample(wu, wv) * 0.42 +
        c2b.sample(wu, wv) * 0.32 +
        c2c.sample(wu, wv) * 0.17 +
        c2d.sample(wu, wv) * 0.09;

      // Crisp isolated cumulus banks & dramatic sky canyons (0 below 0.44 -> clear sunny sky!)
      const coverage = clamp(remap(rawCov, 0.44, 0.78, 0.0, 1.0), 0, 1);

      // Tall dramatic cumulus towers rising out of denser cloud cores
      const rawType = t2a.sample(u + 0.19, v + 0.43) * 0.55 + t2b.sample(u, v) * 0.45;
      const cloudType = clamp(remap(rawType * 0.5 + coverage * 0.65, 0.22, 0.90, 0.22, 1.0), 0, 1);

      // Moisture / optical thickness
      const moisture = clamp(c2b.sample(u + 0.53, v + 0.21) * 0.55 + coverage * 0.45, 0.25, 1.0);

      // Wind-swept high-altitude wispy cirrus streaks
      const cu = u * 1.0 + (cirA.sample(u, v) - 0.5) * 0.18;
      const cv = v * 2.2 + (cirB.sample(u + 0.4, v) - 0.5) * 0.12;
      const cirrusRaw =
        cirA.sample(cu, cv * 0.5) * 0.48 +
        cirB.sample(cu * 1.0, cv) * 0.34 +
        cirC.sample(cu * 1.0, cv * 1.5) * 0.18;
      const cirrus = clamp(remap(cirrusRaw, 0.50, 0.86, 0.0, 1.0), 0, 1);

      weatherData[ptr++] = Math.round(coverage * 255);
      weatherData[ptr++] = Math.round(cloudType * 255);
      weatherData[ptr++] = Math.round(moisture * 255);
      weatherData[ptr++] = Math.round(cirrus * 255);
    }
  }

  const weatherTexture = new THREE.DataTexture(weatherData, weatherSize, weatherSize, THREE.RGBAFormat);
  weatherTexture.minFilter = THREE.LinearFilter;
  weatherTexture.magFilter = THREE.LinearFilter;
  weatherTexture.wrapS = THREE.RepeatWrapping;
  weatherTexture.wrapT = THREE.RepeatWrapping;
  weatherTexture.unpackAlignment = 1;
  weatherTexture.needsUpdate = true;

  const sampleWeatherCPU = (wx: number, wz: number): [number, number, number] => {
    let u = (wx * WEATHER_WORLD_SCALE) % 1;
    let v = (wz * WEATHER_WORLD_SCALE) % 1;
    if (u < 0) u += 1;
    if (v < 0) v += 1;
    const ix = Math.floor(u * weatherSize) % weatherSize;
    const iy = Math.floor(v * weatherSize) % weatherSize;
    const idx = (iy * weatherSize + ix) * 4;
    return [weatherData[idx] / 255, weatherData[idx + 1] / 255, weatherData[idx + 2] / 255];
  };

  const sampleShapeCPU = (wx: number, wy: number, wz: number): [number, number, number, number] => {
    let u = (wx * SHAPE_WORLD_SCALE) % 1;
    let v = (wy * SHAPE_WORLD_SCALE) % 1;
    let w = (wz * SHAPE_WORLD_SCALE) % 1;
    if (u < 0) u += 1;
    if (v < 0) v += 1;
    if (w < 0) w += 1;
    const ix = Math.floor(u * shapeSize) % shapeSize;
    const iy = Math.floor(v * shapeSize) % shapeSize;
    const iz = Math.floor(w * shapeSize) % shapeSize;
    const idx = ((iz * shapeSize + iy) * shapeSize + ix) * 4;
    return [
      shapeData[idx] / 255,
      shapeData[idx + 1] / 255,
      shapeData[idx + 2] / 255,
      shapeData[idx + 3] / 255,
    ];
  };

  const smoothstep = (e0: number, e1: number, x: number): number => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const sampleDensityAtWorldPos = (
    worldPos: THREE.Vector3,
    timeSec: number,
    cloudDensityScale: number
  ): number => {
    const h = (worldPos.y - CLOUD_LAYER_BOTTOM) / CLOUD_LAYER_THICKNESS;
    if (h <= 0.0 || h >= 1.0) return 0.0;

    const windX = timeSec * WIND_VEL_X;
    const windZ = timeSec * WIND_VEL_Z;
    const [rawCov, cloudType, moisture] = sampleWeatherCPU(
      worldPos.x + windX * 0.45,
      worldPos.z + windZ * 0.45
    );

    const coverage = clamp(rawCov * (0.48 + 0.65 * cloudDensityScale), 0, 1);
    if (coverage < 0.05) return 0.0;

    const maxH = lerp(0.32, 0.98, cloudType);
    const heightGrad =
      smoothstep(0.0, 0.08, h) * smoothstep(maxH, Math.max(0.12, maxH - 0.36), h);
    if (heightGrad <= 0.001) return 0.0;

    const [pw, w1, w2, w3] = sampleShapeCPU(
      worldPos.x + windX + h * 260,
      worldPos.y * 1.15,
      worldPos.z + windZ + h * 140
    );
    const lowFreqFbm = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
    let baseCloud = clamp(remap(pw, (1.0 - lowFreqFbm) * 0.45, 1.0, 0.0, 1.0), 0, 1);
    baseCloud *= heightGrad;

    const threshold = 1.0 - coverage * 0.92;
    let density = clamp(remap(baseCloud, threshold * 0.72, 1.0, 0.0, 1.0), 0, 1);
    density *= smoothstep(0.0, 0.10, h) * (0.72 + 0.48 * moisture) * cloudDensityScale;
    return clamp(density, 0, 1);
  };

  return {
    shapeTexture,
    detailTexture,
    weatherTexture,
    shapeSize,
    weatherSize,
    shapeData,
    weatherData,
    sampleDensityAtWorldPos,
    dispose: () => {
      shapeTexture.dispose();
      detailTexture.dispose();
      weatherTexture.dispose();
    },
  };
}
