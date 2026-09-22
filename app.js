import {EMOTIONS,LABELS,localPlan,keywordReaction,isStopRequest,validatePlan,driveIntent,drivePlan,DRIVE_LABELS} from './core.js?v=0.2.0';
import {PixelFace,drawFace} from './face.js?v=0.2.0';
import {RobotAudio} from './audio.js?v=0.2.0';
import {PonyBluetooth} from './bluetooth.js?v=0.2.0';
import {MotionController} from './motion.js?v=0.2.0';
import {GeminiBrain} from './ai.js?v=0.2.0';
import {FaceVision} from './vision.js?v=0.2.0';
import {HoldRecorder} from './recorder.js?v=0.2.0';
import {FaceTracker} from './tracking.js?v=0.2.0';
const $=id=>document.getElementById(id);
const face=new PixelFace($('face')),sound=new RobotAudio(),brain=new GeminiBrain(),recorder=new HoldRecorder();
let generation=0,busy=false,holding=false,recordTimer=null,noticeTimer=null,resetTimer=null,lastInteraction=Date.now(),lastFace=0,lastWelcome=0,lastAuto=Date.now(),variant=0,wakeLock=null;
let settings={shareScene:false,autoScene:false},scenePresent=false,trackingPosition=null,trackingPauseUntil=0;
const tracker=new FaceTracker();
function movementState(state,message){$('move-status').textContent=message;$('move-status').parentElement.dataset.state=state;}
function haltTracking(message){if(motion.owner==='tracking'){motion.stopTracking();movementState('idle',message);}}
function showHeard(text){$('heard-text').textContent='인식한 말: '+text;}
function placeCameraPreview(){
  const preview=$('camera-preview'),anchor=$('camera-anchor');
  const immersive=document.body.classList.contains('immersive');
  if(immersive&&preview.parentElement!==$('face-stage'))$('face-stage').append(preview);
  if(!immersive&&preview.parentElement!==anchor)anchor.append(preview);
  const rect=anchor.getBoundingClientRect();
  preview.classList.toggle('camera-floating',!preview.hidden&&(immersive||rect.top<0||rect.bottom>innerHeight));
}
window.addEventListener('scroll',placeCameraPreview,{passive:true});window.addEventListener('resize',placeCameraPreview);

