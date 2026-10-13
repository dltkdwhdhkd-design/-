// VR/AR 안에서 쓰는 조작 패널과 컨트롤러(손) 입력 처리.
// 패널은 캔버스에 그린 그림을 평면에 붙인 것이고, 컨트롤러 광선이 닿는 위치(uv)로 버튼을 찾는다.
import * as THREE from 'three';
import { FONT, roundRect, clamp } from './helpers.js';

const W = 720; // 패널 그리기 좌표의 가로 크기
const K = 1.5; // 실제 캔버스 해상도 배율 (VR에서 글자를 또렷하게)
const PAD = 26;
const C = {
  bg: 'rgba(10, 16, 38, 0.93)',
  border: 'rgba(120, 170, 255, 0.35)',
  text: '#e8eefc',
  sub: '#9fb0d6',
  accent: '#4fc3f7',
  accent2: '#ffd54f',
  btn: '#1d2a52',
  btnHover: '#2b3f7a',
  btnActive: '#3a73c9',
  track: '#33416b',
};

// ---------------------------------------------------------------------------
// 캔버스 패널 공통
// ---------------------------------------------------------------------------
class CanvasPanel {
  constructor(widthM) {
    this.widthM = widthM;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W * K;
    this.canvas.height = 100;
    this.h = 0; // 그리기 좌표의 세로 크기
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false })
    );
    this.mesh.renderOrder = 40;
    this.mesh.userData.panel = this;
    this.regions = [];
    this.hover = new Map(); // 컨트롤러 번호 → region id
    this.active = new Map(); // 컨트롤러 번호 → region
    this.sig = '';
    this.setHeight(100);
  }

  setHeight(h) {
    h = Math.ceil(h);
    if (h === this.h) return;
    this.h = h;
    this.canvas.height = Math.ceil(h * K);
    this.texture.dispose();
    this.texture.needsUpdate = true;
    this.mesh.scale.set(this.widthM, (this.widthM * h) / W, 1);
  }

  font(size, weight = 500) {
    this.g.font = `${weight} ${size}px ${FONT}`;
  }

  background() {
    const g = this.g;
    g.setTransform(K, 0, 0, K, 0, 0);
    g.clearRect(0, 0, W, this.h);
    g.fillStyle = C.bg;
    roundRect(g, 2, 2, W - 4, this.h - 4, 28);
    g.fill();
    g.strokeStyle = C.border;
    g.lineWidth = 3;
    g.stroke();
  }

  button(r, label, { active = false, size = 26 } = {}) {
    const g = this.g;
    const hovered = [...this.hover.values()].includes(r.id);
    g.fillStyle = active ? C.btnActive : hovered ? C.btnHover : C.btn;
    roundRect(g, r.x, r.y, r.w, r.h, 14);
    g.fill();
    if (hovered) {
      g.strokeStyle = C.accent;
      g.lineWidth = 2;
      g.stroke();
    }
    this.font(size, 600);
    g.fillStyle = C.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 8);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  regionAt(px) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (px.x >= r.x && px.x <= r.x + r.w && px.y >= r.y && px.y <= r.y + r.h) return r;
    }
    return null;
  }

  uvToPx(uv) {
    return { x: uv.x * W, y: (1 - uv.y) * this.h };
  }

  // 무한 평면과의 교점을 픽셀 좌표로 (드래그 중 패널 밖으로 벗어나도 계속 따라가게)
  rayToPx(ray) {
    const m = this.mesh;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
    const p = m.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    m.worldToLocal(hit);
    return { x: (hit.x + 0.5) * W, y: (0.5 - hit.y) * this.h };
  }

  pointerMove(idx, px) {
    const r = px ? this.regionAt(px) : null;
    const id = r ? r.id : null;
    if (this.hover.get(idx) !== id) {
      if (id === null) this.hover.delete(idx);
      else this.hover.set(idx, id);
      this.dirty = true;
    }
  }

  press(idx, px) {
    const r = this.regionAt(px);
    if (!r) return false;
    this.active.set(idx, r);
    r.press?.(px);
    this.dirty = true;
    return true;
  }

  drag(idx, px) {
    const r = this.active.get(idx);
    if (r && r.drag && px) r.drag(px);
  }

  release(idx) {
    const r = this.active.get(idx);
    if (r) r.release?.();
    this.active.delete(idx);
    this.dirty = true;
  }

  // 바뀐 내용이 있을 때만 다시 그린다
  refresh(force = false) {
    const sig = this.signature();
    if (!force && !this.dirty && sig === this.sig) return;
    this.sig = sig;
    this.dirty = false;
    this.draw();
    this.texture.needsUpdate = true;
  }

  signature() {
    return '';
  }

  draw() {}
}

