// 우리은하: 막대 나선 은하의 모습과 태양계의 위치, 그리고 안에서 본 은하수
import * as THREE from 'three';
import { makeLabel, makeStar, makeDashedRod, makeRod, getDotTexture, mulberry32 } from '../core/helpers.js';

// 1 단위 = 1 kpc (약 3,260 광년)
const SUN = new THREE.Vector3(-8.5, 0, 0);

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
}

export default {
  view: {
    layout: 'diorama',
    radius: 17,
    center: [0, 0, 0],
    camera: { pos: [0, 20, 24], target: [0, 0, 0] },
    vrRadius: 1.2,
    arRadius: 0.4,
  },

  info: `
## 우리은하
태양계가 속한 은하를 **우리은하**라고 해요. 약 2천억~4천억 개의 별과 성간 물질로 이루어져 있어요.
- 위에서 보면: 중심부에 막대 모양 구조가 있고 그 끝에서 **나선팔**이 휘감겨 나온 **막대 나선 은하**
- 옆에서 보면: 가운데가 볼록한 **납작한 원반** 모양
- 지름: 약 **10만 광년** (약 30 kpc)
- 태양계 위치: 은하 중심에서 약 **3만 광년** (약 8.5 kpc) 떨어진 **나선팔**
## 은하수
우리는 원반 안쪽에 있어서 원반 방향으로 별이 아주 많이 겹쳐 보여요. 이것이 밤하늘을 가로지르는 띠 모양의 **은하수**예요. 은하 중심 방향(궁수자리)이 가장 두껍고 밝아요. 우리나라에서는 여름철에 잘 보여요.
## 성단
- **산개 성단**: 젊고 파란 별들이 엉성하게 모여 있음, 주로 나선팔(원반)에 있음
- **구상 성단**: 늙고 붉은 별 수만~수십만 개가 공 모양으로 빽빽하게 모여 있음, 은하 중심부와 원반 바깥(헤일로)에 있음
## 해 보기
'태양계에서 본 은하수' 화면을 켜고 원반 안에서 은하 중심을 바라보면 어떻게 보이는지 확인해 보세요.
`,

  create(ctx) {
    const { root, app } = ctx;
    const state = { view: 'tilt', pip: true, clusters: true, measure: true, spin: false };
    const rand = mulberry32(2024);
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    const add = (x, y, z, color) => {
      if ((x - SUN.x) ** 2 + (y - SUN.y) ** 2 + (z - SUN.z) ** 2 < 0.6) return; // 태양 바로 주변은 비워 둔다
      pos.push(x, y, z);
      col.push(color.r, color.g, color.b);
    };
    const BAR_ANGLE = 0.45;
    // 팽대부(중심부)
    for (let i = 0; i < 5000; i++) {
      const x = gauss(rand) * 1.3;
      const y = gauss(rand) * 0.8;
      const z = gauss(rand) * 1.3;
      c.setHSL(0.09 + rand() * 0.03, 0.8, 0.55 + rand() * 0.2);
      add(x, y, z, c);
    }
    // 막대
    for (let i = 0; i < 2600; i++) {
      const t = (rand() - 0.5) * 9;
      const w = gauss(rand) * 0.6;
      const x = t * Math.cos(BAR_ANGLE) - w * Math.sin(BAR_ANGLE);
      const z = t * Math.sin(BAR_ANGLE) + w * Math.cos(BAR_ANGLE);
      c.setHSL(0.1, 0.7, 0.5 + rand() * 0.2);
      add(x, gauss(rand) * 0.25, z, c);
    }
    // 나선팔 4개 (로그 나선)
    const pitch = (13 * Math.PI) / 180;
    const nebulae = [];
    for (let i = 0; i < 18000; i++) {
      const arm = i % 4;
      const major = arm % 2 === 0;
      if (!major && rand() < 0.35) continue;
      const r = 4.2 + Math.pow(rand(), 0.85) * 11;
      const theta0 = BAR_ANGLE + (arm * Math.PI) / 2;
      const theta = theta0 + Math.log(r / 4.2) / Math.tan(pitch) + gauss(rand) * (major ? 0.13 : 0.16);
      const rr = r + gauss(rand) * 0.35;
      const x = rr * Math.cos(theta);
      const z = rr * Math.sin(theta);
      const y = gauss(rand) * 0.12;
      const k = rand();
      if (k < 0.04) {
        c.setRGB(1, 0.45, 0.65); // 방출 성운 (분홍)
        if (k < 0.002) nebulae.push(new THREE.Vector3(x, y, z));
      } else if (k < 0.55) c.setHSL(0.6, 0.6, 0.65 + rand() * 0.25);
      else c.setHSL(0.12, 0.3, 0.55 + rand() * 0.3);
      add(x, y, z, c);
    }
    // 원반에 고르게 퍼진 별
    for (let i = 0; i < 9000; i++) {
      const r = -Math.log(1 - rand() * 0.97) * 4.0;
      if (r > 16) continue;
      const th = rand() * Math.PI * 2;
      c.setHSL(0.1, 0.25, 0.25 + rand() * 0.25);
      add(r * Math.cos(th), gauss(rand) * 0.18 * (1 + r / 15), r * Math.sin(th), c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.13,
      sizeAttenuation: true,
      vertexColors: true,
      map: getDotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const galaxy = new THREE.Group();
    const disk = new THREE.Points(geo, mat);
    disk.frustumCulled = false;
    galaxy.add(disk);

    // 성단
    const clusters = new THREE.Group();
    const gpos = [];
    const gcol = [];
    for (let i = 0; i < 160; i++) {
      // 구상 성단: 중심부와 헤일로에 공 모양으로 퍼져 있다
      const r = Math.pow(rand(), 1.6) * 18 + 0.8;
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      gpos.push(r * s * Math.cos(th), r * u, r * s * Math.sin(th));
      gcol.push(1, 0.75, 0.45);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    const globMat = new THREE.PointsMaterial({ size: 0.45, vertexColors: true, map: getDotTexture(), transparent: true, depthWrite: false });
    const globular = new THREE.Points(gGeo, globMat);
    clusters.add(globular);
    const globLabel = makeLabel('구상 성단 (헤일로·중심부)', { size: 0.6, color: '#ffcc80' });
    globLabel.position.set(6, 11, -4);
    clusters.add(globLabel);
    const openLabel = makeLabel('산개 성단·성운 (나선팔)', { size: 0.6, color: '#f8bbd0' });
    openLabel.position.set(nebulae[0]?.x ?? 8, 1.6, nebulae[0]?.z ?? 8);
    clusters.add(openLabel);
    galaxy.add(clusters);

    // 태양계
    const sun = makeStar(0xffeb3b, 0.22, 6);
    sun.position.copy(SUN);
    galaxy.add(sun);
    const sunLabel = makeLabel('태양계 (여기!)', { size: 0.75, color: '#fff59d', anchor: [0.5, -0.4] });
    sunLabel.position.copy(SUN);
    galaxy.add(sunLabel);
    const centerLabel = makeLabel('은하 중심 (궁수자리 방향)', { size: 0.65, anchor: [0.5, -1.2] });
    galaxy.add(centerLabel);

    // 거리 표시
    const measure = new THREE.Group();
    const sunLine = makeDashedRod(0xfff59d, 0.07, 0.4);
    sunLine.setEnds(SUN.clone().setY(0.05), new THREE.Vector3(0, 0.05, 0));
    const sunDist = makeLabel('약 3만 광년 (8.5 kpc)', { size: 0.6, color: '#fff59d', anchor: [0.5, 1.3] });
    sunDist.position.set(SUN.x / 2, 0, 0);
    const diam = makeRod(0x80deea, 0.06, { opacity: 0.8 });
    diam.setEnds(new THREE.Vector3(-15, 0, 15.5), new THREE.Vector3(15, 0, 15.5));
    const diamLabel = makeLabel('지름 약 10만 광년 (30 kpc)', { size: 0.65, color: '#80deea', anchor: [0.5, -0.3] });
    diamLabel.position.set(0, 0, 15.5);
    measure.add(sunLine, sunDist, diam, diamLabel);
    galaxy.add(measure);
    root.add(galaxy);

    // 태양계에서 은하 중심을 바라본 모습
    const pipCam = new THREE.PerspectiveCamera(70, 2, 0.05, 200);
    pipCam.position.copy(SUN);
    pipCam.lookAt(0, 0, 0);
    galaxy.add(pipCam);
    const pip = ctx.createPiP({ camera: pipCam, label: '태양계에서 은하 중심 쪽을 본 하늘 = 은하수', aspect: 2 });

    const views = {
      top: { cam: [0, 32, 0.01], tilt: Math.PI / 2 },
      side: { cam: [0, 1.5, 32], tilt: 0.0 },
      tilt: { cam: [0, 20, 24], tilt: Math.PI / 4 },
    };
    function applyView() {
      const v = views[state.view];
      if (ctx.xrMode) {
        // VR/AR: 은하를 기울여서 보여 준다
        galaxy.rotation.x = v.tilt;
      } else {
        galaxy.rotation.x = 0;
        app.camera.position.fromArray(v.cam);
        app.controls.target.set(0, 0, 0);
        app.controls.update();
      }
    }

    const hidden = [];
    return {
      update(dt) {
        pip.visible = state.pip;
        clusters.visible = state.clusters;
        measure.visible = state.measure;
        if (state.spin) galaxy.rotation.y += dt * 0.08;
      },
      onXRChange() {
        applyView();
      },
      beforePiP() {
        mat.size *= 0.27;
        globMat.size *= 0.27;
        hidden.length = 0;
        for (const o of [sunLabel, centerLabel, measure, globLabel, openLabel, sun]) {
          if (o.visible) {
            hidden.push(o);
            o.visible = false;
          }
        }
      },
      afterPiP() {
        mat.size /= 0.27;
        globMat.size /= 0.27;
        for (const o of hidden) o.visible = true;
      },
      controls: [
        {
          type: 'choice',
          label: '보는 방향',
          options: [
            { value: 'top', label: '위에서' },
            { value: 'tilt', label: '비스듬히' },
            { value: 'side', label: '옆에서' },
          ],
          get: () => state.view,
          set: (v) => {
            state.view = v;
            applyView();
          },
        },
        { type: 'toggle', label: '태양계에서 본 은하수 화면', get: () => state.pip, set: (v) => (state.pip = v) },
        { type: 'toggle', label: '성단 보이기', get: () => state.clusters, set: (v) => (state.clusters = v) },
        { type: 'toggle', label: '거리 표시', get: () => state.measure, set: (v) => (state.measure = v) },
        { type: 'toggle', label: '천천히 돌리기', get: () => state.spin, set: (v) => (state.spin = v) },
        { type: 'note', text: '별 하나하나는 실제 위치가 아니라 우리은하의 생김새를 흉내 낸 그림이에요.' },
      ],
    };
  },
};
