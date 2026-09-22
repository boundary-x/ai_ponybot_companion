export class RobotAudio{
  constructor(){this.enabled=true;this.context=null;this.nodes=[];this.epoch=0;}
  async unlock(){if(!this.context)this.context=new (window.AudioContext||window.webkitAudioContext)();if(this.context.state==='suspended')await this.context.resume();}
  stop(){this.epoch++;for(const node of this.nodes){try{node.stop();}catch{}}this.nodes=[];}
  async play(kind='chirp',strength=.5){
    if(!this.enabled||kind==='none')return;
    this.stop();const epoch=this.epoch;await this.unlock();if(epoch!==this.epoch||!this.enabled)return;
    const melodies={hello:[523,659,784],chirp:[660,880],purr:[330,440,392,523],wonder:[392,622,440],sleep:[523,392,262]};
    const notes=melodies[kind]||melodies.chirp,variation=.97+Math.random()*.06;
    const start=this.context.currentTime+.015,duration=kind==='sleep'?.2:.09;
    notes.forEach((frequency,i)=>{
      const osc=this.context.createOscillator(),gain=this.context.createGain(),at=start+i*(duration+.045);
      osc.type='triangle';osc.frequency.setValueAtTime(frequency*variation,at);osc.frequency.exponentialRampToValueAtTime(frequency*(kind==='sleep'?.85:1.08)*variation,at+duration);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045+strength*.03,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      osc.connect(gain);gain.connect(this.context.destination);osc.start(at);osc.stop(at+duration+.01);this.nodes.push(osc);osc.onended=()=>{osc.disconnect();gain.disconnect();this.nodes=this.nodes.filter(n=>n!==osc);};
    });
  }
}