// 글자 줄바꿈 (단어 단위, 너무 긴 단어는 글자 단위)
function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width <= maxW) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      if (g.measureText(word).width <= maxW) {
        line = word;
      } else {
        line = '';
        for (const ch of word) {
          if (g.measureText(line + ch).width > maxW) {
            out.push(line);
            line = ch;
          } else line += ch;
        }
      }
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 조작 패널: 모듈의 controls 명세를 그대로 VR 안에 그린다
// ---------------------------------------------------------------------------
export class ControlsPanel extends CanvasPanel {
  constructor(widthM, hooks) {
    super(widthM);
    this.hooks = hooks; // { menu(), recenter(), exit(), title, unit }
    this.controls = [];
    this.title = '';
    this.unit = '';
  }

  setModule(title, unit, controls) {
    this.title = title;
    this.unit = unit;
    this.controls = controls;
    this.dirty = true;
    this.layout();
    this.refresh(true);
  }

  signature() {
    let s = [...this.hover.values()].join(',') + '|' + [...this.active.values()].map((r) => r.id).join(',') + '|' + this.hooks.canGrab();
    for (const c of this.controls) {
      if (c.visible) s += c.visible() ? '|v' : '|h';
      if (c.get) {
        const v = c.get();
        s += '|' + (typeof v === 'number' ? v.toFixed(4) : v);
      }
    }
    return s;
  }

  layout() {
    const g = this.g;
    let y = PAD;
    const rows = [];
    // 제목 + 머리 버튼
    rows.push({ kind: 'title', y, h: 64 });
    y += 64;
    rows.push({ kind: 'header', y, h: 62 });
    y += 62;
    if (this.hooks.canGrab()) {
      rows.push({ kind: 'header2', y, h: 62 });
      y += 62;
    }
    y += 14;
    const innerW = W - PAD * 2;
    for (const c of this.controls) {
      if (c.visible && !c.visible()) continue;
      let h = 0;
      const extra = {};
      switch (c.type) {
        case 'heading':
          h = 50;
          break;
        case 'slider':
          h = 92;
          break;
        case 'toggle':
          h = 58;
          break;
        case 'button':
        case 'buttons':
          h = 66;
          break;
        case 'choice': {
          this.font(24, 600);
          const lines = [[]];
          let x = 0;
          for (const o of c.options) {
            const bw = Math.max(70, g.measureText(o.label).width + 34);
            if (x + bw > innerW && lines[lines.length - 1].length) {
              lines.push([]);
              x = 0;
            }
            lines[lines.length - 1].push({ o, bw });
            x += bw + 8;
          }
          // 줄마다 가로를 꽉 채우도록 늘린다
          for (const line of lines) {
            const total = line.reduce((a, b) => a + b.bw, 0) + 8 * (line.length - 1);
            const k = innerW / total;
            for (const it of line) it.bw *= k;
          }
          extra.lines = lines;
          h = (c.label ? 40 : 6) + lines.length * 58;
          break;
        }
        case 'readout': {
          this.font(24, 500);
          const lw = g.measureText(c.label).width;
          this.font(25, 700);
          const vw = g.measureText(String(c.get())).width;
          extra.twoLine = lw + vw + 30 > innerW;
          h = extra.twoLine ? 72 : 42;
          break;
        }
        case 'note': {
          this.font(22, 400);
          const t = typeof c.get === 'function' ? c.get() : c.text;
          extra.lines = wrapText(g, t, innerW);
          h = extra.lines.length * 30 + 10;
          break;
        }
      }
      rows.push({ kind: 'ctl', c, y, h, ...extra });
      y += h;
    }
    rows.push({ kind: 'hint', y: y + 6, h: 70 });
    y += 82;
    this.rows = rows;
    this.setHeight(y + PAD);
  }

