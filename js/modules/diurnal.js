// 별의 일주 운동: 지구가 자전하면 하늘의 별이 북극성을 중심으로 하루에 한 바퀴 도는 것처럼 보인다.
// 실제 별의 적경·적위로 밤하늘을 만들고, 관측자의 위도와 시각에 따라 돌린다.
import * as THREE from 'three';
import {
  makeLabel, makeGlow, makeAngleWedge, makeRing, makeRod, getDotTexture, kelvinToColor, mulberry32, fmt, DEG,
} from '../core/helpers.js';

const SKY_R = 40; // 천구 반지름 (m)
const EYE = 1.6;

// [이름, 적경(시), 적위(°), 등급, 표면 온도(K)]
const S = {
  polaris: ['북극성', 2.53, 89.264, 1.98, 6000],
  yildun: [null, 17.537, 86.586, 4.35],
  epsUMi: [null, 16.766, 82.037, 4.21],
  zetUMi: [null, 15.734, 77.795, 4.29],
  kochab: [null, 14.845, 74.156, 2.08, 4100],
  pherkad: [null, 15.345, 71.834, 3.05],
  etaUMi: [null, 16.292, 75.755, 4.95],
  dubhe: [null, 11.062, 61.751, 1.79, 4700],
  merak: [null, 11.031, 56.382, 2.37],
  phecda: [null, 11.897, 53.695, 2.44],
  megrez: [null, 12.257, 57.033, 3.31],
  alioth: [null, 12.9, 55.96, 1.77],
  mizar: [null, 13.399, 54.925, 2.27],
  alkaid: [null, 13.792, 49.313, 1.86],
  caph: [null, 0.153, 59.15, 2.28],
  schedar: [null, 0.675, 56.537, 2.24, 4500],
  gamCas: [null, 0.945, 60.717, 2.15],
  ruchbah: [null, 1.43, 60.235, 2.66],
  segin: [null, 1.907, 63.67, 3.37],
  betelgeuse: ['베텔게우스', 5.919, 7.407, 0.5, 3600],
  rigel: ['리겔', 5.242, -8.202, 0.13, 12000],
  bellatrix: [null, 5.419, 6.35, 1.64, 20000],
  mintaka: [null, 5.533, -0.299, 2.23, 25000],
  alnilam: [null, 5.604, -1.202, 1.69, 25000],
  alnitak: [null, 5.679, -1.943, 1.77, 25000],
  saiph: [null, 5.796, -9.67, 2.07, 25000],
  meissa: [null, 5.585, 9.934, 3.39, 25000],
  vega: ['직녀성', 18.616, 38.784, 0.03, 9600],
  altair: ['견우성', 19.846, 8.868, 0.77, 7700],
  deneb: ['데네브', 20.69, 45.28, 1.25, 8500],
  sadr: [null, 20.37, 40.257, 2.23],
  gienah: [null, 20.77, 33.97, 2.48, 4700],
  delCyg: [null, 19.75, 45.131, 2.87],
  albireo: [null, 19.512, 27.96, 3.05, 4300],
  regulus: ['레굴루스', 10.139, 11.967, 1.35, 12000],
  denebola: [null, 11.818, 14.572, 2.14],
  algieba: [null, 10.333, 19.842, 2.01, 4500],
  zosma: [null, 11.235, 20.524, 2.56],
  chertan: [null, 11.237, 15.43, 3.33],
  etaLeo: [null, 10.122, 16.763, 3.48],
  adhafera: [null, 10.278, 23.417, 3.43],
  epsLeo: [null, 9.764, 23.774, 2.98, 5300],
  antares: ['안타레스', 16.49, -26.432, 1.06, 3500],
  acrab: [null, 16.091, -19.806, 2.62, 25000],
  dschubba: [null, 16.006, -22.622, 2.29, 25000],
  piSco: [null, 15.981, -26.114, 2.89, 25000],
  sigSco: [null, 16.353, -25.593, 2.88, 25000],
  tauSco: [null, 16.598, -28.216, 2.82, 25000],
  epsSco: [null, 16.836, -34.293, 2.29, 4500],
  muSco: [null, 16.864, -38.047, 3.04, 25000],
  zetSco: [null, 16.91, -42.362, 3.6],
  etaSco: [null, 17.203, -43.239, 3.33],
  sargas: [null, 17.622, -42.998, 1.86],
  iotSco: [null, 17.793, -40.127, 2.99],
  kapSco: [null, 17.708, -39.03, 2.39, 25000],
  shaula: [null, 17.56, -37.104, 1.62, 25000],
  acrux: [null, 12.443, -63.099, 0.77, 25000],
  mimosa: [null, 12.795, -59.689, 1.25, 25000],
  gacrux: [null, 12.519, -57.113, 1.64, 3600],
  delCru: [null, 12.252, -58.749, 2.79, 25000],
  sirius: ['시리우스', 6.752, -16.716, -1.46, 9900],
  procyon: ['프로키온', 7.655, 5.225, 0.34, 6500],
  aldebaran: ['알데바란', 4.599, 16.509, 0.85, 3900],
  capella: ['카펠라', 5.278, 45.998, 0.08, 5000],
  arcturus: ['아크투르스', 14.261, 19.182, -0.05, 4300],
  spica: ['스피카', 13.42, -11.161, 0.97, 22000],
  pollux: ['폴룩스', 7.755, 28.026, 1.14, 4600],
  castor: ['카스토르', 7.577, 31.888, 1.58],
  fomalhaut: ['포말하우트', 22.961, -29.622, 1.16],
  alcyone: ['플레이아데스', 3.791, 24.105, 2.87, 12000],
  canopus: ['카노푸스', 6.399, -52.696, -0.74],
  rigilKent: ['알파 센타우리', 14.66, -60.834, -0.27, 5800],
  achernar: [null, 1.629, -57.237, 0.46, 15000],
  markab: [null, 23.079, 15.205, 2.48],
  scheat: [null, 23.063, 28.083, 2.42, 3700],
  algenib: [null, 0.221, 15.184, 2.83, 20000],
  alpheratz: [null, 0.14, 29.091, 2.06],
};

