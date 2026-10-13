// 시뮬레이션 실행기: 렌더러, 카메라, 데스크톱 조작, VR/AR 세션, 모듈 불러오기를 담당한다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeStarfield, disposeObject, makeLabel } from './helpers.js';
import { buildHtmlControls, renderInfo } from './ui-html.js';
import { ControlsPanel, InfoPanel, MenuPanel, XRInput } from './vr-ui.js';
import { MODULES } from '../modules/index.js';

const BG = new THREE.Color(0x03050d);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const DEFAULT_VIEW = {
  layout: 'diorama', // 'diorama'(탁자 위 모형) | 'surround'(내 주위를 둘러쌈) | 'head'(내 머리가 중심)
  radius: 5, // 내용물 크기(모듈 단위 반지름)
  center: [0, 0, 0],
  camera: { pos: [0, 4, 10], target: [0, 0, 0] },
  vrRadius: 1.0, // VR에서 모형 반지름(m)
  arRadius: 0.35, // AR에서 모형 반지름(m)
  xrScale: 1, // surround/head 배치에서 1 모듈 단위 = ? m
  grab: true,
  orbit: true, // 데스크톱에서 마우스로 돌려 보기
  stars: true,
  arStars: false,
};

// ---------------------------------------------------------------------------
// 작은 화면(PiP): "지구에서 본 하늘" 같은 두 번째 시점
// ---------------------------------------------------------------------------
class PiP {
  constructor(app, { camera, label = '', aspect = 4 / 3 }) {
    this.app = app;
    this.camera = camera;
    this.aspect = aspect;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    this.visible = true;
    const h = 480;
    this.rt = new THREE.WebGLRenderTarget(Math.round(h * aspect), h, { samples: 4 });
    const widthM = 0.4;
    this.screen = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, widthM / aspect),
      new THREE.MeshBasicMaterial({ map: this.rt.texture, toneMapped: false })
    );
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM + 0.016, widthM / aspect + 0.016),
      new THREE.MeshBasicMaterial({ color: 0x4fc3f7 })
    );
    frame.position.z = -0.002;
    this.labelSprite = makeLabel(label, { size: 0.022, anchor: [0.5, 0] });
    this.labelSprite.position.set(0, widthM / aspect / 2 + 0.014, 0.002);
    this.screen.add(frame, plane, this.labelSprite);
    this.heightM = widthM / aspect;
    this.setLabel(label);
  }

  setLabel(text) {
    this.label = text;
    this.labelSprite.setText(text);
    if (this.app.dom.pipLabel) this.app.dom.pipLabel.textContent = text;
  }

  dispose() {
    this.rt.dispose();
    disposeObject(this.screen);
    this.screen.removeFromParent();
  }
}

export class App {
  constructor(dom) {
    this.dom = dom;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    dom.viewport.prepend(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = BG;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 4000);
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.stage = new THREE.Group(); // VR/AR에서 모형 위치·크기를 정하는 그룹
    this.scene.add(this.stage);
    this.env = new THREE.Group(); // 배경 별 (카메라를 따라감)
    this.env.add(makeStarfield());
    this.scene.add(this.env);

    // VR 안의 패널들
    this.hud = new THREE.Group();
    this.hud.visible = false;
    this.scene.add(this.hud);
    this.controlsPanel = new ControlsPanel(0.4, {
      menu: () => this.toggleMenu(),
      recenter: () => this.requestPlacement(),
      exit: () => this.renderer.xr.getSession()?.end(),
      smaller: () => this.scaleStage(1 / 1.25),
      bigger: () => this.scaleStage(1.25),
      rotate: () => this.rotateStage(Math.PI / 6),
      canGrab: () => this.view?.grab !== false,
    });
    this.infoPanel = new InfoPanel(0.4);
    this.menuPanel = new MenuPanel(0.4, {
      select: (id) => this.selectFromVR(id),
      close: () => this.toggleMenu(false),
      currentId: () => this.entry?.id,
    });
    this.menuPanel.setEntries(MODULES);
    this.menuPanel.mesh.visible = false;
    this.hud.add(this.controlsPanel.mesh, this.infoPanel.mesh, this.menuPanel.mesh);
    this.xrInput = new XRInput(this);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.uiTimer = 0;
    this.xrMode = null;
    this.needsPlacement = false;
    this.cameraObjects = [];

    renderer.xr.addEventListener('sessionend', () => this.onXREnd());
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(dom.viewport);
    this.resize();
    this.setupXRButtons();
  }

