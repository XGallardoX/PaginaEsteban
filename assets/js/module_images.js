// assets/js/module_images.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

// Carpeta donde está tu modelo de Teachable Machine de imágenes
const TM_IMAGE_URL = "./modelo/tm-my-image-model/";

export class ImagesModule {
  constructor() {
    // Elementos de la UI
    this.video    = document.getElementById('imgVideo');
    this.canvas   = document.getElementById('imgCanvas');
    this.ctx      = this.canvas?.getContext('2d');

    this.badge    = document.getElementById('imgBadge');
    this.barsEl   = document.getElementById('imgTop3');
    this.tooltip  = document.getElementById('imgTooltip');

    this.sourceSel = document.getElementById('imgSource'); // webcam / upload
    this.fpsSel    = document.getElementById('imgFps');
    this.upload    = document.getElementById('imgUpload');

    this.btnStart  = document.getElementById('imgStart');
    this.btnFreeze = document.getElementById('imgFreeze');

    // Estado
    this.about = `
      <p>Este modelo fue entrenado con Teachable Machine para clasificar residuos en seis categorías:
      <strong>Cartón, Vidrio, Metal, Plástico, Papel y Basura</strong>. Usa la cámara o una imagen subida
      para identificar la clase y muestra las probabilidades en barras de colores.</p>
    `;

    this.tmModel   = null;
    this.labels    = [];
    this._wired    = false;
    this._stream   = null;
    this._loopId   = null;
    this._lastTime = 0;
    this.fps       = 12;
    this.frozen    = false;
    this._predicting = false;
  }

  // ------------------------------------------------------------------
  // Ciclo de vida de la pestaña
  // ------------------------------------------------------------------
  async mount() {
    await this._ensureModel();
    this._wireEvents();

    // Ajustar FPS inicial
    if (this.fpsSel) {
      const v = parseInt(this.fpsSel.value, 10);
      if (!isNaN(v)) this.fps = v;
    }

    // Por defecto dejamos webcam seleccionada
    if (this.sourceSel) {
      this.sourceSel.value = 'webcam';
    }

    // Intentar iniciar cámara automáticamente
    this.startWebcam().catch(() => {
      // Si el navegador no deja, el usuario puede pulsar el botón
    });
  }

  async unmount() {
    // Detener loop y cámara al cambiar de pestaña
    this._stopLoop();
    this._stopWebcam();
  }

  // ------------------------------------------------------------------
  // Carga del modelo TM de imágenes
  // ------------------------------------------------------------------
  async _ensureModel() {
    if (this.tmModel) return;
    if (!window.tmImage) {
      console.error('tmImage no está disponible. Revisa el <script> de Teachable Machine en index.html.');
      setStatus('No se encontró la librería tmImage', 'err');
      return;
    }

    try {
      setStatus('Cargando modelo de imágenes…', 'info');
      const modelURL    = TM_IMAGE_URL + "model.json";
      const metadataURL = TM_IMAGE_URL + "metadata.json";

      this.tmModel = await window.tmImage.load(modelURL, metadataURL);
      this.labels  = this.tmModel.getClassLabels?.() || [];

      setStatus('Modelo de imágenes listo ✔', 'ok');
    } catch (err) {
      console.error('Error cargando modelo de imágenes', err);
      setStatus('No se pudo cargar el modelo de imágenes', 'err');
    }
  }

  // ------------------------------------------------------------------
  // Eventos de UI
  // ------------------------------------------------------------------
  _wireEvents() {
    if (this._wired) return;
    this._wired = true;

    // Botón iniciar cámara
    this.btnStart?.addEventListener('click', () => {
      if (this.sourceSel) this.sourceSel.value = 'webcam';
      this.startWebcam();
    });

    // Botón congelar
    this.btnFreeze?.addEventListener('click', () => {
      this.frozen = !this.frozen;
      this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
    });

    // Input de archivo
    this.upload?.addEventListener('change', (e) => this._handleUpload(e));

    // Select fuente (webcam / upload)
    this.sourceSel?.addEventListener('change', () => {
      if (this.sourceSel.value === 'webcam') {
        this.startWebcam();
      } else {
        this._stopWebcam();
      }
    });

    // Select FPS
    this.fpsSel?.addEventListener('change', () => {
      const v = parseInt(this.fpsSel.value, 10);
      if (!isNaN(v)) this.fps = v;
    });
  }

