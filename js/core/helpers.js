// 여러 모듈이 함께 쓰는 3D 도우미 함수 모음
import * as THREE from 'three';

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const DEG = Math.PI / 180;
export { DEG };

export function fmt(n, digits = 1) {
  if (!isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// 글자 라벨 (Sprite). 데스크톱·VR·AR 어디서든 항상 카메라를 향한다.
// ---------------------------------------------------------------------------
export function makeLabel(text, opts = {}) {
  const o = {
    size: 0.3, // 월드 단위 글자 높이(한 줄)
    color: '#ffffff',
    bg: 'rgba(5, 10, 30, 0.55)',
    border: null,
    weight: 600,
    depthTest: false,
    anchor: [0.5, 0.5],
    ...opts,
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: o.depthTest,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(o.anchor[0], o.anchor[1]);
  sprite.renderOrder = 20;

  const PX = 52; // 캔버스 글자 크기(px)
  const pad = 14;
  let current = null;

  function draw(str) {
    const lines = String(str).split('\n');
    ctx.font = `${o.weight} ${PX}px ${FONT}`;
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const lineH = PX * 1.25;
    canvas.width = Math.ceil(w + pad * 2);
    canvas.height = Math.ceil(lineH * lines.length + pad * 2 - PX * 0.25);
    ctx.font = `${o.weight} ${PX}px ${FONT}`;
    if (o.bg) {
      ctx.fillStyle = o.bg;
      roundRect(ctx, 0, 0, canvas.width, canvas.height, 18);
      ctx.fill();
    }
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = 4;
      roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 16);
      ctx.stroke();
    }
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lineH));
    // 캔버스 크기가 바뀌면 GPU 텍스처를 새로 만들어야 한다
    texture.dispose();
    texture.needsUpdate = true;
    const k = o.size / lineH; // 캔버스 1px 당 월드 길이
    sprite.scale.set(canvas.width * k, canvas.height * k, 1);
  }

  sprite.setText = (str) => {
    if (str === current) return;
    current = str;
    draw(str);
  };
  sprite.setColor = (c) => {
    if (o.color === c) return;
    o.color = c;
    const s = current;
    current = null;
    sprite.setText(s);
  };
  sprite.setText(text);
  return sprite;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// 빛 번짐(glow) 스프라이트
// ---------------------------------------------------------------------------
let glowTexture = null;
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function makeGlow(color = 0xffffff, size = 1, opacity = 1) {
  const m = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// 별 하나: 밝은 중심 + 빛 번짐
export function makeStar(color = 0xffffff, radius = 0.1, glowSize = 6) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ color })
  );
  const glow = makeGlow(color, radius * glowSize, 0.9);
  g.add(core, glow);
  g.userData.core = core;
  g.userData.glow = glow;
  return g;
}

// ---------------------------------------------------------------------------
// 배경 별 (Points). 카메라를 따라다니므로 무한히 먼 별처럼 보인다.
// ---------------------------------------------------------------------------
let dotTexture = null;
export function getDotTexture() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

export function makeStarfield({ count = 2600, radius = 900, seed = 7, size = 3.2, band = true } = {}) {
  const rand = mulberry32(seed);
  const pos = [];
  const col = [];
  const tmp = new THREE.Vector3();
  const color = new THREE.Color();
  // 은하수 띠(기울어진 대원)를 위한 회전
  const bandRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 0.3, 0.4));
  for (let i = 0; i < count; i++) {
    const inBand = band && i > count * 0.6;
    if (inBand) {
      const lon = rand() * Math.PI * 2;
      const lat = gaussian(rand) * 0.12;
      tmp.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).applyQuaternion(bandRot);
    } else {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      tmp.set(r * Math.cos(t), u, r * Math.sin(t));
    }
    tmp.multiplyScalar(radius);
    pos.push(tmp.x, tmp.y, tmp.z);
    const b = Math.pow(rand(), 2.2) * 0.85 + 0.15;
    const temp = 3000 + rand() * 9000;
    kelvinToColor(temp, color);
    color.lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(inBand ? b * 0.6 : b);
    col.push(color.r, color.g, color.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: radius * 0.0035 * (size / 3.2),
    sizeAttenuation: true,
    vertexColors: true,
    map: getDotTexture(),
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

// 별 여러 개를 점(Points) 하나로 그린다 (그리기 호출을 줄여 VR에서도 가볍게)
export function makeStarPoints(positions, colors, size = 0.3) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    map: getDotTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
}

