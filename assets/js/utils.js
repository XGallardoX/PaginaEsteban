export const WasteColors = {
  'papel': 'paper', 'cartón': 'carton', 'plástico': 'plastico', 'vidrio': 'vidrio', 'metales': 'metales'
};
export function softmax(arr){ const m=Math.max(...arr); const exps=arr.map(x=>Math.exp(x-m)); const s=exps.reduce((a,b)=>a+b,0); return exps.map(x=>x/s); }
export function topk(labels, probs, k=3){
  const pairs = labels.map((l,i)=>({label:l, prob:probs[i]}));
  pairs.sort((a,b)=>b.prob - a.prob);
  const top = pairs.slice(0,k);
  return { top1: top[0], top3: top };
}