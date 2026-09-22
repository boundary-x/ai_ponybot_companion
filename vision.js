const VERSION='1.0.1';
const MODEL='https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const timeout=(promise,ms,message)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));};
export function frameSize(width,height){const scale=Math.min(1,480/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
export function facePosition(detection,width,height,mirrored){
  const b=detection.boundingBox,rawX=((b.originX+b.width/2)/width-.5)*2;
  return {x:mirrored?-rawX:rawX,turnX:rawX,y:((b.originY+b.height/2)/height-.5)*2,score:detection.categories?.[0]?.score??0,
    box:{x:mirrored?1-(b.originX+b.width)/width:b.originX/width,y:b.originY/height,w:b.width/width,h:b.height/height}};
}
export class FaceVision{
  constructor(video,onFace,onStatus,onError){this.video=video;this.onFace=onFace;this.onStatus=onStatus;this.onError=onError;this.active=false;this.loading=false;this.epoch=0;this.detector=null;this.stream=null;this.timer=null;this.facing='user';this.lastVideoTime=-1;this.lastFrameAt=0;this.frames=0;this.canvas=document.createElement('canvas');this.context=this.canvas.getContext('2d',{willReadFrequently:true});this.abort=null;}
  stop(){this.epoch++;this.abort?.abort();clearTimeout(this.timer);this.active=false;this.loading=false;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.detector?.close();this.detector=null;this.onFace(null);this.onStatus('off','카메라 켜기');}
  async start(){
    this.stop();const epoch=this.epoch;this.loading=true;this.frames=0;this.onStatus('loading','카메라 준비 중');let detector;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS 또는 localhost에서 카메라를 사용할 수 있어요.');
      this.video.muted=true;this.video.defaultMuted=true;this.video.playsInline=true;this.video.setAttribute('webkit-playsinline','');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:this.facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:30}},audio:false});
      if(epoch!==this.epoch){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;
      await timeout(this.video.play(),12000,'카메라 영상이 시작되지 않았어요. 카메라를 껐다 켜주세요.');
      if(epoch!==this.epoch)return;
      this.onStatus('loading','얼굴 모델 다운로드 중');
      const {FaceDetector,FilesetResolver}=await timeout(import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/vision_bundle.mjs'),25000,'얼굴 인식 라이브러리를 받지 못했어요. 인터넷 연결을 확인해주세요.');
      if(epoch!==this.epoch)return;
      const files=await timeout(FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/wasm'),20000,'얼굴 인식 실행 파일을 받지 못했어요.');
      if(epoch!==this.epoch)return;
      const controller=new AbortController();this.abort=controller;
      const modelTimer=setTimeout(()=>controller.abort(),25000);
      let model;
      try{const response=await fetch(MODEL,{signal:controller.signal});if(!response.ok)throw Error('모델 다운로드 오류 ('+response.status+')');model=new Uint8Array(await response.arrayBuffer());}
      catch(e){throw Error(e.name==='AbortError'?'모델 다운로드가 지연됐어요. 인터넷 연결을 확인해주세요.':e.message);}
      finally{clearTimeout(modelTimer);}
      if(epoch!==this.epoch)return;
      this.onStatus('loading','얼굴 인식 준비 중');
      // CPU avoids mobile WebGL context failures; small frames and a limited loop bound the work.
      detector=await FaceDetector.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.5});
      if(epoch!==this.epoch){detector.close();return;}
      this.detector=detector;this.active=true;this.loading=false;this.lastVideoTime=-1;this.lastFrameAt=performance.now();let lastResume=0;
      this.onStatus('ready','얼굴 인식 켜짐');
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(epoch===this.epoch)this.fail(Error('카메라 입력이 종료됐어요. 다시 켜주세요.'));});
      const tick=()=>{
        if(epoch!==this.epoch||!this.active)return;
        try{
          const now=performance.now();
          if(document.hidden){this.onFace(null);}
          else if(this.video.readyState>=2&&this.video.videoWidth>0&&this.video.currentTime!==this.lastVideoTime){
            this.lastVideoTime=this.video.currentTime;this.lastFrameAt=now;this.drawFrame();
            const result=detector.detectForVideo(this.canvas,now);this.frames++;
            const detection=result.detections?.filter(d=>d.boundingBox?.width>0&&d.boundingBox?.height>0).sort((a,b)=>b.boundingBox.width*b.boundingBox.height-a.boundingBox.width*a.boundingBox.height)[0];
            this.onFace(detection?facePosition(detection,this.canvas.width,this.canvas.height,this.facing==='user'):null);
            this.onStatus('ready',detection?'얼굴 감지됨':'모델 준비됨 · 얼굴을 비춰주세요');
          }else if(now-this.lastFrameAt>750){
            this.onFace(null);this.onStatus('stalled','카메라 영상 대기 · 다시 재생 중');
            if(now-lastResume>1500){lastResume=now;this.video.play().catch(()=>{});}
            if(now-this.lastFrameAt>10000){this.fail(Error('카메라 영상이 갱신되지 않아요. 카메라를 껐다 켜주세요.'));return;}
          }
          this.timer=setTimeout(tick,120);
        }catch(e){this.fail(Error('얼굴 인식 오류: '+e.message));}
      };tick();
    }catch(e){if(epoch!==this.epoch)return;const messages={NotAllowedError:'카메라 권한을 허용해주세요.',NotFoundError:'사용할 수 있는 카메라가 없어요.',NotReadableError:'다른 앱에서 카메라를 사용 중인지 확인해주세요.'};this.fail(Error(messages[e.name]||e.message||'카메라를 시작하지 못했어요.'));}
  }
  fail(error){this.stop();this.onStatus('error',error.message);this.onError(error);}
  drawFrame(){const v=this.video;if(!v.videoWidth||!v.videoHeight)return;const size=frameSize(v.videoWidth,v.videoHeight);if(this.canvas.width!==size.width||this.canvas.height!==size.height){this.canvas.width=size.width;this.canvas.height=size.height;}this.context.drawImage(v,0,0,size.width,size.height);}
  snapshot(){if(!this.active||this.video.readyState<2||performance.now()-this.lastFrameAt>1000)return null;this.drawFrame();return this.canvas.toDataURL('image/jpeg',.7).split(',')[1];}
}
