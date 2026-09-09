"use strict";
const $=id=>document.getElementById(id);
const stage=$("stage"),g=stage.getContext("2d",{alpha:false,desynchronized:true});
const file=$("file"),stateEl=$("state"),segEl=$("seg"),reel=$("reel"),tray=$("tray"),tip=$("tip");
const fault=$("fault"),faultText=$("faultText");
const PHONE=(navigator.maxTouchPoints||0)>1&&Math.min(screen.width,screen.height)<700;
const FRAME_SIDE=PHONE?384:512;
const MAX_TAKES=PHONE?5:10;
const TAKE_SECONDS=2.2;
const TAKE_MAX_FRAMES=PHONE?10:14;
const THUMB_W=128,THUMB_H=96;

const FRAME=document.createElement("canvas");
const SCAN=document.createElement("canvas");SCAN.width=128;SCAN.height=96;
const OVERLAY=document.createElement("canvas");

const S={
  dpr:1,w:1,h:1,
  video:null,url:null,name:"",kind:"film",stream:null,
  worker:null,workerReady:false,workerLoading:false,workerFault:null,
  req:0,pending:null,
  mask:null,objects:[],selected:-1,next:1,history:[],
  drag:null,time:false,capture:null
};

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function say(s){stateEl.textContent=s}
function fmt(t){t=Number.isFinite(t)?Math.max(0,t):0;const m=Math.floor(t/60),s=Math.floor(t%60);return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function resize(){
  const r=stage.getBoundingClientRect(),d=PHONE?Math.min(devicePixelRatio||1,1.25):Math.min(devicePixelRatio||1,1.75);
  S.dpr=d;S.w=Math.max(1,r.width);S.h=Math.max(1,r.height);
  stage.width=Math.round(S.w*d);stage.height=Math.round(S.h*d);g.setTransform(d,0,0,d,0,0)
}
new ResizeObserver(resize).observe(stage);resize();

function rr(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function sourceRect(){
  if(!S.video||!S.video.videoWidth)return{x:0,y:0,w:S.w,h:S.h};
  const pad=PHONE?8:14,a={x:pad,y:pad,w:S.w-pad*2,h:S.h-pad*2},k=Math.min(a.w/S.video.videoWidth,a.h/S.video.videoHeight);
  const w=S.video.videoWidth*k,h=S.video.videoHeight*k;
  return{x:a.x+(a.w-w)/2,y:a.y+(a.h-h)/2,w,h}
}
function workBand(){return{x:0,y:S.h*.66,w:S.w,h:S.h*.34}}
function pt(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function inside(p,r){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h}
function or(o){return{x:o.x-o.w*o.scale/2,y:o.y-o.h*o.scale/2,w:o.w*o.scale,h:o.h*o.scale}}
function hit(p){for(let i=S.objects.length-1;i>=0;i--)if(inside(p,or(S.objects[i])))return i;return -1}

function setSeg(state,text){segEl.className=state||"";segEl.textContent=text}
function setFault(text){faultText.textContent=text;fault.hidden=false}
function clearFault(){fault.hidden=true}
function update(){
  $("fTake").disabled=!!S.capture ? false : (!S.mask||S.objects.length>=MAX_TAKES);
  $("fTake").setAttribute("aria-pressed",!!S.capture);
  $("undo").disabled=!S.history.length;
  $("fTime").setAttribute("aria-pressed",S.time);
  $("cam").setAttribute("aria-pressed",S.kind==="cam");
  $("fCam").setAttribute("aria-pressed",S.kind==="cam");
  if(S.workerReady)setSeg("ready","seg ready");
  else if(S.workerLoading)setSeg("loading","seg load");
  else if(S.workerFault)setSeg("fault","seg fault");
  else setSeg("","seg idle");
  tip.style.display=S.video&&S.video.videoWidth?"none":"block"
}

function stopCapture(){
  if(!S.capture)return;
  S.capture.stopped=true;
  const o=S.capture.object;
  S.capture=null;
  if(S.kind==="film")S.video?.pause();
  if(o){
    o.loopStart=performance.now();
    say(`take ${o.id} · ${o.frames.length} frames · loop`)
  }
  renderReel();update()
}
function stopAll(){
  stopCapture();
  S.video?.pause();
  if(S.url)URL.revokeObjectURL(S.url);
  if(S.stream)S.stream.getTracks().forEach(t=>t.stop());
  S.video=null;S.url=null;S.stream=null;S.mask=null;S.objects=[];S.selected=-1;S.history=[];S.kind="film";
  renderReel();say("no film");update()
}
function openFilm(f){
  stopAll();
  const v=document.createElement("video"),url=URL.createObjectURL(f);
  S.video=v;S.url=url;S.name=f.name;S.kind="film";
  v.src=url;v.muted=true;v.playsInline=true;v.preload="auto";
  v.onloadedmetadata=()=>{say(`${f.name} · ${v.videoWidth}×${v.videoHeight}`);update()};
  v.onerror=()=>{if(!v.videoWidth)setFault("film decode failed · try mp4/h.264 or webm")};
  v.load();update()
}
file.onchange=()=>{const f=file.files?.[0];if(f)openFilm(f);file.value=""};
$("add").onclick=$("fFilm").onclick=()=>file.click();

async function useCam(){
  if(S.kind==="cam"){stopAll();return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
    stopAll();
    const v=document.createElement("video");v.srcObject=stream;v.muted=true;v.playsInline=true;v.autoplay=true;
    S.video=v;S.stream=stream;S.kind="cam";await v.play();say("camera · live");update()
  }catch(e){setFault("camera unavailable · permission or secure-origin problem")}
}
$("cam").onclick=$("fCam").onclick=useCam;

// -------- Real segmentation worker --------
function bootWorker(){
  if(S.workerReady||S.workerLoading)return;
  S.workerLoading=true;S.workerFault=null;clearFault();update();say("segmentation · starting worker");
  try{
    const w=new Worker("./tamper-seg-worker.js",{type:"module"});
    S.worker=w;
    w.onmessage=workerMessage;
    w.onerror=e=>{
      S.workerLoading=false;S.workerFault=e;setFault("segmentation worker failed · "+(e.message||"unknown error"));say("segmentation worker fault");update()
    };
    w.postMessage({type:"INIT"})
  }catch(e){
    S.workerLoading=false;S.workerFault=e;setFault("worker unavailable · "+e.message);update()
  }
}
$("seg").onclick=$("fSeg").onclick=bootWorker;
$("retry").onclick=()=>{S.worker?.terminate();S.worker=null;S.workerReady=false;S.workerLoading=false;S.workerFault=null;bootWorker()};
$("dismiss").onclick=clearFault;

async function frameBitmap(){
  if(!S.video||S.video.readyState<2)throw new Error("video frame not ready");
  const sw=S.video.videoWidth,sh=S.video.videoHeight,k=Math.min(1,FRAME_SIDE/Math.max(sw,sh));
  const w=Math.max(2,Math.round(sw*k)),h=Math.max(2,Math.round(sh*k));
  if(FRAME.width!==w||FRAME.height!==h){FRAME.width=w;FRAME.height=h}
  const c=FRAME.getContext("2d");c.clearRect(0,0,w,h);c.drawImage(S.video,0,0,w,h);
  return await createImageBitmap(FRAME)
}
function scanMask(mask){
  const ar=mask.width/mask.height;
  let w=128,h=Math.max(32,Math.round(w/ar));if(h>128){h=128;w=Math.max(32,Math.round(h*ar))}
  SCAN.width=w;SCAN.height=h;
  const c=SCAN.getContext("2d",{willReadFrequently:true});c.clearRect(0,0,w,h);c.drawImage(mask,0,0,w,h);
  const d=c.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1,sx=0,sy=0,n=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const a=d[(y*w+x)*4+3];
    if(a>70){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sx+=x;sy+=y;n++}
  }
  if(n<12)return null;
  const pad=2;minX=clamp(minX-pad,0,w-1);maxX=clamp(maxX+pad,0,w-1);minY=clamp(minY-pad,0,h-1);maxY=clamp(maxY+pad,0,h-1);
  return{
    bbox:{x:minX/w,y:minY/h,w:(maxX-minX+1)/w,h:(maxY-minY+1)/h},
    cx:(sx/n)/w,cy:(sy/n)/h
  }
}
function cropCut(cut,b){
  const x=Math.floor(b.x*cut.width),y=Math.floor(b.y*cut.height),w=Math.max(1,Math.ceil(b.w*cut.width)),h=Math.max(1,Math.ceil(b.h*cut.height));
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(cut,x,y,w,h,0,0,w,h);
  return c
}
function copyMask(mask){
  OVERLAY.width=mask.width;OVERLAY.height=mask.height;const c=OVERLAY.getContext("2d");c.clearRect(0,0,OVERLAY.width,OVERLAY.height);c.drawImage(mask,0,0)
}

async function requestSeg(x,y,kind="select",object=null){
  if(!S.workerReady){bootWorker();say("segmentation · loading");return}
  if(S.pending)return;
  try{
    const bitmap=await frameBitmap(),id=++S.req;
    S.pending={id,kind,object};
    say(kind==="select"?"segmenting · UI stays live":`tracking take ${object.id} · ${object.frames.length}f`);
    S.worker.postMessage({type:"SEGMENT",bitmap,x,y,id,kind,mediaTime:S.video.currentTime},[bitmap])
  }catch(e){say("frame unavailable · tap again")}
}
function workerMessage(e){
  const d=e.data;
  if(d.type==="READY"){
    S.workerLoading=false;S.workerReady=true;S.workerFault=null;say(`seg ready · ${d.delegate.toLowerCase()} worker · tap a thing`);update();return
  }
  if(d.type==="ERROR"){
    if(S.pending&&d.id===S.pending.id)S.pending=null;
    S.workerFault=d.error;setFault(`segmentation ${d.stage} failed · ${d.error}`);say("segment fault");update();return
  }
  if(d.type!=="RESULT")return;
  const p=S.pending;if(!p||d.id!==p.id){d.mask?.close?.();d.cut?.close?.();return}
  S.pending=null;
  const shape=scanMask(d.mask);
  if(!shape){
    d.mask.close?.();d.cut.close?.();
    if(p.kind==="select"){S.mask=null;say("no object · tap again")}
    scheduleCapture();
    return
  }
  if(p.kind==="select"){
    copyMask(d.mask);
    S.mask={bbox:shape.bbox,cx:shape.cx,cy:shape.cy,time:d.mediaTime,cut:cropCut(d.cut,shape.bbox),inference:d.inference};
    say(`mask · ${Math.round(d.inference)}ms off-thread · C take`)
  }else if(p.kind==="capture"&&p.object){
    const o=p.object;
    o.seedX=shape.cx;o.seedY=shape.cy;
    o.frames.push({img:cropCut(d.cut,shape.bbox),t:d.mediaTime-o.start});
    o.lastInference=d.inference;
    if(o.frames.length===1)o.w=Math.max(70,Math.min(230,shape.bbox.w*S.w*.72)),o.h=o.w*(shape.bbox.h/shape.bbox.w);
    renderReel();
    scheduleCapture()
  }
  d.mask.close?.();d.cut.close?.();update()
}

stage.addEventListener("pointerdown",e=>{
  const p=pt(e),i=hit(p);
  if(i>=0){
    stage.setPointerCapture(e.pointerId);S.selected=i;
    const o=S.objects[i];S.drag={i,dx:p.x-o.x,dy:p.y-o.y,before:serial(),moved:false};renderReel();return
  }
  const r=sourceRect();
  if(S.video&&inside(p,r)){
    S.video.pause();S.mask=null;S.selected=-1;renderReel();
    requestSeg((p.x-r.x)/r.w,(p.y-r.y)/r.h,"select")
  }
});
stage.addEventListener("pointermove",e=>{
  if(!S.drag)return;const p=pt(e),o=S.objects[S.drag.i],b=workBand();if(!o)return;
  o.x=clamp(p.x-S.drag.dx,15,S.w-15);o.y=clamp(p.y-S.drag.dy,b.y+15,S.h-15);S.drag.moved=true
});
stage.addEventListener("pointerup",()=>{
  if(S.drag?.moved){S.history.push({label:"before move",objects:S.drag.before,selected:S.drag.i});say("moved · undo")}
  S.drag=null;update()
});

function serial(){
  return S.objects.map(o=>({id:o.id,start:o.start,end:o.end,seedX:o.seedX,seedY:o.seedY,x:o.x,y:o.y,w:o.w,h:o.h,scale:o.scale,frames:o.frames,loopStart:o.loopStart,lastInference:o.lastInference}))
}
function snap(label){S.history.push({label,objects:serial(),selected:S.selected});if(S.history.length>40)S.history.shift();update()}
function currentObjectFrame(o,now=performance.now()){
  if(!o.frames.length)return o.initial||null;
  if(o.frames.length===1)return o.frames[0].img;
  const duration=Math.max(.12,o.frames[o.frames.length-1].t||.12);
  const t=((now-(o.loopStart||now))/1000)%duration;
  let fr=o.frames[0];
  for(let i=1;i<o.frames.length;i++){if(o.frames[i].t>t)break;fr=o.frames[i]}
  return fr.img
}
async function startTake(){
  if(S.capture){stopCapture();return}
  if(!S.mask||S.objects.length>=MAX_TAKES)return;
  snap("before take");
  const b=workBand(),m=S.mask;
  const w=Math.max(70,Math.min(230,m.bbox.w*S.w*.72)),h=w*(m.bbox.h/m.bbox.w);
  const o={id:S.next++,start:m.time,end:S.kind==="film"?Math.min(S.video.duration,m.time+TAKE_SECONDS):Infinity,
    seedX:m.cx,seedY:m.cy,x:S.w*.5,y:b.y+b.h*.52,w,h,scale:1,frames:[],initial:m.cut,loopStart:performance.now(),lastInference:m.inference};
  S.objects.push(o);S.selected=S.objects.length-1;S.mask=null;
  S.capture={object:o,startMedia:S.video.currentTime,startWall:performance.now(),stopped:false};
  renderReel();update();
  say(`recording take ${o.id} · worker segmentation · C stop`);
  try{await S.video.play()}catch(e){}
  scheduleCapture()
}
$("fTake").onclick=startTake;
function scheduleCapture(){
  const c=S.capture;if(!c||c.stopped||S.pending)return;
  const o=c.object;
  const doneByTime=S.kind==="film"?(S.video.currentTime>=o.end):(performance.now()-c.startWall>=TAKE_SECONDS*1000);
  if(doneByTime||o.frames.length>=TAKE_MAX_FRAMES||S.video?.ended){stopCapture();return}
  const next=()=>{
    if(!S.capture||S.pending)return;
    requestSeg(o.seedX,o.seedY,"capture",o)
  };
  if(S.video?.requestVideoFrameCallback)S.video.requestVideoFrameCallback(()=>next());
  else setTimeout(next,80)
}
function stopCapture(){
  if(!S.capture)return;
  const o=S.capture.object;S.capture.stopped=true;S.capture=null;S.video?.pause();o.loopStart=performance.now();
  say(`take ${o.id} · ${o.frames.length||1} temporal frames · loop`);renderReel();update()
}

function renderReel(){
  reel.innerHTML="";
  if(!S.objects.length){const d=document.createElement("div");d.className="empty";d.textContent="nothing taken";reel.appendChild(d);return}
  S.objects.forEach((o,i)=>{
    const b=document.createElement("button");b.className="thumb"+(S.capture?.object===o?" rec":"");b.setAttribute("aria-pressed",i===S.selected);
    const c=document.createElement("canvas");c.width=THUMB_W;c.height=THUMB_H;b.appendChild(c);
    const n=document.createElement("b");n.textContent=String(o.id).padStart(2,"0");b.appendChild(n);
    b.onclick=()=>{S.selected=i;renderReel();say(`take ${o.id} · ${o.frames.length||1}f · drag`)};
    reel.appendChild(b);
    const q=c.getContext("2d"),fr=currentObjectFrame(o);q.fillStyle="#fff";q.fillRect(0,0,c.width,c.height);
    if(fr)q.drawImage(fr,4,4,c.width-8,c.height-8)
  })
}
renderReel();
$("undo").onclick=()=>{
  if(S.capture)stopCapture();
  const h=S.history.pop();if(!h)return;
  S.objects=h.objects.map(o=>({...o,loopStart:performance.now()}));S.selected=clamp(h.selected,-1,S.objects.length-1);S.mask=null;
  renderReel();say("restored · "+h.label);update()
};
$("fTime").onclick=()=>{
  if(!S.video)return;S.time=!S.time;$("fTime").setAttribute("aria-pressed",S.time);
  if(!S.time){tray.hidden=true;return}
  tray.hidden=false;tray.innerHTML="";
  const play=document.createElement("button");play.textContent=S.video.paused?"PLAY":"STOP";
  play.onclick=async()=>{if(S.video.paused)await S.video.play();else S.video.pause();play.textContent=S.video.paused?"PLAY":"STOP"};
  const r=document.createElement("input");r.type="range";r.min=0;r.max=1000;r.value=S.video.duration?S.video.currentTime/S.video.duration*1000:0;
  r.oninput=()=>{if(Number.isFinite(S.video.duration)){S.video.pause();S.video.currentTime=+r.value/1000*S.video.duration;S.mask=null}};
  const t=document.createElement("span");t.textContent=S.kind==="cam"?"live":`${fmt(S.video.currentTime)} / ${fmt(S.video.duration)}`;
  tray.append(play,r,t);update()
};
$("fOut").onclick=()=>{const a=document.createElement("a");a.download="tamper-orb.png";a.href=stage.toDataURL("image/png");a.click();say("out · png")};

function drawSource(){
  if(!S.video||!S.video.videoWidth)return;
  const r=sourceRect();
  g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();g.drawImage(S.video,r.x,r.y,r.w,r.h);
  if(S.mask&&OVERLAY.width){g.globalAlpha=.48;g.drawImage(OVERLAY,r.x,r.y,r.w,r.h);g.globalAlpha=1}
  g.restore();g.strokeStyle="#000";g.lineWidth=1;g.strokeRect(r.x+.5,r.y+.5,r.w-1,r.h-1);
  if(S.mask){
    const b=S.mask.bbox;g.strokeStyle="#ff2e2e";g.lineWidth=2;g.strokeRect(r.x+b.x*r.w,r.y+b.y*r.h,b.w*r.w,b.h*r.h)
  }
}
function drawObjects(now){
  const b=workBand();if(S.objects.length){g.strokeStyle="rgba(0,0,0,.18)";g.beginPath();g.moveTo(0,b.y);g.lineTo(S.w,b.y);g.stroke()}
  S.objects.forEach((o,i)=>{
    const q=or(o),fr=currentObjectFrame(o,now);if(fr)g.drawImage(fr,q.x,q.y,q.w,q.h);
    if(i===S.selected){
      g.strokeStyle="#ff2e2e";g.lineWidth=1.5;g.strokeRect(q.x-2,q.y-2,q.w+4,q.h+4);
      const label=S.capture?.object===o?`${o.id} · REC ${o.frames.length}`:`${o.id} · ${o.frames.length||1}f`;
      g.font="9px ui-monospace,monospace";const tw=g.measureText(label).width+6;
      g.fillStyle="#fff";g.fillRect(q.x,q.y-14,tw,12);g.strokeStyle="#000";g.strokeRect(q.x+.5,q.y-13.5,tw-1,11);g.fillStyle="#000";g.fillText(label,q.x+3,q.y-5)
    }
  })
}
function draw(now){
  g.setTransform(S.dpr,0,0,S.dpr,0,0);g.fillStyle="#fff";g.fillRect(0,0,S.w,S.h);
  drawSource();drawObjects(now);
  if(S.time&&!tray.hidden&&S.video&&Number.isFinite(S.video.duration)){
    const r=tray.querySelector("input"),t=tray.querySelector("span");
    if(r&&!r.matches(":active"))r.value=S.video.currentTime/S.video.duration*1000||0;
    if(t)t.textContent=`${fmt(S.video.currentTime)} / ${fmt(S.video.duration)}`
  }
  requestAnimationFrame(draw)
}
requestAnimationFrame(draw);

stage.addEventListener("wheel",e=>{
  const i=hit({x:e.offsetX,y:e.offsetY});if(i<0)return;e.preventDefault();snap("before scale");S.selected=i;S.objects[i].scale=clamp(S.objects[i].scale*Math.exp(-e.deltaY*.0015),.35,3);say("scaled · undo");renderReel()
},{passive:false});
stage.addEventListener("dragover",e=>e.preventDefault());
stage.addEventListener("drop",e=>{e.preventDefault();const f=[...e.dataTransfer.files].find(x=>x.type.startsWith("video/"));if(f)openFilm(f)});
document.addEventListener("visibilitychange",()=>{if(document.hidden){S.video?.pause();if(S.capture)stopCapture()}});
update();
