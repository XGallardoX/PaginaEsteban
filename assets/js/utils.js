// assets/js/utils.js

// Colores de ejemplo (se usan en otros módulos, los dejamos igual)
export const WasteColors = {
  'papel': 'paper',
  'cartón': 'carton',
  'plástico': 'plastico',
  'vidrio': 'vidrio',
  'metales': 'metales'
};

// Softmax numérico estable
export function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(x => x / sum);
}

// Ordena labels y probabilidades de mayor a menor prob
export function sortLabels(labels, probs) {
  const pairs = labels.map((label, idx) => ({
    label,
    prob: probs[idx] ?? 0
  }));
  pairs.sort((a, b) => b.prob - a.prob);
  return pairs;
}

// Helper que mantiene compatibilidad con otros módulos
export function topk(labels, probs, k = 3) {
  const sorted = sortLabels(labels, probs);
  return {
    top1: sorted[0],
    top3: sorted.slice(0, k),
    all: sorted
  };
}
