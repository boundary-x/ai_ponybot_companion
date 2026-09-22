export const EMOTIONS = ['curious','happy','love','surprised','sleepy','calm','listening','thinking'];
export const SOUNDS = ['hello','chirp','purr','wonder','sleep','none'];
export const LABELS = {curious:'호기심',happy:'기쁨',love:'애정',surprised:'놀람',sleepy:'졸림',calm:'편안함',listening:'듣는 중',thinking:'생각 중'};
export const STOP = 'S\n';
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
// Treat model output as untrusted data. Validate the entire plan before any side effect.
export function validatePlan(raw) {
  if (!raw || typeof raw !== 'object' || !EMOTIONS.includes(raw.emotion) || !SOUNDS.includes(raw.sound)) throw Error('AI 반응 형식이 올바르지 않습니다. 다시 시도해주세요.');
  if (typeof raw.caption !== 'string' || !raw.caption.trim() || raw.caption.length > 100) throw Error('AI 안내 문장이 올바르지 않습니다.');
  if (typeof raw.intensity !== 'number' || !Number.isFinite(raw.intensity) || raw.intensity < 0 || raw.intensity > 1) throw Error('AI 표현 강도가 허용 범위를 벗어났습니다.');
  if (!Array.isArray(raw.motions) || raw.motions.length > 6) throw Error('AI 동작은 최대 6개까지 실행할 수 있습니다.');
  const motions = raw.motions.map(m => {
    if (!m || !Array.isArray(m.motors) || m.motors.length !== 4 || m.motors.some(n => !Number.isInteger(n) || Math.abs(n)>80) || !Number.isInteger(m.ms) || m.ms < 50 || m.ms > 600) throw Error('AI 모터 명령이 허용 범위를 벗어났습니다.');
    return {motors:[...m.motors],ms:m.ms};
  });
  if(raw.heard !== undefined && (typeof raw.heard !== 'string' || raw.heard.length > 500)) throw Error('음성 인식 결과가 올바르지 않습니다.');
  return {emotion:raw.emotion,sound:raw.sound,caption:raw.caption.trim(),intensity:raw.intensity,motions,heard:raw.heard||''};
}
export function motorPacket(motors,ms,limit=50) {
  if (!Array.isArray(motors) || motors.length!==4 || motors.some(n=>!Number.isFinite(n)) || !Number.isFinite(ms) || !Number.isFinite(limit)) throw Error('잘못된 모터 값');
  const bound=clamp(Math.round(limit),0,80);
  const values=motors.map(n=>clamp(Math.round(n),-bound,bound));
  return 'M'+values.map(n=>(n<0?'-':'+')+String(Math.abs(n)).padStart(2,'0')).join('')+'T'+String(clamp(Math.round(ms),50,600)).padStart(3,'0')+'\n';
}
// Local interaction is intentionally labelled as basic reactions, not generative AI.
export function localPlan(kind,variant=0) {
  const swing=25+(variant%3)*6, ms=150+(variant%3)*45;
  const pair=[{motors:[-swing,-swing,swing,swing],ms},{motors:[0,0,0,0],ms:120},{motors:[swing,swing,-swing,-swing],ms}];
  const plans={
    greet:{emotion:'happy',sound:'hello',caption:['만나서 반가워요','다시 보니 더 반가워요','여기 있었군요!'][variant%3],intensity:.65,motions:pair},
    tickle:{emotion:'love',sound:'purr',caption:['간지러워요!','쓰다듬어 주니 좋아요','조금 더 놀아줄래요?'][variant%3],intensity:.85,motions:pair.slice(0,2)},
    surprise:{emotion:'surprised',sound:'wonder',caption:'앗, 깜짝이야!',intensity:.9,motions:[]},
    sleep:{emotion:'sleepy',sound:'sleep',caption:'잠깐 쉬어갈게요',intensity:.25,motions:[]},
    curious:{emotion:'curious',sound:'wonder',caption:'무슨 일인지 궁금해요',intensity:.5,motions:[]},
    calm:{emotion:'calm',sound:'chirp',caption:'함께 있으니 편안해요',intensity:.3,motions:[]}
  };
  return validatePlan(plans[kind]||plans.curious);
}
export function keywordReaction(text){if(/잘\s?자|졸|쉬어|sleep/i.test(text))return 'sleep';if(/귀여|좋아|사랑|예뻐|고마|쓰다듬/i.test(text))return 'tickle';if(/놀라|깜짝/i.test(text))return 'surprise';if(/안녕|반가|hello|hi\b/i.test(text))return 'greet';return 'curious';}
export function isStopRequest(text){return /멈춰|정지|그만|움직이지|stop\b/i.test(text);}

export const DRIVE_LABELS={forward:'앞으로',backward:'뒤로',left:'왼쪽 회전',right:'오른쪽 회전'};
export function driveIntent(text){
  // Negation, questions, or multiple directions never become incidental drive commands.
  if(isStopRequest(text)||/하지\s*마|가지\s*마|돌지\s*마|말고|않|금지|안\s*(가|움직|돌)|[?？]|뭐|어떻게|설명|가능|할\s*수|라는|라고|하면|면|까/.test(text))return null;
  const matches=[['forward',/앞으로|전진|\bforward\b/i],['backward',/뒤로|후진|\bbackward\b/i],['left',/왼쪽(?:으로)?|좌회전|\bleft\b/i],['right',/오른쪽(?:으로)?|우회전|\bright\b/i]].filter(([,re])=>re.test(text));
  if(matches.length!==1)return null;
  const remaining=text.replace(/포니야|포니|로봇아|로봇|poni|pony|robot/gi,'').replace(matches[0][1],'').replace(/움직여\s*줘|움직여|이동해\s*줘|이동해|돌아\s*줘|돌아|가\s*줘|가자|가세요|가|해\s*줘|해주세요|하세요|해|조금|잠깐|한번|한\s*번|please|move|go|turn|[\s.!。！]/gi,'');
  return remaining?null:matches[0][0];
}
export function drivePlan(direction){
  const speed=45,vectors={forward:[1,1,1,1],backward:[-1,-1,-1,-1],left:[1,1,-1,-1],right:[-1,-1,1,1]};
  if(!vectors[direction])throw Error('알 수 없는 방향');
  return validatePlan({emotion:'happy',sound:'chirp',caption:DRIVE_LABELS[direction]+' · 0.4초 동작',intensity:.45,motions:[{motors:vectors[direction].map(n=>n*speed),ms:400}]});
}
