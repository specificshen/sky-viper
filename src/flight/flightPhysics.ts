import * as THREE from 'three';
import type { CloudTextureSet } from '../scene/cloudTextures';
import type { FlightTelemetry } from '../core/types';

export interface FlightInputState {
  pitchUp: boolean;
  pitchDown: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  throttleUp: boolean;
  throttleDown: boolean;
  mouseActive: boolean;
  mouseX: number; // -1..1
  mouseY: number; // -1..1
}

export class FlightPhysics {
  public readonly position = new THREE.Vector3(0, 2260, 0);
  public readonly quaternion = new THREE.Quaternion();
  public readonly velocity = new THREE.Vector3(0, 0, -295);

  public speedMs = 295; // ~Mach 0.88
  public throttle = 0.74;
  public afterburner = 0.14;
  public gForce = 1.0;
  public aoaDeg = 1.4;
  public cloudDensity = 0.0;
  public autopilot = true;

  // Smoothed angular rates (rad/s) in local aircraft frame
  private pitchRate = 0;
  private rollRate = 0;
  private yawRate = 0;

  // Smoothed control surface commands (-1..1)
  public controlPitch = 0;
  public controlRoll = 0;
  public controlYaw = 0;

  // Autopilot internal weaving state
  private apPhase = 0;
  private apPierceTimer = 0;
  private apTargetAlt = 2280;
  private apSeekCloudMode = false;
  private forcePierceSec = 0;

  // Reusable scratch vectors
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly probePos = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly deltaQ = new THREE.Quaternion();
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly axisY = new THREE.Vector3(0, 1, 0);
  private readonly axisZ = new THREE.Vector3(0, 0, 1);

  constructor(clouds: CloudTextureSet) {
    this.findEpicStartLocation(clouds);
  }