  // ------------------------------------------------------------------
  // Webcam
  // ------------------------------------------------------------------
  async startWebcam() {
    await this._ensureModel();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Tu navegador no soporta cámara (getUserMedia)', 'err');
      return;
    }

    try {
      if (!this._stream) {
        this._stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (this.video) {
          this.video.srcObject = this._stream;
          await this.video.play();
        }
      }

      // Ajustar canvas
      if (this.video && this.canvas && this.ctx) {
        this.canvas.width  = this.video.videoWidth  || 640;
        this.canvas.height = this.video.videoHeight || 480;
      }

      setStatus('Cámara activa para clasificación de desechos', 'info');
      this._startLoop();
    } catch (err) {
      console.error('Error al iniciar webcam', err);
      setStatus('No se pudo acceder a la cámara', 'err');
    }
  }

  _stopWebcam() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  _startLoop() {
    if (this._loopId != null) cancelAnimationFrame(this._loopId);
    this._lastTime = performance.now();

    const frameInterval = 1000 / (this.fps || 12);

    const loop = async (now) => {
      this._loopId = requestAnimationFrame(loop);
      if (!this.video || !this.canvas || !this.ctx || !this.tmModel) return;
      if (this.frozen) return;

      const delta = now - this._lastTime;
      if (delta < frameInterval) return;
      this._lastTime = now;

      // Dibujar frame actual en el canvas
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Lanzar predicción (evitando solapes)
      if (!this._predicting) {
        this._predicting = true;
        try {
          await this._runPrediction(this.canvas);
        } finally {
          this._predicting = false;
        }
      }
    };

    this._loopId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._loopId != null) {
      cancelAnimationFrame(this._loopId);
      this._loopId = null;
    }
  }

  // ------------------------------------------------------------------
  // Subir imagen
  // ------------------------------------------------------------------
  async _handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !this.canvas || !this.ctx) return;

    if (this.sourceSel) this.sourceSel.value = 'upload';

    const img = new Image();
    img.onload = async () => {
      // Ajustar canvas al tamaño de la imagen, pero con límite razonable
      const maxW = 640;
      const scale = img.width > maxW ? maxW / img.width : 1;
      this.canvas.width  = img.width  * scale;
      this.canvas.height = img.height * scale;

      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      await this._runPrediction(this.canvas);
    };
    img.onerror = () => {
      setStatus('No se pudo leer la imagen subida', 'err');
    };

    const url = URL.createObjectURL(file);
    img.src = url;
  }

  // ------------------------------------------------------------------
  // Predicción con Teachable Machine
  // ------------------------------------------------------------------
  async _runPrediction(imageLike) {
    if (!this.tmModel) return;

    const t0 = performance.now();
    const preds = await this.tmModel.predict(imageLike);

    // preds: [{className, probability}, ...]
    const items = preds
      .map(p => ({ label: p.className, prob: p.probability }))
      .sort((a, b) => b.prob - a.prob);

    const t1 = performance.now();
    setLatency(t1 - t0);

    if (!items.length) return;
    const top1 = items[0];

    // Badge
    if (this.badge) {
      this.badge.textContent = `${top1.label} (${Math.round(top1.prob * 100)}%)`;
    }

    // Barras coloreadas
    if (this.barsEl) {
      const colorMap = {
        Carton:   'c-carton',
        Vidrio:   'c-vidrio',
        Metal:    'c-metal',
        plastico: 'c-plastico',
        Papel:    'c-papel',
        Basura:   'c-basura'
      };
      renderBars(this.barsEl, items, colorMap);
    }

    // Tooltip educativo
    if (this.tooltip) {
      const tips = {
        Carton:   'Cartón: dóblalo para ahorrar espacio y evita que esté lleno de grasa.',
        Vidrio:   'Vidrio: enjuaga frascos y botellas, y evita romperlos para mayor seguridad.',
        Metal:    'Metal: latas limpias y, si puedes, aplastadas para ocupar menos.',
        plastico: 'Plástico: enjuaga botellas y separa etiquetas o tapas si tu ciudad lo pide.',
        Papel:    'Papel: evita que esté mojado o sucio; retira grapas y clips si es fácil.',
        Basura:   'Basura: cosas que no se pueden reciclar; intenta reducirla al máximo.'
      };
      this.tooltip.textContent = tips[top1.label] || 'Limpia y seca los residuos antes de separarlos.';
    }

    setStatus(`Imagen: "${top1.label}"`, 'ok');
  }
}
