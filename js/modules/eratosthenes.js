// 에라토스테네스의 지구 크기 측정: 평행한 햇빛, 막대 그림자, 엇각, 비례식
import * as THREE from 'three';
import { makeLabel, makeStar, makeRod, makeAngleWedge, fmt, DEG } from '../core/helpers.js';

const RE = 3; // 모형 지구 반지름
const H = 0.55; // 막대 높이 (과장)
const EX = new THREE.Vector3(1, 0, 0);
const O = new THREE.Vector3(0, 0, 0);

function overlay(mesh, order = 30) {
  // 지구 속에 있는 선도 보이도록 깊이 검사를 끈다
  mesh.traverse((o) => {
    if (o.material) {
      o.material.depthTest = false;
      o.material.transparent = true;
    }
    o.renderOrder = order;
  });
  return mesh;
}

export default {
  view: {
    layout: 'diorama',
    radius: 9,
    center: [4.5, 0.8, 0],
    camera: { pos: [3.5, 2, 13.5], target: [4.2, 1, 0] },
    vrRadius: 1.1,
    arRadius: 0.4,
  },

  info: `
## 에라토스테네스의 측정 (약 2200년 전)
- 하짓날 정오, **시에네**에서는 깊은 우물 바닥까지 햇빛이 비쳤어요 → 태양이 바로 머리 위
- 같은 시각, 북쪽의 **알렉산드리아**에서는 막대에 그림자가 생겼고, 막대와 햇빛이 이루는 각은 약 **7.2°**
- 두 도시 사이 거리는 약 **925 km** (5000 스타디아)
## 두 가지 가정
- 지구는 완전한 **구형**이다.
- 태양 광선은 지구 어디에나 **평행**하게 들어온다.
## 원리: 엇각
평행한 두 직선(햇빛)과 지구 중심을 지나는 직선이 만나서 생기는 **엇각은 같다** → 막대와 햇빛이 이루는 각 θ = 두 도시 사이의 **중심각** θ
## 비례식
- 원에서 호의 길이는 중심각에 비례해요.
- 360° : 지구 둘레(2πR) = θ : l
- 지구 둘레 = 360° × l ÷ θ = 360 × 925 ÷ 7.2 ≈ **46,250 km**
- 실제 둘레(약 40,000 km)와 차이가 나는 까닭: 두 도시가 정확히 같은 경도에 있지 않았고, 거리 측정이 정확하지 않았기 때문이에요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = { theta: 7.2, l: 925, rays: true, center: true, exaggerate: true };

    root.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dl = new THREE.DirectionalLight(0xffffff, 2.4);
    dl.position.set(10, 0, 3);
    root.add(dl, dl.target);

    // 지구
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(RE, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a78c2, roughness: 0.75, transparent: true, opacity: 0.88 })
    );
    root.add(earth);
    const centerDot = overlay(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    root.add(centerDot);
    const centerLabel = makeLabel('지구 중심', { size: 0.26, anchor: [1.1, 0.5] });
    root.add(centerLabel);
    // 경선 (두 도시를 지나는 선)
    const merPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      merPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(RE * 1.003));
    }
    const meridian = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(merPts),
      new THREE.LineBasicMaterial({ color: 0xbbdefb, transparent: true, opacity: 0.5 })
    );
    root.add(meridian);

    // 태양과 평행 광선
    const sun = makeStar(0xffd54f, 0.9, 4.5);
    sun.position.set(14, 1.2, 0);
    root.add(sun);
    const sunLabel = makeLabel('태양 (아주 멀리 있음)', { size: 0.32, anchor: [0.5, -1.2] });
    sunLabel.position.copy(sun.position);
    root.add(sunLabel);
    const rays = new THREE.Group();
    const rayLabel = makeLabel('평행한 햇빛', { size: 0.28, color: '#ffe082', anchor: [0.5, -0.3] });
    rays.add(rayLabel);
    for (const y of [-2.4, -1.4, 3.6, 4.4]) {
      const x = Math.abs(y) < RE ? Math.sqrt(RE * RE - y * y) : -2;
      const rod = makeRod(0xffe082, 0.025, { opacity: 0.85 });
      rod.setEnds(new THREE.Vector3(12.5, y, 0), new THREE.Vector3(x, y, 0));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 12), new THREE.MeshBasicMaterial({ color: 0xffe082 }));
      tip.position.set(7, y, 0);
      tip.rotation.z = Math.PI / 2;
      rays.add(rod, tip);
    }
    rayLabel.position.set(9, 4.4, 0);
    root.add(rays);

    // 시에네: 우물
    const syene = new THREE.Vector3(RE, 0, 0);
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.12, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8d6e63, side: THREE.DoubleSide })
    );
    well.rotation.z = Math.PI / 2;
    well.position.set(RE + 0.03, 0, 0);
    const wellHole = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    wellHole.rotation.y = Math.PI / 2;
    wellHole.position.set(RE + 0.005, 0, 0);
    root.add(well, wellHole);
    const syeneRay = makeRod(0xffeb3b, 0.03);
    syeneRay.setEnds(new THREE.Vector3(12.5, 0, 0), new THREE.Vector3(RE - 0.25, 0, 0));
    root.add(syeneRay);
    const syeneLabel = makeLabel('시에네\n(우물 바닥까지 햇빛이 비침)', { size: 0.24, anchor: [0, 1.15], color: '#fff59d' });
    syeneLabel.position.set(RE + 0.25, -0.1, 0);
    root.add(syeneLabel);

    // 알렉산드리아: 막대와 그림자
    const stick = makeRod(0xffffff, 0.022);
    const shadow = makeRod(0x111111, 0.03);
    const alexRay = makeRod(0xffeb3b, 0.022);
    const alexLabel = makeLabel('알렉산드리아의 막대', { size: 0.24, anchor: [-0.08, -0.3], color: '#fff59d' });
    root.add(stick, shadow, alexRay, alexLabel);
    const stickWedge = overlay(makeAngleWedge({ color: 0xff8a65, fillOpacity: 0.45, stroke: 0.012 }), 31);
    root.add(stickWedge);
    const stickAngleLabel = makeLabel('θ', { size: 0.2, color: '#ffab91', bg: null });
    root.add(stickAngleLabel);

    // 중심각
    const centerGroup = new THREE.Group();
    const toSyene = overlay(makeRod(0xffffff, 0.02, { opacity: 0.9 }));
    const toAlex = overlay(makeRod(0xffffff, 0.02, { opacity: 0.9 }));
    const cWedge = overlay(makeAngleWedge({ color: 0xff8a65, fillOpacity: 0.4, stroke: 0.04 }), 31);
    const cLabel = makeLabel('', { size: 0.26, color: '#ffab91', anchor: [0, 0.5] });
    centerGroup.add(toSyene, toAlex, cWedge, cLabel);
    root.add(centerGroup);
    const altNote = makeLabel('막대 위의 θ와 중심각 θ는 엇각으로 같다!', { size: 0.22, color: '#ffab91', anchor: [0.5, 0] });
    root.add(altNote);

    // 두 도시 사이 호
    let arc = null;
    const arcLabel = makeLabel('', { size: 0.24, color: '#ffcc80', anchor: [-0.1, 0.5] });
    root.add(arcLabel);

    // 막대 가까이 확대해서 보기
    const pipCam = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 100);
    ctx.createPiP({ camera: pipCam, label: '알렉산드리아의 막대와 그림자 (확대)' });

    let last = '';
    function rebuild() {
      // 그림에서는 각을 3배로 과장해서 그릴 수 있다 (계산은 실제 θ로)
      const th = state.theta * (state.exaggerate ? 3 : 1) * DEG;
      const n = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
      const P = n.clone().multiplyScalar(RE);
      const T = n.clone().multiplyScalar(RE + H);
      const tip = T.clone().addScaledVector(EX, -H / Math.cos(th));
      stick.setEnds(P, T);
      shadow.setEnds(P.clone().addScaledVector(n, 0.01), tip.clone().addScaledVector(n, 0.01));
      alexRay.setEnds(new THREE.Vector3(12.5, T.y, 0), tip);
      alexLabel.position.copy(T);
      const r = 0.32;
      stickWedge.set(T, n.clone().negate(), EX.clone().negate(), r);
      stickAngleLabel.position.copy(T).addScaledVector(n.clone().negate().add(EX.clone().negate()).normalize(), r + 0.12);
      toSyene.setEnds(O, syene);
      toAlex.setEnds(O, T);
      cWedge.set(O, EX, n, 1.1);
      cLabel.setText(`중심각 θ = ${fmt(state.theta, 1)}°`);
      cLabel.position.copy(n.clone().add(EX).normalize().multiplyScalar(1.25));
      altNote.position.copy(n).multiplyScalar(RE * 0.55).add(new THREE.Vector3(-0.2, 0.32, 0));
      // 호
      if (arc) {
        root.remove(arc);
        arc.geometry.dispose();
      }
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = (th * i) / 40;
        pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(RE * 1.01));
      }
      arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.04, 8, false), new THREE.MeshBasicMaterial({ color: 0xffa726 }));
      root.add(arc);
      const mid = new THREE.Vector3(Math.cos(th / 2), Math.sin(th / 2), 0).multiplyScalar(RE + 0.15);
      arcLabel.setText(`l = ${fmt(state.l, 0)} km`);
      arcLabel.position.copy(mid).add(new THREE.Vector3(0.25, 0, 0.2));
      // 확대 카메라: 막대가 위로 서 보이도록 (막대 방향 = 화면 위쪽)
      const look = P.clone().addScaledVector(n, H * 0.5);
      pipCam.position.copy(look).add(new THREE.Vector3(0, 0, 2.2));
      pipCam.up.copy(ctx.dirToWorld(n));
      pipCam.lookAt(ctx.toWorld(look));
    }

    const circumference = () => (360 * state.l) / state.theta;
    const hidden = [];
    return {
      update() {
        const key = state.theta + '|' + state.l + '|' + state.exaggerate;
        if (key !== last) {
          last = key;
          rebuild();
        }
        rays.visible = state.rays;
        centerGroup.visible = altNote.visible = state.center;
      },
      beforePiP() {
        hidden.length = 0;
        for (const o of [centerLabel, centerGroup, altNote, alexLabel, arcLabel, syeneLabel, rays]) {
          if (o.visible) {
            hidden.push(o);
            o.visible = false;
          }
        }
      },
      afterPiP() {
        for (const o of hidden) o.visible = true;
      },
      controls: [
        { type: 'heading', label: '측정값' },
        {
          type: 'slider', label: '막대와 햇빛이 이루는 각 θ', min: 2, max: 30, step: 0.1,
          get: () => state.theta, set: (v) => (state.theta = v), format: (v) => `${fmt(v, 1)}°`,
        },
        {
          type: 'slider', label: '두 도시 사이 거리 l', min: 300, max: 3000, step: 5,
          get: () => state.l, set: (v) => (state.l = v), format: (v) => `${fmt(v, 0)} km`,
        },
        {
          type: 'button', label: '에라토스테네스의 값으로 (7.2°, 925 km)',
          onClick: () => { state.theta = 7.2; state.l = 925; },
        },
        { type: 'heading', label: '계산' },
        { type: 'readout', label: '360° : 2πR = θ : l', get: () => `360 : 2πR = ${fmt(state.theta, 1)} : ${fmt(state.l, 0)}` },
        { type: 'readout', label: '지구 둘레 2πR', get: () => `약 ${fmt(circumference(), 0)} km` },
        { type: 'readout', label: '지구 반지름 R', get: () => `약 ${fmt(circumference() / (2 * Math.PI), 0)} km` },
        {
          type: 'readout', label: '실제 둘레(40,000 km)와 차이',
          get: () => `${fmt(((circumference() - 40000) / 40000) * 100, 1)} %`,
        },
        { type: 'heading', label: '보이기' },
        { type: 'toggle', label: '평행한 햇빛', get: () => state.rays, set: (v) => (state.rays = v) },
        { type: 'toggle', label: '지구 중심과 중심각', get: () => state.center, set: (v) => (state.center = v) },
        { type: 'toggle', label: '그림에서 각을 3배로 과장하기', get: () => state.exaggerate, set: (v) => (state.exaggerate = v) },
        { type: 'note', text: '막대는 잘 보이도록 아주 길게 그렸어요. 계산은 항상 실제 θ 값으로 해요.' },
      ],
    };
  },
};
