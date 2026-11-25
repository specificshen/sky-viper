import { LIGHTING_PRESETS, QUALITY_PROFILES } from '../core/presets';
import type {
  CameraMode,
  FlightTelemetry,
  LightingPresetId,
  QualitySetting,
  ResolvedQuality,
  SimSettings,
} from '../core/types';

export interface OverlayCallbacks {
  onLightingChange: (preset: LightingPresetId) => void;
  onCameraChange: (mode: CameraMode) => void;
  onQualityChange: (quality: QualitySetting) => void;
  onCloudDensityChange: (density: number) => void;
  onToggleAutopilot: () => void;
  onToggleMouseFlight: () => void;
  onToggleAudio: () => void;
  onDiveCloud: () => void;
  onToggleHideUi: () => void;
}

export class OverlayUI {
  private readonly root: HTMLElement;
  private readonly callbacks: OverlayCallbacks;
  private drawerOpen = false;
  private toastTimer = 0;

  // Live DOM elements
  private brandDot!: HTMLElement;
  private modeSub!: HTMLElement;
  private valMach!: HTMLElement;
  private valAlt!: HTMLElement;
  private valG!: HTMLElement;
  private valHdg!: HTMLElement;
  private fpsEl!: HTMLElement;
  private thrFill!: HTMLElement;
  private thrLabel!: HTMLElement;
  private toastEl!: HTMLElement;
  private cloudBadgeEl!: HTMLElement;
  private drawerEl!: HTMLElement;
  private drawerBtn!: HTMLButtonElement;
  private apBtn!: HTMLButtonElement;
  private camQuickBtn!: HTMLButtonElement;
  private audioBtn!: HTMLButtonElement;
  private cloudValEl!: HTMLElement;
  private cloudSlider!: HTMLInputElement;
  private rendererNoteEl!: HTMLElement;

  constructor(
    container: HTMLElement,
    initialSettings: SimSettings,
    rendererLabel: string,
    resolvedQuality: ResolvedQuality,
    callbacks: OverlayCallbacks
  ) {
    this.root = container;
    this.callbacks = callbacks;
    this.buildDom(initialSettings, rendererLabel, resolvedQuality);
  }

