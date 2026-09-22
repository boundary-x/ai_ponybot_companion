import {clamp} from './core.js?v=0.2.0';

// Camera coordinates are unmirrored. Opposite wheel speeds only: never approach a face.
export class FaceTracker {
  constructor(){this.reset();}
  reset(){this.x=null;this.turn=0;this.samples=0;this.lastSeen=0;}
  update(position,now=performance.now(),reverse=false){
    if(!position||!Number.isFinite(position.turnX)){this.reset();return null;}
    if(now-this.lastSeen>500)this.reset();
    this.lastSeen=now;this.samples++;
    this.x=this.x===null?position.turnX:this.x*.55+position.turnX*.45;
    if(this.samples<2)return null;
    const x=this.x*(reverse?-1:1),magnitude=Math.abs(x);
    if(magnitude<.10)this.turn=0;
    else if(magnitude>.20)this.turn=Math.sign(x);
    if(!this.turn)return null;
    const speed=Math.round(clamp(24+(magnitude-.20)*24,24,42));
    const right=-this.turn*speed;
    return {motors:[right,right,-right,-right],ms:220,direction:this.turn>0?'right':'left'};
  }
}
