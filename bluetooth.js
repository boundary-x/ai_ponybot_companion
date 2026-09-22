import {STOP} from './core.js';
const SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e', RX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
export class PonyBluetooth{
  constructor(onState,onSent){this.onState=onState;this.onSent=onSent;this.device=null;this.rx=null;this.pending=[];this.writing=false;this.connecting=false;this.epoch=0;}
  get connected(){return Boolean(this.device?.gatt.connected&&this.rx);}
  async connect(){
    if(this.connecting||this.connected)return;
    if(!navigator.bluetooth)throw Error('블루투스를 지원하는 브라우저에서 열어주세요. iPhone은 Bluefy를 사용하세요.');
    this.connecting=true;const epoch=++this.epoch;this.onState('pending','기기를 선택해주세요');
    try{
      const device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'BBC micro:bit'}],optionalServices:[SERVICE]});
      if(epoch!==this.epoch)return;
      this.device=device;
      device.addEventListener('gattserverdisconnected',()=>{if(this.device===device)this.clear('idle','연결이 해제됐어요');});
      const server=await device.gatt.connect();
      if(epoch!==this.epoch){device.gatt.disconnect();return;}
      const service=await server.getPrimaryService(SERVICE);const rx=await service.getCharacteristic(RX);
      if(epoch!==this.epoch){device.gatt.disconnect();return;}
      this.rx=rx;await this.send(STOP,true);
      if(this.connected)this.onState('connected',device.name||'AI 포니봇');
    }catch(e){this.disconnect();if(e.name==='NotFoundError'){this.onState('idle','기기 선택을 취소했어요');return;}this.onState('error','연결하지 못했어요');throw e;}finally{this.connecting=false;}
  }
  clear(state,title){this.epoch++;this.rx=null;this.device=null;for(const job of this.pending)job.resolve(false);this.pending=[];this.onState(state,title);}
  disconnect(){const device=this.device;this.clear('idle','포니봇을 기다리고 있어요');if(device?.gatt.connected)device.gatt.disconnect();}
  send(packet,priority=false){
    if(!this.connected)return Promise.resolve(false);
    return new Promise((resolve,reject)=>{
      if(priority){for(const job of this.pending)job.resolve(false);this.pending=[];}
      this.pending.push({packet,resolve,reject,epoch:this.epoch,expires:performance.now()+400});this.drain();
    });
  }
  async drain(){
    if(this.writing)return;this.writing=true;
    try{
      while(this.pending.length&&this.connected){
        const job=this.pending.shift();if(job.epoch!==this.epoch||(job.packet!==STOP&&performance.now()>job.expires)){job.resolve(false);continue;}
        const rx=this.rx;let timer;
        try{
          const bytes=new TextEncoder().encode(job.packet);
          if(bytes.length>20)throw Error('명령 길이가 허용 범위를 벗어났습니다.');
          // The micro:bit UART RX supports write-with-response. No TX notifications are needed.
          const write=rx.writeValueWithResponse?rx.writeValueWithResponse(bytes):rx.writeValue(bytes);
          await Promise.race([write,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('블루투스 전송 응답이 지연됐어요. 다시 연결해주세요.')),1500);})]);
          if(job.epoch!==this.epoch){job.resolve(false);continue;}
          this.onSent(job.packet);job.resolve(true);
        }catch(e){if(job.epoch!==this.epoch){job.resolve(false);continue;}job.reject(e);const device=this.device;this.clear('error','전송이 중단됐어요');if(device?.gatt.connected)device.gatt.disconnect();break;}finally{clearTimeout(timer);}
      }
    }finally{this.writing=false;}
  }
}
