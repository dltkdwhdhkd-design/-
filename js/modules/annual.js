// 태양의 연주 운동: 지구가 공전하면 태양이 황도 12개 별자리 사이를 지나가는 것처럼 보이고,
// 계절마다 한밤중에 보이는 별자리가 달라진다.
import * as THREE from 'three';
import {
  makeLabel, makeStar, makeRod, makeDashedRod, makeRing, getEarthTexture, makePolyline, mulberry32, fmt,
} from '../core/helpers.js';

const R_ORBIT = 3;
const R_ZOD = 9;
// 태양이 그달 중순에 지나는 별자리 (교과서 기준)
const ZODIAC = ['궁수자리', '염소자리', '물병자리', '물고기자리', '양자리', '황소자리', '쌍둥이자리', '게자리', '사자자리', '처녀자리', '천칭자리', '전갈자리'];

// 날짜(0~12, 1월 1일 = 0) → 지구에서 본 태양의 방향 각 (춘분 = 0)
const sunAngle = (m) => ((m - 2.67) / 12) * Math.PI * 2;
const dir = (a, out = new THREE.Vector3()) => out.set(Math.cos(a), 0, -Math.sin(a));

export default {
  view: {
    layout: 'diorama',
    radius: 10.5,
    center: [0, 0, 0],
    camera: { pos: [0, 17.5, 11.5], target: [0, 0, 1.2] },
    vrRadius: 1.2,
    arRadius: 0.42,
  },

  info: `
## 태양의 연주 운동
지구가 1년에 한 바퀴 태양 주위를 **공전**하기 때문에, 지구에서 보면 태양이 별자리 사이를 조금씩 이동해 1년 뒤 제자리로 돌아오는 것처럼 보여요.
- 방향: 별자리 사이를 **서 → 동**으로 이동
- 빠르기: 하루에 약 **1°** (360° ÷ 365일)
- 태양이 지나가는 하늘의 길 = **황도**, 황도 위의 12개 별자리 = **황도 12궁**
## 계절별 별자리
- 태양이 있는 쪽의 별자리는 낮에 떠 있어서 보이지 않아요.
- 한밤중에는 태양 **반대쪽**에 있는 별자리가 남쪽 하늘 높이 보여요.
- 그래서 계절마다 밤하늘에 보이는 별자리가 달라져요.
## 예시
- 1월: 태양은 궁수자리 쪽 → 한밤중에는 쌍둥이자리가 보임 (겨울철 별자리)
- 7월: 태양은 쌍둥이자리 쪽 → 한밤중에는 궁수자리가 보임 (여름철 별자리)
## 해 보기
날짜를 바꿔 가며 노란 선(태양 방향)과 파란 선(한밤중 방향)이 가리키는 별자리를 확인해 보세요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = { month: 0.5, playing: true, speed: 1, midnight: true, trail: true };

    root.add(new THREE.AmbientLight(0xffffff, 0.25));
    root.add(new THREE.PointLight(0xfff2cc, 3.2, 0, 0));

    const sun = makeStar(0xffd54f, 0.55, 4.5);
    root.add(sun);
    const sunLabel = makeLabel('태양', { size: 0.4, anchor: [0.5, -1.2] });
    root.add(sunLabel);

    root.add(makeRing(R_ORBIT, 0.025, 0x6fa8ff, 0.8));
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 32, 16),
      new THREE.MeshStandardMaterial({ map: getEarthTexture(), roughness: 0.85 })
    );
    root.add(earth);
    const earthLabel = makeLabel('지구', { size: 0.32, anchor: [0.5, -0.9], color: '#bfe1ff' });
    root.add(earthLabel);
    // 공전 방향 화살표
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 12), new THREE.MeshBasicMaterial({ color: 0x6fa8ff }));
      cone.position.copy(dir(a)).multiplyScalar(R_ORBIT);
      // 시계 반대 방향 접선
      const tangent = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      root.add(cone);
    }
    // 달 이름 (지구 위치)
    for (let m = 0; m < 12; m++) {
      const a = sunAngle(m + 0.5) + Math.PI;
      const l = makeLabel(`${m + 1}월`, { size: 0.26, color: '#9fb0d6', bg: null });
      l.position.copy(dir(a)).multiplyScalar(R_ORBIT - 0.55);
      root.add(l);
    }

    // 황도 12궁
    root.add(makeRing(R_ZOD, 0.02, 0x5c6b99, 0.5, 240));
    const rand = mulberry32(12);
    const zod = ZODIAC.map((name, k) => {
      const a = sunAngle(k + 0.5);
      const g = new THREE.Group();
      g.position.copy(dir(a)).multiplyScalar(R_ZOD);
      g.lookAt(0, 0, 0);
      // 별자리 모양 흉내 (별 몇 개를 선으로 잇기)
      const pts = [];
      const n = 5 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) pts.push(new THREE.Vector3((rand() - 0.5) * 1.8, (rand() - 0.2) * 1.4 + 0.2, 0));
      pts.sort((p, q) => p.x - q.x);
      const line = makePolyline(n, 0x7fa7e6, 0.8);
      line.setPoints(pts);
      g.add(line);
      for (const p of pts) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe3f2fd }));
        s.position.copy(p);
        g.add(s);
      }
      const label = makeLabel(name, { size: 0.42, color: '#c5cae9', anchor: [0.5, 1.6] });
      g.add(label);
      root.add(g);
      return { group: g, label, name };
    });

    // 지구 → 태양 → 별자리 (노란 선), 지구 → 한밤중 방향 (파란 선)
    const sunLine = makeRod(0xffd54f, 0.035);
    const sunLineFar = makeDashedRod(0xffd54f, 0.025, 0.25);
    const nightLine = makeRod(0x64b5f6, 0.035);
    const nightLabel = makeLabel('한밤중 남쪽 하늘', { size: 0.3, color: '#90caf9', anchor: [0.5, -0.4] });
    root.add(sunLine, sunLineFar, nightLine, nightLabel);
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd54f })
    );
    const markerN = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x64b5f6 })
    );
    root.add(marker, markerN);
    // 태양이 지나온 길
    const trail = makePolyline(800, 0xffd54f, 0.7);
    root.add(trail);

    // 한밤중에 보이는 하늘
    const pipCam = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 100);
    root.add(pipCam);
    const pip = ctx.createPiP({ camera: pipCam, label: '지구에서 본 한밤중 남쪽 하늘' });

    const e = new THREE.Vector3();
    const toSun = new THREE.Vector3();
    const idxOf = (a) => {
      // 각 a 방향의 별자리 번호
      let best = 0;
      let bd = Infinity;
      zod.forEach((z, k) => {
        let d = Math.abs(((a - sunAngle(k + 0.5)) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      return best;
    };
    const ray = (from, d) => {
      // from에서 d 방향으로 황도 고리까지
      const b = from.dot(d);
      const c = from.lengthSq() - R_ZOD * R_ZOD;
      const t = -b + Math.sqrt(b * b - c);
      return from.clone().addScaledVector(d, t);
    };

    return {
      update(dt) {
        if (state.playing) state.month = (state.month + dt * 0.6 * state.speed) % 12;
        const a = sunAngle(state.month);
        // 지구는 태양 반대편
        dir(a + Math.PI, e).multiplyScalar(R_ORBIT);
        earth.position.copy(e);
        earth.rotation.y += dt * 2;
        earthLabel.position.copy(e);
        toSun.copy(e).negate().normalize();
        const hitSun = ray(e, toSun);
        sunLine.setEnds(e, new THREE.Vector3());
        sunLineFar.setEnds(new THREE.Vector3(), hitSun);
        const away = toSun.clone().negate();
        const hitNight = ray(e, away);
        nightLine.setEnds(e, hitNight);
        nightLine.visible = nightLabel.visible = markerN.visible = state.midnight;
        nightLabel.position.copy(e).lerp(hitNight, 0.5);

        const ks = idxOf(Math.atan2(-toSun.z, toSun.x));
        const kn = (ks + 6) % 12;
        zod.forEach((z, k) => z.label.setColor(k === ks ? '#ffe082' : k === kn && state.midnight ? '#90caf9' : '#c5cae9'));
        marker.position.copy(zod[ks].group.position);
        marker.quaternion.copy(zod[ks].group.quaternion);
        markerN.position.copy(zod[kn].group.position);
        markerN.quaternion.copy(zod[kn].group.quaternion);

        // 태양이 별자리 사이에서 지나온 길 (최근 1년)
        trail.visible = state.trail;
        if (state.trail) {
          const pts = [];
          for (let i = 0; i <= 120; i++) {
            const mm = state.month - (i / 120) * 3;
            const sa = sunAngle(mm);
            const ee = dir(sa + Math.PI).multiplyScalar(R_ORBIT);
            pts.push(ray(ee, ee.clone().negate().normalize()).multiplyScalar(0.985).setY(0.02));
          }
          trail.setPoints(pts);
        }

        pip.visible = state.midnight;
        pipCam.position.copy(e).addScaledVector(away, 0.35);
        pipCam.lookAt(ctx.toWorld(new THREE.Vector3(hitNight.x, 0.3, hitNight.z)));
      },
      beforePiP() {
        earth.visible = earthLabel.visible = nightLine.visible = nightLabel.visible = markerN.visible = false;
      },
      afterPiP() {
        earth.visible = earthLabel.visible = true;
      },
      controls: [
        { type: 'toggle', label: '공전 재생', get: () => state.playing, set: (v) => (state.playing = v) },
        {
          type: 'slider', label: '날짜', min: 0, max: 11.99, step: 0.01,
          get: () => state.month, set: (v) => (state.month = v),
          format: (v) => `${Math.floor(v) + 1}월 ${Math.min(30, Math.floor((v % 1) * 30) + 1)}일`,
        },
        {
          type: 'buttons',
          items: [
            { label: '봄(4월)', onClick: () => { state.month = 3.5; state.playing = false; } },
            { label: '여름(7월)', onClick: () => { state.month = 6.5; state.playing = false; } },
            { label: '가을(10월)', onClick: () => { state.month = 9.5; state.playing = false; } },
            { label: '겨울(1월)', onClick: () => { state.month = 0.5; state.playing = false; } },
          ],
        },
        { type: 'readout', label: '태양이 있는 별자리', get: () => ZODIAC[idxOfMonth(state.month)] },
        { type: 'readout', label: '한밤중 남쪽 하늘의 별자리', get: () => ZODIAC[(idxOfMonth(state.month) + 6) % 12] },
        { type: 'readout', label: '태양이 하루에 움직이는 각', get: () => `약 ${fmt(360 / 365, 2)}° (서 → 동)` },
        { type: 'toggle', label: '한밤중 방향 보이기', get: () => state.midnight, set: (v) => (state.midnight = v) },
        { type: 'toggle', label: '태양이 지나온 길 (최근 3개월)', get: () => state.trail, set: (v) => (state.trail = v) },
        { type: 'note', text: '노란 선: 지구에서 태양을 볼 때 그 뒤에 있는 별자리 (낮이라 보이지 않음). 파란 선: 한밤중에 보이는 별자리.' },
      ],
    };

    function idxOfMonth(m) {
      return ((Math.floor(m) % 12) + 12) % 12;
    }
  },
};