function notify(message,error=false){$('notice').textContent=message;$('notice').dataset.error=String(error);$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,error?6500:3800);}
function remember(title,detail){const li=document.createElement('li'),dot=document.createElement('i'),body=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small'),time=document.createElement('time');strong.textContent=title;small.textContent=detail;time.textContent=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});body.append(strong,small);li.append(dot,body,time);$('moments').prepend(li);while($('moments').children.length>3)$('moments').lastChild.remove();}
function showEmotion(emotion,caption){face.set(emotion);$('face-state').textContent=LABELS[emotion];$('face-caption').textContent=caption;for(const button of document.querySelectorAll('.expression-button'))button.setAttribute('aria-pressed',String(button.dataset.emotion===emotion));}
const ble=new PonyBluetooth((state,title)=>{
  $('ble-status').dataset.state=state;$('ble-title').textContent=title;
  $('ble-description').textContent=state==='connected'?'마이크로비트와 연결됐어요':state==='error'?'전원과 수신 코드를 확인해주세요':'마이크로비트 블루투스 연결';
  $('connect-button').textContent=state==='connected'?'연결 해제하기':state==='pending'?'연결 중…':'포니봇 연결하기 ↗';$('connect-button').disabled=state==='pending';$('motion-toggle').disabled=state!=='connected';
  if(state!=='connected'){$('motion-toggle').checked=false;motion.armed=false;motion.owner=null;generation++;brain.cancel();busy=false;motion.epoch++;tracker.reset();updateTalk();}movementState(state==='connected'?'idle':'blocked',state==='connected'?'연결됨 · 몸짓 함께하기를 켜주세요':'포니봇을 먼저 연결해주세요');
  $('motion-hint').textContent=state==='connected'?'켜면 포니봇이 몸짓으로 반응해요':'연결 후 켤 수 있어요';
},packet=>{$('last-packet').textContent=packet.trim();$('visible-packet').textContent='전송: '+packet.trim();});
const motion=new MotionController(ble,e=>{notify(e.message,true);$('motion-toggle').checked=false;$('motion-hint').textContent='전송이 중단됐어요. 다시 연결해주세요.';movementState('error',e.message);},movementState);
const vision=new FaceVision($('camera-video'),position=>{
  const now=Date.now();scenePresent=Boolean(position);trackingPosition=position;
  const box=$('face-box');box.hidden=!position;
  if(position){const b=position.box;box.style.left=b.x*100+'%';box.style.top=b.y*100+'%';box.style.width=b.w*100+'%';box.style.height=b.h*100+'%';}
  else{tracker.reset();haltTracking('얼굴 미감지 · 추적 회전 정지');}
  if($('camera-video').videoWidth)$('camera-preview').style.setProperty('--camera-aspect',$('camera-video').videoWidth+'/'+$('camera-video').videoHeight);
  if(position){lastFace=now;face.look(position.x,position.y);$('vision-status').textContent='얼굴 감지 · '+Math.round(position.score*100)+'%';if(now-lastWelcome>15000&&now-lastInteraction>5000&&!busy&&!holding){lastWelcome=now;showEmotion('happy','눈이 마주쳤네요');clearTimeout(resetTimer);resetTimer=setTimeout(()=>{if(!busy&&!holding)showEmotion('curious','당신을 바라보고 있어요');},2200);}}
  else{face.look(0,0);$('vision-status').textContent='얼굴을 찾고 있어요';}
},(state,title)=>{
  $('camera-label').textContent=state==='error'?'다시 켜기':title;
  $('vision-detail').textContent=state==='off'?'카메라를 켜면 얼굴 인식 박스를 확인할 수 있어요.':title;
  $('vision-detail').dataset.state=state;
  $('camera-preview').hidden=state==='off'||state==='error';
  $('camera-button').setAttribute('aria-pressed',String(state==='ready'||state==='stalled'));
  $('camera-button').querySelector('.capability-arrow').textContent=state==='off'||state==='error'?'+':'−';
  if(state==='loading'||state==='stalled')$('vision-status').textContent=title;
  placeCameraPreview();
},e=>notify(e.message,true));
setInterval(()=>{
  const eligible=$('tracking-toggle').checked&&vision.active&&!motion.blockedReason()&&!busy&&!holding&&!document.hidden&&!$('ai-dialog').open&&Date.now()>trackingPauseUntil&&motion.owner!=='action';
  if(!eligible){tracker.reset();haltTracking('얼굴 추적 잠시 멈춤');$('tracking-hint').textContent=motion.blockedReason()||(!vision.active?'카메라를 켜주세요':!$('tracking-toggle').checked?'얼굴 추적 꺼짐':'다른 반응이 끝나면 추적을 이어가요');return;}
  const fresh=trackingPosition&&Date.now()-lastFace<450;
  // Each camera observation is consumed once, never reused as a new detection.
  if(!fresh){tracker.reset();haltTracking('얼굴 미감지 · 추적 회전 정지');$('tracking-hint').textContent='얼굴을 찾는 중 · 회전 정지';return;}
  if(tracker.lastSeen===lastFace)return;
  const step=tracker.update(trackingPosition,lastFace,$('tracking-reverse').checked);
  $('tracking-hint').textContent=step?(step.direction==='left'?'왼쪽':'오른쪽')+' 회전으로 얼굴을 따라가요':'얼굴 중앙 맞추기 · 정지';
  if(step){motion.track(step).then(sent=>{if(sent){movementState('sent','얼굴 추적 · '+DRIVE_LABELS[step.direction]);$('chosen-action').textContent='선택한 동작: '+DRIVE_LABELS[step.direction];}});}
  else haltTracking('얼굴 중앙 · 추적 회전 정지');
},100);
$('tracking-toggle').addEventListener('change',()=>{tracker.reset();haltTracking('얼굴 추적 설정 변경 · 정지');});
$('tracking-reverse').addEventListener('change',()=>{tracker.reset();haltTracking('추적 방향 변경 · 정지');});
function updateTalk(){
  $('talk-button').classList.toggle('recording',recorder.active);
  const text=recorder.active?'듣고 있어요 · 떼면 반응':holding?'마이크 준비 중…':busy?'반응을 생각하고 있어요':'누르고 말하기';
  $('talk-label').textContent=text;$('immersive-talk').textContent=text;
  $('talk-hint').textContent=brain.connected?'누르는 동안 듣고, 떼면 반응해요. 최대 8초.':'누르는 동안 듣고, 떼면 반응해요. 음성은 AI 연결 후 사용할 수 있어요.';
}
function interrupt(disarm=false){tracker.reset();trackingPauseUntil=Date.now()+1200;generation++;brain.cancel();busy=false;holding=false;clearTimeout(recordTimer);clearTimeout(resetTimer);recorder.cancel();sound.stop();motion.cancel(disarm);if(disarm){$('motion-toggle').checked=false;$('motion-hint').textContent=ble.connected?'다시 켜면 몸짓을 시작할 수 있어요':'연결 후 켤 수 있어요';}updateTalk();return generation;}
function emergency(message='모든 동작을 멈췄어요'){interrupt(true);showEmotion('calm','잠깐 멈춰 있을게요');lastInteraction=Date.now();notify(message);remember('동작 정지','새 명령과 몸짓 켜기로 다시 시작');movementState('idle','정지 · 몸짓 함께하기를 다시 켜면 움직여요');$('chosen-action').textContent='선택한 동작: 정지';}
function express(raw,source,token=generation){
  if(token!==generation||document.hidden)return;
  const plan=validatePlan(raw);lastInteraction=Date.now();showEmotion(plan.emotion,plan.caption);sound.play(plan.sound,plan.intensity).catch(()=>notify('효과음을 재생하려면 화면을 한 번 터치해주세요.'));
  remember(plan.heard?'“'+plan.heard.slice(0,55)+'”':plan.caption,source+' · '+LABELS[plan.emotion]);
  $('chosen-action').textContent='선택한 동작: '+(plan.motions.length?plan.caption:'표정·효과음');
  if(plan.motions.length&&motion.blockedReason()){movementState('blocked',motion.blockedReason());$('face-caption').textContent='동작 대기 · '+motion.blockedReason();notify(motion.blockedReason());}
  else motion.run(plan.motions);
  clearTimeout(resetTimer);if(plan.emotion!=='sleepy')resetTimer=setTimeout(()=>{if(token===generation&&!busy&&!holding)showEmotion('curious',scenePresent?'당신을 바라보고 있어요':'다음 순간을 기다려요');},6000);
}
function basicReaction(kind){const token=interrupt();sound.unlock().catch(()=>{});express(localPlan(kind,variant++),'기본 반응',token);}
async function askAI(text='',audio=null,automatic=false){
  if(!brain.connected)return;
  const previousReaction=face.emotion,token=interrupt();busy=true;lastInteraction=Date.now();showEmotion('thinking','잠깐, 마음을 읽고 있어요');updateTalk();
  const allowedAtRequest=motion.armed;
  try{
    const image=settings.shareScene?vision.snapshot():null;
    if(automatic&&!image)return;
    const plan=await brain.request({text,audio,image,context:{motorsEnabled:allowedAtRequest,maxMotorSpeed:motion.limit,faceVisible:scenePresent&&Date.now()-lastFace<1000,currentReaction:previousReaction,automatic}});
    if(token!==generation||document.hidden)return;
    const heard=audio?plan.heard:text;if(!automatic&&heard)showHeard(heard);
    if(!automatic&&isStopRequest(heard)){emergency();return;}
    const direction=!automatic&&driveIntent(heard);
    if(direction){const command=drivePlan(direction);command.heard=heard;express(command,'방향 명령',token);}
    else{if(!allowedAtRequest)plan.motions=[];express(plan,'생성형 AI',token);}
  }catch(e){if(token!==generation||e.name==='AbortError')return;motion.cancel(true);$('motion-toggle').checked=false;showEmotion('curious','다시 한번 말해줄래요?');notify(e.message,true);remember('AI 반응을 받지 못했어요',e.message);if(automatic){settings.autoScene=false;$('auto-scene').checked=false;}}
  finally{if(token===generation){busy=false;updateTalk();}}
}
for(const button of document.querySelectorAll('[data-reaction]'))button.addEventListener('click',()=>basicReaction(button.dataset.reaction));
$('face').addEventListener('click',()=>basicReaction('tickle'));$('pet-hint').addEventListener('click',()=>basicReaction('tickle'));
$('face').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();basicReaction('tickle');}});
$('face').addEventListener('pointermove',e=>{if(scenePresent)return;const r=$('face').getBoundingClientRect();face.look((e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1);});
$('face').addEventListener('pointerleave',()=>{if(!scenePresent)face.look(0,0);});
for(const emotion of ['curious','happy','love','surprised','sleepy','calm']){
  const b=document.createElement('button');b.className='expression-button';b.dataset.emotion=emotion;b.setAttribute('aria-pressed',String(emotion==='curious'));const c=document.createElement('canvas');c.width=96;c.height=74;c.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=LABELS[emotion];b.append(c,label);$('expression-list').append(b);drawFace(c,emotion,{color:'#657f5b',dark:'#e9ede2',still:true});b.addEventListener('click',()=>{const token=interrupt();const plan=localPlan(({happy:'greet',love:'tickle',surprised:'surprise',sleepy:'sleep'})[emotion]||emotion,variant++);plan.motions=[];express(plan,'표정 살펴보기',token);});
}
for(const mini of document.querySelectorAll('[data-mini]')){const c=document.createElement('canvas');c.width=48;c.height=28;mini.append(c);drawFace(c,mini.dataset.mini,{color:'#759368',dark:'#f9faf7',still:true});}
function commandMove(direction,heard){const token=interrupt();showHeard(heard);const plan=drivePlan(direction);plan.heard=heard;express(plan,'방향 명령',token);}
for(const button of document.querySelectorAll('[data-drive]'))button.addEventListener('click',()=>commandMove(button.dataset.drive,'버튼 · '+DRIVE_LABELS[button.dataset.drive]));
$('message-form').addEventListener('submit',e=>{e.preventDefault();const text=$('message').value.trim();if(!text)return;$('message').value='';showHeard(text);if(isStopRequest(text)){emergency();return;}const direction=driveIntent(text);if(direction){commandMove(direction,text);return;}if(brain.connected)askAI(text);else{basicReaction(keywordReaction(text));if(keywordReaction(text)==='curious')notify('기본 모드는 간단한 반응을 보여줘요. 자유로운 말은 AI를 연결해주세요.');}});
$('sound-button').addEventListener('click',()=>{sound.enabled=!sound.enabled;$('sound-button').setAttribute('aria-pressed',String(sound.enabled));$('sound-button').setAttribute('aria-label',sound.enabled?'효과음 끄기':'효과음 켜기');if(sound.enabled)sound.play('chirp').catch(()=>{});else sound.stop();});
$('connect-button').addEventListener('click',async()=>{interrupt(true);if(ble.connected){await motion.cancel(true);ble.disconnect();return;}try{await ble.connect();if(ble.connected)remember('포니봇이 연결됐어요','몸짓 함께하기를 켜서 움직이기');}catch(e){notify(e.message,true);}});
$('motion-toggle').addEventListener('change',()=>{const armed=$('motion-toggle').checked;interrupt(true);motion.armed=armed&&ble.connected;$('motion-toggle').checked=motion.armed;$('motion-hint').textContent=motion.armed?'표정과 함께 작은 몸짓을 보내요':'몸짓이 꺼져 있어요';movementState(motion.armed?'ready':'blocked',motion.armed?'몸짓 켜짐 · 방향 명령과 얼굴 추적을 사용할 수 있어요':'몸짓 함께하기를 켜주세요');notify(motion.armed?'몸짓을 켰어요. 바닥의 빈 공간에서 함께해주세요.':'몸짓을 껐어요.');});
for(const id of ['stop-button','immersive-stop'])$(id).addEventListener('click',()=>emergency());
$('camera-button').addEventListener('click',()=>{interrupt();if(vision.active||vision.loading){vision.stop();settings.autoScene=false;$('auto-scene').checked=false;}else vision.start();});
$('camera-flip').addEventListener('click',()=>{interrupt();vision.facing=vision.facing==='user'?'environment':'user';$('camera-video').style.transform=vision.facing==='user'?'scaleX(-1)':'none';vision.start();});
function openAI(){interrupt();$('ai-dialog').showModal();}
$('ai-button').addEventListener('click',openAI);
$('ai-save').addEventListener('click',async()=>{
  const key=$('api-key').value.trim(),model=$('ai-model').value.trim();
  if(!key){$('ai-status').textContent='본인의 Gemini API 키를 입력해주세요.';$('ai-status').dataset.error='true';return;}
  const token=interrupt();$('ai-save').disabled=true;$('ai-status').textContent='AI 연결을 확인하고 있어요…';$('ai-status').dataset.error='false';
  try{
    await brain.request({key,model,test:true});
    if(token!==generation||!$('ai-dialog').open)return;
    brain.key=key;brain.model=model;brain.history=[];settings={shareScene:$('share-scene').checked,autoScene:$('auto-scene').checked&&$('share-scene').checked};$('auto-scene').checked=settings.autoScene;lastAuto=Date.now();
    $('ai-label').textContent='연결됨 · '+model;$('mode-label').textContent='AI 교감 모드';$('ai-status').textContent='AI 연결을 확인했어요.';$('ai-dialog').close();showEmotion('happy','마음이 연결됐어요');notify('이제 포니가 말의 뜻을 이해하고 반응해요.');remember('AI와 마음이 연결됐어요',model);updateTalk();
  }catch(e){if(token!==generation||e.name==='AbortError')return;$('ai-status').textContent=e.message;$('ai-status').dataset.error='true';}
  finally{$('ai-save').disabled=false;}
});
$('ai-dialog').addEventListener('close',()=>{generation++;brain.cancel();$('ai-save').disabled=false;});
$('ai-disconnect').addEventListener('click',()=>{interrupt(true);brain.clear();settings={shareScene:false,autoScene:false};$('api-key').value='';$('share-scene').checked=false;$('auto-scene').checked=false;$('ai-label').textContent='생성형 AI 연결';$('mode-label').textContent='기본 반응 모드';$('ai-status').textContent='AI 연결을 해제했어요. 키와 대화 맥락을 지웠습니다.';$('ai-status').dataset.error='false';showEmotion('calm','편안하게 함께할게요');updateTalk();});
$('share-scene').addEventListener('change',()=>{if(!$('share-scene').checked){$('auto-scene').checked=false;settings.shareScene=false;settings.autoScene=false;interrupt(true);}});
$('auto-scene').addEventListener('change',()=>{if(!$('auto-scene').checked){settings.autoScene=false;interrupt(true);}else if(!$('share-scene').checked){$('auto-scene').checked=false;notify('주변 반응에는 카메라 사진 공유가 필요해요.');}});
$('motor-limit').addEventListener('input',()=>{$('motor-limit-label').textContent=$('motor-limit').value+'%';motion.limit=Number($('motor-limit').value);motion.cancel();});
async function startTalking(){
  if(holding)return;
  if(!brain.connected){openAI();return;}
  const token=interrupt();holding=true;showEmotion('listening','마이크를 준비하고 있어요');updateTalk();
  try{const ready=await recorder.start();if(token!==generation||!holding||!ready)return;showEmotion('listening','듣고 있어요. 손을 떼면 반응해요');updateTalk();recordTimer=setTimeout(()=>finishTalking(),8000);}catch(e){if(token!==generation)return;holding=false;showEmotion('curious','마이크를 확인해주세요');updateTalk();notify(e.message,true);}
}
async function finishTalking(cancel=false){
  if(!holding)return;
  const token=generation;holding=false;clearTimeout(recordTimer);const wasActive=recorder.active;
  if(cancel){await recorder.cancel();if(token===generation){showEmotion('curious','다시 말해줄래요?');updateTalk();}return;}
  const audio=await recorder.finish();if(token!==generation)return;updateTalk();
  if(audio){askAI('Listen to this audio and react nonverbally. Include transcription in heard.',audio);}else{showEmotion('curious','버튼을 누른 채 말해주세요');notify(wasActive?'조금 더 길게 말해주세요.':'마이크 준비 후 버튼을 다시 누르고 말해주세요.');}
}
for(const id of ['talk-button','immersive-talk']){const b=$(id);b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);startTalking();});b.addEventListener('pointerup',()=>finishTalking());b.addEventListener('pointercancel',()=>finishTalking(true));b.addEventListener('lostpointercapture',()=>{if(holding)finishTalking(true);});b.addEventListener('contextmenu',e=>e.preventDefault());b.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();startTalking();}});b.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();finishTalking();}});}
async function immersive(on){
  document.body.classList.toggle('immersive',on);placeCameraPreview();$('immersive-button').setAttribute('aria-label',on?'로봇 얼굴 전체 화면 나가기':'로봇 얼굴 전체 화면');
  if(on){try{await document.documentElement.requestFullscreen?.();}catch{}try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}$('immersive-exit').focus();}
  else{if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});await wakeLock?.release().catch(()=>{});wakeLock=null;$('immersive-button').focus();}
}
$('immersive-button').addEventListener('click',()=>immersive(!document.body.classList.contains('immersive')));$('immersive-exit').addEventListener('click',()=>immersive(false));
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('immersive')){document.body.classList.remove('immersive');placeCameraPreview();wakeLock?.release().catch(()=>{});wakeLock=null;}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.body.classList.contains('immersive'))immersive(false);emergency();}});
$('help-button').addEventListener('click',()=>{interrupt(true);$('support').open=true;$('support').scrollIntoView({behavior:'smooth',block:'start'});});
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt(true);face.look(0,0);scenePresent=false;showEmotion('calm','돌아오면 다시 만나요');}else{lastAuto=Date.now();updateTalk();}});
window.addEventListener('pagehide',()=>{interrupt(true);vision.stop();ble.disconnect();});
window.addEventListener('blur',()=>{if(holding)finishTalking(true);});
setInterval(()=>{
  if(document.hidden||busy||holding||$('ai-dialog').open)return;
  const now=Date.now();
  if(brain.connected&&settings.autoScene&&settings.shareScene&&vision.active&&now-lastAuto>=15000){lastAuto=now;askAI('Observe the current scene and offer a subtle pet reaction. No need to greet repeatedly.',null,true);return;}
  if(now-lastInteraction>60000&&face.emotion!=='sleepy'){showEmotion('sleepy','잠깐 쉬고 있어요');}
  if(!scenePresent&&face.emotion!=='sleepy')face.look(Math.sin(now/4500)*.35,Math.cos(now/6500)*.15);
},1000);
// Public, read-only diagnostics intentionally exclude credentials and media.
window.poniDiagnostics=()=>({emotion:face.emotion,aiConnected:brain.connected,bluetoothConnected:ble.connected,motorsEnabled:motion.armed,cameraActive:vision.active,cameraFrames:vision.frames,faceDetected:scenePresent,trackingEnabled:$('tracking-toggle').checked,trackingDirection:tracker.turn,motionOwner:motion.owner,busy,recording:recorder.active,packet:$('last-packet').textContent});
