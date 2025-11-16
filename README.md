# AI Multi‑Modelo (Imágenes ♻️ · Sonidos 🎚️ · Posturas 🏋️)

**Stack elegido:** **B) HTML + CSS + JS puro (sin build)** — listo para publicar en GitHub Pages/Netlify.
> Decisión: elegimos vanilla para máxima simplicilidad y evitar problemas de dependencias (p. ej., versiones de `@mediapipe/pose` o `@tensorflow-models/pose-detection`). Si luego deseas **migrar a React + Vite + Tailwind**, la estructura modular ya está lista para copiar y pegar componentes.

## ✅ Características
- Selector persistente (sidebar) con atajos **1/2/3** para cambiar de modo sin recargar.
- **Modo Imágenes:** webcam o subida, **badge Top‑1**, **Top‑3** con barras por color de categoría, botón **Congelar** y tooltip de consejos.
- **Modo Sonidos:** grabar/Detener micrófono, subir clip, **onda/espectrograma** en `<canvas>`, Top‑3, **medidor de confianza**, **BPM** y etiqueta “ritmo estable/variable” (heurísticos).
- **Modo Posturas:** webcam, overlay de **esqueleto** (usa MediaPipe Pose si está disponible, si no, modo demo), **contador de sentadillas** básico y mensajes de forma.
- **Accesibilidad:** labels, foco visible, mensajes claros de permisos.
- **Dark mode**: automático + botón 🌘.
- **Errores manejados:** sin permisos de cámara/mic, modelo no encontrado ⇒ **modo demo**.

## 📁 Estructura
```
ai-multimodel-demo/
  index.html
  README.html
  .nojekyll
  public/
    models/
      waste_sorting/    model.json, weights.bin, metadata.json (placeholder)
      music_genres/     model.json, weights.bin, metadata.json (placeholder)
      fitness_poses/    model.json, weights.bin, metadata.json (placeholder)
    samples/
      images/           (PNG/SVG de ejemplo incluidos)
      audio/            (WAV de ejemplo incluidos)
      video/            (vacío, opcional)
  assets/
    css/style.css
    js/main.js
    js/ui.js
    js/utils.js
    js/models.js
    js/module_images.js
    js/module_audio.js
    js/module_poses.js
```

## 🚀 Inicio rápido
- Opción 1: **Abrir `index.html`** localmente (para probar UI). Algunas funciones de cámara/mic pueden requerir **HTTPS**.
- Opción 2 (recomendada): publicar en **GitHub Pages** (HTTPS).

### GitHub Pages (sin builds)
1. Crea un repo y sube esta carpeta tal cual.
2. Añadimos `.nojekyll` para evitar conflictos con rutas `public/`.
3. En **Settings → Pages**, Source: **Deploy from a branch** → `main` / `/ (root)` → **Save**.
4. Abre la URL `https://usuario.github.io/tu-repo/` (HTTPS listo).

> **Permisos**: al acceder, el navegador pedirá cámara/mic al entrar en los modos correspondientes.

## 🔌 Integración de modelos (Contrato)
Los helpers cargan modelos TF.js por **ruta** (carpeta con `model.json`, `weights.bin`, `metadata.json`).  
La función de inferencia retorna:
```ts
{
  top1: { label: string, prob: number },
  top3: Array<{ label: string, prob: number }>,
  latencyMs: number
}
```
Si un modelo aún no está, se activa **modo demo** con predicciones simuladas para validar la UI.

### Rutas esperadas
- Imágenes: `public/models/waste_sorting/`
- Sonidos: `public/models/music_genres/`
- Posturas: `public/models/fitness_poses/`

### Exportar desde **Teachable Machine**
1. Entrena tu modelo (Image / Audio / Pose).
2. Exporta **TensorFlow.js** y descarga el ZIP.
3. Copia los archivos a la carpeta correspondiente arriba.
4. Asegura que `metadata.json` contenga `labels` en el orden correcto.

> El preprocesado por defecto asume entradas **224×224** normalizadas `[0,1]` (ajústalo si tu modelo requiere otra escala/tamaño).

## 🎨 UI y Colores de clases
- papel = azul (`--paper`), cartón = ámbar (`--carton`), plástico = rosa (`--plast`), vidrio = verde (`--glass`), metales = gris (`--metal`).

## 🧠 Lógica de cada modo
### 1) Imágenes – Clasificación de desechos
- `getUserMedia(video)` + `<canvas>` para frame-by-frame (control de **FPS**).
- Botón **Congelar** pausa el refresco visual pero permite inspección.
- Tooltip muestra consejos según clase Top‑1.

### 2) Sonidos – Ritmos musicales
- `getUserMedia(audio)` o archivo (`<audio>` + `captureStream()`).
- `AnalyserNode` para espectro y dibujo en `<canvas>`.
- **BPM**: heurística simple basada en picos de baja frecuencia.
- **Estabilidad**: varianza en banda media (proxy).

### 3) Posturas – Gimnasio y calistenia
- Si está disponible **MediaPipe Pose** (CDN), dibuja landmarks/esqueleto.
- Si no, **modo demo** con stick figure animado.
- **Reps** de sentadilla: detección `down→up` por ángulo de rodilla.
- Mensajería de forma con reglas sencillas de ángulos.

## ⚠️ Troubleshooting
- **Cámara/Mic bloqueados**: revisa candado del navegador → Permisos.
- **Sin HTTPS**: en local algunos navegadores bloquean mic/cam. Publica en Pages/Netlify.
- **CORS/Modelos**: coloca `model.json/weights.bin` dentro de `public/models/...` para servirlos estáticamente.
- **Rendimiento**: baja a **8 FPS** en equipos lentos (selector de FPS en Imágenes).
- **Mediapipe no carga**: CDN caído o bloqueado → el modo Posturas cae en modo demo automáticamente.

## 🧩 Extensibilidad
- Añadir un 4º modo = crear `module_nuevo.js`, registrar en `main.js` y agregar botón en la sidebar.
- El patrón de `ModelHelper` unifica carga e inferencia por tipo (`image`, `audio`, `pose`).

## 🔒 Licencias
- Código bajo MIT. Los **assets** (audio/imágenes) son demostrativos y pueden reemplazarse por contenido propio autorizado.

— *Generado 2025-10-17 18:17*
