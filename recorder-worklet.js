class PoniRecorder extends AudioWorkletProcessor{
  process(inputs,outputs){const data=inputs[0]?.[0];if(data)this.port.postMessage(data.slice());for(const channel of outputs[0]||[])channel.fill(0);return true;}
}
registerProcessor('poni-recorder',PoniRecorder);