// ---------------------------------------------------------------------------
// 굵은 선(원기둥). VR에서도 잘 보이도록 1px 선 대신 사용한다.
// ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
export function makeRod(color = 0xffffff, radius = 0.02, opts = {}) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.opacity === undefined || opts.opacity >= 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.radius = radius;
  const dir = new THREE.Vector3();
  mesh.setEnds = (a, b) => {
    dir.subVectors(b, a);
    const len = dir.length();
    mesh.position.copy(a);
    if (len < 1e-9) {
      mesh.scale.set(radius, 1e-6, radius);
      return mesh;
    }
    mesh.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
    mesh.scale.set(mesh.userData.radius, len, mesh.userData.radius);
    return mesh;
  };
  return mesh;
}

// 점선 효과가 필요할 때: 짧은 원기둥 여러 개
export function makeDashedRod(color = 0xffffff, radius = 0.015, dash = 0.15, maxDashes = 120) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.InstancedMesh(geo, mat, maxDashes);
  mesh.frustumCulled = false;
  group.add(mesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  group.setEnds = (a, b) => {
    d.subVectors(b, a);
    const len = d.length();
    if (len < 1e-9) {
      mesh.count = 0;
      return group;
    }
    d.multiplyScalar(1 / len);
    q.setFromUnitVectors(UP, d);
    const n = Math.min(maxDashes, Math.floor(len / (dash * 2)) + 1);
    for (let i = 0; i < n; i++) {
      const start = i * dash * 2;
      const l = Math.min(dash, len - start);
      p.copy(a).addScaledVector(d, start);
      s.set(radius, Math.max(l, 1e-6), radius);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    return group;
  };
  group.material = mat;
  return group;
}

// XZ 평면 위의 고리(궤도)
export function makeRing(radius, tube, color = 0xffffff, opacity = 1, segments = 160) {
  const geo = new THREE.TorusGeometry(radius, tube, 6, segments);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// 각도 표시용 부채꼴 + 호. set(중심, 방향A, 방향B)로 갱신.
// ---------------------------------------------------------------------------
export function makeAngleWedge({ radius = 1, color = 0xffd54f, fillOpacity = 0.25, stroke = 0.04 } = {}) {
  const group = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const strokeMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat);
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), strokeMat);
  group.add(fill, arc);
  let lastAngle = -1;
  let lastR = -1;
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const m = new THREE.Matrix4();
  group.angle = 0;
  group.set = (center, dirA, dirB, r = radius) => {
    u.copy(dirA).normalize();
    const b = dirB.clone().normalize();
    const angle = Math.acos(clamp(u.dot(b), -1, 1));
    group.angle = angle;
    w.crossVectors(u, b);
    if (w.lengthSq() < 1e-12) {
      // 두 방향이 평행하면 임의의 법선 사용
      w.set(0, 1, 0);
      if (Math.abs(u.y) > 0.9) w.set(1, 0, 0);
      w.cross(u);
    }
    w.normalize();
    v.crossVectors(w, u).normalize();
    m.makeBasis(u, v, w);
    group.position.copy(center);
    group.quaternion.setFromRotationMatrix(m);
    if (Math.abs(angle - lastAngle) > 1e-4 || r !== lastR) {
      lastAngle = angle;
      lastR = r;
      const seg = Math.max(4, Math.ceil(angle / (Math.PI / 64)));
      fill.geometry.dispose();
      fill.geometry = new THREE.CircleGeometry(r, seg, 0, Math.max(angle, 1e-4));
      arc.geometry.dispose();
      arc.geometry = new THREE.RingGeometry(r - stroke, r, seg, 1, 0, Math.max(angle, 1e-4));
    }
    return angle;
  };
  group.material = strokeMat;
  return group;
}

