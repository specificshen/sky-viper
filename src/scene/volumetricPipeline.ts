import * as THREE from 'three';
import {
  CLOUD_LAYER_BOTTOM,
  CLOUD_LAYER_TOP,
  EARTH_RADIUS,
  getSunDirection,
} from '../core/presets';
import type { LightingPreset, QualityProfile } from '../core/types';
import type { CloudTextureSet } from './cloudTextures';
import { CLOUDS_FRAG, FULLSCREEN_VERT } from '../shaders/clouds.glsl';
import { DENOISE_FRAG } from '../shaders/denoise.glsl';
import { COMPOSITE_FRAG } from '../shaders/composite.glsl';
import { BLOOM_BLUR_FRAG, BLOOM_EXTRACT_FRAG, TONEMAP_FRAG } from '../shaders/post.glsl';

export class VolumetricPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly quadScene: THREE.Scene;
  private readonly quadCamera: THREE.OrthographicCamera;
  private readonly quadMesh: THREE.Mesh;

  private sceneFBO: THREE.WebGLRenderTarget;
  private cloudFBO: THREE.WebGLRenderTarget;
  private cloudDenoiseFBO: THREE.WebGLRenderTarget;
  private hdrFBO: THREE.WebGLRenderTarget;
  private bloomFBO_A: THREE.WebGLRenderTarget;
  private bloomFBO_B: THREE.WebGLRenderTarget;

  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly denoiseMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  private readonly bloomExtractMat: THREE.ShaderMaterial;
  private readonly bloomBlurMat: THREE.ShaderMaterial;
  private readonly tonemapMat: THREE.ShaderMaterial;

  private width = 1280;
  private height = 720;
  private cloudWidth = 640;
  private cloudHeight = 360;
  private frameIndex = 0;

  private readonly invProj = new THREE.Matrix4();
  private readonly invView = new THREE.Matrix4();

  constructor(
    renderer: THREE.WebGLRenderer,
    textures: CloudTextureSet,
    preset: LightingPreset,
    quality: QualityProfile
  ) {
    this.renderer = renderer;

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    this.sceneFBO = this.createSceneFBO(this.width, this.height);
    this.cloudWidth = Math.max(160, Math.round(this.width * quality.cloudScale));
    this.cloudHeight = Math.max(90, Math.round(this.height * quality.cloudScale));
    this.cloudFBO = this.createColorFBO(this.cloudWidth, this.cloudHeight);
    this.cloudDenoiseFBO = this.createColorFBO(this.cloudWidth, this.cloudHeight);
    this.hdrFBO = this.createHdrFBO(this.width, this.height);
    const bw = Math.max(160, Math.round(this.width * 0.25));
    const bh = Math.max(90, Math.round(this.height * 0.25));
    this.bloomFBO_A = this.createColorFBO(bw, bh);
    this.bloomFBO_B = this.createColorFBO(bw, bh);

    const sunDir = getSunDirection(preset);

    this.cloudMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: CLOUDS_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uCameraNear: { value: 0.4 },
        uCameraFar: { value: 120000 },
        uResolution: { value: new THREE.Vector2(this.cloudWidth, this.cloudHeight) },
        uFrameIndex: { value: 0 },
        uShapeNoise: { value: textures.shapeTexture },
        uDetailNoise: { value: textures.detailTexture },
        uWeatherMap: { value: textures.weatherTexture },
        uSceneDepth: { value: this.sceneFBO.depthTexture },
        uCloudBottom: { value: CLOUD_LAYER_BOTTOM },
        uCloudTop: { value: CLOUD_LAYER_TOP },
        uEarthRadius: { value: EARTH_RADIUS },
        uCloudDensity: { value: 0.92 },
        uCloudTopColor: { value: preset.cloudTopColor.clone() },
        uCloudBottomColor: { value: preset.cloudBottomColor.clone() },
        uCloudAmbientStrength: { value: preset.cloudAmbientStrength },
        uAerialFogDensity: { value: preset.aerialFogDensity },
        uRaySteps: { value: quality.raySteps },
        uLightSteps: { value: quality.lightSteps },
        uEnableDetail: { value: quality.enableDetailNoise ? 1.0 : 0.0 },
        uSunDir: { value: sunDir.clone() },
        uSunColor: { value: preset.sunColor.clone() },
        uSunIntensity: { value: preset.sunIntensity },
        uSkyZenith: { value: preset.skyZenith.clone() },
        uSkyHorizon: { value: preset.skyHorizon.clone() },
        uSkyGround: { value: preset.skyGround.clone() },
        uCameraAlt: { value: 2250 },
        uCirrusStrength: { value: preset.cirrusStrength },
        uTime: { value: 0 },
      },
    });

    this.denoiseMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: DENOISE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCloudTex: { value: this.cloudFBO.texture },
        uSceneDepth: { value: this.sceneFBO.depthTexture },
        uTexelSize: { value: new THREE.Vector2(1 / this.cloudWidth, 1 / this.cloudHeight) },
        uCameraNear: { value: 0.4 },
        uCameraFar: { value: 120000 },
      },
    });

    this.compositeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: true,
      uniforms: {
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uCameraNear: { value: 0.4 },
        uCameraFar: { value: 120000 },
        uCloudTexelSize: { value: new THREE.Vector2(1 / this.cloudWidth, 1 / this.cloudHeight) },
        uSceneColor: { value: this.sceneFBO.texture },
        uSceneDepth: { value: this.sceneFBO.depthTexture },
        uCloudTex: { value: this.cloudDenoiseFBO.texture },
        uWeatherMap: { value: textures.weatherTexture },
        uCloudImmersion: { value: 0 },
        uSunDir: { value: sunDir.clone() },
        uSunColor: { value: preset.sunColor.clone() },
        uSunIntensity: { value: preset.sunIntensity },
        uSkyZenith: { value: preset.skyZenith.clone() },
        uSkyHorizon: { value: preset.skyHorizon.clone() },
        uSkyGround: { value: preset.skyGround.clone() },
        uCameraAlt: { value: 2250 },
        uCirrusStrength: { value: preset.cirrusStrength },
        uTime: { value: 0 },
      },
    });

    this.bloomExtractMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_EXTRACT_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uHdrTex: { value: this.hdrFBO.texture },
        uThreshold: { value: preset.bloomThreshold },
      },
    });

    this.bloomBlurMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: this.bloomFBO_A.texture },
        uDirection: { value: new THREE.Vector2(1 / bw, 0) },
      },
    });

    this.tonemapMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: TONEMAP_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uHdrTex: { value: this.hdrFBO.texture },
        uBloomTex: { value: this.bloomFBO_A.texture },
        uExposure: { value: preset.exposure },
        uBloomStrength: { value: preset.bloomStrength },
        uEnableBloom: { value: quality.enableBloom ? 1.0 : 0.0 },
      },
    });

    this.quadMesh = new THREE.Mesh(quadGeo, this.cloudMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  private createSceneFBO(w: number, h: number): THREE.WebGLRenderTarget {
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.format = THREE.DepthFormat;
    depthTex.type = THREE.UnsignedIntType;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;

    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: depthTex,
    });
  }

  private createHdrFBO(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  private createColorFBO(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  public resize(width: number, height: number, quality: QualityProfile): void {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    const cw = Math.max(160, Math.round(w * quality.cloudScale));
    const ch = Math.max(90, Math.round(h * quality.cloudScale));
    const bw = Math.max(160, Math.round(w * 0.25));
    const bh = Math.max(90, Math.round(h * 0.25));

    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.sceneFBO.depthTexture?.dispose();
      this.sceneFBO.dispose();
      this.hdrFBO.dispose();
      this.bloomFBO_A.dispose();
      this.bloomFBO_B.dispose();

      this.sceneFBO = this.createSceneFBO(w, h);
      this.hdrFBO = this.createHdrFBO(w, h);
      this.bloomFBO_A = this.createColorFBO(bw, bh);
      this.bloomFBO_B = this.createColorFBO(bw, bh);

      this.cloudMat.uniforms.uSceneDepth.value = this.sceneFBO.depthTexture;
      this.denoiseMat.uniforms.uSceneDepth.value = this.sceneFBO.depthTexture;
      this.compositeMat.uniforms.uSceneColor.value = this.sceneFBO.texture;
      this.compositeMat.uniforms.uSceneDepth.value = this.sceneFBO.depthTexture;
      this.bloomExtractMat.uniforms.uHdrTex.value = this.hdrFBO.texture;
      this.tonemapMat.uniforms.uHdrTex.value = this.hdrFBO.texture;
      this.tonemapMat.uniforms.uBloomTex.value = this.bloomFBO_A.texture;
    }

    if (cw !== this.cloudWidth || ch !== this.cloudHeight) {
      this.cloudWidth = cw;
      this.cloudHeight = ch;
      this.cloudFBO.dispose();
      this.cloudDenoiseFBO.dispose();
      this.cloudFBO = this.createColorFBO(cw, ch);
      this.cloudDenoiseFBO = this.createColorFBO(cw, ch);

      this.cloudMat.uniforms.uResolution.value.set(cw, ch);
      this.denoiseMat.uniforms.uCloudTex.value = this.cloudFBO.texture;
      this.denoiseMat.uniforms.uTexelSize.value.set(1 / cw, 1 / ch);
      this.compositeMat.uniforms.uCloudTexelSize.value.set(1 / cw, 1 / ch);
    }

    this.applyQuality(quality);
  }

  public applyQuality(quality: QualityProfile): void {
    this.cloudMat.uniforms.uRaySteps.value = quality.raySteps;
    this.cloudMat.uniforms.uLightSteps.value = quality.lightSteps;
    this.cloudMat.uniforms.uEnableDetail.value = quality.enableDetailNoise ? 1.0 : 0.0;
    this.compositeMat.uniforms.uCloudTex.value = quality.enableDenoise
      ? this.cloudDenoiseFBO.texture
      : this.cloudFBO.texture;
    this.tonemapMat.uniforms.uEnableBloom.value = quality.enableBloom ? 1.0 : 0.0;
  }

  public applyPreset(preset: LightingPreset): void {
    const sunDir = getSunDirection(preset);
    for (const mat of [this.cloudMat, this.compositeMat]) {
      const u = mat.uniforms;
      u.uSunDir.value.copy(sunDir);
      u.uSunColor.value.copy(preset.sunColor);
      u.uSunIntensity.value = preset.sunIntensity;
      u.uSkyZenith.value.copy(preset.skyZenith);
      u.uSkyHorizon.value.copy(preset.skyHorizon);
      u.uSkyGround.value.copy(preset.skyGround);
      u.uCirrusStrength.value = preset.cirrusStrength;
    }
    const cu = this.cloudMat.uniforms;
    cu.uCloudTopColor.value.copy(preset.cloudTopColor);
    cu.uCloudBottomColor.value.copy(preset.cloudBottomColor);
    cu.uCloudAmbientStrength.value = preset.cloudAmbientStrength;
    cu.uAerialFogDensity.value = preset.aerialFogDensity;

    this.bloomExtractMat.uniforms.uThreshold.value = preset.bloomThreshold;
    this.tonemapMat.uniforms.uExposure.value = preset.exposure;
    this.tonemapMat.uniforms.uBloomStrength.value = preset.bloomStrength;
  }

  public render(
    opaqueScene: THREE.Scene,
    fxScene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    timeSec: number,
    cloudDensity: number,
    cloudImmersion: number,
    quality: QualityProfile
  ): void {
    this.frameIndex++;
    camera.updateMatrixWorld();
    this.invProj.copy(camera.projectionMatrixInverse);
    this.invView.copy(camera.matrixWorld);

    // PASS 1: Opaque 3D Scene (Sunlit Ocean + Stealth Fighter Jet + Cockpit) -> sceneFBO + DepthTexture
    this.renderer.setRenderTarget(this.sceneFBO);
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(opaqueScene, camera);

    // PASS 2: Raymarched Volumetric 3D Clouds with True Scene Depth Occlusion -> cloudFBO
    const cu = this.cloudMat.uniforms;
    cu.uInvProjection.value.copy(this.invProj);
    cu.uInvView.value.copy(this.invView);
    cu.uCameraPos.value.copy(camera.position);
    cu.uCameraNear.value = camera.near;
    cu.uCameraFar.value = camera.far;
    cu.uCameraAlt.value = Math.max(0, camera.position.y);
    cu.uTime.value = timeSec;
    cu.uCloudDensity.value = cloudDensity;
    cu.uFrameIndex.value = this.frameIndex;

    this.quadMesh.material = this.cloudMat;
    this.renderer.setRenderTarget(this.cloudFBO);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCamera);

    // PASS 2b: Edge-preserving depth-aware bilateral denoise -> cloudDenoiseFBO
    if (quality.enableDenoise) {
      this.denoiseMat.uniforms.uCameraNear.value = camera.near;
      this.denoiseMat.uniforms.uCameraFar.value = camera.far;
      this.quadMesh.material = this.denoiseMat;
      this.renderer.setRenderTarget(this.cloudDenoiseFBO);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    // PASS 3: Full-res Composite (Rayleigh/Mie Sky + Cirrus + Bilateral Clouds + Opaque Scene)
    // Writes gl_FragDepth = rawDepth into hdrFBO so Pass 4 transparent FX depth-test cleanly!
    const compU = this.compositeMat.uniforms;
    compU.uInvProjection.value.copy(this.invProj);
    compU.uInvView.value.copy(this.invView);
    compU.uCameraPos.value.copy(camera.position);
    compU.uCameraNear.value = camera.near;
    compU.uCameraFar.value = camera.far;
    compU.uCameraAlt.value = Math.max(0, camera.position.y);
    compU.uTime.value = timeSec;
    compU.uCloudImmersion.value = cloudImmersion;
    compU.uCloudTex.value = quality.enableDenoise
      ? this.cloudDenoiseFBO.texture
      : this.cloudFBO.texture;

    this.quadMesh.material = this.compositeMat;
    this.renderer.setRenderTarget(this.hdrFBO);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.quadScene, this.quadCamera);

    // PASS 4: Transparent Jet FX (Gold Reflective Canopy, Mach-Diamond Afterburners,
    // Wingtip Vortices, LEX High-G Vapor, Cloud-Pierce Mist Streaks) into hdrFBO
    this.renderer.autoClear = false;
    this.renderer.render(fxScene, camera);
    this.renderer.autoClear = true;

    // PASS 5a: Multi-pass HDR Bloom (Sun + Silver Lining + Afterburner Glare)
    if (quality.enableBloom) {
      const bw = this.bloomFBO_A.width;
      const bh = this.bloomFBO_A.height;

      this.quadMesh.material = this.bloomExtractMat;
      this.renderer.setRenderTarget(this.bloomFBO_A);
      this.renderer.render(this.quadScene, this.quadCamera);

      // Horizontal blur pass 1
      this.bloomBlurMat.uniforms.uTex.value = this.bloomFBO_A.texture;
      this.bloomBlurMat.uniforms.uDirection.value.set(1.4 / bw, 0);
      this.quadMesh.material = this.bloomBlurMat;
      this.renderer.setRenderTarget(this.bloomFBO_B);
      this.renderer.render(this.quadScene, this.quadCamera);

      // Vertical blur pass 1
      this.bloomBlurMat.uniforms.uTex.value = this.bloomFBO_B.texture;
      this.bloomBlurMat.uniforms.uDirection.value.set(0, 1.4 / bh);
      this.renderer.setRenderTarget(this.bloomFBO_A);
      this.renderer.render(this.quadScene, this.quadCamera);

      // Second wider Gaussian pass for dreamy cinematic solar halo
      this.bloomBlurMat.uniforms.uTex.value = this.bloomFBO_A.texture;
      this.bloomBlurMat.uniforms.uDirection.value.set(2.8 / bw, 0);
      this.renderer.setRenderTarget(this.bloomFBO_B);
      this.renderer.render(this.quadScene, this.quadCamera);

      this.bloomBlurMat.uniforms.uTex.value = this.bloomFBO_B.texture;
      this.bloomBlurMat.uniforms.uDirection.value.set(0, 2.8 / bh);
      this.renderer.setRenderTarget(this.bloomFBO_A);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    // PASS 5b: ACES Filmic Tone Mapping + Bloom Add + Vignette + sRGB -> Screen
    this.quadMesh.material = this.tonemapMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  public dispose(): void {
    this.sceneFBO.depthTexture?.dispose();
    this.sceneFBO.dispose();
    this.cloudFBO.dispose();
    this.cloudDenoiseFBO.dispose();
    this.hdrFBO.dispose();
    this.bloomFBO_A.dispose();
    this.bloomFBO_B.dispose();
    this.cloudMat.dispose();
    this.denoiseMat.dispose();
    this.compositeMat.dispose();
    this.bloomExtractMat.dispose();
    this.bloomBlurMat.dispose();
    this.tonemapMat.dispose();
    this.quadMesh.geometry.dispose();
  }
}
