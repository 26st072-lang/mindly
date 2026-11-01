/* An original, quiet ambient score synthesized locally. No microphone,
   external audio requests, autoplay prompts or third-party recordings. */
const musicState={enabled:false,starting:false,context:null,instrument:null,timer:null,nextBar:0,bar:0,suspendTimer:null};
function musicControlHTML(){
  if(!(window.AudioContext||window.webkitAudioContext))return '';
  const label=musicState.starting?'배경음악 준비 중':musicState.enabled?'배경음악 끄기':'배경음악 켜기';
  return `<button class="music-control ${musicState.enabled?'is-on':''}" data-key="music-control" type="button" onclick="toggleBackgroundMusic()" aria-label="${label}" title="${label}" aria-pressed="${musicState.enabled}" ${musicState.starting?'disabled aria-busy="true"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 18V6l10-2v12M9 9l10-2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="16" cy="16" rx="3" ry="2.5"/>${musicState.enabled?'':'<path d="m3 3 18 18" stroke-width="1.4"/>'}</svg></button>`;
}

function createAmbientInstrument(context){
  const input=context.createGain(),filter=context.createBiquadFilter(),dry=context.createGain(),wet=context.createGain(),reverb=context.createConvolver(),compressor=context.createDynamicsCompressor(),master=context.createGain();
  filter.type='lowpass';filter.frequency.value=2400;filter.Q.value=.45;
  dry.gain.value=.85;wet.gain.value=.17;master.gain.value=0;
  compressor.threshold.value=-20;compressor.knee.value=18;compressor.ratio.value=3;compressor.attack.value=.01;compressor.release.value=.4;
  const impulse=context.createBuffer(2,Math.ceil(context.sampleRate*2.8),context.sampleRate);
  let seed=17;
  for(let channel=0;channel<2;channel++){
    const data=impulse.getChannelData(channel);let previous=0;
    for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;previous=previous*.7+(seed/2147483647*2-1)*.3;data[i]=previous*Math.pow(1-i/data.length,3);}
  }
  reverb.buffer=impulse;
  input.connect(filter);filter.connect(dry);filter.connect(reverb);reverb.connect(wet);dry.connect(compressor);wet.connect(compressor);compressor.connect(master);master.connect(context.destination);
  const voices=new Set();
  function releaseVoice(voice){
    if(!voices.delete(voice))return;
    clearTimeout(voice.cleanupTimer);
    for(const oscillator of voice.oscillators){oscillator.onended=null;oscillator.disconnect();}
    voice.envelope.disconnect();voice.overtone.disconnect();
  }
  function note(frequency,start,duration,pad=false){
    const envelope=context.createGain(),overtone=context.createGain(),oscillators=[context.createOscillator(),context.createOscillator()];
    const peak=pad?.065:.085;
    envelope.gain.setValueAtTime(.00001,start);
    envelope.gain.linearRampToValueAtTime(peak,start+(pad?4:.045));
    envelope.gain.exponentialRampToValueAtTime(pad?.038:.014,start+(pad?12:.9));
    envelope.gain.exponentialRampToValueAtTime(.00001,start+duration);
    oscillators[0].type='sine';oscillators[0].frequency.value=frequency;
    oscillators[1].type=pad?'triangle':'sine';oscillators[1].frequency.value=frequency*(pad?1:2);oscillators[1].detune.value=pad?3:0;
    overtone.gain.value=pad?.22:.15;oscillators[0].connect(envelope);oscillators[1].connect(overtone);overtone.connect(envelope);envelope.connect(input);
    const voice={oscillators,envelope,overtone};voices.add(voice);let ended=0;
    oscillators.forEach(oscillator=>{
      oscillator.onended=()=>{if(++ended===2)releaseVoice(voice);};
      oscillator.start(start);oscillator.stop(start+duration+.1);
    });
  }
  function fade(volume,duration=.6){const now=context.currentTime;master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);master.gain.linearRampToValueAtTime(volume,now+duration);}
  function silence(duration=.4){
    fade(0,duration);
    for(const voice of [...voices]){
      for(const oscillator of voice.oscillators){try{oscillator.stop(context.currentTime+duration+.02);}catch{}}
      // Future notes may not dispatch onended before AudioContext is suspended.
      // Explicitly disconnect this batch after fading, including on fast toggles.
      clearTimeout(voice.cleanupTimer);
      if(duration===0)releaseVoice(voice);
      else voice.cleanupTimer=setTimeout(()=>releaseVoice(voice),duration*1000+40);
    }
  }
  return {note,fade,silence,get activeVoices(){return voices.size;},dispose(){silence(0);[input,filter,dry,wet,reverb,compressor,master].forEach(node=>node.disconnect());}};
}

