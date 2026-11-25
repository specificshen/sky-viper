import * as THREE from 'three';
import type { CameraMode, FlightTelemetry } from '../core/types';
import type { StealthFighter } from '../scene/stealthFighter';

export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  public mode: CameraMode = 'chase';

  // Orbit camera angles & zoom
  public orbitYaw = 0.58;
  public orbitPitch = 0.16;
  public orbitRadius = 21.5;
  public orbitAutoRotate = true;

  // Chase temporary mouse-drag look offset
  public chaseYawOffset = 0;
  public chasePitchOffset = 0;

  private readonly smoothPos = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly smoothUp = new THREE.Vector3(0, 1, 0);
  private initialized = false;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.35, 220000);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public setMode(mode: CameraMode, fighter: StealthFighter, telemetry: FlightTelemetry): void {
    this.mode = mode;
    fighter.setCockpitView(mode === 'cockpit');
    this.initialized = false;
    this.update(0.016, 0, fighter, telemetry);
  }

  public addPointerDrag(dx: number, dy: number): void {
    if (this.mode === 'orbit') {
      this.orbitAutoRotate = false;
      this.orbitYaw -= dx * 0.0055;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0045, -0.75, 1.1);
    } else if (this.mode === 'chase') {
      this.chaseYawOffset = THREE.MathUtils.clamp(this.chaseYawOffset - dx * 0.004, -1.35, 1.35);
      this.chasePitchOffset = THREE.MathUtils.clamp(this.chasePitchOffset + dy * 0.0035, -0.45, 0.65);
    }
  }

  public addWheelZoom(deltaY: number): void {
    if (this.mode === 'orbit') {
      this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius + deltaY * 0.018, 12.5, 48.0);
    }
  }

  public update(
    dt: number,
    timeSec: number,
    fighter: StealthFighter,
    telemetry: FlightTelemetry
  ): void {
    const safeDt = Math.min(dt, 0.05);
    const { position, quaternion, afterburner, gForce, cloudDensity, controlSurfaceRoll } = telemetry;

    this.tmpFwd.set(0, 0, -1).applyQuaternion(quaternion).normalize();
    this.tmpRight.set(1, 0, 0).applyQuaternion(quaternion).normalize();
    this.tmpUp.set(0, 1, 0).applyQuaternion(quaternion).normalize();

    // Subtle procedural speed / afterburner / high-G / cloud-pierce buffet shake
    const shakeAmp =
      0.015 +
      afterburner * 0.055 +
      Math.max(0, Math.abs(gForce) - 2.2) * 0.025 +
      cloudDensity * 0.095;

    this.shakeOffset.set(
      (Math.sin(timeSec * 41.3) + Math.sin(timeSec * 73.1) * 0.5) * shakeAmp,
      (Math.cos(timeSec * 37.7) + Math.sin(timeSec * 61.9) * 0.5) * shakeAmp,
      0
    );

    if (this.mode === 'chase') {
      // Dynamic FOV kick with speed & afterburner while keeping the stealth fighter heroically framed!
      const targetFov = 51 + afterburner * 7.5 + THREE.MathUtils.clamp((telemetry.mach - 0.85) * 3.5, 0, 4.0);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-safeDt * 4.5));
      this.camera.updateProjectionMatrix();

      // Cinematic heroic chase framing close behind & slightly above the stealth fighter
      // Dynamic lateral banking lead shows off chined fuselage, swept wings, gold canopy & roaring twin Mach-diamond plumes!
      const pullBack = 11.8 + afterburner * 1.4;
      const elevOffset = 2.65;
      const bankRad = Math.atan2(this.tmpRight.y, this.tmpUp.y);
      const bankSideLag = -controlSurfaceRoll * 2.2 - Math.sin(bankRad) * 1.85;

      // Apply optional mouse-drag chase offset
      const yawOff = this.chaseYawOffset;
      const pitchOff = this.chasePitchOffset;
      const localOffset = new THREE.Vector3(
        bankSideLag + Math.sin(yawOff) * pullBack,
        elevOffset + Math.sin(pitchOff) * pullBack * 0.7,
        Math.cos(yawOff) * pullBack
      );
      localOffset.applyQuaternion(quaternion);

      this.tmpPos.copy(position).add(localOffset);
      // Look ahead of the nose so horizon, sunlit cumulus towers & ocean fill the frame dramatically
      this.tmpLook
        .copy(position)
        .addScaledVector(this.tmpFwd, 24)
        .addScaledVector(this.tmpUp, 0.9);

      // Blend camera up gently between aircraft up and world up so banking looks dramatic & readable!
      const desiredUp = new THREE.Vector3(0, 1, 0).lerp(this.tmpUp, 0.58).normalize();

      if (!this.initialized) {
        this.smoothPos.copy(this.tmpPos);
        this.smoothLook.copy(this.tmpLook);
        this.smoothUp.copy(desiredUp);
        this.initialized = true;
      } else {
        const posLerp = 1 - Math.exp(-safeDt * 12.0);
        const lookLerp = 1 - Math.exp(-safeDt * 14.0);
        const upLerp = 1 - Math.exp(-safeDt * 5.2);
        this.smoothPos.lerp(this.tmpPos, posLerp);
        this.smoothLook.lerp(this.tmpLook, lookLerp);
        this.smoothUp.lerp(desiredUp, upLerp).normalize();
      }

      this.camera.position
        .copy(this.smoothPos)
        .addScaledVector(this.tmpRight, this.shakeOffset.x)
        .addScaledVector(this.tmpUp, this.shakeOffset.y);
      this.camera.up.copy(this.smoothUp);
      this.camera.lookAt(this.smoothLook);
    } else if (this.mode === 'cockpit') {
      const targetFov = 62 + afterburner * 5.5;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-safeDt * 6));
      this.camera.updateProjectionMatrix();

      // Exact pilot eye inside cockpit with realistic subtle G-load head settle & buffet
      const gDip = THREE.MathUtils.clamp((gForce - 1.0) * -0.014, -0.06, 0.04);
      const localEye = fighter.cockpitEyeLocal.clone();
      localEye.y += gDip + this.shakeOffset.y * 0.14;
      localEye.x += this.shakeOffset.x * 0.14;

      this.tmpPos.copy(localEye).applyQuaternion(quaternion).add(position);
      this.tmpLook.copy(this.tmpPos).addScaledVector(this.tmpFwd, 120);

      this.camera.position.copy(this.tmpPos);
      this.camera.up.copy(this.tmpUp);
      this.camera.lookAt(this.tmpLook);
    } else {
      // Orbit / Hero Flyby Cam
      if (this.orbitAutoRotate) {
        this.orbitYaw += safeDt * 0.24;
      }
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 52, 1 - Math.exp(-safeDt * 5));
      this.camera.updateProjectionMatrix();

      const cp = Math.cos(this.orbitPitch);
      const sp = Math.sin(this.orbitPitch);
      const localOrbit = new THREE.Vector3(
        Math.sin(this.orbitYaw) * cp * this.orbitRadius,
        sp * this.orbitRadius + 1.5,
        Math.cos(this.orbitYaw) * cp * this.orbitRadius
      );
      localOrbit.applyQuaternion(quaternion);
      this.tmpPos.copy(position).add(localOrbit);
      this.tmpLook.copy(position).addScaledVector(this.tmpFwd, 1.5);

      if (!this.initialized) {
        this.smoothPos.copy(this.tmpPos);
        this.smoothLook.copy(this.tmpLook);
        this.initialized = true;
      } else {
        this.smoothPos.lerp(this.tmpPos, 1 - Math.exp(-safeDt * 12));
        this.smoothLook.lerp(this.tmpLook, 1 - Math.exp(-safeDt * 14));
      }

      this.camera.position.copy(this.smoothPos);
      this.camera.up.set(0, 1, 0).lerp(this.tmpUp, 0.35).normalize();
      this.camera.lookAt(this.smoothLook);
    }
  }
}
