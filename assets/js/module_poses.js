// js/module_poses.js
import { setStatus, setLatency } from './main.js';

const POSE_MODEL_PATH = "./modelo/tfjs_exercise_pose/model.json";

// AJUSTA ESTAS ETIQUETAS AL ORDEN REAL DE TU MODELO
const EXERCISE_LABELS = [
  "Sentadilla",
  "Flexión",
  "Plancha",
  "Dominada",
  "Zancada",
  "Burpee"
];

export class PosesModule {
  constructor() {
    this.about = `
      Modelo de reconocimiento de ejercicios convertido a TensorFlow.js.
      Detecta distintos movimientos de gimnasio y calistenia desde la cámara o una imagen cargada.
    `;

    this.model = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.resultsPanel = null;
    this.statusEl = null;
    this.repsEl = null;

    this.btnStart = null;
    this.btnStop = null;
    this.btnUpload = null;
    this.fileInput = null;

    this.stream = null;
    this.loopId = null;
    this.lastTick = performance.now();

    this.lastLabel = null;
    this.repCount = 0;
  }

  async mount() {
    this.video = document.getElementById("poseVideo");
    this.canvas = document.getElementById("pose-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.resultsPanel = document.getElementById("pose-results");
    this.statusEl = document.getElementById("pose-status");
    this.repsEl = document.getElementById("poseReps");

    this.btnStart = document.getElementById("btn-pose-iniciar");
    this.btnStop = document.getElementById("btn-pose-detener");
    this.btnUpload = document.getElementById("btn-pose-subir");
    this.fileInput = document.getElementById("pose-image-input");

    this.btnStart?.addEventListener("click", this.handleStart);
    this.btnStop?.addEventListener("click", this.handleStop);
    this.btnUpload?.addEventListener("click", this.handleUpload);
    this.fileInput?.addEventListener("change", this.handleFileChange);

    await this.ensureModelLoaded();
  }

  async unmount() {
    this.stopCamera();
    this.btnStart?.removeEventListener("click", this.handleStart);
    this.btnStop?.removeEventListener("click", this.handleStop);
    this.btnUpload?.removeEventListener("click", this.handleUpload);
    this.fileInput?.removeEventListener("change", this.handleFileChange);
  }

  setLocalStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  async ensureModelLoaded() {
    if (this.model) return;
    try {
      this.setLocalStatus("Cargando modelo de posturas...");
      setStatus("Cargando modelo de posturas...", "info");
      this.model = await tf.loadLayersModel(POSE_MODEL_PATH);
      this.setLocalStatus("Modelo de posturas listo. Puedes iniciar la cámara o subir una imagen.");
      setStatus("Modelo de posturas listo", "success");
    } catch (err) {
      console.error(err);
      this.setLocalStatus("No se pudo cargar el modelo de posturas.");
      setStatus("No se pudo cargar el modelo de posturas", "error");
    }
  }

  handleStart = async () => {
    await this.startCamera();
  };

  handleStop = () => {
    this.stopCamera();
  };

  handleUpload = () => {
    this.fileInput?.click();
  };

  handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0, img.width, img.height);
      await this.predict(this.canvas);
      this.setLocalStatus("Imagen cargada. Resultados mostrados a la derecha.");
    };
    img.src = URL.createObjectURL(file);
  };

  async startCamera() {
    try {
      await this.ensureModelLoaded();
      if (!this.model) return;

      this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      this.repCount = 0;
      this.lastLabel = null;
      if (this.repsEl) this.repsEl.textContent = "0";

      const loop = async () => {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        await this.predict(this.canvas);
        this.loopId = requestAnimationFrame(loop);
      };
      loop();

      this.setLocalStatus("Cámara activa. Realiza el ejercicio frente a la cámara.");
      setStatus("Cámara de posturas activa", "info");
    } catch (err) {
      console.error(err);
      this.setLocalStatus("No se pudo acceder a la cámara.");
      setStatus("No se pudo acceder a la cámara", "error");
    }
  }

  stopCamera() {
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loopId = null;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.setLocalStatus("Cámara detenida.");
  }

  async predict(sourceCanvas) {
    if (!this.model) return;

    const now = performance.now();
    setLatency(now - this.lastTick);
    this.lastTick = now;

    const inputShape = this.model.inputs[0].shape; // [null, h, w, c]
    const [ , h, w, c ] = inputShape;
    let x = tf.browser.fromPixels(sourceCanvas);

    if (h && w) {
      x = tf.image.resizeBilinear(x, [h, w]);
    }
    if (c === 1) {
      x = tf.image.rgbToGrayscale(x);
    }

    x = x.expandDims(0).toFloat().div(255);

    const y = this.model.predict(x);
    const data = await y.data();

    tf.dispose([x, y]);

    let bestIdx = 0;
    let bestVal = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i] > bestVal) {
        bestVal = data[i];
        bestIdx = i;
      }
    }

    const pct = Math.round(bestVal * 100);
    const label = EXERCISE_LABELS[bestIdx] || `Clase ${bestIdx + 1}`;

    if (this.resultsPanel) {
      this.resultsPanel.innerHTML = data.map((v, i) => {
        const p = Math.round(v * 100);
        const name = EXERCISE_LABELS[i] || `Clase ${i + 1}`;
        return `
          <div class="bar-row">
            <span>${name}</span>
            <div class="bar"><span style="width:${p}%"></span></div>
            <span class="val">${p}%</span>
          </div>
        `;
      }).join("");
    }

    // contador de reps MUY simple: cuando cambia a la clase seleccionada y confianza alta
    const exerciseSelect = document.getElementById("poseExercise");
    const targetValue = exerciseSelect?.value || "";

    // normalizamos para comparar (minusculas sin acentos)
    const normalize = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (normalize(label).includes(normalize(targetValue)) && pct > 80) {
      if (this.lastLabel !== targetValue) {
        this.repCount += 1;
        if (this.repsEl) this.repsEl.textContent = String(this.repCount);
        this.lastLabel = targetValue;
      }
    } else {
      this.lastLabel = null;
    }
  }
}
