import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {validatePlan,localPlan,motorPacket,isStopRequest,driveIntent,drivePlan} from '../core.js';
import {FaceTracker} from '../tracking.js';
import {frameSize,facePosition} from '../vision.js';
import {MotionController} from '../motion.js';
import {PonyBluetooth} from '../bluetooth.js';
import {encodeWav} from '../recorder.js';

test('motor packet is exactly 18 bytes, bounded, signed and ordered',()=>{
  assert.equal(motorPacket([40,40,-40,-40],300),'M+40+40-40-40T300\n');
  assert.equal(new TextEncoder().encode(motorPacket([-80,0,1,80],600,80)).length,18);
  assert.equal(motorPacket([100,-100,0,2],2000,35),'M+35-35+00+02T600\n');
  assert.equal(motorPacket([1,2,3,4],0,0),'M+00+00+00+00T050\n');
  for(const values of [[NaN,0,0,0],[Infinity,0,0,0],[1,2,3]])assert.throws(()=>motorPacket(values,100));
});
test('all AI data validated before execution; malformed and out of range rejected',()=>{
  const plan=localPlan('greet');assert.equal(validatePlan(plan).emotion,'happy');
  for(const invalid of [{...plan,emotion:'evil'},{...plan,intensity:NaN},{...plan,intensity:'1'},{...plan,caption:''},{...plan,motions:Array(7).fill(plan.motions[0])},{...plan,motions:[{motors:[1,2,3,81],ms:300}]},{...plan,motions:[{motors:[1,2,3,4],ms:601}]},{...plan,motions:[{motors:[1,2,3,'4'],ms:300}]}])assert.throws(()=>validatePlan(invalid));
  assert(isStopRequest('포니야 그만 움직여'));assert(isStopRequest('멈춰'));assert(!isStopRequest('안녕'));
});
test('stop invalidates an active sequence before later motor steps',async()=>{
  const sent=[],ble={connected:true,send:async p=>{sent.push(p);return true;}};
  const motion=new MotionController(ble);motion.armed=true;
  const run=motion.run([{motors:[30,30,-30,-30],ms:80},{motors:[-30,-30,30,30],ms:80}]);
  await new Promise(r=>setTimeout(r,15));await motion.cancel(true);await run;
  assert.equal(sent.filter(p=>p.startsWith('M')).length,1);assert.equal(sent.at(-1),'S\n');assert.equal(motion.armed,false);
});
test('two concurrent motions do not share a generation after awaiting stop',async()=>{
  const sent=[],ble={connected:true,send:async p=>{sent.push(p);await new Promise(r=>setTimeout(r,10));return true;}};
  const motion=new MotionController(ble);motion.armed=true;
  await Promise.all([motion.run([{motors:[20,20,20,20],ms:50}]),motion.run([{motors:[35,35,-35,-35],ms:50}])]);
  assert.deepEqual(sent.filter(p=>p.startsWith('M')),['M+35+35-35-35T050\n']);
});
test('BLE keeps writes serialized and stop drops queued moves',async()=>{
  let release;const sent=[];const b=new PonyBluetooth(()=>{},()=>{});
  b.device={gatt:{connected:true}};b.rx={writeValueWithResponse:async bytes=>{sent.push(new TextDecoder().decode(bytes));if(sent.length===1)await new Promise(r=>release=r);}};
  const a=b.send('M+20+20+20+20T100\n');const dropped=b.send('M+30+30+30+30T100\n');const stop=b.send('S\n',true);release();
  assert.equal(await dropped,false);await Promise.all([a,stop]);assert.deepEqual(sent,['M+20+20+20+20T100\n','S\n']);
});
test('a failed BLE write from a previous connection cannot tear down a new one',async()=>{
  let fail;const b=new PonyBluetooth(()=>{},()=>{});b.device={gatt:{connected:true}};b.rx={writeValueWithResponse:()=>new Promise((_,reject)=>fail=reject)};
  const old=b.send('S\n');b.clear('idle','');let disconnected=false;b.device={gatt:{connected:true,disconnect(){disconnected=true;}}};b.rx={writeValueWithResponse:async()=>{}};
  const next=b.send('S\n');fail(Error('old link lost'));assert.equal(await old,false);assert.equal(await next,true);assert.equal(disconnected,false);
});
test('48 kHz audio is encoded as 16 kHz mono PCM WAV',()=>{
  const wav=encodeWav([new Float32Array(4800).fill(.5)],48000),view=new DataView(wav);
  assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(wav.byteLength,44+1600*2);assert.equal(view.getInt16(44,true),16383);
});
test('receiver maps all four motors and expires without another command',()=>{
  const source=fs.readFileSync(new URL('../microbit/main.ts',import.meta.url),'utf8').replace(/: (string|number)\b/g,'');let receive,forever,disconnect,incoming='',now=0,stops=0;const motors=[];
  const context={aiPonybot:{Direction:{Clockwise:1,CounterClockwise:-1},DirectionControl:{Forward:1},runNormal(){},stopAllMotors(){stops++;},runMotor:(id,direction,speed)=>motors.push([id,direction,speed])},bluetooth:{onBluetoothConnected(){},onBluetoothDisconnected:cb=>disconnect=cb,onUartDataReceived:(_d,cb)=>receive=cb,uartReadUntil:()=>incoming,startUartService(){}},serial:{delimiters:()=> '\n'},Delimiters:{NewLine:1},input:{runningTime:()=>now},basic:{forever:cb=>forever=cb,pause(){}},Math,parseFloat};
  vm.runInNewContext(source,context);incoming='M+20-30+40-50T100';receive();assert.deepEqual(motors,[[1,1,51],[2,-1,77],[3,1,102],[4,-1,128]]);
  const before=stops;now=99;forever();assert.equal(stops,before);now=100;forever();assert.equal(stops,before+1);
  for(const invalid of ['M+90+00+00+00T100','M+20+20+20+20T999','M+xx+20+20+20T100','M+20+20+20+20T100junk','M+20+20+20+20T1e2','S']){incoming=invalid;receive();}
  assert.equal(motors.length,4);assert.equal(stops,before+7);disconnect();assert.equal(stops,before+8);
});

