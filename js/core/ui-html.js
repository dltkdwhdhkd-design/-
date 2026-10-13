// 데스크톱/태블릿/휴대폰용 HTML 조작 패널.
// 모듈이 넘겨 준 controls 명세로 화면을 만들고, get()을 주기적으로 읽어 값을 맞춘다.

export function renderInfo(text) {
  // 아주 단순한 마크다운: "## 제목", "- 목록", "**굵게**", 빈 줄 = 문단
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = false;
  for (const raw of text.trim().split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (list) {
      out.push('</ul>');
      list = false;
    }
    if (!line) continue;
    if (line.startsWith('## ')) out.push(`<h3>${inline(line.slice(3))}</h3>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

export function buildHtmlControls(container, controls) {
  container.innerHTML = '';
  const updaters = [];

  for (const c of controls) {
    const row = document.createElement('div');
    row.className = `ctl ctl-${c.type}`;

    if (c.type === 'heading') {
      row.textContent = c.label;
    } else if (c.type === 'slider') {
      const head = document.createElement('div');
      head.className = 'ctl-head';
      const name = document.createElement('span');
      name.textContent = c.label;
      const val = document.createElement('span');
      val.className = 'ctl-value';
      head.append(name, val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = c.min;
      input.max = c.max;
      input.step = c.step ?? 'any';
      input.setAttribute('aria-label', c.label);
      let dragging = false;
      input.addEventListener('pointerdown', () => (dragging = true));
      window.addEventListener('pointerup', () => (dragging = false));
      input.addEventListener('input', () => c.set(parseFloat(input.value)));
      row.append(head, input);
      updaters.push(() => {
        const v = c.get();
        if (!dragging && document.activeElement !== input) input.value = v;
        val.textContent = c.format ? c.format(v) : String(v);
      });
    } else if (c.type === 'toggle') {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => c.set(input.checked));
      const span = document.createElement('span');
      span.textContent = c.label;
      label.append(input, span);
      row.append(label);
      updaters.push(() => {
        input.checked = !!c.get();
      });
    } else if (c.type === 'button') {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.addEventListener('click', () => c.onClick());
      row.append(b);
    } else if (c.type === 'buttons') {
      for (const it of c.items) {
        const b = document.createElement('button');
        b.textContent = it.label;
        b.addEventListener('click', () => it.onClick());
        row.append(b);
      }
    } else if (c.type === 'choice') {
      if (c.label) {
        const name = document.createElement('div');
        name.className = 'ctl-head';
        name.textContent = c.label;
        row.append(name);
      }
      const seg = document.createElement('div');
      seg.className = 'seg';
      const btns = c.options.map((o) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.addEventListener('click', () => c.set(o.value));
        seg.append(b);
        return [o.value, b];
      });
      row.append(seg);
      updaters.push(() => {
        const v = c.get();
        for (const [value, b] of btns) b.classList.toggle('active', value === v);
      });
    } else if (c.type === 'readout') {
      const name = document.createElement('span');
      name.className = 'ro-label';
      name.textContent = c.label;
      const val = document.createElement('span');
      val.className = 'ro-value';
      row.append(name, val);
      updaters.push(() => {
        val.textContent = c.get();
      });
    } else if (c.type === 'note') {
      updaters.push(() => {
        const t = typeof c.get === 'function' ? c.get() : c.text;
        if (row.textContent !== t) row.textContent = t;
      });
    }
    if (c.visible) updaters.push(() => (row.hidden = !c.visible()));
    container.append(row);
  }

  const refresh = () => {
    for (const u of updaters) u();
  };
  refresh();
  return { refresh };
}
