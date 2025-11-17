// assets/js/module_audio.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

const AUDIO_MODEL_URL = './modelo/gtzan_5genres_tfjs/model.json';

// Ajusta estos nombres al orden real de tu modelo
const GENRE_LABELS = ['Género 1', 'Género 2', 'Género 3', 'Género 4', 'Género 5'];

export class AudioModule {
  constructor() {
    this.model = null;
    this.isGraph = false;

    // UI
    this.btnStart = document.getElementById('audStart');
    this.btnStop = document.getElementById('audStop');
    this.upload = document.getElementById('audUpload');
    this.sourceSel = document.getElementById('audSource');

    this.canvas = document.getElementById('audCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.player = document.getElementById('audPlayer');
    this.confBar = document.getElementById('audConfidence');
    this.confVal = document.getElementById('audConfidenceVal');
    this.bpmEl = document.getElementById('audBpm');
    this.stabilityEl = document.getElementById('audStability');
    this.barsEl = document.getElementById('audTop3');

    // audio
    this.audioContext = null;
    this.mediaStream = null;
    this.recorder = null;
    this.chunks = [];

    this.lastTick = performance.now();
    this._wired = false;

    this.about = `
      <h4>Ritmos musicales</h4>
      <p>Modelo de audio convertido a TensorFlow.js (carpeta <code>gtzan_5genres_tfjs</code>).</p>
      <p>Graba unos segundos desde el micrófono y los clasifica en 5 categorías (ajusta GENRE_LABELS).</p>
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
    await this._stopRecording();
  }

  _wireEvents() {
    this.btnStart?.addEventListener('click', () => this.startFromMic());
    this.btnStop?.addEventListener('click', () => this._stopRecording());
    this.upload?.addEventListener('change', e => this.handleFile(e));
  }

  async _ensureModel() {
    if (this.model || !window.tf) return;

    try {
      setStatus('Cargando modelo de audio (Layers)...', 'info');
      this.model = await tf.loadLayersModel(AUDIO_MODEL_URL);
      this.isGraph = false;
      setStatus('Modelo de audio listo (Layers)', 'ok');
    } catch (errLayers) {
      console.warn('loadLayersModel falló, probando GraphModel', errLayers);
      try {
        this.model = await tf.loadGraphModel(AUDIO_MODEL_URL);
        this.isGraph = true;
        setStatus('Modelo de audio listo (GraphModel)', 'ok');
      } catch (errGraph) {
        console.error('No se pudo cargar el modelo de audio', errGraph);
        setStatus('Error cargando el modelo de audio', 'warn');
      }
    }
  }

  async startFromMic() {
    await this._ensureModel();
    if (!this.model) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recorder = new MediaRecorder(this.mediaStream);

      this.chunks = [];
      this.recorder.ondataavailable = e => this.chunks.push(e.data);
      this.recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        if (this.player) this.player.src = URL.createObjectURL(blob);

        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        await this._runInference(audioBuffer);
      };

      this.recorder.start();
      setStatus('Grabando 3 segundos de audio...', 'info');
      setTimeout(() => {
        if (this.recorder && this.recorder.state === 'recording') {
          this.recorder.stop();
        }
      }, 3000);
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder al micrófono', 'error');
    }
  }

  async _stopRecording() {
    try {
      if (this.recorder && this.recorder.state === 'recording') {
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
      setStatus('Grabación detenida', 'neutral');
    }
  }

  async handleFile(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    await this._ensureModel();
    if (!this.model) return;

    const arrayBuffer = await file.arrayBuffer();
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    if (this.player) this.player.src = URL.createObjectURL(file);
    await this._runInference(audioBuffer);
  }

  async _runInference(audioBuffer) {
    if (!this.model) return;

    const now = performance.now();

    // 1) convertir audio a vector del tamaño de entrada
    const inputShape = this.model.inputs
      ? this.model.inputs[0].shape
      : this.model.modelSignature['inputs'][0].tensorShape.dim.map(d => d.size);

    const featureSize = inputShape.slice(1).reduce((a, b) => a * b, 1);
    const data = audioBuffer.getChannelData(0);
    const features = new Float32Array(featureSize);

    for (let i = 0; i < featureSize; i++) {
      const idx = Math.floor((i * data.length) / featureSize);
      features[i] = data[idx] || 0;
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

    // 2) inferencia (Layers o Graph)
    let y;
    try {
      if (typeof this.model.executeAsync === 'function' && this.isGraph) {
        y = await this.model.executeAsync(x);
      } else {
        y = this.model.predict(x);
      }
    } catch (err) {
      console.error('Error en predict/executeAsync', err);
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

    // 3) normalizar y mostrar
    const total = scores.reduce((a, b) => a + b, 0) || 1;
    const probs = scores.map(v => v / total);

    const items = probs
      .map((p, i) => ({
        label: GENRE_LABELS[i] || `Clase ${i + 1}`,
        prob: p
      }))
      .sort((a, b) => b.prob - a.prob);

    const top1 = items[0];
    const latency = performance.now() - now;
    setLatency(latency);

    if (this.barsEl) renderBars(this.barsEl, items);
    if (this.confBar) this.confBar.value = top1.prob ?? 0;
    if (this.confVal) this.confVal.textContent = `${Math.round((top1.prob ?? 0) * 100)}%`;
    if (this.bpmEl) this.bpmEl.textContent = 'BPM: —';
    if (this.stabilityEl) this.stabilityEl.textContent = 'Ritmo: —';

    setStatus(`Audio: "${top1.label}"`, 'ok');
  }
}