  // -------------------------------------------------------------------------
  // 모듈
  // -------------------------------------------------------------------------
  async load(id) {
    const entry = MODULES.find((m) => m.id === id) || MODULES[0];
    const mod = (await entry.load()).default;
    this.unload();
    // 모듈은 항상 '변환 없는' 무대에서 만들고, VR/AR이면 다음 프레임에 다시 배치한다
    this.stage.position.set(0, 0, 0);
    this.stage.quaternion.identity();
    this.stage.scale.setScalar(1);
    this.stage.updateMatrixWorld(true);
    this.entry = entry;
    this.view = { ...DEFAULT_VIEW, ...mod.view };
    this.root = new THREE.Group();
    this.stage.add(this.root);
    this.pointScale = null;

    const app = this;
    const ctx = {
      app,
      root: this.root,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      get xrMode() {
        return app.xrMode;
      },
      createPiP: (opts) => {
        app.pip = new PiP(app, opts);
        if (!opts.camera.parent) app.root.add(opts.camera);
        if (app.xrMode) app.hud.add(app.pip.screen);
        return app.pip;
      },
      setOrbit: (on) => app.setOrbit(on),
      // VR/AR에서 배치 방식을 바꾼다 (예: 하늘 안 ↔ 탁자 위 모형)
      setLayout: (layout, extra = {}) => {
        Object.assign(app.view, { layout }, extra);
        if (app.xrMode) app.requestPlacement();
      },
      resetCamera: () => app.resetDesktopCamera(),
      addToCamera: (obj) => {
        app.camera.add(obj);
        app.cameraObjects.push(obj);
      },
      stageScale: () => app.root.getWorldScale(new THREE.Vector3()).x,
      // 모형 좌표 → 월드 좌표 (lookAt 등은 월드 좌표를 받는다)
      toWorld: (v) => app.root.localToWorld(v.clone()),
      dirToWorld: (v) => v.clone().transformDirection(app.root.matrixWorld),
    };
    this.orbitOn = this.view.orbit !== false;
    this.controls.rotateSpeed = 1;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.enabled = this.orbitOn && !this.xrMode;
    this.inst = mod.create(ctx) || {};
    const controls = this.inst.controls || [];

    this.dom.title.textContent = entry.title;
    this.dom.unit.textContent = entry.unit;
    this.html = buildHtmlControls(this.dom.controls, controls);
    this.dom.info.innerHTML = renderInfo(mod.info || '');
    this.controlsPanel.setModule(entry.title, entry.unit, controls);
    this.infoPanel.setText(entry.title, mod.info || '');
    this.dom.pipLabel.hidden = !this.pip;
    this.applyEnvVisibility();

    if (this.xrMode) {
      this.requestPlacement();
      this.inst.onXRChange?.(this.xrMode);
    } else {
      this.resetDesktopCamera();
    }
    this.renderer.setAnimationLoop((t, f) => this.loop(t, f));
  }

  unload() {
    if (!this.root) return;
    this.inst?.dispose?.();
    if (this.pip) {
      this.pip.dispose();
      this.pip = null;
    }
    for (const o of this.cameraObjects) {
      o.removeFromParent();
      disposeObject(o);
    }
    this.cameraObjects = [];
    this.stage.remove(this.root);
    disposeObject(this.root);
    this.root = null;
    this.inst = null;
  }

  stop() {
    this.unload();
    this.renderer.setAnimationLoop(null);
  }

  setOrbit(on) {
    this.orbitOn = on;
    this.controls.enabled = on && !this.xrMode;
    if (on && !this.xrMode) this.resetDesktopCamera();
  }