  draw() {
    // 내용 길이가 바뀌는 항목(읽기값/설명)은 매번 다시 배치한다
    this.layout();
    const g = this.g;
    this.background();
    this.regions = [];
    const x0 = PAD;
    const innerW = W - PAD * 2;
    for (const row of this.rows) {
      const { y, h } = row;
      if (row.kind === 'title') {
        this.font(34, 800);
        g.fillStyle = C.text;
        g.fillText(this.title, x0, y + 38, innerW - 160);
        this.font(22, 600);
        g.fillStyle = C.accent;
        g.textAlign = 'right';
        g.fillText(this.unit, W - PAD, y + 36);
        g.textAlign = 'left';
      } else if (row.kind === 'header') {
        const items = [
          ['menu', '☰ 단원 메뉴', this.hooks.menu],
          ['recenter', '다시 배치', this.hooks.recenter],
          ['exit', '나가기', this.hooks.exit],
        ];
        const bw = (innerW - 16) / 3;
        items.forEach(([id, label, fn], i) => {
          const r = { id: 'hdr-' + id, x: x0 + i * (bw + 8), y, w: bw, h: 54, press: fn };
          this.regions.push(r);
          this.button(r, label, { size: 24 });
        });
      } else if (row.kind === 'header2') {
        const items = [
          ['smaller', '모형 작게', this.hooks.smaller],
          ['bigger', '모형 크게', this.hooks.bigger],
          ['rotate', '모형 돌리기', this.hooks.rotate],
        ];
        const bw = (innerW - 16) / 3;
        items.forEach(([id, label, fn], i) => {
          const r = { id: 'hdr-' + id, x: x0 + i * (bw + 8), y, w: bw, h: 54, press: fn };
          this.regions.push(r);
          this.button(r, label, { size: 23 });
        });
      } else if (row.kind === 'hint') {
        this.font(19, 400);
        g.fillStyle = C.sub;
        g.fillText('트리거(검지 집기): 누르기 · 그립: 모형 잡고 옮기기 · 두 손 그립: 크기', x0, y + 22, innerW);
        g.fillText('스틱 ↕: 크기 · 스틱 ↔: 회전 · A/X: 패널 숨기기 · B/Y: 다시 배치', x0, y + 50, innerW);
      } else {
        this.drawControl(row, x0, innerW);
      }
    }
  }

