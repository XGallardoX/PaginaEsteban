// assets/js/module_images.js
import { renderBars } from './ui.js';
import { ModelHelper } from './models.js';
import { setStatus, setLatency } from './main.js';

export class ImagesModule {
  constructor() {
    // Elementos de la UI
    this.video = document.getElementById('imgVideo');
    this.canvas = document.getElementById('imgCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.badge = document.getElementById('imgBadge');
    this.barsEl = document.getElementById('imgTop3');
    this.tooltip = document.getElementById('imgTooltip');

    this.sourceSel = document.getElementById('imgSource');
    this.fpsSel = document.getElementById('imgFps');
    this.upload = document.getElementById('imgUpload');

    this.btnStart = document.getElementById('imgStart');
    this.btnFreeze = document.getElementById('imgFreeze');

    // ⚠️ Ruta real donde pusiste el export de Teachable Machine
    this.model = new ModelHelper('./modelo/tm-my-image-model', 'image');

    this.stream = null;
    this.running = false;
    this.frozen = false;
    this._wired = false;
    this._modelLoaded = false;

    this.about = `
      <h4>Clasificación de desechos</h4>
      <p>Clases del modelo: Carton, Vidrio, Metal, plastico, Papel, Basura.</p>
      <p>Puedes usar la webcam o subir una foto de un residuo.</p>
      <p>La predicción depende de la iluminación, el fondo y qué tan centrado esté el objeto.</p>
      <p>Tip: limpia y separa bien los materiales antes de reciclar.</p>
    `;
  }

  async mount() {
    // Cargar modelo una sola vez
    if (!this._modelLoaded) {
      setStatus('Cargando modelo…');
      await this.model.load();
      this._modelLoaded = true;

      if (this.model.model) {
        setStatus('Modelo listo', 'ok');
      } else {
        setStatus('Modelo en modo demo (predicciones aleatorias)', 'warn');
      }
    }

    // Conectar eventos una sola vez
    if (!this._wired) {
      this.btnStart.addEventListener('click', () => this.startWebcam());
      this.btnFreeze.addEventListener('click', () => {
        this.frozen = !this.frozen;
        this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
      });
      this.fpsSel.addEventListener('change', () => this.loop());
      this.sourceSel.addEventListener('change', () => this.onSourceChange());
      this.upload.addEventListener('change', (e) => this.onUpload(e));
      this._wired = true;
    }

    this.running = true;
    this.onSourceChange();
  }

  async unmount() {
    this.running = false;
    this.stopStream();
  }

  async onSourceChange() {
    if (this.sourceSel.value === 'webcam') {
      await this.startWebcam();
    } else {
      this.stopStream();
    }
  }

  async startWebcam() {
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

  // Subida de archivo
  async onUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      const result = await this.model.inferImage(this.canvas);
      this.render(result);
    };
    img.src = URL.createObjectURL(file);
  }

  // Bucle de predicción con webcam
  loop() {
    if (!this.running || this.sourceSel.value !== 'webcam') {
      return;
    }

    const targetFps = parseInt(this.fpsSel.value || '15', 10);
    const interval = 1000 / targetFps;

    const step = async () => {
      if (!this.running || this.sourceSel.value !== 'webcam') {
        return;
      }

      const t0 = performance.now();

      if (this.stream && !this.frozen) {
        this.ctx.drawImage(
          this.video,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
      }

      const result = await this.model.inferImage(this.canvas);
      this.render(result);

      const elapsed = performance.now() - t0;
      const wait = Math.max(0, interval - elapsed);
      setTimeout(step, wait);
    };

    step();
  }

  // Actualizar badge, barras (6 clases) y tooltip
  render({ top1, all, latencyMs }) {
    if (!top1) return;

    this.badge.textContent =
      `${top1.label.toUpperCase()} ${(top1.prob * 100).toFixed(0)}%`;

    const colorMap = {
      Carton: 'carton',
      Vidrio: 'vidrio',
      Metal: 'metales',
      plastico: 'plastico',
      Papel: 'paper',
      Basura: 'metales' // re-usa color de metales
    };

    // all = TODAS las clases ordenadas → se dibujan 6 barras
    renderBars(this.barsEl, all, colorMap);
    setLatency(latencyMs);

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
      'Limpia y seca los residuos antes de separarlos.';
  }
}
