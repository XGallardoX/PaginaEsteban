// assets/js/module_audio.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

const AUDIO_MODEL_PATH = "./modelo/gtzan_5genres_tfjs/model.json";

// OJO: pon aquí los géneros en el orden exacto de entrenamiento
// Etiquetas reales del modelo de audio (GTZAN 5 géneros)
const GENRE_LABELS = ['disco', 'jazz', 'pop', 'reggae', 'rock'];


export class AudioModule {
  constructor() {
    this.model = null;

    // UI: usa los IDs que tienes en index.html
    this.btnStart   = document.getElementById('audio-start');
    this.btnStop    = document.getElementById('audio-stop');
    this.btnTest    = document.getElementById('audio-testclip');
    this.sourceSel  = document.getElementById('audio-source');
    this.upload     = document.getElementById('audio-upload');

    this.canvas     = document.getElementById('audCanvas');
    this.ctx        = this.canvas?.getContext('2d');
    this.player     = document.getElementById('audio-player');

    this.confBar    = document.getElementById('audio-confidence');
    this.resultsEl  = document.getElementById('audio-results');

    // Estado
    this.about = `
      <p>Este módulo toma un fragmento corto de audio (micrófono o archivo)
      y lo pasa a un modelo de deep learning entrenado con espectrogramas tipo GTZAN.
      Muestra la clase top-1 y las probabilidades en barras.</p>
    `;

    this._audioCtx  = null;
    this._stream    = null;
    this._recorder  = null;
    this._chunks    = [];
    this._wired     = false;
  }

  async mount() {
    await this._ensureModel();
    this._wireEvents();
  }

  async unmount() {
    this._stopRecording();
  }

  // --------------------------------------------------------------
  // Carga del modelo
  // --------------------------------------------------------------
  async _ensureModel() {
    if (this.model) return;
    if (!window.tf) {
      setStatus('TensorFlow.js no está disponible para audio', 'err');
      return;
    }

    try {
      setStatus('Cargando modelo de audio…', 'info');
      this.model = await tf.loadLayersModel(AUDIO_MODEL_PATH);
      setStatus('Modelo de audio listo ✔', 'ok');
    } catch (err) {
      console.error('No se pudo cargar el modelo de audio', err);
      setStatus('No se pudo cargar el modelo de audio', 'err');
    }
  }

  // --------------------------------------------------------------
  // Eventos
  // --------------------------------------------------------------
  _wireEvents() {
    if (this._wired) return;
    this._wired = true;

    this.btnStart?.addEventListener('click', () => {
      if (this.sourceSel?.value === 'mic') {
        this.startFromMic();
      }
    });

    this.btnStop?.addEventListener('click', () => this._stopRecording());

    // Botón "Clip de prueba" -> simplemente abre el selector de archivos
    this.btnTest?.addEventListener('click', () => {
      this.upload?.click();
    });

    this.upload?.addEventListener('change', (e) => this._handleFile(e));
  }

  // --------------------------------------------------------------
  // Grabación desde micrófono
  // --------------------------------------------------------------
  async startFromMic() {
    await this._ensureModel();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Tu navegador no soporta micrófono (getUserMedia)', 'err');
      return;
    }

    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      this._chunks   = [];
      this._recorder = new MediaRecorder(this._stream);

      this._recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._chunks.push(e.data);
      };

      this._recorder.onstop = async () => {
        const blob = new Blob(this._chunks, { type: 'audio/webm' });
        this._cleanupStream();
        await this._processBlob(blob);
      };

      this._recorder.start();
      setStatus('Grabando 3 segundos…', 'info');

      // Grabar ~3 segundos y parar
      setTimeout(() => {
        if (this._recorder && this._recorder.state === 'recording') {
          this._recorder.stop();
        }
      }, 3000);
    } catch (err) {
      console.error('Error al iniciar grabación', err);
      setStatus('No se pudo acceder al micrófono', 'err');
    }
  }

  _stopRecording() {
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.stop();
    } else {
      this._cleanupStream();
    }
  }

  _cleanupStream() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
  }

  // --------------------------------------------------------------
  // Subir archivo de audio
  // --------------------------------------------------------------
  async _handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = file;
    await this._processBlob(blob);
  }

  // --------------------------------------------------------------
  // Procesar blob -> AudioBuffer -> Tensor -> Modelo
  // --------------------------------------------------------------
  async _processBlob(blob) {
    try {
      this._audioCtx = this._audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await this._audioCtx.decodeAudioData(arrayBuf);

      // Reproducir en el <audio>
      if (this.player) {
        this.player.src = URL.createObjectURL(blob);
        this.player.play().catch(() => {});
      }

      // Extraer características y predecir
      const input = this._makeInputFromAudioBuffer(audioBuf); // Tensor4D [1,646,64,1]
      await this._runModel(input);
      input.dispose();
    } catch (err) {
      console.error('Error procesando audio', err);
      setStatus('No se pudo procesar el audio', 'err');
    }
  }

  _makeInputFromAudioBuffer(audioBuffer) {
    const data = audioBuffer.getChannelData(0); // primer canal
    const targetH = 646;
    const targetW = 64;
    const targetLen = targetH * targetW;

    const out = new Float32Array(targetLen);

    const step = data.length / targetLen;
    for (let i = 0; i < targetLen; i++) {
      const idx = Math.floor(i * step);
      let v = data[idx] || 0;
      // Normalizar -1..1 -> 0..1
      v = (v + 1) / 2;
      out[i] = v;
    }

    // Tensor shape [1, 646, 64, 1]
    return tf.tensor4d(out, [1, targetH, targetW, 1]);
  }

  async _runModel(x) {
    if (!this.model) return;

    const t0 = performance.now();
    const y = this.model.predict(x);
    const probsArr = await y.data();
    if (y.dispose) y.dispose();

    // Asegurar longitud igual a GENRE_LABELS
    const items = GENRE_LABELS.map((label, idx) => ({
      label,
      prob: probsArr[idx] ?? 0
    })).sort((a, b) => b.prob - a.prob);

    const t1 = performance.now();
    setLatency(t1 - t0);

    const top1 = items[0];

    // Progreso (0-100)
    if (this.confBar && top1) {
      this.confBar.value = Math.round((top1.prob || 0) * 100);
    }

    // Barras de resultados
    if (this.resultsEl) {
      renderBars(this.resultsEl, items);
    }

    setStatus(`Audio: "${top1.label}"`, 'ok');
  }
}