  drawControl(row, x0, innerW) {
    const g = this.g;
    const { c, y, h } = row;
    const id = 'c' + this.controls.indexOf(c);
    if (c.type === 'heading') {
      this.font(25, 800);
      g.fillStyle = C.accent2;
      g.fillText(c.label, x0, y + 34);
      g.fillStyle = 'rgba(255,213,79,0.3)';
      g.fillRect(x0, y + 44, innerW, 2);
    } else if (c.type === 'slider') {
      const v = c.get();
      this.font(24, 600);
      g.fillStyle = C.text;
      g.fillText(c.label, x0, y + 30, innerW * 0.6);
      this.font(25, 700);
      g.fillStyle = C.accent;
      g.textAlign = 'right';
      g.fillText(c.format ? c.format(v) : String(v), x0 + innerW, y + 30);
      g.textAlign = 'left';
      const tx = x0 + 18;
      const tw = innerW - 36;
      const ty = y + 58;
      const t = clamp((v - c.min) / (c.max - c.min), 0, 1);
      g.fillStyle = C.track;
      roundRect(g, tx, ty - 6, tw, 12, 6);
      g.fill();
      g.fillStyle = C.accent;
      roundRect(g, tx, ty - 6, Math.max(12, tw * t), 12, 6);
      g.fill();
      const hovered = [...this.hover.values()].includes(id) || [...this.active.values()].some((r) => r.id === id);
      g.beginPath();
      g.arc(tx + tw * t, ty, hovered ? 20 : 16, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      const setFromPx = (px) => {
        let nv = c.min + clamp((px.x - tx) / tw, 0, 1) * (c.max - c.min);
        if (c.step) nv = Math.round((nv - c.min) / c.step) * c.step + c.min;
        nv = clamp(nv, c.min, c.max);
        if (nv !== c.get()) c.set(nv);
      };
      this.regions.push({ id, x: x0, y: y + 34, w: innerW, h: 50, press: setFromPx, drag: setFromPx });
    } else if (c.type === 'toggle') {
      const on = !!c.get();
      const r = { id, x: x0, y: y + 4, w: innerW, h: 50, press: () => c.set(!c.get()) };
      this.regions.push(r);
      const hovered = [...this.hover.values()].includes(id);
      if (hovered) {
        g.fillStyle = 'rgba(79,195,247,0.12)';
        roundRect(g, r.x, r.y, r.w, r.h, 12);
        g.fill();
      }
      g.fillStyle = on ? C.accent : C.btn;
      roundRect(g, x0 + 8, y + 12, 34, 34, 8);
      g.fill();
      g.strokeStyle = C.accent;
      g.lineWidth = 2;
      g.stroke();
      if (on) {
        g.strokeStyle = '#08203a';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x0 + 15, y + 29);
        g.lineTo(x0 + 23, y + 38);
        g.lineTo(x0 + 36, y + 19);
        g.stroke();
      }
      this.font(24, 600);
      g.fillStyle = C.text;
      g.fillText(c.label, x0 + 58, y + 38, innerW - 60);
    } else if (c.type === 'button') {
      const r = { id, x: x0, y: y + 6, w: innerW, h: 54, press: c.onClick };
      this.regions.push(r);
      this.button(r, c.label);
    } else if (c.type === 'buttons') {
      const n = c.items.length;
      const bw = (innerW - 8 * (n - 1)) / n;
      c.items.forEach((it, i) => {
        const r = { id: id + '-' + i, x: x0 + i * (bw + 8), y: y + 6, w: bw, h: 54, press: it.onClick };
        this.regions.push(r);
        this.button(r, it.label, { size: n > 2 ? 22 : 25 });
      });
    } else if (c.type === 'choice') {
      let yy = y;
      if (c.label) {
        this.font(24, 600);
        g.fillStyle = C.text;
        g.fillText(c.label, x0, y + 28);
        yy += 40;
      } else yy += 6;
      const v = c.get();
      row.lines.forEach((line) => {
        let x = x0;
        for (const { o, bw } of line) {
          const r = { id: id + '-' + o.value, x, y: yy, w: bw, h: 50, press: () => c.set(o.value) };
          this.regions.push(r);
          this.button(r, o.label, { active: o.value === v, size: 23 });
          x += bw + 8;
        }
        yy += 58;
      });
    } else if (c.type === 'readout') {
      this.font(24, 500);
      g.fillStyle = C.sub;
      g.fillText(c.label, x0, y + 30);
      this.font(25, 700);
      g.fillStyle = '#ffffff';
      g.textAlign = 'right';
      g.fillText(String(c.get()), x0 + innerW, row.twoLine ? y + 62 : y + 30, innerW);
      g.textAlign = 'left';
    } else if (c.type === 'note') {
      this.font(22, 400);
      g.fillStyle = C.sub;
      row.lines.forEach((l, i) => g.fillText(l, x0, y + 26 + i * 30));
    }
  }
}

// ---------------------------------------------------------------------------
// 설명 패널: 학습 내용 (여러 쪽으로 나눔)
// ---------------------------------------------------------------------------
export class InfoPanel extends CanvasPanel {
  constructor(widthM) {
    super(widthM);
    this.pages = [[]];
    this.page = 0;
    this.title = '';
  }

  setText(title, text) {
    this.title = title;
    const g = this.g;
    const innerW = W - PAD * 2;
    const items = [];
    for (const raw of text.trim().split('\n')) {
      const line = raw.trim().replace(/\*\*(.+?)\*\*/g, '$1');
      if (!line) {
        items.push({ kind: 'gap', h: 12 });
        continue;
      }
      if (line.startsWith('## ')) {
        this.font(27, 800);
        for (const l of wrapText(g, line.slice(3), innerW)) items.push({ kind: 'h', text: l, h: 42 });
      } else if (line.startsWith('- ')) {
        this.font(23, 400);
        wrapText(g, line.slice(2), innerW - 28).forEach((l, i) =>
          items.push({ kind: 'li', text: l, first: i === 0, h: 32 })
        );
      } else {
        this.font(23, 400);
        for (const l of wrapText(g, line, innerW)) items.push({ kind: 'p', text: l, h: 32 });
      }
    }
    // 쪽 나누기
    const maxH = 700;
    this.pages = [[]];
    let hsum = 0;
    for (const it of items) {
      if (hsum + it.h > maxH && it.kind !== 'gap') {
        this.pages.push([]);
        hsum = 0;
      }
      if (hsum === 0 && it.kind === 'gap') continue;
      this.pages[this.pages.length - 1].push(it);
      hsum += it.h;
    }
    this.page = 0;
    const tallest = Math.max(...this.pages.map((p) => p.reduce((a, b) => a + b.h, 0)));
    this.setHeight(PAD + 60 + tallest + (this.pages.length > 1 ? 80 : 10) + PAD);
    this.dirty = true;
    this.refresh(true);
  }

