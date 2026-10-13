// 달의 위상 변화: 달은 항상 태양 쪽 절반이 밝다. 지구에서 보는 방향에 따라 밝은 부분의 모양이 달라진다.
// VR에서는 내 머리가 지구가 되어, 내 주위를 도는 달을 직접 바라본다.
import * as THREE from 'three';
import { makeLabel, makeStar, makeRod, makeRing, getEarthTexture, getMoonTexture, fmt, DEG } from '../core/helpers.js';

const R_M = 4; // 달 궤도 반지름
const MOON_R = 0.35;
const SUN_X = 30;
const MONTH = 29.53;

const PHASES = [
  [0, '삭 (신월)', '태양과 같은 방향이라 보이지 않아요.'],
  [45, '초승달', '해가 진 직후 서쪽 하늘에 잠깐 보여요.'],
  [90, '상현달', '해 질 무렵 남쪽 하늘에 보이고, 자정 무렵 서쪽으로 져요.'],
  [135, '상현달과 보름달 사이', '해 질 무렵 남동쪽 하늘에 보여요.'],
  [180, '보름달 (망)', '해 질 무렵 동쪽에서 떠서 자정에 남쪽, 새벽에 서쪽으로 져요. 밤새 보여요.'],
  [225, '보름달과 하현달 사이', '밤늦게 떠서 새벽에 남서쪽 하늘에 보여요.'],
  [270, '하현달', '자정 무렵 동쪽에서 떠서 새벽에 남쪽 하늘에 보여요.'],
  [315, '그믐달', '해 뜨기 전 새벽 동쪽 하늘에 잠깐 보여요.'],
];

function phaseInfo(deg) {
  deg = ((deg % 360) + 360) % 360;
  if (deg < 8 || deg > 352) return PHASES[0];
  if (deg >= 82 && deg <= 98) return PHASES[2];
  if (deg >= 172 && deg <= 188) return PHASES[4];
  if (deg >= 262 && deg <= 278) return PHASES[6];
  if (deg < 82) return PHASES[1];
  if (deg < 172) return PHASES[3];
  if (deg < 262) return PHASES[5];
  return PHASES[7];
}

