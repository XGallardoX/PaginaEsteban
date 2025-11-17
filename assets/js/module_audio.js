// js/module_audio.js
import { setStatus, setLatency } from './main.js';

const AUDIO_MODEL_PATH = "./modelo/gtzan_5genres_tfjs/model.json";

// AJUSTA ESTOS NOMBRES AL ORDEN DE TUS CLASES
const GENRE_LABELS = ["Clase 1", "Clase 2", "Clase 3", "Clase 4", "Clase 5"];

export class AudioModule {
  constructor() {
    this.about = `
      Modelo de audio basado en GTZAN convertido a TensorFlow.js.
      Clasifica fragmentos de audio en 5 géneros (ajusta los nombres en GENRE_LABELS).
    `;

    this.model = null;
    this.listening = false;

    this.btnStart = null;
    this.btnStop = null;
    this.btnTestClip = null;
    this.sourceSelect = null;
    this.resultsPanel = null;
    this.confBar = null;
    this.audioPlayer = null;

    this.audioContext = null;
    this.mediaStream = null;
    this.recorder = null;
    this.chunks = [];
    this.lastTick = performance.now();
  }

  async mount() {
    this.btnStart = document.getElementById("audio-start");
    this.btnStop = document.getElementById("audio-stop");
    this.btnTestClip = document.getElementById("audio-testclip");
    this.sourceSelect = document.getElementById("audio-source");
    this.resultsPanel = document.getElementById("audio-results");
    this.confBar = document.getElementById("audio-confidence");
    this.audioPlayer = document.getElementById("audio-player");

    this.btnStart?.addEventListener("click", this.handleStart);
    this.btnStop?.addEventListener("click", this.handleStop);
    this.btnTestClip?.addEventListener("click", this.handleTestClip);

    await this.ensureModelLoaded();
  }

  async unmount() {
    await this.stopListening();
    this.btnStart?.removeEventListener("click", this.handleStart);
    this.btnStop?.removeEventListener("click", this.handleStop);
    this.btnTestClip?.removeEventListener("click", this.handleTestClip);
  }

  handleStart = async () => {
    await this.startListening();
  };

  handleStop = async () => {
    await this.stopListening();
  };

  handleTestClip = () => {
    if (!this.audioPlayer) return;
    this.audioPlayer.src = "./samples/ritmo_demo.mp3"; // pon aquí un mp3 de prueba
    this.audioPlayer.play();
    setStatus("Reproduciendo clip de prueba", "info");
  };

  async ensureModelLoaded() {
    if (this.model) return;
    try {
      setStatus("Cargando modelo de audio...", "info");
      this.model = await tf.loadLayersModel(AUDIO_MODEL_PATH);
      setStatus("Modelo de audio listo. Haz clic en Grabar.", "success");
    } catch (err) {
      console.error(err);
      setStatus("Error cargando el modelo de audio", "error");
    }
  }

  async startListening() {
    try {
      await this.ensureModelLoaded();
      if (!this.model || this.listening) return;

      this.listening = true;
      this.lastTick = performance.now();

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recorder = new MediaRecorder(this.mediaStream);

      this.chunks = [];
      this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
      this.recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        await this.runInference(audioBuffer);
      };

      // grabamos 3 segundos y paramos automáticamente
      this.recorder.start();
      setStatus("Grabando 3 segundos de audio...", "info");
      setTimeout(() => {
        if (this.recorder && this.recorder.state === "recording") {
          this.recorder.stop();
        }
      }, 3000);
    } catch (err) {
      console.error(err);
      setStatus("No se pudo acceder al micrófono", "error");
      this.listening = false;
    }
  }

  async stopListening() {
    try {
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.stop();
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
      }
      if (this.audioContext) {
        await this.audioContext.close();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.recorder = null;
      this.mediaStream = null;
      this.audioContext = null;
      this.listening = false;
      setStatus("Grabación detenida", "neutral");
    }
  }

  async runInference(audioBuffer) {
    if (!this.model) return;

    const now = performance.now();
    setLatency(now - this.lastTick);
    this.lastTick = now;

    const channelData = audioBuffer.getChannelData(0); // mono
    const inputShape = this.model.inputs[0].shape; // [null, ...]
    const featureSize = inputShape.slice(1).reduce((a, b) => a * b, 1);

    // re-muestrear o recortar/llenar al tamaño requerido
    const features = new Float32Array(featureSize);
    for (let i = 0; i < featureSize; i++) {
      const idx = Math.floor(i * channelData.length / featureSize);
      features[i] = channelData[idx] || 0;
    }

    let x;
    if (inputShape.length === 2) {
      x = tf.tensor2d(features, [1, featureSize]);
    } else if (inputShape.length === 3) {
      x = tf.tensor3d(features, [1, inputShape[1], inputShape[2]]);
    } else if (inputShape.length === 4) {
      x = tf.tensor4d(features, [1, inputShape[1], inputShape[2], inputShape[3]]);
    } else {
      x = tf.tensor2d(features, [1, featureSize]);
    }

    const y = this.model.predict(x);
    const data = (await y.data());
    tf.dispose([x, y]);

    // buscar top-1
    let bestIdx = 0;
    let bestVal = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i] > bestVal) {
        bestVal = data[i];
        bestIdx = i;
      }
    }

    const pct = Math.round(bestVal * 100);
    const label = GENRE_LABELS[bestIdx] || `Clase ${bestIdx + 1}`;

    if (this.resultsPanel) {
      this.resultsPanel.innerHTML = `
        <h3 class="text-lg font-semibold mb-2">Resultados</h3>
        <p class="text-sm">Predicción: <strong>${label}</strong></p>
        <p class="text-sm">Confianza: <strong>${pct}%</strong></p>
      `;
    }

    if (this.confBar) {
      this.confBar.value = pct;
    }

    setStatus("Predicción de audio lista", "success");
  }
}
