// assets/js/models.js
import { softmax, topk } from './utils.js';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${url}`);
  }
  return res.json();
}

export class ModelHelper {
  constructor(baseUrl, kind = 'image') {
    // baseUrl: ruta base donde está el modelo (carpeta que contiene model.json / metadata.json)
    this.baseUrl = baseUrl;
    this.kind = kind; // "image" | "audio" | "pose"
    this.model = null;
    this.labels = null;
    this.imageSize = 224; // por defecto, se ajusta con metadata
  }

  async load() {
    // 1) Cargar metadata (etiquetas, tamaño de imagen…)
    try {
      const meta = await fetchJson(`${this.baseUrl}/metadata.json`);
      if (Array.isArray(meta.labels)) {
        this.labels = meta.labels;
      }
      if (typeof meta.imageSize === 'number') {
        this.imageSize = meta.imageSize;
      }
    } catch (e) {
      console.warn('No se pudo leer metadata, usando etiquetas por defecto', e);
      if (this.kind === 'image') {
        // Fallback al modelo de desechos de Teachable Machine
        this.labels = ['Carton', 'Vidrio', 'Metal', 'plastico', 'Papel', 'Basura'];
      } else if (this.kind === 'audio') {
        this.labels = ['reggaetón', 'rap', 'salsa', 'electrónica'];
      } else if (this.kind === 'pose') {
        this.labels = ['sentadilla', 'flexión', 'plancha', 'dominada', 'zancada', 'burpee'];
      } else {
        this.labels = ['clase A', 'clase B'];
      }
    }

    // 2) Cargar modelo TFJS (solo necesitamos esto para imágenes por ahora)
    try {
      if (window.tf && this.kind === 'image') {
        this.model = await tf.loadGraphModel(`${this.baseUrl}/model.json`);

        // Warm-up para que el primer frame no sea tan lento
        const dummy = tf.zeros([1, this.imageSize, this.imageSize, 3]);
        this.model.execute(dummy);
        dummy.dispose();
      }
    } catch (e) {
      console.warn('No se pudo cargar el modelo TFJS, se usará modo demo:', e);
      this.model = null;
    }
  }

  // ---------- IMÁGENES (Teachable Machine) ----------
  async inferImage(imageLike) {
    const t0 = performance.now();
    let probs;

    if (this.model && window.tf && this.kind === 'image') {
      const size = this.imageSize || 224;

      const out = tf.tidy(() => {
        // imageLike puede ser <canvas> o <video>
        let img = tf.browser.fromPixels(imageLike).toFloat();
        img = tf.image.resizeBilinear(img, [size, size]);
        img = img.expandDims(0).div(255); // normalizar 0-1

        // Teachable Machine exporta un GraphModel: usamos execute
        const pred = this.model.execute(img);
        const tensor = Array.isArray(pred) ? pred[0] : pred;
        return tensor.dataSync(); // TypedArray
      });

      probs = softmax(Array.from(out));
    } else {
      // Modo “demo” aleatorio si el modelo no está disponible
      const base = this.labels.map(() => Math.random());
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const t1 = performance.now();
    const { top1, top3 } = topk(this.labels, probs, 3);
    return { top1, top3, latencyMs: t1 - t0 };
  }

  // ---------- AUDIO (para futura integración) ----------
  async inferAudio(featureVector) {
    const t0 = performance.now();
    let probs;

    if (featureVector && featureVector.length) {
      const mean = featureVector.reduce((a, b) => a + b, 0) / featureVector.length;
      const bass = featureVector.slice(0, 10).reduce((a, b) => a + b, 0) / (10 || 1);
      const treble = featureVector.slice(-10).reduce((a, b) => a + b, 0) / (10 || 1);
      probs = softmax([bass, mean, treble, Math.abs(treble - bass)]);
    } else {
      const base = this.labels.map(() => Math.random());
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const t1 = performance.now();
    const { top1, top3 } = topk(this.labels, probs, 3);
    return { top1, top3, latencyMs: t1 - t0 };
  }

  // ---------- POSTURAS (para futura integración) ----------
  async inferPose(poseFeatures) {
    const t0 = performance.now();
    let probs;

    if (poseFeatures) {
      const { kneeAngle = 180, elbowAngle = 180, hipY = 0.5 } = poseFeatures;
      // Heurística sencilla como placeholder
      probs = softmax([
        180 - kneeAngle,
        180 - elbowAngle,
        10,
        5,
        10 * (1 - hipY),
        3
      ]);
    } else {
      const base = this.labels.map(() => Math.random());
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const t1 = performance.now();
    const { top1, top3 } = topk(this.labels, probs, 3);
    return { top1, top3, latencyMs: t1 - t0 };
  }
}
