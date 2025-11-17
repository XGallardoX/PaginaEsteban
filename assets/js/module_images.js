// js/module_images.js
import { setStatus, setLatency } from './main.js';

const IMAGE_MODEL_URL = "./modelo/tm-my-image-model/"; // NUEVA RUTA

export class ImagesModule {
  constructor() {
    this.about = `
      Modelo de clasificación de desechos entrenado con Teachable Machine.
      Clases: papel, cartón, plástico, vidrio, metales.
    `;

    this.model = null;
    this.maxPredictions = 0;

    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.badge = null;
    this.top3El = null;

    this.sourceSelect = null;
    this.fileInput = null;
    this.fpsSelect = null;

    this.streaming = false;
    this.lastTick = performance.now();
    this.loopId = null;
  }

  async mount() {
    this.video = document.getElementById("imgVideo");
    this.canvas = document.getElementById("imgCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.badge = document.getElementById("imgBadge");
    this.top3El = document.getElementById("imgTop3");
    this.sourceSelect = document.getElementById("imgSource");
    this.fileInput = document.getElementById("imgUpload");
    this.fpsSelect = document.getElementById("imgFps");

    document.getElementById("imgStart")?.addEventListener("click", this.handleStart);
    document.getElementById("imgFreeze")?.addEventListener("click", this.handleFreeze);
    this.fileInput?.addEventListener("change", this.handleFile);

    await this.ensureModel();
  }

  async unmount() {
    this.stopLoop();
    this.stopStream();

    document.getElementById("imgStart")?.removeEventListener("click", this.handleStart);
    document.getElementById("imgFreeze")?.removeEventListener("click", this.handleFreeze);
    this.fileInput?.removeEventListener("change", this.handleFile);
  }

  handleStart = async () => {
    if (this.sourceSelect.value === "webcam") {
      await this.startWebcam();
    } else {
      this.fileInput?.click();
    }
  };

  handleFreeze = () => {
    this.stopLoop();
    setStatus("Imagen congelada", "neutral");
  };

  handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0, img.width, img.height);
      await this.predict(this.canvas);
    };
    img.src = URL.createObjectURL(file);
  };

  async ensureModel() {
    if (this.model) return;
    try {
      setStatus("Cargando modelo de imágenes...", "info");
      const modelURL = IMAGE_MODEL_URL + "model.json";
      const metadataURL = IMAGE_MODEL_URL + "metadata.json";
      this.model = await tmImage.load(modelURL, metadataURL);
      this.maxPredictions = this.model.getTotalClasses();
      setStatus("Modelo de imágenes listo", "success");
    } catch (err) {
      console.error(err);
      setStatus("Error cargando modelo de imágenes", "error");
    }
  }

  async startWebcam() {
    try {
      await this.ensureModel();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video.srcObject = stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      const fps = Number(this.fpsSelect.value || 15);
      const interval = 1000 / fps;

      const loop = async () => {
        const now = performance.now();
        if (now - this.lastTick >= interval) {
          this.lastTick = now;
          this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
          await this.predict(this.canvas);
          setLatency(interval);
        }
        this.loopId = requestAnimationFrame(loop);
      };
      loop();
      setStatus("Webcam activa para clasificación de desechos", "info");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo acceder a la cámara", "error");
    }
  }

  stopLoop() {
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loopId = null;
  }

  stopStream() {
    if (this.video?.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
  }

  async predict(sourceCanvas) {
    if (!this.model) return;
    const prediction = await this.model.predict(sourceCanvas);

    const sorted = prediction
      .map(p => ({ className: p.className, probability: p.probability }))
      .sort((a, b) => b.probability - a.probability);

    const top1 = sorted[0];
    if (this.badge) {
      this.badge.textContent = `${top1.className} (${Math.round(top1.probability * 100)}%)`;
    }

    if (this.top3El) {
      this.top3El.innerHTML = sorted.slice(0, 3).map(p => {
        const pct = Math.round(p.probability * 100);
        return `
          <div class="bar-row">
            <span>${p.className}</span>
            <div class="bar"><span style="width:${pct}%"></span></div>
            <span class="val">${pct}%</span>
          </div>
        `;
      }).join("");
    }
  }
}
