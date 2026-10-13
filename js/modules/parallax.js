// 연주 시차: 지구가 태양 주위를 돌면 가까운 별이 먼 배경 별에 대해 움직여 보인다.
import * as THREE from 'three';
import {
  makeLabel, makeStar, makeStarPoints, makeRod, makeDashedRod, makeRing, makeAngleWedge, makeGlow,
  makePolyline, getEarthTexture, fmt, mulberry32, kelvinToColor,
} from '../core/helpers.js';

const R = 2; // 지구 공전 궤도 반지름 (= 1 AU, 모형 단위)
const K = 3; // 1 pc 를 모형에서 몇 단위로 그릴지 (실제보다 엄청나게 가깝게 과장)
const BG_Z = -20; // 배경 별 벽까지의 거리
const ORIGIN = new THREE.Vector3(0, 0, 0);

export default {
  view: {
    layout: 'diorama',
    radius: 12,
    center: [0, 0, -8.5],
    camera: { pos: [10, 10, 9], target: [0, 0, -6] },
    vrRadius: 1.3,
    arRadius: 0.42,
  },

  info: `
## 연주 시차란?
지구는 1년에 한 바퀴 태양 주위를 돌아요(공전). 그래서 6개월 간격으로 같은 별을 보면 바라보는 위치가 달라지고, 가까운 별은 멀리 있는 배경 별에 대해 위치가 조금 바뀌어 보여요.
- 6개월 간격(A, B)으로 별을 바라본 두 방향 사이의 각 = **시차**
- 시차의 **1/2** = **연주 시차** (기호 p, 단위 ″(초))
- 1° = 60′(분) = 3600″(초)
## 연주 시차와 거리
- 별까지의 거리 d(pc) = 1 / 연주 시차 p(″)
- 연주 시차가 1″인 별까지의 거리 = **1 pc(파섹)** ≈ 3.26 광년
- 거리가 2배가 되면 연주 시차는 1/2배 → **연주 시차는 거리에 반비례**
## 관찰해 보기
- '공전 재생'을 켜고 '지구에서 본 하늘' 화면을 보세요. 가까운 별(노란 별)이 배경 별들 사이에서 좌우로 왔다 갔다 해요.
- 별까지의 거리를 늘리면 왔다 갔다 하는 폭이 줄어들어요.
- 너무 먼 별은 연주 시차가 너무 작아 측정하기 어려워요. 그래서 연주 시차로는 비교적 가까운 별까지의 거리만 구할 수 있어요.
- 지구가 태양 반대편(별과 태양 사이의 반대쪽)에 있을 때는 별이 낮 하늘에 있어 보이지 않아요. 그래서 연주 시차는 밤에 볼 수 있는 시기에 측정해요.
## 주의
실제 연주 시차는 가장 가까운 별도 1″보다 작아서 눈으로는 볼 수 없어요. 이 모형은 원리를 보기 위해 별을 아주 가깝게 그렸어요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = {
      d: 2, // 별까지 거리 (pc)
      month: 0, // 0~12
      playing: true,
      speed: 1.2, // 초당 개월 수
      lines: true,
      extremes: true,
      angle: true,
      trail: true,
    };

    root.add(new THREE.AmbientLight(0xffffff, 0.35));
    root.add(new THREE.PointLight(0xfff2cc, 3, 0, 0));

    // 태양
    const sun = makeStar(0xffd54f, 0.38, 5);
    root.add(sun);
    const sunLabel = makeLabel('태양', { size: 0.34, anchor: [0.5, 0] });
    sunLabel.position.set(0, 0.6, 0);
    root.add(sunLabel);

    // 지구 궤도와 지구
    root.add(makeRing(R, 0.015, 0x6fa8ff, 0.8));
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 32, 16),
      new THREE.MeshStandardMaterial({ map: getEarthTexture(), roughness: 0.8 })
    );
    root.add(earth);
    const earthLabel = makeLabel('지구', { size: 0.3, anchor: [0.5, 0], color: '#bfe1ff' });
    root.add(earthLabel);

    // 위에서 볼 때 시계 반대 방향으로 공전. 1월에 오른쪽 끝(A), 7월에 왼쪽 끝(B)
    const earthPos = (m, out = new THREE.Vector3()) => {
      const a = (m / 12) * Math.PI * 2;
      return out.set(R * Math.cos(a), 0, -R * Math.sin(a));
    };
    const monthLabels = new THREE.Group();
    for (const i of [0, 3, 6, 9]) {
      const l = makeLabel(`${i + 1}월`, { size: 0.22, color: '#9fb0d6', bg: null });
      l.position.copy(earthPos(i)).multiplyScalar(1.2);
      monthLabels.add(l);
    }
    root.add(monthLabels);

    // 가까운 별
    const star = makeStar(0xfff176, 0.2, 7);
    root.add(star);
    const starLabel = makeLabel('가까운 별', { size: 0.32, anchor: [0.5, 0], color: '#fff59d' });
    root.add(starLabel);

    // 먼 배경 별들 (벽처럼 늘어놓음)
    const bg = new THREE.Group();
    const rand = mulberry32(11);
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < 220; i++) {
      pos.push((rand() - 0.5) * 28, (rand() - 0.5) * 11, BG_Z - rand() * 1.2);
      kelvinToColor(3500 + rand() * 9000, c).multiplyScalar(0.5 + rand() * 0.5);
      col.push(c.r, c.g, c.b);
    }
    bg.add(makeStarPoints(pos, col, 0.32));
    // 별자리처럼 보이도록 조금 큰 별 몇 개
    for (let i = 0; i < 14; i++) {
      kelvinToColor(4000 + rand() * 8000, c);
      const s = makeStar(c.getHex(), 0.08, 5);
      s.position.set((rand() - 0.5) * 26, (rand() - 0.5) * 10, BG_Z);
      bg.add(s);
    }
    const bgLabel = makeLabel('아주 멀리 있는 배경 별들', { size: 0.5, color: '#c5cae9' });
    bgLabel.position.set(0, 6.3, BG_Z);
    bg.add(bgLabel);
    root.add(bg);

    // 시선(지구 → 별 → 배경)
    const sight = makeRod(0x80deea, 0.03);
    const sightFar = makeDashedRod(0x80deea, 0.022, 0.3);
    const proj = makeGlow(0x80deea, 1.0);
    const trail = makePolyline(600, 0x80deea, 0.8);
    root.add(sight, sightFar, proj, trail);
    const trailPts = [];

    // 태양 → 별, 태양 → A (삼각형)
    const sunToStar = makeDashedRod(0xffd54f, 0.02, 0.2);
    const sunToA = makeDashedRod(0xffd54f, 0.02, 0.12);
    const auLabel = makeLabel('1 AU', { size: 0.22, color: '#ffe082', anchor: [0.5, 0] });
    const distLabel = makeLabel('', { size: 0.3, color: '#fff59d', anchor: [1.08, 0.5] });
    root.add(sunToStar, sunToA, auLabel, distLabel);

    // 6개월 간격 양 끝 시선
    const extremes = new THREE.Group();
    const exA = makeRod(0xff8a65, 0.025);
    const exB = makeRod(0xff8a65, 0.025);
    const exAFar = makeDashedRod(0xff8a65, 0.018, 0.3);
    const exBFar = makeDashedRod(0xff8a65, 0.018, 0.3);
    const markA = makeLabel('A (1월)', { size: 0.26, color: '#ffab91', anchor: [0.5, 0] });
    const markB = makeLabel('B (7월)', { size: 0.26, color: '#ffab91', anchor: [0.5, 0] });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff8a65, transparent: true, opacity: 0.45 });
    const ghostA = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), ghostMat);
    const ghostB = new THREE.Mesh(ghostA.geometry, ghostMat);
    const projA = makeGlow(0xff8a65, 0.9);
    const projB = makeGlow(0xff8a65, 0.9);
    const projALabel = makeLabel('A에서 본 별 위치', { size: 0.3, color: '#ffab91', anchor: [0.5, -0.4] });
    const projBLabel = makeLabel('B에서 본 별 위치', { size: 0.3, color: '#ffab91', anchor: [0.5, -0.4] });
    extremes.add(exA, exB, exAFar, exBFar, markA, markB, ghostA, ghostB, projA, projB, projALabel, projBLabel);
    root.add(extremes);

    // 각도 표시: 시차(2p)와 연주 시차(p)
    const wedgeFull = makeAngleWedge({ color: 0xff8a65, fillOpacity: 0.14, stroke: 0.035 });
    const wedgeHalf = makeAngleWedge({ color: 0xffd54f, fillOpacity: 0.35, stroke: 0.045 });
    const pLabel = makeLabel('연주 시차 p', { size: 0.28, color: '#ffe082', anchor: [0, 0.5] });
    const p2Label = makeLabel('시차 (= 2p)', { size: 0.24, color: '#ffab91', anchor: [1, 0.5] });
    const angles = new THREE.Group();
    angles.add(wedgeFull, wedgeHalf, pLabel, p2Label);
    root.add(angles);

    // 지구에서 본 하늘 (작은 화면)
    const pipCam = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 500);
    ctx.createPiP({ camera: pipCam, label: '지구에서 본 하늘 (별 쪽을 바라봄)', aspect: 4 / 3 });

    const e = new THREE.Vector3();
    const s = new THREE.Vector3();
    const w = new THREE.Vector3();
    const look = new THREE.Vector3();

    // 지구에서 별을 지나 배경 벽(z = BG_Z)까지 이은 점
    const onWall = (from, through, out) => {
      const t = (BG_Z - from.z) / (through.z - from.z);
      return out.copy(through).sub(from).multiplyScalar(t).add(from);
    };

    let lastD = -1;
    function rebuildStatic() {
      s.set(0, 0, -state.d * K);
      star.position.copy(s);
      starLabel.position.set(s.x, s.y + 0.45, s.z);
      sunToStar.setEnds(ORIGIN, s);
      distLabel.setText(`d = ${fmt(state.d, 1)} pc`);
      distLabel.position.set(0, 0, s.z / 2);
      const A = earthPos(0, new THREE.Vector3());
      const B = earthPos(6, new THREE.Vector3());
      sunToA.setEnds(ORIGIN, A);
      auLabel.position.set(A.x / 2, 0.08, 0);
      ghostA.position.copy(A);
      ghostB.position.copy(B);
      markA.position.set(A.x + 0.35, 0.22, A.z + 0.2);
      markB.position.set(B.x - 0.35, 0.22, B.z + 0.2);
      exA.setEnds(A, s);
      exB.setEnds(B, s);
      const wa = onWall(A, s, new THREE.Vector3());
      const wb = onWall(B, s, new THREE.Vector3());
      exAFar.setEnds(s, wa);
      exBFar.setEnds(s, wb);
      projA.position.copy(wa);
      projB.position.copy(wb);
      projALabel.position.copy(wa);
      projBLabel.position.copy(wb);
      // 각도: 별에서 A·B를 본 각(시차), 별에서 태양·A를 본 각(연주 시차)
      const dist = s.length();
      const toA = A.clone().sub(s).normalize();
      const toB = B.clone().sub(s).normalize();
      const toSun = ORIGIN.clone().sub(s).normalize();
      const rHalf = Math.min(0.55 * dist, 4);
      const rFull = rHalf * 0.62;
      wedgeHalf.set(s, toSun, toA, rHalf);
      wedgeFull.set(s, toA, toB, rFull);
      pLabel.position.copy(s).addScaledVector(toSun.clone().add(toA).normalize(), rHalf * 1.02).add(new THREE.Vector3(0.1, 0, 0));
      p2Label.position.copy(s).addScaledVector(toSun.clone().add(toB).normalize(), rFull * 0.95).add(new THREE.Vector3(-0.1, 0, 0));
      trailPts.length = 0;
    }

    function update(dt) {
      if (state.playing) state.month = (state.month + dt * state.speed) % 12;
      if (state.d !== lastD) {
        rebuildStatic();
        lastD = state.d;
      }
      earthPos(state.month, e);
      earth.position.copy(e);
      earth.rotation.y += dt * 3;
      earthLabel.position.set(e.x, 0.25, e.z);

      onWall(e, s, w);
      sight.setEnds(e, s);
      sightFar.setEnds(s, w);
      proj.position.copy(w);
      if (state.trail) {
        trailPts.push(w.clone().setZ(BG_Z + 0.05));
        if (trailPts.length > 600) trailPts.shift();
        trail.setPoints(trailPts);
      }
      trail.visible = state.trail;
      sight.visible = sightFar.visible = proj.visible = state.lines;
      extremes.visible = state.extremes;
      angles.visible = state.angle;

      // 지구에서 별 쪽(-Z)을 바라본 모습
      pipCam.position.copy(e);
      pipCam.lookAt(ctx.toWorld(look.set(e.x, 0, e.z - 10)));
    }

    // 작은 화면을 그릴 때: 배경 별을 지구와 함께 옮겨(무한히 먼 별처럼) 그리고, 도움선은 숨긴다
    const hidden = [];
    const helpers = [sight, sightFar, proj, trail, extremes, angles, earth, earthLabel, sunToStar, sunToA,
      auLabel, distLabel, bgLabel, monthLabels, sunLabel, starLabel];
    return {
      update,
      beforePiP() {
        bg.position.set(e.x, 0, e.z);
        hidden.length = 0;
        for (const o of helpers) {
          if (o.visible) {
            hidden.push(o);
            o.visible = false;
          }
        }
      },
      afterPiP() {
        bg.position.set(0, 0, 0);
        for (const o of hidden) o.visible = true;
      },
      controls: [
        { type: 'heading', label: '별까지의 거리' },
        {
          type: 'slider', label: '거리 d', min: 1, max: 5, step: 0.1,
          get: () => state.d, set: (x) => (state.d = x), format: (x) => `${fmt(x, 1)} pc`,
        },
        { type: 'readout', label: '연주 시차 p = 1/d', get: () => `${fmt(1 / state.d, 2)}″` },
        { type: 'readout', label: '광년으로 바꾸면', get: () => `약 ${fmt(state.d * 3.26, 1)} 광년` },
        { type: 'heading', label: '지구의 공전' },
        { type: 'toggle', label: '공전 재생', get: () => state.playing, set: (x) => (state.playing = x) },
        {
          type: 'slider', label: '날짜', min: 0, max: 11.99, step: 0.01,
          get: () => state.month, set: (x) => (state.month = x),
          format: (x) => `${Math.floor(x) + 1}월 ${Math.min(30, Math.floor((x % 1) * 30) + 1)}일`,
        },
        {
          type: 'buttons',
          items: [
            { label: 'A (1월)로', onClick: () => { state.playing = false; state.month = 0; } },
            { label: 'B (7월)로', onClick: () => { state.playing = false; state.month = 6; } },
          ],
        },
        { type: 'heading', label: '보이기' },
        { type: 'toggle', label: '지금 시선 (지구→별→배경)', get: () => state.lines, set: (x) => (state.lines = x) },
        { type: 'toggle', label: '6개월 간격 양 끝 시선 (A, B)', get: () => state.extremes, set: (x) => (state.extremes = x) },
        { type: 'toggle', label: '시차·연주 시차 각도', get: () => state.angle, set: (x) => (state.angle = x) },
        {
          type: 'toggle', label: '배경에 비친 별의 자취',
          get: () => state.trail, set: (x) => { state.trail = x; trailPts.length = 0; },
        },
        {
          type: 'note',
          text: '거리가 2배 → 연주 시차 1/2배. 실제 연주 시차는 매우 작은 각이라 모형에서는 별을 아주 가깝게 과장했어요.',
        },
      ],
    };
  },
};
