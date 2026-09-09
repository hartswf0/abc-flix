import {FilesetResolver,InteractiveSegmenter,DrawingUtils} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL="https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task";
let seg=null,render=null,draw=null,out=null,delegate="GPU";

function post(type,data={},transfer=[]){self.postMessage({type,...data},transfer)}
function ensureCanvas(w,h){
  if(!render)render=new OffscreenCanvas(w,h);
  if(render.width!==w||render.height!==h){render.width=w;render.height=h}
  const gl=render.getContext("webgl2");
  if(gl&&!gl.isContextLost()){
    gl.viewport(0,0,w,h);
    try{draw=new DrawingUtils(gl)}catch(e){draw=null}
  }
  if(!out)out=new OffscreenCanvas(w,h);
  if(out.width!==w||out.height!==h){out.width=w;out.height=h}
}
async function init(){
  const vision=await FilesetResolver.forVisionTasks(WASM);
  render=new OffscreenCanvas(1,1);
  try{
    seg=await InteractiveSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:"GPU"},canvas:render});
    delegate="GPU";
  }catch(e){
    seg=await InteractiveSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:"CPU"},canvas:render});
    delegate="CPU";
  }
  post("READY",{delegate})
}
function cpuMaskBitmap(mask,w,h){
  const c=new OffscreenCanvas(w,h),x=c.getContext("2d"),im=x.createImageData(w,h);
  let a;
  if(typeof mask.getAsFloat32Array==="function")a=mask.getAsFloat32Array();
  else{
    const u=mask.getAsUint8Array();a=new Float32Array(u.length);for(let i=0;i<u.length;i++)a[i]=u[i]/255
  }
  for(let i=0;i<a.length;i++){
    const q=Math.max(0,Math.min(1,(a[i]-.33)/.34)),aa=q*q*(3-2*q);
    im.data[i*4]=255;im.data[i*4+1]=255;im.data[i*4+2]=255;im.data[i*4+3]=(aa*255)|0
  }
  x.putImageData(im,0,0);return c.transferToImageBitmap()
}
self.onmessage=async e=>{
  const d=e.data;
  if(d.type==="INIT"){
    try{await init()}catch(err){post("ERROR",{stage:"init",error:err?.message||String(err)})}
    return
  }
  if(d.type!=="SEGMENT"||!seg)return;
  const {bitmap,x,y,id,kind,mediaTime}=d;
  const t0=performance.now();
  try{
    ensureCanvas(bitmap.width,bitmap.height);
    seg.setImage(bitmap);
    const mask=seg.segment([{brushMode:1,point:[{x,y}],isCompleted:true}]);
    if(!mask)throw new Error("no mask");
    const mw=mask.width,mh=mask.height;
    ensureCanvas(mw,mh);
    let mb=null;
    if(draw){
      try{
        draw.drawConfidenceMask(mask,[0,0,0,0],[255,255,255,255]);
        mb=render.transferToImageBitmap()
      }catch(e){mb=null}
    }
    if(!mb)mb=cpuMaskBitmap(mask,mw,mh);
    mask.close?.();

    if(out.width!==bitmap.width||out.height!==bitmap.height){out.width=bitmap.width;out.height=bitmap.height}
    const ox=out.getContext("2d");
    ox.globalCompositeOperation="source-over";
    ox.clearRect(0,0,out.width,out.height);
    ox.drawImage(bitmap,0,0,out.width,out.height);
    ox.globalCompositeOperation="destination-in";
    ox.drawImage(mb,0,0,out.width,out.height);
    ox.globalCompositeOperation="source-over";
    const cut=out.transferToImageBitmap();
    bitmap.close?.();

    post("RESULT",{id,kind,mediaTime,inference:performance.now()-t0,mask:mb,cut,width:out.width,height:out.height},[mb,cut])
  }catch(err){
    bitmap?.close?.();
    post("ERROR",{stage:"infer",id,kind,error:err?.message||String(err)})
  }
};
