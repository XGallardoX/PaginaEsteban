import { setStatus, setLatency } from './main.js';

const AUDIO_MODEL_URL = "./models/audio/"; // carpeta donde pusiste model.json y metadata.json

export class AudioModule {
  constructor() {
    this.about = `
      Modelo de audio entrenado con Teachable Machine.
      Detecta distintos ritmos musicales a partir del micrófono o de un clip de prueba.
    `;

    this.recognizer = null;
    this.labels = [];
    this.listening = false;
    this.lastTick = performance.now();

    // refs DOM
    this.btnStart = null;
    this.btnStop = null;
    this.btnTestClip = null;
    this.sourceSelect = null;
    this.resultsPanel = null;
    this.confBar = null;
    this.audioPlayer = null;
  }

  // Se llama cuando entras a la pestaña "Sonidos"
  async mount() {
    // cache de elementos de la pestaña audio
    this.btnStart = document.getElementById("audio-start");
    this.btnStop = document.getElementById("audio-stop");
    this.btnTestClip = document.getElementById("audio-testclip");
    this.sourceSelect = document.getElementById("audio-source");
    this.resultsPanel = document.getElementById("audio-results");
    this.confBar = document.getElementById("audio-confidence");
    this.audioPlayer = document.getElementById("audio-player");

    // listeners
    this.btnStart?.addEventListener("click", this.handleStart);
    this.btnStop?.addEventListener("click", this.handleStop);
    this.btnTestClip?.addEventListener("click", this.handleTestClip);

    await this.ensureModelLoaded();
  }

  // Se llama cuando cambias a otra pestaña
  async unmount() {
    await this.stopListening();

    this.btnStart?.removeEventListener("click", this.handleStart);
    this.btnStop?.removeEventListener("click", this.handleStop);
    this.btnTestClip?.removeEventListener("click", this.handleTestClip);
  }

  // ============= handlers ligados =============
  handleStart = async () => {
    await this.startListening();
  };

  handleStop = async () => {
    await this.stopListening();
  };

  handleTestClip = () => {
    if (!this.audioPlayer) return;
    // cambia la ruta por algún mp3 que hayas puesto en /public/samples/
    this.audioPlayer.src = "./samples/ritmo_demo.mp3";
    this.audioPlayer.play();
    setStatus("Reproduciendo clip de prueba", "info");
  };

  // ============= modelo de audio =============

  async ensureModelLoaded() {
    try {
      if (!window.tmAudio) {
        setStatus("Falta la librería de audio (tmAudio). Revisa los <script> en index.html.", "error");
        return;
      }

      if (this.recognizer) return;

      setStatus("Cargando modelo de audio...", "info");

      const checkpointURL = AUDIO_MODEL_URL + "model.json";
      const metadataURL = AUDIO_MODEL_URL + "metadata.json";

      this.recognizer = await tmAudio.create(checkpointURL, metadataURL);
      this.labels = this.recognizer.wordLabels();

      setStatus("Modelo de audio listo. Haz clic en Grabar.", "success");
    } catch (err) {
      console.error(err);
      setStatus("Error cargando el modelo de audio", "error");
    }
  }

  async startListening() {
    try {
      await this.ensureModelLoaded();
      if (!this.recognizer || this.listening) return;

      this.listening = true;
      this.lastTick = performance.now();
      setStatus("Escuchando el micrófono...", "info");

      await this.recognizer.listen(this.handleResult, {
        includeSpectrogram: true,
        probabilityThreshold: 0.5,
        overlapFactor: 0.5
      });
    } catch (err) {
      console.error(err);
      setStatus("No se pudo acceder al micrófono", "error");
      this.listening = false;
    }
  }

  handleResult = (result) => {
    if (!this.resultsPanel) return;
    const now = performance.now();
    setLatency(now - this.lastTick);
    this.lastTick = now;

    const scores = result.scores;
    let bestIndex = 0;
    let bestScore = 0;

    scores.forEach((s, i) => {
      if (s > bestScore) {
        bestScore = s;
        bestIndex = i;
      }
    });

    const label = this.labels[bestIndex];
    const pct = Math.round(bestScore * 100);

    this.resultsPanel.innerHTML = `
      <h3 class="text-lg font-semibold mb-2">Resultados</h3>
      <p class="text-sm">Ritmo detectado: <strong>${label}</strong></p>
      <p class="text-sm">Confianza: <strong>${pct}%</strong></p>
    `;

    if (this.confBar) {
      // sirve si usas <progress> o <input type="range">
      this.confBar.value = pct;
    }
  };

  async stopListening() {
    if (!this.recognizer || !this.listening) return;
    try {
      await this.recognizer.stopListening();
    } catch (err) {
      console.error(err);
    } finally {
      this.listening = false;
      setStatus("Grabación detenida", "neutral");
    }
  }
}
