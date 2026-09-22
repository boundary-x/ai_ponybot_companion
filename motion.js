import {motorPacket,STOP} from './core.js?v=0.2.0';
export class MotionController{
  constructor(ble,onError=()=>{},onState=()=>{}){this.ble=ble;this.onError=onError;this.onState=onState;this.armed=false;this.limit=50;this.epoch=0;this.owner=null;this.trackingWrite=false;}
  blockedReason(){return !this.ble.connected?'포니봇을 먼저 연결해주세요':!this.armed?'몸짓 함께하기를 켜주세요':'';}
  async cancel(disarm=false){this.epoch++;this.owner=null;if(disarm)this.armed=false;try{await this.ble.send(STOP,true);}catch(e){this.armed=false;this.onError(e);}}
  stopTracking(){if(this.owner==='tracking')return this.cancel();}
  async track(step){
    if(this.blockedReason()||this.owner==='action'||this.trackingWrite)return false;
    const epoch=this.epoch;this.owner='tracking';this.trackingWrite=true;
    try{const sent=await this.ble.send(motorPacket(step.motors,step.ms,this.limit));return epoch===this.epoch&&sent;}
    catch(e){if(epoch===this.epoch){this.armed=false;await this.cancel();this.onError(e);}return false;}
    finally{this.trackingWrite=false;}
  }
  async run(motions){
    const stopped=this.cancel(),epoch=this.epoch;this.owner='action';await stopped;
    if(epoch!==this.epoch)return;
    const reason=this.blockedReason();
    if(reason){this.owner=null;this.onState('blocked',reason);return;}
    if(!motions.length){this.owner=null;this.onState('idle','이번 반응은 표정과 소리만 표현해요');return;}
    try{
      for(const step of motions){
        if(epoch!==this.epoch||!this.armed||!this.ble.connected)return;
        const sent=await this.ble.send(motorPacket(step.motors,step.ms,this.limit));
        if(!sent)break;
        if(epoch!==this.epoch)return;
        this.onState('sent','모터 명령 전송 · '+(step.ms/1000).toFixed(2)+'초');
        await new Promise(resolve=>setTimeout(resolve,step.ms));
      }
      if(epoch===this.epoch){await this.ble.send(STOP,true);this.onState('idle','동작 시간 완료 · 정지 명령 전송');}
    }catch(e){if(epoch===this.epoch){this.armed=false;await this.cancel();this.onError(e);}}
    finally{if(epoch===this.epoch)this.owner=null;}
  }
}
