// 첫 화면(단원 목록)과 시뮬레이션 화면 사이를 오가는 간단한 라우터
import { MODULES } from './modules/index.js';
import { App } from './core/app.js';

const $ = (id) => document.getElementById(id);
let app = null;

function buildHome() {
  const cards = $('cards');
  const units = [...new Set(MODULES.map((m) => m.unit))];
  for (const unit of units) {
    const h = document.createElement('h2');
    h.className = 'unit-title';
    h.textContent = `「${unit}」 단원`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const m of MODULES.filter((x) => x.unit === unit)) {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = '#/' + m.id;
      a.innerHTML = `<div class="icon">${m.icon}</div><h3></h3><p></p>`;
      a.querySelector('h3').textContent = m.title;
      a.querySelector('p').textContent = m.summary;
      grid.append(a);
    }
    cards.append(h, grid);
  }
}

async function route() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const entry = MODULES.find((m) => m.id === id);
  if (!entry) {
    if (app && app.xrMode) return; // VR 중에는 목록으로 돌아가지 않는다
    $('sim').hidden = true;
    $('home').hidden = false;
    document.title = '천체 시뮬레이터';
    app?.stop();
    return;
  }
  $('home').hidden = true;
  $('sim').hidden = false;
  document.title = `${entry.title} · 천체 시뮬레이터`;
  if (!app) {
    // 3D 글자(라벨·VR 패널)에 한글 웹폰트를 쓰도록 잠깐 기다린다 (인터넷이 없으면 기본 글꼴)
    await Promise.race([
      document.fonts?.load('700 20px "Noto Sans KR"').catch(() => {}),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    if (app) return route();
    app = new App({
      viewport: $('viewport'),
      controls: $('controls'),
      info: $('info'),
      title: $('sim-title'),
      unit: $('sim-unit'),
      pipLabel: $('pip-label'),
      vrBtn: $('btn-vr'),
      arBtn: $('btn-ar'),
      xrNote: $('xr-note'),
    });
    window.app = app; // 디버깅용
  }
  if (app.entry?.id === entry.id && app.root) return;
  await app.load(entry.id);
  app.resize();
}

$('panel-toggle').addEventListener('click', () => $('sim').classList.toggle('collapsed'));
buildHome();
window.addEventListener('hashchange', route);
route();
