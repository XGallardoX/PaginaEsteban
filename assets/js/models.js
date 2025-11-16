// assets/js/models.js
import { softmax, sortLabels } from './utils.js';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${url}: ${res.status}`);
  }
  return res.json();
}

export class ModelHelper {
  constructor(baseUrl, kind = 'image') {
    this.baseUrl = baseUrl;
    this.kind = kind;           // "image" | "audio" | "pose"
    this.model = null;          // tf.LayersModel para imágenes
    this.labels = [];
    this.imageSize = 224;       // se ajusta con metadata
  }

  async load() {
    // 1) Metadata: etiquetas y tamaño de imagen
    try {
      const meta = await fetchJson(`${this.baseUrl}/metadata.json`);
      if (Array.isArray(meta.labels)) {
        this.labels = meta.labels;
      }
      if (typeof meta.imageSize === 'number') {
        this.imageSize = meta.imageSize;
      }
    } catch (err) {
      console.warn('No se pudo leer metadata, usando etiquetas por defecto', err);
      if (this.kind === 'image') {
        this.labels = ['Carton', 'Vidrio', 'Metal', 'plastico', 'Papel', 'Basura'];
      } else if (this.kind === 'audio') {
        this.labels = ['reggaetón', 'rap', 'salsa', 'electrónica'];
      } else if (this.kind === 'pose') {
        this.labels = ['sentadilla', 'flexión', 'plancha', 'dominada', 'zancada', 'burpee'];
      }
    }

    // 2) Modelo de imágenes: Teachable Machine → tf.loadLayersModel
    try {
      if (this.kind === 'image' && window.tf) {
        this.model = await tf.loadLayersModel(`${this.baseUrl}/model.json`);

        // Warm-up (para que el primer frame no sea tan lento)
        const dummy = tf.zeros([1, this.imageSize, this.imageSize, 3]);
        this.model.predict(dummy);
        dummy.dispose();
      }
    } catch (err) {
      console.warn('No se pudo cargar el modelo de imágenes, usando modo demo:', err);
      this.model = null;
    }
  }

  // ---------- IMÁGENES ----------
  async inferImage(imageLike) {
    const t0 = performance.now();
    let probs;

    if (this.model && window.tf) {
      const size = this.imageSize || 224;

      const raw = tf.tidy(() => {
        let img = tf.browser.fromPixels(imageLike).toFloat();
        img = tf.image.resizeBilinear(img, [size, size]);
        img = img.div(255).expandDims(0);   // [1, h, w, 3] normalizado 0-1
        const pred = this.model.predict(img);
        const tensor = Array.isArray(pred) ? pred[0] : pred;
        return tensor.dataSync();           // TypedArray
      });

      probs = softmax(Array.from(raw));
    } else {
      // Modo demo aleatorio (fallback si no se cargó el modelo)
      const base = this.labels.length
        ? this.labels.map(() => Math.random())
        : [Math.random(), Math.random(), Math.random()];
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const sorted = sortLabels(this.labels, probs);  // TODAS las clases ordenadas
    const top1 = sorted[0];
    const top3 = sorted.slice(0, 3);
    const t1 = performance.now();

    return { top1, top3, all: sorted, latencyMs: t1 - t0 };
  }

  // ---------- AUDIO (placeholder para la siguiente etapa) ----------
  async inferAudio(featureVector) {
    const t0 = performance.now();
    let probs;

    if (featureVector && featureVector.length) {
      const mean = featureVector.reduce((a, b) => a + b, 0) / featureVector.length;
      const bass = featureVector.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const treble = featureVector.slice(-10).reduce((a, b) => a + b, 0) / 10;
      probs = softmax([bass, mean, treble, Math.abs(treble - bass)]);
    } else {
      const base = this.labels.length
        ? this.labels.map(() => Math.random())
        : [Math.random(), Math.random(), Math.random(), Math.random()];
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const sorted = sortLabels(this.labels, probs);
    const t1 = performance.now();
    return { top1: sorted[0], top3: sorted.slice(0, 3), all: sorted, latencyMs: t1 - t0 };
  }

  // ---------- POSTURAS (placeholder) ----------
  async inferPose(poseFeatures) {
    const t0 = performance.now();
    let probs;

    if (poseFeatures) {
      const { kneeAngle = 180, elbowAngle = 180, hipY = 0.5 } = poseFeatures;
      probs = softmax([
        180 - kneeAngle,
        180 - elbowAngle,
        10,
        5,
        10 * (1 - hipY),
        3
      ]);
    } else {
      const base = this.labels.length
        ? this.labels.map(() => Math.random())
        : [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()];
      const sum = base.reduce((a, b) => a + b, 0) || 1;
      probs = base.map(v => v / sum);
    }

    const sorted = sortLabels(this.labels, probs);
    const t1 = performance.now();
    return { top1: sorted[0], top3: sorted.slice(0, 3), all: sorted, latencyMs: t1 - t0 };
  }
}