  resetDesktopCamera() {
    const c = this.view.camera;
    this.camera.position.fromArray(c.pos);
    this.controls.target.fromArray(c.target);
    this.camera.near = c.near ?? this.view.radius * 0.005;
    this.camera.far = 4000;
    this.baseFov = c.fov ?? 55;
    this.applyFov();
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  applyEnvVisibility() {
    const v = this.view;
    this.env.visible = this.xrMode === 'ar' ? !!v.arStars : v.stars !== false;
    this.scene.background = this.xrMode === 'ar' ? null : BG;
  }

  vrPanels() {
    return [this.controlsPanel, this.infoPanel, this.menuPanel];
  }

  // 모듈이 공간을 가리켜 고를 때 (선택 사항)
  moduleSelect(ray) {
    if (!this.inst?.onPointerSelect) return;
    // 월드 광선 → 모듈 좌표계 광선
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const r = ray.clone().applyMatrix4(inv);
    r.direction.normalize();
    this.inst.onPointerSelect(r);
  }

  // -------------------------------------------------------------------------
  // 화면 크기
  // -------------------------------------------------------------------------
  resize() {
    if (this.xrMode) return;
    const el = this.dom.viewport;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.applyFov();
  }

  // 세로로 긴 화면(휴대폰)에서는 좌우가 잘리지 않도록 시야각을 넓힌다
  applyFov() {
    const base = this.baseFov ?? 55;
    const a = this.camera.aspect;
    const fov = a >= 1 ? base : (2 * Math.atan(Math.tan((base * Math.PI) / 360) / a) * 180) / Math.PI;
    this.camera.fov = Math.min(fov, 100);
    this.camera.updateProjectionMatrix();
  }

  pipRect() {
    const el = this.dom.viewport;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const aspect = this.pip.aspect;
    let w = Math.min(Math.max(W * 0.34, 170), 440);
    let h = w / aspect;
    if (h > H * 0.45) {
      h = H * 0.45;
      w = h * aspect;
    }
    return { x: 12, y: 12, w: Math.round(w), h: Math.round(h) };
  }

  // -------------------------------------------------------------------------
  // 매 프레임
  // -------------------------------------------------------------------------
  loop(time, frame) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    if (this.xrMode && frame && this.needsPlacement) this.tryPlace(frame);

    this.inst?.update?.(dt, this.elapsed);

    if (this.xrMode) {
      this.xrInput.update(dt);
      this.layoutHud();
      for (const p of this.vrPanels()) if (p.mesh.visible) p.refresh();
    } else {
      if (this.controls.enabled) this.controls.update();
      this.uiTimer += dt;
      if (this.uiTimer > 0.1) {
        this.uiTimer = 0;
        this.html?.refresh();
      }
    }

    this.env.position.setFromMatrixPosition(this.camera.matrixWorld);

    this.updatePointSizes();
    const pip = this.pip && this.pip.visible ? this.pip : null;
    if (pip && this.xrMode) this.renderPiPTarget(pip);
    this.renderer.render(this.scene, this.camera);
    if (pip && !this.xrMode) this.renderPiPDesktop(pip);
    if (this.dom.pipLabel) {
      const show = !!pip && !this.xrMode;
      this.dom.pipLabel.hidden = !show;
      if (show) {
        const r = this.pipRect();
        const s = this.dom.pipLabel.style;
        s.left = r.x + 'px';
        s.bottom = r.y + r.h + 'px';
        s.width = r.w + 'px';
      }
    }
  }

  // 점(Points)의 크기는 물체의 크기 조절을 따르지 않으므로, 모형을 줄이면 직접 줄여 준다
  updatePointSizes(s = this.stage.scale.x) {
    if (!this.root || s === this.pointScale) return;
    this.pointScale = s;
    this.root.traverse((o) => {
      if (!o.isPoints) return;
      const m = o.material;
      if (m.userData.baseSize === undefined) m.userData.baseSize = m.size;
      m.size = m.userData.baseSize * s;
    });
  }

  withPiPEnv(pip, fn) {
    const prevEnv = this.env.position.clone();
    pip.camera.updateMatrixWorld();
    this.env.position.setFromMatrixPosition(pip.camera.matrixWorld);
    this.env.updateMatrixWorld();
    const hudVis = this.hud.visible;
    this.hud.visible = false;
    // 작은 화면 카메라는 모형 좌표계 안에 있으므로 점 크기를 원래대로
    this.updatePointSizes(1);
    fn();
    this.updatePointSizes();
    this.hud.visible = hudVis;
    this.env.position.copy(prevEnv);
  }

