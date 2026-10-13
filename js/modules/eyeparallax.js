// 시차의 원리: 한쪽 눈씩 번갈아 감으면 가까운 물체(연필)가 먼 배경에 대해 움직여 보인다.
// VR에서는 실제로 한쪽 눈 화면만 가려서 체험한다.
import * as THREE from 'three';
import { makeLabel, makeStarPoints, mulberry32, kelvinToColor, fmt, DEG } from '../core/helpers.js';

const EYE_Y = 1.6;
const HALF_IPD = 0.032; // 두 눈 사이 거리의 절반 (약 6.4 cm / 2)
const RULER_Z = -6;

export default {
  view: {
    layout: 'head',
    radius: 3,
    center: [0, EYE_Y, 0],
    camera: { pos: [0, EYE_Y, 0.001], target: [0, EYE_Y, -1], fov: 60, near: 0.01 },
    grab: false,
    orbit: false,
    xrScale: 1,
    arScale: 1,
  },

  info: `
## 시차란?
관측하는 위치가 달라질 때 물체의 위치가 달라져 보이는 것을 **시차**라고 해요.
## 해 보기
- 연필(엄지손가락)을 눈앞에 세우고, 왼쪽 눈과 오른쪽 눈을 번갈아 감아 보세요.
- 연필이 뒤쪽 눈금판에 대해 좌우로 '폴짝' 움직여 보여요. 그런데 먼 배경은 거의 움직이지 않아요.
- 연필을 눈에 가까이 가져올수록 움직이는 폭(시차)이 커져요.
## 연주 시차와 비교
- 두 눈 → 6개월 간격의 지구 위치 (A, B)
- 연필 → 가까운 별
- 눈금판·먼 배경 → 아주 멀리 있는 배경 별
- 가까울수록 시차가 크다 → 가까운 별일수록 연주 시차가 크다
## VR에서
'왼쪽 눈만', '오른쪽 눈만' 버튼을 누르면 실제로 반대쪽 눈 화면이 까맣게 가려져요. 고개를 옆으로 움직여 보아도 가까운 물체가 더 많이 움직여 보여요. AR에서는 내 방의 물건이 배경이 돼요.
`,

  create(ctx) {
    const { root, camera } = ctx;
    const state = {
      d: 0.4, // 연필까지 거리 (m)
      eye: 'both', // both | left | right | alternate
      headX: 0,
      ruler: true,
      t: 0,
    };

    root.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(1, 3, 2);
    root.add(dl);

    // 연필
    const pencil = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.5 })
    );
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.0045, 0.018, 6),
      new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.7 })
    );
    tip.position.y = 0.079;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0015, 0.006, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    lead.position.y = 0.0855;
    const eraser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0046, 0.0046, 0.014, 12),
      new THREE.MeshStandardMaterial({ color: 0xf48fb1 })
    );
    eraser.position.y = -0.077;
    pencil.add(body, tip, lead, eraser);
    root.add(pencil);
    const pencilLabel = makeLabel('연필', { size: 0.012, anchor: [0.5, 0], color: '#ffe082' });
    root.add(pencilLabel);

    // 배경 눈금판
    const ruler = new THREE.Group();
    const rc = document.createElement('canvas');
    rc.width = 2048;
    rc.height = 256;
    const g = rc.getContext('2d');
    g.fillStyle = '#0d1b3d';
    g.fillRect(0, 0, 2048, 256);
    g.strokeStyle = '#8fb8ff';
    g.fillStyle = '#e8eefc';
    g.font = 'bold 54px sans-serif';
    g.textAlign = 'center';
    for (let i = -20; i <= 20; i++) {
      const x = 1024 + i * 48;
      g.lineWidth = i % 5 === 0 ? 8 : 4;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, i % 5 === 0 ? 120 : 70);
      g.stroke();
      if (i % 5 === 0) g.fillText(String(i), x, 190);
    }
    const rtex = new THREE.CanvasTexture(rc);
    rtex.colorSpace = THREE.SRGBColorSpace;
    rtex.anisotropy = 8;
    const RW = 41 * 0.25; // 눈금 하나 = 25 cm
    const board = new THREE.Mesh(new THREE.PlaneGeometry((2048 / 1968) * RW, (256 / 1968) * RW), new THREE.MeshBasicMaterial({ map: rtex }));
    board.position.set(0, EYE_Y, RULER_Z);
    ruler.add(board);
    const rulerLabel = makeLabel(`배경 눈금판 (${-RULER_Z} m 앞, 눈금 1칸 = 25 cm)`, { size: 0.16 });
    rulerLabel.position.set(0, EYE_Y - 0.62, RULER_Z);
    ruler.add(rulerLabel);
    root.add(ruler);

    // 아주 먼 배경 (별)
    const far = new THREE.Group();
    const rand = mulberry32(3);
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < 500; i++) {
      pos.push((rand() - 0.5) * 120, EYE_Y + (rand() - 0.3) * 60, -60 - rand() * 5);
      kelvinToColor(3500 + rand() * 8000, c).multiplyScalar(0.5 + rand() * 0.5);
      col.push(c.r, c.g, c.b);
    }
    far.add(makeStarPoints(pos, col, 0.6));
    // 바닥
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x14203f, roughness: 1 })
    );
    far.add(floor);
    const grid = new THREE.GridHelper(60, 60, 0x2a3f73, 0x1c2b55);
    grid.position.y = 0.002;
    far.add(grid);
    root.add(far);

    // VR: 한쪽 눈 가리개 (그 눈의 카메라에만 보이는 검은 공)
    const makeCover = (layer) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, depthTest: false, depthWrite: false })
      );
      m.renderOrder = 999;
      m.layers.set(layer);
      m.visible = false;
      m.frustumCulled = false;
      ctx.addToCamera(m);
      return m;
    };
    const coverLeft = makeCover(1); // 왼쪽 눈 가림
    const coverRight = makeCover(2); // 오른쪽 눈 가림

    function currentEye() {
      if (state.eye === 'alternate') return Math.floor(state.t / 0.9) % 2 === 0 ? 'left' : 'right';
      return state.eye;
    }

    function shiftOnRuler() {
      // 두 눈에서 연필을 지나 눈금판까지 이은 점 사이 거리
      return 2 * HALF_IPD * ((-RULER_Z - state.d) / state.d);
    }

    return {
      update(dt) {
        state.t += dt;
        pencil.position.set(0, EYE_Y - 0.03, -state.d);
        pencilLabel.position.set(0, EYE_Y + 0.06, -state.d);
        ruler.visible = state.ruler;
        const eye = currentEye();
        if (ctx.xrMode) {
          coverLeft.visible = eye === 'right';
          coverRight.visible = eye === 'left';
        } else {
          coverLeft.visible = coverRight.visible = false;
          const ex = eye === 'left' ? -HALF_IPD : eye === 'right' ? HALF_IPD : 0;
          camera.position.set(ex + state.headX, EYE_Y, 0.001);
          camera.lookAt(ex + state.headX, EYE_Y, -10);
        }
      },
      onXRChange(mode) {
        far.visible = mode !== 'ar';
        state.ruler = mode !== 'ar';
      },
      controls: [
        { type: 'heading', label: '어느 눈으로 볼까?' },
        {
          type: 'choice',
          options: [
            { value: 'both', label: '두 눈' },
            { value: 'left', label: '왼쪽 눈만' },
            { value: 'right', label: '오른쪽 눈만' },
            { value: 'alternate', label: '번갈아 감기' },
          ],
          get: () => state.eye,
          set: (v) => (state.eye = v),
        },
        { type: 'readout', label: '지금 보고 있는 눈', get: () => ({ both: '두 눈', left: '왼쪽 눈', right: '오른쪽 눈' })[currentEye()] },
        { type: 'heading', label: '연필까지의 거리' },
        {
          type: 'slider', label: '거리', min: 0.15, max: 1.2, step: 0.01,
          get: () => state.d, set: (v) => (state.d = v), format: (v) => `${Math.round(v * 100)} cm`,
        },
        {
          type: 'readout', label: '시차 (두 눈에서 본 각)',
          get: () => `${fmt((2 * Math.atan(HALF_IPD / state.d)) / DEG, 1)}°`,
        },
        { type: 'readout', label: '눈금판 위에서 움직인 폭', get: () => `약 ${Math.round(shiftOnRuler() * 100)} cm` },
        { type: 'heading', label: '머리 움직이기 (컴퓨터 화면용)' },
        {
          type: 'slider', label: '머리 좌우 위치', min: -0.3, max: 0.3, step: 0.01,
          get: () => state.headX, set: (v) => (state.headX = v), format: (v) => `${Math.round(v * 100)} cm`,
        },
        { type: 'toggle', label: '배경 눈금판 보이기', get: () => state.ruler, set: (v) => (state.ruler = v) },
        { type: 'note', text: 'VR에서는 실제로 반대쪽 눈 화면이 가려져요. 고개를 좌우로 움직여도 비교해 보세요.' },
      ],
    };
  },
};