// ---------------------------------------------------------------------------
// 1px 선 (궤적 등 얇은 선)
// ---------------------------------------------------------------------------
export function makePolyline(maxPoints, color = 0xffffff, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(maxPoints * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.setPoints = (pts) => {
    const n = Math.min(pts.length, maxPoints);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pts[i].x;
      arr[i * 3 + 1] = pts[i].y;
      arr[i * 3 + 2] = pts[i].z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, n);
  };
  return line;
}

// ---------------------------------------------------------------------------
// 온도(K) → 별의 색 (Tanner Helland 근사)
// ---------------------------------------------------------------------------
export function kelvinToColor(k, target = new THREE.Color()) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  target.setRGB(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255, THREE.SRGBColorSpace);
  return target;
}

// ---------------------------------------------------------------------------
// 절차적 텍스처: 지구, 달
// ---------------------------------------------------------------------------
let earthTex = null;
export function getEarthTexture() {
  if (earthTex) return earthTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, '#1b4f8f');
  sea.addColorStop(0.5, '#1f6fb8');
  sea.addColorStop(1, '#1b4f8f');
  g.fillStyle = sea;
  g.fillRect(0, 0, 1024, 512);
  const rand = mulberry32(42);
  // 대륙 모양을 대충 흉내 낸 덩어리들 (경도, 위도, 크기)
  const blobs = [
    [0.08, 0.32, 0.09], [0.15, 0.27, 0.08], [0.2, 0.42, 0.05], // 북아메리카
    [0.27, 0.62, 0.06], [0.29, 0.72, 0.05], // 남아메리카
    [0.52, 0.3, 0.06], [0.55, 0.45, 0.07], [0.56, 0.58, 0.06], // 유럽·아프리카
    [0.68, 0.28, 0.1], [0.78, 0.3, 0.09], [0.74, 0.42, 0.06], // 아시아
    [0.86, 0.68, 0.06], // 오세아니아
  ];
  for (const [x, y, s] of blobs) {
    for (let i = 0; i < 26; i++) {
      const px = (x + (rand() - 0.5) * s * 1.6) * 1024;
      const py = (y + (rand() - 0.5) * s * 1.2) * 512;
      const r = (0.25 + rand() * 0.5) * s * 512 * 0.5;
      g.fillStyle = rand() < 0.5 ? '#3d8b3d' : '#5a9c48';
      g.beginPath();
      g.ellipse(px, py, r * 1.3, r, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  // 극지방 얼음
  g.fillStyle = 'rgba(240,248,255,0.95)';
  g.fillRect(0, 0, 1024, 30);
  g.fillRect(0, 482, 1024, 30);
  // 구름
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.ellipse(rand() * 1024, rand() * 512, 20 + rand() * 60, 6 + rand() * 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  earthTex = new THREE.CanvasTexture(c);
  earthTex.colorSpace = THREE.SRGBColorSpace;
  earthTex.anisotropy = 4;
  return earthTex;
}

let moonTex = null;
export function getMoonTexture() {
  if (moonTex) return moonTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b9b4';
  g.fillRect(0, 0, 512, 256);
  const rand = mulberry32(5);
  // 바다(어두운 지역) — 앞면(텍스처 가운데 부근)에 몰려 있다
  for (let i = 0; i < 18; i++) {
    g.fillStyle = 'rgba(90,90,95,0.35)';
    g.beginPath();
    g.ellipse(200 + rand() * 120, 70 + rand() * 110, 15 + rand() * 30, 10 + rand() * 25, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 160; i++) {
    const x = rand() * 512;
    const y = rand() * 256;
    const r = 1 + Math.pow(rand(), 3) * 14;
    g.fillStyle = 'rgba(70,70,70,0.35)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(235,235,230,0.35)';
    g.lineWidth = 1;
    g.stroke();
  }
  moonTex = new THREE.CanvasTexture(c);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  return moonTex;
}

// ---------------------------------------------------------------------------
// 정리
// ---------------------------------------------------------------------------
const SHARED = new Set();
export function markShared(tex) {
  SHARED.add(tex);
  return tex;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'emissiveMap', 'alphaMap']) {
        const t = m[key];
        if (t && t !== glowTexture && t !== dotTexture && t !== earthTex && t !== moonTex && !SHARED.has(t)) t.dispose();
      }
      m.dispose();
    }
  });
}
