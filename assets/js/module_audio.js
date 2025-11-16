import { renderBars } from './ui.js';
import { ModelHelper } from './models.js';
import { setStatus, setLatency } from './main.js';

export class AudioModule{
  constructor(){
    this.canvas = document.getElementById('audCanvas'); this.ctx=this.canvas.getContext('2d');
    this.player = document.getElementById('audPlayer');
    this.confBar = document.getElementById('audConfidence'); this.confVal=document.getElementById('audConfidenceVal');
    this.top3El = document.getElementById('audTop3'); this.bpmEl=document.getElementById('audBpm'); this.stabEl=document.getElementById('audStability');
    this.btnStart = document.getElementById('audStart'); this.btnStop=document.getElementById('audStop'); this.upload=document.getElementById('audUpload'); this.sourceSel=document.getElementById('audSource');
    this.model = new ModelHelper('./public/models/music_genres','audio');
    this.running=false; this.stream=null; this.audioCtx=null; this.analyser=null; this.data=null; this._active=false;
    this.about = `<h4>Ritmos musicales</h4>
      <p>Clases: reggaetón, rap, salsa, electrónica. Usa micrófono o sube un clip.</p>
      <p>La demo estima BPM y estabilidad de ritmo; la clasificación usa un modelo si está disponible.</p>
      <p>Para mejorar: dataset con trozos de 10–20s variados por género.</p>`;
  }
  async mount(){
    setStatus('Cargando…'); await this.model.load(); setStatus('OK','ok');
    this.btnStart.onclick = ()=>this.startMic(); this.btnStop.onclick = ()=>this.stop(); this.upload.onchange=(e)=>this.onUpload(e); this.sourceSel.onchange=()=>this.stop();
    this.running=true; this.drawLoop();
  }
  async unmount(){ this.running=false; this.stop(); }
  async startMic(){
    try{ this.stream = await navigator.mediaDevices.getUserMedia({audio:true}); await this.setupAudio(this.stream); setStatus('OK','ok'); }
    catch(e){ setStatus('Mic ocupado / sin permisos','warn'); console.error(e); }
  }
  async onUpload(e){
    const file = e.target.files?.[0]; if (!file) return;
    this.player.src = URL.createObjectURL(file);
    this.player.onplay = async ()=>{ const stream = this.player.captureStream?.() || this.player.mozCaptureStream?.(); if (stream) await this.setupAudio(stream); };
    await this.player.play();
  }
  async setupAudio(stream){
    this.stop(); this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.audioCtx.createMediaStreamSource(stream); this.analyser=this.audioCtx.createAnalyser(); this.analyser.fftSize=2048;
    src.connect(this.analyser); this.data=new Uint8Array(this.analyser.frequencyBinCount); this._active=true;
  }
  stop(){ if (this.audioCtx){ this.audioCtx.close(); this.audioCtx=null; } if (this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; } this._active=false; }
  drawLoop(){
    const w=this.canvas.width, h=this.canvas.height;
    const draw = async () => {
      if (!this.running) return; requestAnimationFrame(draw);
      this.ctx.clearRect(0,0,w,h);
      if (!this.analyser || !this.data) return;
      this.analyser.getByteFrequencyData(this.data);
      const barW = Math.max(2, Math.floor(w / 100)); let x=0; const arr=[];
      for (let i=0;i<100;i++){ const idx=Math.floor(i*(this.data.length/100)); const v=this.data[idx]/255; arr.push(v); const barH=v*h; this.ctx.fillRect(x,h-barH,barW-1,barH); x+=barW; }
      const bpm = estimateBpm(arr); if (bpm) this.bpmEl.textContent = `BPM: ${Math.round(bpm)}`;
      const stab = rhythmStability(arr); this.stabEl.textContent = `Ritmo: ${stab<0.12 ? 'estable' : 'variable'}`;
      const t0=performance.now(); const out=await this.model.inferAudio(arr); const t1=performance.now(); this.render(out); setLatency(out.latencyMs + (t1-t0));
    }; draw();
  }
  render({top1, top3, latencyMs}){
    renderBars(this.top3El, top3, {});
    const conf=top1.prob||0; this.confBar.value=conf; this.confVal.textContent=`${Math.round(conf*100)}%`;
  }
}
function estimateBpm(arr){
  const n=arr.length; if (n<20) return null; const low=arr.slice(0,20);
  const mean=low.reduce((a,b)=>a+b,0)/low.length; const thr=mean*1.2; const peaks=[];
  for (let i=1;i<low.length-1;i++){ if (low[i]>thr && low[i]>low[i-1] && low[i]>low[i+1]) peaks.push(i); }
  if (peaks.length<2) return null; const gaps=peaks.slice(1).map((p,i)=>p - peaks[i]);
  const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length; const approxHz=(20/avg)||1; return approxHz*60;
}
function rhythmStability(arr){
  const mid=arr.slice(20,60); const mean=mid.reduce((a,b)=>a+b,0)/mid.length; const varc=mid.reduce((a,b)=>a + (b-mean)**2,0)/mid.length; return varc;
}