const FIGURES = [
  { name: '작은곰자리', lines: 'polaris-yildun yildun-epsUMi epsUMi-zetUMi zetUMi-kochab kochab-pherkad pherkad-etaUMi etaUMi-zetUMi' },
  { name: '북두칠성', lines: 'dubhe-merak merak-phecda phecda-megrez megrez-dubhe megrez-alioth alioth-mizar mizar-alkaid' },
  { name: '카시오페이아자리', lines: 'caph-schedar schedar-gamCas gamCas-ruchbah ruchbah-segin' },
  {
    name: '오리온자리',
    lines: 'betelgeuse-bellatrix bellatrix-mintaka betelgeuse-alnitak mintaka-alnilam alnilam-alnitak mintaka-rigel alnitak-saiph meissa-betelgeuse meissa-bellatrix',
  },
  { name: '백조자리', lines: 'deneb-sadr sadr-albireo delCyg-sadr sadr-gienah' },
  { name: '사자자리', lines: 'regulus-etaLeo etaLeo-algieba algieba-adhafera adhafera-epsLeo algieba-zosma zosma-denebola denebola-chertan chertan-regulus zosma-chertan' },
  {
    name: '전갈자리',
    lines: 'acrab-dschubba dschubba-piSco dschubba-sigSco sigSco-antares antares-tauSco tauSco-epsSco epsSco-muSco muSco-zetSco zetSco-etaSco etaSco-sargas sargas-iotSco iotSco-kapSco kapSco-shaula',
  },
  { name: '남십자자리', lines: 'acrux-gacrux mimosa-delCru' },
  { name: '페가수스자리', lines: 'markab-scheat scheat-alpheratz alpheratz-algenib algenib-markab' },
  { name: '여름철 대삼각형', lines: 'vega-altair altair-deneb deneb-vega', asterism: true },
  { name: '겨울철 대삼각형', lines: 'betelgeuse-sirius sirius-procyon procyon-betelgeuse', asterism: true },
];

