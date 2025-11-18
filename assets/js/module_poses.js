// assets/js/module_poses.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

const POSE_MODEL_PATH = "./modelo/tfjs_exercise_pose/model.json";

// Ajusta si los nombres reales son diferentes
// Etiquetas reales del modelo de posturas (4 clases)
const EXERCISE_LABELS = [
  'Curl bíceps barra',
  'Flexión (Push-up)',
  'Press de hombro',
  'Sentadilla'
];


export class PosesModule {
  constructor() {
    this.model = null;

    // UI (usar IDs que tienes en index.html)
    this.btnStart   = document.getElementById('btn-pose-iniciar');
    this.btnStop    = document.getElementById('btn-pose-detener');
    this.btnUpload  = document.getElementById('btn-pose-subir');
    this.fileInput  = document.getElementById('pose-image-input');

    this.video      = document.getElementById('poseVideo');
    this.canvas     = document.getElementById('pose-canvas');
    this.ctx        = this.canvas?.getContext('2d');

    this.resultsEl  = document.getElementById('pose-results');
    this.repsEl     = document.getElementById('poseReps');
    this.coachEl    = document.getElementById('poseCoach');
    this.exerciseSel= document.getElementById('poseExercise');
    this.statusEl   = document.getElementById('pose-status');

    this.about = `
      <p>Este módulo usa un modelo de deep learning entrenado sobre características
      de posturas (vector de 51 valores) para clasificar el tipo de ejercicio:
      Sentadilla, Flexión, Plancha, Dominada, Zancada o Burpee. Puedes usar la cámara
      o subir una imagen.</p>
    `;

    this._stream   = null;
    this._loopId   = null;
    this._wired    = false;
    this._lastTime = 0;
    this.fps       = 8;

    // Contador de repeticiones (muy simple, basado en p &gt; umbral)
    this._lastTop  = null;
    this._reps     = 0;
  }

  async mount() {
    await this._ensureModel();
    this._wireEvents();
    if (this.statusEl) this.statusEl.textContent = 'Listo para iniciar cámara o subir imagen.';
  }

  async unmount() {
    this._stopLoop();
    this._stopCamera();
  }

  // --------------------------------------------------------------
  // Carga del modelo
  // --------------------------------------------------------------
  async _ensureModel() {
    if (this.model) return;
    if (!window.tf) {
      setStatus('TensorFlow.js no está disponible para posturas', 'err');
      return;
    }

    try {
      setStatus('Cargando modelo de posturas…', 'info');
      this.model = await tf.loadLayersModel(POSE_MODEL_PATH);
      setStatus('Modelo de posturas listo ✔', 'ok');
      if (this.statusEl) this.statusEl.textContent = 'Modelo cargado.';
    } catch (err) {
      console.error('No se pudo cargar el modelo de posturas', err);
      setStatus('No se pudo cargar el modelo de posturas', 'err');
      if (this.statusEl) this.statusEl.textContent = 'No se pudo cargar el modelo de posturas.';
    }
  }

  // --------------------------------------------------------------
  // Eventos
  // --------------------------------------------------------------
  _wireEvents() {
    if (this._wired) return;
    this._wired = true;

    this.btnStart?.addEventListener('click', () => this.startCamera());
    this.btnStop?.addEventListener('click', () => {
      this._stopLoop();
      this._stopCamera();
    });

    this.btnUpload?.addEventListener('click', () => {
      this.fileInput?.click();
    });

    this.fileInput?.addEventListener('change', (e) => this._handleFile(e));
  }