  private buildDom(
    settings: SimSettings,
    rendererLabel: string,
    resolvedQuality: ResolvedQuality
  ): void {
    this.root.innerHTML = `
      <div class="telemetry-bar glass-panel hideable">
        <div class="brand-chip">
          <div class="brand-title">
            <span class="brand-dot autopilot" id="brand-dot"></span>
            <span>苍穹战隼 · SKY VIPER</span>
          </div>
          <div class="brand-sub" id="mode-sub">AUTOPILOT CRUISE</div>
        </div>
        <div class="metrics-row">
          <div class="metric">
            <span class="metric-label">速度 MACH</span>
            <span class="metric-value" id="val-mach">0.88</span>
          </div>
          <div class="metric">
            <span class="metric-label">高度 ALT</span>
            <span class="metric-value" id="val-alt">2280<span class="metric-unit">m</span></span>
          </div>
          <div class="metric">
            <span class="metric-label">过载 G</span>
            <span class="metric-value" id="val-g">1.0</span>
          </div>
          <div class="metric">
            <span class="metric-label">航向 HDG</span>
            <span class="metric-value" id="val-hdg">035°</span>
          </div>
        </div>
      </div>

      <div class="top-right-wrap hideable">
        <div class="quick-actions glass-panel">
          <button class="icon-btn" id="btn-cam" title="切换视角 (C)">视角 Chase</button>
          <button class="icon-btn ap-active" id="btn-ap" title="自动巡航 (Space)">巡航 A/P</button>
          <button class="icon-btn" id="btn-audio" title="音效开关 (M)">音效 Off</button>
          <button class="icon-btn" id="btn-drawer" title="展开控制面板">控制 ▾</button>
          <span class="fps-pill" id="fps-pill">-- FPS</span>
        </div>

        <div class="controls-drawer glass-panel collapsed" id="controls-drawer">
          <div class="ctrl-group">
            <div class="ctrl-header">
              <span>光照时间 · LIGHTING</span>
            </div>
            <div class="seg-row cols-3" id="lighting-group">
              ${(['midday', 'sunset', 'stratosphere'] as LightingPresetId[])
                .map((id) => {
                  const p = LIGHTING_PRESETS[id];
                  return `<button class="seg-btn ${settings.lighting === id ? 'active' : ''}" data-lighting="${id}">${p.labelZh}<span class="seg-sub">${p.labelEn}</span></button>`;
                })
                .join('')}
            </div>
          </div>

          <div class="ctrl-group">
            <div class="ctrl-header">
              <span>云层密度 · CLOUD DENSITY</span>
              <span class="ctrl-val" id="cloud-val">${Math.round(settings.cloudDensity * 100)}%</span>
            </div>
            <input type="range" class="styled-slider" id="cloud-slider" min="0.25" max="1.40" step="0.05" value="${settings.cloudDensity}" />
          </div>

          <div class="ctrl-group">
            <div class="ctrl-header">
              <span>摄像机视角 · CAMERA (C)</span>
            </div>
            <div class="seg-row cols-3" id="camera-group">
              <button class="seg-btn ${settings.cameraMode === 'chase' ? 'active' : ''}" data-cam="chase">追踪<span class="seg-sub">Chase</span></button>
              <button class="seg-btn ${settings.cameraMode === 'cockpit' ? 'active' : ''}" data-cam="cockpit">座舱 HUD<span class="seg-sub">Cockpit</span></button>
              <button class="seg-btn ${settings.cameraMode === 'orbit' ? 'active' : ''}" data-cam="orbit">环绕<span class="seg-sub">Orbit</span></button>
            </div>
          </div>

          <div class="ctrl-group">
            <div class="ctrl-header">
              <span>渲染画质 · QUALITY</span>
            </div>
            <div class="seg-row cols-5" id="quality-group">
              <button class="seg-btn ${settings.quality === 'auto' ? 'active' : ''}" data-quality="auto">自动<span class="seg-sub">Auto</span></button>
              ${(['ultra', 'high', 'medium', 'low'] as ResolvedQuality[])
                .map((q) => {
                  const p = QUALITY_PROFILES[q];
                  return `<button class="seg-btn ${settings.quality === q ? 'active' : ''}" data-quality="${q}">${p.labelZh}<span class="seg-sub">${p.labelEn}</span></button>`;
                })
                .join('')}
            </div>
          </div>

          <div class="ctrl-group">
            <div class="ctrl-header">
              <span>飞行辅助 · FLIGHT ACTIONS</span>
            </div>
            <div class="seg-row cols-2">
              <button class="seg-btn" id="btn-mouse">鼠标操控<span class="seg-sub">Mouse Flight</span></button>
              <button class="seg-btn" id="btn-dive-cloud">穿云突击<span class="seg-sub">Pierce Cloud</span></button>
            </div>
            <div class="seg-row cols-2">
              <button class="seg-btn" id="btn-hide-ui">纯净视图 (H)<span class="seg-sub">Hide UI</span></button>
              <button class="seg-btn" id="btn-drawer-close">收起面板<span class="seg-sub">Collapse</span></button>
            </div>
          </div>

          <div class="renderer-note" id="renderer-note">
            <span>${rendererLabel}</span>
            <span>→ ${resolvedQuality.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div class="throttle-gauge glass-panel hideable">
        <div class="throttle-track">
          <div class="throttle-fill" id="thr-fill"></div>
        </div>
        <span class="throttle-label" id="thr-label">MIL 75%</span>
      </div>

      <div class="bottom-strip glass-panel hideable">
        <span class="key-hint"><kbd>W</kbd><kbd>S</kbd> 俯仰</span>
        <span class="key-hint"><kbd>A</kbd><kbd>D</kbd> 滚转</span>
        <span class="key-hint"><kbd>Q</kbd><kbd>E</kbd> 偏航</span>
        <span class="key-hint"><kbd>Shift</kbd>/<kbd>Ctrl</kbd> 油门/加力</span>
        <span class="key-hint"><kbd>Space</kbd> 自动巡航</span>
        <span class="key-hint"><kbd>C</kbd> 视角</span>
        <span class="key-hint"><kbd>H</kbd> 隐藏UI</span>
      </div>

      <div class="cloud-badge glass-panel hideable" id="cloud-badge">☁ 穿越云层 · CLOUD PIERCE</div>
      <div class="status-toast glass-panel" id="status-toast"></div>
    `;

    this.brandDot = this.root.querySelector('#brand-dot')!;
    this.modeSub = this.root.querySelector('#mode-sub')!;
    this.valMach = this.root.querySelector('#val-mach')!;
    this.valAlt = this.root.querySelector('#val-alt')!;
    this.valG = this.root.querySelector('#val-g')!;
    this.valHdg = this.root.querySelector('#val-hdg')!;
    this.fpsEl = this.root.querySelector('#fps-pill')!;
    this.thrFill = this.root.querySelector('#thr-fill')!;
    this.thrLabel = this.root.querySelector('#thr-label')!;
    this.toastEl = this.root.querySelector('#status-toast')!;
    this.cloudBadgeEl = this.root.querySelector('#cloud-badge')!;
    this.drawerEl = this.root.querySelector('#controls-drawer')!;
    this.drawerBtn = this.root.querySelector('#btn-drawer')!;
    this.apBtn = this.root.querySelector('#btn-ap')!;
    this.camQuickBtn = this.root.querySelector('#btn-cam')!;
    this.audioBtn = this.root.querySelector('#btn-audio')!;
    this.cloudValEl = this.root.querySelector('#cloud-val')!;
    this.cloudSlider = this.root.querySelector('#cloud-slider')!;
    this.rendererNoteEl = this.root.querySelector('#renderer-note')!;

    // Event bindings
    this.drawerBtn.addEventListener('click', () => this.setDrawerOpen(!this.drawerOpen));
    this.root.querySelector('#btn-drawer-close')!.addEventListener('click', () => this.setDrawerOpen(false));
    this.apBtn.addEventListener('click', () => this.callbacks.onToggleAutopilot());
    this.audioBtn.addEventListener('click', () => this.callbacks.onToggleAudio());
    this.camQuickBtn.addEventListener('click', () => {
      const order: CameraMode[] = ['chase', 'cockpit', 'orbit'];
      const cur = (this.root.querySelector('#camera-group .seg-btn.active') as HTMLElement)?.dataset
        .cam as CameraMode;
      const next = order[(order.indexOf(cur || 'chase') + 1) % order.length];
      this.callbacks.onCameraChange(next);
    });

    this.root.querySelector('#lighting-group')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lighting]');
      if (btn?.dataset.lighting) {
        this.callbacks.onLightingChange(btn.dataset.lighting as LightingPresetId);
      }
    });

    this.root.querySelector('#camera-group')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cam]');
      if (btn?.dataset.cam) {
        this.callbacks.onCameraChange(btn.dataset.cam as CameraMode);
      }
    });

    this.root.querySelector('#quality-group')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-quality]');
      if (btn?.dataset.quality) {
        this.callbacks.onQualityChange(btn.dataset.quality as QualitySetting);
      }
    });

    this.cloudSlider.addEventListener('input', () => {
      const v = parseFloat(this.cloudSlider.value);
      this.cloudValEl.textContent = `${Math.round(v * 100)}%`;
      this.callbacks.onCloudDensityChange(v);
    });

    this.root.querySelector('#btn-mouse')!.addEventListener('click', () => this.callbacks.onToggleMouseFlight());
    this.root.querySelector('#btn-dive-cloud')!.addEventListener('click', () => this.callbacks.onDiveCloud());
    this.root.querySelector('#btn-hide-ui')!.addEventListener('click', () => this.callbacks.onToggleHideUi());
  }

  public setDrawerOpen(open: boolean): void {
    this.drawerOpen = open;
    this.drawerEl.classList.toggle('collapsed', !open);
    this.drawerBtn.classList.toggle('active', open);
    this.drawerBtn.textContent = open ? '控制 ▴' : '控制 ▾';
  }

  public showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2200);
  }

  public syncSettings(
    settings: SimSettings,
    rendererLabel: string,
    resolvedQuality: ResolvedQuality
  ): void {
    this.root.classList.toggle('ui-hidden', settings.uiHidden);

    this.root.querySelectorAll<HTMLButtonElement>('[data-lighting]').forEach((b) => {
      b.classList.toggle('active', b.dataset.lighting === settings.lighting);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
      b.classList.toggle('active', b.dataset.cam === settings.cameraMode);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) => {
      b.classList.toggle('active', b.dataset.quality === settings.quality);
    });

    const camLabels: Record<CameraMode, string> = {
      chase: '视角 Chase',
      cockpit: '视角 Cockpit',
      orbit: '视角 Orbit',
    };
    this.camQuickBtn.textContent = camLabels[settings.cameraMode];
    this.apBtn.classList.toggle('ap-active', settings.autopilot);
    this.apBtn.textContent = settings.autopilot ? '巡航 A/P' : '手动 MAN';
    this.audioBtn.classList.toggle('active', settings.audioEnabled);
    this.audioBtn.textContent = settings.audioEnabled ? '音效 On' : '音效 Off';

    const mouseBtn = this.root.querySelector('#btn-mouse') as HTMLButtonElement;
    mouseBtn.classList.toggle('active', settings.mouseFlight);

    this.cloudSlider.value = String(settings.cloudDensity);
    this.cloudValEl.textContent = `${Math.round(settings.cloudDensity * 100)}%`;

    this.rendererNoteEl.innerHTML = `<span>${rendererLabel}</span><span>→ ${resolvedQuality.toUpperCase()}</span>`;
  }

  public updateTelemetry(telemetry: FlightTelemetry, fps: number): void {
    this.brandDot.classList.toggle('autopilot', telemetry.autopilot);
    this.modeSub.textContent = telemetry.autopilot
      ? 'AUTOPILOT CLOUD WEAVE'
      : telemetry.afterburner > 0.05
        ? 'MANUAL · AFTERBURNER'
        : 'MANUAL FLIGHT';

    this.valMach.textContent = telemetry.mach.toFixed(2);
    this.valMach.classList.toggle('ab-active', telemetry.afterburner > 0.15);
    this.valAlt.innerHTML = `${Math.round(telemetry.altitudeM)}<span class="metric-unit">m</span>`;
    this.valG.textContent = `${telemetry.gForce.toFixed(1)}G`;
    this.valHdg.textContent = `${String(Math.round(telemetry.headingDeg) % 360).padStart(3, '0')}°`;
    this.fpsEl.textContent = `${Math.round(fps)} FPS`;

    const thrPct = Math.round(telemetry.throttle * 100);
    this.thrFill.style.width = `${thrPct}%`;
    this.thrLabel.textContent = telemetry.afterburner > 0.05 ? `A/B ${thrPct}%` : `MIL ${thrPct}%`;
    this.thrLabel.style.color = telemetry.afterburner > 0.05 ? '#ffaa44' : '';

    this.cloudBadgeEl.classList.toggle('visible', telemetry.cloudDensity > 0.06);
  }
}
