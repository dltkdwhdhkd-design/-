// 일식과 월식: 태양-달-지구가 일직선이 될 때 달 또는 지구의 그림자에 가려진다.
// 지구와 달 표면의 밝기는 셰이더에서 "태양 원판이 얼마나 가려졌는지"를 직접 계산해 반그림자까지 표현한다.
import * as THREE from 'three';
import { makeLabel, makeStar, makeRing, getEarthTexture, getMoonTexture, fmt, DEG } from '../core/helpers.js';

const SUN = new THREE.Vector3(6, 0, 0);
const R_S = 1.2;
const R_E = 0.5;
const R_MO = 1.3; // 달 궤도 반지름
const R_MOON = 0.2;
const MONTH = 29.53;

// 표준 재질에 '식(蝕)' 계산을 끼워 넣는다
function eclipseMaterial(params, red) {
  const mat = new THREE.MeshStandardMaterial(params);
  const u = {
    uSunPos: { value: new THREE.Vector3() },
    uSunR: { value: 1 },
    uOccPos: { value: new THREE.Vector3() },
    uOccR: { value: 1 },
    uRed: { value: red ? 1 : 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEclWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEclWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEclWorld;
uniform vec3 uSunPos;
uniform float uSunR;
uniform vec3 uOccPos;
uniform float uOccR;
uniform float uRed;
float eclVis() {
  vec3 ds = uSunPos - vEclWorld;
  float dsl = length(ds);
  vec3 dob = uOccPos - vEclWorld;
  float dol = length(dob);
  if (dot(ds, dob) <= 0.0 || dol > dsl) return 1.0;
  float a = asin(clamp(uSunR / dsl, 0.0, 1.0));
  float b = asin(clamp(uOccR / dol, 0.0, 1.0));
  float c = acos(clamp(dot(ds / dsl, dob / dol), -1.0, 1.0));
  if (c >= a + b) return 1.0;
  float overlap;
  if (c <= abs(a - b)) {
    overlap = (b >= a) ? 1.0 : (b * b) / (a * a);
  } else {
    float a2 = a * a;
    float b2 = b * b;
    float c2 = c * c;
    float p1 = a2 * acos(clamp((c2 + a2 - b2) / (2.0 * c * a), -1.0, 1.0));
    float p2 = b2 * acos(clamp((c2 + b2 - a2) / (2.0 * c * b), -1.0, 1.0));
    float p3 = 0.5 * sqrt(max(0.0, (-c + a + b) * (c + a - b) * (c - a + b) * (c + a + b)));
    overlap = (p1 + p2 - p3) / (PI * a2);
  }
  return clamp(1.0 - overlap, 0.0, 1.0);
}`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  float vis = eclVis();
  reflectedLight.directDiffuse *= vis;
  reflectedLight.directSpecular *= vis;
  reflectedLight.indirectDiffuse += uRed * pow(1.0 - vis, 2.0) * vec3(0.6, 0.14, 0.05) * diffuseColor.rgb;
}`
      );
  };
  mat.userData.ecl = u;
  return mat;
}

