// 별의 색과 표면 온도: 온도가 높을수록 파랗고, 낮을수록 붉다.
import * as THREE from 'three';
import { makeLabel, makeGlow, kelvinToColor, fmt, FONT, roundRect } from '../core/helpers.js';

const TMIN = 2500;
const TMAX = 40000;
const tOf = (s) => TMIN * Math.pow(TMAX / TMIN, s);
const sOf = (t) => Math.log(t / TMIN) / Math.log(TMAX / TMIN);

const CLASSES = [
  { c: 'O', min: 30000, color: '파란색', },
  { c: 'B', min: 10000, color: '청백색' },
  { c: 'A', min: 7500, color: '흰색' },
  { c: 'F', min: 6000, color: '황백색' },
  { c: 'G', min: 5200, color: '노란색' },
  { c: 'K', min: 3700, color: '주황색' },
  { c: 'M', min: 0, color: '붉은색' },
];
const classOf = (t) => CLASSES.find((k) => t >= k.min);

const EXAMPLES = [
  { name: '나오스', T: 40000 },
  { name: '스피카', T: 22000 },
  { name: '리겔', T: 12100 },
  { name: '시리우스', T: 9900 },
  { name: '프로키온', T: 6500 },
  { name: '태양', T: 5800 },
  { name: '아크투르스', T: 4300 },
  { name: '베텔게우스', T: 3600 },
];

// 교과서처럼 색 차이가 잘 보이도록 채도를 높인 별 색
const hsl = { h: 0, s: 0, l: 0 };
function vividStarColor(T, out) {
  kelvinToColor(T, out);
  out.getHSL(hsl);
  return out.setHSL(hsl.h, Math.min(1, hsl.s * 2.4 + 0.1), Math.min(hsl.l, 0.86) * 0.92);
}

// 플랑크 곡선 (상대값)
function planck(lambdaNm, T) {
  const l = lambdaNm * 1e-9;
  const c2 = 1.4388e-2; // hc/k (m·K)
  return 1 / (Math.pow(l, 5) * (Math.exp(c2 / (l * T)) - 1));
}

