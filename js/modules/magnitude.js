// 별의 밝기와 등급: 거리-밝기 역제곱 법칙, 겉보기 등급과 절대 등급
import * as THREE from 'three';
import { makeLabel, makeStar, makeGlow, makeRod, makeRing, kelvinToColor, fmt, clamp, DEG } from '../core/helpers.js';

// 이름, 겉보기 등급 m, 거리(pc), 표면 온도(K)
const STARS = [
  { id: 'sun', name: '태양', m: -26.74, d: 4.848e-6, T: 5778 },
  { id: 'sirius', name: '시리우스', m: -1.46, d: 2.64, T: 9940 },
  { id: 'vega', name: '직녀성(베가)', m: 0.03, d: 7.68, T: 9600 },
  { id: 'altair', name: '견우성(알타이르)', m: 0.77, d: 5.13, T: 7700 },
  { id: 'proxima', name: '프록시마 센타우리', m: 11.13, d: 1.3, T: 3000 },
  { id: 'polaris', name: '북극성', m: 1.98, d: 133, T: 6000 },
  { id: 'betelgeuse', name: '베텔게우스', m: 0.5, d: 168, T: 3600 },
  { id: 'rigel', name: '리겔', m: 0.13, d: 264, T: 12100 },
  { id: 'deneb', name: '데네브', m: 1.25, d: 802, T: 8500 },
];
for (const s of STARS) s.M = s.m - 5 * Math.log10(s.d / 10);

// 거리(pc) → 모형 반지름 (로그 눈금)
const rOf = (d) => (d < 0.05 ? 0.9 : 1.7 * (Math.log10(d) + 1.4));
// 겉보기 등급 → 그림 크기
const sizeOf = (m) => clamp(0.5 * Math.pow(Math.pow(10, -0.4 * m), 0.28), 0.07, 1.0);