// 지구(북반구)에서 본 달 모양 아이콘
function phaseIcon(thetaDeg) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const cx = 64;
  const cy = 64;
  const r = 54;
  const th = thetaDeg * DEG;
  g.fillStyle = '#2a2f3d';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  const waxing = th > 1e-3 && th < Math.PI;
  const s = waxing ? 1 : -1;
  const k = Math.cos(th);
  const xt = s * k * r;
  if (k < 0.999) {
    g.fillStyle = '#f5f1d6';
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
    const rx = Math.abs(k) * r;
    if (xt > 0) g.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
    else g.ellipse(cx, cy, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  view: {
    layout: 'head',
    radius: 6,
    center: [0, 0, 0],
    camera: { pos: [0, 9, 8], target: [0, 0, 0] },
    xrScale: 0.65 / R_M, // VR에서 달 궤도 반지름 65 cm
    arScale: 0.55 / R_M,
    grab: false,
  },

  info: `
## 달의 위상
달은 스스로 빛을 내지 못하고 **햇빛을 반사**해서 밝게 보여요. 달은 항상 태양을 향한 절반이 밝지만, 달이 지구 주위를 **공전**하면서 지구에서 보이는 밝은 부분의 모양이 달라져요. 이것을 **달의 위상 변화**라고 해요.
## 순서 (약 한 달 = 29.5일 주기)
- 삭(음력 1일) → 초승달(2~3일) → 상현달(7~8일) → 보름달(망, 15일) → 하현달(22~23일) → 그믐달(27~28일) → 삭
- 상현달: 오른쪽 반이 밝다 / 하현달: 왼쪽 반이 밝다 (북반구 기준)
## 위치 관계
- 삭: 태양 - 달 - 지구 순서 (달이 태양과 같은 방향)
- 망(보름달): 태양 - 지구 - 달 순서 (달이 태양 반대 방향)
- 상현·하현: 태양 - 지구 - 달이 직각을 이룬다
## VR에서 해 보기
내 머리가 지구예요! 내 주위를 도는 달을 눈으로 따라가 보세요. 태양(먼 곳의 밝은 빛)을 등지고 보면 보름달, 태양 쪽에 있으면 삭이 돼요. 공 하나와 전등으로 하는 '달의 위상 실험'과 같아요.
## 같은 면
달은 자전 주기와 공전 주기가 같아서 지구에서는 항상 달의 같은 면만 보여요.
`,

  create(ctx) {
    const { root, app } = ctx;
    const state = { age: 4, playing: true, speed: 2, mode: 'space', ghosts: true, rays: true };

    root.add(new THREE.AmbientLight(0xffffff, 0.06));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(SUN_X, 0, 0);
    root.add(light, light.target);

    // 태양 (멀리)
    const sun = makeStar(0xffe082, 1.6, 5);
    sun.position.set(SUN_X, 0, 0);
    root.add(sun);
    const sunLabel = makeLabel('태양 (햇빛이 오는 쪽)', { size: 0.7, anchor: [0.5, -2.2] });
    sunLabel.position.copy(sun.position);
    root.add(sunLabel);
    const rays = new THREE.Group();
    for (const z of [-3, -1.5, 0, 1.5, 3]) {
      const rod = makeRod(0xffe082, 0.03, { opacity: 0.55 });
      rod.setEnds(new THREE.Vector3(14, 0.9, z), new THREE.Vector3(6, 0.9, z));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 10), new THREE.MeshBasicMaterial({ color: 0xffe082 }));
      tip.position.set(6, 0.9, z);
      tip.rotation.z = Math.PI / 2;
      rays.add(rod, tip);
    }
    const rayLabel = makeLabel('햇빛', { size: 0.45, color: '#ffe082', bg: null });
    rayLabel.position.set(10, 1.5, 0);
    rays.add(rayLabel);
    root.add(rays);

    // 지구
    const earth = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ map: getEarthTexture(), roughness: 0.85 }));
    root.add(earth);
    const earthLabel = makeLabel('지구', { size: 0.35, anchor: [0.5, -1.0], color: '#bfe1ff' });
    root.add(earthLabel);

    // 달 궤도와 달
    const orbitRing = makeRing(R_M, 0.02, 0x9fb0d6, 0.6);
    root.add(orbitRing);
    const moonGeo = new THREE.SphereGeometry(MOON_R, 48, 32).rotateY(-Math.PI / 2); // 앞면이 +Z를 보게
    const moonMat = new THREE.MeshStandardMaterial({ map: getMoonTexture(), roughness: 1, metalness: 0 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    root.add(moon);
    const moonLabel = makeLabel('달', { size: 0.25, anchor: [0.5, -1.6] });
    root.add(moonLabel);

    // 8가지 위치와 지구에서 본 모양
    const ghosts = new THREE.Group();
    const posAt = (deg, r = R_M, out = new THREE.Vector3()) => out.set(Math.cos(deg * DEG) * r, 0, -Math.sin(deg * DEG) * r);
    for (const [deg, name] of PHASES) {
      const gm = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 1, transparent: true, opacity: 0.55 }));
      gm.scale.setScalar(0.6);
      posAt(deg, R_M, gm.position);
      ghosts.add(gm);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: phaseIcon(deg), transparent: true }));
      icon.scale.setScalar(0.7);
      posAt(deg, R_M + 1.35, icon.position);
      ghosts.add(icon);
      const label = makeLabel(name.replace(/ \(.*\)/, '').replace('과 ', '과\n'), { size: 0.26, anchor: [0.5, 1.25] });
      posAt(deg, R_M + 1.35, label.position);
      ghosts.add(label);
    }
    const ghostNote = makeLabel('바깥 그림: 지구에서 본 달의 모양', { size: 0.3, color: '#9fb0d6', bg: null });
    ghostNote.position.set(0, 0, R_M + 2.6);
    ghosts.add(ghostNote);
    root.add(ghosts);

    // 두 번째 시점
    const pipCam = new THREE.PerspectiveCamera(14, 4 / 3, 0.05, 200);
    root.add(pipCam);
    const pip = ctx.createPiP({ camera: pipCam, label: '지구에서 본 달' });

    const theta = () => (state.age / MONTH) * 360;
    const mpos = new THREE.Vector3();

    function applyMode() {
      const earthView = state.mode === 'earth' && !ctx.xrMode;
      ctx.setOrbit(!earthView);
      if (earthView) {
        app.baseFov = 40;
        app.applyFov();
      }
      pip.setLabel(earthView || ctx.xrMode ? '위에서 본 모습' : '지구에서 본 달');
    }
    applyMode();

    let hideEarth = false;
    return {
      update(dt) {
        if (state.playing) state.age = (state.age + dt * state.speed) % MONTH;
        posAt(theta(), R_M, mpos);
        moon.position.copy(mpos);
        moon.lookAt(root.localToWorld(new THREE.Vector3(0, 0, 0)));
        moonLabel.position.copy(mpos);
        earth.rotation.y += dt * 1.5;
        rays.visible = state.rays;

        const earthView = state.mode === 'earth' && !ctx.xrMode;
        // 지구에서 볼 때는 8가지 위치 그림이 달을 가리므로 작은 화면(위에서 본 모습)에만 보인다
        ghosts.visible = state.ghosts && !earthView;
        moonLabel.visible = !earthView;
        hideEarth = earthView || !!ctx.xrMode;
        earth.visible = earthLabel.visible = !hideEarth;
        if (earthView) {
          // 지구 중심에서 달을 바라본다 (태양이 함께 보이도록 넓게)
          app.camera.position.set(0, 0.25, 0);
          app.camera.lookAt(ctx.toWorld(new THREE.Vector3(mpos.x, 0, mpos.z)));
        }
        if (earthView || ctx.xrMode) {
          pipCam.fov = 50;
          pipCam.position.set(0, 13, 0.01);
          pipCam.lookAt(ctx.toWorld(new THREE.Vector3()));
        } else {
          pipCam.fov = 12;
          pipCam.position.set(0, 0, 0);
          pipCam.lookAt(ctx.toWorld(mpos));
        }
        pipCam.updateProjectionMatrix();
      },
      beforePiP() {
        ghosts.visible = state.ghosts;
        moonLabel.visible = true;
        if (state.mode === 'space' && !ctx.xrMode) {
          earth.visible = false;
          moonLabel.visible = false;
          orbitRing.visible = false;
        } else {
          earth.visible = earthLabel.visible = true;
        }
      },
      afterPiP() {
        const earthView = state.mode === 'earth' && !ctx.xrMode;
        earth.visible = earthLabel.visible = !hideEarth;
        moonLabel.visible = !earthView;
        ghosts.visible = state.ghosts && !earthView;
        orbitRing.visible = true;
      },
      onXRChange(mode) {
        if (mode) state.ghosts = false;
        applyMode();
      },
      controls: [
        {
          type: 'choice', label: '보는 위치',
          options: [
            { value: 'space', label: '우주에서 (위에서)' },
            { value: 'earth', label: '지구에서 달 보기' },
          ],
          get: () => state.mode,
          set: (v) => {
            state.mode = v;
            applyMode();
          },
          visible: () => !ctx.xrMode,
        },
        { type: 'toggle', label: '달 공전 재생', get: () => state.playing, set: (v) => (state.playing = v) },
        {
          type: 'slider', label: '음력 날짜 (달의 나이)', min: 0, max: 29.5, step: 0.1,
          get: () => state.age, set: (v) => (state.age = v), format: (v) => `${fmt(v + 1, 1)}일`,
        },
        {
          type: 'buttons',
          items: [
            { label: '삭', onClick: () => { state.age = 0; state.playing = false; } },
            { label: '상현', onClick: () => { state.age = MONTH / 4; state.playing = false; } },
            { label: '보름', onClick: () => { state.age = MONTH / 2; state.playing = false; } },
            { label: '하현', onClick: () => { state.age = (MONTH * 3) / 4; state.playing = false; } },
          ],
        },
        { type: 'readout', label: '달의 모양', get: () => phaseInfo(theta())[1] },
        { type: 'readout', label: '밝게 보이는 부분', get: () => `약 ${Math.round(((1 - Math.cos(theta() * DEG)) / 2) * 100)}%` },
        { type: 'note', get: () => phaseInfo(theta())[2] },
        { type: 'toggle', label: '8가지 위치와 모양 보기', get: () => state.ghosts, set: (v) => (state.ghosts = v) },
        { type: 'toggle', label: '햇빛 화살표', get: () => state.rays, set: (v) => (state.rays = v) },
      ],
    };
  },
};
