# 苍穹战隼 · Sky Viper — 3D Volumetric Flight Simulator

An interactive, photorealistic real-time 3D WebGL2 flight experience built with **Vite**, **TypeScript**, and **Three.js**. Pilot a modern twin-engine stealth fighter jet through physically-based blue skies, sunlit 3D raymarched volumetric cumulus clouds, and an ocean horizon.

## Highlights

- **3D Raymarched Volumetric Clouds**: Precomputed tileable `64³` Perlin-Worley FBM shape + `32³` detail erosion `Data3DTexture`s and a `256²` weather/coverage/cirrus map, lit with dual-lobe Henyey-Greenstein silver linings, 3-octave multi-scattering, Beer-Lambert + powder crevices, sky-blue ambient undersides, and aerial perspective.
- **True 3D Scene-Depth Occlusion**: Opaque scene depth is integrated directly into the cloud raymarch so the fighter jet genuinely flies into, behind, and bursts out of volumetric clouds.
- **Atmosphere, Ocean & Post-Processing**: Rayleigh + Mie sky scattering with altitude-dependent zenith deepening, high-altitude cirrus, sunlit ocean with animated wave normals and projected cloud shadows, separable HDR Gaussian bloom, and ACES Filmic tone mapping.
- **Procedural Stealth Fighter & FX**: Chined F-22/J-20-inspired twin-engine airframe with animated flaperons, stabilators, and canted rudders, procedural gunship-gray PBR panel textures, reflective gold-tinted bubble canopy, twin Mach-diamond afterburners, wingtip vortex condensation trails, over-wing high-G LEX vapor, and cloud-pierce mist tendrils.
- **6-DOF Flight, Cameras & Procedural Audio**: Scenic cloud-weaving autopilot on launch with instant manual takeover, Dynamic Chase / First-Person Cockpit HUD (with wide-angle combiner glass & dual MFDs) / Orbit cameras, lighting presets (`正午晴空 / 黄金日落 / 高空平流层`), adaptive quality scaling (`Auto / Ultra / High / Med / Low`), and procedural Web Audio jet/wind/afterburner synthesis.

## Quick Start

Requires **Node.js 18+** and a browser with **WebGL2** support.

```bash
# Install dependencies
npm install

# Start development server (http://127.0.0.1:5173)
npm run dev

# Type-check and build for production
npm run build

# Preview production build locally
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Pitch down / up |
| `A` / `D` | Roll left / right |
| `Q` / `E` | Yaw left / right |
| `Shift` / `Ctrl` | Increase / decrease throttle & afterburner |
| `Space` | Toggle Autopilot Cloud Weave / Manual control |
| `C` | Switch camera (`Chase` / `Cockpit HUD` / `Orbit`) |
| `H` | Hide / show HUD & UI overlay |
| Mouse Drag | Look around (Chase & Orbit cams) |
| Mouse Wheel | Zoom in / out (Orbit cam) |

Open the collapsible **控制 (Controls)** drawer in the top-right corner to switch lighting presets, adjust cloud density, change quality tiers, enable procedural audio, toggle optional mouse flight, or trigger **穿云突击 (Pierce Cloud)**.

## Project Structure

```text
src/
├── audio/       # Procedural Web Audio turbine, afterburner, wind & cloud-whoosh engine
├── core/        # Shared types, lighting presets, and adaptive quality profiles
├── effects/     # Mach-diamond afterburners, wingtip trails, LEX vapor, cloud-pierce mist
├── flight/      # Quaternion 6-DOF flight physics, autopilot, and Chase/Cockpit/Orbit camera rig
├── scene/       # Procedural stealth fighter, PBR textures, 3D cloud textures, ocean, sky envMap, 5-pass pipeline
├── shaders/     # WebGL2 GLSL3 atmosphere, volumetric clouds, denoise, composite, ocean & ACES/bloom shaders
├── ui/          # Collimated cockpit HUD renderer & bilingual glassmorphic overlay UI
└── main.ts      # Application bootstrap and simulation loop
```