  /**
   * Scans the weather/cloud field to spawn in clear sunlit sky facing dramatic
   * towering cumulus peaks slightly cross-lit by the sun so frame 1 looks breathtaking!
   */
  private findEpicStartLocation(clouds: CloudTextureSet): void {
    let bestScore = -1e9;
    let bestX = 0;
    let bestZ = 0;
    let bestHeading = 0.55;

    const testPos = new THREE.Vector3();
    for (let gx = -5; gx <= 5; gx++) {
      for (let gz = -5; gz <= 5; gz++) {
        const cx = gx * 2400;
        const cz = gz * 2400;
        // Start at 2220m: right inside dramatic towering sunlit cumulus valleys (clouds rise 1300m ABOVE and ocean gleams below!)
        testPos.set(cx, 2220, cz);
        const selfDens = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);
        if (selfDens > 0.02) continue;

        for (let hi = 0; hi < 8; hi++) {
          const hdg = (hi / 8) * Math.PI * 2 + 0.15;
          const fx = -Math.sin(hdg);
          const fz = -Math.cos(hdg);
          const rx = Math.cos(hdg);
          const rz = -Math.sin(hdg);

          // Want clear sunlit air right in front (600m) + massive towering cumulus castles 1.8km-4.2km ahead & flanking!
          testPos.set(cx + fx * 650, 2220, cz + fz * 650);
          const dClose = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);
          testPos.set(cx + fx * 2200, 2480, cz + fz * 2200);
          const dMid = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);
          testPos.set(cx + fx * 3800, 2850, cz + fz * 3800);
          const dFar = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);
          testPos.set(cx + fx * 1900 + rx * 1350, 2580, cz + fz * 1900 + rz * 1350);
          const dRight = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);
          testPos.set(cx + fx * 1900 - rx * 1350, 2580, cz + fz * 1900 - rz * 1350);
          const dLeft = clouds.sampleDensityAtWorldPos(testPos, 0, 0.92);

          // Strongly prefer front-side cross-lighting (sun 30-80 deg off nose) so cumulus crowns ahead
          // glow blinding white with crisp silver linings and blue-sky sculpted relief (never flat backlit!)
          const sunAz = THREE.MathUtils.degToRad(38);
          const sunDirX = Math.sin(sunAz);
          const sunDirZ = -Math.cos(sunAz);
          const sunDot = fx * sunDirX + fz * sunDirZ; // +1 toward sun, -1 away from sun
          if (sunDot < 0.12) continue;
          const lightingScore = 1.0 - Math.abs(sunDot - 0.62);

          // Reward dramatic sculpted cumulus peaks flanking & ahead while keeping bright sky lanes open
          const flankingBalance = Math.min(dLeft + dRight, 0.88) * 2.1;
          const midPeak = Math.min(dMid, 0.62) * 2.4;
          const score =
            midPeak +
            dFar * 1.9 +
            flankingBalance +
            lightingScore * 1.4 -
            dClose * 5.0 -
            selfDens * 10.0;

          if (score > bestScore) {
            bestScore = score;
            bestX = cx;
            bestZ = cz;
            bestHeading = hdg;
          }
        }
      }
    }

    this.position.set(bestX, 2220, bestZ);
    // Start in an iconic dynamic 26-degree bank carving toward towering sunlit cumulus castles!
    this.euler.set(0.035, bestHeading, -0.44, 'YXZ');
    this.quaternion.setFromEuler(this.euler);
    this.speedMs = 310;
    this.throttle = 0.84;
    this.afterburner = (this.throttle - 0.7) / 0.3;
    this.updateBasis();
    this.velocity.copy(this.forward).multiplyScalar(this.speedMs);
  }

  public triggerCloudDive(durationSec = 10): void {
    this.autopilot = true;
    this.forcePierceSec = durationSec;
    this.apSeekCloudMode = true;
  }

  private updateBasis(): void {
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
  }

  public update(
    dt: number,
    timeSec: number,
    input: FlightInputState,
    clouds: CloudTextureSet,
    cloudDensityScale: number
  ): FlightTelemetry {
    const safeDt = Math.min(dt, 0.05);
    this.updateBasis();

    // Check if user pressed any flight control -> seamlessly hand over manual control!
    const manualFlightKey =
      input.pitchUp ||
      input.pitchDown ||
      input.rollLeft ||
      input.rollRight ||
      input.yawLeft ||
      input.yawRight ||
      input.throttleUp ||
      input.throttleDown;

    if (manualFlightKey && this.autopilot) {
      this.autopilot = false;
      this.forcePierceSec = 0;
    }

    // Current local cloud immersion density at nose
    this.cloudDensity = clouds.sampleDensityAtWorldPos(
      this.position,
      timeSec,
      cloudDensityScale
    );

    let targetPitchCmd = 0;
    let targetRollCmd = 0;
    let targetYawCmd = 0;

    if (this.autopilot) {
      const ap = this.computeAutopilot(safeDt, timeSec, clouds, cloudDensityScale);
      targetPitchCmd = ap.pitch;
      targetRollCmd = ap.roll;
      targetYawCmd = ap.yaw;
      this.throttle = THREE.MathUtils.lerp(this.throttle, ap.throttle, safeDt * 1.4);
    } else {
      // Manual 6-DOF arcade-sim controls
      if (input.pitchUp) targetPitchCmd += 1;
      if (input.pitchDown) targetPitchCmd -= 1;
      if (input.rollLeft) targetRollCmd += 1;
      if (input.rollRight) targetRollCmd -= 1;
      if (input.yawLeft) targetYawCmd += 1;
      if (input.yawRight) targetYawCmd -= 1;

      if (input.mouseActive) {
        targetRollCmd = THREE.MathUtils.clamp(targetRollCmd - input.mouseX * 1.15, -1, 1);
        targetPitchCmd = THREE.MathUtils.clamp(targetPitchCmd - input.mouseY * 1.05, -1, 1);
      }

      if (input.throttleUp) {
        this.throttle = Math.min(1.0, this.throttle + safeDt * 0.55);
      }
      if (input.throttleDown) {
        this.throttle = Math.max(0.08, this.throttle - safeDt * 0.55);
      }
    }

    // Smooth control surface actuator response
    const ctrlLerp = 1 - Math.exp(-safeDt * 11);
    this.controlPitch = THREE.MathUtils.lerp(this.controlPitch, targetPitchCmd, ctrlLerp);
    this.controlRoll = THREE.MathUtils.lerp(this.controlRoll, targetRollCmd, ctrlLerp);
    this.controlYaw = THREE.MathUtils.lerp(this.controlYaw, targetYawCmd, ctrlLerp);

    // Aerodynamic angular authority scales smoothly with airspeed
    const speedAuthority = THREE.MathUtils.clamp(this.speedMs / 270, 0.55, 1.35);
    const maxPitchRate = 1.32 * speedAuthority;
    const maxRollRate = 2.45 * speedAuthority;
    const maxYawRate = 0.62 * speedAuthority;

    const rateLerp = 1 - Math.exp(-safeDt * 7.5);
    this.pitchRate = THREE.MathUtils.lerp(this.pitchRate, this.controlPitch * maxPitchRate, rateLerp);
    this.rollRate = THREE.MathUtils.lerp(this.rollRate, this.controlRoll * maxRollRate, rateLerp);
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, this.controlYaw * maxYawRate, rateLerp);

    // Subtle coordinated banking turn (world yaw from bank angle for authentic fighter flight feel)
    const bankSin = THREE.MathUtils.clamp(-this.right.y, -1, 1);
    const bankTurnYaw = bankSin * 0.34 * THREE.MathUtils.clamp(this.speedMs / 280, 0.5, 1.2);

    // Integrate 6-DOF quaternion orientation (zero gimbal lock!)
    this.deltaQ.setFromAxisAngle(this.axisX, this.pitchRate * safeDt);
    this.quaternion.multiply(this.deltaQ);
    this.deltaQ.setFromAxisAngle(this.axisZ, this.rollRate * safeDt);
    this.quaternion.multiply(this.deltaQ);
    this.deltaQ.setFromAxisAngle(this.axisY, this.yawRate * safeDt);
    this.quaternion.multiply(this.deltaQ);

    // World-up coordinated turn
    if (Math.abs(bankTurnYaw) > 0.0001) {
      this.deltaQ.setFromAxisAngle(this.axisY, -bankTurnYaw * safeDt);
      this.quaternion.premultiply(this.deltaQ);
    }
    this.quaternion.normalize();
    this.updateBasis();

    // Afterburner kicks in smoothly above 70% throttle
    this.afterburner = THREE.MathUtils.clamp((this.throttle - 0.7) / 0.3, 0, 1);

    // Thrust, air-density drag, gravity climb/dive, and induced turn G-bleed
    const altRatio = THREE.MathUtils.clamp(this.position.y / 14000, 0, 1);
    const airDensity = Math.exp(-altRatio * 1.15);

    const maxSpeedAtAlt = THREE.MathUtils.lerp(660, 745, altRatio);
    const targetCruise = 145 + this.throttle * 290 + this.afterburner * (maxSpeedAtAlt - 435);
    const climbGravity = -this.forward.y * 28.0; // climbing slows slightly, diving accelerates!
    const turnDrag = Math.max(0, Math.abs(this.gForce) - 1.5) * 6.5 * airDensity;

    const accel = (targetCruise - this.speedMs) * (0.52 + this.afterburner * 0.55) + climbGravity - turnDrag;
    this.speedMs = THREE.MathUtils.clamp(this.speedMs + accel * safeDt, 125, maxSpeedAtAlt);

    // Advance 3D world position
    this.velocity.copy(this.forward).multiplyScalar(this.speedMs);
    this.position.addScaledVector(this.velocity, safeDt);

    // Ocean deck protection (never crash under water) & stratosphere ceiling
    if (this.position.y < 55) {
      this.position.y = 55;
      if (this.forward.y < 0.08) {
        this.deltaQ.setFromAxisAngle(this.axisX, 0.9 * safeDt);
        this.quaternion.multiply(this.deltaQ).normalize();
      }
    } else if (this.position.y > 15500) {
      this.position.y = 15500;
      if (this.forward.y > -0.05) {
        this.deltaQ.setFromAxisAngle(this.axisX, -0.6 * safeDt);
        this.quaternion.multiply(this.deltaQ).normalize();
      }
    }

    // Compute authentic G-load & Angle of Attack (level = 1.0G, banked turn > 1.3G, hard pull up to 9G)
    const pitchTurnG = (this.pitchRate * this.speedMs) / 9.81;
    const bankLiftG = (1.0 / Math.max(0.32, Math.abs(this.up.y)) - 1.0) * 0.85;
    const gravityG = THREE.MathUtils.clamp(this.up.y, -1, 1);
    const rawG = THREE.MathUtils.clamp(gravityG + pitchTurnG + bankLiftG, -2.5, 9.2);
    this.gForce = THREE.MathUtils.lerp(this.gForce, rawG, 1 - Math.exp(-safeDt * 8));

    const rawAoa = THREE.MathUtils.clamp(1.2 + (this.gForce - 1.0) * 2.1 + this.controlPitch * 3.5, -6, 22);
    this.aoaDeg = THREE.MathUtils.lerp(this.aoaDeg, rawAoa, 1 - Math.exp(-safeDt * 8));

    return this.getTelemetry();
  }

  /**
   * Scenic cloud-weaving autopilot: gracefully banks around towering sunlit cumulus
   * formations and periodically accelerates on afterburner straight through a scenic
   * volumetric cloud ridge for unforgettable cinematic spectacle!
   */
  private computeAutopilot(
    dt: number,
    timeSec: number,
    clouds: CloudTextureSet,
    cloudDensityScale: number
  ): { pitch: number; roll: number; yaw: number; throttle: number } {
    this.apPhase += dt;
    this.apPierceTimer += dt;

    if (this.forcePierceSec > 0) {
      this.forcePierceSec -= dt;
      this.apSeekCloudMode = true;
    } else if (this.apPierceTimer > 13.0) {
      this.apSeekCloudMode = !this.apSeekCloudMode;
      this.apPierceTimer = 0;
    }

    // Sample volumetric cloud density left, center, and right ahead of the jet
    const probeDist = 1150;
    const sampleDir = (sideOffset: number, altOffset: number): number => {
      this.probePos
        .copy(this.position)
        .addScaledVector(this.forward, probeDist)
        .addScaledVector(this.right, sideOffset);
      this.probePos.y += altOffset;
      return clouds.sampleDensityAtWorldPos(this.probePos, timeSec, cloudDensityScale);
    };

    const dCenter = sampleDir(0, 0);
    const dLeft = sampleDir(-720, 40);
    const dRight = sampleDir(720, 40);
    const dUp = sampleDir(0, 260);
    const dDown = sampleDir(0, -240);

    // Target dramatic sinusoidal bank weaving modulated by cloud ridges
    let desiredBank = Math.sin(this.apPhase * 0.34) * 0.62;
    if (this.apSeekCloudMode) {
      // Steer TOWARD the densest sunlit cloud formation ahead to pierce straight through!
      const cloudBias = (dLeft - dRight) * 2.4;
      desiredBank = THREE.MathUtils.clamp(cloudBias + Math.sin(this.apPhase * 0.25) * 0.28, -0.78, 0.78);
      if (dUp > dDown + 0.05) {
        this.apTargetAlt = THREE.MathUtils.lerp(this.apTargetAlt, 2520, dt * 0.5);
      } else {
        this.apTargetAlt = THREE.MathUtils.lerp(this.apTargetAlt, 2120, dt * 0.5);
      }
    } else {
      // Graceful Top-Gun canyon weave skimming cloud tops and sunlit valleys
      if (dCenter > 0.28) {
        desiredBank += dLeft < dRight ? 0.45 : -0.45;
      }
      desiredBank = THREE.MathUtils.clamp(desiredBank, -0.82, 0.82);
      this.apTargetAlt = 2420 + Math.sin(this.apPhase * 0.22) * 340;
    }

    // Extract current roll & pitch angles cleanly
    const currentRoll = Math.atan2(this.right.y, this.up.y);
    const currentPitch = Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));

    const altErr = THREE.MathUtils.clamp((this.apTargetAlt - this.position.y) / 600, -1, 1);
    const desiredPitch = altErr * 0.24;

    const rollCmd = THREE.MathUtils.clamp((desiredBank - currentRoll) * 1.45, -0.85, 0.85);
    // Pull gently back on stick during steeper banks to hold graceful altitude
    const bankPull = Math.abs(Math.sin(currentRoll)) * 0.26;
    const pitchCmd = THREE.MathUtils.clamp((desiredPitch - currentPitch) * 2.2 + bankPull, -0.75, 0.85);

    // Pulse afterburner dramatically when diving into or emerging from a cloud!
    const nearCloud = Math.max(this.cloudDensity, dCenter);
    const targetThrottle =
      this.apSeekCloudMode || nearCloud > 0.14
        ? 0.92 + Math.sin(this.apPhase * 0.9) * 0.06
        : 0.74 + Math.sin(this.apPhase * 0.42) * 0.12;

    return {
      pitch: pitchCmd,
      roll: rollCmd,
      yaw: 0,
      throttle: THREE.MathUtils.clamp(targetThrottle, 0.58, 1.0),
    };
  }

  public getTelemetry(): FlightTelemetry {
    this.updateBasis();
    const speedOfSound = Math.max(295, 340.3 - Math.min(this.position.y, 11000) * 0.0041);
    const mach = this.speedMs / speedOfSound;
    const knots = this.speedMs * 1.94384;

    // Compass heading: -Z is North (000), +X is East (090)
    let headingDeg = THREE.MathUtils.radToDeg(Math.atan2(this.forward.x, -this.forward.z));
    if (headingDeg < 0) headingDeg += 360;

    const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1)));
    const rollDeg = THREE.MathUtils.radToDeg(Math.atan2(this.right.y, this.up.y));

    return {
      position: this.position,
      quaternion: this.quaternion,
      velocity: this.velocity,
      speedMs: this.speedMs,
      knots,
      mach,
      altitudeM: this.position.y,
      headingDeg,
      pitchDeg,
      rollDeg,
      gForce: this.gForce,
      aoaDeg: this.aoaDeg,
      throttle: this.throttle,
      afterburner: this.afterburner,
      cloudDensity: this.cloudDensity,
      autopilot: this.autopilot,
      controlSurfacePitch: this.controlPitch,
      controlSurfaceRoll: this.controlRoll,
      controlSurfaceYaw: this.controlYaw,
    };
  }
}