  // --------------------------------------------------------------
  // Cámara
  // --------------------------------------------------------------
  async startCamera() {
    await this._ensureModel();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Tu navegador no soporta cámara (getUserMedia)', 'err');
      return;
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });

      if (this.video) {
        this.video.srcObject = this._stream;
        await this.video.play();
      }

      if (this.canvas && this.video) {
        this.canvas.width  = this.video.videoWidth  || 640;
        this.canvas.height = this.video.videoHeight || 360;
      }

      this._startLoop();
      setStatus('Cámara activa para posturas', 'info');
      if (this.statusEl) this.statusEl.textContent = 'Cámara activa.';
    } catch (err) {
      console.error('Error al iniciar cámara de posturas', err);
      setStatus('No se pudo acceder a la cámara de posturas', 'err');
    }
  }

  _stopCamera() {
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

    const frameInterval = 1000 / this.fps;

    const loop = async (now) => {
      this._loopId = requestAnimationFrame(loop);
      if (!this.video || !this.canvas || !this.ctx || !this.model) return;

      const delta = now - this._lastTime;
      if (delta < frameInterval) return;
      this._lastTime = now;

      // Dibujar frame actual
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Generar features y predecir
      const x = this._featuresFromCanvas();
      await this._runModel(x);
      x.dispose();
    };

    this._loopId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._loopId != null) {
      cancelAnimationFrame(this._loopId);
      this._loopId = null;
    }
  }

  // --------------------------------------------------------------
  // Subir imagen
  // --------------------------------------------------------------
  async _handleFile(e) {
    const file = e.target.files?.[0];
    if (!file || !this.canvas || !this.ctx) return;

    const img = new Image();
    img.onload = async () => {
      const maxW = 640;
      const scale = img.width > maxW ? maxW / img.width : 1;
      this.canvas.width  = img.width  * scale;
      this.canvas.height = img.height * scale;

      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);

      const x = this._featuresFromCanvas();
      await this._runModel(x);
      x.dispose();
    };
    img.onerror = () => {
      setStatus('No se pudo leer la imagen de postura', 'err');
    };

    img.src = URL.createObjectURL(file);
  }

  // --------------------------------------------------------------
  // Convertir imagen -> vector de 51 features (demo)
  // --------------------------------------------------------------
  _featuresFromCanvas() {
    // Esto NO calcula keypoints reales: es una aproximación para que el modelo reciba algo de tamaño 51.
    const W = this.canvas.width;
    const H = this.canvas.height;
    const imgData = this.ctx.getImageData(0, 0, W, H).data;

    const features = new Float32Array(51);

    // Dividimos la imagen en 51 "zonas" aproximadas y sacamos un brillo medio
    for (let i = 0; i < 51; i++) {
      const y = Math.floor((i / 51) * H);
      const x = Math.floor(((i * 7) % W));  // un poco "disperso"

      const idx = (y * W + x) * 4;
      const r = imgData[idx]   ?? 0;
      const g = imgData[idx+1] ?? 0;
      const b = imgData[idx+2] ?? 0;

      const gray = (r + g + b) / (3 * 255); // 0..1
      features[i] = gray;
    }

    // Tensor shape [1, 51]
    return tf.tensor2d(features, [1, 51]);
  }

  // --------------------------------------------------------------
  // Ejecutar modelo de posturas
  // --------------------------------------------------------------
  async _runModel(x) {
    if (!this.model) return;
    const t0 = performance.now();

    const y = this.model.predict(x);
    const probsArr = await y.data();
    if (y.dispose) y.dispose();

    const items = EXERCISE_LABELS.map((label, idx) => ({
      label,
      prob: probsArr[idx] ?? 0
    })).sort((a, b) => b.prob - a.prob);

    const t1 = performance.now();
    setLatency(t1 - t0);

    const top1 = items[0];
    if (!top1) return;

    // Barras
    if (this.resultsEl) {
      renderBars(this.resultsEl, items);
    }

    // Contador de reps super simple: si top1.prob > 0.7 y cambia de clase
    const TH = 0.7;
    if (top1.prob > TH) {
      if (this._lastTop && this._lastTop !== top1.label) {
        this._reps += 1;
      }
      this._lastTop = top1.label;
    }

    if (this.repsEl) {
      this.repsEl.textContent = String(this._reps);
    }

    if (this.coachEl) {
      this.coachEl.textContent = `Ejercicio dominante: ${top1.label} (${Math.round(top1.prob * 100)}%).`;
    }

    setStatus(`Postura: "${top1.label}"`, 'ok');
  }
}