test('explicit direction commands are deterministic; questions and negations do not drive',()=>{
  for(const [text,direction] of [['앞으로','forward'],['포니야 앞으로 움직여줘','forward'],['뒤로 가','backward'],['왼쪽으로 돌아','left'],['오른쪽으로 돌아줘','right'],['please move forward','forward']])assert.equal(driveIntent(text),direction,text);
  for(const text of ['앞으로 가지 마','앞으로 말고 뒤로','앞으로 갈 수 있어?','앞으로 가면 어떻게 돼','앞으로라는 단어','오른쪽에 사람이 있어','안녕','뒤로 돌아보지 마'])assert.equal(driveIntent(text),null,text);
  assert.equal(motorPacket(drivePlan('forward').motions[0].motors,400),'M+45+45+45+45T400\n');
});
test('face tracking uses two observations, rotation only, center hysteresis, loss and reverse',()=>{
  const t=new FaceTracker();assert.equal(t.update({turnX:.8},1000),null);
  let step=t.update({turnX:.8},1120);assert.equal(step.direction,'right');assert.equal(step.motors[0],step.motors[1]);assert.equal(step.motors[0],-step.motors[2]);assert.equal(step.motors.reduce((a,b)=>a+b,0),0);
  for(let i=1;i<=10;i++)step=t.update({turnX:0},1120+i*120);assert.equal(step,null);
  assert.equal(t.update(null,2440),null);assert.equal(t.update({turnX:-.8},2560),null);assert.equal(t.update({turnX:-.8},2680,true).direction,'right');
  assert.equal(t.update({turnX:.8},4000),null,'stale observation must not keep a turn');
});
test('portrait camera preserves complete field of view; only display coordinates are mirrored',()=>{
  assert.deepEqual(frameSize(720,1280),{width:270,height:480});
  assert.deepEqual(frameSize(640,480),{width:480,height:360});
  const box={boundingBox:{originX:180,originY:120,width:54,height:96},categories:[{score:.95}]};
  const front=facePosition(box,270,480,true),rear=facePosition(box,270,480,false);
  assert.equal(front.x,-rear.x);assert.equal(front.turnX,rear.turnX);assert.equal(front.box.w,.2);assert.equal(front.box.h,.2);assert.equal(front.box.x,1-(180+54)/270);
});
test('tracking does not interleave with an action and disarming drops subsequent follow commands',async()=>{
  const sent=[],ble={connected:true,send:async p=>{sent.push(p);return true;}},m=new MotionController(ble);m.armed=true;
  const step={motors:[30,30,-30,-30],ms:50};assert.equal(await m.track(step),true);
  const action=m.run([{motors:[45,45,45,45],ms:60}]);assert.equal(await m.track(step),false);await action;
  await m.cancel(true);assert.equal(await m.track(step),false);assert.equal(sent.at(-1),'S\n');
});
