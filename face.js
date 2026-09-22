import {clamp} from './core.js?v=0.2.0';
// Original pixel artwork drawn on a small grid. No image assets or copied character art.
function block(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
function pixelOval(ctx,x,y,w,h,color){const cut=Math.max(1,Math.min(4,Math.floor(h/4)));block(ctx,x+cut,y,w-cut*2,h,color);block(ctx,x,y+cut,w,h-cut*2,color);if(cut>2){block(ctx,x+2,y+1,w-4,h-2,color);}}
const HEART=['01100110','11111111','11111111','01111110','00111100','00011000'];
function shape(ctx,rows,x,y,scale,color){for(let j=0;j<rows.length;j++)for(let i=0;i<rows[j].length;i++)if(rows[j][i]==='1')block(ctx,x+i*scale,y+j*scale,scale,scale,color);}
export function drawFace(canvas,emotion='curious',options={}){
  const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(w/192,h/112);
  const color=options.color||'#c3ffcb',dark=options.dark||'#101613',time=options.time||0;
  const x=(options.x||0)*9,y=(options.y||0)*5;
  const breath=options.still?0:Math.sin(time/1500)*.7;
  const blink=options.blink||0;
  let eyeW=30,eyeH=35;
  if(emotion==='surprised'){eyeW=34;eyeH=41;}
  if(emotion==='sleepy'){eyeH=9;}
  if(emotion==='calm'){eyeH=24;}
  if(emotion==='listening'){eyeH=38;}
  const centers=[67,125];
  for(let i=0;i<2;i++){
    const center=centers[i]+x;let top=42+y+breath;
    let height=eyeH;
    if(emotion==='curious'){height=i===0?35:27;top+=i===0?-3:3;}
    if(emotion==='thinking'){top+=i===0?2:-5;height=i===0?21:30;}
    height=Math.max(3,height*(1-blink));top+=(eyeH-height)/2;
    if(emotion==='love'&&blink<.6){shape(ctx,HEART,center-16,top,4,color);continue;}
    if(emotion==='happy'&&blink<.6){
      block(ctx,center-15,top+11,5,13,color);block(ctx,center-10,top+6,5,9,color);block(ctx,center-5,top+2,10,7,color);block(ctx,center+5,top+6,5,9,color);block(ctx,center+10,top+11,5,13,color);
    }else if(emotion==='sleepy'){
      block(ctx,center-15,top+14,8,4,color);block(ctx,center-7,top+17,14,4,color);block(ctx,center+7,top+14,8,4,color);
    }else{
      pixelOval(ctx,center-eyeW/2,top,eyeW,height,color);
      if(height>13){const pupilW=emotion==='surprised'?12:10;pixelOval(ctx,center-pupilW/2+(options.x||0)*3,top+height*.30+(options.y||0)*2,pupilW,height*.48,dark);block(ctx,center-6,top+4,4,4,'#eaffe9');}
    }
  }
  if(emotion==='love'||emotion==='happy'){
    block(ctx,43+x,73+y,7,3,'#779982');block(ctx,144+x,73+y,7,3,'#779982');
    block(ctx,90+x,81+y,3,3,color);block(ctx,93+x,84+y,7,2,color);block(ctx,100+x,81+y,3,3,color);
  }else if(emotion==='surprised')pixelOval(ctx,93+x,86+y,6,7,color);
  else if(emotion==='thinking'){
    for(let i=0;i<3;i++)block(ctx,88+i*7,85,3,3,(Math.floor(time/350)%3===i)?color:'#54765b');
  }else block(ctx,93+x,85+y,6,2,'#9ccba3');
  if(emotion==='sleepy'){const z=['11111','00010','00100','01000','11111'];shape(ctx,z,148,28+Math.sin(time/1200)*2,1,color);}
  ctx.restore();
}
export class PixelFace{
  constructor(canvas){this.canvas=canvas;this.emotion='curious';this.x=0;this.y=0;this.tx=0;this.ty=0;this.last=0;this.nextBlink=performance.now()+3000;this.blinkStart=-1000;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);}
  look(x,y){this.tx=clamp(x,-1,1);this.ty=clamp(y,-1,1);}
  set(emotion){this.emotion=emotion;}
  tick(t){requestAnimationFrame(this.tick);if(document.hidden||t-this.last<33)return;this.last=t;this.x+=(this.tx-this.x)*.15;this.y+=(this.ty-this.y)*.15;if(t>this.nextBlink){this.blinkStart=t;this.nextBlink=t+3000+Math.random()*4000;}const elapsed=t-this.blinkStart;const blink=elapsed>=0&&elapsed<180?Math.sin(elapsed/180*Math.PI):0;drawFace(this.canvas,this.emotion,{x:this.x,y:this.y,time:t,blink:this.reduced?0:blink,still:this.reduced});}
}