export default {
  view: {
    layout: 'diorama',
    radius: 5,
    center: [0, 0.6, 0],
    camera: { pos: [0, 1.6, 9.5], target: [0, 0.6, 0] },
    vrRadius: 0.9,
    arRadius: 0.35,
  },

  info: `
## 별의 색과 표면 온도
별은 표면 온도에 따라 색이 달라요. 불꽃이나 달군 쇠가 온도가 높아질수록 붉은색 → 노란색 → 흰색 → 파란색으로 변하는 것과 같아요.
- 표면 온도가 **높을수록 파란색**
- 표면 온도가 **낮을수록 붉은색**
## 분광형 (O B A F G K M)
- O형: 파란색 (가장 뜨거움, 약 30,000 K 이상)
- B형: 청백색
- A형: 흰색 (시리우스, 직녀성)
- F형: 황백색
- G형: 노란색 (태양, 약 5,800 K)
- K형: 주황색
- M형: 붉은색 (베텔게우스, 약 3,500 K 이하)
## 빛의 세기 그래프
그래프는 별이 내는 빛을 파장별로 나타낸 거예요. 온도가 높을수록 가장 센 빛(봉우리)이 파장이 짧은 파란색·보라색 쪽으로 옮겨 가요.
## 겨울철 오리온자리
오리온자리의 **리겔**은 청백색, **베텔게우스**는 붉은색이에요. 맨눈으로도 색 차이를 볼 수 있어요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = { s: sOf(5800), compare: true };
    root.add(new THREE.AmbientLight(0xffffff, 0.6));

    // 큰 별
    const color = new THREE.Color();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const star = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), starMat);
    star.position.set(-1.6, 1.4, 0);
    const glow = makeGlow(0xffffff, 4.2, 0.75);
    glow.position.copy(star.position);
    root.add(star, glow);
    const starLabel = makeLabel('', { size: 0.3, anchor: [0.5, 0] });
    starLabel.position.set(-1.6, 2.75, 0);
    root.add(starLabel);

    // 온도 띠 (로그 눈금)
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 1024;
    barCanvas.height = 160;
    const bg = barCanvas.getContext('2d');
    const barTex = new THREE.CanvasTexture(barCanvas);
    barTex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshBasicMaterial({ map: barTex, transparent: true }));
    bar.position.set(0, -1.25, 0.2);
    root.add(bar);
    function drawBar() {
      const g = bg;
      g.clearRect(0, 0, 1024, 160);
      const x0 = 40;
      const w = 944;
      for (let i = 0; i < w; i++) {
        // 왼쪽이 뜨거운 별 (분광형 순서 O → M)
        const t = tOf(1 - i / w);
        vividStarColor(t, color);
        g.fillStyle = `#${color.getHexString()}`;
        g.fillRect(x0 + i, 20, 1, 56);
      }
      g.font = `700 30px ${FONT}`;
      g.textAlign = 'center';
      g.fillStyle = '#e8eefc';
      const bounds = [TMAX, 30000, 10000, 7500, 6000, 5200, 3700, TMIN];
      for (let k = 0; k < 7; k++) {
        const xa = x0 + w * (1 - sOf(bounds[k]));
        const xb = x0 + w * (1 - sOf(bounds[k + 1]));
        g.fillText(CLASSES[k].c, (xa + xb) / 2, 112);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        if (k > 0) g.fillRect(xa - 1, 14, 2, 68);
        g.fillStyle = '#e8eefc';
      }
      g.font = `500 22px ${FONT}`;
      g.fillStyle = '#9fb0d6';
      g.textAlign = 'left';
      g.fillText('← 뜨겁다 (파란색)', x0, 150);
      g.textAlign = 'right';
      g.fillText('차갑다 (붉은색) →', x0 + w, 150);
      // 현재 온도 표시
      const x = x0 + w * (1 - state.s);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(x, 18);
      g.lineTo(x - 12, 0);
      g.lineTo(x + 12, 0);
      g.fill();
      g.fillRect(x - 2, 18, 4, 62);
      barTex.needsUpdate = true;
    }

    // 빛의 세기 그래프
    const gc = document.createElement('canvas');
    gc.width = 900;
    gc.height = 640;
    const gg = gc.getContext('2d');
    const graphTex = new THREE.CanvasTexture(gc);
    graphTex.colorSpace = THREE.SRGBColorSpace;
    const graph = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.56), new THREE.MeshBasicMaterial({ map: graphTex, transparent: true }));
    graph.position.set(2.1, 1.35, 0);
    root.add(graph);
    function drawGraph(T) {
      const g = gg;
      g.clearRect(0, 0, 900, 640);
      g.fillStyle = 'rgba(10,16,38,0.92)';
      roundRect(g, 0, 0, 900, 640, 28);
      g.fill();
      const L0 = 100;
      const L1 = 2000;
      const px = (l) => 80 + ((l - L0) / (L1 - L0)) * 780;
      const py = (v) => 520 - v * 400;
      // 가시광선 띠
      for (let l = 380; l <= 750; l += 2) {
        const hue = 270 - ((l - 380) / (750 - 380)) * 270;
        g.fillStyle = `hsla(${hue}, 90%, 55%, 0.35)`;
        g.fillRect(px(l), 110, px(l + 2) - px(l) + 0.5, 410);
      }
      g.fillStyle = '#e8eefc';
      g.font = `600 24px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('가시광선', px(565), 102);
      g.fillStyle = '#9fb0d6';
      g.font = `500 22px ${FONT}`;
      g.fillText('자외선', px(240), 102);
      g.fillText('적외선', px(1300), 102);
      // 축
      g.strokeStyle = '#9fb0d6';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(80, 100);
      g.lineTo(80, 520);
      g.lineTo(870, 520);
      g.stroke();
      g.fillStyle = '#9fb0d6';
      g.font = `500 22px ${FONT}`;
      for (const l of [500, 1000, 1500, 2000]) g.fillText(`${l}`, px(l), 550);
      g.fillText('파장 (nm)', 470, 600);
      g.save();
      g.translate(40, 320);
      g.rotate(-Math.PI / 2);
      g.fillText('빛의 세기 (상대값)', 0, 0);
      g.restore();
      g.textAlign = 'left';
      g.font = `800 30px ${FONT}`;
      g.fillStyle = '#ffd54f';
      g.fillText('파장에 따른 빛의 세기', 80, 50);

      const curve = (temp, style, width) => {
        let max = 0;
        for (let l = L0; l <= L1; l += 5) max = Math.max(max, planck(l, temp));
        g.strokeStyle = style;
        g.lineWidth = width;
        g.beginPath();
        for (let l = L0; l <= L1; l += 5) {
          const v = planck(l, temp) / max;
          if (l === L0) g.moveTo(px(l), py(v));
          else g.lineTo(px(l), py(v));
        }
        g.stroke();
      };
      if (state.compare) curve(5800, 'rgba(255,224,130,0.55)', 3);
      vividStarColor(T, color);
      curve(T, `#${color.getHexString()}`, 6);
      // 봉우리 (빈의 법칙)
      const peak = 2.898e6 / T;
      if (peak >= L0 && peak <= L1) {
        g.strokeStyle = '#ffffff';
        g.setLineDash([10, 8]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(px(peak), 120);
        g.lineTo(px(peak), 520);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = '#ffffff';
      g.font = `600 24px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(`가장 센 빛의 파장 ≈ ${Math.round(peak)} nm`, 860, 50);
      if (state.compare) {
        g.fillStyle = '#ffe082';
        g.fillText('흐린 노란 선: 태양 (5,800 K)', 860, 84);
      }
      graphTex.needsUpdate = true;
    }

    // 예시 별들
    const examples = new THREE.Group();
    EXAMPLES.forEach((e, i) => {
      vividStarColor(e.T, color);
      const x = -3.15 + i * 0.9;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: color.clone() }));
      m.position.set(x, -2.45, 0.2);
      const gl = makeGlow(color.getHex(), 0.9, 0.6);
      gl.position.copy(m.position);
      const l = makeLabel(`${e.name}\n${classOf(e.T).c}형 ${fmt(e.T, 0)} K`, { size: 0.12, anchor: [0.5, 1] });
      l.position.set(x, -2.75, 0.2);
      examples.add(m, gl, l);
    });
    root.add(examples);

    let lastS = -1;
    let lastCompare = null;
    return {
      update() {
        if (state.s === lastS && state.compare === lastCompare) return;
        lastS = state.s;
        lastCompare = state.compare;
        const T = tOf(state.s);
        vividStarColor(T, color);
        starMat.color.copy(color);
        glow.material.color.copy(color);
        const k = classOf(T);
        starLabel.setText(`${fmt(Math.round(T / 100) * 100, 0)} K · ${k.c}형 · ${k.color}`);
        drawBar();
        drawGraph(T);
      },
      controls: [
        {
          type: 'slider', label: '표면 온도', min: 0, max: 1, step: 0.001,
          get: () => state.s, set: (v) => (state.s = v),
          format: (v) => `${fmt(Math.round(tOf(v) / 100) * 100, 0)} K`,
        },
        { type: 'readout', label: '분광형', get: () => `${classOf(tOf(state.s)).c}형` },
        { type: 'readout', label: '색', get: () => classOf(tOf(state.s)).color },
        { type: 'readout', label: '가장 센 빛의 파장', get: () => `약 ${Math.round(2.898e6 / tOf(state.s))} nm` },
        { type: 'heading', label: '실제 별의 온도로' },
        {
          type: 'choice',
          options: EXAMPLES.map((e) => ({ value: e.name, label: e.name })),
          get: () => EXAMPLES.find((e) => Math.abs(sOf(e.T) - state.s) < 0.002)?.name ?? null,
          set: (name) => (state.s = sOf(EXAMPLES.find((e) => e.name === name).T)),
        },
        { type: 'toggle', label: '그래프에 태양 곡선 함께 보기', get: () => state.compare, set: (v) => (state.compare = v) },
        { type: 'note', text: '온도가 높은 별일수록 같은 크기에서 빛을 훨씬 많이 내요. 그래프는 모양을 비교하려고 봉우리 높이를 같게 맞췄어요.' },
      ],
    };
  },
};