export default {
  view: {
    layout: 'diorama',
    radius: 8,
    center: [0, 0, -3],
    camera: { pos: [0, 7.5, 7.5], target: [0, 0, -3] },
    vrRadius: 1.2,
    arRadius: 0.4,
  },

  info: `
## 별의 밝기와 거리
같은 별이라도 멀리 있을수록 어둡게 보여요. 별빛이 퍼져 나가면서 같은 양의 빛이 더 넓은 면적에 퍼지기 때문이에요.
- 거리가 2배 → 빛이 비추는 넓이 4배 → 밝기 1/4배
- 거리가 3배 → 넓이 9배 → 밝기 1/9배
- **밝기는 거리의 제곱에 반비례**
## 별의 등급
- 등급이 **작을수록** 밝은 별 (음수도 있어요)
- 1등급 차이 → 밝기 약 **2.5배**, 5등급 차이 → 정확히 **100배**
- **겉보기 등급**: 우리 눈에 보이는 밝기로 정한 등급
- **절대 등급**: 모든 별을 **10 pc** 거리에 놓았다고 할 때의 밝기로 정한 등급 → 별이 실제로 내는 빛의 양 비교
## 거리 판단하기
- 겉보기 등급 − 절대 등급 > 0 → 10 pc보다 멀다
- 겉보기 등급 − 절대 등급 < 0 → 10 pc보다 가깝다
- 겉보기 등급 − 절대 등급 = 0 → 10 pc
## 관찰해 보기
'모든 별을 10 pc로 옮기기'를 눌러 보세요. 태양은 가장 밝아 보이지만 10 pc에 놓으면 평범한 별이고, 리겔·데네브처럼 멀리 있는 별이 사실은 훨씬 밝은 별이에요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = {
      topic: 'mag', // 'inverse' | 'mag'
      r: 1, // 역제곱: 스크린 거리 (배)
      at10: false,
      u: 0, // 0 = 실제 거리, 1 = 10 pc
      sel: 'sirius',
      factor: 1, // 선택한 별 거리 배율
    };
    root.add(new THREE.AmbientLight(0xffffff, 0.6));

    // ---------------------------------------------------------- 1. 역제곱 법칙
    const inv = new THREE.Group();
    inv.position.set(-2.4, 0.5, -1.5);
    inv.rotation.y = 0.75;
    root.add(inv);
    const SRC = new THREE.Vector3(0, 0, 0);
    const UNIT = 1.6; // 거리 1배 = 모형 1.6 단위, 그때 스크린 한 변 = 1.2
    const SIDE = 1.2;
    const src = makeStar(0xfff59d, 0.15, 8);
    src.position.copy(SRC);
    inv.add(src);
    const srcLabel = makeLabel('별(광원)', { size: 0.28, anchor: [0.5, 0] });
    srcLabel.position.copy(SRC).add(new THREE.Vector3(0, 0.45, 0));
    inv.add(srcLabel);
    // 피라미드 모서리
    const edges = [];
    for (let i = 0; i < 4; i++) {
      const rod = makeRod(0xfff59d, 0.012, { opacity: 0.6 });
      edges.push(rod);
      inv.add(rod);
    }
    const cornerAt = (r, i, out = new THREE.Vector3()) => {
      const h = (SIDE * r) / 2;
      const sy = i & 1 ? 1 : -1;
      const sz = i & 2 ? 1 : -1;
      return out.set(SRC.x + UNIT * r, SRC.y + sy * h, SRC.z + sz * h);
    };
    for (let i = 0; i < 4; i++) edges[i].setEnds(SRC, cornerAt(3.2, i));
    // 기준 테두리 (1, 2, 3배)
    for (const r of [1, 2, 3]) {
      const pts = [0, 1, 3, 2, 0].map((i) => cornerAt(r, i));
      for (let k = 0; k < 4; k++) {
        const rod = makeRod(0x90a4ae, 0.008, { opacity: 0.6 });
        rod.setEnds(pts[k], pts[k + 1]);
        inv.add(rod);
      }
      const l = makeLabel(`${r}배 거리`, { size: 0.22, color: '#b0bec5', anchor: [0.5, 1] });
      l.position.copy(cornerAt(r, 0)).add(new THREE.Vector3(0, -0.1, (SIDE * r) / 2));
      inv.add(l);
    }
    // 움직이는 스크린: 격자 한 칸 = 1배 거리일 때의 넓이
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gg = gc.getContext('2d');
    gg.fillStyle = '#ffffff';
    gg.fillRect(0, 0, 128, 128);
    gg.strokeStyle = '#1a237e';
    gg.lineWidth = 6;
    gg.strokeRect(0, 0, 128, 128);
    const gtex = new THREE.CanvasTexture(gc);
    gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
    gtex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: gtex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
    );
    screen.rotation.y = -Math.PI / 2;
    inv.add(screen);
    const screenLabel = makeLabel('', { size: 0.26, anchor: [0, 0.5], color: '#fff59d' });
    inv.add(screenLabel);

    // ---------------------------------------------------------- 2. 등급 비교
    const mag = new THREE.Group();
    root.add(mag);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), new THREE.MeshBasicMaterial({ color: 0x4f8fe8 }));
    mag.add(earth);
    const earthLabel = makeLabel('지구 (관측자)', { size: 0.24, anchor: [0.5, 1.3], color: '#bfe1ff' });
    mag.add(earthLabel);
    // 거리 눈금 원 (로그 눈금)
    for (const d of [1, 10, 100, 1000]) {
      const is10 = d === 10;
      const ring = makeRing(rOf(d), is10 ? 0.025 : 0.01, is10 ? 0xffd54f : 0x5c6b99, is10 ? 0.9 : 0.6, 128);
      mag.add(ring);
      const l = makeLabel(`${d} pc`, {
        size: is10 ? 0.26 : 0.2,
        color: is10 ? '#ffe082' : '#9fb0d6',
        bg: null,
      });
      l.position.set(rOf(d) + 0.05, 0.05, 0.25);
      l.center.set(0, 0.5);
      mag.add(l);
    }
    const scaleNote = makeLabel('노란 원 = 10 pc (절대 등급의 기준 거리)\n거리는 로그 눈금 (원 하나마다 10배)', {
      size: 0.2,
      color: '#ffe082',
      bg: null,
    });
    scaleNote.position.set(0, 0.05, 1.1);
    mag.add(scaleNote);

    const col = new THREE.Color();
    const n = STARS.length;
    STARS.forEach((s, i) => {
      // 지구 앞쪽(-Z) 부채꼴 방향에 늘어놓는다
      const az = s.id === 'sun' ? 0 : (-75 + (150 * (i - 1)) / (n - 2)) * DEG;
      s.dir = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
      kelvinToColor(s.T, col);
      s.obj = new THREE.Group();
      s.core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8), new THREE.MeshBasicMaterial({ color: col }));
      s.glow = makeGlow(col.getHex(), 1, 1);
      s.obj.add(s.core, s.glow);
      s.label = makeLabel('', { size: 0.2, anchor: [0.5, -0.25] });
      s.obj.add(s.label);
      s.ray = makeRod(col.getHex(), 0.008, { opacity: 0.35 });
      mag.add(s.obj, s.ray);
    });
    const selRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x4fc3f7 })
    );
    mag.add(selRing);

    const current = (s) => {
      const d0 = s.id === state.sel ? s.d * state.factor : s.d;
      const d = Math.pow(d0, 1 - state.u) * Math.pow(10, state.u);
      return { d, m: s.M + 5 * Math.log10(d / 10) };
    };
    const selStar = () => STARS.find((s) => s.id === state.sel);
    const fmtSigned = (x) => (x > 0 ? '+' : '') + fmt(x, 2);

    function updateMag(dt) {
      const target = state.at10 ? 1 : 0;
      state.u += clamp(target - state.u, -dt * 0.6, dt * 0.6);
      for (const s of STARS) {
        const { d, m } = current(s);
        const r = rOf(d);
        s.obj.position.copy(s.dir).multiplyScalar(r);
        s.obj.position.y = 0;
        const size = sizeOf(m);
        s.glow.scale.setScalar(size * 1.6);
        s.core.scale.setScalar(Math.max(0.6, size * 1.6));
        const nm = s.id === 'sun' && state.u < 0.01 ? '태양 (실제 거리 1 AU)' : s.name;
        s.label.setText(`${nm}\nm = ${fmt(m, 1)}${state.u > 0.99 ? ' (= M)' : ''}`);
        s.ray.setEnds(new THREE.Vector3(), s.obj.position);
      }
      const ss = selStar();
      selRing.position.copy(ss.obj.position);
      selRing.lookAt(ctx.camera.getWorldPosition(new THREE.Vector3()));
    }

    function updateInverse() {
      const r = state.r;
      screen.position.set(SRC.x + UNIT * r, SRC.y, SRC.z);
      screen.scale.set(SIDE * r, SIDE * r, 1);
      gtex.repeat.set(r, r);
      const b = 1 / (r * r);
      screen.material.color.setRGB(0.15 + 0.85 * b, 0.15 + 0.85 * b, 0.08 + 0.7 * b);
      screenLabel.setText(`넓이 ${fmt(r * r, 1)}배\n밝기 1/${fmt(r * r, 1)}배`);
      screenLabel.position.set(SRC.x + UNIT * r + 0.1, SRC.y + (SIDE * r) / 2 + 0.35, SRC.z);
    }

    return {
      update(dt) {
        inv.visible = state.topic === 'inverse';
        mag.visible = state.topic === 'mag';
        if (inv.visible) updateInverse();
        if (mag.visible) updateMag(dt);
      },
      controls: [
        {
          type: 'choice',
          label: '주제',
          options: [
            { value: 'inverse', label: '거리와 밝기' },
            { value: 'mag', label: '겉보기·절대 등급' },
          ],
          get: () => state.topic,
          set: (v) => (state.topic = v),
        },
        // 역제곱 법칙
        {
          type: 'slider', label: '스크린까지 거리', min: 1, max: 3, step: 0.01,
          get: () => state.r, set: (v) => (state.r = v), format: (v) => `${fmt(v, 2)}배`,
          visible: () => state.topic === 'inverse',
        },
        { type: 'readout', label: '빛이 비추는 넓이', get: () => `${fmt(state.r ** 2, 2)}배`, visible: () => state.topic === 'inverse' },
        { type: 'readout', label: '같은 넓이가 받는 밝기', get: () => `1/${fmt(state.r ** 2, 2)}배`, visible: () => state.topic === 'inverse' },
        {
          type: 'buttons',
          items: [1, 2, 3].map((r) => ({ label: `${r}배`, onClick: () => (state.r = r) })),
          visible: () => state.topic === 'inverse',
        },
        // 등급
        {
          type: 'choice',
          label: '별 고르기',
          options: STARS.map((s) => ({ value: s.id, label: s.name.replace(/\(.*\)/, '') })),
          get: () => state.sel,
          set: (v) => {
            state.sel = v;
            state.factor = 1;
          },
          visible: () => state.topic === 'mag',
        },
        { type: 'readout', label: '겉보기 등급 m (지금)', get: () => fmt(current(selStar()).m, 2), visible: () => state.topic === 'mag' },
        { type: 'readout', label: '절대 등급 M', get: () => fmt(selStar().M, 2), visible: () => state.topic === 'mag' },
        {
          type: 'readout', label: '거리',
          get: () => {
            const d = current(selStar()).d;
            return d < 0.01 ? '1 AU (약 0.000005 pc)' : `${fmt(d, d < 10 ? 2 : 0)} pc (${fmt(d * 3.26, 0)} 광년)`;
          },
          visible: () => state.topic === 'mag',
        },
        {
          type: 'readout', label: 'm − M',
          get: () => {
            const x = current(selStar()).m - selStar().M;
            return `${fmtSigned(x)} → ${Math.abs(x) < 0.02 ? '10 pc' : x > 0 ? '10 pc보다 멀다' : '10 pc보다 가깝다'}`;
          },
          visible: () => state.topic === 'mag',
        },
        {
          type: 'slider', label: '고른 별의 거리 바꾸기', min: 0.25, max: 4, step: 0.05,
          get: () => state.factor, set: (v) => (state.factor = v), format: (v) => `${fmt(v, 2)}배`,
          visible: () => state.topic === 'mag',
        },
        {
          type: 'readout', label: '처음보다 밝기',
          get: () => `${fmt(1 / state.factor ** 2, 2)}배 (등급 ${fmtSigned(5 * Math.log10(state.factor))})`,
          visible: () => state.topic === 'mag',
        },
        {
          type: 'button',
          label: '모든 별을 10 pc로 옮기기 / 되돌리기',
          onClick: () => (state.at10 = !state.at10),
          visible: () => state.topic === 'mag',
        },
        {
          type: 'note',
          get: () =>
            state.topic === 'mag'
              ? '별의 크기·밝기 그림은 지금 지구에서 보이는 밝기(겉보기 등급)를 나타내요. 10 pc로 옮기면 겉보기 등급 = 절대 등급이 돼요.'
              : '광원에서 나온 빛의 양은 같지만, 멀어질수록 넓은 면적에 퍼져서 같은 넓이(한 칸)가 받는 빛은 줄어들어요.',
        },
      ],
    };
  },
};
