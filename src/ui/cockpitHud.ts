import type { CameraMode, FlightTelemetry } from '../core/types';

/**
 * High-DPI Collimated Military Aviation HUD Renderer (2D Canvas Overlay)
 * Renders authentic emerald-green fighter HUD in Cockpit Cam:
 * Pitch ladder, horizon line, velocity vector, heading tape, airspeed/Mach tape,
 * altitude tape, G-load, AoA, throttle/AB status, and IMC cloud-pierce cue.
 */
export class CockpitHudRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1280;
  private height = 720;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  public resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  public render(
    mode: CameraMode,
    telemetry: FlightTelemetry,
    cameraFovDeg: number,
    mouseFlight: boolean,
    mouseX: number,
    mouseY: number,
    uiHidden: boolean
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    if (uiHidden && mode !== 'cockpit') return;

    if (mode !== 'cockpit') {
      // Minimal subtle mouse-flight cursor cue in Chase mode only when mouse flight is active
      if (mouseFlight) {
        const cx = this.width * 0.5;
        const cy = this.height * 0.5;
        const mx = cx + mouseX * this.width * 0.32;
        const my = cy + mouseY * this.height * 0.32;

        ctx.save();
        ctx.strokeStyle = 'rgba(130, 220, 255, 0.48)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(77, 255, 155, 0.75)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    // --- COLLIMATED FIRST-PERSON FIGHTER COCKPIT HUD ---
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.47;
    const hudColor = '#3dff95';
    const hudDim = 'rgba(62, 255, 148, 0.82)';
    const hudShadow = 'rgba(0, 22, 10, 0.90)';

    // Pixels per degree projected cleanly to cockpit camera vertical FOV
    const pxPerDeg = h / Math.max(30, cameraFovDeg);

    ctx.save();
    ctx.strokeStyle = hudColor;
    ctx.fillStyle = hudColor;
    ctx.shadowColor = hudShadow;
    ctx.shadowBlur = 5;
    ctx.lineWidth = 2.05;
    ctx.font = '700 13px "JetBrains Mono", monospace';

    // 1. PITCH LADDER & ARTIFICIAL HORIZON (framed squarely inside the wide-angle HUD combiner glass)
    const ladderRadius = Math.min(w, h) * 0.175;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - ladderRadius * 1.1, cy - ladderRadius * 0.80, ladderRadius * 2.2, ladderRadius * 1.62);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate((telemetry.rollDeg * Math.PI) / 180);

    const pitchShift = telemetry.pitchDeg * pxPerDeg;
    const minDeg = Math.floor((telemetry.pitchDeg - 28) / 5) * 5;
    const maxDeg = Math.ceil((telemetry.pitchDeg + 28) / 5) * 5;

    for (let deg = minDeg; deg <= maxDeg; deg += 5) {
      const y = pitchShift - deg * pxPerDeg;
      if (deg === 0) {
        // Solid wide horizon bar with center gap
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(-175, y);
        ctx.lineTo(-34, y);
        ctx.moveTo(34, y);
        ctx.lineTo(175, y);
        ctx.stroke();
      } else {
        const isPos = deg > 0;
        const barW = deg % 10 === 0 ? 74 : 48;
        const tickH = isPos ? 8 : -8;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(isPos ? [] : [7, 5]);

        // Left & right rungs
        ctx.beginPath();
        ctx.moveTo(-barW, y + tickH);
        ctx.lineTo(-barW, y);
        ctx.lineTo(-28, y);
        ctx.moveTo(28, y);
        ctx.lineTo(barW, y);
        ctx.lineTo(barW, y + tickH);
        ctx.stroke();
        ctx.setLineDash([]);

        if (deg % 10 === 0) {
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(String(Math.abs(deg)), -barW - 7, y + 4);
          ctx.textAlign = 'left';
          ctx.fillText(String(Math.abs(deg)), barW + 7, y + 4);
        }
      }
    }
    ctx.restore();

    // 2. WATERLINE BORESIGHT (-v-) & FLIGHT PATH MARKER (Velocity Vector)
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx, cy + 7);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.stroke();

    // Velocity vector drifts slightly down with AoA
    const fpmY = cy + telemetry.aoaDeg * pxPerDeg * 0.45;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, fpmY, 8.5, 0, Math.PI * 2);
    ctx.moveTo(cx - 22, fpmY);
    ctx.lineTo(cx - 8.5, fpmY);
    ctx.moveTo(cx + 8.5, fpmY);
    ctx.lineTo(cx + 22, fpmY);
    ctx.moveTo(cx, fpmY - 8.5);
    ctx.lineTo(cx, fpmY - 17);
    ctx.stroke();

    // 3. TOP HEADING COMPASS TAPE (fits snugly inside upper combiner glass between support arms)
    const compY = Math.max(96, cy - ladderRadius - 6);
    const compW = 260;
    const hdg = telemetry.headingDeg;
    const pxPerHdgDeg = 5.2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - compW * 0.5, compY - 26, compW, 40);
    ctx.clip();

    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - compW * 0.5, compY);
    ctx.lineTo(cx + compW * 0.5, compY);
    ctx.stroke();

    const startH = Math.floor(hdg / 5) * 5 - 35;
    const endH = startH + 75;
    ctx.textAlign = 'center';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    for (let d = startH; d <= endH; d += 5) {
      const x = cx + (d - hdg) * pxPerHdgDeg;
      const major = d % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x, compY);
      ctx.lineTo(x, compY - (major ? 10 : 5));
      ctx.stroke();
      if (major) {
        const norm = ((d % 360) + 360) % 360;
        const lbl =
          norm === 0
            ? 'N'
            : norm === 90
              ? 'E'
              : norm === 180
                ? 'S'
                : norm === 270
                  ? 'W'
                  : String(Math.round(norm / 10)).padStart(2, '0');
        ctx.fillText(lbl, x, compY - 14);
      }
    }
    ctx.restore();

    // Center heading caret & boxed digital heading
    ctx.beginPath();
    ctx.moveTo(cx, compY + 2);
    ctx.lineTo(cx - 6, compY + 10);
    ctx.lineTo(cx + 6, compY + 10);
    ctx.closePath();
    ctx.stroke();

    const hdgStr = String(Math.round(hdg) % 360).padStart(3, '0');
    ctx.strokeRect(cx - 24, compY + 12, 48, 20);
    ctx.textAlign = 'center';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText(hdgStr, cx, compY + 27);

    // 4. LEFT AIRSPEED TAPE (Knots + Mach) — aligned squarely inside wide combiner glass
    const tapeOffset = Math.min(w * 0.155, 272);
    const spdX = cx - tapeOffset;
    const tapeH = 195;

    ctx.save();
    ctx.beginPath();
    ctx.rect(spdX - 78, cy - tapeH * 0.5, 86, tapeH);
    ctx.clip();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(spdX, cy - tapeH * 0.5);
    ctx.lineTo(spdX, cy + tapeH * 0.5);
    ctx.stroke();

    const kts = telemetry.knots;
    const minKts = Math.floor(kts / 20) * 20 - 120;
    ctx.textAlign = 'right';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    for (let k = minKts; k <= minKts + 260; k += 20) {
      if (k < 0) continue;
      const y = cy - (k - kts) * 1.15;
      const major = k % 100 === 0;
      ctx.beginPath();
      ctx.moveTo(spdX, y);
      ctx.lineTo(spdX - (major ? 12 : 7), y);
      ctx.stroke();
      if (k % 40 === 0) {
        ctx.fillText(String(k), spdX - 15, y + 4);
      }
    }
    ctx.restore();

    // Airspeed boxed digital readout + Mach
    ctx.fillStyle = 'rgba(4, 18, 12, 0.58)';
    ctx.fillRect(spdX - 74, cy - 13, 62, 26);
    ctx.strokeStyle = hudColor;
    ctx.strokeRect(spdX - 74, cy - 13, 62, 26);
    ctx.fillStyle = hudColor;
    ctx.textAlign = 'right';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillText(String(Math.round(kts)), spdX - 18, cy + 5);
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText(`M ${telemetry.mach.toFixed(2)}`, spdX - 14, cy + tapeH * 0.5 + 22);
    ctx.fillStyle = hudDim;
    ctx.fillText('IAS KTS', spdX - 14, cy - tapeH * 0.5 - 10);

    // 5. RIGHT ALTITUDE TAPE (Meters)
    const altX = cx + tapeOffset;
    const altM = telemetry.altitudeM;

    ctx.save();
    ctx.beginPath();
    ctx.rect(altX - 8, cy - tapeH * 0.5, 92, tapeH);
    ctx.clip();

    ctx.strokeStyle = hudColor;
    ctx.fillStyle = hudColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(altX, cy - tapeH * 0.5);
    ctx.lineTo(altX, cy + tapeH * 0.5);
    ctx.stroke();

    const minAlt = Math.floor(altM / 100) * 100 - 600;
    ctx.textAlign = 'left';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    for (let a = minAlt; a <= minAlt + 1300; a += 100) {
      if (a < 0) continue;
      const y = cy - (a - altM) * 0.22;
      const major = a % 500 === 0;
      ctx.beginPath();
      ctx.moveTo(altX, y);
      ctx.lineTo(altX + (major ? 12 : 7), y);
      ctx.stroke();
      if (a % 200 === 0) {
        ctx.fillText(String(a), altX + 15, y + 4);
      }
    }
    ctx.restore();

    // Altitude digital box
    ctx.fillStyle = 'rgba(4, 18, 12, 0.58)';
    ctx.fillRect(altX + 12, cy - 13, 68, 26);
    ctx.strokeStyle = hudColor;
    ctx.strokeRect(altX + 12, cy - 13, 68, 26);
    ctx.fillStyle = hudColor;
    ctx.textAlign = 'left';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillText(String(Math.round(altM)), altX + 18, cy + 5);
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText(`FT ${Math.round(altM * 3.28084)}`, altX + 12, cy + tapeH * 0.5 + 22);
    ctx.fillStyle = hudDim;
    ctx.fillText('BARO M', altX + 12, cy - tapeH * 0.5 - 10);

    // 6. LOWER-LEFT / LOWER-RIGHT COMBAT FLIGHT DATA BLOCKS (G, AoA, Throttle/AB, Cloud IMC)
    ctx.fillStyle = hudColor;
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    const dataY = cy + tapeH * 0.5 + 48;
    ctx.fillText(`G  ${telemetry.gForce.toFixed(1)}`, spdX - 72, dataY);
    ctx.fillText(`α  ${telemetry.aoaDeg.toFixed(1)}°`, spdX - 72, dataY + 19);

    const thrPct = Math.round(telemetry.throttle * 100);
    const thrMode = telemetry.afterburner > 0.05 ? `A/B ${thrPct}%` : `MIL ${thrPct}%`;
    ctx.textAlign = 'right';
    ctx.fillStyle = telemetry.afterburner > 0.05 ? '#ffb24a' : hudColor;
    ctx.fillText(thrMode, altX + 78, dataY);
    ctx.fillStyle = hudColor;
    ctx.fillText(telemetry.autopilot ? 'A/P NAV' : 'MAN FLY', altX + 78, dataY + 19);

    if (telemetry.cloudDensity > 0.06) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9be8ff';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.fillText('◆ IMC CLOUD PENETRATION ◆', cx, cy + ladderRadius + 34);
    }

    // 7. SUBTLE ROLL BANK ARC AT BOTTOM OF HUD COMBINER
    const arcR = 96;
    const arcY = cy + 62;
    ctx.strokeStyle = hudDim;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, arcY, arcR, Math.PI * 0.28, Math.PI * 0.72);
    ctx.stroke();

    const bankAngle = Math.PI * 0.5 + Math.max(-0.68, Math.min(0.68, (telemetry.rollDeg * Math.PI) / 180));
    const bx = cx + Math.cos(bankAngle) * arcR;
    const by = arcY + Math.sin(bankAngle) * arcR;
    ctx.strokeStyle = hudColor;
    ctx.fillStyle = hudColor;
    ctx.beginPath();
    ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