  renderPiPDesktop(pip) {
    const r = this.pipRect();
    const R = this.renderer;
    this.withPiPEnv(pip, () => {
      R.setScissorTest(true);
      R.setScissor(r.x, r.y, r.w, r.h);
      R.setViewport(r.x, r.y, r.w, r.h);
      pip.camera.aspect = r.w / r.h;
      pip.camera.updateProjectionMatrix();
      this.inst?.beforePiP?.();
      R.render(this.scene, pip.camera);
      this.inst?.afterPiP?.();
      R.setScissorTest(false);
      const el = this.dom.viewport;
      R.setViewport(0, 0, el.clientWidth, el.clientHeight);
    });
  }

  renderPiPTarget(pip) {
    const R = this.renderer;
    this.withPiPEnv(pip, () => {
      const xrOn = R.xr.enabled;
      R.xr.enabled = false;
      const prev = R.getRenderTarget();
      pip.camera.aspect = pip.aspect;
      pip.camera.updateProjectionMatrix();
      this.inst?.beforePiP?.();
      R.setRenderTarget(pip.rt);
      R.clear();
      R.render(this.scene, pip.camera);
      R.setRenderTarget(prev);
      this.inst?.afterPiP?.();
      R.xr.enabled = xrOn;
    });
  }

  // -------------------------------------------------------------------------
  // VR / AR
  // -------------------------------------------------------------------------
  async setupXRButtons() {
    const { vrBtn, arBtn, xrNote } = this.dom;
    vrBtn.hidden = arBtn.hidden = true;
    let vr = false;
    let ar = false;
    if (navigator.xr) {
      try {
        vr = await navigator.xr.isSessionSupported('immersive-vr');
      } catch (e) {}
      try {
        ar = await navigator.xr.isSessionSupported('immersive-ar');
      } catch (e) {}
    }
    vrBtn.hidden = !vr;
    arBtn.hidden = !ar;
    vrBtn.onclick = () => this.startXR('vr');
    arBtn.onclick = () => this.startXR('ar');
    if (!vr && !ar) {
      xrNote.textContent = window.isSecureContext
        ? '이 기기에서는 VR/AR을 쓸 수 없어요. 메타 퀘스트 3 브라우저에서 같은 주소를 열면 "VR로 보기", "AR로 보기" 버튼이 나타납니다.'
        : 'VR/AR은 https 주소(또는 localhost)에서만 동작합니다.';
    } else xrNote.textContent = '';
  }

