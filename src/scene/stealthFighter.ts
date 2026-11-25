import * as THREE from 'three';
import { createJetTextures, type JetPbrTextures } from './jetTextures';

interface FuselageStation {
  z: number;
  halfW: number;
  chineY: number;
  topCenterY: number;
  topShoulderX: number;
  topShoulderY: number;
  bottomCenterY: number;
  bottomShoulderX: number;
  bottomShoulderY: number;
}

/**
 * Lofts a seamless, razor-sharp 5th-gen chined stealth fuselage (F-22 / J-20 inspired)
 * with split hard-normal crease along the lateral stealth chine and smooth dorsal nacelles.
 */
function buildChinedFuselageGeometry(stations: FuselageStation[]): THREE.BufferGeometry {
  // Split into upper shell (left chine -> top spine -> right chine) and lower shell
  // so the stealth chine edge gets a razor-crisp normal break where sunlight glints!
  const buildShell = (isUpper: boolean): { positions: number[]; uvs: number[]; indices: number[] } => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const ringPoints = 7; // -halfW, -shoulder, -mid, 0, +mid, +shoulder, +halfW

    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      const v = (st.z + 9.6) / 18.0;
      const hw = Math.max(0.004, st.halfW);
      const sx = isUpper ? st.topShoulderX : st.bottomShoulderX;
      const sy = isUpper ? st.topShoulderY : st.bottomShoulderY;
      const cy = isUpper ? st.topCenterY : st.bottomCenterY;
      const mx = sx * 0.52;
      const my = THREE.MathUtils.lerp(cy, sy, 0.56);

      const pts: [number, number][] = isUpper
        ? [
            [-hw, st.chineY],
            [-sx, sy],
            [-mx, my],
            [0, cy],
            [mx, my],
            [sx, sy],
            [hw, st.chineY],
          ]
        : [
            [hw, st.chineY],
            [sx, sy],
            [mx, my],
            [0, cy],
            [-mx, my],
            [-sx, sy],
            [-hw, st.chineY],
          ];

      for (let p = 0; p < ringPoints; p++) {
        positions.push(pts[p][0], pts[p][1], st.z);
        uvs.push(p / (ringPoints - 1) * 1.4, v * 2.2);
      }

      if (s > 0) {
        const prevRow = (s - 1) * ringPoints;
        const currRow = s * ringPoints;
        for (let p = 0; p < ringPoints - 1; p++) {
          const a = prevRow + p;
          const b = prevRow + p + 1;
          const c = currRow + p;
          const d = currRow + p + 1;
          indices.push(a, c, b);
          indices.push(b, c, d);
        }
      }
    }
    return { positions, uvs, indices };
  };

  const upper = buildShell(true);
  const lower = buildShell(false);

  const vertOffset = upper.positions.length / 3;
  const positions = new Float32Array([...upper.positions, ...lower.positions]);
  const uvs = new Float32Array([...upper.uvs, ...lower.uvs]);
  const indices = [
    ...upper.indices,
    ...lower.indices.map((i) => i + vertOffset),
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an extruded supersonic airfoil wing / stabilator / vertical tail
 * from root chord to tip chord with true cambered airfoil thickness.
 */
function buildAirfoilSurface(params: {
  rootX: number;
  rootY: number;
  rootZLead: number;
  rootZTrail: number;
  rootThick: number;
  tipX: number;
  tipY: number;
  tipZLead: number;
  tipZTrail: number;
  tipThick: number;
}): THREE.BufferGeometry {
  const {
    rootX, rootY, rootZLead, rootZTrail, rootThick,
    tipX, tipY, tipZLead, tipZTrail, tipThick,
  } = params;

  // Supersonic biconvex/diamond-cambered airfoil profile (u in [0..1] from LE to TE)
  const profileU = [0.0, 0.14, 0.34, 0.58, 0.82, 1.0];
  const profileTop = [0.0, 0.36, 0.56, 0.48, 0.24, 0.0];
  const profileBot = [0.0, -0.22, -0.34, -0.30, -0.14, 0.0];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addRing = (
    x: number,
    y: number,
    zL: number,
    zT: number,
    thick: number,
    uSpan: number
  ) => {
    const chord = zT - zL;
    // Upper surface LE -> TE, then Lower surface TE -> LE
    for (let i = 0; i < profileU.length; i++) {
      const z = zL + chord * profileU[i];
      positions.push(x, y + profileTop[i] * thick, z);
      uvs.push(uSpan * 1.4, profileU[i] * 1.2);
    }
    for (let i = profileU.length - 2; i >= 1; i--) {
      const z = zL + chord * profileU[i];
      positions.push(x, y + profileBot[i] * thick, z);
      uvs.push(uSpan * 1.4, profileU[i] * 1.2);
    }
  };

  addRing(rootX, rootY, rootZLead, rootZTrail, rootThick, 0);
  addRing(tipX, tipY, tipZLead, tipZTrail, tipThick, 1);

  const ringCount = profileU.length + (profileU.length - 2); // 10 verts per ring
  const flip = tipX < rootX;

  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    const a = i;
    const b = next;
    const c = ringCount + i;
    const d = ringCount + next;
    if (!flip) {
      indices.push(a, b, c, b, d, c);
    } else {
      indices.push(a, c, b, b, c, d);
    }
  }

  // Cap tip cleanly
  const tipCenterIdx = ringCount * 2;
  positions.push(tipX, tipY, (tipZLead + tipZTrail) * 0.5);
  uvs.push(1.4, 0.5);
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    if (!flip) {
      indices.push(ringCount + i, ringCount + next, tipCenterIdx);
    } else {
      indices.push(ringCount + next, ringCount + i, tipCenterIdx);
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
 * Builds a sleek teardrop frameless bubble canopy dome (F-22 gold stealth coating).
 */
function buildCanopyGeometry(): THREE.BufferGeometry {
  const segsZ = 22;
  const segsArc = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const zStart = -5.55;
  const zEnd = -1.35;

  for (let iz = 0; iz <= segsZ; iz++) {
    const t = iz / segsZ;
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    // Authentic F-22 teardrop profile: steep sleek windshield, high arched crown, tapering cleanly into spine
    const profileH = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const height = profileH * 0.74;
    const halfW = Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.60;
    const baseY = THREE.MathUtils.lerp(0.32, 0.56, t) + Math.sin(t * Math.PI) * 0.06;

    for (let ia = 0; ia <= segsArc; ia++) {
      const a = (ia / segsArc) * Math.PI; // 0 (right) -> PI (left)
      const x = Math.cos(a) * halfW;
      const y = baseY + Math.pow(Math.sin(a), 0.85) * height;
      positions.push(x, y, z);
      uvs.push(ia / segsArc, t);
    }

    if (iz > 0) {
      const prev = (iz - 1) * (segsArc + 1);
      const curr = iz * (segsArc + 1);
      for (let ia = 0; ia < segsArc; ia++) {
        const a = prev + ia;
        const b = prev + ia + 1;
        const c = curr + ia;
        const d = curr + ia + 1;
        indices.push(a, b, c, b, d, c);
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

export class StealthFighter {
  /** Opaque hull, wings, control surfaces, intakes, cockpit tub -> goes in opaqueScene */
  public readonly root = new THREE.Group();
  /** Reflective gold bubble canopy & exterior glass -> goes in fxScene (Pass 4) */
  public readonly fxRoot = new THREE.Group();

  public readonly leftAileronPivot = new THREE.Group();
  public readonly rightAileronPivot = new THREE.Group();
  public readonly leftElevonPivot = new THREE.Group();
  public readonly rightElevonPivot = new THREE.Group();
  public readonly leftRudderPivot = new THREE.Group();
  public readonly rightRudderPivot = new THREE.Group();
  public readonly nozzleLeftTop = new THREE.Mesh();
  public readonly nozzleLeftBot = new THREE.Mesh();
  public readonly nozzleRightTop = new THREE.Mesh();
  public readonly nozzleRightBot = new THREE.Mesh();

  private readonly pilotGroup = new THREE.Group();
  private readonly cockpitFrameGroup = new THREE.Group();
  private readonly canopyGlassMesh: THREE.Mesh;
  private readonly canopyMat: THREE.ShaderMaterial;
  private readonly nozzleGlowMat: THREE.MeshBasicMaterial;
  private readonly textures: JetPbrTextures;
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];

  // Exact local-space anchor points for flight FX
  public readonly leftWingtipLocal = new THREE.Vector3(-6.75, -0.02, 3.15);
  public readonly rightWingtipLocal = new THREE.Vector3(6.75, -0.02, 3.15);
  public readonly leftEngineLocal = new THREE.Vector3(-0.84, 0.08, 8.35);
  public readonly rightEngineLocal = new THREE.Vector3(0.84, 0.08, 8.35);
  public readonly cockpitEyeLocal = new THREE.Vector3(0, 0.88, -3.72);

  constructor() {
    this.textures = createJetTextures();

    // Primary Have Glass V satin metallic gunship-gray RAM material
    const airframeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.albedoMap,
      roughnessMap: this.textures.roughnessMap,
      bumpMap: this.textures.bumpMap,
      bumpScale: 0.028,
      metalness: 0.48,
      roughness: 0.72,
      envMapIntensity: 1.35,
    });

    // Darker matte dielectric stealth radome & leading-edge composite
    const darkStealthMat = new THREE.MeshStandardMaterial({
      color: 0x3b434d,
      roughnessMap: this.textures.roughnessMap,
      metalness: 0.34,
      roughness: 0.62,
      envMapIntensity: 1.1,
    });

    // Dark titanium/carbon exhaust shroud & vectoring nozzles
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x252a30,
      metalness: 0.84,
      roughness: 0.32,
      envMapIntensity: 1.6,
    });

    // Recessed matte black intake interior & cockpit anti-glare
    const matteBlackMat = new THREE.MeshStandardMaterial({
      color: 0x0d1014,
      metalness: 0.15,
      roughness: 0.88,
    });

    // Incandescent inner turbine afterburner ring glow
    this.nozzleGlowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 0.78, 0.25),
    });

    const mfdMat = new THREE.MeshBasicMaterial({
      map: this.textures.mfdMap,
    });

    this.disposableMaterials.push(
      airframeMat,
      darkStealthMat,
      titaniumMat,
      matteBlackMat,
      this.nozzleGlowMat,
      mfdMat
    );

    // 1. LOFTED CHINED STEALTH FUSELAGE (20 precision stations, nose -9.6m -> tail +8.3m)
    const stations: FuselageStation[] = [
      { z: -9.60, halfW: 0.01, chineY: -0.02, topCenterY: 0.01, topShoulderX: 0.008, topShoulderY: 0.00, bottomCenterY: -0.04, bottomShoulderX: 0.008, bottomShoulderY: -0.03 },
      { z: -8.90, halfW: 0.28, chineY: 0.02, topCenterY: 0.15, topShoulderX: 0.16, topShoulderY: 0.10, bottomCenterY: -0.14, bottomShoulderX: 0.16, bottomShoulderY: -0.09 },
      { z: -7.80, halfW: 0.56, chineY: 0.07, topCenterY: 0.29, topShoulderX: 0.34, topShoulderY: 0.21, bottomCenterY: -0.27, bottomShoulderX: 0.34, bottomShoulderY: -0.19 },
      { z: -6.50, halfW: 0.82, chineY: 0.12, topCenterY: 0.42, topShoulderX: 0.54, topShoulderY: 0.32, bottomCenterY: -0.40, bottomShoulderX: 0.54, bottomShoulderY: -0.30 },
      { z: -5.40, halfW: 1.02, chineY: 0.15, topCenterY: 0.44, topShoulderX: 0.68, topShoulderY: 0.39, bottomCenterY: -0.49, bottomShoulderX: 0.68, bottomShoulderY: -0.38 },
      // Cockpit recess zone (flattened upper deck so cockpit tub & bubble canopy sit cleanly)
      { z: -4.20, halfW: 1.38, chineY: 0.16, topCenterY: 0.45, topShoulderX: 0.82, topShoulderY: 0.44, bottomCenterY: -0.58, bottomShoulderX: 0.88, bottomShoulderY: -0.47 },
      { z: -2.90, halfW: 1.72, chineY: 0.14, topCenterY: 0.52, topShoulderX: 1.05, topShoulderY: 0.50, bottomCenterY: -0.62, bottomShoulderX: 1.15, bottomShoulderY: -0.52 },
      // LERX widening + twin dorsal engine spine behind canopy
      { z: -1.50, halfW: 2.02, chineY: 0.10, topCenterY: 0.70, topShoulderX: 1.24, topShoulderY: 0.64, bottomCenterY: -0.64, bottomShoulderX: 1.38, bottomShoulderY: -0.54 },
      { z: 0.10, halfW: 2.12, chineY: 0.06, topCenterY: 0.68, topShoulderX: 1.34, topShoulderY: 0.66, bottomCenterY: -0.64, bottomShoulderX: 1.48, bottomShoulderY: -0.54 },
      { z: 2.00, halfW: 2.04, chineY: 0.04, topCenterY: 0.60, topShoulderX: 1.36, topShoulderY: 0.62, bottomCenterY: -0.60, bottomShoulderX: 1.44, bottomShoulderY: -0.51 },
      { z: 4.10, halfW: 1.92, chineY: 0.05, topCenterY: 0.50, topShoulderX: 1.30, topShoulderY: 0.57, bottomCenterY: -0.54, bottomShoulderX: 1.36, bottomShoulderY: -0.46 },
      { z: 5.90, halfW: 1.76, chineY: 0.07, topCenterY: 0.40, topShoulderX: 1.22, topShoulderY: 0.52, bottomCenterY: -0.45, bottomShoulderX: 1.24, bottomShoulderY: -0.39 },
      { z: 7.40, halfW: 1.54, chineY: 0.08, topCenterY: 0.28, topShoulderX: 1.12, topShoulderY: 0.44, bottomCenterY: -0.34, bottomShoulderX: 1.10, bottomShoulderY: -0.30 },
      { z: 8.20, halfW: 1.32, chineY: 0.08, topCenterY: 0.14, topShoulderX: 0.96, topShoulderY: 0.26, bottomCenterY: -0.18, bottomShoulderX: 0.94, bottomShoulderY: -0.16 },
    ];

    const fuselageGeo = buildChinedFuselageGeometry(stations);
    this.disposableGeometries.push(fuselageGeo);
    const fuselageMesh = new THREE.Mesh(fuselageGeo, airframeMat);
    this.root.add(fuselageMesh);

    // Sculpted dark stealth radome nosecap (-9.62 -> -6.85)
    const radomeStations = stations.slice(0, 4).map((s) => ({
      ...s,
      halfW: s.halfW * 1.012,
      topCenterY: s.topCenterY * 1.012,
      topShoulderY: s.topShoulderY * 1.012,
      bottomCenterY: s.bottomCenterY * 1.012,
      bottomShoulderY: s.bottomShoulderY * 1.012,
    }));
    const radomeGeo = buildChinedFuselageGeometry(radomeStations);
    this.disposableGeometries.push(radomeGeo);
    const radomeMesh = new THREE.Mesh(radomeGeo, darkStealthMat);
    this.root.add(radomeMesh);

    // Twin dorsal engine nacelle fairings for realistic F-22 twin-spine silhouette
    const nacelleGeo = new THREE.CylinderGeometry(0.46, 0.56, 8.2, 16);
    nacelleGeo.rotateX(Math.PI / 2);
    nacelleGeo.scale(1.18, 0.72, 1.0);
    this.disposableGeometries.push(nacelleGeo);
    for (const side of [-1, 1]) {
      const nac = new THREE.Mesh(nacelleGeo, airframeMat);
      nac.position.set(side * 0.82, 0.24, 3.25);
      this.root.add(nac);
    }

    // 2. CARET STEALTH AIR INTAKES (angled DSI intakes under LERX)
    for (const side of [-1, 1]) {
      const intakeGroup = new THREE.Group();
      const hoodGeo = new THREE.BoxGeometry(0.95, 0.68, 4.1);
      this.disposableGeometries.push(hoodGeo);
      const hood = new THREE.Mesh(hoodGeo, airframeMat);
      hood.position.set(side * 1.38, -0.14, -1.55);
      hood.rotation.y = side * 0.08;
      hood.rotation.z = side * -0.22;
      intakeGroup.add(hood);

      // Angled caret lip
      const lipGeo = new THREE.BoxGeometry(0.98, 0.72, 0.24);
      this.disposableGeometries.push(lipGeo);
      const lip = new THREE.Mesh(lipGeo, darkStealthMat);
      lip.position.set(side * 1.34, -0.13, -3.62);
      lip.rotation.set(0.28, side * 0.34, side * -0.22);
      intakeGroup.add(lip);

      // Dark recessed intake duct mouth
      const mouthGeo = new THREE.PlaneGeometry(0.76, 0.52);
      this.disposableGeometries.push(mouthGeo);
      const mouth = new THREE.Mesh(mouthGeo, matteBlackMat);
      mouth.position.set(side * 1.34, -0.14, -3.74);
      mouth.rotation.set(0.26, Math.PI + side * 0.32, 0);
      intakeGroup.add(mouth);

      this.root.add(intakeGroup);
    }

    // 3. SWEPT TRAPEZOIDAL MAIN WINGS (supersonic airfoil cross-section)
    for (const side of [-1, 1]) {
      const wingGeo = buildAirfoilSurface({
        rootX: side * 1.82,
        rootY: 0.04,
        rootZLead: -2.05,
        rootZTrail: 4.15,
        rootThick: 0.34,
        tipX: side * 6.80,
        tipY: -0.04,
        tipZLead: 2.38,
        tipZTrail: 3.62,
        tipThick: 0.085,
      });
      this.disposableGeometries.push(wingGeo);
      const wing = new THREE.Mesh(wingGeo, airframeMat);
      this.root.add(wing);

      // Leading-edge dark RAM stealth strip
      const leGeo = buildAirfoilSurface({
        rootX: side * 1.82,
        rootY: 0.045,
        rootZLead: -2.18,
        rootZTrail: -1.55,
        rootThick: 0.22,
        tipX: side * 6.82,
        tipY: -0.038,
        tipZLead: 2.28,
        tipZTrail: 2.62,
        tipThick: 0.075,
      });
      this.disposableGeometries.push(leGeo);
      const leMesh = new THREE.Mesh(leGeo, darkStealthMat);
      this.root.add(leMesh);

      // Animated Flaperons / Ailerons hinged along wing trailing edge
      const aileronPivot = side < 0 ? this.leftAileronPivot : this.rightAileronPivot;
      aileronPivot.position.set(side * 4.35, -0.01, 3.85);
      const ailGeo = buildAirfoilSurface({
        rootX: -side * 1.75,
        rootY: 0,
        rootZLead: -0.18,
        rootZTrail: 0.56,
        rootThick: 0.11,
        tipX: side * 1.95,
        tipY: -0.02,
        tipZLead: -0.34,
        tipZTrail: 0.28,
        tipThick: 0.07,
      });
      this.disposableGeometries.push(ailGeo);
      const ailMesh = new THREE.Mesh(ailGeo, darkStealthMat);
      aileronPivot.add(ailMesh);
      this.root.add(aileronPivot);

      // Wingtip navigation light (Port = Red, Starboard = Emerald Green)
      const navGeo = new THREE.SphereGeometry(0.065, 8, 8);
      const navMat = new THREE.MeshBasicMaterial({
        color: side < 0 ? new THREE.Color(2.6, 0.18, 0.12) : new THREE.Color(0.18, 2.5, 0.55),
      });
      this.disposableGeometries.push(navGeo);
      this.disposableMaterials.push(navMat);
      const navLight = new THREE.Mesh(navGeo, navMat);
      navLight.position.set(side * 6.76, -0.02, 2.75);
      this.root.add(navLight);
    }

    // 4. ALL-MOVING HORIZONTAL STABILATORS (ELEVONS)
    for (const side of [-1, 1]) {
      const pivot = side < 0 ? this.leftElevonPivot : this.rightElevonPivot;
      pivot.position.set(side * 1.65, 0.03, 6.75);
      const stabGeo = buildAirfoilSurface({
        rootX: 0,
        rootY: 0,
        rootZLead: -1.35,
        rootZTrail: 1.55,
        rootThick: 0.17,
        tipX: side * 2.58,
        tipY: -0.08,
        tipZLead: 0.55,
        tipZTrail: 1.88,
        tipThick: 0.06,
      });
      this.disposableGeometries.push(stabGeo);
      const stabMesh = new THREE.Mesh(stabGeo, airframeMat);
      pivot.add(stabMesh);
      this.root.add(pivot);
    }

    // 5. TWIN OUTWARD-CANTED VERTICAL TAILS (28 deg stealth cant) + ANIMATED RUDDERS
    for (const side of [-1, 1]) {
      const tailHolder = new THREE.Group();
      tailHolder.position.set(side * 1.24, 0.36, 5.75);
      tailHolder.rotation.z = -side * THREE.MathUtils.degToRad(27);

      // Vertical stabilizer sculpted via airfoil rotated 90 deg around Z
      const vFinGeo = buildAirfoilSurface({
        rootX: 0,
        rootY: 0,
        rootZLead: -1.45,
        rootZTrail: 1.55,
        rootThick: 0.16,
        tipX: 2.65,
        tipY: 0,
        tipZLead: 0.65,
        tipZTrail: 2.15,
        tipThick: 0.055,
      });
      vFinGeo.rotateZ(Math.PI / 2);
      this.disposableGeometries.push(vFinGeo);
      const vFin = new THREE.Mesh(vFinGeo, airframeMat);
      tailHolder.add(vFin);

      // Animated rudder at trailing edge of each vertical tail
      const rudderPivot = side < 0 ? this.leftRudderPivot : this.rightRudderPivot;
      rudderPivot.position.set(0, 1.15, 1.55);
      const rudGeo = buildAirfoilSurface({
        rootX: -0.85,
        rootY: 0,
        rootZLead: -0.14,
        rootZTrail: 0.54,
        rootThick: 0.09,
        tipX: 1.15,
        tipY: 0,
        tipZLead: 0.14,
        tipZTrail: 0.66,
        tipThick: 0.05,
      });
      rudGeo.rotateZ(Math.PI / 2);
      this.disposableGeometries.push(rudGeo);
      const rudMesh = new THREE.Mesh(rudGeo, darkStealthMat);
      rudderPivot.add(rudMesh);
      tailHolder.add(rudderPivot);

      this.root.add(tailHolder);
    }

    // 6. TWIN 2D THRUST-VECTORING STEALTH EXHAUST NOZZLES
    const shroudGeo = new THREE.BoxGeometry(1.12, 0.58, 1.38);
    const paddleGeo = new THREE.BoxGeometry(0.92, 0.09, 0.72);
    const coreGeo = new THREE.PlaneGeometry(0.84, 0.36);
    this.disposableGeometries.push(shroudGeo, paddleGeo, coreGeo);

    for (const side of [-1, 1]) {
      const x = side * 0.84;
      const shroud = new THREE.Mesh(shroudGeo, titaniumMat);
      shroud.position.set(x, 0.08, 7.65);
      this.root.add(shroud);

      // Upper & lower thrust-vectoring petals
      const topPaddle = side < 0 ? this.nozzleLeftTop : this.nozzleRightTop;
      const botPaddle = side < 0 ? this.nozzleLeftBot : this.nozzleRightBot;
      topPaddle.geometry = paddleGeo;
      topPaddle.material = titaniumMat;
      topPaddle.position.set(x, 0.30, 8.32);
      botPaddle.geometry = paddleGeo;
      botPaddle.material = titaniumMat;
      botPaddle.position.set(x, -0.14, 8.32);
      this.root.add(topPaddle, botPaddle);

      // Glowing turbine flame-holder core inside nozzle
      const core = new THREE.Mesh(coreGeo, this.nozzleGlowMat);
      core.position.set(x, 0.08, 8.36);
      this.root.add(core);
    }

    // 7. COCKPIT INTERIOR (Anti-glare glare-shield, Twin MFDs, Seat, Pilot, Cockpit Cam Frame)
    const tubGeo = new THREE.BoxGeometry(0.96, 0.35, 3.2);
    this.disposableGeometries.push(tubGeo);
    const tub = new THREE.Mesh(tubGeo, matteBlackMat);
    tub.position.set(0, 0.42, -3.55);
    this.root.add(tub);

    // Instrument glare-shield + glowing glass MFD panel (visible from outside & cockpit)
    const dashGeo = new THREE.BoxGeometry(0.92, 0.20, 0.72);
    const mfdGeo = new THREE.PlaneGeometry(0.68, 0.28);
    this.disposableGeometries.push(dashGeo, mfdGeo);
    const dash = new THREE.Mesh(dashGeo, matteBlackMat);
    dash.position.set(0, 0.56, -4.64);
    dash.rotation.x = 0.16;
    this.root.add(dash);

    const mfdPanel = new THREE.Mesh(mfdGeo, mfdMat);
    mfdPanel.position.set(0, 0.49, -4.27);
    mfdPanel.rotation.x = -0.32;
    this.root.add(mfdPanel);

    // Pilot & ACES II ejection seat (visible in Chase/Orbit cam; hidden in Cockpit cam)
    const seatGeo = new THREE.BoxGeometry(0.46, 0.66, 0.24);
    const headGeo = new THREE.SphereGeometry(0.175, 16, 14);
    const visorGeo = new THREE.SphereGeometry(0.18, 16, 12, -Math.PI * 0.4, Math.PI * 0.8, 0.5, 1.0);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x313842,
      metalness: 0.45,
      roughness: 0.32,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xd4a438,
      metalness: 0.92,
      roughness: 0.08,
      envMapIntensity: 2.0,
    });
    this.disposableGeometries.push(seatGeo, headGeo, visorGeo);
    this.disposableMaterials.push(helmetMat, visorMat);

    const seat = new THREE.Mesh(seatGeo, matteBlackMat);
    seat.position.set(0, 0.68, -3.22);
    seat.rotation.x = -0.24;
    const helmet = new THREE.Mesh(headGeo, helmetMat);
    helmet.position.set(0, 0.86, -3.48);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.86, -3.50);
    visor.rotation.y = Math.PI;
    this.pilotGroup.add(seat, helmet, visor);
    this.root.add(this.pilotGroup);

    // Authentic F-22 Frameless Bubble-Canopy First-Person Cockpit Structure
    // Sleek sculpted coaming brow, angled backlit MFD consoles, Master Caution LEDs,
    // slim diffractive HUD combiner brackets, and continuous side canopy sill rails!
    const coamingMat = new THREE.MeshStandardMaterial({
      color: 0x161a20,
      metalness: 0.28,
      roughness: 0.72,
      envMapIntensity: 0.8,
    });
    const hudGlassMat = new THREE.MeshBasicMaterial({
      color: 0x3cff9a,
      transparent: true,
      opacity: 0.038,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ledGreenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.2, 0.9) });
    const ledAmberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.35, 0.25) });
    this.disposableMaterials.push(coamingMat, hudGlassMat, ledGreenMat, ledAmberMat);

    // Sculpted trapezoidal glareshield coaming across lower cockpit
    const browGeo = new THREE.CylinderGeometry(0.44, 0.56, 0.58, 18, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
    browGeo.rotateX(Math.PI / 2);
    browGeo.scale(1.22, 0.38, 1.0);
    const consoleSlopeGeo = new THREE.BoxGeometry(0.76, 0.21, 0.04);
    const cockpitMfdGeo = new THREE.PlaneGeometry(0.68, 0.185);
    const railGeo = new THREE.BoxGeometry(0.05, 0.055, 2.4);
    const sideSlopeGeo = new THREE.BoxGeometry(0.28, 0.05, 1.4);
    // Wide-angle F-22/J-20 diffractive holographic HUD combiner (frameless upper rim so full HUD sits inside!)
    const hudPostGeo = new THREE.BoxGeometry(0.0065, 0.30, 0.012);
    const hudBarGeo = new THREE.BoxGeometry(0.47, 0.007, 0.014);
    const hudGlassGeo = new THREE.PlaneGeometry(0.46, 0.31);
    const hudEdgeGeo = new THREE.BoxGeometry(0.462, 0.0022, 0.003);
    const ledGeo = new THREE.BoxGeometry(0.020, 0.007, 0.008);
    this.disposableGeometries.push(
      browGeo,
      consoleSlopeGeo,
      cockpitMfdGeo,
      railGeo,
      sideSlopeGeo,
      hudPostGeo,
      hudBarGeo,
      hudGlassGeo,
      hudEdgeGeo,
      ledGeo
    );

    const brow = new THREE.Mesh(browGeo, coamingMat);
    brow.position.set(0, 0.54, -4.50);
    this.cockpitFrameGroup.add(brow);

    // Angled pilot-facing dual-MFD console positioned cleanly below the HUD combiner base
    const consoleBack = new THREE.Mesh(consoleSlopeGeo, coamingMat);
    consoleBack.position.set(0, 0.610, -4.27);
    consoleBack.rotation.x = -0.22;
    this.cockpitFrameGroup.add(consoleBack);

    const cockpitMfd = new THREE.Mesh(cockpitMfdGeo, mfdMat);
    cockpitMfd.position.set(0, 0.615, -4.248);
    cockpitMfd.rotation.x = -0.22;
    this.cockpitFrameGroup.add(cockpitMfd);

    // Subtle illuminated glareshield status annunciators (Master Arm / A/P / Warn)
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(ledGeo, i === 2 ? ledAmberMat : ledGreenMat);
      led.position.set(-0.31 + i * 0.032, 0.728, -4.32);
      this.cockpitFrameGroup.add(led);
    }
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(ledGeo, ledGreenMat);
      led.position.set(0.24 + i * 0.032, 0.728, -4.32);
      this.cockpitFrameGroup.add(led);
    }

    // Continuous sleek side canopy sill rails & shoulder consoles
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, coamingMat);
      rail.position.set(side * 0.55, 0.58, -4.15);
      rail.rotation.y = -side * 0.14;
      this.cockpitFrameGroup.add(rail);

      const sill = new THREE.Mesh(sideSlopeGeo, coamingMat);
      sill.position.set(side * 0.48, 0.51, -4.25);
      sill.rotation.z = side * 0.25;
      this.cockpitFrameGroup.add(sill);

      // Slim dark-titanium side support arms for wide-angle HUD combiner glass
      const post = new THREE.Mesh(hudPostGeo, titaniumMat);
      post.position.set(side * 0.236, 0.895, -4.24);
      post.rotation.x = -0.26;
      this.cockpitFrameGroup.add(post);
    }
    const hudBase = new THREE.Mesh(hudBarGeo, titaniumMat);
    hudBase.position.set(0, 0.748, -4.205);
    const hudGlass = new THREE.Mesh(hudGlassGeo, hudGlassMat);
    hudGlass.position.set(0, 0.898, -4.245);
    hudGlass.rotation.x = -0.26;
    // Faint optical emerald refraction glint along top beveled edge of frameless glass combiner
    const hudTopEdgeMat = new THREE.MeshBasicMaterial({
      color: 0x52ffa8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.disposableMaterials.push(hudTopEdgeMat);
    const hudTopEdge = new THREE.Mesh(hudEdgeGeo, hudTopEdgeMat);
    hudTopEdge.position.set(0, 1.045, -4.285);
    this.cockpitFrameGroup.add(hudBase, hudGlass, hudTopEdge);

    this.cockpitFrameGroup.visible = false;
    this.root.add(this.cockpitFrameGroup);

    // 8. REFLECTIVE GOLD-TINTED FRAMELESS BUBBLE CANOPY (Pass 4 fxScene for clean transparency)
    const canopyGeo = buildCanopyGeometry();
    this.disposableGeometries.push(canopyGeo);

    this.canopyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.6).normalize() },
        uSunColor: { value: new THREE.Color(1, 0.97, 0.92) },
        uSkyZenith: { value: new THREE.Color(0.06, 0.22, 0.58) },
        uSkyHorizon: { value: new THREE.Color(0.55, 0.78, 0.96) },
        uCloudAtten: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        out vec3 vWorldPos;
        out vec3 vWorldNormal;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec3 vWorldPos;
        in vec3 vWorldNormal;
        out vec4 fragColor;

        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform float uCloudAtten;

        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float ndotv = max(dot(N, V), 0.0);

          // Metallic indium-tin-oxide gold radar-reflective stealth canopy Fresnel
          float fresnel = 0.22 + 0.78 * pow(1.0 - ndotv, 3.2);
          vec3 R = reflect(-V, N);

          // Sky + sunlit cloud belt reflection on gold-tinted glass
          vec3 skyRefl = mix(uSkyHorizon * 1.15, uSkyZenith * 1.4, pow(max(R.y, 0.0), 0.65));
          if (R.y < 0.0) {
            skyRefl = mix(uSkyHorizon * 0.85, vec3(0.12, 0.16, 0.22), clamp(-R.y * 3.0, 0.0, 1.0));
          }

          // Signature warm amber-gold ITO stealth canopy tint
          vec3 goldTint = vec3(1.18, 0.88, 0.42);
          vec3 baseDark = vec3(0.08, 0.07, 0.05);

          // Crisp solar glint on curved bubble canopy
          vec3 H = normalize(uSunDir + V);
          float specSharp = pow(max(dot(N, H), 0.0), 260.0) * 5.2;
          float specBroad = pow(max(dot(N, H), 0.0), 28.0) * 0.55;
          vec3 sunSpec = uSunColor * (specSharp + specBroad) * vec3(1.05, 0.92, 0.68);

          vec3 col = mix(baseDark, skyRefl * goldTint, fresnel) + sunSpec;
          float alpha = clamp(0.46 + fresnel * 0.48 + specSharp * 0.2, 0.44, 0.96) * uCloudAtten;
          fragColor = vec4(col, alpha);
        }
      `,
    });

    this.canopyGlassMesh = new THREE.Mesh(canopyGeo, this.canopyMat);
    this.fxRoot.add(this.canopyGlassMesh);
  }

  public setCockpitView(isCockpit: boolean): void {
    this.pilotGroup.visible = !isCockpit;
    this.canopyGlassMesh.visible = !isCockpit;
    this.cockpitFrameGroup.visible = isCockpit;
  }

  public updateVisuals(params: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    pitchCmd: number;
    rollCmd: number;
    yawCmd: number;
    throttle: number;
    afterburner: number;
    sunDir: THREE.Vector3;
    sunColor: THREE.Color;
    skyZenith: THREE.Color;
    skyHorizon: THREE.Color;
    cloudAtten: number;
  }): void {
    this.root.position.copy(params.position);
    this.root.quaternion.copy(params.quaternion);
    this.fxRoot.position.copy(params.position);
    this.fxRoot.quaternion.copy(params.quaternion);

    // Animated flight control surfaces (realistic deflection angles!)
    const maxAil = 0.42;
    const maxElev = 0.45;
    const maxRud = 0.38;

    this.leftAileronPivot.rotation.x = THREE.MathUtils.clamp(
      params.rollCmd * maxAil + params.pitchCmd * 0.14,
      -0.48,
      0.48
    );
    this.rightAileronPivot.rotation.x = THREE.MathUtils.clamp(
      -params.rollCmd * maxAil + params.pitchCmd * 0.14,
      -0.48,
      0.48
    );

    // All-moving horizontal stabilators (pitch + differential roll!)
    this.leftElevonPivot.rotation.x = THREE.MathUtils.clamp(
      -params.pitchCmd * maxElev + params.rollCmd * 0.22,
      -0.52,
      0.52
    );
    this.rightElevonPivot.rotation.x = THREE.MathUtils.clamp(
      -params.pitchCmd * maxElev - params.rollCmd * 0.22,
      -0.52,
      0.52
    );

    // Twin canted rudders
    this.leftRudderPivot.rotation.y = THREE.MathUtils.clamp(params.yawCmd * maxRud, -0.4, 0.4);
    this.rightRudderPivot.rotation.y = THREE.MathUtils.clamp(params.yawCmd * maxRud, -0.4, 0.4);

    // 2D thrust-vectoring nozzle petals deflect subtly with pitch & open wider on afterburner
    const tvcAngle = -params.pitchCmd * 0.24;
    const abSpread = params.afterburner * 0.08;
    this.nozzleLeftTop.rotation.x = tvcAngle - abSpread;
    this.nozzleRightTop.rotation.x = tvcAngle - abSpread;
    this.nozzleLeftBot.rotation.x = tvcAngle + abSpread;
    this.nozzleRightBot.rotation.x = tvcAngle + abSpread;

    // Nozzle interior incandescent glow scales with throttle & afterburner
    const glow = 0.35 + params.throttle * 1.1 + params.afterburner * 3.8;
    this.nozzleGlowMat.color.setRGB(
      glow * (1.0 + params.afterburner * 0.3),
      glow * (0.38 + params.afterburner * 0.36),
      glow * (0.14 + params.afterburner * 0.42)
    );

    // Update canopy reflection uniforms
    const cu = this.canopyMat.uniforms;
    cu.uSunDir.value.copy(params.sunDir);
    cu.uSunColor.value.copy(params.sunColor);
    cu.uSkyZenith.value.copy(params.skyZenith);
    cu.uSkyHorizon.value.copy(params.skyHorizon);
    cu.uCloudAtten.value = params.cloudAtten;
  }

  public dispose(): void {
    this.textures.dispose();
    for (const g of this.disposableGeometries) g.dispose();
    for (const m of this.disposableMaterials) m.dispose();
    this.canopyMat.dispose();
  }
}
