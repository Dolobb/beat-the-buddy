export function createSFX(muted = false) {
  let context, noise, voices = [];
  function unlock() {
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        noise = context.createBuffer(1,context.sampleRate*2,context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i=0;i<samples.length;i++) samples[i]=Math.random()*2-1;
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio can be unavailable in restricted WebViews. */ }
  }
  function tone(freq,end,duration,volume,type = 'sine',delay = 0) {
    if (!context || muted || context.state !== 'running') return;
    while (voices.length >= 12) { const old = voices.shift(); try { old.stop(); } catch {} }
    const time=context.currentTime+delay, gain=context.createGain();
    const source = type==='noise'?context.createBufferSource():context.createOscillator();
    if (type==='noise') {
      source.buffer=noise;
      const filter=context.createBiquadFilter(); filter.type='lowpass';filter.frequency.value=freq;
      source.connect(filter);filter.connect(gain);
    } else {
      source.type=type;source.frequency.setValueAtTime(freq,time);
      source.frequency.exponentialRampToValueAtTime(Math.max(20,end),time+duration);source.connect(gain);
    }
    gain.connect(context.destination);gain.gain.setValueAtTime(.001,time);
    gain.gain.exponentialRampToValueAtTime(volume,time+.005);
    gain.gain.exponentialRampToValueAtTime(.001,time+duration);
    voices.push(source); source.onended=()=>{ voices=voices.filter(v=>v!==source);gain.disconnect();source.disconnect(); };
    source.start(time);source.stop(time+duration+.01);
  }
  return {
    unlock,
    setMuted(value) { muted=value; if(muted) for(const v of [...voices]) { try {v.stop();} catch {} } },
    play(name) {
      switch(name) {
        case 'punch': tone(130,38,.16,.25);tone(650,20,.09,.12,'noise');break;
        case 'slap': tone(2200,20,.1,.14,'noise');break;
        case 'shot': tone(1800,20,.08,.12,'noise');tone(140,40,.08,.12,'square');break;
        case 'laser': tone(1200,100,.1,.09,'sawtooth');break;
        case 'boom': tone(350,20,.9,.3,'noise');tone(70,22,.65,.28);break;
        case 'coin': tone(880,1400,.09,.07);break;
        case 'buy': tone(660,660,.13,.15);tone(990,990,.2,.15,'sine',.1);break;
        case 'ko': tone(330,100,.4,.2,'triangle');tone(440,55,.5,.15,'triangle',.1);break;
        case 'ui-click': tone(500,700,.035,.07);break;
      }
    },
  };
}