  async startXR(mode) {
    if (this.xrMode) return;
    const type = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    try {
      const session = await navigator.xr.requestSession(type, {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      this.desktopCam = {
        id: this.entry?.id,
        pos: this.camera.position.clone(),
        quat: this.camera.quaternion.clone(),
        target: this.controls.target.clone(),
      };
      this.xrMode = mode;
      await this.renderer.xr.setSession(session);
      this.onXRStart();
    } catch (err) {
      this.xrMode = null;
      console.error(err);
      alert('VR/AR을 시작하지 못했어요: ' + err.message);
    }
  }

  onXRStart() {
    document.body.classList.add('in-xr');
    // 손·컨트롤러가 눈 가까이 와도 잘리지 않도록
    this.camera.near = Math.min(this.camera.near, 0.02);
    this.camera.updateProjectionMatrix();
    this.controls.enabled = false;
    this.hud.visible = true;
    this.toggleMenu(false);
    this.xrInput.setActive(true);
    this.applyEnvVisibility();
    if (this.pip) this.hud.add(this.pip.screen);
    this.requestPlacement();
    this.inst?.onXRChange?.(this.xrMode);
  }

  onXREnd() {
    if (!this.xrMode) return;
    this.xrMode = null;
    document.body.classList.remove('in-xr');
    this.hud.visible = false;
    this.xrInput.setActive(false);
    if (this.pip) this.pip.screen.removeFromParent();
    this.stage.position.set(0, 0, 0);
    this.stage.quaternion.identity();
    this.stage.scale.setScalar(1);
    this.applyEnvVisibility();
    this.camera.scale.setScalar(1);
    this.resetDesktopCamera();
    if (this.desktopCam && this.desktopCam.id === this.entry?.id) {
      // VR에 들어가기 전에 보던 화면으로
      this.camera.position.copy(this.desktopCam.pos);
      this.camera.quaternion.copy(this.desktopCam.quat);
      this.controls.target.copy(this.desktopCam.target);
    }
    this.inst?.onXRChange?.(null);
    this.controls.enabled = this.orbitOn !== false;
    this.resize();
  }

  requestPlacement() {
    this.needsPlacement = true;
  }

  tryPlace(frame) {
    const ref = this.renderer.xr.getReferenceSpace();
    const pose = ref && frame.getViewerPose(ref);
    if (!pose) return;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    this.place(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(o.x, o.y, o.z, o.w));
    this.needsPlacement = false;
  }

  place(head, headQuat) {
    const v = this.view;
    const ar = this.xrMode === 'ar';
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const rot = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    const center = new THREE.Vector3().fromArray(v.center);
    const st = this.stage;
    st.quaternion.copy(rot);

    if (v.layout === 'diorama') {
      const R = ar ? v.arRadius : v.vrRadius;
      const s = R / v.radius;
      const dist = R + (ar ? 0.35 : 0.6);
      const anchor = head.clone().addScaledVector(fwd, dist);
      anchor.y = head.y + (ar ? -0.32 : -0.22) + (v.yOffset || 0) * R;
      st.scale.setScalar(s);
      st.position.copy(anchor).sub(center.multiplyScalar(s).applyQuaternion(rot));
    } else if (v.layout === 'surround') {
      const s = ar ? v.arScale ?? v.xrScale : v.xrScale;
      st.scale.setScalar(s);
      st.position.set(head.x, 0, head.z).sub(center.multiplyScalar(s).applyQuaternion(rot));
    } else {
      // head: center가 내 눈 위치에 오도록
      const s = ar ? v.arScale ?? v.xrScale : v.xrScale;
      st.scale.setScalar(s);
      st.position.copy(head).sub(center.multiplyScalar(s).applyQuaternion(rot));
    }

    this.hud.position.copy(head);
    this.hud.quaternion.copy(rot);
    this.hud.scale.setScalar(1);
    this.hud.visible = true;
    this.layoutHud();
    this.inst?.onPlaced?.();
  }

  layoutHud() {
    const top = -0.06;
    const cp = this.controlsPanel.mesh;
    const ip = this.infoPanel.mesh;
    const mp = this.menuPanel.mesh;
    cp.position.set(-0.4, top - cp.scale.y / 2, -0.55);
    mp.position.set(-0.4, top - mp.scale.y / 2, -0.55);
    ip.position.set(0.42, top - ip.scale.y / 2, -0.58);
    if (this.pip) this.pip.screen.position.set(0.44, top + this.pip.heightM / 2 + 0.05, -0.62);
    this.hud.updateMatrixWorld();
    const eye = this.hud.localToWorld(new THREE.Vector3(0, 0, 0));
    for (const m of [cp, ip, mp, this.pip?.screen]) if (m) m.lookAt(eye);
  }

  toggleHud() {
    this.hud.visible = !this.hud.visible;
  }

  toggleMenu(force) {
    const show = force ?? !this.menuPanel.mesh.visible;
    this.menuPanel.mesh.visible = show;
    this.controlsPanel.mesh.visible = !show;
    if (show) this.menuPanel.refresh(true);
  }

  async selectFromVR(id) {
    this.toggleMenu(false);
    if (id === this.entry?.id) return;
    history.replaceState(null, '', '#/' + id);
    await this.load(id);
  }

  canGrabStage() {
    return !!this.xrMode && this.view?.grab !== false;
  }

  stagePivot() {
    return this.stage.localToWorld(new THREE.Vector3().fromArray(this.view.center));
  }

  scaleStage(f) {
    if (!this.xrMode) return;
    const st = this.stage;
    const p = this.stagePivot();
    st.scale.setScalar(Math.min(Math.max(st.scale.x * f, 1e-4), 1e4));
    st.updateMatrixWorld();
    st.position.add(p.sub(this.stagePivot()));
  }

  rotateStage(a) {
    if (!this.xrMode) return;
    const st = this.stage;
    const p = this.stagePivot();
    st.rotateOnWorldAxis(Y_AXIS, a);
    st.updateMatrixWorld();
    st.position.add(p.sub(this.stagePivot()));
  }
}