// 그림자 원뿔 (본그림자: 모이는 원뿔, 반그림자: 퍼지는 원뿔)
function shadowCones(rOcc, lenPen, colorU = 0x000000) {
  const g = new THREE.Group();
  const umbra = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, 0.5, 0), // 밑면(반지름 1)이 원점, 꼭짓점이 +Y
    new THREE.MeshBasicMaterial({ color: colorU, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
  );
  const spread = (R_S + rOcc) / SUN.length();
  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(rOcc + lenPen * spread, rOcc, lenPen, 40, 1, true).translate(0, lenPen / 2, 0),
    new THREE.MeshBasicMaterial({ color: 0x5c6bc0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
  );
  g.add(pen, umbra);
  g.userData = { umbra, rOcc };
  return g;
}

export default {
  view: {
    layout: 'diorama',
    radius: 5.5,
    center: [1.6, 0, 0],
    camera: { pos: [1.2, 3.4, 6.8], target: [1.5, 0, 0] },
    vrRadius: 1.0,
    arRadius: 0.38,
  },

  info: `
## 일식
**태양 - 달 - 지구** 순서로 일직선이 될 때(삭), 달이 태양을 가리는 현상이에요.
- **개기 일식**: 달의 **본그림자**가 닿는 곳 → 태양이 완전히 가려짐
- **부분 일식**: 달의 **반그림자**가 닿는 곳 → 태양의 일부만 가려짐
- 달이 지구에서 멀 때는 달이 태양을 다 가리지 못해 **금환 일식**(가장자리가 고리처럼 보임)이 일어나기도 해요.
- 일식은 달의 그림자가 닿는 **좁은 지역**에서만 볼 수 있어요.
## 월식
**태양 - 지구 - 달** 순서로 일직선이 될 때(망), 달이 지구의 그림자 속으로 들어가는 현상이에요.
- **개기 월식**: 달 전체가 지구의 본그림자에 들어감 → 달이 **붉게** 보여요 (지구 대기를 지나며 굴절된 붉은 빛)
- **부분 월식**: 달의 일부만 본그림자에 들어감
- 월식은 달이 보이는 **밤인 지역 어디서나** 볼 수 있어요.
## 왜 매달 일어나지 않을까?
달의 공전 궤도면은 지구의 공전 궤도면에 대해 약 **5°** 기울어져 있어요. 그래서 삭이나 망이 되어도 대부분 태양-달-지구가 정확히 일직선이 되지 않아요.
## 주의
이 모형은 거리와 크기를 실제보다 크게 줄였어요. 그래서 궤도 기울기 효과를 보려면 실제(5°)보다 훨씬 크게 기울여야 해요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = { age: MONTH / 2 - 0.6, playing: false, speed: 1.5, tilt: 0, node: 0, cones: true };

    root.add(new THREE.AmbientLight(0xffffff, 0.08));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.copy(SUN);
    root.add(light, light.target);

    const sun = makeStar(0xffe082, R_S, 4);
    sun.position.copy(SUN);
    root.add(sun);
    const sunLabel = makeLabel('태양', { size: 0.3, anchor: [0.5, -2.6] });
    sunLabel.position.copy(SUN);
    root.add(sunLabel);

    const earthMat = eclipseMaterial({ map: getEarthTexture(), roughness: 0.85 }, false);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R_E, 64, 32), earthMat);
    root.add(earth);
    const earthLabel = makeLabel('지구', { size: 0.2, anchor: [0.5, -2.0], color: '#bfe1ff' });
    root.add(earthLabel);
    const moonMat = eclipseMaterial({ map: getMoonTexture(), roughness: 1 }, true);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON, 48, 24).rotateY(-Math.PI / 2), moonMat);
    root.add(moon);
    const moonLabel = makeLabel('달', { size: 0.2, anchor: [0.5, -1.6] });
    root.add(moonLabel);

    // 달의 궤도 (기울기 반영)
    const orbit = makeRing(R_MO, 0.008, 0x9fb0d6, 0.7, 128);
    const orbitPivot = new THREE.Group();
    orbitPivot.add(orbit);
    root.add(orbitPivot);
    const eclipticRing = makeRing(R_MO * 1.25, 0.006, 0xffd54f, 0.35, 128);
    root.add(eclipticRing);
    const nodeLine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, R_MO * 2.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8a65, transparent: true, opacity: 0.7 })
    );
    nodeLine.rotation.z = Math.PI / 2;
    const nodeGroup = new THREE.Group();
    nodeGroup.add(nodeLine);
    root.add(nodeGroup);

    // 그림자
    const moonShadow = shadowCones(R_MOON, 1.6);
    const earthShadow = shadowCones(R_E, 2.6);
    root.add(moonShadow, earthShadow);
    const umbraLabel = makeLabel('본그림자', { size: 0.17, color: '#cfd8dc', anchor: [0.5, 1.4] });
    const penLabel = makeLabel('반그림자', { size: 0.17, color: '#9fa8da', anchor: [0.5, -1.0] });
    root.add(umbraLabel, penLabel);

    // 지구에서 본 하늘
    const pipCam = new THREE.PerspectiveCamera(32, 4 / 3, 0.005, 100);
    root.add(pipCam);
    const pip = ctx.createPiP({ camera: pipCam, label: '' });

    const moonPos = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();
    const theta = () => (state.age / MONTH) * 360 * DEG;

    function computeMoon(out) {
      const th = theta();
      out.set(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(R_MO);
      const nodeDir = new THREE.Vector3(Math.cos(state.node * DEG), 0, -Math.sin(state.node * DEG));
      out.applyAxisAngle(nodeDir, state.tilt * DEG);
      return out;
    }

    function placeCones(g, occPos) {
      const axis = tmp.copy(occPos).sub(SUN);
      const D = axis.length();
      axis.normalize();
      g.position.copy(occPos);
      g.quaternion.setFromUnitVectors(Y, axis);
      const r = g.userData.rOcc;
      const L = (D * r) / (R_S - r);
      g.userData.umbra.scale.set(r, L, r);
      return L;
    }

    // 지금 일어나는 현상 판정
    function status() {
      const m = moonPos;
      const sunToMoon = m.clone().sub(SUN);
      const Dm = sunToMoon.length();
      const u = sunToMoon.clone().normalize();
      const toEarth = new THREE.Vector3().sub(m);
      const x = toEarth.dot(u);
      if (x > 0) {
        // 일식 가능성: 달 그림자 축과 지구 중심 사이 거리
        const dAxis = toEarth.clone().addScaledVector(u, -x).length();
        const xs = Math.max(0, x - Math.sqrt(Math.max(0, R_E * R_E - dAxis * dAxis)));
        const rp = R_MOON + (xs * (R_S + R_MOON)) / Dm;
        const L = (Dm * R_MOON) / (R_S - R_MOON);
        const ru = R_MOON - (xs * (R_S - R_MOON)) / Dm;
        if (dAxis > R_E + rp) return '일식·월식 없음';
        if (dAxis < R_E && xs < L && ru > 0) return '개기 일식 (본그림자 지역)';
        if (dAxis < R_E && xs >= L) return '금환 일식';
        return '부분 일식';
      }
      // 월식 가능성: 지구 그림자 축과 달 중심 사이 거리
      const ue = new THREE.Vector3().sub(SUN).normalize();
      const xe = m.dot(ue);
      if (xe <= 0) return '일식·월식 없음';
      const d = m.clone().addScaledVector(ue, -xe).length();
      const De = SUN.length();
      const ru = R_E - (xe * (R_S - R_E)) / De;
      const rp = R_E + (xe * (R_S + R_E)) / De;
      if (d + R_MOON < ru) return '개기 월식 (붉은 달)';
      if (d - R_MOON < ru) return '부분 월식';
      if (d - R_MOON < rp) return '반그림자 월식 (아주 조금 어두워짐)';
      return '일식·월식 없음';
    }

    const order = () => {
      const deg = ((theta() / DEG) % 360 + 360) % 360;
      if (deg < 12 || deg > 348) return '태양 - 달 - 지구 (삭)';
      if (Math.abs(deg - 180) < 12) return '태양 - 지구 - 달 (망)';
      return deg < 180 ? '달이 차는 중' : '달이 기우는 중';
    };

    const s = new THREE.Vector3();
    return {
      update(dt) {
        if (state.playing) state.age = (state.age + dt * state.speed) % MONTH;
        computeMoon(moonPos);
        moon.position.copy(moonPos);
        moon.lookAt(root.localToWorld(new THREE.Vector3()));
        moonLabel.position.copy(moonPos);
        earth.rotation.y += dt * 0.4;

        orbitPivot.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(state.node * DEG), 0, -Math.sin(state.node * DEG)), state.tilt * DEG);
        nodeGroup.rotation.y = state.node * DEG;
        nodeGroup.visible = state.tilt > 0.5;

        placeCones(moonShadow, moonPos);
        const Le = placeCones(earthShadow, new THREE.Vector3());
        moonShadow.visible = earthShadow.visible = umbraLabel.visible = penLabel.visible = state.cones;
        const ue = new THREE.Vector3().sub(SUN).normalize();
        umbraLabel.position.copy(ue).multiplyScalar(Math.min(Le * 0.6, 2.2));
        penLabel.position.copy(ue).multiplyScalar(2.3).add(new THREE.Vector3(0, 0, 0.7));

        // 셰이더에 세계 좌표 전달 (VR에서 모형 크기가 바뀌어도 맞도록)
        const k = root.getWorldScale(s).x;
        const sunW = root.localToWorld(SUN.clone());
        const earthW = root.localToWorld(new THREE.Vector3());
        const moonW = root.localToWorld(moonPos.clone());
        const eu = earthMat.userData.ecl;
        eu.uSunPos.value.copy(sunW);
        eu.uSunR.value = R_S * k;
        eu.uOccPos.value.copy(moonW);
        eu.uOccR.value = R_MOON * k;
        const mu = moonMat.userData.ecl;
        mu.uSunPos.value.copy(sunW);
        mu.uSunR.value = R_S * k;
        mu.uOccPos.value.copy(earthW);
        mu.uOccR.value = R_E * k;

        // 작은 화면: 달이 태양 쪽이면 지구에서 태양을, 아니면 밤 쪽에서 달을 본다
        const sunDir = SUN.clone().normalize();
        if (moonPos.dot(sunDir) > 0) {
          pipCam.position.copy(sunDir).multiplyScalar(R_E * 1.01);
          pipCam.lookAt(ctx.toWorld(SUN));
          pip.setLabel('지구(낮인 곳)에서 본 태양');
        } else {
          pipCam.position.copy(sunDir).multiplyScalar(-R_E * 1.01);
          pipCam.lookAt(ctx.toWorld(moonPos));
          pip.setLabel('지구(밤인 곳)에서 본 달');
        }
      },
      beforePiP() {
        moonShadow.visible = earthShadow.visible = false;
        for (const o of [sunLabel, earthLabel, moonLabel, umbraLabel, penLabel, orbitPivot, eclipticRing, nodeGroup]) o.visible = false;
      },
      afterPiP() {
        for (const o of [sunLabel, earthLabel, moonLabel, orbitPivot, eclipticRing]) o.visible = true;
      },
      controls: [
        { type: 'toggle', label: '달 공전 재생', get: () => state.playing, set: (v) => (state.playing = v) },
        {
          type: 'slider', label: '음력 날짜', min: 0, max: 29.5, step: 0.05,
          get: () => state.age, set: (v) => (state.age = v), format: (v) => `${fmt(v + 1, 1)}일`,
        },
        {
          type: 'buttons',
          items: [
            { label: '삭 → 일식', onClick: () => { state.age = 0; state.playing = false; } },
            { label: '망 → 월식', onClick: () => { state.age = MONTH / 2; state.playing = false; } },
          ],
        },
        { type: 'readout', label: '위치 관계', get: order },
        { type: 'readout', label: '지금 일어나는 현상', get: status },
        { type: 'heading', label: '달 궤도의 기울기' },
        {
          type: 'slider', label: '기울기 (모형)', min: 0, max: 60, step: 1,
          get: () => state.tilt, set: (v) => (state.tilt = v), format: (v) => `${fmt(v, 0)}°`,
        },
        {
          type: 'slider', label: '교점 방향 (주황 선)', min: 0, max: 180, step: 1,
          get: () => state.node, set: (v) => (state.node = v), format: (v) => `${fmt(v, 0)}°`,
        },
        { type: 'note', text: '기울기를 크게 하고 교점 방향을 90°로 하면 삭·망이 되어도 일식·월식이 일어나지 않아요. 교점 방향이 태양 쪽(0°)이면 다시 일어나요.' },
        { type: 'toggle', label: '본그림자·반그림자 보이기', get: () => state.cones, set: (v) => (state.cones = v) },
      ],
    };
  },
};