  signature() {
    return this.page + '|' + [...this.hover.values()].join(',');
  }

  draw() {
    const g = this.g;
    this.background();
    this.regions = [];
    const x0 = PAD;
    this.font(30, 800);
    g.fillStyle = C.accent2;
    g.fillText('학습 내용 · ' + this.title, x0, PAD + 36, W - PAD * 2);
    let y = PAD + 60;
    for (const it of this.pages[this.page] || []) {
      if (it.kind === 'h') {
        this.font(27, 800);
        g.fillStyle = C.accent;
        g.fillText(it.text, x0, y + 32);
      } else if (it.kind === 'li') {
        this.font(23, 400);
        g.fillStyle = C.text;
        if (it.first) g.fillText('•', x0 + 4, y + 24);
        g.fillText(it.text, x0 + 28, y + 24);
      } else if (it.kind === 'p') {
        this.font(23, 400);
        g.fillStyle = C.text;
        g.fillText(it.text, x0, y + 24);
      }
      y += it.h;
    }
    if (this.pages.length > 1) {
      const by = this.h - PAD - 56;
      const bw = 150;
      const prev = { id: 'prev', x: x0, y: by, w: bw, h: 54, press: () => (this.page = Math.max(0, this.page - 1)) };
      const next = {
        id: 'next',
        x: W - PAD - bw,
        y: by,
        w: bw,
        h: 54,
        press: () => (this.page = Math.min(this.pages.length - 1, this.page + 1)),
      };
      this.regions.push(prev, next);
      this.button(prev, '◀ 이전');
      this.button(next, '다음 ▶');
      this.font(24, 600);
      g.fillStyle = C.sub;
      g.textAlign = 'center';
      g.fillText(`${this.page + 1} / ${this.pages.length}`, W / 2, by + 35);
      g.textAlign = 'left';
    }
  }
}

// ---------------------------------------------------------------------------
// 단원 메뉴 패널: VR을 벗지 않고 다른 시뮬레이션으로 이동
// ---------------------------------------------------------------------------
export class MenuPanel extends CanvasPanel {
  constructor(widthM, hooks) {
    super(widthM);
    this.hooks = hooks; // { select(id), close(), currentId() }
    this.entries = [];
  }

  setEntries(entries) {
    this.entries = entries;
    const units = [...new Set(entries.map((e) => e.unit))];
    this.setHeight(PAD + 70 + units.length * 54 + entries.length * 64 + 80 + PAD);
    this.dirty = true;
  }

  signature() {
    return [...this.hover.values()].join(',') + '|' + this.hooks.currentId();
  }

  draw() {
    const g = this.g;
    this.background();
    this.regions = [];
    const x0 = PAD;
    const innerW = W - PAD * 2;
    this.font(34, 800);
    g.fillStyle = C.text;
    g.fillText('시뮬레이션 고르기', x0, PAD + 40);
    let y = PAD + 70;
    let unit = null;
    for (const e of this.entries) {
      if (e.unit !== unit) {
        unit = e.unit;
        this.font(24, 800);
        g.fillStyle = C.accent2;
        g.fillText(unit, x0, y + 36);
        y += 54;
      }
      const r = { id: 'm-' + e.id, x: x0, y, w: innerW, h: 56, press: () => this.hooks.select(e.id) };
      this.regions.push(r);
      this.button(r, `${e.title}`, { active: e.id === this.hooks.currentId(), size: 25 });
      y += 64;
    }
    const r = { id: 'close', x: x0, y: y + 10, w: innerW, h: 56, press: this.hooks.close };
    this.regions.push(r);
    this.button(r, '닫기');
  }
}

