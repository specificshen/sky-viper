import * as THREE from 'three';

export interface JetPbrTextures {
  albedoMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  mfdMap: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates 1024x1024 procedural Have Glass V tactical stealth PBR maps:
 * two-tone gunship-gray RAM coating, sawtooth panel lines, lighter RAM edge tape,
 * subtle metallic weathering, intake markings, and illuminated cockpit MFD screens.
 */
export function createJetTextures(): JetPbrTextures {
  const size = 1024;

  // --- ALBEDO ---
  const albCanvas = document.createElement('canvas');
  albCanvas.width = size;
  albCanvas.height = size;
  const aCtx = albCanvas.getContext('2d')!;

  // Base satin gunship gray
  aCtx.fillStyle = '#5c6672';
  aCtx.fillRect(0, 0, size, size);

  // Subtle metallic grain & tonal airframe variation
  for (let i = 0; i < 650; i++) {
    const x = ((i * 733) % size);
    const y = ((i * 419) % size);
    const w = 18 + (i % 64);
    const h = 14 + ((i * 7) % 52);
    const shade = 84 + (i % 24);
    aCtx.fillStyle = `rgba(${shade}, ${shade + 8}, ${shade + 17}, 0.14)`;
    aCtx.fillRect(x, y, w, h);
  }

  // Two-tone stealth splinter/disruptive Have Glass V camo patches
  const drawCamoPoly = (pts: [number, number][], fill: string) => {
    aCtx.beginPath();
    pts.forEach(([x, y], idx) => (idx === 0 ? aCtx.moveTo(x, y) : aCtx.lineTo(x, y)));
    aCtx.closePath();
    aCtx.fillStyle = fill;
    aCtx.fill();
  };

  drawCamoPoly([[0, 120], [340, 60], [510, 290], [260, 440], [0, 350]], 'rgba(62, 71, 82, 0.72)');
  drawCamoPoly([[580, 40], [1024, 100], [1024, 410], [720, 490], [520, 240]], 'rgba(66, 75, 86, 0.68)');
  drawCamoPoly([[140, 560], [540, 480], [660, 790], [310, 920], [90, 760]], 'rgba(58, 66, 76, 0.74)');
  drawCamoPoly([[680, 540], [1024, 620], [980, 960], [640, 880]], 'rgba(116, 126, 138, 0.36)');
  drawCamoPoly([[220, 160], [440, 190], [390, 360], [180, 310]], 'rgba(128, 138, 150, 0.28)');

  // --- ROUGHNESS ---
  const rghCanvas = document.createElement('canvas');
  rghCanvas.width = size;
  rghCanvas.height = size;
  const rCtx = rghCanvas.getContext('2d')!;
  // Base satin metallic RAM roughness (~0.38 -> rgb 97)
  rCtx.fillStyle = 'rgb(96, 96, 96)';
  rCtx.fillRect(0, 0, size, size);

  // Subtle panel-to-panel sheen variance
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
      const v = 78 + ((px * 19 + py * 37) % 38);
      rCtx.fillStyle = `rgb(${v},${v},${v})`;
      rCtx.fillRect(px * 128 + 3, py * 128 + 3, 122, 122);
    }
  }

  // --- BUMP ---
  const bmpCanvas = document.createElement('canvas');
  bmpCanvas.width = size;
  bmpCanvas.height = size;
  const bCtx = bmpCanvas.getContext('2d')!;
  bCtx.fillStyle = 'rgb(138, 138, 138)';
  bCtx.fillRect(0, 0, size, size);

  // Draw stealth sawtooth RAM seams & lighter dielectric border tape across all 3 maps
  const drawSawtoothLine = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    teeth: number,
    amp: number,
    color: string,
    lineWidth: number
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= teeth * 2; i++) {
      const t = i / (teeth * 2);
      const offset = i % 2 === 1 ? amp : 0;
      const px = x0 + dx * t + nx * offset;
      const py = y0 + dy * t + ny * offset;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  // Longitudinal & spanwise stealth RAM panel grid + sawtooth hatches
  const panelSteps = [128, 256, 384, 512, 640, 768, 896];
  for (const pos of panelSteps) {
    // Lighter stealth RAM edge tape on albedo
    aCtx.strokeStyle = 'rgba(156, 166, 178, 0.42)';
    aCtx.lineWidth = 7;
    aCtx.beginPath();
    aCtx.moveTo(0, pos);
    aCtx.lineTo(size, pos);
    aCtx.stroke();

    aCtx.beginPath();
    aCtx.moveTo(pos, 0);
    aCtx.lineTo(pos, size);
    aCtx.stroke();

    // Matte dielectric tape on roughness
    rCtx.strokeStyle = 'rgb(172, 172, 172)';
    rCtx.lineWidth = 7;
    rCtx.beginPath();
    rCtx.moveTo(0, pos);
    rCtx.lineTo(size, pos);
    rCtx.moveTo(pos, 0);
    rCtx.lineTo(pos, size);
    rCtx.stroke();

    // Recessed panel groove on albedo & bump
    aCtx.strokeStyle = 'rgba(30, 36, 44, 0.72)';
    aCtx.lineWidth = 1.6;
    aCtx.beginPath();
    aCtx.moveTo(0, pos);
    aCtx.lineTo(size, pos);
    aCtx.moveTo(pos, 0);
    aCtx.lineTo(pos, size);
    aCtx.stroke();

    bCtx.strokeStyle = 'rgb(36, 36, 36)';
    bCtx.lineWidth = 2.2;
    bCtx.beginPath();
    bCtx.moveTo(0, pos);
    bCtx.lineTo(size, pos);
    bCtx.moveTo(pos, 0);
    bCtx.lineTo(pos, size);
    bCtx.stroke();
  }

  // Signature F-22/J-20 sawtooth stealth inspection doors
  const hatches: [number, number, number, number][] = [
    [160, 160, 230, 230],
    [410, 290, 490, 370],
    [660, 150, 745, 240],
    [280, 540, 365, 625],
    [545, 665, 625, 750],
    [795, 535, 885, 625],
  ];
  for (const [x0, y0, x1, y1] of hatches) {
    drawSawtoothLine(aCtx, x0, y0, x1, y0, 4, 7, 'rgba(155,165,176,0.52)', 4);
    drawSawtoothLine(aCtx, x0, y1, x1, y1, 4, -7, 'rgba(155,165,176,0.52)', 4);
    drawSawtoothLine(aCtx, x0, y0, x1, y0, 4, 7, 'rgba(26,32,40,0.82)', 1.5);
    drawSawtoothLine(aCtx, x0, y1, x1, y1, 4, -7, 'rgba(26,32,40,0.82)', 1.5);
    drawSawtoothLine(bCtx, x0, y0, x1, y0, 4, 7, 'rgb(30,30,30)', 2.2);
    drawSawtoothLine(bCtx, x0, y1, x1, y1, 4, -7, 'rgb(30,30,30)', 2.2);
  }

  // Subtle low-visibility tactical stencils & fastener dots
  aCtx.fillStyle = 'rgba(42, 49, 58, 0.55)';
  bCtx.fillStyle = 'rgb(75, 75, 75)';
  for (let y = 24; y < size; y += 128) {
    for (let x = 24; x < size; x += 32) {
      aCtx.fillRect(x, y, 2, 2);
      bCtx.fillRect(x, y, 2, 2);
    }
  }

  // Subtle low-vis tactical markings (star-bar / chevron emblem)
  aCtx.strokeStyle = 'rgba(168, 178, 190, 0.32)';
  aCtx.lineWidth = 3;
  aCtx.strokeRect(438, 438, 46, 16);
  aCtx.beginPath();
  aCtx.arc(461, 446, 12, 0, Math.PI * 2);
  aCtx.stroke();

  // --- COCKPIT MFD GLASS DISPLAY TEXTURE ---
  const mfdCanvas = document.createElement('canvas');
  mfdCanvas.width = 512;
  mfdCanvas.height = 256;
  const mCtx = mfdCanvas.getContext('2d')!;
  mCtx.fillStyle = '#051210';
  mCtx.fillRect(0, 0, 512, 256);

  // Left MFD: Tactical AESA radar scope with range rings, sweep, & air contacts
  mCtx.fillStyle = '#041214';
  mCtx.fillRect(10, 10, 236, 236);
  mCtx.strokeStyle = '#2cf598';
  mCtx.lineWidth = 2.5;
  mCtx.strokeRect(12, 12, 232, 232);
  mCtx.strokeStyle = 'rgba(44, 245, 152, 0.35)';
  mCtx.lineWidth = 1.5;
  for (const r of [38, 76, 114, 152]) {
    mCtx.beginPath();
    mCtx.arc(128, 212, r, Math.PI * 1.16, Math.PI * 1.84);
    mCtx.stroke();
  }
  // Azimuth wedge rays
  mCtx.beginPath();
  mCtx.moveTo(128, 212);
  mCtx.lineTo(44, 56);
  mCtx.moveTo(128, 212);
  mCtx.lineTo(212, 56);
  mCtx.stroke();
  // Active radar sweep beam
  mCtx.strokeStyle = '#38f8ff';
  mCtx.lineWidth = 2.2;
  mCtx.beginPath();
  mCtx.moveTo(128, 212);
  mCtx.lineTo(174, 54);
  mCtx.stroke();
  // Friendly & tracked contacts + vector tails
  mCtx.fillStyle = '#4dff9b';
  mCtx.fillRect(92, 102, 7, 7);
  mCtx.fillRect(156, 86, 7, 7);
  mCtx.strokeStyle = '#ffb84d';
  mCtx.strokeRect(122, 70, 9, 9);
  mCtx.fillStyle = '#4dff9b';
  mCtx.font = 'bold 14px monospace';
  mCtx.fillText('AESA RDR  RNG 40', 22, 34);
  mCtx.font = '12px monospace';
  mCtx.fillText('TWS  B+20  NORM', 22, 232);

  // Right MFD: Twin-engine diagnostics + attitude/fuel telemetry
  mCtx.fillStyle = '#041118';
  mCtx.fillRect(266, 10, 236, 236);
  mCtx.strokeStyle = '#38c8ff';
  mCtx.lineWidth = 2.5;
  mCtx.strokeRect(268, 12, 232, 232);
  // Artificial horizon miniature
  mCtx.fillStyle = 'rgba(28, 130, 224, 0.42)';
  mCtx.fillRect(284, 46, 108, 44);
  mCtx.fillStyle = 'rgba(138, 86, 36, 0.38)';
  mCtx.fillRect(284, 90, 108, 40);
  mCtx.strokeStyle = '#52ff9a';
  mCtx.lineWidth = 2;
  mCtx.beginPath();
  mCtx.moveTo(284, 90);
  mCtx.lineTo(392, 90);
  mCtx.stroke();
  // Dual engine RPM / EGT vertical bar graphs
  mCtx.fillStyle = 'rgba(56, 200, 255, 0.18)';
  mCtx.fillRect(408, 46, 28, 84);
  mCtx.fillRect(450, 46, 28, 84);
  mCtx.fillStyle = '#3cf5a0';
  mCtx.fillRect(411, 56, 22, 71);
  mCtx.fillRect(453, 56, 22, 71);
  mCtx.fillStyle = '#ff9c3b';
  mCtx.fillRect(411, 50, 22, 12);
  mCtx.fillRect(453, 50, 22, 12);
  // Fuel & Hydraulics status bars
  mCtx.fillStyle = 'rgba(56, 200, 255, 0.2)';
  mCtx.fillRect(284, 150, 194, 16);
  mCtx.fillStyle = '#38d6ff';
  mCtx.fillRect(286, 152, 156, 12);
  mCtx.fillStyle = '#68e3ff';
  mCtx.font = 'bold 14px monospace';
  mCtx.fillText('ENG  L:102% R:102%', 278, 34);
  mCtx.font = '12px monospace';
  mCtx.fillText('EGT 840C   HYD 4000', 284, 194);
  mCtx.fillText('INT FUEL  14,200 LB', 284, 218);

  const configureTex = (canvas: HTMLCanvasElement, isColor: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  const albedoMap = configureTex(albCanvas, true);
  const roughnessMap = configureTex(rghCanvas, false);
  const bumpMap = configureTex(bmpCanvas, false);
  const mfdMap = configureTex(mfdCanvas, true);

  return {
    albedoMap,
    roughnessMap,
    bumpMap,
    mfdMap,
    dispose: () => {
      albedoMap.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
      mfdMap.dispose();
    },
  };
}
