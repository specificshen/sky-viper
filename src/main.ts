import * as THREE from 'three';
import './style.css';
import {
  LIGHTING_PRESETS,
  QUALITY_PROFILES,
  getSunDirection,
} from './core/presets';
import type {
  CameraMode,
  LightingPresetId,
  QualitySetting,
  ResolvedQuality,
  SimSettings,
} from './core/types';
import { generateCloudTextures } from './scene/cloudTextures';
import { SunlitOcean } from './scene/ocean';
import { buildSkyEnvironmentMap } from './scene/skyEnvMap';
import { StealthFighter } from './scene/stealthFighter';
import { VolumetricPipeline } from './scene/volumetricPipeline';
import { FlightEffects } from './effects/flightEffects';
import { FlightPhysics, type FlightInputState } from './flight/flightPhysics';
import { CameraRig } from './flight/cameraRig';
import { CockpitHudRenderer } from './ui/cockpitHud';
import { JetAudioEngine } from './audio/jetAudio';
import { OverlayUI } from './ui/overlayUI';

function detectGpuCapability(gl: WebGL2RenderingContext): {
  isSoftware: boolean;
  rendererLabel: string;
} {
  let raw = '';
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugExt) {
    raw = String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '');
  }
  if (!raw) {
    raw = String(gl.getParameter(gl.RENDERER) || 'WebGL2');
  }
  const isSoftware = /swiftshader|llvmpipe|software|softpipe|mesa offscreen/i.test(raw);
  const short = raw.length > 26 ? `${raw.slice(0, 25)}…` : raw;
  return {
    isSoftware,
    rendererLabel: isSoftware ? `SW WebGL (${short})` : short,
  };
}

function resolveQuality(setting: QualitySetting, isSoftware: boolean): ResolvedQuality {
  if (setting !== 'auto') return setting;
  return isSoftware ? 'low' : 'high';
}

