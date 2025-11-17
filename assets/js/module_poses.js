// assets/js/module_poses.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

const POSE_MODEL_PATH = './modelo/tfjs_exercise_pose/model.json';

// Ajusta estos nombres al orden real de tu modelo de posturas
const EXERCISE_LABELS = ['Sentadilla', 'Flexión', 'Plancha', 'Dominada', 'Zancada', 'Burpee'];

export class PosesModule {
  constructor() {
    this.model = null;

    this.video = document.getElementById('poseVideo');
    this.canvas = document.getElementById('poseCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.repsEl = document.getElementById('poseReps');
    this.coachEl = document.getElementById('poseCoach');
    this.exerciseSel = document.getElementById('poseExercise');
    this.barsEl = document.getElementById('poseTop3');

    this.btnStart = document.getElementById('poseStart');
    this.btnStop = document.getElementById('poseStop');

    // Subida opcional de imagen (si más adelante añades <input id="poseImageUpload"> en el HTML)
    this.fileInput = document.getElementById('poseImageUpload');

    this.stream = null;
    this.loopId = null;
    this.lastTick = performance.now();

    this.lastHigh = null;
    this.repCount = 0;

    this._wired = false;

    this.about = `
      <h4>Gimnasio y calistenia</h4>
      <p>Modelo de reconocimiento de ejercicios convertido a TensorFlow.js.</p>
      <p>Clasifica la postura del cuerpo en varias categorías (sentadilla, flexión, etc.).</p>
      <p>El contador de repeticiones es aproximado: solo aumenta cuando la probabilidad de la clase elegida es alta.</p>
    `;
  }

  async mount() {
    if (!this._wired) {
      this._wireEvents();
      this._wired = true;
    }
    await this._ensureModel();
  }

  async unmount() {
    this._stopCamera();
  }

  _wireEvents() {
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => this.startCamera());
    }
    if (this.btnStop) {
      this.btnStop.addEventListener('click', () => this._stopCamera());
    }
    if (this.fileInput) {
      this.fileInput.addEventListener('change', e => this.handleFile(e));
    }
  }

  async _ensureModel() {
    if (this.model || !window.tf) return;
    try {
      setStatus('Cargando modelo de posturas...', 'info');
      this.model = await tf.loadLayersModel(POSE_MODEL_PATH);
      setStatus('Modelo de posturas listo. Inicia la cámara.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('No se pudo cargar el modelo de posturas', 'warn');
    }
  }

  async startCamera() {
    await this._ensureModel();
    if (!this.model || !navigator.mediaDevices) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      this.repCount = 0;
      this.lastHigh = null;
      if (this.repsEl) this.repsEl.textContent = '0';

      const loop = async () => {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        await this._predictFromCanvas(this.canvas);
        this.loopId = requestAnimationFrame(loop);
      };
      loop();

      setStatus('Cámara de posturas activa', 'info');
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara', 'error');
    }
  }

  _stopCamera() {
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loopId = null;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    setStatus('Cámara detenida', 'neutral');
  }

  async handleFile(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    await this._ensureModel();
    if (!this.model) return;

    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0, img.width, img.height);
      await this._predictFromCanvas(this.canvas);
    };
    img.src = URL.createObjectURL(file);
  }

  async _predictFromCanvas(canvas) {
    if (!this.model) return;

    const now = performance.now();
    const inputShape = this.model.inputs[0].shape; // [null, h, w, c]
    const [, h, w, c] = inputShape;

    let x = tf.browser.fromPixels(canvas);
    if (h && w) {
      x = tf.image.resizeBilinear(x, [h, w]);
    }
    if (c === 1) {
      x = tf.image.rgbToGrayscale(x);
    }

    x = x.expandDims(0).toFloat().div(255);

    const y = this.model.predict(x);
    const scores = Array.from(await y.data());
    tf.dispose([x, y]);

    const total = scores.reduce((a, b) => a + b, 0) || 1;
    const probs = scores.map(v => v / total);

    const items = probs.map((p, i) => ({
      label: EXERCISE_LABELS[i] || `Clase ${i + 1}`,
      prob: p
    })).sort((a, b) => b.prob - a.prob);

    const top1 = items[0];
    const latency = performance.now() - now;
    setLatency(latency);

    if (this.barsEl) {
      renderBars(this.barsEl, items);
    }

    // contador de repeticiones muy simple
    const target = this.exerciseSel ? this.exerciseSel.value : '';
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isTarget = norm(top1.label).includes(norm(target));

    if (isTarget && top1.prob > 0.8) {
      if (this.lastHigh !== target) {
        this.repCount += 1;
        if (this.repsEl) this.repsEl.textContent = String(this.repCount);
        this.lastHigh = target;
      }
    } else {
      this.lastHigh = null;
    }

    if (this.coachEl) {
      this.coachEl.textContent = `Ejercicio dominante: ${top1.label} (${Math.round(top1.prob * 100)}% de confianza).`;
    }

    setStatus(`Postura: predicción "${top1.label}"`, 'ok');
  }
}
