// assets/js/ui.js

export function initTabs() {
  const buttons = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.panel'));

  function activate(name) {
    buttons.forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    panels.forEach(p =>
      p.classList.toggle('active', p.id === `panel-${name}`)
    );
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });

  return {
    onTabChange(handler) {
      buttons.forEach(btn => {
        btn.addEventListener('click', () => handler(btn.dataset.tab));
      });
    }
  };
}

export function setAbout(html) {
  document.getElementById('about-content').innerHTML = html;
}

// Dibuja tantas barras como items haya (para imágenes: 6 clases)
export function renderBars(el, items, colorMap = {}) {
  el.innerHTML = '';
  if (!items || !items.length) return;

  items.forEach(({ label, prob }) => {
    const row = document.createElement('div');
    row.className = 'bar';

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const pctEl = document.createElement('div');
    pctEl.className = 'pct';
    const pct = Math.round((prob || 0) * 100);
    pctEl.textContent = `${pct}%`;

    const track = document.createElement('div');
    track.className = 'track';

    const fill = document.createElement('div');
    fill.className = `fill ${colorMap[label] || ''}`.trim();
    fill.style.width = `${pct}%`;

    track.appendChild(fill);
    row.append(labelEl, pctEl, track);
    el.appendChild(row);
  });
}
