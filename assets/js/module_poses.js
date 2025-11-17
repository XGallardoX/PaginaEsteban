import { setStatus, setLatency } from './main.js';

const POSE_MODEL_URL = "./models/pose/"; // carpeta con model.json y metadata.json

export class PosesModule {
  constructor() {
    this.about = `
      Modelo de posturas entrenado con Teachable Machine.
      Detecta ejercicios de gimnasio / calistenia usando la cámara o imágenes estáticas.
    `;

    this.model = null;
    this.maxPredictions = 0;
    this.webcam = null;
    this.rafId = null;
    this.lastTick = performance.now();

    // refs DOM
    this.btnStart = null;
    this.btnStop = null;
    this.btnUpload = null;
    this.fileInput = null;
    this.canvas = null;
    this.ctx = null;
    this.resultsPanel = null;
    this.statusEl = null;
  }

  async mount() {
    // cache elementos
    this.btnStart = document.getElementById("btn-pose-iniciar");
    this.btnStop = document.getElementById("btn-pose-detener");
    this.btnUpload = document.getElementById("btn-pose-subir");
    this.fileInput = document.getElementById("pose-image-input");
    this.canvas = document.getElementById("pose-canvas");
    this.ctx = this.canvas?.getContext("2d") || null;
    this.resultsPanel = document.getElementById("pose-results");
    this.statusEl = document.getElementById("pose-status");

    // listeners
    this.btnStart?.addEventListener("click", this.handleStartCamera);
    this.btnStop?.addEventListener("click", this.handleStopCamera);
    this.btnUpload?.addEventListener("click", this.handleUploadClick);
    this.fileInput?.addEventListener("change", this.handleFileChange);

    await this.ensureModelLoaded();
  }

  async unmount() {
    this.stopCamera();

    this.btnStart?.removeEventListener("click", this.handleStartCamera);
    this.btnStop?.removeEventListener("click", this.handleStopCamera);
    this.btnUpload?.removeEventListener("click", this.handleUploadClick);
    this.fileInput?.removeEventListener("change", this.handleFileChange);
  }

  // helpers
  setLocalStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  // ========= carga de modelo =========
  async ensureModelLoaded() {
    try {
      if (!window.tmPose) {
        this.setLocalStatus("Falta la librería de posturas (tmPose). Revisa los <script> en index.html.");
        setStatus("Falta la librería de posturas (tmPose).", "error");
        return;
      }
      if (this.model) return;

      this.setLocalStatus("Cargando modelo de posturas...");
      setStatus("Cargando modelo de posturas...", "info");

      const modelURL = POSE_MODEL_URL + "model.json";
      const metadataURL = POSE_MODEL_URL + "metadata.json";

      this.model = await tmPose.load(modelURL, metadataURL);
      this.maxPredictions = this.model.getTotalClasses();

      this.setLocalStatus("Modelo de posturas listo. Puedes iniciar la cámara o subir una imagen.");
      setStatus("Modelo de posturas listo", "success");
    } catch (err) {
      console.error(err);
      this.setLocalStatus("No se pudo cargar el modelo de posturas.");
      setStatus("No se pudo cargar el modelo de posturas", "error");
    }
  }

  // ========= cámara =========
  handleStartCamera = async () => {
    await this.startCamera();
  };

  handleStopCamera = () => {
    this.stopCamera();
  };

  async startCamera() {
    try {
      await this.ensureModelLoaded();
      if (!this.model || !this.canvas) return;

      const size = 400;
      const flip = true;

      this.webcam = new tmPose.Webcam(size, size, flip);
      await this.webcam.setup();   // aquí pide permiso
      await this.webcam.play();

      this.canvas.width = size;
      this.canvas.height = size;

      this.setLocalStatus("Cámara activa. Realiza el ejercicio frente a la cámara.");
      setStatus("Cámara de posturas activa", "info");

      const loop = async () => {
        this.webcam.update();
        await this.predictFromSource(this.webcam.canvas);
        this.rafId = requestAnimationFrame(loop);
      };

      loop();
    } catch (err) {
      console.error(err);
      this.setLocalStatus("No se pudo acceder a la cámara.");
      setStatus("No se pudo acceder a la cámara", "error");
    }
  }

  stopCamera() {
    try {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.webcam) {
        this.webcam.stop();
        this.webcam = null;
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.setLocalStatus("Cámara detenida.");
    }
  }

  // ========= subida de imagen =========
  handleUploadClick = () => {
    this.fileInput?.click();
  };

  handleFileChange = async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      await this.ensureModelLoaded();
      if (!this.model || !this.canvas || !this.ctx) return;

      this.canvas.width = img.width;
      this.canvas.height = img.height;

      await this.predictFromSource(img);
      this.setLocalStatus("Imagen cargada. Resultados mostrados a la derecha.");
      setStatus("Postura analizada desde imagen", "info");
    };
    img.src = URL.createObjectURL(file);
  };

  // ========= predicción genérica =========
  async predictFromSource(source) {
    if (!this.model || !this.canvas || !this.ctx) return;

    const now = performance.now();
    setLatency(now - this.lastTick);
    this.lastTick = now;

    this.ctx.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);

    const { pose, posenetOutput } = await this.model.estimatePose(this.canvas);
    const prediction = await this.model.predict(posenetOutput);

    if (this.resultsPanel) {
      const lines = prediction
        .map(p => {
          const pct = Math.round(p.probability * 100);
          return `<li>${p.className}: <strong>${pct}%</strong></li>`;
        })
        .join("");

      this.resultsPanel.innerHTML = `
        <h3 class="text-lg font-semibold mb-2">Resultados</h3>
        <ul class="space-y-1">${lines}</ul>
      `;
    }

    // (si quieres pintar el esqueleto, aquí puedes usar tmPose.drawKeypoints/ drawSkeleton)
  }
}
