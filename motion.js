import {motorPacket,STOP} from './core.js';
export class MotionController{
  constructor(ble,onError=()=>{}){this.ble=ble;this.onError=onError;this.armed=false;this.limit=50;this.epoch=0;}
  async cancel(disarm=false){this.epoch++;if(disarm)this.armed=false;try{await this.ble.send(STOP,true);}catch(e){this.armed=false;this.onError(e);}}
  async run(motions){
    const stopped=this.cancel(),epoch=this.epoch;await stopped;
    if(epoch!==this.epoch||!this.armed||!this.ble.connected)return;
    try{
      for(const step of motions){
        if(epoch!==this.epoch||!this.armed||!this.ble.connected)return;
        const sent=await this.ble.send(motorPacket(step.motors,step.ms,this.limit));
        if(!sent)break;
        if(epoch!==this.epoch)return;
        await new Promise(resolve=>setTimeout(resolve,step.ms));
      }
      if(epoch===this.epoch)await this.ble.send(STOP,true);
    }catch(e){this.armed=false;await this.cancel();this.onError(e);}
  }
}