function bootstrap(): void {
  const glCanvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  const gl = glCanvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    uiRoot.innerHTML =
      '<div style="padding:32px;color:#fff;font-family:sans-serif">WebGL2 is required for volumetric clouds.</div>';
    return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    context: gl,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // Handled cleanly in HDR Post ACES Filmic pass!

  const { isSoftware, rendererLabel } = detectGpuCapability(gl);

  const settings: SimSettings = {
    lighting: 'midday',
    cameraMode: 'chase',
    quality: 'auto',
    cloudDensity: 0.94,
    autopilot: true,
    mouseFlight: false,
    audioEnabled: false,
    uiHidden: false,
  };

  let resolvedQuality: ResolvedQuality = resolveQuality(settings.quality, isSoftware);
  let qualityProfile = QUALITY_PROFILES[resolvedQuality];
  let currentPreset = LIGHTING_PRESETS[settings.lighting];

  // Generate 3D Perlin-Worley shape noise, 3D detail erosion noise & 2D weather/cirrus textures
  const cloudTextures = generateCloudTextures();

  // Build Pass 1 Opaque Scene & Pass 4 Transparent FX Scene
  const opaqueScene = new THREE.Scene();
  const fxScene = new THREE.Scene();

  // Physically-aligned lighting on the stealth fighter airframe
  const sunLight = new THREE.DirectionalLight(currentPreset.sunColor, currentPreset.sunIntensity * 1.15);
  const hemiLight = new THREE.HemisphereLight(
    currentPreset.skyHorizon,
    currentPreset.cloudBottomColor,
    1.15
  );
  const rimBounceLight = new THREE.DirectionalLight(currentPreset.skyHorizon, 0.55);
  opaqueScene.add(sunLight, hemiLight, rimBounceLight);

  let envMapTex = buildSkyEnvironmentMap(renderer, currentPreset);
  opaqueScene.environment = envMapTex;

  const ocean = new SunlitOcean(cloudTextures.weatherTexture, currentPreset);
  opaqueScene.add(ocean.mesh);

  const fighter = new StealthFighter();
  opaqueScene.add(fighter.root);
  fxScene.add(fighter.fxRoot);

  const flightEffects = new FlightEffects(fighter);
  fxScene.add(flightEffects.group);

  const physics = new FlightPhysics(cloudTextures);
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
  const pipeline = new VolumetricPipeline(renderer, cloudTextures, currentPreset, qualityProfile);
  const hudRenderer = new CockpitHudRenderer(hudCanvas);
  const audioEngine = new JetAudioEngine();

  // Align fighter & trails on frame 0
  const initTel = physics.getTelemetry();
  fighter.updateVisuals({
    position: initTel.position,
    quaternion: initTel.quaternion,
    pitchCmd: 0,
    rollCmd: 0,
    yawCmd: 0,
    throttle: initTel.throttle,
    afterburner: initTel.afterburner,
    sunDir: getSunDirection(currentPreset),
    sunColor: currentPreset.sunColor,
    skyZenith: currentPreset.skyZenith,
    skyHorizon: currentPreset.skyHorizon,
    cloudAtten: 1.0,
  });
  flightEffects.resetTrails(fighter);

  const applyLightingPreset = (presetId: LightingPresetId) => {
    settings.lighting = presetId;
    currentPreset = LIGHTING_PRESETS[presetId];
    ocean.applyPreset(currentPreset);
    pipeline.applyPreset(currentPreset);

    sunLight.color.copy(currentPreset.sunColor);
    sunLight.intensity = currentPreset.sunIntensity * 1.18;
    hemiLight.color.copy(currentPreset.skyHorizon);
    hemiLight.groundColor.copy(currentPreset.cloudBottomColor);
    hemiLight.intensity = currentPreset.id === 'sunset' ? 0.95 : 1.18;
    rimBounceLight.color.copy(currentPreset.skyHorizon);

    envMapTex.dispose();
    envMapTex = buildSkyEnvironmentMap(renderer, currentPreset);
    opaqueScene.environment = envMapTex;
  };

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, qualityProfile.maxPixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    cameraRig.setAspect(w / h);
    pipeline.resize(Math.round(w * dpr), Math.round(h * dpr), qualityProfile);
    hudRenderer.resize(w, h, window.devicePixelRatio || 1);
  };

  const applyQualitySetting = (q: QualitySetting) => {
    settings.quality = q;
    resolvedQuality = resolveQuality(q, isSoftware);
    qualityProfile = QUALITY_PROFILES[resolvedQuality];
    handleResize();
  };

  const ui = new OverlayUI(uiRoot, settings, rendererLabel, resolvedQuality, {
    onLightingChange: (id) => {
      applyLightingPreset(id);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(`${LIGHTING_PRESETS[id].labelZh} · ${LIGHTING_PRESETS[id].labelEn}`);
    },
    onCameraChange: (mode) => {
      settings.cameraMode = mode;
      cameraRig.setMode(mode, fighter, physics.getTelemetry());
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      const names: Record<CameraMode, string> = {
        chase: '追踪视角 · Chase Cam',
        cockpit: '座舱视角 · Cockpit HUD',
        orbit: '环绕视角 · Orbit Cam',
      };
      ui.showToast(names[mode]);
    },
    onQualityChange: (q) => {
      applyQualitySetting(q);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(`画质 Quality: ${q.toUpperCase()} (${resolvedQuality.toUpperCase()})`);
    },
    onCloudDensityChange: (density) => {
      settings.cloudDensity = density;
    },
    onToggleAutopilot: () => {
      physics.autopilot = !physics.autopilot;
      settings.autopilot = physics.autopilot;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(physics.autopilot ? '自动巡航已开启 · Autopilot ON' : '手动驾驶 · Manual Control');
    },
    onToggleMouseFlight: () => {
      settings.mouseFlight = !settings.mouseFlight;
      if (settings.mouseFlight) {
        physics.autopilot = false;
        settings.autopilot = false;
      }
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(settings.mouseFlight ? '鼠标操控已开启 · Mouse Flight ON' : '鼠标操控已关闭');
    },
    onToggleAudio: () => {
      settings.audioEnabled = !settings.audioEnabled;
      audioEngine.setEnabled(settings.audioEnabled);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(settings.audioEnabled ? '引擎与气动音效已开启 · Audio ON' : '静音 · Audio Muted');
    },
    onDiveCloud: () => {
      physics.triggerCloudDive(12);
      settings.autopilot = true;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast('正在切入浓密积云层 · Diving into Cumulus');
    },
    onToggleHideUi: () => {
      settings.uiHidden = !settings.uiHidden;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
  });

  handleResize();
  window.addEventListener('resize', handleResize);

  // Input state
  const input: FlightInputState = {
    pitchUp: false,
    pitchDown: false,
    rollLeft: false,
    rollRight: false,
    yawLeft: false,
    yawRight: false,
    throttleUp: false,
    throttleDown: false,
    mouseActive: false,
    mouseX: 0,
    mouseY: 0,
  };

  let isDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  // Auto-enable Web Audio cleanly on first intentional flight/audio user action if requested
  const keyMap = (code: string, down: boolean) => {
    switch (code) {
      case 'KeyW':
      case 'ArrowDown':
        input.pitchDown = down;
        break;
      case 'KeyS':
      case 'ArrowUp':
        input.pitchUp = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        input.rollLeft = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.rollRight = down;
        break;
      case 'KeyQ':
        input.yawLeft = down;
        break;
      case 'KeyE':
        input.yawRight = down;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        input.throttleUp = down;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        input.throttleDown = down;
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat && ['Space', 'KeyC', 'KeyH', 'KeyM'].includes(e.code)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      physics.autopilot = !physics.autopilot;
      settings.autopilot = physics.autopilot;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(physics.autopilot ? '自动巡航已开启 · Autopilot ON' : '手动驾驶 · Manual Control');
      return;
    }
    if (e.code === 'KeyC') {
      const order: CameraMode[] = ['chase', 'cockpit', 'orbit'];
      const next = order[(order.indexOf(settings.cameraMode) + 1) % order.length];
      settings.cameraMode = next;
      cameraRig.setMode(next, fighter, physics.getTelemetry());
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(
        next === 'chase'
          ? '追踪视角 · Chase Cam'
          : next === 'cockpit'
            ? '座舱视角 · Cockpit HUD'
            : '环绕视角 · Orbit Cam'
      );
      return;
    }
    if (e.code === 'KeyH') {
      settings.uiHidden = !settings.uiHidden;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      return;
    }
    if (e.code === 'KeyM') {
      settings.audioEnabled = !settings.audioEnabled;
      audioEngine.setEnabled(settings.audioEnabled);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast(settings.audioEnabled ? '音效已开启 · Audio ON' : '音效已静音 · Audio OFF');
      return;
    }

    const wasAp = physics.autopilot;
    keyMap(e.code, true);
    if (
      wasAp &&
      (input.pitchUp ||
        input.pitchDown ||
        input.rollLeft ||
        input.rollRight ||
        input.yawLeft ||
        input.yawRight ||
        input.throttleUp ||
        input.throttleDown)
    ) {
      physics.autopilot = false;
      settings.autopilot = false;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
      ui.showToast('手动接管飞行 · Manual Control');
    }
  });

  window.addEventListener('keyup', (e) => {
    keyMap(e.code, false);
  });

  glCanvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (settings.mouseFlight) {
      input.mouseActive = true;
      input.mouseX = THREE.MathUtils.clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
      input.mouseY = THREE.MathUtils.clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
    } else {
      input.mouseActive = false;
      if (isDragging) {
        cameraRig.addPointerDrag(e.clientX - lastPointerX, e.clientY - lastPointerY);
      }
    }
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  });

  glCanvas.addEventListener(
    'wheel',
    (e) => {
      cameraRig.addWheelZoom(e.deltaY);
    },
    { passive: true }
  );

  // Reusable vectors for render loop
  const sunDir = new THREE.Vector3();
  const midPt = new THREE.Vector3();

  // Performance / FPS smoothing + optional deterministic stepping for smooth capture
  let lastTime = performance.now();
  let simTime = 0;
  let fpsSmooth = 60;
  let uiUpdateAccum = 0;
  let loopPaused = false;

  const renderFrame = (dt: number, rawDt: number, forceUi = false, skipGpuRender = false) => {
    simTime += dt;
    const instFps = Math.min(120, 1 / Math.max(0.001, rawDt));
    fpsSmooth = THREE.MathUtils.lerp(fpsSmooth, instFps, 0.08);

    // 1. Update 6-DOF Flight Physics & Autopilot
    const telemetry = physics.update(dt, simTime, input, cloudTextures, settings.cloudDensity);

    // 2. Update Camera Rig (Chase / Cockpit / Orbit)
    cameraRig.update(dt, simTime, fighter, telemetry);

    // 3. Evaluate cloud density along camera->jet segment for realistic FX cloud attenuation
    const camCloudDensity = cloudTextures.sampleDensityAtWorldPos(
      cameraRig.camera.position,
      simTime,
      settings.cloudDensity
    );
    midPt.copy(cameraRig.camera.position).lerp(telemetry.position, 0.5);
    const midCloudDensity = cloudTextures.sampleDensityAtWorldPos(
      midPt,
      simTime,
      settings.cloudDensity
    );
    const camToJetDist = cameraRig.camera.position.distanceTo(telemetry.position);
    const cloudAtten = Math.exp(-midCloudDensity * camToJetDist * 0.012);

    // 4. Sync sun light direction relative to fighter jet so PBR highlights stay razor sharp
    sunDir.copy(getSunDirection(currentPreset));
    sunLight.position.copy(telemetry.position).addScaledVector(sunDir, 250);
    sunLight.target.position.copy(telemetry.position);
    sunLight.target.updateMatrixWorld();

    rimBounceLight.position.copy(telemetry.position).addScaledVector(sunDir, -180);
    rimBounceLight.position.y -= 90;
    rimBounceLight.target.position.copy(telemetry.position);
    rimBounceLight.target.updateMatrixWorld();

    // 5. Update Stealth Fighter Airframe, Control Surfaces, Ocean, & Flight FX
    fighter.updateVisuals({
      position: telemetry.position,
      quaternion: telemetry.quaternion,
      pitchCmd: telemetry.controlSurfacePitch,
      rollCmd: telemetry.controlSurfaceRoll,
      yawCmd: telemetry.controlSurfaceYaw,
      throttle: telemetry.throttle,
      afterburner: telemetry.afterburner,
      sunDir,
      sunColor: currentPreset.sunColor,
      skyZenith: currentPreset.skyZenith,
      skyHorizon: currentPreset.skyHorizon,
      cloudAtten,
    });

    ocean.update(cameraRig.camera.position, simTime, settings.cloudDensity);

    flightEffects.update({
      fighter,
      camera: cameraRig.camera,
      dt,
      timeSec: simTime,
      speedMs: telemetry.speedMs,
      throttle: telemetry.throttle,
      afterburner: telemetry.afterburner,
      gForce: telemetry.gForce,
      aoaDeg: telemetry.aoaDeg,
      cloudDensityAtJet: Math.max(telemetry.cloudDensity, camCloudDensity * 0.7),
      cloudAtten,
      sunColor: currentPreset.sunColor,
      cloudTopColor: currentPreset.cloudTopColor,
    });

    if (!skipGpuRender) {
      // 6. Render 5-Pass Volumetric Clouds + Depth-Occluded Jet + HDR Bloom + ACES Pipeline
      pipeline.render(
        opaqueScene,
        fxScene,
        cameraRig.camera,
        simTime,
        settings.cloudDensity,
        Math.max(camCloudDensity, telemetry.cloudDensity * 0.65),
        qualityProfile
      );

      // 7. Render Collimated Cockpit HUD Overlay
      hudRenderer.render(
        settings.cameraMode,
        telemetry,
        cameraRig.camera.fov,
        settings.mouseFlight,
        input.mouseX,
        input.mouseY,
        settings.uiHidden
      );
    }

    // 8. Update Procedural Web Audio
    audioEngine.update(telemetry, settings.cameraMode === 'cockpit');

    // 9. Update UI Telemetry (~15 Hz to keep DOM ultra-light)
    uiUpdateAccum += rawDt;
    if (forceUi || uiUpdateAccum >= 0.065) {
      uiUpdateAccum = 0;
      ui.updateTelemetry(telemetry, fpsSmooth);
    }
  };

  // Expose clean diagnostic/demo control hook on window for visual verification & scripting
  (window as unknown as Record<string, unknown>).__flightSim = {
    getInfo: () => ({
      rendererLabel,
      isSoftware,
      quality: settings.quality,
      resolvedQuality,
      lighting: settings.lighting,
      cameraMode: settings.cameraMode,
      cloudDensity: settings.cloudDensity,
      fps: Math.round(fpsSmooth),
      telemetry: {
        mach: Number(physics.getTelemetry().mach.toFixed(2)),
        altitudeM: Math.round(physics.position.y),
        cloudDensity: Number(physics.cloudDensity.toFixed(3)),
        throttle: Number(physics.throttle.toFixed(2)),
        afterburner: Number(physics.afterburner.toFixed(2)),
        gForce: Number(physics.gForce.toFixed(2)),
      },
    }),
    setPaused: (paused: boolean) => {
      loopPaused = paused;
      if (!paused) lastTime = performance.now();
    },
    stepFrame: (dt = 1 / 30, render = true) => {
      fpsSmooth = Math.round(1 / dt);
      renderFrame(dt, dt, render, !render);
    },
    setChaseOffset: (yaw: number, pitch: number) => {
      cameraRig.chaseYawOffset = yaw;
      cameraRig.chasePitchOffset = pitch;
    },
    setOrbitAngle: (yaw: number, pitch: number, radius = 19.5) => {
      cameraRig.orbitAutoRotate = false;
      cameraRig.orbitYaw = yaw;
      cameraRig.orbitPitch = pitch;
      cameraRig.orbitRadius = radius;
    },
    setQuality: (q: QualitySetting) => {
      applyQualitySetting(q);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setLighting: (id: LightingPresetId) => {
      applyLightingPreset(id);
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setCamera: (mode: CameraMode) => {
      settings.cameraMode = mode;
      cameraRig.setMode(mode, fighter, physics.getTelemetry());
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setCloudDensity: (d: number) => {
      settings.cloudDensity = d;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setAutopilot: (ap: boolean) => {
      physics.autopilot = ap;
      settings.autopilot = ap;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setDrawerOpen: (open: boolean) => ui.setDrawerOpen(open),
    setUiHidden: (hidden: boolean) => {
      settings.uiHidden = hidden;
      ui.syncSettings(settings, rendererLabel, resolvedQuality);
    },
    setManualInputs: (partial: Partial<FlightInputState>) => {
      Object.assign(input, partial);
    },
    // Positions the jet cleanly slicing through / bursting out of a sunlit cumulus ridge edge
    // with towering cloud billows wrapping around the wings, clear sky breaking ahead, and full afterburner!
    jumpToCloudPierce: (inside = true) => {
      const probe = new THREE.Vector3();
      const sDir = getSunDirection(currentPreset);
      let bestPos = physics.position.clone();
      let bestHeading = 0.65;
      let bestScore = -1e9;
      for (let rx = -16; rx <= 16; rx++) {
        for (let rz = -16; rz <= 16; rz++) {
          const x = physics.position.x + rx * 280;
          const z = physics.position.z + rz * 280;
          const y = 2180;
          probe.set(x, y, z);
          const d = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);
          if (!inside) continue;
          if (d < 0.08 || d > 0.28) continue;
          for (let hi = 0; hi < 8; hi++) {
            const hdg = (hi / 8) * Math.PI * 2 + 0.15;
            const fx = -Math.sin(hdg);
            const fz = -Math.cos(hdg);
            const rxV = Math.cos(hdg);
            const rzV = -Math.sin(hdg);

            // Prefer sun front-side cross-lighting so cloud billows are dazzling white with shadowed sculptural folds!
            const sunAlign = fx * sDir.x + fz * sDir.z;
            if (sunAlign < -0.25) continue;

            // Camera just behind jet should see through wispy entry mist without being 100% whiteout
            probe.set(x - fx * 22, y + 4, z - fz * 22);
            const dCam = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);
            // Massive cumulus puffs flanking and wrapping right across the jet's wings & nose!
            probe.set(x + rxV * 95, y + 18, z + rzV * 95);
            const dRight = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);
            probe.set(x - rxV * 95, y + 18, z - rzV * 95);
            const dLeft = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);
            probe.set(x + fx * 180, y + 30, z + fz * 180);
            const dNearAhead = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);
            probe.set(x + fx * 1100, y + 140, z + fz * 1100);
            const dFarAhead = cloudTextures.sampleDensityAtWorldPos(probe, simTime, settings.cloudDensity);

            const score =
              (1.0 - Math.abs(d - 0.16) * 5.0) * 2.0 +
              (dLeft + dRight) * 4.2 +
              (1.0 - Math.abs(dNearAhead - 0.14) * 5.0) * 1.8 +
              sunAlign * 1.2 -
              Math.max(0, dCam - 0.10) * 8.0 -
              dFarAhead * 1.4;
            if (score > bestScore) {
              bestScore = score;
              bestPos.set(x, y, z);
              bestHeading = hdg;
            }
          }
        }
      }
      physics.position.copy(bestPos);
      physics.throttle = 1.0;
      physics.afterburner = 1.0;
      physics.speedMs = 435;
      physics.gForce = 4.6;
      physics.aoaDeg = 10.5;
      // Gentle upright bank (-26°) & level-slight-climb (+2°) so jet stays right inside the sculpted cloud ridge!
      const e = new THREE.Euler(0.035, bestHeading, -0.45, 'YXZ');
      physics.quaternion.setFromEuler(e);
      fighter.updateVisuals({
        position: physics.position,
        quaternion: physics.quaternion,
        pitchCmd: 0.42,
        rollCmd: -0.35,
        yawCmd: 0,
        throttle: 1.0,
        afterburner: 1.0,
        sunDir: getSunDirection(currentPreset),
        sunColor: currentPreset.sunColor,
        skyZenith: currentPreset.skyZenith,
        skyHorizon: currentPreset.skyHorizon,
        cloudAtten: 1.0,
      });
      flightEffects.resetTrails(fighter);
      cameraRig.setMode(settings.cameraMode, fighter, physics.getTelemetry());
    },
    setHeroPose: (opts?: { bankDeg?: number; pitchDeg?: number; throttle?: number; headingDeg?: number; resetTrails?: boolean }) => {
      const curEuler = new THREE.Euler().setFromQuaternion(physics.quaternion, 'YXZ');
      const e = new THREE.Euler(
        THREE.MathUtils.degToRad(opts?.pitchDeg ?? 5),
        opts?.headingDeg !== undefined ? THREE.MathUtils.degToRad(opts.headingDeg) : curEuler.y,
        THREE.MathUtils.degToRad(opts?.bankDeg ?? -32),
        'YXZ'
      );
      physics.quaternion.setFromEuler(e);
      if (opts?.throttle !== undefined) {
        physics.throttle = opts.throttle;
        physics.afterburner = THREE.MathUtils.clamp((opts.throttle - 0.7) / 0.3, 0, 1);
      }
      if (opts?.resetTrails) {
        fighter.updateVisuals({
          position: physics.position,
          quaternion: physics.quaternion,
          pitchCmd: 0,
          rollCmd: 0,
          yawCmd: 0,
          throttle: physics.throttle,
          afterburner: physics.afterburner,
          sunDir: getSunDirection(currentPreset),
          sunColor: currentPreset.sunColor,
          skyZenith: currentPreset.skyZenith,
          skyHorizon: currentPreset.skyHorizon,
          cloudAtten: 1.0,
        });
        flightEffects.resetTrails(fighter);
      }
    },
  };

  const animate = (now: number) => {
    requestAnimationFrame(animate);
    if (loopPaused) return;

    const rawDt = Math.max(0.001, (now - lastTime) / 1000);
    lastTime = now;
    const dt = Math.min(rawDt, 0.05);
    renderFrame(dt, rawDt, false);
  };

  requestAnimationFrame(animate);
}

bootstrap();
