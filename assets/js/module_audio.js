// assets/js/module_audio.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

export class AudioModule {
  constructor() {
    // Elementos de la UI (si alguno no existe, simplemente será null)
    this.badge = document.getElementById('audBadge');
    this.barsEl = document.getElementById('audTop3');
    this.tooltip = document.getElementById('audTooltip');

    this.sourceSel = document.getElementById('audSource'); // Mic / Archivo
    this.btnStart = document.getElementById('audStart');
    this.btnStop = document.getElementById('audStop');
    this.upload = document.getElementById('audUpload');

    // Ruta del modelo de audio (carpeta con model.json / metadata.json / weights.bin)
    this.baseUrl = './modelo/gtzan_5genres_tfjs';

    this.model = null;       // tmAudio model
    this.mic = null;         // tmAudio.WebAudioMicrophone
    this.isListening = false;
    this._modelLoaded = false;
    this._wired = false;

    this.about = `
      <h4>Clasificación de sonidos</h4>
      <p>Modelo entrenado con diferentes géneros o tipos de sonido.</p>
      <p>Puedes usar el micrófono para que la IA adivine qué tipo de sonido está escuchando.</p>
      <p>Consejo: evita ruidos de fondo fuertes y habla/canta/clicas cerca del micrófono.</p>
    `;
  }

  async mount() {
    // 1) Comprobar que la librería de audio está cargada
    if (!window.tmAudio) {
      setStatus('Falta la librería de audio (tmAudio). Revisa los &lt;script&gt; en index.html.', 'warn');
      return;
    }

    // 2) Cargar modelo (solo la primera vez)
    if (!this._modelLoaded) {
      setStatus('Cargando modelo de audio…');

      try {
        const modelURL = `${this.baseUrl}/model.json`;
        const metadataURL = `${this.baseUrl}/metadata.json`;
        this.model = await tmAudio.load(modelURL, metadataURL);
        this._modelLoaded = true;
        setStatus('Modelo de audio listo', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('No se pudo cargar el modelo de audio', 'warn');
        return;
      }
    }

    // 3) Conectar eventos (solo una vez)
    if (!this._wired) {
      if (this.btnStart) {
        this.btnStart.addEventListener('click', () => this.startMic());
      }
      if (this.btnStop) {
        this.btnStop.addEventListener('click', () => this.stopMic());
      }
      if (this.sourceSel) {
        this.sourceSel.addEventListener('change', () => {
          if (this.sourceSel.value === 'mic') {
            this.startMic();
          } else {
            this.stopMic();
            setStatus('Sube un archivo de audio (función aún básica).', 'info');
          }
        });
      }
      if (this.upload) {
        // Por ahora solo mostramos un mensaje para archivo, sin procesamiento real
        this.upload.addEventListener('change', () => {
          setStatus('La clasificación de archivos de audio se añadirá más adelante. Usa el micrófono 🙂', 'info');
        });
      }
      this._wired = true;
    }
  }

  async unmount() {
    await this.stopMic();
  }

  // --------- Micrófono ---------

  async startMic() {
    if (!this.model) return;
    if (!window.tmAudio) return;

    try {
      setStatus('Configurando micrófono…');

      // Marcar fuente en el selector (si existe)
      if (this.sourceSel) {
        this.sourceSel.value = 'mic';
      }

      // Si ya hay micrófono escuchando, no lo duplicamos
      if (!this.mic) {
        this.mic = new tmAudio.WebAudioMicrophone();
        await this.mic.setup();
      }

      await this.mic.play();
      this.isListening = true;
      setStatus('Escuchando… haz un sonido cerca del micrófono.', 'ok');

      // Arrancar bucle
      this.loop();
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder al micrófono', 'warn');
      this.isListening = false;
    }
  }

  async stopMic() {
    this.isListening = false;
    if (this.mic && this.mic.stop) {
      try {
        await this.mic.stop();
      } catch (e) {
        console.warn('Error al detener el micrófono', e);
      }
    }
    setStatus('Micrófono detenido', 'info');
  }

  async loop() {
    if (!this.isListening || !this.model || !this.mic) return;

    const t0 = performance.now();
    const prediction = await this.model.predict(this.mic); // array {className, probability}
    const t1 = performance.now();

    // Convertir a formato común { label, prob }
    const items = prediction
      .map(p => ({ label: p.className, prob: p.probability }))
      .sort((a, b) => b.prob - a.prob);

    const top1 = items[0];
    const latency = t1 - t0;

    this.render({ top1, all: items, latencyMs: latency });

    // Seguir escuchando
    if (this.isListening) {
      window.requestAnimationFrame(() => this.loop());
    }
  }

  // --------- UI ---------

  render({ top1, all, latencyMs }) {
    if (!top1) return;

    // Badge principal
    if (this.badge) {
      this.badge.textContent =
        `${top1.label.toUpperCase()} ${(top1.prob * 100).toFixed(0)}%`;
    }

    // Colores por etiqueta (puedes personalizarlos en tu CSS)
    const colorMap = {
      rock: 'rock',
      pop: 'pop',
      jazz: 'jazz',
      metal: 'metal',
      classical: 'classical',
      // si tus clases son otras, se mostrarán igual, solo sin color especial
    };

    // Barras para todas las clases
    if (this.barsEl) {
      renderBars(this.barsEl, all, colorMap);
    }

    if (typeof latencyMs === 'number') {
      setLatency(latencyMs);
    }

    if (this.tooltip) {
      this.tooltip.textContent =
        `Clase con mayor probabilidad: "${top1.label}". El modelo sigue escuchando en tiempo real.`;
    }
  }
}
