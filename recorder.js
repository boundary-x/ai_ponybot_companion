export function encodeWav(chunks,sampleRate){
  const length=chunks.reduce((n,c)=>n+c.length,0),joined=new Float32Array(length);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}
  const target=16000,count=Math.floor(length*target/sampleRate),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
  function ascii(i,s){for(let n=0;n<s.length;n++)view.setUint8(i+n,s.charCodeAt(n));}
  ascii(0,'RIFF');view.setUint32(4,36+count*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,target,true);view.setUint32(28,target*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const from=Math.floor(i*sampleRate/target),to=Math.max(from+1,Math.floor((i+1)*sampleRate/target));let value=0;for(let j=from;j<to&&j<length;j++)value+=joined[j];value=Math.max(-1,Math.min(1,value/(to-from)));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}
  return bytes;
}
export class HoldRecorder{
  constructor(){this.epoch=0;this.context=null;this.stream=null;this.node=null;this.source=null;this.chunks=[];this.active=false;this.loading=false;this.startedAt=0;}
  async start(){
    await this.cancel();const epoch=this.epoch;this.loading=true;
    let context,stream,node;
    try{
      context=new (window.AudioContext||window.webkitAudioContext)();this.context=context;await context.resume();
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(epoch!==this.epoch){stream.getTracks().forEach(t=>t.stop());await context.close().catch(()=>{});return false;}
      this.stream=stream;await context.audioWorklet.addModule('./recorder-worklet.js');
      if(epoch!==this.epoch)return false;
      node=new AudioWorkletNode(context,'poni-recorder');this.node=node;this.chunks=[];
      node.port.onmessage=e=>{if(this.active&&epoch===this.epoch&&this.chunks.length<4000)this.chunks.push(e.data);};
      this.source=context.createMediaStreamSource(stream);this.source.connect(node);node.connect(context.destination);this.startedAt=performance.now();this.active=true;this.loading=false;return true;
    }catch(e){if(epoch!==this.epoch)return false;await this.cancel();throw Error(e.name==='NotAllowedError'?'마이크 권한을 허용해주세요.':'마이크를 시작하지 못했어요. 브라우저와 권한을 확인해주세요.');}
  }
  async finish(){
    if(!this.active){await this.cancel();return null;}
    const chunks=this.chunks,rate=this.context.sampleRate,duration=performance.now()-this.startedAt;await this.cancel();
    if(duration<350||!chunks.length)return null;
    const buffer=encodeWav(chunks,rate),data=new Uint8Array(buffer);let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary);
  }
  async cancel(){this.epoch++;this.active=false;this.loading=false;this.node?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());const ctx=this.context;this.context=null;this.stream=null;this.node=null;this.source=null;this.chunks=[];if(ctx&&ctx.state!=='closed')await ctx.close().catch(()=>{});}
}