// ---------------------------------------------------------------------------
// 컨트롤러·손 입력
// ---------------------------------------------------------------------------
export class XRInput {
  constructor(app) {
    this.app = app;
    this.raycaster = new THREE.Raycaster();
    this.controllers = [];
    this.grabs = new Map(); // idx → { target, offset }
    this.twoHand = null;
    const renderer = app.renderer;
    const scene = app.scene;

    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      ctrl.userData = { idx: i, source: null, prevButtons: [] };
      const ray = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
        new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, depthWrite: false })
      );
      ray.scale.z = 2;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })
      );
      dot.renderOrder = 50;
      dot.visible = false;
      ctrl.add(ray, dot);
      ctrl.userData.ray = ray;
      ctrl.userData.dot = dot;
      ray.visible = false;

      ctrl.addEventListener('connected', (e) => {
        ctrl.userData.source = e.data;
        ray.visible = e.data.targetRayMode === 'tracked-pointer';
        grip.visible = !e.data.hand;
      });
      ctrl.addEventListener('disconnected', () => {
        ctrl.userData.source = null;
        ray.visible = false;
        dot.visible = false;
        this.endGrab(i);
      });
      ctrl.addEventListener('selectstart', () => this.onSelectStart(i));
      ctrl.addEventListener('selectend', () => this.onSelectEnd(i));
      ctrl.addEventListener('squeezestart', () => this.onSqueezeStart(i));
      ctrl.addEventListener('squeezeend', () => this.endGrab(i));
      scene.add(ctrl);

      const grip = renderer.xr.getControllerGrip(i);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.024, 0.11, 12).rotateX(Math.PI / 2 - 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.6, metalness: 0.1 })
      );
      body.position.set(0, -0.01, 0.03);
      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.006, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x5c7cbf, roughness: 0.5 })
      );
      ringMesh.position.set(0, 0.02, -0.03);
      ringMesh.rotation.x = 0.5;
      grip.add(body, ringMesh);
      scene.add(grip);

      const hand = renderer.xr.getHand(i);
      hand.userData.jointMat = new THREE.MeshStandardMaterial({ color: 0xd8e4ff, roughness: 0.5 });
      hand.userData.jointGeo = new THREE.SphereGeometry(1, 8, 6);
      scene.add(hand);

      this.controllers.push({ ctrl, grip, hand });
    }

    // 조명이 없는 모듈에서도 컨트롤러 모형이 보이도록
    const light = new THREE.HemisphereLight(0xffffff, 0x334466, 1.2);
    light.layers.enableAll();
    this.light = light;
  }

  setActive(on) {
    if (on) this.app.scene.add(this.light);
    else this.app.scene.remove(this.light);
  }

  rayFrom(i) {
    const ctrl = this.controllers[i].ctrl;
    const m = ctrl.matrixWorld;
    this.raycaster.ray.origin.setFromMatrixPosition(m);
    this.raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
    return this.raycaster;
  }

  panelHit(i) {
    const panels = this.app.vrPanels().filter((p) => p.mesh.visible && p.mesh.parent && isVisible(p.mesh));
    const rc = this.rayFrom(i);
    const hits = rc.intersectObjects(
      panels.map((p) => p.mesh),
      false
    );
    if (!hits.length) return null;
    const h = hits[0];
    return { panel: h.object.userData.panel, px: h.object.userData.panel.uvToPx(h.uv), distance: h.distance };
  }

  onSelectStart(i) {
    const hit = this.panelHit(i);
    if (hit) {
      hit.panel.press(i, hit.px);
      this.controllers[i].ctrl.userData.pressPanel = hit.panel;
      return;
    }
    this.app.moduleSelect?.(this.rayFrom(i).ray);
  }

  onSelectEnd(i) {
    const p = this.controllers[i].ctrl.userData.pressPanel;
    if (p) p.release(i);
    this.controllers[i].ctrl.userData.pressPanel = null;
  }

  onSqueezeStart(i) {
    const ctrl = this.controllers[i].ctrl;
    const hit = this.panelHit(i);
    let target;
    if (hit) target = this.app.hud;
    else if (this.app.canGrabStage()) target = this.app.stage;
    else return;
    ctrl.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
    const offset = new THREE.Matrix4().copy(ctrl.matrixWorld).invert().multiply(target.matrixWorld);
    this.grabs.set(i, { target, offset });
    // 두 손으로 모형을 잡으면 크기 조절
    const other = this.grabs.get(1 - i);
    if (other && other.target === target && target === this.app.stage) {
      const p0 = this.controllers[0].ctrl.getWorldPosition(new THREE.Vector3());
      const p1 = this.controllers[1].ctrl.getWorldPosition(new THREE.Vector3());
      this.twoHand = {
        d0: p0.distanceTo(p1),
        s0: target.scale.x,
        mid0: p0.clone().add(p1).multiplyScalar(0.5),
        pos0: target.position.clone(),
      };
    }
  }

  endGrab(i) {
    this.grabs.delete(i);
    if (this.twoHand) {
      this.twoHand = null;
      // 남은 손으로 계속 잡고 있도록 기준을 다시 잡는다
      for (const [j, g] of this.grabs) {
        const ctrl = this.controllers[j].ctrl;
        g.offset.copy(ctrl.matrixWorld).invert().multiply(g.target.matrixWorld);
      }
    }
  }

  update(dt) {
    const tmpM = new THREE.Matrix4();
    // 패널 위 가리키기 / 끌기
    const hovered = new Set();
    for (let i = 0; i < 2; i++) {
      const { ctrl } = this.controllers[i];
      const ud = ctrl.userData;
      if (!ud.source) continue;
      const hit = this.panelHit(i);
      if (ud.pressPanel) {
        ud.pressPanel.drag(i, ud.pressPanel.rayToPx(this.rayFrom(i).ray));
      }
      for (const p of this.app.vrPanels()) {
        if (hit && hit.panel === p) {
          p.pointerMove(i, hit.px);
          hovered.add(p);
        } else p.pointerMove(i, null);
      }
      if (hit) {
        ud.ray.scale.z = hit.distance;
        ud.dot.position.set(0, 0, -hit.distance);
        ud.dot.visible = true;
      } else {
        ud.ray.scale.z = 2;
        ud.dot.visible = false;
      }

      // 버튼과 스틱
      const gp = ud.source.gamepad;
      if (gp) {
        const pressed = gp.buttons.map((b) => b.pressed);
        const edge = (k) => pressed[k] && !ud.prevButtons[k];
        if (edge(4)) this.app.toggleHud();
        if (edge(5)) this.app.requestPlacement();
        ud.prevButtons = pressed;
        const ax = gp.axes[2] ?? 0;
        const ay = gp.axes[3] ?? 0;
        if (this.app.canGrabStage() && !this.grabs.size) {
          if (Math.abs(ay) > 0.25) this.app.scaleStage(Math.exp(-ay * dt * 1.2));
          if (Math.abs(ax) > 0.25) this.app.rotateStage(-ax * dt * 1.5);
        }
      }
    }

    // 잡아서 옮기기
    if (this.twoHand && this.grabs.size === 2) {
      const p0 = this.controllers[0].ctrl.getWorldPosition(new THREE.Vector3());
      const p1 = this.controllers[1].ctrl.getWorldPosition(new THREE.Vector3());
      const f = clamp(p0.distanceTo(p1) / Math.max(this.twoHand.d0, 1e-3), 0.05, 20);
      const mid = p0.add(p1).multiplyScalar(0.5);
      const st = this.app.stage;
      st.scale.setScalar(this.twoHand.s0 * f);
      st.position.copy(this.twoHand.pos0).sub(this.twoHand.mid0).multiplyScalar(f).add(mid);
    } else {
      for (const [i, g] of this.grabs) {
        const ctrl = this.controllers[i].ctrl;
        tmpM.multiplyMatrices(ctrl.matrixWorld, g.offset);
        const s = g.target.scale.clone();
        tmpM.decompose(g.target.position, g.target.quaternion, new THREE.Vector3());
        g.target.scale.copy(s);
      }
    }

    // 손 관절 구슬 (손 추적 모드)
    for (const { hand } of this.controllers) {
      if (!hand.joints) continue;
      for (const name in hand.joints) {
        const j = hand.joints[name];
        if (!j.userData.ball) {
          const ball = new THREE.Mesh(hand.userData.jointGeo, hand.userData.jointMat);
          ball.scale.setScalar(0.007);
          j.add(ball);
          j.userData.ball = ball;
        }
        if (j.jointRadius) j.userData.ball.scale.setScalar(j.jointRadius * 0.9);
      }
    }
  }
}

function isVisible(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}
