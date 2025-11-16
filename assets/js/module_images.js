// assets/js/module_images.js
import { renderBars } from './ui.js';
import { ModelHelper } from './models.js';
import { setStatus, setLatency } from './main.js';

export class ImagesModule {
  constructor() {
    // Elementos de la UI
    this.video = document.getElementById('imgVideo');
    this.canvas = document.getElementById('imgCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.badge = document.getElementById('imgBadge');
    this.barsEl = document.getElementById('imgTop3');
    this.tooltip = document.getElementById('imgTooltip');

    this.sourceSel = document.getElementById('imgSource'); // webcam / upload
    this.fpsSel = document.getElementById('imgFps');
    this.upload = document.getElementById('imgUpload');     // <input type="file">

    this.btnStart = document.getElementById('imgStart');    // "Iniciar cámara"
    this.btnFreeze = document.getElementById('imgFreeze');  // "Congelar"

    // Ruta REAL del modelo de Teachable Machine (carpeta con model.json, metadata.json, weights.bin)
    this.model = new ModelHelper('./modelo/tm-my-image-model', 'image');

    this.stream = null;
    this.isLooping = false;
    this.frozen = false;

    this._modelLoaded = false;
    this._wired = false;

    this.about = `
      <h4>Clasificación de desechos</h4>
      <p>Clases del modelo: Carton, Vidrio, Metal, plastico, Papel, Basura.</p>
      <p>Puedes usar la webcam o subir una foto de un residuo.</p>
      <p>La predicción depende de la iluminación, el fondo y qué tan centrado esté el objeto.</p>
      <p>Tip: limpia y separa bien los materiales antes de reciclar.</p>
    `;
  }

  // Se llama al entrar a la pestaña de "Imágenes"
  async mount() {
    // 1) Cargar modelo (solo una vez)
    if (!this._modelLoaded) {
      setStatus('Cargando modelo…');
      await this.model.load();
      this._modelLoaded = true;

      if (this.model.model) {
        setStatus('Modelo listo', 'ok');
      } else {
        setStatus('Modelo en modo demo (predicciones aleatorias)', 'warn');
      }
    }

    // 2) Conectar eventos (solo una vez)
    if (!this._wired) {
      // Botón iniciar cámara
      this.btnStart.addEventListener('click', () => {
        this.sourceSel.value = 'webcam';
        this.startWebcam();
      });

      // Botón congelar
      this.btnFreeze.addEventListener('click', () => {
        this.frozen = !this.frozen;
        this.btnFreeze.textContent = this.frozen ? '▶️ Reanudar' : '⏸️ Congelar';
      });

      // Cambio de FPS
      this.fpsSel.addEventListener('change', () => {
        if (this.isLooping) {
          // Reinicia el bucle con el nuevo FPS
          this.isLooping = false;
          this.startWebcam();
        }
      });

      // Cambio de fuente (webcam / archivo)
      this.sourceSel.addEventListener('change', () => {
        if (this.sourceSel.value === 'webcam') {
          this.startWebcam();
        } else {
          // Archivo: detenemos la cámara y esperamos a que suban imagen
          this.stopStream();
          this.isLooping = false;
        }
      });

      // Subida de archivo
      this.upload.addEventListener('change', (e) => this.onUpload(e));

      this._wired = true;
    }

    // Al entrar al tab, la cámara NO se inicia sola; esperan a que el usuario la encienda
    this.isLooping = false;
  }

  // Se llama al salir de la pestaña
  async unmount() {
    this.isLooping = false;
    this.stopStream();
  }

  // Iniciar webcam y bucle de predicción
  async startWebcam() {
    try {
      // Marcar fuente como webcam
      this.sourceSel.value = 'webcam';
      this.isLooping = true;

      // Si ya hay un stream activo, no volvemos a pedir permisos
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        this.video.srcObject = this.stream;
        await this.video.play();
      }

      // Ajustar tamaño del canvas a la cámara
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 360;

      this.loop();
    } catch (err) {
      console.error(err);
      setStatus('No se pudo acceder a la cámara', 'warn');
      this.isLooping = false;
    }
  }

  // Detener webcam
  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  // Subida de imagen desde archivo
  async onUpload(event) {
    const input = event.target;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];

    // Forzar modo "Archivo"
    this.sourceSel.value = 'upload';
    this.isLooping = false;
    this.stopStream();

    const img = new Image();
    img.onload = async () => {
      // Ajustar canvas a la imagen subida
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      // Ejecutar predicción sobre el canvas
      const result = await this.model.inferImage(this.canvas);
      this.render(result);
      setStatus('Imagen analizada', 'ok');
    };
    img.onerror = () => {
      setStatus('No se pudo leer la imagen', 'warn');
    };

    img.src = URL.createObjectURL(file);
  }

  // Bucle de predicción cuando está activa la webcam
  loop() {
    if (!this.isLooping) return;

    const targetFps = parseInt(this.fpsSel.value || '15', 10);
    const interval = 1000 / targetFps;

    const step = async () => {
      if (!this.isLooping) return;
      if (!this.stream || this.sourceSel.value !== 'webcam') {
        this.isLooping = false;
        return;
      }

      const t0 = performance.now();

      if (!this.frozen) {
        this.ctx.drawImage(
          this.video,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        );
      }

      const result = await this.model.inferImage(this.canvas);
      this.render(result);

      const elapsed = performance.now() - t0;
      const wait = Math.max(0, interval - elapsed);
      setTimeout(step, wait);
    };

    step();
  }

  // Actualizar badge, barras (6 clases) y tooltip
  render({ top1, all, latencyMs }) {
    if (!top1) return;

    // Badge principal
    this.badge.textContent =
      `${top1.label.toUpperCase()} ${(top1.prob * 100).toFixed(0)}%`;

    // Mapa etiqueta -> clase de color CSS
    const colorMap = {
      Carton: 'carton',
      Vidrio: 'vidrio',
      Metal: 'metales',
      plastico: 'plastico',
      Papel: 'paper',
      Basura: 'metales' // puedes cambiarlo por un color específico si quieres
    };

    // all = TODAS las clases ordenadas por probabilidad
    const items = all && all.length ? all : [top1];
    renderBars(this.barsEl, items, colorMap);

    setLatency(latencyMs);

    // Tips educativos según la clase top-1
    const tips = {
      Carton: 'Cartón: dóblalo para ahorrar espacio y evita que esté lleno de grasa.',
      Vidrio: 'Vidrio: enjuaga frascos y botellas, y evita romperlos para mayor seguridad.',
      Metal: 'Metal: latas limpias y, si puedes, aplastadas para ocupar menos.',
      plastico: 'Plástico: enjuaga botellas y separa etiquetas o tapas si tu ciudad lo pide.',
      Papel: 'Papel: evita que esté mojado o sucio; retira grapas y clips si es fácil.',
      Basura: 'Basura: cosas que no se pueden reciclar; intenta reducirla al máximo.'
    };

    this.tooltip.textContent =
      tips[top1.label] ||
      'Limpia y seca los residuos antes de separarlos.';
  }
}
