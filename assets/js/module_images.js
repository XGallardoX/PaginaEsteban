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

    this.sourceSel = document.getElementById('imgSource'); // webcam / upload
    this.fpsSel = document.getElementById('imgFps');
    this.upload = document.getElementById('imgUpload');     // <input type="file">

    this.btnStart = document.getElementById('imgStart');    // "Iniciar cámara"
    this.btnFreeze = document.getElementById('imgFreeze');  // "Congelar"

    // Ruta REAL del modelo de Teachable Machine (carpeta con model.json, metadata.json, weights.bin)
    this.model = new ModelHelper('./modelo/tm-my-image-model', 'image');

    this.stream = null;
    this.isLooping = false;
    this.frozen = false;

    this._modelLoaded = false;
    this._wired = false;

    this.about = `
      <h4>Clasificación de desechos</h4>
      <p>Clases del modelo: Carton, Vidrio, Metal, plastico, Papel, Basura.</p>
      <p>Puedes usar la webcam o subir una foto de un residuo.</p>
      <p>La predicción depende de la iluminación, el fondo y qué tan centrado esté el objeto.</p>
      <p>Tip: limpia y separa bien los materiales antes de reciclar.</p>
    `;
  }

  // Se llama al entrar a la pestaña de "Imágenes"
  async mount() {
    // 1) Cargar modelo (solo una vez)
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

    // 2) Conectar eventos (solo una vez)
    if (!this._wired) {
      // Botón iniciar cámara
      this.btnStart.addEventListener('click', () => {
        this.sourceSel.value = 'webcam';
        this.startWebcam();
      });

      // Botón congelar
      this.btnFreeze.addEventListener('click', () => {
        this.frozen = !this.frozen;
        this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
      });

      // Cambio de FPS
      this.fpsSel.addEventListener('change', () => {
        if (this.sourceSel.value === 'webcam' && this.stream) {
          // Reiniciar loop con nuevo FPS
          this.stopLoop();
          this.startLoop();
        }
      });

      // Subir imagen
      this.upload.addEventListener('change', (e) => this.handleUpload(e));

      // Cambio de fuente (webcam / upload)
      this.sourceSel.addEventListener('change', () => {
        if (this.sourceSel.value === 'webcam') {
          this.startWebcam();
        } else {
          this.stopWebcam();
        }
      });

      this._wired = true;
    }
  }

  async unmount() {
    // Al salir de la pestaña: detener cámara y loop
    this.stopLoop();
    this.stopWebcam();
  }

  // ---------- WEBCAM ----------
  async startWebcam() {
    try {
      this.sourceSel.value = 'webcam';
      this.isLooping = true;

      // Si ya hay un stream activo, no volvemos a pedir permisos
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        this.video.srcObject = this.stream;
        await this.video.play();
      }

      // Ajustar tamaño del canvas a la cámara
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

      this.startLoop();
      setStatus('Cámara activa para clasificación de desechos', 'info');
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara', 'error');
    }
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.srcObject = null;
    }
    this.isLooping = false;
  }

  startLoop() {
    if (this.isLooping) return;
    this.isLooping = true;
    const fps = parseInt(this.fpsSel.value, 10) || 15;
    const frameInterval = 1000 / fps;

    let lastTime = performance.now();

    const loop = async () => {
      if (!this.isLooping || !this.stream) return;

      const now = performance.now();
      const delta = now - lastTime;

      if (!this.frozen && delta >= frameInterval) {
        lastTime = now;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        await this.runInference();
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  stopLoop() {
    this.isLooping = false;
  }

  // ---------- SUBIR IMAGEN ----------
  async handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    this.sourceSel.value = 'upload';
    this.stopWebcam();

    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      await this.runInference();
    };
    img.src = URL.createObjectURL(file);
  }

  // ---------- INFERENCIA ----------
  async runInference() {
    if (!this.model) return;
    const { top1, top3, all, latencyMs } = await this.model.inferImage(this.canvas);

    setLatency(latencyMs);

    // Badge top-1
    if (this.badge && top1) {
      this.badge.textContent = `${top1.label} (${Math.round(top1.prob * 100)}%)`;
    }

    // Barras top-3 (o todas las clases)
    if (this.barsEl) {
      const colorMap = {
        Carton: 'c-carton',
        Vidrio: 'c-vidrio',
        Metal: 'c-metal',
        plastico: 'c-plastico',
        Papel: 'c-papel',
        Basura: 'c-basura'
      };
      renderBars(this.barsEl, all, colorMap);
    }

    // Tooltip con consejo por clase
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
