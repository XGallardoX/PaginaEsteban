// assets/js/module_poses.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

const POSE_MODEL_URL = './modelo/tfjs_exercise_pose/model.json';

// Ajusta al orden real de tu modelo
const EXERCISE_LABELS = [
  'Sentadilla',
  'Flexión',
  'Plancha',
  'Dominada',
  'Zancada',
  'Burpee'
];

export class PosesModule {
  constructor() {
    this.model = null;
    this.isGraph = false;

    this.video = document.getElementById('poseVideo');
    this.canvas = document.getElementById('poseCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.repsEl = document.getElementById('poseReps');
    this.coachEl = document.getElementById('poseCoach');
    this.exerciseSel = document.getElementById('poseExercise');
    this.barsEl = document.getElementById('poseTop3');

    this.btnStart = document.getElementById('poseStart');
    this.btnStop = document.getElementById('poseStop');

    this.stream = null;
    this.loopId = null;
    this.lastTick = performance.now();
    this.repCount = 0;
    this.lastHigh = null;

    this._wired = false;

    this.about = `
      <h4>Gimnasio y calistenia</h4>
      <p>Modelo de reconocimiento de ejercicios convertido a TensorFlow.js (carpeta <code>tfjs_exercise_pose</code>).</p>
      <p>Predice la clase de ejercicio a partir de la imagen de la cámara y cuenta repeticiones de forma aproximada.</p>
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
    this.btnStart?.addEventListener('click', () => this.startCamera());
    this.btnStop?.addEventListener('click', () => this._stopCamera());
  }

  async _ensureModel() {
    if (this.model || !window.tf) return;

    try {
      setStatus('Cargando modelo de posturas (Layers)...', 'info');
      this.model = await tf.loadLayersModel(POSE_MODEL_URL);
      this.isGraph = false;
      setStatus('Modelo de posturas listo (Layers)', 'ok');
    } catch (errLayers) {
      console.warn('loadLayersModel falló, probando GraphModel', errLayers);
      try {
        this.model = await tf.loadGraphModel(POSE_MODEL_URL);
        this.isGraph = true;
        setStatus('Modelo de posturas listo (GraphModel)', 'ok');
      } catch (errGraph) {
        console.error('No se pudo cargar el modelo de posturas', errGraph);
        setStatus('No se pudo cargar el modelo de posturas', 'warn');
      }
    }
  }

  async startCamera() {
    await this._ensureModel();
    if (!this.model) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara (NotReadableError: verifica permisos y que no esté en uso).', 'error');
      return;
    }

    try {
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

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
      setStatus('Error iniciando la cámara para posturas', 'error');
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

  async _predictFromCanvas(canvas) {
    if (!this.model) return;

    const now = performance.now();

    const inputShape = this.model.inputs
      ? this.model.inputs[0].shape
      : this.model.modelSignature['inputs'][0].tensorShape.dim.map(d => d.size);

    const [, h, w, c] = inputShape;

    let x = tf.browser.fromPixels(canvas);
    if (h && w) {
      x = tf.image.resizeBilinear(x, [h, w]);
    }
    if (c === 1) {
      x = tf.image.rgbToGrayscale(x);
    }
    x = x.expandDims(0).toFloat().div(255);

    let y;
    try {
      if (typeof this.model.executeAsync === 'function' && this.isGraph) {
        y = await this.model.executeAsync(x);
      } else {
        y = this.model.predict(x);
      }
    } catch (err) {
      console.error('Error en predict/executeAsync de posturas', err);
      tf.dispose([x]);
      return;
    }

    let scoresTensor;
    if (Array.isArray(y)) {
      scoresTensor = y[0];
    } else if (y instanceof tf.Tensor) {
      scoresTensor = y;
    } else {
      const firstKey = Object.keys(y)[0];
      scoresTensor = y[firstKey];
    }

    const scores = Array.from(await scoresTensor.data());
    tf.dispose([x, scoresTensor, y]);

    const total = scores.reduce((a, b) => a + b, 0) || 1;
    const probs = scores.map(v => v / total);

    const items = probs
      .map((p, i) => ({
        label: EXERCISE_LABELS[i] || `Clase ${i + 1}`,
        prob: p
      }))
      .sort((a, b) => b.prob - a.prob);

    const top1 = items[0];
    const latency = performance.now() - now;
    setLatency(latency);

    if (this.barsEl) renderBars(this.barsEl, items);

    // Contador de reps muy simple
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
      this.coachEl.textContent = `Ejercicio dominante: ${top1.label} (${Math.round(top1.prob * 100)}%).`;
    }

    setStatus(`Postura: "${top1.label}"`, 'ok');
  }
}
