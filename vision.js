const VERSION='1.0.1';
export class FaceVision{
  constructor(video,onFace,onStatus,onError){this.video=video;this.onFace=onFace;this.onStatus=onStatus;this.onError=onError;this.active=false;this.loading=false;this.epoch=0;this.detector=null;this.stream=null;this.timer=null;this.facing='user';this.lastVideoTime=-1;this.lastFrameAt=0;this.canvas=document.createElement('canvas');this.canvas.width=320;this.canvas.height=240;}
  stop(){this.epoch++;clearTimeout(this.timer);this.active=false;this.loading=false;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.detector?.close();this.detector=null;this.onFace(null);this.onStatus('off','카메라 켜기');}
  async start(){
    this.stop();const epoch=this.epoch;this.loading=true;this.onStatus('loading','카메라 준비 중');let stream,detector;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS 또는 localhost에서 카메라를 사용할 수 있어요.');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:this.facing},width:{ideal:640},height:{ideal:480}},audio:false});
      if(epoch!==this.epoch){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      this.onStatus('loading','눈 맞추기 모델 준비 중');
      const {FaceDetector,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/vision_bundle.mjs');
      if(epoch!==this.epoch)return;
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/wasm');
      if(epoch!==this.epoch)return;
      const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',delegate:'GPU'},runningMode:'VIDEO',minDetectionConfidence:.6};
      try{detector=await FaceDetector.createFromOptions(files,options);}catch{options.baseOptions.delegate='CPU';detector=await FaceDetector.createFromOptions(files,options);}
      if(epoch!==this.epoch){detector.close();return;}
      this.detector=detector;this.active=true;this.loading=false;this.lastVideoTime=-1;this.lastFrameAt=performance.now();this.onStatus('ready','얼굴을 찾고 있어요');
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(epoch===this.epoch){this.stop();this.onError(Error('카메라 입력이 종료됐어요. 다시 켜주세요.'));}});
      const tick=()=>{
        if(epoch!==this.epoch||!this.active)return;
        try{
          if(!document.hidden&&this.video.readyState>=2&&this.video.currentTime!==this.lastVideoTime){
            this.lastVideoTime=this.video.currentTime;this.lastFrameAt=performance.now();this.drawFrame();
            const result=detector.detectForVideo(this.canvas,performance.now());
            const detection=result.detections?.sort((a,b)=>(b.boundingBox.width*b.boundingBox.height)-(a.boundingBox.width*a.boundingBox.height))[0];
            if(detection){const b=detection.boundingBox;let x=((b.originX+b.width/2)/320-.5)*2;this.onFace({x:this.facing==='user'?-x:x,y:((b.originY+b.height/2)/240-.5)*2});}else this.onFace(null);
          }else if(performance.now()-this.lastFrameAt>750)this.onFace(null);
          this.timer=setTimeout(tick,150);
        }catch(e){this.stop();this.onError(Error('얼굴 인식이 중단됐어요. 카메라를 다시 켜주세요.'));}
      };tick();
    }catch(e){if(epoch!==this.epoch)return;this.stop();const messages={NotAllowedError:'카메라 권한을 허용해주세요.',NotFoundError:'사용할 수 있는 카메라가 없어요.',NotReadableError:'다른 앱에서 카메라를 사용 중인지 확인해주세요.'};this.onError(Error(messages[e.name]||e.message||'카메라를 시작하지 못했어요.'));}
  }
  drawFrame(){const v=this.video;if(!v.videoWidth)return;const aspect=4/3;let sw=v.videoWidth,sh=v.videoHeight;if(sw/sh>aspect)sw=sh*aspect;else sh=sw/aspect;this.canvas.getContext('2d').drawImage(v,(v.videoWidth-sw)/2,(v.videoHeight-sh)/2,sw,sh,0,0,320,240);}
  snapshot(){if(!this.active||this.video.readyState<2||performance.now()-this.lastFrameAt>1000)return null;this.drawFrame();return this.canvas.toDataURL('image/jpeg',.7).split(',')[1];}
}
