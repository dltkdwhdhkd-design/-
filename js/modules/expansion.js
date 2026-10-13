// 우주 팽창: 풍선 표면에 붙인 은하 스티커들이 풍선이 부풀면서 서로 멀어진다.
import * as THREE from 'three';
import { makeLabel, mulberry32, fmt, FONT, roundRect } from '../core/helpers.js';

const R0 = 5; // 처음 풍선 반지름 (cm)
const Z = new THREE.Vector3(0, 0, 1);

function galaxyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const rand = mulberry32(9);
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 260; i++) {
      const t = i / 260;
      const r = 6 + t * 54;
      const th = arm * Math.PI + t * 4.2 + (rand() - 0.5) * 0.5;
      const x = 64 + r * Math.cos(th) + (rand() - 0.5) * 4;
      const y = 64 + r * Math.sin(th) * 0.9 + (rand() - 0.5) * 4;
      g.fillStyle = `rgba(255,255,255,${0.75 * (1 - t) + 0.15})`;
      g.beginPath();
      g.arc(x, y, 1.6 + (1 - t) * 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 구 위의 두 방향 사이 대원 호
function arcPoints(a, b, n = 48, r = 1.012) {
  const pts = [];
  const angle = a.angleTo(b);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = a.clone().multiplyScalar(Math.sin((1 - t) * angle)).add(b.clone().multiplyScalar(Math.sin(t * angle)));
    pts.push(v.divideScalar(Math.sin(angle)).normalize().multiplyScalar(r));
  }
  return pts;
}

export default {
  view: {
    layout: 'diorama',
    radius: 3.6,
    center: [0, 0, 0],
    camera: { pos: [0, 1.5, 9.5], target: [0.6, 0, 0] },
    vrRadius: 0.7,
    arRadius: 0.3,
  },

  info: `
## 우주 팽창
멀리 있는 은하들을 관측하면 거의 모든 은하가 우리은하로부터 멀어지고 있어요. 그리고 **멀리 있는 은하일수록 더 빠르게** 멀어져요. 이것은 우주가 팽창하고 있기 때문이에요.
## 풍선 모형
- 풍선 표면 = 우주, 스티커 = 은하
- 풍선이 부풀면 모든 스티커 사이의 거리가 멀어져요.
- 처음에 멀리 있던 스티커일수록 같은 시간 동안 더 많이 멀어져요 → 더 빨리 멀어진다
- 어느 스티커를 기준으로 해도 똑같이 보여요 → **우주 팽창의 중심은 따로 없어요**
- 스티커(은하) 자체의 크기는 커지지 않아요.
## 빅뱅 우주론
시간을 거꾸로 돌리면 은하들은 점점 가까워지고, 결국 아주 작은 한 점에서 시작했다고 생각할 수 있어요. 약 138억 년 전 대폭발(빅뱅)로 우주가 시작되어 지금까지 팽창하고 있다는 이론이 **빅뱅 우주론**이에요.
## 해 보기
'기준 은하'를 바꿔 보세요. 어느 은하에서 보든 다른 은하들이 거리에 비례해서 멀어지는 것을 확인할 수 있어요.
`,

  create(ctx) {
    const { root } = ctx;
    const state = { a: 1, playing: false, ref: 0, spin: false };
    root.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 2);
    dl.position.set(3, 4, 5);
    root.add(dl);

    const balloon = new THREE.Group();
    root.add(balloon);
    const skin = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshStandardMaterial({
        color: 0xe53950,
        transparent: true,
        opacity: 0.32,
        roughness: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    balloon.add(skin);
    // 위도·경도 선
    const gridPts = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = Math.sin((lat * Math.PI) / 180);
      const r = Math.cos((lat * Math.PI) / 180);
      for (let i = 0; i < 64; i++) {
        const a0 = (i / 64) * Math.PI * 2;
        const a1 = ((i + 1) / 64) * Math.PI * 2;
        gridPts.push(r * Math.cos(a0), y, r * Math.sin(a0), r * Math.cos(a1), y, r * Math.sin(a1));
      }
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const th = (lon * Math.PI) / 180;
      for (let i = 0; i < 64; i++) {
        const a0 = (i / 64) * Math.PI * 2;
        const a1 = ((i + 1) / 64) * Math.PI * 2;
        gridPts.push(
          Math.cos(a0) * Math.cos(th), Math.sin(a0), Math.cos(a0) * Math.sin(th),
          Math.cos(a1) * Math.cos(th), Math.sin(a1), Math.cos(a1) * Math.sin(th)
        );
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
    balloon.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xffcdd2, transparent: true, opacity: 0.25 })));
    // 풍선 꼭지
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0xc62828 }));
    knot.position.y = -1.05;
    balloon.add(knot);

    // 은하 스티커
    const tex = galaxyTexture();
    const rand = mulberry32(77);
    const tracked = [];
    const names = ['우리은하', '은하 A', '은하 B', '은하 C'];
    const colors = [0xfff59d, 0x80deea, 0xb39ddb, 0xffab91];
    const refDir = new THREE.Vector3(-0.15, 0.3, 1).normalize();
    // 기준에서 각각 20°, 45°, 75° 떨어진 은하
    const sep = [0, 20, 45, 75];
    const azim = [0, 200, 320, 80];
    const up = new THREE.Vector3(0, 1, 0);
    const perp0 = new THREE.Vector3().crossVectors(refDir, up).normalize();
    const galaxies = [];
    sep.forEach((deg, i) => {
      const axis = perp0.clone().applyAxisAngle(refDir, (azim[i] * Math.PI) / 180);
      const dir = refDir.clone().applyAxisAngle(axis, (deg * Math.PI) / 180).normalize();
      tracked.push({ dir, name: names[i], color: colors[i] });
    });
    const sticker = (dir, color, size) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      );
      m.position.copy(dir).multiplyScalar(1.004);
      m.quaternion.setFromUnitVectors(Z, dir);
      m.rotateZ(rand() * Math.PI * 2);
      m.userData.size = size;
      balloon.add(m);
      galaxies.push(m);
      return m;
    };
    for (const t of tracked) t.mesh = sticker(t.dir, t.color, 0.3);
    for (let i = 0; i < 26; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
      if (tracked.some((t) => t.dir.angleTo(dir) < 0.25)) continue;
      sticker(dir, new THREE.Color().setHSL(rand(), 0.4, 0.75), 0.18 + rand() * 0.1);
    }

    // 기준 은하 표시
    const refRing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.235, 40),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide, depthWrite: false, transparent: true })
    );
    balloon.add(refRing);

    // 기준 은하에서 다른 은하까지의 호
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const arcs = [];
    const labels = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), arcMat.clone());
      balloon.add(m);
      arcs.push(m);
      const l = makeLabel('', { size: 0.17 });
      root.add(l);
      labels.push(l);
    }
    const nameLabels = tracked.map((t) => {
      const l = makeLabel(t.name, { size: 0.17, color: '#' + new THREE.Color(t.color).getHexString(), anchor: [0.5, -0.6] });
      root.add(l);
      return l;
    });
    const radiusLabel = makeLabel('', { size: 0.2, color: '#ffcdd2' });
    root.add(radiusLabel);

    let builtRef = -1;
    const others = () => tracked.filter((_, i) => i !== state.ref);
    function rebuildArcs() {
      const ref = tracked[state.ref];
      refRing.position.copy(ref.dir).multiplyScalar(1.006);
      refRing.quaternion.setFromUnitVectors(Z, ref.dir);
      others().forEach((t, i) => {
        arcs[i].geometry.dispose();
        arcs[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints(ref.dir, t.dir)), 48, 0.008, 6, false);
        arcs[i].material.color.set(t.color);
      });
      builtRef = state.ref;
    }

    // 그래프: 처음 거리 vs 멀어진 거리
    const gc = document.createElement('canvas');
    gc.width = 640;
    gc.height = 560;
    const gg = gc.getContext('2d');
    const gtex = new THREE.CanvasTexture(gc);
    gtex.colorSpace = THREE.SRGBColorSpace;
    const graph = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1), new THREE.MeshBasicMaterial({ map: gtex, transparent: true }));
    graph.position.set(4.6, 0.2, -0.5);
    graph.rotation.y = -0.35;
    root.add(graph);
    let lastGraph = '';
    function drawGraph() {
      const key = state.a.toFixed(3) + '|' + state.ref;
      if (key === lastGraph) return;
      lastGraph = key;
      const g = gg;
      g.clearRect(0, 0, 640, 560);
      g.fillStyle = 'rgba(10,16,38,0.92)';
      roundRect(g, 0, 0, 640, 560, 26);
      g.fill();
      g.fillStyle = '#ffd54f';
      g.font = `800 30px ${FONT}`;
      g.fillText('처음 거리와 멀어진 거리', 30, 48);
      const ox = 90;
      const oy = 470;
      const W = 500;
      const H = 360;
      const ref = tracked[state.ref];
      const data = others().map((t) => {
        const d0 = R0 * ref.dir.angleTo(t.dir);
        return { d0, dd: d0 * (state.a - 1), color: t.color };
      });
      const maxX = R0 * Math.PI * 0.75;
      const maxY = maxX * 2;
      g.strokeStyle = '#9fb0d6';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ox, oy - H);
      g.lineTo(ox, oy);
      g.lineTo(ox + W, oy);
      g.stroke();
      g.font = `500 22px ${FONT}`;
      g.fillStyle = '#9fb0d6';
      g.fillText('처음 거리 (cm) →', ox + W - 190, oy + 40);
      g.save();
      g.translate(ox - 50, oy);
      g.rotate(-Math.PI / 2);
      g.fillText('멀어진 거리 (cm) →', 0, 0);
      g.restore();
      // 원점을 지나는 직선
      const k = state.a - 1;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + W, oy - Math.min(H, (k * maxX * H) / maxY));
      g.stroke();
      g.setLineDash([]);
      for (const p of data) {
        const x = ox + (p.d0 / maxX) * W;
        const y = oy - Math.min(H, (p.dd / maxY) * H);
        g.fillStyle = '#' + new THREE.Color(p.color).getHexString();
        g.beginPath();
        g.arc(x, y, 12, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e8eefc';
      g.font = `600 22px ${FONT}`;
      g.fillText('→ 멀리 있던 은하일수록 더 많이 멀어진다', 30, 540);
      gtex.needsUpdate = true;
    }

    const tmp = new THREE.Vector3();
    return {
      update(dt) {
        if (state.playing) {
          state.a += dt * 0.25;
          if (state.a > 3) state.a = 1;
        }
        if (builtRef !== state.ref) rebuildArcs();
        if (state.spin) balloon.rotation.y += dt * 0.15;
        balloon.scale.setScalar(state.a);
        // 스티커(은하)는 커지지 않는다
        for (const m of galaxies) m.scale.setScalar(m.userData.size / state.a);
        refRing.scale.setScalar(1 / state.a);
        balloon.updateMatrix();
        const ref = tracked[state.ref];
        others().forEach((t, i) => {
          const mid = arcPoints(ref.dir, t.dir, 2, 1.0)[1];
          tmp.copy(mid).multiplyScalar(1.12);
          labels[i].position.copy(tmp).applyMatrix4(balloon.matrix);
          const d = state.a * R0 * ref.dir.angleTo(t.dir);
          labels[i].setText(`${fmt(d, 1)} cm`);
        });
        tracked.forEach((t, i) => {
          tmp.copy(t.dir).multiplyScalar(1.02);
          nameLabels[i].position.copy(tmp).applyMatrix4(balloon.matrix);
        });
        radiusLabel.setText(`풍선 반지름 ${fmt(state.a * R0, 1)} cm`);
        radiusLabel.position.set(0, -state.a - 0.45, 0);
        drawGraph();
      },
      controls: [
        { type: 'toggle', label: '풍선 부풀리기 (재생)', get: () => state.playing, set: (v) => (state.playing = v) },
        {
          type: 'slider', label: '풍선 반지름', min: 1, max: 3, step: 0.01,
          get: () => state.a, set: (v) => (state.a = v), format: (v) => `${fmt(v * R0, 1)} cm (처음의 ${fmt(v, 2)}배)`,
        },
        { type: 'button', label: '처음 크기로', onClick: () => { state.a = 1; state.playing = false; } },
        {
          type: 'choice',
          label: '기준 은하',
          options: tracked.map((t, i) => ({ value: i, label: t.name })),
          get: () => state.ref,
          set: (v) => (state.ref = v),
        },
        { type: 'heading', label: '기준 은하에서 다른 은하까지 (처음 → 지금)' },
        ...[0, 1, 2].map((i) => ({
          type: 'readout',
          label: `거리 ${i + 1}`,
          get: () => {
            const ref = tracked[state.ref];
            const t = others()[i];
            const d0 = R0 * ref.dir.angleTo(t.dir);
            return `${t.name}: ${fmt(d0, 1)} → ${fmt(d0 * state.a, 1)} cm (+${fmt(d0 * (state.a - 1), 1)})`;
          },
        })),
        { type: 'readout', label: '늘어난 거리 ÷ 처음 거리', get: () => `모두 ${fmt(state.a - 1, 2)} (같아요!)` },
        { type: 'toggle', label: '풍선 천천히 돌리기', get: () => state.spin, set: (v) => (state.spin = v) },
      ],
    };
  },
};
