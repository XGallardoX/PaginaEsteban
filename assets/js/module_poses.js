// assets/js/module_poses.js
import { renderBars } from './ui.js';
import { setStatus, setLatency } from './main.js';

export class PosesModule {
  constructor() {
    this.canvas = document.getElementById('poseCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.badge = document.getElementById('poseBadge');
    this.barsEl = document.getElementById('poseTop3');
    this.tooltip = document.getElementById('poseTooltip');

    this.btnStart = document.getElementById('poseStart');
    this.btnFreeze = document.getElementById('poseFreeze');

    this.baseUrl = './modelo/tfjs_exercise_pose';

    this.model = null;      // tmPose model
    this.webcam = null;     // tmPose.Webcam
    this.isRunning = false;
    this.frozen = false;

    this._modelLoaded = false;
    this._wired = false;

    this.size = 320;        // tamaño del canvas cuadrado

    this.about = `
      <h4>Clasificación de posturas / ejercicios</h4>
      <p>Modelo entrenado con diferentes posturas corporales (ejercicios).</p>
      <p>Colócate frente a la cámara y realiza las posturas para ver cómo cambia la predicción.</p>
      <p>Consejo: deja espacio suficiente para que se vea todo tu cuerpo y una buena iluminación.</p>
    `;
  }

  async mount() {
    // Comprobar librería
    if (!window.tmPose) {
      setStatus('Falta la librería de posturas (tmPose). Revisa los &lt;script&gt; en index.html.', 'warn');
      return;
    }

    // Cargar modelo (solo la primera vez)
    if (!this._modelLoaded) {
      setStatus('Cargando modelo de posturas…');
      try {
        const modelURL = `${this.baseUrl}/model.json`;
        const metadataURL = `${this.baseUrl}/metadata.json`;
        this.model = await tmPose.load(modelURL, metadataURL);
        this._modelLoaded = true;
        setStatus('Modelo de posturas listo', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('No se pudo cargar el modelo de posturas', 'warn');
        return;
      }
    }

    // Eventos
    if (!this._wired) {
      if (this.btnStart) {
        this.btnStart.addEventListener('click', () => this.startWebcam());
      }
      if (this.btnFreeze) {
        this.btnFreeze.addEventListener('click', () => {
          this.frozen = !this.frozen;
          this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
        });
      }
      this._wired = true;
    }

    this.isRunning = false;
  }

  async unmount() {
    this.isRunning = false;
    await this.stopWebcam();
  }

  async startWebcam() {
    if (!this.model || !window.tmPose) return;

    try {
      setStatus('Activando cámara para posturas…');

      const flip = true;
      this.webcam = new tmPose.Webcam(this.size, this.size, flip);
      await this.webcam.setup();
      await this.webcam.play();

      if (this.canvas) {
        this.canvas.width = this.size;
        this.canvas.height = this.size;
      }

      this.isRunning = true;
      this.loop();
      setStatus('Cámara lista, muévete frente a la pantalla.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara para posturas', 'warn');
      this.isRunning = false;
    }
  }

  async stopWebcam() {
    if (this.webcam && this.webcam.stop) {
      try {
        await this.webcam.stop();
      } catch (e) {
        console.warn('Error al detener webcam de pose', e);
      }
    }
    this.webcam = null;
  }

  async loop() {
    if (!this.isRunning || !this.webcam || !this.model) return;

    this.webcam.update();

    const t0 = performance.now();
    const { pose, posenetOutput } = await this.model.estimatePose(this.webcam.canvas);
    const prediction = await this.model.predict(posenetOutput); // array {className, probability}
    const t1 = performance.now();

    // Convertir a items ordenados
    const items = prediction
      .map(p => ({ label: p.className, prob: p.probability }))
      .sort((a, b) => b.prob - a.prob);

    const top1 = items[0];
    const latency = t1 - t0;

    this.drawPose(pose);
    this.render({ top1, all: items, latencyMs: latency });

    if (this.isRunning) {
      window.requestAnimationFrame(() => this.loop());
    }
  }

  drawPose(pose) {
    if (!this.canvas || !this.ctx || !this.webcam || !this.webcam.canvas) return;

    this.ctx.drawImage(this.webcam.canvas, 0, 0);
    if (pose) {
      const minPartConfidence = 0.5;
      tmPose.drawKeypoints(pose.keypoints, minPartConfidence, this.ctx);
      tmPose.drawSkeleton(pose.keypoints, minPartConfidence, this.ctx);
    }
  }

  render({ top1, all, latencyMs }) {
    if (!top1) return;

    if (this.badge) {
      this.badge.textContent =
        `${top1.label.toUpperCase()} ${(top1.prob * 100).toFixed(0)}%`;
    }

    const colorMap = {
      sentadilla: 'pose-sentadilla',
      flexion: 'pose-flexion',
      plancha: 'pose-plancha',
      // etc. (si tus etiquetas son distintas, igual se mostrarán sin color especial)
    };

    if (this.barsEl) {
      renderBars(this.barsEl, all, colorMap);
    }

    if (typeof latencyMs === 'number') {
      setLatency(latencyMs);
    }

    if (this.tooltip) {
      this.tooltip.textContent =
        `Postura detectada: "${top1.label}". Ajusta tu posición y distancia a la cámara para mejores resultados.`;
    }
  }
}
