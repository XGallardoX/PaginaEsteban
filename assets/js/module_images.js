// assets/js/module_images.js
import { renderBars } from './ui.js';
import { ModelHelper } from './models.js';
import { setStatus, setLatency } from './main.js';

export class ImagesModule {
  constructor() {
    // Elementos de la UI (ya están en index.html)
    this.video = document.getElementById('imgVideo');
    this.canvas = document.getElementById('imgCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.badge = document.getElementById('imgBadge');
    this.top3El = document.getElementById('imgTop3');
    this.tooltip = document.getElementById('imgTooltip');

    this.sourceSel = document.getElementById('imgSource');
    this.fpsSel = document.getElementById('imgFps');
    this.upload = document.getElementById('imgUpload');

    this.btnStart = document.getElementById('imgStart');
    this.btnFreeze = document.getElementById('imgFreeze');

    // Ruta del modelo de Teachable Machine (relativa a index.html)
    // Carpeta que contiene model.json / metadata.json / weights.bin
    this.model = new ModelHelper('./modelo/tm-my-image-model', 'image');

    this.stream = null;
    this.running = false;
    this.frozen = false;

    // Texto que aparece en el panel “Acerca del modelo”
    this.about = `
      <h4>Clasificación de desechos</h4>
      <p>Clases del modelo: Carton, Vidrio, Metal, plastico, Papel, Basura.</p>
      <p>Puedes usar la webcam o subir una foto de un residuo.</p>
      <p>La predicción depende de la iluminación, el fondo y qué tan centrado esté el objeto.</p>
      <p>Tip: limpia y separa bien los materiales antes de reciclar.</p>
    `;
  }

  // Se llama cuando activas la pestaña de "Imágenes"
  async mount() {
    setStatus('Cargando modelo…');
    await this.model.load();
    setStatus('Modelo listo', 'ok');

    // Eventos de la UI
    this.btnStart.onclick = () => this.start();
    this.btnFreeze.onclick = () => {
      this.frozen = !this.frozen;
      this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
    };
    this.fpsSel.onchange = () => this.loop();
    this.sourceSel.onchange = () => this.switchSource();
    this.upload.onchange = (e) => this.onUpload(e);

    this.running = true;
    await this.switchSource();
  }

  // Se llama cuando cambias a otra pestaña (audio/posturas)
  async unmount() {
    this.running = false;
    this.stopStream();
  }

  async switchSource() {
    const src = this.sourceSel.value;
    if (src === 'webcam') {
      await this.start();
    } else {
      this.stopStream();
    }
  }

  // Subir imagen desde archivo
  async onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      const out = await this.model.inferImage(this.canvas);
      this.render(out);
    };
    img.src = URL.createObjectURL(file);
  }

  // Iniciar webcam
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 360;

      this.loop();
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara', 'warn');
    }
  }

  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  // Bucle de predicción (según FPS seleccionado)
  async loop() {
    const targetFps = parseInt(this.fpsSel.value || '15', 10);
    const interval = 1000 / targetFps;

    if (!this.running) return;

    const step = async () => {
      if (!this.running) return;

      const t0 = performance.now();

      if (this.stream && !this.frozen) {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      }

      const out = await this.model.inferImage(this.canvas);
      this.render(out);

      const elapsed = performance.now() - t0;
      const wait = Math.max(0, interval - elapsed);
      setTimeout(step, wait);
    };

    step();
  }

  // Actualizar UI: badge, barras, tooltip
  render({ top1, top3, latencyMs }) {
    // Badge principal
    this.badge.textContent = `${top1.label.toUpperCase()} ${(top1.prob * 100).toFixed(0)}%`;

    // Mapeo etiqueta del modelo -> clase CSS de color
    const colorMap = {
      Carton: 'carton',
      Vidrio: 'vidrio',
      Metal: 'metales',
      plastico: 'plastico',
      Papel: 'paper',
      Basura: 'metales' // re-usa color de metales (si quieres puedes crear un color específico)
    };

    // Top-3 con barras de probabilidad
    renderBars(this.top3El, top3, colorMap);

    // Latencia global
    setLatency(latencyMs);

    // Mensajes educativos por clase
    const tips = {
      Carton: 'Cartón: dóblalo para ahorrar espacio y evita que esté lleno de grasa.',
      Vidrio: 'Vidrio: enjuaga frascos y botellas, y evita romperlos para mayor seguridad.',
      Metal: 'Metal: latas limpias y, si puedes, aplastadas para ocupar menos.',
      plastico: 'Plástico: enjuaga botellas y separa etiquetas o tapas si tu ciudad lo pide.',
      Papel: 'Papel: evita que esté mojado o sucio; retira grapas y clips si es fácil.',
      Basura: 'Basura: cosas que no se pueden reciclar; intenta reducirla al máximo.'
    };

    this.tooltip.textContent =
      tips[top1.label] ||
      'Limpia y seca los residuos antes de separarlos para reciclar mejor.';
  }
}