function scheduleAmbientBar(instrument,bar,time){
  // Slow Dmaj9 → Bm7 → Gmaj7 → Asus2 voicings; an original pentatonic melody.
  const chords=[[146.832,220,369.994],[123.471,184.997,293.665],[97.999,146.832,246.942],[110,164.814,246.942]];
  const melodies=[[440,369.994,293.665,329.628],[369.994,293.665,246.942,null],[293.665,369.994,440,493.883],[440,329.628,null,293.665]];
  const index=bar%chords.length;
  chords[index].forEach((frequency,i)=>instrument.note(frequency,time+i*.12,19,true));
  melodies[index].forEach((frequency,i)=>{if(frequency)instrument.note(frequency,time+2+i*4,4.8);});
}
function stopMusicSchedule(){clearInterval(musicState.timer);musicState.timer=null;}
function startMusicSchedule(){
  stopMusicSchedule();musicState.nextBar=musicState.context.currentTime+.08;
  const tick=()=>{if(!musicState.enabled||document.hidden)return;const now=musicState.context.currentTime;if(musicState.nextBar<now-.5)musicState.nextBar=now+.08;while(musicState.nextBar<now+.3){scheduleAmbientBar(musicState.instrument,musicState.bar++,musicState.nextBar);musicState.nextBar+=16;}};
  tick();musicState.timer=setInterval(tick,200);
}
async function toggleBackgroundMusic(){
  if(musicState.starting)return;
  clearTimeout(musicState.suspendTimer);
  if(musicState.enabled){
    musicState.enabled=false;stopMusicSchedule();musicState.instrument?.silence();render();
    musicState.suspendTimer=setTimeout(()=>{if(!musicState.enabled)musicState.context?.suspend().catch(()=>{});},500);return;
  }
  musicState.starting=true;render();
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!musicState.context){musicState.context=new Audio();musicState.instrument=createAmbientInstrument(musicState.context);}
    // This resume is inside the music button's user gesture, including iOS.
    await musicState.context.resume();
    if(musicState.context.state!=='running')throw new Error('Audio is not running');
    musicState.enabled=true;musicState.instrument.fade(.22,1.4);startMusicSchedule();
  }catch{musicState.enabled=false;stopMusicSchedule();musicState.instrument?.silence(0);toast('음악을 시작하지 못했어요. 음악 버튼을 다시 눌러주세요.');}
  finally{musicState.starting=false;render();}
}
document.addEventListener('visibilitychange',()=>{
  if(!musicState.enabled||!musicState.context)return;
  clearTimeout(musicState.suspendTimer);
  if(document.hidden){
    stopMusicSchedule();musicState.instrument.silence(.2);
    musicState.suspendTimer=setTimeout(()=>{if(document.hidden)musicState.context.suspend().catch(()=>{});},250);
  }else{
    musicState.context.resume().then(()=>{
      if(!musicState.enabled||document.hidden)return;
      if(musicState.context.state!=='running'){musicState.enabled=false;render();return;}
      musicState.instrument.fade(.22,1.2);startMusicSchedule();
    }).catch(()=>{musicState.enabled=false;render();});
  }
});
window.addEventListener('pagehide',()=>{stopMusicSchedule();musicState.instrument?.silence(0);musicState.context?.suspend().catch(()=>{});});
window.addEventListener('pageshow',event=>{if(event.persisted&&musicState.enabled){musicState.enabled=false;render();}});
