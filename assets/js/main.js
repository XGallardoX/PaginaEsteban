import { initTabs, setAbout } from './ui.js';
import { ImagesModule } from './module_images.js';
import { AudioModule } from './module_audio.js';
import { PosesModule } from './module_poses.js';

const stateBadge = document.getElementById('status-badge');
const latencyEl = document.getElementById('latency');
const darkToggle = document.getElementById('darkToggle');

darkToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const pressed = darkToggle.getAttribute('aria-pressed') === 'true';
  darkToggle.setAttribute('aria-pressed', String(!pressed));
});

export function setStatus(text, tone='neutral'){
  stateBadge.textContent = text;
  stateBadge.className = 'badge ' + tone;
}
export function setLatency(ms){
  latencyEl.textContent = `Latencia: ${Math.round(ms)} ms`;
}

window.addEventListener('keydown', (e) => {
  if (['1','2','3'].includes(e.key)){
    const map = { '1':'images', '2':'audio', '3':'poses' };
    document.querySelector(`[data-tab="${map[e.key]}"]`)?.click();
  }
});

const { onTabChange } = initTabs();
const modules = { images: new ImagesModule(), audio: new AudioModule(), poses: new PosesModule() };

onTabChange(async (name) => {
  for (const [k,mod] of Object.entries(modules)){
    if (k === name) { await mod.mount(); setAbout(mod.about); } else { await mod.unmount(); }
  }
});
document.querySelector('[data-tab="images"]').click();