// 적경·적위 → 천구 안쪽 좌표 (회전하는 그룹 기준)
function eqLocal(raH, decDeg, r = SKY_R, out = new THREE.Vector3()) {
  const a = -raH * 15 * DEG;
  const d = decDeg * DEG;
  return out.set(Math.cos(d) * Math.cos(a), Math.sin(d), Math.cos(d) * Math.sin(a)).multiplyScalar(r);
}

function timeText(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ap = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ap} ${h12}:${String(mm).padStart(2, '0')}`;
}

function dateText(m) {
  const month = Math.floor(m);
  const day = Math.min(30, Math.floor((m - month) * 30) + 1);
  return `${month}월 ${day}일`;
}

export default {
  view: {
    layout: 'surround',
    radius: SKY_R * 1.1,
    center: [0, 0, 0],
    camera: { pos: [0, EYE - 0.004, 0.009], target: [0, EYE, 0], fov: 70, near: 0.005 },
    vrRadius: 1.0,
    arRadius: 0.4,
    xrScale: 1,
    grab: false,
    stars: false,
    arStars: false,
  },

  info: `
## 별의 일주 운동
밤하늘의 별들은 하루에 한 바퀴씩 북극성 부근을 중심으로 **동쪽에서 서쪽으로** 도는 것처럼 보여요. 이것을 **일주 운동**이라고 해요.
- 원인: 지구가 하루에 한 바퀴 **서쪽에서 동쪽으로 자전**하기 때문 (겉보기 운동)
- 빠르기: 360° ÷ 24시간 = **1시간에 15°**
## 방향에 따라 다른 모습 (북반구)
- 북쪽 하늘: 북극성을 중심으로 **시계 반대 방향**으로 원을 그리며 돈다
- 동쪽 하늘: 오른쪽 위로 비스듬히 떠오른다
- 남쪽 하늘: 동쪽에서 서쪽으로 지평선과 나란하게 움직인다
- 서쪽 하늘: 오른쪽 아래로 비스듬히 진다
## 북극성
북극성은 지구 자전축의 연장선 가까이에 있어서 거의 움직이지 않아요. 북극성의 고도는 그 지역의 **위도**와 같아요. (서울 약 37.5°)
## 해 보기
- '별의 궤적'을 켜고 북쪽·동쪽·남쪽·서쪽 하늘을 각각 바라보세요.
- 위도를 북극(90°)과 적도(0°)로 바꾸면 별이 도는 모습이 어떻게 달라질까요?
- VR에서는 몸을 돌려 하늘 전체를 둘러볼 수 있어요.
`,

  create(ctx) {
    const { root, app } = ctx;
    const state = {
      lat: 37.5,
      month: 1.5,
      time: 21,
      playing: true,
      speed: 1, // 시간/초
      trails: true,
      trailH: 3,
      figures: true,
      names: true,
      axis: false,
      glassGround: false,
      outside: false,
    };

    root.add(new THREE.AmbientLight(0xffffff, 0.6));

    // 하늘(낮/밤 색)
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x02040c, side: THREE.BackSide, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 1.08, 48, 24), skyMat);
    sky.renderOrder = -20;
    root.add(sky);
    // 밖에서 볼 때의 천구 껍질
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_R, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0x3f6ad8, transparent: true, opacity: 0.07, depthWrite: false })
    );
    root.add(shell);

    // 땅
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1b2a22, roughness: 1, transparent: true, opacity: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(SKY_R * 1.01, 96).rotateX(-Math.PI / 2), groundMat);
    root.add(ground);
    const horizon = makeRing(SKY_R * 0.995, 0.08, 0x4a6d8c, 0.7, 192);
    horizon.position.y = 0.05;
    root.add(horizon);
    // 지평선 부근 나무들 (방향 감각을 위해)
    const rand = mulberry32(31);
    const treeGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x0f1a14, roughness: 1 }), 70);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = 24 + rand() * 12;
      const h = 1.5 + rand() * 3.5;
      m4.compose(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)), new THREE.Quaternion(), new THREE.Vector3(h * 0.35, h, h * 0.35));
      trees.setMatrixAt(i, m4);
    }
    root.add(trees);
    // 방위
    const dirs = [
      ['북', 0, 0, -1],
      ['동', 1, 0, 0],
      ['남', 0, 0, 1],
      ['서', -1, 0, 0],
    ];
    const compass = new THREE.Group();
    for (const [t, x, , z] of dirs) {
      const big = makeLabel(t, { size: 2.6, color: '#ffe082', bg: 'rgba(5,10,30,0.4)' });
      big.position.set(x * SKY_R * 0.9, 2.2, z * SKY_R * 0.9);
      const near = makeLabel(t, { size: 0.5, color: '#ffe082', bg: null });
      near.position.set(x * 4, 0.05, z * 4);
      compass.add(big, near);
    }
    root.add(compass);
    // 관측자 (밖에서 볼 때)
    const person = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: 0xffcc80 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 12), pm);
    body.position.y = 1.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), pm);
    head.position.y = 4.1;
    person.add(body, head);
    root.add(person);

    // 천구 (위도에 따라 기울이고, 시각에 따라 돈다)
    const celestial = new THREE.Group();
    const spin = new THREE.Group();
    celestial.add(spin);
    root.add(celestial);

    // 별
    const keys = Object.keys(S);
    const starPos = {};
    const bins = [[], [], []];
    const c = new THREE.Color();
    for (const k of keys) {
      const [, ra, dec, mag, T] = S[k];
      const p = eqLocal(ra, dec);
      starPos[k] = p;
      kelvinToColor(T || 7500, c);
      const bin = mag < 0.9 ? 0 : mag < 2.4 ? 1 : 2;
      bins[bin].push(p.x, p.y, p.z, c.r, c.g, c.b);
    }
    // 어두운 배경 별 (장식)
    const faint = [];
    for (let i = 0; i < 1100; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      kelvinToColor(3500 + rand() * 8000, c).multiplyScalar(0.35 + rand() * 0.45);
      faint.push(s * Math.cos(th) * SKY_R, u * SKY_R, s * Math.sin(th) * SKY_R, c.r, c.g, c.b);
    }
    const starMats = [];
    const makePts = (arr, size) => {
      const pos = [];
      const col = [];
      for (let i = 0; i < arr.length; i += 6) {
        pos.push(arr[i], arr[i + 1], arr[i + 2]);
        col.push(arr[i + 3], arr[i + 4], arr[i + 5]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size, sizeAttenuation: true, vertexColors: true, map: getDotTexture(), transparent: true, depthWrite: false,
      });
      starMats.push(m);
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      return pts;
    };
    spin.add(makePts(bins[0], 1.1), makePts(bins[1], 0.75), makePts(bins[2], 0.5), makePts(faint, 0.32));

    // 별자리 선과 이름
    const figGroup = new THREE.Group();
    const linePts = [];
    const astPts = [];
    for (const f of FIGURES) {
      const used = new Set();
      for (const pair of f.lines.split(' ')) {
        const [a, b] = pair.split('-');
        const pa = starPos[a].clone().multiplyScalar(0.995);
        const pb = starPos[b].clone().multiplyScalar(0.995);
        (f.asterism ? astPts : linePts).push(pa, pb);
        used.add(a);
        used.add(b);
      }
      const cen = new THREE.Vector3();
      for (const k of used) cen.add(starPos[k]);
      cen.normalize().multiplyScalar(SKY_R * 0.97);
      if (f.asterism) cen.multiplyScalar(0.98);
      const l = makeLabel(f.name, {
        size: f.asterism ? 0.85 : 1.0,
        color: f.asterism ? '#ffcc80' : '#90caf9',
        bg: null,
        depthTest: true, // 지평선 아래 이름은 땅에 가려지게
        anchor: [0.5, f.asterism ? 1.4 : -0.6],
      });
      l.position.copy(cen);
      figGroup.add(l);
    }
    figGroup.add(
      new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0x5d8fd8, transparent: true, opacity: 0.75 })),
      new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(astPts), new THREE.LineBasicMaterial({ color: 0xffb74d, transparent: true, opacity: 0.55 }))
    );
    spin.add(figGroup);
    const nameGroup = new THREE.Group();
    for (const k of keys) {
      const name = S[k][0];
      if (!name) continue;
      const l = makeLabel(name, {
        size: k === 'polaris' ? 1.0 : 0.75,
        color: k === 'polaris' ? '#fff59d' : '#e3f2fd',
        bg: null,
        anchor: [-0.08, 0.5],
        depthTest: true,
      });
      l.position.copy(starPos[k]).multiplyScalar(0.985);
      nameGroup.add(l);
    }
    spin.add(nameGroup);

    // 태양 (날짜에 따라 위치가 바뀜)
    const sun = new THREE.Group();
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe082 })));
    sun.add(makeGlow(0xffd54f, 9, 0.9));
    const sunLabel = makeLabel('태양', { size: 0.9, anchor: [0.5, -1.2], depthTest: true });
    sun.add(sunLabel);
    spin.add(sun);

    // 천구의 적도와 자전축
    const axisGroup = new THREE.Group();
    const eq = makeRing(SKY_R * 0.99, 0.06, 0x80cbc4, 0.7, 192);
    const axis = makeRod(0x80cbc4, 0.08, { opacity: 0.8 });
    axis.setEnds(new THREE.Vector3(0, -SKY_R, 0), new THREE.Vector3(0, SKY_R, 0));
    const eqLabel = makeLabel('천구의 적도', { size: 0.9, color: '#80cbc4', bg: null });
    eqLabel.position.set(0, 0.6, SKY_R * 0.98);
    const npLabel = makeLabel('천구의 북극 (자전축 방향)', { size: 0.9, color: '#80cbc4', bg: null, anchor: [0.5, -1.4] });
    npLabel.position.set(0, SKY_R * 0.99, 0);
    axisGroup.add(eq, axis, eqLabel, npLabel);
    celestial.add(axisGroup);

    // 궤적
    const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const trailLines = new THREE.LineSegments(new THREE.BufferGeometry(), trailMat);
    trailLines.frustumCulled = false;
    spin.add(trailLines);
    let builtTrailH = -1;
    function rebuildTrails() {
      const pts = [];
      const cols = [];
      const span = state.trailH * 15 * DEG;
      for (const k of keys) {
        const [, ra, dec, mag, T] = S[k];
        if (mag > 3.2 && k !== 'polaris') continue;
        kelvinToColor(T || 7500, c);
        const a0 = -ra * 15 * DEG;
        const d = dec * DEG;
        const n = Math.max(2, Math.ceil(state.trailH * 4));
        for (let i = 0; i < n; i++) {
          for (const j of [i, i + 1]) {
            const a = a0 - span + (span * j) / n;
            pts.push(Math.cos(d) * Math.cos(a) * SKY_R * 0.999, Math.sin(d) * SKY_R * 0.999, Math.cos(d) * Math.sin(a) * SKY_R * 0.999);
            const fade = 0.25 + (0.75 * j) / n; // 오래된 쪽은 흐리게
            cols.push(c.r * fade, c.g * fade, c.b * fade);
          }
        }
      }
      trailLines.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      trailLines.geometry = g;
      builtTrailH = state.trailH;
    }

    // 15° × 시간 각도 표시 (북두칠성의 두베)
    const wedge = makeAngleWedge({ color: 0xffd54f, fillOpacity: 0.18, stroke: 0.15 });
    const wedgeLabel = makeLabel('', { size: 0.9, color: '#ffe082', anchor: [0.5, 0.5], depthTest: true });
    spin.add(wedge, wedgeLabel);
    function updateWedge() {
      const [, ra, dec] = S.dubhe;
      const d = dec * DEG;
      const a0 = -ra * 15 * DEG;
      const span = state.trailH * 15 * DEG;
      const center = new THREE.Vector3(0, Math.sin(d) * SKY_R * 0.99, 0);
      const A = new THREE.Vector3(Math.cos(a0 - span), 0, Math.sin(a0 - span));
      const B = new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0));
      wedge.set(center, A, B, Math.cos(d) * SKY_R * 0.99);
      wedgeLabel.setText(`${fmt(state.trailH, 1)}시간 × 15° = ${fmt(state.trailH * 15, 0)}°`);
      const mid = A.clone().add(B).normalize();
      wedgeLabel.position.copy(center).addScaledVector(mid, Math.cos(d) * SKY_R * 0.55);
    }

    // 위도에 따른 천구 기울기: x축→남쪽 위 적도점, y축→천구의 북극, z축→서쪽
    let builtLat = null;
    function applyLatitude() {
      const phi = state.lat * DEG;
      const M = new THREE.Vector3(0, Math.cos(phi), Math.sin(phi));
      const P = new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi));
      const W = new THREE.Vector3(-1, 0, 0);
      celestial.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(M, P, W));
      builtLat = state.lat;
    }

    const dayOfYear = () => (Math.floor(state.month) - 1) * 30.44 + (state.month % 1) * 30.44;
    const sunRA = () => {
      // 태양의 황경 → 적경·적위 (춘분 3월 21일 = 0°)
      const lam = ((dayOfYear() - 79) / 365.25) * 2 * Math.PI;
      const eps = 23.44 * DEG;
      const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      return { raH: ((ra / (2 * Math.PI)) * 24 + 24) % 24, decDeg: dec / DEG };
    };
    const lst = () => state.time - 12 + (((dayOfYear() - 79) / 365.25) * 24);

    const tmp = new THREE.Vector3();
    const dayColor = new THREE.Color(0x4f86c6);
    const twilight = new THREE.Color(0x24315e);
    const night = new THREE.Color(0x02040c);
    let sunAlt = -90;

    function applyView() {
      // 데스크톱: 안(관측자 눈) / 밖(천구 모형)
      const ctrl = app.controls;
      if (state.outside) {
        ctrl.rotateSpeed = 1;
        ctrl.enableZoom = true;
        app.baseFov = 50;
        app.camera.position.set(55, 45, 80);
        ctrl.target.set(0, 0, 0);
      } else {
        ctrl.rotateSpeed = -0.35;
        ctrl.enableZoom = false;
        app.baseFov = 70;
        app.camera.position.set(0, EYE - 0.004, 0.009);
        ctrl.target.set(0, EYE, 0);
      }
      ctrl.enablePan = false;
      app.applyFov();
      ctrl.update();
      if (ctx.xrMode) ctx.setLayout(state.outside ? 'diorama' : 'surround', { grab: state.outside });
    }
    function look(x, y, z) {
      if (state.outside) return;
      app.camera.position.set(-x * 0.01, EYE - y * 0.01, -z * 0.01);
      app.controls.target.set(0, EYE, 0);
      app.controls.update();
    }
    applyView();

    return {
      update(dt) {
        if (state.playing) state.time = (state.time + dt * state.speed) % 24;
        if (builtLat !== state.lat) applyLatitude();
        if (builtTrailH !== state.trailH) rebuildTrails();
        spin.rotation.y = -lst() * 15 * DEG;
        const s = sunRA();
        eqLocal(s.raH, s.decDeg, SKY_R * 0.97, sun.position);
        // 태양 고도로 하늘 색 정하기
        spin.updateMatrix();
        celestial.updateMatrix();
        tmp.copy(sun.position).applyMatrix4(spin.matrix).applyMatrix4(celestial.matrix);
        sunAlt = Math.asin(Math.max(-1, Math.min(1, tmp.y / (SKY_R * 0.97)))) / DEG;
        const t = THREE.MathUtils.clamp((sunAlt + 12) / 18, 0, 1);
        if (t < 0.5) skyMat.color.copy(night).lerp(twilight, t * 2);
        else skyMat.color.copy(twilight).lerp(dayColor, (t - 0.5) * 2);
        const starFade = 1 - THREE.MathUtils.clamp((sunAlt + 8) / 10, 0, 0.92);
        for (const m of starMats) m.opacity = starFade;

        trailLines.visible = state.trails && state.trailH > 0;
        wedge.visible = wedgeLabel.visible = state.trails && state.lat > 20;
        if (wedge.visible) updateWedge();
        figGroup.visible = state.figures;
        nameGroup.visible = state.names;
        axisGroup.visible = state.axis || state.outside;
        groundMat.opacity = state.glassGround || state.outside ? 0.35 : 1;
        groundMat.depthWrite = !(state.glassGround || state.outside);
        const ar = ctx.xrMode === 'ar';
        sky.visible = !state.outside && !ar;
        ground.visible = !ar || state.outside;
        trees.visible = !state.outside && !ar;
        shell.visible = state.outside;
        person.visible = state.outside;
      },
      onXRChange(mode) {
        if (mode) ctx.setLayout(state.outside ? 'diorama' : 'surround', { grab: state.outside });
        else applyView();
      },
      controls: [
        { type: 'heading', label: '관측 장소 (위도)' },
        {
          type: 'slider', label: '위도', min: -90, max: 90, step: 0.5,
          get: () => state.lat, set: (v) => (state.lat = v),
          format: (v) => (v >= 0 ? `북위 ${fmt(v, 1)}°` : `남위 ${fmt(-v, 1)}°`),
        },
        {
          type: 'buttons',
          items: [
            { label: '서울', onClick: () => (state.lat = 37.5) },
            { label: '북극', onClick: () => (state.lat = 90) },
            { label: '적도', onClick: () => (state.lat = 0) },
            { label: '시드니', onClick: () => (state.lat = -34) },
          ],
        },
        { type: 'readout', label: '북극성의 고도', get: () => (state.lat >= 0 ? `약 ${fmt(state.lat, 1)}° (= 위도)` : '지평선 아래 (보이지 않음)') },
        { type: 'heading', label: '날짜와 시각' },
        { type: 'toggle', label: '시간 흐르게 하기', get: () => state.playing, set: (v) => (state.playing = v) },
        {
          type: 'choice', label: '빠르기',
          options: [
            { value: 0.25, label: '느리게' },
            { value: 1, label: '보통 (1초=1시간)' },
            { value: 3, label: '빠르게' },
          ],
          get: () => state.speed, set: (v) => (state.speed = v),
        },
        { type: 'slider', label: '시각', min: 0, max: 23.99, step: 0.05, get: () => state.time, set: (v) => (state.time = v), format: timeText },
        { type: 'slider', label: '날짜', min: 1, max: 12.99, step: 0.01, get: () => state.month, set: (v) => (state.month = v), format: dateText },
        { type: 'heading', label: '보이기' },
        { type: 'toggle', label: '별의 궤적 (일주 운동 자취)', get: () => state.trails, set: (v) => (state.trails = v) },
        {
          type: 'slider', label: '궤적 길이', min: 0.5, max: 12, step: 0.5,
          get: () => state.trailH, set: (v) => (state.trailH = v), format: (v) => `${fmt(v, 1)}시간 → ${fmt(v * 15, 0)}°`,
        },
        { type: 'toggle', label: '별자리 선과 이름', get: () => state.figures, set: (v) => (state.figures = v) },
        { type: 'toggle', label: '밝은 별 이름', get: () => state.names, set: (v) => (state.names = v) },
        { type: 'toggle', label: '천구의 적도·자전축', get: () => state.axis, set: (v) => (state.axis = v) },
        { type: 'toggle', label: '땅을 투명하게 (지평선 아래 별 보기)', get: () => state.glassGround, set: (v) => (state.glassGround = v) },
        {
          type: 'choice', label: '보는 위치',
          options: [
            { value: false, label: '관측자 (안에서)' },
            { value: true, label: '천구 밖에서' },
          ],
          get: () => state.outside,
          set: (v) => {
            state.outside = v;
            applyView();
          },
        },
        {
          type: 'buttons',
          items: [
            { label: '북쪽', onClick: () => look(0, 0.35, -1) },
            { label: '동쪽', onClick: () => look(1, 0.35, 0) },
            { label: '남쪽', onClick: () => look(0, 0.35, 1) },
            { label: '서쪽', onClick: () => look(-1, 0.35, 0) },
            { label: '머리 위', onClick: () => look(0, 1, -0.05) },
          ],
          visible: () => !ctx.xrMode && !state.outside,
        },
        { type: 'note', get: () => (sunAlt > -6 ? '지금은 태양이 떠 있거나 너무 밝아서 실제로는 별이 거의 보이지 않아요.' : '화면을 끌어서 하늘을 둘러보세요. (VR에서는 몸을 돌리면 돼요)') },
      ],
    };
  },
};
