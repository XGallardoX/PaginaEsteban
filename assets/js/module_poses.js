import { renderBars } from './ui.js';
import { ModelHelper } from './models.js';
import { setStatus, setLatency } from './main.js';

export class PosesModule{
  constructor(){
    this.video=document.getElementById('poseVideo'); this.canvas=document.getElementById('poseCanvas'); this.ctx=this.canvas.getContext('2d');
    this.repsEl=document.getElementById('poseReps'); this.top3El=document.getElementById('poseTop3'); this.coach=document.getElementById('poseCoach');
    this.btnStart=document.getElementById('poseStart'); this.btnStop=document.getElementById('poseStop'); this.exerciseSel=document.getElementById('poseExercise');
    this.model=new ModelHelper('./public/models/fitness_poses','pose'); this.stream=null; this.running=false; this.reps=0; this.phase='up';
    this.about = `<h4>Gimnasio y calistenia</h4>
      <p>Clases: sentadilla, flexión, plancha, dominada, zancada, burpee. Dibuja esqueleto y cuenta reps.</p>
      <p>Nota: Usa espacio seguro. La guía es educativa, no reemplaza un entrenador.</p>`;
    this._pose=null; this._cam=null;
  }
  async mount(){ setStatus('Cargando…'); await this.model.load(); setStatus('OK','ok'); this.btnStart.onclick=()=>this.start(); this.btnStop.onclick=()=>this.unmount(); this.exerciseSel.onchange=()=>{ this.reps=0; this.repsEl.textContent='0'; }; }
  async unmount(){ this.running=false; if (this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; } if (this._cam){ this._cam.stop && this._cam.stop(); this._cam=null; } }
  async start(){
    try{
      this.stream = await navigator.mediaDevices.getUserMedia({video:true});
      this.video.srcObject=this.stream; await this.video.play();
      this.canvas.width=this.video.videoWidth||640; this.canvas.height=this.video.videoHeight||360; this.running=true; this.loop();
    }catch(e){ setStatus('Sin permisos','warn'); console.error(e); }
  }
  async loop(){
    const step = async () => {
      if (!this.running) return; requestAnimationFrame(step);
      this.ctx.drawImage(this.video,0,0,this.canvas.width,this.canvas.height);
      if (window.Pose){
        await this.detectMediapipe();
      }else{
        this.demoSkeleton();
      }
    }; step();
  }
  async detectMediapipe(){
    if (!this._pose){
      this._pose = new window.Pose.Pose({ locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}` });
      this._pose.setOptions({modelComplexity:1, smoothLandmarks:true, enableSegmentation:false});
      this._pose.onResults((res)=>this.onPoseResults(res));
      this._cam = new window.Camera.Camera(this.video, { onFrame: async()=>{ await this._pose.send({image:this.video}); } });
      this._cam.start();
    }
  }
  onPoseResults(res){
    const kp=res.poseLandmarks||[]; drawKeypoints(this.ctx,kp);
    const angles=estimateAngles(kp);
    const feat={ kneeAngle: angles.knee||180, elbowAngle: angles.elbow||180, hipY: (kp[24]?.y+kp[23]?.y)/2 || 0.5 };
    this.classifyAndCount(feat);
    coachMessage(this.coach, this.exerciseSel.value, angles);
  }
  demoSkeleton(){
    const t=(Date.now()/1000)%(2*Math.PI); const cx=this.canvas.width/2; const cy=this.canvas.height/2 + Math.sin(t)*30;
    this.ctx.strokeStyle='lime'; this.ctx.lineWidth=3; this.ctx.beginPath();
    this.ctx.arc(cx,cy-60,15,0,Math.PI*2); this.ctx.moveTo(cx,cy-45); this.ctx.lineTo(cx,cy+20);
    this.ctx.moveTo(cx,cy-30); this.ctx.lineTo(cx-25,cy); this.ctx.moveTo(cx,cy-30); this.ctx.lineTo(cx+25,cy);
    this.ctx.moveTo(cx,cy+20); this.ctx.lineTo(cx-20,cy+70); this.ctx.moveTo(cx,cy+20); this.ctx.lineTo(cx+20,cy+70); this.ctx.stroke();
    const feat={ kneeAngle:160+20*Math.sin(t), elbowAngle:160+20*Math.cos(t), hipY:0.5+0.05*Math.sin(t) };
    this.classifyAndCount(feat); coachMessage(this.coach, this.exerciseSel.value, {knee:feat.kneeAngle, elbow:feat.elbowAngle});
  }
  async classifyAndCount(feat){
    const out = await this.model.inferPose(feat); renderBars(this.top3El, out.top3, {}); setLatency(out.latencyMs);
    if (this.exerciseSel.value==='sentadilla'){
      const down=(feat.kneeAngle<120); if (this.phase==='up' && down) this.phase='down';
      if (this.phase==='down' && feat.kneeAngle>160){ this.phase='up'; this.reps++; this.repsEl.textContent=String(this.reps); }
    }
  }
}
function drawKeypoints(ctx, kp){
  if (!kp || !kp.length) return; ctx.lineWidth=3; ctx.strokeStyle='lime'; ctx.fillStyle='lime';
  kp.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x*ctx.canvas.width, p.y*ctx.canvas.height, 3, 0, Math.PI*2); ctx.fill(); });
  const L=(i)=>kp[i]&&[kp[i].x*ctx.canvas.width,kp[i].y*ctx.canvas.height];
  function line(a,b){ if(!a||!b) return; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  line(L(11),L(12)); line(L(23),L(24)); line(L(11),L(23)); line(L(12),L(24));
  line(L(23),L(25)); line(L(25),L(27)); line(L(24),L(26)); line(L(26),L(28));
  line(L(11),L(13)); line(L(13),L(15)); line(L(12),L(14)); line(L(14),L(16));
}
function angle(a,b,c){
  if (!a||!b||!c) return null; const ab={x:a.x-b.x,y:a.y-b.y}; const cb={x:c.x-b.x,y:c.y-b.y};
  const dot=ab.x*cb.x + ab.y*cb.y; const mab=Math.hypot(ab.x,ab.y), mcb=Math.hypot(cb.x,cb.y);
  const cos=dot/(mab*mcb + 1e-6); return Math.acos(Math.max(-1,Math.min(1,cos)))*180/Math.PI;
}
function estimateAngles(kp){ return { knee: angle(kp[23],kp[25],kp[27]), elbow: angle(kp[11],kp[13],kp[15]) }; }
function coachMessage(el, ex, ang){
  let msg='Forma general: espalda recta, control del movimiento.';
  if (ex==='sentadilla'){ msg = (ang.knee && ang.knee<100) ? 'Bien: profundidad adecuada. Alinea rodillas con puntas de pies.' : 'Baja un poco más y mantén la espalda neutra.'; }
  else if (ex==='flexion'){ msg = (ang.elbow && ang.elbow<90) ? 'Buena flexión de codos; activa core.' : 'Baja hasta 90° aprox. y evita cadera caída.'; }
  el.textContent=msg;
}