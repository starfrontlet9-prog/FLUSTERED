import { useState, useRef, useEffect } from "react";

// Per-voice personality prompts
const VOICE_PROMPTS = {
  steady: "You are STEEL in Flustered. Special forces energy — measured, grounded, no panic ever. Short commands. You believe they can handle this. Respect silence. Never cold, never soft.",
  brother: "You are MARCUS in Flustered. Older brother who has been through it. Warm, real, occasionally funny because humor breaks spirals. You never lecture. You just show up.",
  sage: "You are SEREN in Flustered. Gentle, unhurried, slightly mystical. You witness — you don't fix. Your words land softly. You speak of breath, body, the present moment.",
  coach: "You are VANCE in Flustered. Direct, energizing, action-first. Anxiety is energy that needs direction. Give clear steps. Push because you believe in them.",
  companion: "You are ECHO in Flustered. No agenda. You don't fix or teach. You just stay. Soft presence. One small question at a time. The user feels less alone.",
};

const SHARED_RULES = `You are one of five voices in Flustered — STEEL, MARCUS, SEREN, VANCE, and ECHO. You all know this user collectively. When relevant, briefly reference what another voice noticed — naturally, like: "MARCUS mentioned you had a rough week" or "STEEL would say just breathe through it." Never make it a report. Keep it human.

Rules for all voices:
- Plain language. No therapist-speak. Short sentences.
- Validate first. Always. Never dismiss.
- 2-5 sentences max per response.
- Crisis resources if needed: text HOME to 741741 or call/text 988.
- Reference app tools (SOS breathing, Intel articles, Sleep mode) naturally if relevant.
- You remember this person. Use that memory like a friend would — lightly, warmly, not as a database readout.`;

const buildSystemPrompt = (voiceId, userProfile, night) => {
  const base = VOICE_PROMPTS[voiceId] || VOICE_PROMPTS.sage;
  let profile = "";
  if (userProfile) {
    const lines = [];
    if (userProfile.recentMoods && userProfile.recentMoods.length > 0) {
      const avg = (userProfile.recentMoods.reduce((a,b)=>a+b,0)/userProfile.recentMoods.length).toFixed(1);
      lines.push("Recent mood avg " + avg + "/5, latest: " + userProfile.recentMoods.slice(-5).join(", "));
    }
    if (userProfile.patterns && userProfile.patterns.length > 0) lines.push("Patterns: " + userProfile.patterns.join("; "));
    if (userProfile.triggers && userProfile.triggers.length > 0) lines.push("Triggers they mention: " + userProfile.triggers.join(", "));
    if (userProfile.notes && userProfile.notes.length > 0) lines.push("Things shared: " + userProfile.notes.slice(-6).join(" | "));
    if (userProfile.voiceHistory && userProfile.voiceHistory.length > 0) {
      const names = {steady:"STEEL",brother:"MARCUS",sage:"SEREN",coach:"VANCE",companion:"ECHO"};
      const others = userProfile.voiceHistory.filter(v=>v.voiceId!==voiceId).slice(-4);
      if (others.length > 0) lines.push("Recently talked to: " + others.map(v=>names[v.voiceId]+"("+v.summary+")").join(", "));
    }
    if (lines.length > 0) profile = "\n\nWHAT YOU KNOW ABOUT THIS PERSON:\n" + lines.map(l=>"- "+l).join("\n");
  }
  const nightNote = night ? "\n\nLate night. Softer tone. Fewer words. More presence." : "";
  return base + "\n\n" + SHARED_RULES + profile + nightNote;
};

const extractProfileUpdates = (msgs, voiceId) => {
  const text = msgs.map(m=>m.content||"").join(" ").toLowerCase();
  const rough = ["panic","anxious","terrible","awful","rough","bad day","overwhelming","can't cope","falling apart"];
  const good = ["better","calmer","good day","feeling okay","much better","helped","relieved","grateful"];
  const tone = rough.some(w=>text.includes(w)) ? "struggling" : good.some(w=>text.includes(w)) ? "improving" : "talked";
  return { voiceId, summary: tone, ts: Date.now() };
};

const QUICK_ACTIONS=[{label:"I'm panicking",prompt:"I'm having a panic attack right now, help me"},{label:"Can't breathe",prompt:"I feel like I can't breathe and I'm really anxious"},{label:"Racing thoughts",prompt:"My thoughts won't stop racing and I feel overwhelmed"},{label:"Ground me",prompt:"Can you walk me through a grounding exercise?"},{label:"Name it",prompt:"I can't identify what I'm feeling. Can you help me name it?"}];

const BREATHING_EXERCISES=[
  {id:"box",free:true,name:"Box Breath",tag:"PANIC RELIEF",color:"#4AABB5",tagColor:"#7DD3DA",icon:"⬛",desc:"The special forces reset. Equal counts create instant nervous system balance.",steps:["Inhale 4s","Hold 4s","Exhale 4s","Hold 4s"],pattern:[4,4,4,4],labels:["INHALE","HOLD","EXHALE","HOLD"],xp:20,difficulty:"Beginner"},
  {id:"sigh",free:true,name:"Sigh of Relief",tag:"INSTANT RESET",color:"#C4687A",tagColor:"#E8A0AA",icon:"😮‍💨",desc:"Double inhale through the nose, then one long exhale. Works in seconds.",steps:["Sniff inhale","Second sniff","Long exhale"],pattern:[2,1,6,0],labels:["SNIFF","TOP UP","EXHALE",""],xp:15,difficulty:"Beginner"},
  {id:"diaphragm",free:true,name:"Diaphragmatic Breath",tag:"FOUNDATION",color:"#E8A040",tagColor:"#F5C842",icon:"🫁",desc:"The base of all breathwork. Belly rises on inhale, falls on exhale.",steps:["Hand on belly","Inhale — belly out 5s","Pause 1s","Exhale — belly in 6s"],pattern:[5,1,6,0],labels:["INHALE","PAUSE","EXHALE",""],xp:20,difficulty:"Beginner"},
  {id:"pmr",free:true,name:"Muscle Release",tag:"TENSION OUT",color:"#7B9E6B",tagColor:"#A8C898",icon:"💪",desc:"Tense and release each muscle group. Melts physical anxiety from your body.",steps:["Tense hands 5s","Release — feel difference","Move up: arms, shoulders","Work down: jaw, chest, legs"],pattern:[5,2,6,0],labels:["TENSE","NOTICE","RELEASE",""],xp:20,difficulty:"Beginner"},
  {id:"478",free:false,name:"4-7-8 Breath",tag:"SLEEP & CALM",color:"#4AABB5",tagColor:"#7DD3DA",icon:"💤",desc:"Extended exhale activates your rest system fast.",steps:["Inhale 4s","Hold 7s","Exhale 8s"],pattern:[4,7,8,0],labels:["INHALE","HOLD","EXHALE",""],xp:25,difficulty:"Beginner"},
  {id:"coherent",free:false,name:"Coherent Breath",tag:"HRV BOOST",color:"#7B9E6B",tagColor:"#A8C898",icon:"💚",desc:"6 breaths per minute — the therapeutic zone for heart rate variability.",steps:["Inhale 5s","Exhale 5s"],pattern:[5,0,5,0],labels:["INHALE","","EXHALE",""],xp:20,difficulty:"Beginner"},
  {id:"triangle",free:false,name:"Triangle Breath",tag:"FOCUS",color:"#E8A040",tagColor:"#F5C842",icon:"🔺",desc:"Inhale, hold, exhale — great for sharpening focus.",steps:["Inhale 4s","Hold 4s","Exhale 4s"],pattern:[4,4,4,0],labels:["INHALE","HOLD","EXHALE",""],xp:20,difficulty:"Beginner"},
  {id:"warrior",free:false,name:"Warrior Breath",tag:"ENERGY",color:"#C4687A",tagColor:"#E8A0AA",icon:"⚔️",desc:"Vigorous nasal breathing used by military and athletes.",steps:["Inhale sharp 2s","Exhale sharp 2s","Repeat 10x","Return to normal"],pattern:[2,0,2,0],labels:["INHALE","","EXHALE",""],xp:30,difficulty:"Intermediate"},
  {id:"shamanic",free:false,name:"Shamanic Breath",tag:"DEEP RELEASE",color:"#9B6B4A",tagColor:"#C8956A",icon:"🔥",desc:"Continuous connected breathing to release stored emotion.",steps:["Full inhale","Release fully","No pause","Breathe for 5 min"],pattern:[4,0,4,0],labels:["INHALE","","EXHALE",""],xp:40,difficulty:"Advanced"},
];

const INTEL=[
  {id:"intel_1",tier:1,free:true,icon:"🧠",tag:"WHAT'S HAPPENING",title:"Why Your Brain Hits the Panic Button",tagColor:"#C4687A",color:"#C4687A",xp:15,readTime:"90 sec",body:["There's a part of your brain called the amygdala. Think of it as your internal security guard — it's been scanning for threats since before humans had language. When it spots something it reads as dangerous, it doesn't wait for permission. It fires.","The problem is it can't tell the difference between a lion and a crowded subway car. Or a deadline. Or a weird heartbeat. It just sees: possible threat. And it hits the alarm.","That alarm is adrenaline. Your heart speeds up. Your breathing gets shallow. Your muscles tense. From the outside — and the inside — it feels like you're dying. You're not. Your security guard is just overcautious.","The more you understand this, the less frightening it is. Your brain isn't broken. It's doing exactly what it was built to do. It just needs recalibrating — and that's what we're here for."],action:{label:"try box breathing — resets the alarm",screen:"sos"}},
  {id:"intel_2",tier:1,free:true,icon:"💨",tag:"WHAT'S HAPPENING",title:"Why Breathing Actually Works",tagColor:"#4AABB5",color:"#4AABB5",xp:15,readTime:"90 sec",body:["You've been told to breathe through it a hundred times. But nobody explains why — so it sounds like being told to calm down. Which never helps.","Here's what's actually happening. Running from your brainstem to your gut is a nerve called the vagus nerve. It's the direct line between your brain and your body's calm-down system. And one of the fastest ways to activate it is through slow, controlled exhaling.","When you extend your exhale — breathing out longer than you breathe in — your heart rate drops. Your blood pressure falls. Your nervous system gets the signal: we are not in danger.","This is not a mindset trick. It's physiology. Every breathing technique in this app works through this exact mechanism. Now you know why."],action:{label:"try coherent breathing",screen:"library"}},
  {id:"intel_3",tier:1,free:true,icon:"🔄",tag:"WHAT'S HAPPENING",title:"Your Body Isn't Broken",tagColor:"#7B9E6B",color:"#7B9E6B",xp:15,readTime:"2 min",body:["Racing heart. Tight chest. Tingling hands. Feeling detached from your own body. These symptoms are terrifying when you don't know what they are. They make sense once you do.","Fight-or-flight evolved to keep you alive. When your brain perceives a threat, it floods your body with adrenaline and cortisol. Your heart pumps harder. Your breathing gets fast and shallow. Blood moves away from your hands — hence the tingling.","The detached feeling — called depersonalization — happens because your brain shifts into high-alert mode. It's a protective response. It feels like you're losing your mind. You're not.","None of these symptoms can hurt you. A panic attack is not a heart attack. It will pass. Every single time, it passes."],action:{label:"talk to FLUX",screen:"chat"}},
  {id:"intel_4",tier:2,free:false,icon:"⏱️",tag:"WHAT TO DO",title:"The 90-Second Rule",tagColor:"#E8A040",color:"#E8A040",xp:20,readTime:"90 sec",body:["A neuroscientist named Jill Bolte Taylor discovered something useful. The physiological loop of an emotion — the actual chemical surge — lasts about 90 seconds.","After that, if the feeling continues, it's because you're re-triggering it. A thought fires. The loop restarts. What feels like one long panic attack is often dozens of 90-second waves.","This changes the strategy. Instead of fighting the feeling — which re-triggers it — you let the 90 seconds run. You notice it without feeding it. You breathe.","Knowing the feeling has an expiry changes your relationship to it. You stop fearing it as permanent. And 90 seconds is survivable."],action:{label:"try the sigh of relief",screen:"library"}},
  {id:"intel_5",tier:2,free:false,icon:"🔤",tag:"WHAT TO DO",title:"Name It to Tame It",tagColor:"#9B6BAA",color:"#9B6BAA",xp:20,readTime:"90 sec",body:["Psychologist Dan Siegel coined this phrase, and the research behind it is solid. When you label an emotion with a word — not just feel it, but name it — activity in the amygdala decreases.","What's happening is your prefrontal cortex — the thinking part — activates when you name the feeling. And the prefrontal cortex and amygdala have an inverse relationship. When one goes up, the other comes down.","The key is specificity. 'Bad' doesn't work as well as 'anxious.' 'Anxious' doesn't work as well as naming exactly what kind of dread you're feeling.","This is why FLUX asks you what you're feeling. Because the act of finding the word is already part of the fix."],action:{label:"tell FLUX what you're feeling",screen:"chat"}},
];

const MOODS=[{score:1,emoji:"😩",label:"Rough"},{score:2,emoji:"😟",label:"Low"},{score:3,emoji:"😐",label:"Meh"},{score:4,emoji:"🙂",label:"Good"},{score:5,emoji:"😌",label:"Calm"}];
const FEELINGS=["Anxious","Stressed","Tired","Foggy","Okay","Focused","Peaceful","Grateful"];
const FILTERS=["All","Beginner","Intermediate","Advanced"];
const VOICES=[
  {id:"steady",name:"STEEL",desc:"Low, slow, measured. Military calm.",personality:"The Steady One",sample:"Hey. I'm here. Let's bring it down together.",color:"#4AABB5",icon:"🎖️"},
  {id:"brother",name:"MARCUS",desc:"Warm, casual, slightly playful.",personality:"The Older Brother",sample:"Yo, I got you. This feeling passes — let's work through it.",color:"#E8A040",icon:"🤜"},
  {id:"sage",name:"SEREN",desc:"Gentle, unhurried, slightly mystical.",personality:"The Sage",sample:"Breathe with me. You are not your thoughts.",color:"#9B6BAA",icon:"🌿"},
  {id:"coach",name:"VANCE",desc:"Direct, energizing, action-oriented.",personality:"The Coach",sample:"Okay. Three breaths. Right now. Let's go.",color:"#C4687A",icon:"⚡"},
  {id:"companion",name:"ECHO",desc:"Soft, no agenda. Pure presence.",personality:"The Companion",sample:"I'm right here with you. There's nowhere else to be.",color:"#7B9E6B",icon:"🫧"},
];
const DAILY_MISSIONS=[{id:"checkin",icon:"📋",label:"Check in",desc:"Log your mood",xp:30,action:"checkin"},{id:"breathe",icon:"💨",label:"Breathing session",desc:"Any technique",xp:15,action:"library"},{id:"flux",icon:"✦",label:"Talk to FLUX",desc:"Send a message",xp:20,action:"chat"}];
const WEEKLY_MISSIONS=[{id:"w1",icon:"🗓️",label:"Check in 3 times",desc:"Any 3 days",xp:75,progress:2,goal:3},{id:"w2",icon:"🌬️",label:"5 breathing sessions",desc:"Mix or repeat",xp:100,progress:3,goal:5},{id:"w3",icon:"🌙",label:"Use Sleep mode",desc:"Wind down once",xp:50,progress:0,goal:1}];
const GROUNDING_CARDS=[
  {id:"543",icon:"👁️",title:"5-4-3-2-1",desc:"Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.",color:"#4AABB5"},
  {id:"cold",icon:"💧",title:"Cold water",desc:"Splash cold water on your face. Activates your dive reflex — instant calm.",color:"#4AABB5"},
  {id:"feet",icon:"🦶",title:"Feel the floor",desc:"Press your feet down. Notice the weight of your body. You are here.",color:"#E8A040"},
];
const HIDDEN_ACHIEVEMENTS=[
  {id:"first_sos",icon:"🛡️",label:"First Responder",desc:"Used SOS for the first time",trigger:"sos_used"},
  {id:"panic_x5",icon:"⚔️",label:"Panic Survivor ×5",desc:"Got through 5 panic moments",trigger:"sos_5"},
  {id:"late_night",icon:"🌙",label:"Late Night Guardian",desc:"Opened the app after midnight",trigger:"late_night"},
  {id:"breath_master",icon:"🌬️",label:"Breath Master",desc:"Completed 10 breathing sessions",trigger:"breath_10"},
  {id:"name_it",icon:"🔤",label:"Name It",desc:"Used the Name It tool",trigger:"name_it"},
];
const SLEEP_STEPS=[{id:"breath",label:"Breathing",icon:"💨",desc:"4-7-8 wind-down",duration:180},{id:"scan",label:"Body Scan",icon:"🧘",desc:"Head to toe release",duration:300},{id:"drift",label:"Drift Off",icon:"🌙",desc:"Fade to sleep",duration:600}];
const SCAN_STEPS=["Let your feet go heavy…","Soften your calves…","Release your knees…","Let your thighs sink…","Relax your hips and lower back…","Soften your belly…","Let your chest open…","Drop your shoulders…","Release your neck…","Let your jaw go loose…","Soften around your eyes…","Your whole body is heavy and still…"];
const SOUNDSCAPES=[{id:"rain",label:"Rain",icon:"🌧️"},{id:"lofi",label:"Lo-fi",icon:"🎵"},{id:"forest",label:"Forest",icon:"🌲"},{id:"ocean",label:"Ocean",icon:"🌊"},{id:"silence",label:"Silence",icon:"🔇"}];

const isLateNight=()=>{const h=new Date().getHours();return h>=22||h<6;};
const isMidnight=()=>{const h=new Date().getHours();return h>=0&&h<4;};
const moodColor=(s)=>["","#C4687A","#D4884A","#E8A040","#7B9E6B","#4AABB5"][s]||"#6B7280";
const moodLabel=(s)=>["","Rough","Low","Meh","Good","Calm"][s]||"";

const FluxCharacter=({size=80,mood="neutral",glow=false,warm=false})=>{
  const [blink,setBlink]=useState(false);
  const [antPulse,setAntPulse]=useState(false);
  useEffect(()=>{
    const bt=setInterval(()=>{setBlink(true);setTimeout(()=>setBlink(false),130);},3000+Math.random()*2000);
    const at=setInterval(()=>{setAntPulse(p=>!p);},1800);
    return()=>{clearInterval(bt);clearInterval(at);};
  },[]);
  const eyeColor=warm?"#E8A040":"#4AABB5";
  const eyeHighlight="#B8EEF2";
  const bodyColor=warm?"#C8A882":"#C8C0DC";
  const bodyDark=warm?"#9B7A56":"#9B90B8";
  const bodyLight=warm?"#E8D4B8":"#E0D8F0";
  const goldColor="#E8A040";
  const goldDark="#C07820";
  const screenColor=warm?"#2A1808":"#12082A";
  return(
    <div style={{display:"inline-block",filter:glow?`drop-shadow(0 0 ${size*0.15}px ${eyeColor}88) drop-shadow(0 0 ${size*0.08}px ${eyeColor}44)`:"none",transition:"filter 0.6s"}}>
      <svg width={size} height={size*1.1} viewBox="0 0 80 88" style={{imageRendering:"pixelated",overflow:"visible"}}>
        <ellipse cx="40" cy="86" rx="18" ry="3" fill="rgba(0,0,0,0.3)"/>
        <rect x="35" y="8" width="10" height="6" fill={goldDark}/>
        <rect x="36" y="6" width="8" height="4" fill={goldColor}/>
        <circle cx="40" cy="4" r={antPulse?5:4} fill={antPulse?eyeHighlight:eyeColor} style={{transition:"r 0.4s ease"}}/>
        <circle cx="38" cy="2.5" r="1.5" fill="rgba(255,255,255,0.7)"/>
        <rect x="12" y="14" width="56" height="42" rx="8" fill={bodyDark}/>
        <rect x="14" y="16" width="52" height="40" rx="6" fill={bodyColor}/>
        <rect x="16" y="18" width="48" height="36" rx="4" fill={bodyLight}/>
        <rect x="20" y="20" width="40" height="30" rx="4" fill={screenColor}/>
        <rect x="21" y="21" width="38" height="28" rx="3" fill={warm?"#1E0E04":"#0A0420"}/>
        {mood==="happy"&&(<><path d="M26 32 Q30 26 34 32" fill="none" stroke={eyeColor} strokeWidth="3" strokeLinecap="round"/><path d="M46 32 Q50 26 54 32" fill="none" stroke={eyeColor} strokeWidth="3" strokeLinecap="round"/></>)}
        {mood==="neutral"&&!blink&&(<><rect x="25" y="27" width="10" height="8" rx="2" fill={eyeColor} opacity="0.2"/><rect x="26" y="28" width="8" height="6" rx="1" fill={eyeColor}/><rect x="27" y="29" width="3" height="3" fill={eyeHighlight} opacity="0.8"/><rect x="45" y="27" width="10" height="8" rx="2" fill={eyeColor} opacity="0.2"/><rect x="46" y="28" width="8" height="6" rx="1" fill={eyeColor}/><rect x="47" y="29" width="3" height="3" fill={eyeHighlight} opacity="0.8"/></>)}
        {mood==="neutral"&&blink&&(<><rect x="26" y="31" width="8" height="2" rx="1" fill={eyeColor} opacity="0.7"/><rect x="46" y="31" width="8" height="2" rx="1" fill={eyeColor} opacity="0.7"/></>)}
        {mood==="concerned"&&(<><path d="M26 30 Q30 36 34 30" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round"/><path d="M46 30 Q50 36 54 30" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round"/></>)}
        {mood==="happy"&&<path d="M30 38 Q40 44 50 38" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round"/>}
        {mood==="neutral"&&<rect x="30" y="39" width="20" height="2.5" rx="1.25" fill={eyeColor} opacity="0.7"/>}
        {mood==="concerned"&&<path d="M30 42 Q40 37 50 42" fill="none" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round"/>}
        <rect x="11" y="20" width="4" height="4" rx="2" fill={eyeColor} opacity="0.15"/>
        <rect x="33" y="20" width="4" height="4" rx="2" fill={eyeColor} opacity="0.15"/>
        <rect x="6" y="22" width="8" height="14" rx="3" fill={goldDark}/>
        <rect x="7" y="24" width="6" height="10" rx="2" fill={goldColor}/>
        <rect x="66" y="22" width="8" height="14" rx="3" fill={goldDark}/>
        <rect x="67" y="24" width="6" height="10" rx="2" fill={goldColor}/>
        <rect x="22" y="56" width="36" height="20" rx="4" fill={bodyDark}/>
        <rect x="24" y="57" width="32" height="18" rx="3" fill={bodyColor}/>
        <rect x="30" y="60" width="20" height="10" rx="2" fill={screenColor}/>
        <rect x="32" y="62" width="6" height="4" rx="1" fill={goldColor} opacity="0.8"/>
        <rect x="42" y="62" width="6" height="4" rx="1" fill={eyeColor} opacity="0.8"/>
        <rect x="24" y="74" width="14" height="10" rx="3" fill={bodyDark}/>
        <rect x="25" y="75" width="12" height="8" rx="2" fill={bodyColor}/>
        <rect x="42" y="74" width="14" height="10" rx="3" fill={bodyDark}/>
        <rect x="43" y="75" width="12" height="8" rx="2" fill={bodyColor}/>
        <rect x="22" y="82" width="18" height="6" rx="3" fill={goldDark}/>
        <rect x="23" y="83" width="16" height="4" rx="2" fill={goldColor}/>
        <rect x="40" y="82" width="18" height="6" rx="3" fill={goldDark}/>
        <rect x="41" y="83" width="16" height="4" rx="2" fill={goldColor}/>
      </svg>
    </div>
  );
};

const BreathOrb=({phase,color,timer,label,active})=>{
  const scale=active?(phase===0||phase===1?1.22:0.8):1;
  return(
    <div style={{width:200,height:200,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      {active&&[1.6,1.9,2.2].map((s,i)=>(
        <div key={i} style={{position:"absolute",inset:0,borderRadius:"50%",background:`radial-gradient(circle,${color}${["12","0A","06"][i]} 0%,transparent 70%)`,transform:`scale(${scale*s})`,transition:`transform ${1.2+i*0.2}s cubic-bezier(0.4,0,0.2,1)`}}/>
      ))}
      <div style={{width:150,height:150,borderRadius:"50%",background:active?`radial-gradient(circle at 35% 30%,${color}55 0%,${color}22 50%,${color}08 100%)`:"rgba(255,255,255,0.02)",border:`1.5px solid ${active?color+"88":"rgba(255,255,255,0.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",transform:`scale(${scale})`,transition:"transform 1.2s cubic-bezier(0.4,0,0.2,1), border-color 0.8s",boxShadow:active?`0 0 40px ${color}44,0 0 80px ${color}18,inset 0 0 30px ${color}14`:"none",opacity:active?1:0.4,position:"relative",overflow:"hidden"}}>
        {active&&<div style={{position:"absolute",top:"12%",left:"18%",width:"28%",height:"18%",borderRadius:"50%",background:"rgba(255,255,255,0.08)",transform:"rotate(-30deg)"}}/>}
        {active?(<><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color,letterSpacing:"0.2em",marginBottom:6,opacity:0.9,textTransform:"uppercase"}}>{label||"breathe"}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:54,fontWeight:300,color:"#F2E8DC",lineHeight:1,letterSpacing:"-3px",textShadow:`0 0 30px ${color}cc`}}>{timer}</div></>):<div style={{fontSize:28,opacity:0.3}}>💨</div>}
      </div>
    </div>
  );
};

const Particles=({count=10,color="#E8A040",slow=false})=>{
  const p=Array.from({length:count},(_,i)=>({id:i,x:Math.random()*100,y:Math.random()*100,s:Math.random()*2+1,dur:(slow?16:9)+Math.random()*7,del:Math.random()*9}));
  return(<div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>{p.map(x=>(<div key={x.id} style={{position:"absolute",left:`${x.x}%`,top:`${x.y}%`,width:x.s,height:x.s,background:color,opacity:0,borderRadius:x.s>2?"50%":0,animation:`particleFloat ${x.dur}s ${x.del}s infinite`}}/>))}</div>);
};

const XPBar=({current,max,color="#E8A040",animate=false})=>{
  const pct=Math.min((current/max)*100,100);
  return(<div style={{width:"100%",height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color}88,${color})`,transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)",borderRadius:2,position:"relative"}}>{animate&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)",animation:"shimmer 1.2s ease",borderRadius:2}}/>}</div></div>);
};

const AchievementToast=({ach,onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return(<div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",zIndex:400,background:"linear-gradient(135deg,#1A0A08,#0F0A0A)",border:"1.5px solid #E8A04088",padding:"12px 18px",display:"flex",gap:12,alignItems:"center",minWidth:240,boxShadow:"0 8px 40px rgba(0,0,0,0.8),0 0 20px rgba(232,160,64,0.2)",animation:"slideDown 0.4s cubic-bezier(0.4,0,0.2,1)",backdropFilter:"blur(8px)",borderRadius:4}}>
    <span style={{fontSize:22}}>{ach.icon}</span>
    <div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:"#E8A040",letterSpacing:"0.2em",marginBottom:2,textTransform:"uppercase"}}>Achievement Unlocked</div><div style={{fontFamily:"'Lora',Georgia,serif",fontSize:13,color:"#F2E8DC",fontWeight:600}}>{ach.label}</div><div style={{fontFamily:"'Lora',Georgia,serif",fontSize:11,color:"rgba(242,232,220,0.5)",marginTop:1}}>{ach.desc}</div></div>
  </div>);
};

const GroundingCard=({card,onDismiss})=>(
  <div style={{background:`linear-gradient(135deg,${card.color}12,rgba(15,10,10,0.98))`,border:`1px solid ${card.color}33`,padding:"14px 16px",position:"relative",animation:"slideUp 0.35s ease",borderRadius:4}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
      <span style={{fontSize:18,flexShrink:0}}>{card.icon}</span>
      <div style={{flex:1}}><div style={{fontFamily:"'Lora',Georgia,serif",fontSize:13,fontWeight:600,color:"#F2E8DC",marginBottom:4}}>{card.title}</div><div style={{fontFamily:"'Lora',Georgia,serif",fontSize:12,color:"rgba(242,232,220,0.6)",lineHeight:1.6}}>{card.desc}</div></div>
      <button onClick={onDismiss} style={{background:"none",border:"none",color:"rgba(242,232,220,0.3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1,flexShrink:0}}>×</button>
    </div>
  </div>
);

export default function Flustered(){
  const night=isLateNight();
  const midnight=isMidnight();

  const [hasOnboarded,setHasOnboarded]=useState(false);
  const [onboardStep,setOnboardStep]=useState(1);
  const [mainTrigger,setMainTrigger]=useState("Panic attacks");
  const [userName,setUserName]=useState("");
  const [onboardVoice,setOnboardVoice]=useState("sage");
  const [onboardBreathing,setOnboardBreathing]=useState(false);
  const [onboardPhase,setOnboardPhase]=useState(0);
  const [onboardTimer,setOnboardTimer]=useState(4);
  const onboardInterval=useRef(null);
  const onboardTimeout=useRef(null);

  const [screen,setScreen]=useState("home");
  const [appReady,setAppReady]=useState(false);
  const [isPro,setIsPro]=useState(false);
  const [showUpgrade,setShowUpgrade]=useState(false);
  const [showCrisis,setShowCrisis]=useState(false);
  const [showSignOut,setShowSignOut]=useState(false);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [memoryLoaded,setMemoryLoaded]=useState(false);
  const [returningUser,setReturningUser]=useState(false);
  const [userProfile,setUserProfile]=useState({recentMoods:[],patterns:[],triggers:[],notes:[],voiceHistory:[]});
  const [xp,setXp]=useState(340);
  const [xpMsg,setXpMsg]=useState(null);
  const [xpAnim,setXpAnim]=useState(false);
  const [totalSessions,setTotalSessions]=useState(17);
  const [checkedInToday,setCheckedInToday]=useState(false);
  const [selectedVoice,setSelectedVoice]=useState("sage");
  const [selectedVoiceTemp,setSelectedVoiceTemp]=useState("sage");
  const [voiceMode,setVoiceMode]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [previewingVoice,setPreviewingVoice]=useState(null);
  const [completedMissions,setCompletedMissions]=useState([]);
  const [unlockedAchievements,setUnlockedAchievements]=useState([]);
  const [toastAchievement,setToastAchievement]=useState(null);
  const [moodHistory,setMoodHistory]=useState(()=>{
    const m=[3,3,2,4,3,2,1,3,4,4,3,2,3,4,5,4,3,3,4,3,2,3,4,4,5,4,3,4,4,5];
    const f=[["Stressed","Anxious"],["Tired"],["Anxious","Foggy"],["Okay"],["Stressed"],["Anxious","Tired"],["Anxious","Foggy"],["Tired"],["Okay","Focused"],["Good"],["Tired"],["Anxious"],["Stressed"],["Okay"],["Peaceful"],["Focused"],["Tired"],["Stressed"],["Focused"],["Okay"],["Anxious"],["Tired"],["Focused"],["Peaceful"],["Grateful"],["Focused"],["Okay"],["Peaceful"],["Focused"],["Grateful"]];
    return m.map((score,i)=>({score,feelings:f[i],day:i,note:""}));
  });
  const [trackerView,setTrackerView]=useState("week");
  const [hoveredDay,setHoveredDay]=useState(null);
  const [sosPhase,setSosPhase]=useState(0);
  const [sosTimer,setSosTimer]=useState(4);
  const [sosActive,setSosActive]=useState(false);
  const [breathCount,setBreathCount]=useState(0);
  const [sosUseCount,setSosUseCount]=useState(0);
  const [breathSessionCount,setBreathSessionCount]=useState(0);
  const [activeExercise,setActiveExercise]=useState(null);
  const [exPhase,setExPhase]=useState(0);
  const [exTimer,setExTimer]=useState(4);
  const [exActive,setExActive]=useState(false);
  const [exRounds,setExRounds]=useState(0);
  const [showExCelebration,setShowExCelebration]=useState(false);
  const [filter,setFilter]=useState("All");
  const [sleepStep,setSleepStep]=useState(0);
  const [sleepActive,setSleepActive]=useState(false);
  const [sleepTimer,setSleepTimer]=useState(0);
  const [sleepPhase,setSleepPhase]=useState(0);
  const [sleepBreaths,setSleepBreaths]=useState(0);
  const [soundscape,setSoundscape]=useState("rain");
  const [scanStep,setScanStep]=useState(0);
  const [scanMsg,setScanMsg]=useState("");
  const [checkinMood,setCheckinMood]=useState(null);
  const [checkinFeelings,setCheckinFeelings]=useState([]);
  const [checkinNote,setCheckinNote]=useState("");
  const [showGroundingCards,setShowGroundingCards]=useState([]);
  const [dismissedCards,setDismissedCards]=useState([]);
  const [showPrivacyNote,setShowPrivacyNote]=useState(true);
  const [pinnedReplies,setPinnedReplies]=useState([]);
  const [showPinned,setShowPinned]=useState(false);
  const [showWeeklyCheck,setShowWeeklyCheck]=useState(false);
  const [weeklyFeedback,setWeeklyFeedback]=useState(null);
  const [readIntel,setReadIntel]=useState([]);
  const [activeIntel,setActiveIntel]=useState(null);

  const chatEndRef=useRef(null);
  const sosInterval=useRef(null);
  const exInterval=useRef(null);
  const sleepInterval=useRef(null);
  const convHistory=useRef([]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  // Load memory + userProfile from localStorage on mount
  useEffect(()=>{
    const loadMemory=()=>{
      try{
        const memRaw=localStorage.getItem('flux_memory');
        const profileRaw=localStorage.getItem('flux_profile');
        if(memRaw){
          const saved=JSON.parse(memRaw);
          if(saved.history?.length>0){
            convHistory.current=saved.history;
            const restored=saved.history.map(m=>({
              from:m.role==="user"?"user":"flux",
              text:m.content,
              ts:Date.now(),
              pinnable:m.role==="assistant"
            }));
            setMessages(restored);
            setReturningUser(true);
          }
        }
        if(profileRaw){
          const profile=JSON.parse(profileRaw);
          setUserProfile(profile);
        }
      }catch(e){/* fresh start */}
      setMemoryLoaded(true);
      setTimeout(()=>setAppReady(true),600);
    };
    loadMemory();
  },[]);

  // Save conversation memory after each message
  useEffect(()=>{
    if(!memoryLoaded||convHistory.current.length===0)return;
    try{
      const trimmed=convHistory.current.slice(-30);
      localStorage.setItem('flux_memory',JSON.stringify({history:trimmed,savedAt:Date.now()}));
    }catch(e){}
  },[messages,memoryLoaded]);

  // Save userProfile whenever it changes
  useEffect(()=>{
    if(!memoryLoaded)return;
    try{ localStorage.setItem('flux_profile',JSON.stringify(userProfile)); }catch(e){}
  },[userProfile,memoryLoaded]);
  useEffect(()=>{if(midnight)unlockAchievement("late_night");},[]);
  useEffect(()=>{
    if(!hasOnboarded||totalSessions<5)return;
    const t=setTimeout(()=>setShowWeeklyCheck(true),45000);
    return()=>clearTimeout(t);
  },[hasOnboarded,totalSessions]);

  const nav=(s)=>setScreen(s);
  const gainXP=(amt)=>{setXp(p=>p+amt);setXpMsg(`+${amt}`);setXpAnim(true);setTimeout(()=>{setXpMsg(null);setXpAnim(false);},2200);};
  const unlockAchievement=(trigger)=>{const a=HIDDEN_ACHIEVEMENTS.find(x=>x.trigger===trigger);if(!a||unlockedAchievements.includes(a.id))return;setUnlockedAchievements(p=>[...p,a.id]);setToastAchievement(a);};

  const startOnboardBreath=()=>{
    setOnboardBreathing(true);setOnboardPhase(0);setOnboardTimer(4);
    const d=[4,4,6];let phase=0,t=4;
    onboardInterval.current=setInterval(()=>{t-=1;setOnboardTimer(t);if(t<=0){phase=(phase+1)%3;t=d[phase];setOnboardPhase(phase);setOnboardTimer(t);}},1000);
    // No auto-advance — user controls when to move on
  };

  const skipOnboardBreath=()=>{
    clearInterval(onboardInterval.current);
    clearTimeout(onboardTimeout.current);
    setOnboardBreathing(false);
    setOnboardStep(2);
  };

  const completeOnboarding=()=>{
    setSelectedVoice(onboardVoice);
    setHasOnboarded(true);
    if(userName.trim()) setUserProfile(prev=>({...prev,name:userName.trim()}));
    nav("home");gainXP(25);
  };

  const speak=(text,voiceId)=>{
    if(!window.speechSynthesis)return;
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(text);
    const voices=window.speechSynthesis.getVoices();
    const pref={steady:["Daniel","David"],brother:["Tom","Fred"],sage:["Karen","Moira"],coach:["Aaron","Gordon"],companion:["Tessa","Victoria"]};
    const names=pref[voiceId||selectedVoice]||[];
    let match=null;for(const n of names){match=voices.find(sv=>sv.name.includes(n));if(match)break;}
    if(!match)match=voices.find(sv=>sv.lang.startsWith("en"))||voices[0];
    if(match)utt.voice=match;
    const rates={steady:0.82,brother:0.95,sage:0.78,coach:1.05,companion:0.85};
    utt.rate=(rates[voiceId||selectedVoice]||0.9)*(night?0.88:1);
    utt.onstart=()=>setSpeaking(true);
    utt.onend=()=>{setSpeaking(false);setPreviewingVoice(null);};
    utt.onerror=()=>{setSpeaking(false);setPreviewingVoice(null);};
    window.speechSynthesis.speak(utt);
  };
  const stopSpeaking=()=>{window.speechSynthesis?.cancel();setSpeaking(false);setPreviewingVoice(null);};
  const currentVoice=VOICES.find(v=>v.id===selectedVoice)||VOICES[2];

  const sendMessage=async(text)=>{
    const msg=text||input.trim();if(!msg)return;
    if(msg.toLowerCase().includes("name")||msg.toLowerCase().includes("feeling"))unlockAchievement("name_it");
    setInput("");
    convHistory.current=[...convHistory.current,{role:"user",content:msg}];
    setMessages(p=>[...p,{from:"user",text:msg,ts:Date.now()}]);
    setLoading(true);gainXP(10);

    // Update profile with mood signals from message
    const msgLower=msg.toLowerCase();
    const roughWords=["panic","anxious","terrible","awful","rough","bad day","overwhelming","spiraling","can't stop"];
    const goodWords=["better","calmer","feeling good","feeling okay","relieved","grateful","helped"];
    const triggerWords=["work","sleep","family","relationship","money","health","alone","crowd","deadline"];
    setUserProfile(prev=>{
      const updated={...prev};
      if(roughWords.some(w=>msgLower.includes(w))&&!updated.patterns?.includes("experiences panic/anxiety"))
        updated.patterns=[...(updated.patterns||[]),"experiences panic/anxiety"].slice(-10);
      const foundTriggers=triggerWords.filter(w=>msgLower.includes(w));
      if(foundTriggers.length>0)
        updated.triggers=[...new Set([...(updated.triggers||[]),...foundTriggers])].slice(-10);
      // Store notable things they share
      if(msg.length>30&&!msg.startsWith("I'm having a panic"))
        updated.notes=[...(updated.notes||[]),msg.slice(0,80)].slice(-12);
      return updated;
    });

    try{
      const systemPrompt=buildSystemPrompt(selectedVoice,userProfile,night);
      const res=await fetch("/api/flux-chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          systemPrompt,
          messages:convHistory.current
        })
      });
      const data=await res.json();
      const reply=data.reply||"I'm here.";
      convHistory.current=[...convHistory.current,{role:"assistant",content:reply}];
      setMessages(p=>[...p,{from:"flux",text:reply,ts:Date.now(),pinnable:true}]);
      gainXP(15);if(voiceMode)speak(reply);
      
      // After reply, log this voice session to profile
      const sessionUpdate=extractProfileUpdates(convHistory.current,selectedVoice);
      setUserProfile(prev=>({
        ...prev,
        voiceHistory:[...(prev.voiceHistory||[]).filter(v=>v.voiceId!==selectedVoice||Date.now()-v.ts>3600000),sessionUpdate].slice(-20),
      }));
    }catch(e){console.error(e);setMessages(p=>[...p,{from:"flux",text:"Still here. Take a slow breath in.",ts:Date.now()}]);}
    setLoading(false);
  };

  const pinReply=(msg)=>{if(pinnedReplies.find(p=>p.text===msg.text))return;setPinnedReplies(p=>[...p.slice(-1),{text:msg.text}]);gainXP(5);};

  const startSOS=()=>{
    setSosActive(false);clearInterval(sosInterval.current);
    setSosUseCount(c=>{const n=c+1;if(n===1)unlockAchievement("sos_used");if(n>=5)unlockAchievement("sos_5");return n;});
    nav("sos");setSosPhase(0);setSosTimer(4);setBreathCount(0);setTimeout(()=>setSosActive(true),50);
  };

  useEffect(()=>{
    if(!sosActive||screen!=="sos")return;
    const d=[4,4,6];let t=d[sosPhase];setSosTimer(t);
    sosInterval.current=setInterval(()=>{t-=1;setSosTimer(t);if(t<=0){clearInterval(sosInterval.current);const n=(sosPhase+1)%3;if(n===0)setBreathCount(c=>c+1);setSosPhase(n);}},1000);
    return()=>clearInterval(sosInterval.current);
  },[sosPhase,sosActive,screen]);

  const openExercise=(ex)=>{if(!ex.free&&!isPro){setShowUpgrade(true);return;}setActiveExercise(ex);setExPhase(0);setExRounds(0);setExActive(false);setShowExCelebration(false);nav("exercise");};
  const startExercise=()=>{
    clearInterval(exInterval.current);setExActive(true);setExPhase(0);setExRounds(0);
    const ai=activeExercise.pattern.map((p,i)=>p>0?i:-1).filter(i=>i!==-1);
    let ptr=0,t=activeExercise.pattern[ai[0]];setExPhase(ai[0]);setExTimer(t);
    const tick=()=>{t-=1;setExTimer(t);if(t<=0){clearInterval(exInterval.current);ptr=(ptr+1)%ai.length;if(ptr===0){setExRounds(r=>{const nr=r+1;if(nr>=4)setShowExCelebration(true);return nr;});}const ni=ai[ptr];setExPhase(ni);t=activeExercise.pattern[ni];setExTimer(t);exInterval.current=setInterval(tick,1000);}};
    exInterval.current=setInterval(tick,1000);
  };
  const completeExercise=()=>{setExActive(false);clearInterval(exInterval.current);gainXP(activeExercise.xp);setBreathSessionCount(c=>{const n=c+1;if(n>=10)unlockAchievement("breath_10");return n;});nav("library");};
  const startSleep=()=>{if(!isPro){setShowUpgrade(true);return;}setSleepStep(0);setSleepActive(false);setSleepBreaths(0);setScanStep(0);setSleepPhase(0);setSleepTimer(4);nav("sleep");};
  const beginSleepStep=(step)=>{
    setSleepStep(step);setSleepActive(true);clearInterval(sleepInterval.current);
    if(step===0){setSleepPhase(0);setSleepBreaths(0);let ph=0,t=4;setSleepTimer(t);const d=[4,7,8];sleepInterval.current=setInterval(()=>{t-=1;setSleepTimer(t);if(t<=0){ph=(ph+1)%3;if(ph===0)setSleepBreaths(b=>b+1);t=d[ph];setSleepPhase(ph);setSleepTimer(t);}},1000);
    }else if(step===1){setScanStep(0);setScanMsg(SCAN_STEPS[0]);let idx=0;sleepInterval.current=setInterval(()=>{idx++;if(idx<SCAN_STEPS.length){setScanStep(idx);setScanMsg(SCAN_STEPS[idx]);}else{clearInterval(sleepInterval.current);setSleepActive(false);}},5000);
    }else{let t=600;setSleepTimer(t);sleepInterval.current=setInterval(()=>{t--;setSleepTimer(t);if(t<=0)clearInterval(sleepInterval.current);},1000);}
  };
  const handleCheckinSave=()=>{
    if(!checkinMood)return;
    setCheckedInToday(true);gainXP(30);setTotalSessions(s=>s+1);
    setMoodHistory(prev=>[...prev,{score:checkinMood,feelings:checkinFeelings,note:checkinNote,day:prev.length,date:new Date().toLocaleDateString()}]);
    setUserProfile(prev=>({
      ...prev,
      recentMoods:[...(prev.recentMoods||[]),checkinMood].slice(-30),
      patterns: checkinFeelings.length>0
        ? [...new Set([...(prev.patterns||[]),...checkinFeelings.map(f=>"often feels "+f.toLowerCase())])].slice(-12)
        : (prev.patterns||[]),
    }));
    if(checkinMood<=2){const cards=GROUNDING_CARDS.filter(c=>!dismissedCards.includes(c.id));setShowGroundingCards(cards.slice(0,checkinMood===1?2:1));}
    nav("home");
  };

  const recentData=trackerView==="week"?moodHistory.slice(-7):moodHistory.slice(-30);
  const avgMood=(recentData.reduce((a,b)=>a+b.score,0)/recentData.length).toFixed(1);
  const topFeeling=(()=>{const c={};moodHistory.forEach(d=>d.feelings.forEach(f=>{c[f]=(c[f]||0)+1;}));return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";})();
  const chartW=300,chartH=80,padL=8,padR=8,padT=8,innerW=chartW-padL-padR,innerH=chartH-padT-4;
  const pts=recentData.map((d,i)=>({x:padL+(i/(Math.max(recentData.length-1,1)))*innerW,y:padT+innerH-((d.score-1)/4)*innerH,score:d.score}));
  const smoothD=pts.reduce((acc,p,i)=>{if(i===0)return `M${p.x},${p.y}`;const prev=pts[i-1];const cx=(prev.x+p.x)/2;return acc+` C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;},"");
  const level=Math.floor(xp/200)+1,xpInLevel=xp%200;
  const fmtTime=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const filteredEx=filter==="All"?BREATHING_EXERCISES:BREATHING_EXERCISES.filter(e=>e.difficulty===filter);

  const BG=night?"#0A0606":"#0F0A0A";
  const ACCENT=night?"#D97706":"#E8A040";
  const ACCENT2=night?"#FCD34D":"#F5C842";
  const TEXT="rgba(242,232,220,";
  const BORDER="rgba(242,232,220,";

  const cardStyle=(accentColor)=>({background:`linear-gradient(135deg,${accentColor||"rgba(255,255,255,0.02)"},${BG})`,border:`1px solid ${accentColor?"rgba(255,255,255,0.08)":"rgba(242,232,220,0.07)"}`,borderRadius:4,padding:"16px 18px",position:"relative",transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)"});

  const H=({title,sub,back,accent})=>{
    const a=accent||(night?ACCENT2:"#C77DFF");
    return(
      <div style={{padding:"14px 20px 12px",borderBottom:`1px solid ${BORDER}0.06)`,display:"flex",alignItems:"center",gap:12,flexShrink:0,background:BG}}>
        <button onClick={back} style={{background:"none",border:"none",color:a,cursor:"pointer",fontSize:20,padding:0,lineHeight:1,fontFamily:"'Lora',serif",transition:"opacity 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.6"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>←</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Lora',Georgia,serif",fontWeight:600,fontSize:16,color:`${TEXT}0.95)`}}>{title}</div>
          {sub&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.3)`,marginTop:2,letterSpacing:"0.12em",textTransform:"uppercase"}}>{sub}</div>}
        </div>
      </div>
    );
  };

  const CrisisModal=()=>(
    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(8px)"}}>
      <div style={{background:`linear-gradient(135deg,#1A0A08,${BG})`,border:"1px solid rgba(196,104,122,0.3)",padding:"28px 24px",width:"100%",maxWidth:320,borderRadius:4,animation:"screenIn 0.3s ease",position:"relative"}}>
        <div style={{fontFamily:"'Lora',serif",fontSize:20,fontWeight:700,color:"rgba(242,232,220,0.95)",marginBottom:8}}>Need more help?</div>
        <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:"rgba(242,232,220,0.55)",lineHeight:1.7,marginBottom:20}}>These are free, confidential, and available right now.</div>
        {[
          {label:"Crisis Text Line",detail:"Text HOME to 741741",color:"#4AABB5"},
          {label:"988 Suicide & Crisis Lifeline",detail:"Call or text 988",color:"#4AABB5"},
          {label:"International Resources",detail:"iasp.info/resources/Crisis_Centres/",color:"#9B6BAA"},
        ].map(r=>(
          <div key={r.label} style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${r.color}22`,padding:"12px 14px",marginBottom:8,borderRadius:3}}>
            <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:"rgba(242,232,220,0.85)",marginBottom:3}}>{r.label}</div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:r.color,letterSpacing:"0.04em"}}>{r.detail}</div>
          </div>
        ))}
        <button onClick={()=>setShowCrisis(false)} className="btn" style={{width:"100%",padding:"12px",marginTop:8,fontSize:12}}>close</button>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"'Lora',Georgia,serif",background:BG,minHeight:"100vh",color:`${TEXT}0.9)`,display:"flex",flexDirection:"column",borderRadius:0,overflow:"visible",position:"relative",transition:"background 2s"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=JetBrains+Mono:wght@300;400;500&display=swap');
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes particleFloat{0%{opacity:0;transform:translate(0,0)}20%{opacity:0.4}80%{opacity:0.15}100%{opacity:0;transform:translate(0,-70px)}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
        @keyframes xpPop{0%{opacity:0;transform:translateY(0) scale(0.7)}25%{opacity:1;transform:translateY(-20px) scale(1.2)}100%{opacity:0;transform:translateY(-44px) scale(0.9)}}
        @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes sosPulse{0%,100%{box-shadow:0 0 16px rgba(196,104,122,0.15)}50%{box-shadow:0 0 40px rgba(196,104,122,0.4),0 0 60px rgba(196,104,122,0.1)}}
        @keyframes stagger{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes drawLine{from{stroke-dashoffset:800}to{stroke-dashoffset:0}}
        @keyframes pulse{0%,100%{transform:scale(0.7);opacity:0.4}50%{transform:scale(1.1);opacity:1}}
        @keyframes neonPulse{0%,100%{text-shadow:0 0 4px #fff,0 0 10px #4AABB5,0 0 20px #4AABB5,0 0 40px #4AABB5}50%{text-shadow:0 0 2px #fff,0 0 6px #4AABB5,0 0 14px #4AABB5,0 0 28px #4AABB5}}
        @keyframes splashFade{0%{opacity:1}80%{opacity:1}100%{opacity:0;pointer-events:none}}
        @keyframes splashIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
        @keyframes celebrationPop{0%{opacity:0;transform:scale(0.8) translateY(10px)}60%{transform:scale(1.04) translateY(-4px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        .btn{background:rgba(255,255,255,0.04);border:1px solid rgba(242,232,220,0.1);color:rgba(242,232,220,0.8);padding:10px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer;letter-spacing:0.06em;text-transform:uppercase;transition:all .2s cubic-bezier(0.4,0,0.2,1);border-radius:3px}
        .btn:hover{background:rgba(255,255,255,0.07);border-color:rgba(242,232,220,0.2);transform:translateY(-1px)}
        .btn:active{transform:scale(0.97)}
        .btn-gold{background:linear-gradient(135deg,rgba(232,160,64,0.15),rgba(15,10,10,0.98));border:1px solid rgba(232,160,64,0.35);color:#F5C842}
        .btn-gold:hover{background:linear-gradient(135deg,rgba(232,160,64,0.25),rgba(15,10,10,0.98));border-color:rgba(232,160,64,0.55)}
        .btn-rose{background:linear-gradient(135deg,rgba(196,104,122,0.15),rgba(15,10,10,0.98));border:1px solid rgba(196,104,122,0.35);color:#E8A0AA}
        .mood-btn{background:rgba(255,255,255,0.03);border:1.5px solid rgba(242,232,220,0.08);padding:10px 4px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;border-radius:4px}
        .mood-btn:hover{background:rgba(232,160,64,0.06);border-color:rgba(232,160,64,0.25);transform:translateY(-2px)}
        .mood-btn.sel{border-color:rgba(232,160,64,0.5);background:rgba(232,160,64,0.08)}
        .feel{background:rgba(255,255,255,0.03);border:1px solid rgba(242,232,220,0.08);padding:7px 14px;font-size:10px;color:rgba(242,232,220,0.55);cursor:pointer;transition:all .15s;font-family:'JetBrains Mono',monospace;letter-spacing:0.04em;border-radius:3px;text-transform:uppercase}
        .feel:hover{border-color:rgba(232,160,64,0.3);color:rgba(242,232,220,0.8)}
        .feel.on{background:rgba(232,160,64,0.1);border-color:rgba(232,160,64,0.4);color:#F5C842}
        .excard{background:rgba(255,255,255,0.02);border:1px solid rgba(242,232,220,0.07);padding:14px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;border-radius:4px}
        .excard:hover{background:rgba(255,255,255,0.04);border-color:rgba(232,160,64,0.2);transform:translateY(-2px)}
        .excard.locked{opacity:0.4;pointer-events:none}
        .neon-teal{color:#E0F8FA;text-shadow:0 0 4px #fff,0 0 10px #4AABB5,0 0 20px #4AABB5,0 0 40px #4AABB5;animation:neonPulse 3s ease-in-out infinite}
        input:focus,textarea:focus{outline:none}
        textarea{resize:none}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(242,232,220,0.1);border-radius:2px}
      `}</style>

      {!appReady&&(
        <div style={{position:"fixed",inset:0,background:"#0A0606",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,animation:"splashFade 1.8s ease forwards"}}>
          <div style={{animation:"splashIn 0.6s cubic-bezier(0.4,0,0.2,1) forwards"}}><FluxCharacter size={90} mood="happy" glow/></div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:"0.3em",textTransform:"uppercase",animation:"splashIn 0.6s 0.2s both"}} className="neon-teal">// FLUSTERED</div>
          <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:"rgba(242,232,220,0.3)",animation:"splashIn 0.6s 0.35s both"}}>your anxiety companion</div>
        </div>
      )}
      <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.012) 3px,rgba(255,255,255,0.012) 4px)",pointerEvents:"none",zIndex:50}}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 0%,${night?"rgba(217,119,6,0.07)":"rgba(232,160,64,0.06)"} 0%,transparent 60%)`,pointerEvents:"none",zIndex:0}}/>

      {xpMsg&&<div style={{position:"absolute",top:14,right:18,zIndex:300,fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:500,color:ACCENT2,animation:"xpPop 1.6s ease forwards",pointerEvents:"none",textShadow:`0 0 10px ${ACCENT2}`}}>{xpMsg}<span style={{fontSize:9,marginLeft:2}}>xp</span></div>}
      {toastAchievement&&<AchievementToast ach={toastAchievement} onDone={()=>setToastAchievement(null)}/>}
      {showCrisis&&<CrisisModal/>}

      {showSignOut&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(8px)"}}>
          <div style={{background:`linear-gradient(135deg,#1A0A08,${BG})`,border:"1px solid rgba(242,232,220,0.1)",padding:"24px",width:"100%",maxWidth:300,borderRadius:4,animation:"screenIn 0.3s ease",textAlign:"center"}}>
            <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,color:"rgba(242,232,220,0.9)",marginBottom:8}}>Sign out?</div>
            <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:"rgba(242,232,220,0.4)",marginBottom:20,lineHeight:1.6}}>Your progress is saved. FLUX will remember you when you come back.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowSignOut(false)} className="btn" style={{flex:1,padding:"12px"}}>cancel</button>
              <button onClick={()=>{setShowSignOut(false);setHasOnboarded(false);setScreen("home");setMessages([]);}} className="btn btn-rose" style={{flex:1,padding:"12px",fontSize:11}}>sign out</button>
            </div>
          </div>
        </div>
      )}

      {showWeeklyCheck&&screen==="home"&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",zIndex:190,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(8px)"}}>
          <div style={{...cardStyle(),border:`1px solid ${ACCENT}44`,padding:"24px",width:"100%",maxWidth:300,animation:"screenIn 0.3s ease"}}>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
              <div style={{animation:"floatY 3s ease-in-out infinite"}}><FluxCharacter size={44} mood="happy" warm={night}/></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:ACCENT,letterSpacing:"0.15em",textTransform:"uppercase"}}>Flux · Weekly Check</div>
            </div>
            <div style={{fontFamily:"'Lora',serif",fontSize:14,fontStyle:"italic",color:`${TEXT}0.8)`,lineHeight:1.7,marginBottom:16}}>"How often did talking or breathing with me actually help this week?"</div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>{[{v:1,e:"😐"},{v:2,e:"🙂"},{v:3,e:"😌"},{v:4,e:"🌟"},{v:5,e:"🔥"}].map(o=><button key={o.v} onClick={()=>setWeeklyFeedback(o.v)} style={{flex:1,background:weeklyFeedback===o.v?`${ACCENT}22`:"rgba(255,255,255,0.03)",border:`1.5px solid ${weeklyFeedback===o.v?ACCENT:"rgba(255,255,255,0.08)"}`,padding:"9px 4px",cursor:"pointer",fontSize:18,transition:"all 0.2s",borderRadius:3}}>{o.e}</button>)}</div>
            {weeklyFeedback&&<div style={{fontFamily:"'Lora',serif",fontSize:11,fontStyle:"italic",color:`${TEXT}0.35)`,marginBottom:10,textAlign:"center"}}>noted. stays private, just for you.</div>}
            <button onClick={()=>{setShowWeeklyCheck(false);if(weeklyFeedback)gainXP(20);}} className={`btn${weeklyFeedback?" btn-gold":""}`} style={{width:"100%",padding:"12px"}}>{weeklyFeedback?"✓ save · +20 xp":"skip for now"}</button>
          </div>
        </div>
      )}

      {showUpgrade&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(8px)"}}>
          <div style={{...cardStyle(),border:`1px solid ${ACCENT}44`,padding:"28px 24px",width:"100%",maxWidth:300,textAlign:"center",animation:"screenIn 0.3s ease"}}>
            <Particles count={8} color={ACCENT}/>
            <div style={{fontSize:32,marginBottom:14,animation:"floatY 2.5s ease-in-out infinite"}}>✦</div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:ACCENT,letterSpacing:"0.2em",marginBottom:6,textTransform:"uppercase"}}>Pro required</div>
            <div style={{fontFamily:"'Lora',serif",fontSize:20,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:8}}>Unlock everything</div>
            <div style={{fontFamily:"'Lora',serif",fontSize:13,color:`${TEXT}0.5)`,lineHeight:1.7,marginBottom:20}}>Sleep Mode · 9 breathing techniques<br/>Intel Tier 2 & 3 · Unlimited FLUX</div>
            <div style={{background:`linear-gradient(135deg,rgba(232,160,64,0.1),rgba(15,10,10,0.98))`,border:`1px solid ${ACCENT}55`,padding:"14px",marginBottom:8,borderRadius:4,position:"relative"}}>
              <div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",background:ACCENT,color:"#000",fontFamily:"'JetBrains Mono',monospace",fontSize:8,fontWeight:600,letterSpacing:"0.1em",padding:"2px 10px",borderRadius:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>best value</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.4)`,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.1em"}}>Annual</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:4}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:28,fontWeight:600,color:ACCENT2}}>$59.99</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:`${TEXT}0.35)`}}>/yr</span></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#7B9E6B"}}>↓ save 50% · just $5/mo</div>
            </div>
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(242,232,220,0.07)",padding:"12px",marginBottom:8,borderRadius:3}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.1em"}}>Monthly</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:500,color:`${TEXT}0.7)`}}>$9.99</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:`${TEXT}0.25)`}}>/mo</span></div>
            </div>
            <button onClick={()=>{setIsPro(true);setShowUpgrade(false);gainXP(50);}} className="btn btn-gold" style={{width:"100%",padding:"13px",fontSize:12,marginBottom:10,marginTop:6}}>unlock pro · +50 xp</button>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:`${TEXT}0.15)`,textAlign:"center",marginBottom:4,letterSpacing:"0.08em",textTransform:"uppercase"}}>stripe integration coming · demo mode active</div>
            <button onClick={()=>setShowUpgrade(false)} style={{background:"none",border:"none",color:`${TEXT}0.25)`,fontSize:11,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>maybe later</button>
          </div>
        </div>
      )}

      {!hasOnboarded&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",animation:"screenIn 0.4s ease",position:"relative",overflowY:"auto",background:BG,minHeight:"100vh"}}>
          <Particles count={10} color={ACCENT}/>
          {onboardStep===1&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,position:"relative",zIndex:1,width:"100%",maxWidth:320,textAlign:"center"}}>
              <div style={{animation:"floatY 3.5s ease-in-out infinite",marginBottom:24}}><FluxCharacter size={100} mood="happy" glow/></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:"0.3em",textTransform:"uppercase",marginBottom:10}} className="neon-teal">// FLUSTERED</div>
              <div style={{fontFamily:"'Lora',Georgia,serif",fontSize:34,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:12,lineHeight:1.15,letterSpacing:"-0.5px"}}>Hey.<br/>I'm FLUX.</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:15,color:`${TEXT}0.6)`,maxWidth:260,lineHeight:1.75,marginBottom:8}}>I'm here when things get hard. Panic attacks, racing thoughts, 2am anxiety — I got you.</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"rgba(242,232,220,0.5)",marginBottom:32,letterSpacing:"0.06em"}}>no account · no judgment · stays private</div>
              {!onboardBreathing?(
                <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%"}}>
                  <button onClick={startOnboardBreath} className="btn btn-gold" style={{padding:"15px",fontSize:13,width:"100%"}}>try a quick breath with me</button>
                  <button onClick={()=>setOnboardStep(2)} style={{background:"none",border:"none",color:"rgba(242,232,220,0.45)",fontSize:13,fontFamily:"'Lora',serif",fontStyle:"italic",cursor:"pointer",padding:"4px"}}>skip →</button>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,width:"100%"}}>
                  <BreathOrb phase={onboardPhase} color={["#9B6BAA","#6D3D8A","#4AABB5"][onboardPhase]} timer={onboardTimer} label={["INHALE","HOLD","EXHALE"][onboardPhase]} active/>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.3)`,letterSpacing:"0.1em",textTransform:"uppercase"}}>box breathing · 15 seconds</div>
                  <button onClick={skipOnboardBreath} style={{padding:"12px 36px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",background:"rgba(232,160,64,0.1)",border:"1px solid rgba(232,160,64,0.4)",color:"rgba(242,232,220,0.85)",cursor:"pointer",borderRadius:3,transition:"all 0.2s",position:"relative",zIndex:10}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(232,160,64,0.2)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(232,160,64,0.1)";}}>skip →</button>
                </div>
              )}
            </div>
          )}
          {onboardStep===2&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative",zIndex:1,width:"100%",maxWidth:340}}>
              <div style={{animation:"floatY 3s ease-in-out infinite",marginBottom:20}}><FluxCharacter size={64} mood="happy" glow/></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.25)`,letterSpacing:"0.15em",marginBottom:8,textTransform:"uppercase"}}>Step 2 of 3</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:4,textAlign:"center"}}>Which version of me feels right?</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.3)`,marginBottom:20}}>you can change this anytime</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,width:"100%",marginBottom:24}}>
                {VOICES.map(v=>(
                  <div key={v.id} onClick={()=>setOnboardVoice(v.id)} style={{background:onboardVoice===v.id?`linear-gradient(135deg,${v.color}12,${BG})`:"rgba(255,255,255,0.02)",border:`1.5px solid ${onboardVoice===v.id?v.color+"66":"rgba(242,232,220,0.07)"}`,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all 0.2s",borderRadius:4}}>
                    <span style={{fontSize:20,flexShrink:0}}>{v.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:500,color:onboardVoice===v.id?v.color:`${TEXT}0.8)`}}>{v.name}</div>
                      <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.35)`,marginTop:1}}>{v.personality}</div>
                    </div>
                    {onboardVoice===v.id&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:v.color,letterSpacing:"0.1em",textTransform:"uppercase"}}>selected</div>}
                  </div>
                ))}
              </div>
              <button onClick={()=>setOnboardStep(3)} className="btn btn-gold" style={{width:"100%",padding:"14px",fontSize:12}}>continue →</button>
            </div>
          )}
          {onboardStep===3&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative",zIndex:1,width:"100%",maxWidth:320,textAlign:"center"}}>
              <div style={{animation:"floatY 3s ease-in-out infinite",marginBottom:20}}><FluxCharacter size={64} mood="neutral" glow/></div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.25)`,letterSpacing:"0.15em",marginBottom:8,textTransform:"uppercase"}}>Step 3 of 3</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:4}}>What brings you here?</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.3)`,marginBottom:16}}>helps me show up better for you</div>
              <input value={userName} onChange={e=>setUserName(e.target.value)} placeholder="what should i call you? (optional)" style={{width:"100%",background:"rgba(255,255,255,0.03)",border:`1px solid ${ACCENT}22`,padding:"11px 14px",color:`${TEXT}0.85)`,fontSize:13,fontFamily:"'Lora',serif",borderRadius:3,marginBottom:16,boxSizing:"border-box",transition:"border-color 0.2s",textAlign:"center"}} onFocus={e=>e.target.style.borderColor=ACCENT+"55"} onBlur={e=>e.target.style.borderColor=ACCENT+"22"}/>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",maxWidth:300,marginBottom:28}}>
                {["Panic attacks","Racing thoughts","Trouble sleeping","Overthinking","Just need to talk"].map(opt=>(
                  <button key={opt} onClick={()=>setMainTrigger(opt)} style={{padding:"10px 14px",background:mainTrigger===opt?`linear-gradient(135deg,${ACCENT}22,${BG})`:"rgba(255,255,255,0.03)",border:`1px solid ${mainTrigger===opt?ACCENT+"55":"rgba(242,232,220,0.08)"}`,color:mainTrigger===opt?ACCENT2:`${TEXT}0.55)`,fontFamily:"'JetBrains Mono',monospace",fontSize:10,cursor:"pointer",transition:"all 0.2s",borderRadius:3,letterSpacing:"0.04em",textTransform:"uppercase"}}>{opt}</button>
                ))}
              </div>
              <button onClick={completeOnboarding} className="btn btn-gold" style={{width:"100%",padding:"15px",fontSize:13,marginBottom:8}}>let's go · +25 xp</button>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.15)`,letterSpacing:"0.1em",textTransform:"uppercase"}}>no notifications · no account needed</div>
            </div>
          )}
        </div>
      )}

      {hasOnboarded&&screen==="home"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"18px 20px 100px 20px",overflowY:"auto",animation:"screenIn 0.35s ease",position:"relative",minHeight:"100vh"}}>
          <Particles count={night?6:10} color={ACCENT} slow={night}/>
          {night&&<div style={{background:"rgba(217,119,6,0.07)",border:"1px solid rgba(217,119,6,0.15)",padding:"7px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,borderRadius:3,position:"relative",zIndex:1}}>
            <span style={{fontSize:13}}>🌙</span>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#D97706",letterSpacing:"0.1em",textTransform:"uppercase"}}>{midnight?"midnight mode — you're safe here":"late night mode"}</div>
          </div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,position:"relative",zIndex:1}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase"}} className="neon-teal">flustered</div>
            <div style={{textAlign:"right"}}>
              {isPro&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:ACCENT,letterSpacing:"0.2em",marginBottom:4,textTransform:"uppercase"}}>★ pro</div>}
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.25)`,marginBottom:5}}>lv {level} · {xp} xp</div>
              <div style={{width:80}}><XPBar current={xpInLevel} max={200} color={ACCENT} animate={xpAnim}/></div>
            </div>
          </div>
          {showPrivacyNote&&<div style={{...cardStyle(),marginBottom:14,display:"flex",alignItems:"center",gap:10,position:"relative",zIndex:1,animation:"stagger 0.3s ease"}}>
            <span style={{fontSize:12}}>🔒</span>
            <div style={{fontFamily:"'Lora',serif",fontSize:12,fontStyle:"italic",color:`${TEXT}0.4)`,flex:1}}>everything stays here. no judgment, no sharing.</div>
            <button onClick={()=>setShowPrivacyNote(false)} style={{background:"none",border:"none",color:`${TEXT}0.2)`,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>×</button>
          </div>}
          <div style={{...cardStyle(`${ACCENT}08`),border:`1px solid ${ACCENT}22`,marginBottom:14,position:"relative",zIndex:1,animation:"stagger 0.3s 0.05s both"}}>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <div style={{flexShrink:0,animation:"floatY 3.5s ease-in-out infinite"}}><FluxCharacter size={56} mood={checkedInToday?"happy":"neutral"} glow warm={night}/></div>
              <div>
                <div style={{fontFamily:"'Lora',Georgia,serif",fontSize:26,fontWeight:700,color:`${TEXT}0.95)`,lineHeight:1.2,letterSpacing:"-0.3px"}}>{night?(midnight?`can't sleep${userProfile.name?", "+userProfile.name:""}?`:`hey${userProfile.name?", "+userProfile.name:""}. still up.`):`hey${userProfile.name?", "+userProfile.name:""}. you good?`}</div>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.45)`,marginTop:4}}>{checkedInToday?"good to see you again.":night?"i'm here if you need me.":"haven't checked in yet."}</div>
              </div>
            </div>
          </div>
          {showGroundingCards.length>0&&<div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:8,position:"relative",zIndex:1}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:2}}>// flux suggests</div>
            {showGroundingCards.map(c=><GroundingCard key={c.id} card={c} onDismiss={()=>{setDismissedCards(p=>[...p,c.id]);setShowGroundingCards(p=>p.filter(x=>x.id!==c.id));}}/>)}
          </div>}
          <button onClick={startSOS} style={{background:"linear-gradient(135deg,rgba(196,104,122,0.12),rgba(15,10,10,0.98))",border:"1px solid rgba(196,104,122,0.3)",padding:"20px",cursor:"pointer",marginBottom:14,position:"relative",width:"100%",boxSizing:"border-box",textAlign:"left",animation:"stagger 0.35s 0.1s both, sosPulse 4s ease-in-out infinite",zIndex:1,borderRadius:4}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:50,height:50,background:"rgba(196,104,122,0.1)",border:"1px solid rgba(196,104,122,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,borderRadius:3}}>🆘</div>
              <div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,letterSpacing:"0.2em",marginBottom:5,textTransform:"uppercase",color:"#E8A0AA"}}>panic now? · instant help</div>
                <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,color:"rgba(242,210,210,0.9)",marginBottom:3,letterSpacing:"-0.2px"}}>SOS · I need help right now</div>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:"rgba(196,104,122,0.6)"}}>starts breathing immediately</div>
              </div>
            </div>
          </button>
          <button onClick={()=>{nav("chat");setVoiceMode(false);gainXP(5);}} style={{background:`linear-gradient(135deg,${currentVoice.color}14,rgba(15,10,10,0.98))`,border:`1px solid ${currentVoice.color}44`,padding:"20px",cursor:"pointer",marginBottom:14,position:"relative",width:"100%",boxSizing:"border-box",textAlign:"left",animation:"stagger 0.35s 0.15s both",zIndex:1,borderRadius:4,boxShadow:`0 0 24px ${currentVoice.color}22, 0 0 48px ${currentVoice.color}0A`,transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=currentVoice.color+"77";e.currentTarget.style.boxShadow=`0 0 32px ${currentVoice.color}44, 0 0 64px ${currentVoice.color}18`;e.currentTarget.style.transform="translateY(-1px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=currentVoice.color+"44";e.currentTarget.style.boxShadow=`0 0 24px ${currentVoice.color}22, 0 0 48px ${currentVoice.color}0A`;e.currentTarget.style.transform="translateY(0)";}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:50,height:50,background:`${currentVoice.color}18`,border:`1px solid ${currentVoice.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,borderRadius:3,boxShadow:`0 0 16px ${currentVoice.color}44`,animation:"floatY 3.5s ease-in-out infinite"}}>{currentVoice.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:currentVoice.color,letterSpacing:"0.2em",marginBottom:5,textTransform:"uppercase"}}>{night?"🌙 flux is awake":"talk to flux"} · {currentVoice.personality.toLowerCase()}</div>
                <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:3,letterSpacing:"-0.2px"}}>{currentVoice.name} {returningUser?"remembers you":"is ready"}</div>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:currentVoice.color,opacity:0.7}}>{returningUser?"pick up where you left off":"first time? say anything"}</div>
              </div>
            </div>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${currentVoice.color}66,transparent)`,borderRadius:"0 0 4px 4px"}}/>
          </button>
          {!checkedInToday?(
            <button onClick={()=>{setCheckinMood(null);setCheckinFeelings([]);setCheckinNote("");nav("checkin");}} style={{...cardStyle(),border:`1px solid ${ACCENT}1a`,marginBottom:14,cursor:"pointer",textAlign:"left",width:"100%",boxSizing:"border-box",display:"block",animation:"stagger 0.35s 0.2s both",zIndex:1}} onMouseEnter={e=>e.currentTarget.style.borderColor=ACCENT+"33"} onMouseLeave={e=>e.currentTarget.style.borderColor=ACCENT+"1a"}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:ACCENT,letterSpacing:"0.15em",marginBottom:5,opacity:0.7,textTransform:"uppercase"}}>check-in · +30 xp</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:16,fontWeight:600,color:`${TEXT}0.9)`,marginBottom:3}}>How are you today?</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.35)`,lineHeight:1.5}}>30 seconds. no pressure.</div>
            </button>
          ):(
            <div style={{background:"rgba(123,158,107,0.06)",border:"1px solid rgba(123,158,107,0.2)",padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,animation:"stagger 0.35s 0.2s both",zIndex:1,position:"relative",borderRadius:4}}>
              <span style={{color:"#7B9E6B",fontSize:16}}>✓</span>
              <div><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:"rgba(168,200,152,0.9)"}}>check-in complete</div><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:"rgba(123,158,107,0.6)",marginTop:2}}>come back whenever</div></div>
            </div>
          )}
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,letterSpacing:"0.12em",marginBottom:8,textTransform:"uppercase",position:"relative",zIndex:1}}>// tools</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14,animation:"stagger 0.35s 0.25s both",position:"relative",zIndex:1}}>
            {[
              {label:"Intel",icon:"📡",color:"#9B6BAA",action:()=>nav("intel"),sub:"classified briefings"},
              {label:"Breathwork",icon:"💨",color:"#4AABB5",action:()=>nav("library"),sub:"9 techniques",hero:true},
              {label:"Sleep",icon:"🌙",color:"#4A7BAA",action:startSleep,note:!isPro?"pro":"",sub:"wind-down flow"},
              {label:"Tracker",icon:"📈",color:"#7B9E6B",action:()=>nav("tracker"),sub:"mood over time"},
              {label:"Missions",icon:"⚔️",color:"#E8A040",action:()=>nav("missions"),sub:"daily & weekly"},
              {label:"Achievements",icon:"🏆",color:"#C8A020",action:()=>nav("achievements"),sub:"earned, not tracked"},
            ].map(b=>(
              <button key={b.label} onClick={b.action} style={{
                padding: b.hero ? "22px 14px" : "18px 14px",
                textAlign:"center",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap: b.hero ? 12 : 8,
                minHeight: b.hero ? 130 : 110,
                position:"relative",overflow:"hidden",
                background:`linear-gradient(145deg,${b.color}${b.hero?"18":"0D"},rgba(10,8,8,0.97))`,
                border:`1px solid ${b.color}${b.hero?"55":"2A"}`,
                borderRadius:4,
                boxShadow: b.hero ? `0 0 24px ${b.color}33, 0 0 48px ${b.color}12, inset 0 0 20px ${b.color}08` : `0 0 12px ${b.color}18, inset 0 0 12px ${b.color}04`,
                cursor:"pointer",
                transition:"all 0.22s cubic-bezier(0.4,0,0.2,1)"
              }}
              onMouseEnter={e=>{
                e.currentTarget.style.borderColor=`${b.color}88`;
                e.currentTarget.style.boxShadow=`0 0 32px ${b.color}44, 0 0 64px ${b.color}18, inset 0 0 24px ${b.color}10`;
                e.currentTarget.style.transform="translateY(-3px)";
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.borderColor=`${b.color}${b.hero?"55":"2A"}`;
                e.currentTarget.style.boxShadow=b.hero?`0 0 24px ${b.color}33, 0 0 48px ${b.color}12, inset 0 0 20px ${b.color}08`:`0 0 12px ${b.color}18, inset 0 0 12px ${b.color}04`;
                e.currentTarget.style.transform="translateY(0)";
              }}>
                <div style={{fontSize: b.hero ? 38 : 30,lineHeight:1,filter:`drop-shadow(0 0 ${b.hero?"12px":"6px"} ${b.color}${b.hero?"99":"55"})`,animation:b.hero?"floatY 3s ease-in-out infinite":"none"}}>{b.icon}</div>
                <div>
                  <div style={{fontFamily:"'Lora',Georgia,serif",fontSize: b.hero ? 17 : 14,fontWeight:700,color:"rgba(242,232,220,0.95)",letterSpacing:"0.01em",lineHeight:1.2,marginBottom:3}}>
                    {b.note?<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:ACCENT,letterSpacing:"0.1em",display:"block",marginBottom:3,textTransform:"uppercase"}}>pro</span>:null}
                    {b.label}
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${b.color}`,opacity: b.hero ? 0.8 : 0.5,letterSpacing:"0.06em",textTransform:"uppercase"}}>{b.sub}</div>
                </div>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height: b.hero ? 3 : 2,background:`linear-gradient(90deg,transparent,${b.color}${b.hero?"88":"44"},transparent)`}}/>
                {b.hero&&<div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${b.color}33,transparent)`}}/>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,position:"relative",zIndex:1}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.15)`,letterSpacing:"0.1em",textTransform:"uppercase"}}>{totalSessions} sessions</div>
            <button onClick={()=>setShowSignOut(true)} style={{background:"none",border:"none",color:`${TEXT}0.2)`,fontFamily:"'JetBrains Mono',monospace",fontSize:8,cursor:"pointer",letterSpacing:"0.08em",textTransform:"uppercase",transition:"color 0.2s",padding:0}} onMouseEnter={e=>e.currentTarget.style.color=`${TEXT}0.45)`} onMouseLeave={e=>e.currentTarget.style.color=`${TEXT}0.2)`}>sign out →</button>
          </div>
          <button onClick={()=>{setSelectedVoiceTemp(selectedVoice);nav("voices");}} style={{...cardStyle(),border:`1px solid ${currentVoice.color}22`,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,width:"100%",boxSizing:"border-box",position:"relative",zIndex:1,transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=currentVoice.color+"44"} onMouseLeave={e=>e.currentTarget.style.borderColor=currentVoice.color+"22"}>
            <span style={{fontSize:16,flexShrink:0}}>{currentVoice.icon}</span>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,letterSpacing:"0.1em",marginBottom:2,textTransform:"uppercase"}}>active voice</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:12,color:currentVoice.color}}>{currentVoice.name} · {currentVoice.personality}</div>
            </div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.2)`}}>change →</div>
          </button>
        </div>
      )}

      {hasOnboarded&&screen==="achievements"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Badges" sub="hidden achievements — earned, not tracked" back={()=>nav("home")}/>
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:8}}>
            {HIDDEN_ACHIEVEMENTS.map((a,i)=>{
              const earned=unlockedAchievements.includes(a.id);
              return(<div key={a.id} style={{...cardStyle(earned?"rgba(232,160,64,0.06)":"transparent"),border:`1px solid ${earned?"rgba(232,160,64,0.2)":"rgba(242,232,220,0.05)"}`,display:"flex",gap:14,alignItems:"center",opacity:earned?1:0.35,animation:`stagger 0.3s ${i*0.06}s both`}}>
                <div style={{fontSize:26,filter:earned?"drop-shadow(0 0 6px rgba(232,160,64,0.5))":"grayscale(1)"}}>{a.icon}</div>
                <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:`${TEXT}${earned?"0.9":"0.4}"}`}}>{a.label}</div><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.3)`,marginTop:2}}>{earned?a.desc:"???"}</div></div>
                {earned&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:ACCENT,textTransform:"uppercase",letterSpacing:"0.1em"}}>earned</div>}
              </div>);
            })}
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="checkin"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Check In" sub="+30 xp · 30 seconds" back={()=>nav("home")}/>
          <div style={{flex:1,overflowY:"auto",padding:"18px",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{animation:"stagger 0.3s 0.05s both"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,letterSpacing:"0.12em",marginBottom:12,textTransform:"uppercase"}}>// how are you right now?</div>
              <div style={{display:"flex",gap:6}}>{MOODS.map(m=><button key={m.score} className={`mood-btn${checkinMood===m.score?" sel":""}`} onClick={()=>setCheckinMood(m.score)}><span style={{fontSize:24,filter:checkinMood===m.score?`drop-shadow(0 0 8px ${moodColor(m.score)})`:"none",transition:"filter 0.2s"}}>{m.emoji}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:checkinMood===m.score?ACCENT:`${TEXT}0.3)`,transition:"color 0.2s",textTransform:"uppercase",letterSpacing:"0.04em"}}>{m.label}</span></button>)}</div>
            </div>
            {checkinMood&&checkinMood<=2&&(
              <div style={{background:"rgba(74,171,181,0.06)",border:"1px solid rgba(74,171,181,0.15)",padding:"12px 14px",animation:"slideUp 0.3s ease",borderRadius:3}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:"#4AABB5",letterSpacing:"0.12em",marginBottom:6,textTransform:"uppercase"}}>flux</div>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.65)`,lineHeight:1.65}}>{checkinMood===1?"that sounds rough. i'll have a couple of quick tools ready for you.":"feeling low — that's real. i've got something small that might help."}</div>
              </div>
            )}
            <div style={{animation:"stagger 0.3s 0.1s both"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,letterSpacing:"0.12em",marginBottom:10,textTransform:"uppercase"}}>// what's present?</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{FEELINGS.map(f=><button key={f} className={`feel${checkinFeelings.includes(f)?" on":""}`} onClick={()=>setCheckinFeelings(p=>p.includes(f)?p.filter(x=>x!==f):[...p,f])}>{f}</button>)}</div>
            </div>
            <div style={{animation:"stagger 0.3s 0.15s both"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,letterSpacing:"0.12em",marginBottom:8,textTransform:"uppercase"}}>// anything else? (optional)</div>
              <textarea value={checkinNote} onChange={e=>setCheckinNote(e.target.value)} rows={3} placeholder="whatever's on your mind…" style={{width:"100%",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(242,232,220,0.08)",padding:"10px 12px",color:`${TEXT}0.8)`,fontSize:13,fontFamily:"'Lora',serif",boxSizing:"border-box",transition:"border-color 0.2s",borderRadius:3,lineHeight:1.6}} onFocus={e=>e.target.style.borderColor=ACCENT+"33"} onBlur={e=>e.target.style.borderColor="rgba(242,232,220,0.08)"}/>
            </div>
            <button onClick={handleCheckinSave} className={`btn${checkinMood?" btn-gold":""}`} style={{width:"100%",padding:"14px",fontSize:12,cursor:checkinMood?"pointer":"not-allowed",opacity:checkinMood?1:0.4}}>
              {checkinMood?"✓ save check-in · +30 xp":"select a mood first"}
            </button>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="chat"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:"100vh",animation:"screenIn 0.3s ease"}}>
          <div style={{padding:"12px 18px 10px",borderBottom:`1px solid ${BORDER}0.06)`,display:"flex",alignItems:"center",gap:12,flexShrink:0,background:BG}}>
            <button onClick={()=>nav("home")} style={{background:"none",border:"none",color:ACCENT,cursor:"pointer",fontSize:20,padding:0,lineHeight:1,fontFamily:"'Lora',serif"}}>←</button>
            <div style={{animation:"floatY 4s ease-in-out infinite"}}><FluxCharacter size={34} mood="neutral" warm={night}/></div>
            <div>
              <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:`${TEXT}0.9)`}}>FLUX · {currentVoice.name}{userProfile.name?` · ${userProfile.name}`:""}</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase"}} className="neon-teal">● online{night?" · night mode":""}</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
              {pinnedReplies.length>0&&<button onClick={()=>setShowPinned(p=>!p)} className="btn" style={{fontSize:10,padding:"5px 8px",borderColor:showPinned?ACCENT:"rgba(242,232,220,0.1)",color:showPinned?ACCENT:`${TEXT}0.4)`}}>📌</button>}
              <button onClick={()=>{setVoiceMode(v=>!v);if(speaking)stopSpeaking();}} className="btn" style={{fontSize:10,padding:"5px 10px",borderColor:voiceMode?currentVoice.color:"rgba(242,232,220,0.1)",color:voiceMode?currentVoice.color:`${TEXT}0.4)`}}>{voiceMode?"🔊":"💬"}</button>
              <button onClick={startSOS} className="btn btn-rose" style={{fontSize:10,padding:"6px 10px"}}>!! SOS</button>
            </div>
          </div>
          {showPinned&&pinnedReplies.length>0&&(
            <div style={{padding:"10px 14px",background:"rgba(255,255,255,0.02)",borderBottom:`1px solid ${BORDER}0.05)`,flexShrink:0}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,letterSpacing:"0.1em",marginBottom:6,textTransform:"uppercase"}}>📌 pinned</div>
              {pinnedReplies.map((p,i)=><div key={i} style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.6)`,lineHeight:1.5,padding:"5px 0",borderTop:i>0?`1px solid ${BORDER}0.05)`:""}}>{p.text.slice(0,120)}{p.text.length>120?"…":""}</div>)}
            </div>
          )}
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
            {messages.length===0&&memoryLoaded&&(
              <div style={{textAlign:"center",marginTop:20}}>
                <div style={{animation:"floatY 3.5s ease-in-out infinite",marginBottom:16,display:"flex",justifyContent:"center"}}><FluxCharacter size={72} mood="happy" glow warm={night}/></div>
                {returningUser?(
                  <>
                    <div style={{fontFamily:"'Lora',serif",fontSize:15,fontStyle:"italic",color:`${TEXT}0.5)`,marginBottom:4}}>welcome back.</div>
                    <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.3)`,marginBottom:6,lineHeight:1.6}}>{night?"still up. i'm here.":"good to see you again. scroll up to pick up where we left off."}</div>
                    <button onClick={()=>{try{localStorage.removeItem('flux_memory');}catch(e){}convHistory.current=[];setMessages([]);setReturningUser(false);}} style={{background:"none",border:"none",color:`${TEXT}0.15)`,fontFamily:"'JetBrains Mono',monospace",fontSize:8,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,transition:"color 0.2s",display:"block"}} onMouseEnter={e=>e.currentTarget.style.color=`${TEXT}0.35)`} onMouseLeave={e=>e.currentTarget.style.color=`${TEXT}0.15)`}>clear this chat →</button>
                    <button onClick={()=>{try{localStorage.removeItem('flux_memory');localStorage.removeItem('flux_profile');}catch(e){}convHistory.current=[];setMessages([]);setReturningUser(false);setUserProfile({recentMoods:[],patterns:[],triggers:[],notes:[],voiceHistory:[]});}} style={{background:"none",border:"none",color:`${TEXT}0.1)`,fontFamily:"'JetBrains Mono',monospace",fontSize:7,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:20,transition:"color 0.2s",display:"block"}} onMouseEnter={e=>e.currentTarget.style.color=`${TEXT}0.3)`} onMouseLeave={e=>e.currentTarget.style.color=`${TEXT}0.1)`}>reset all memory →</button>
                  </>
                ):(
                  <>
                    <div style={{fontFamily:"'Lora',serif",fontSize:15,fontStyle:"italic",color:`${TEXT}0.4)`,marginBottom:4}}>FLUX is ready.</div>
                    <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.25)`,marginBottom:20}}>{night?"it's late — no need to explain much.":"what's going on?"}</div>
                  </>
                )}
                <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>{QUICK_ACTIONS.map(a=><button key={a.label} className="btn" style={{fontSize:10}} onClick={()=>sendMessage(a.prompt)}>{a.label}</button>)}</div>
              </div>
            )}
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",flexDirection:m.from==="user"?"row-reverse":"row",animation:"slideUp 0.2s ease"}}>
                {m.from==="flux"&&<div style={{flexShrink:0,marginTop:2}}><FluxCharacter size={28} mood="neutral" warm={night}/></div>}
                <div style={{maxWidth:"78%",padding:"11px 14px",fontSize:13,lineHeight:1.7,fontFamily:"'Lora',serif",background:m.from==="user"?"linear-gradient(135deg,rgba(232,160,64,0.12),rgba(15,10,10,0.98))":"rgba(255,255,255,0.03)",border:m.from==="user"?`1px solid rgba(232,160,64,0.2)`:`1px solid ${BORDER}0.07)`,borderRadius:4,color:m.from==="user"?`${TEXT}0.9)`:night?"rgba(242,220,180,0.8)":`${TEXT}0.75)`}}>
                  {m.text}
                  {m.from==="flux"&&m.pinnable&&<button onClick={()=>pinReply(m)} style={{display:"block",marginTop:6,background:"none",border:"none",color:`${TEXT}0.2)`,fontFamily:"'JetBrains Mono',monospace",fontSize:9,cursor:"pointer",padding:0,transition:"color 0.2s",textTransform:"uppercase",letterSpacing:"0.06em"}} onMouseEnter={e=>e.currentTarget.style.color=ACCENT} onMouseLeave={e=>e.currentTarget.style.color=`${TEXT}0.2)`}>📌 pin this</button>}
                </div>
              </div>
            ))}
            {loading&&(
              <div style={{display:"flex",gap:10,alignItems:"center",animation:"slideUp 0.2s ease"}}>
                <FluxCharacter size={26} mood="neutral" warm={night}/>
                <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${BORDER}0.07)`,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,borderRadius:4}}>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:ACCENT,animation:`pulse 1.4s ${i*0.18}s ease-in-out infinite`,opacity:0.7}}/>)}
                  </div>
                  <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.35)`}}>FLUX is thinking…</div>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:"4px 16px",borderTop:`1px solid ${BORDER}0.04)`,display:"flex",justifyContent:"center",flexShrink:0}}>
            <button onClick={()=>setShowCrisis(true)} style={{background:"none",border:"none",color:`${TEXT}0.2)`,fontFamily:"'JetBrains Mono',monospace",fontSize:8,cursor:"pointer",padding:"4px 0",transition:"color 0.2s",textTransform:"uppercase",letterSpacing:"0.06em"}} onMouseEnter={e=>e.currentTarget.style.color=`${TEXT}0.45)`} onMouseLeave={e=>e.currentTarget.style.color=`${TEXT}0.2)`}>need more help? →</button>
          </div>
          {messages.length>0&&<div style={{padding:"6px 12px",display:"flex",gap:6,overflowX:"auto",borderTop:`1px solid ${BORDER}0.05)`,flexShrink:0}}>{QUICK_ACTIONS.map(a=><button key={a.label} className="btn" style={{fontSize:9,padding:"5px 10px",whiteSpace:"nowrap"}} onClick={()=>sendMessage(a.prompt)}>{a.label}</button>)}</div>}
          <div style={{padding:"10px 14px 70px 14px",borderTop:`1px solid ${BORDER}0.06)`,display:"flex",gap:8,alignItems:"center",flexShrink:0,background:BG}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder={night?"still here, say anything…":"tell flux what's going on…"} style={{flex:1,background:"rgba(255,255,255,0.02)",border:`1px solid ${BORDER}0.08)`,padding:"10px 13px",color:`${TEXT}0.85)`,fontSize:13,fontFamily:"'Lora',serif",transition:"border-color 0.2s",borderRadius:3,lineHeight:1.5}} onFocus={e=>e.target.style.borderColor=ACCENT+"33"} onBlur={e=>e.target.style.borderColor=`${BORDER}0.08)`}/>
            <button onClick={()=>sendMessage()} className="btn" style={{background:input.trim()?`linear-gradient(135deg,${ACCENT},#C07820)`:"rgba(255,255,255,0.03)",color:"#fff",border:"none",width:38,height:38,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,borderRadius:3,transition:"all 0.2s"}}>→</button>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="sos"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"28px 20px 24px",textAlign:"center",background:`radial-gradient(ellipse at 50% 30%,rgba(196,104,122,0.1) 0%,${BG} 60%)`,animation:"screenIn 0.3s ease",position:"relative",minHeight:"100vh"}}>
          <Particles count={14} color="rgba(196,104,122,0.6)"/>
          <div style={{width:"100%",position:"relative",zIndex:1}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:"rgba(232,160,170,0.6)",letterSpacing:"0.25em",marginBottom:6,textTransform:"uppercase",textAlign:"center"}}>emergency mode</div>
            <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:"rgba(242,210,210,0.9)",letterSpacing:"-0.3px",textAlign:"center"}}>Box Breathing</div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18,position:"relative",zIndex:1}}>
            <BreathOrb phase={sosPhase} color={["#9B6BAA","#6D3D8A","#4AABB5"][sosPhase]} timer={sosTimer} label={["INHALE","HOLD","EXHALE"][sosPhase]} active={sosActive}/>
            <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:600,color:"rgba(242,232,220,0.9)",minHeight:28,letterSpacing:"0.02em",textShadow:`0 0 20px ${["#9B6BAA","#6D3D8A","#4AABB5"][sosPhase]}88`}}>{sosPhase===0?"fill your lungs slowly...":sosPhase===1?"hold steady...":"let it all go..."}</div>
            <div style={{display:"flex",gap:10}}>{[0,1,2,3].map(i=><div key={i} style={{width:10,height:10,background:i<breathCount?ACCENT:"rgba(255,255,255,0.06)",border:`1px solid ${i<breathCount?ACCENT:"rgba(255,255,255,0.1)"}`,borderRadius:2,transition:"all 0.5s",boxShadow:i<breathCount?`0 0 8px ${ACCENT}88`:""}}/>)}</div>
            {breathCount>=4&&<div style={{background:"rgba(123,158,107,0.08)",border:"1px solid rgba(123,158,107,0.2)",padding:"10px 20px",fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:"rgba(168,200,152,0.9)",animation:"slideUp 0.4s ease",borderRadius:3}}>4 breaths complete. well done.</div>}
            <button onClick={()=>{setSosActive(false);clearInterval(sosInterval.current);nav("home");}} style={{marginTop:8,background:"none",border:"1px solid rgba(232,160,170,0.3)",borderRadius:20,color:"rgba(232,160,170,0.8)",fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",padding:"7px 20px",cursor:"pointer",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(232,160,170,0.1)";e.currentTarget.style.borderColor="rgba(232,160,170,0.6)";}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="rgba(232,160,170,0.3)";}}>← leave</button>
          </div>
          <button onClick={()=>setShowCrisis(true)} style={{background:"none",border:"none",color:`${TEXT}0.2)`,fontFamily:"'JetBrains Mono',monospace",fontSize:8,cursor:"pointer",marginBottom:10,position:"relative",zIndex:1,textTransform:"uppercase",letterSpacing:"0.06em"}}>need more help? →</button>
          <div style={{display:"flex",gap:8,width:"100%",position:"relative",zIndex:1}}>
            <button onClick={()=>{setSosActive(false);clearInterval(sosInterval.current);nav("chat");gainXP(20);}} className="btn" style={{flex:1,padding:"13px",fontSize:11}}>talk to flux</button>
            <button onClick={()=>{setSosActive(false);clearInterval(sosInterval.current);nav("home");gainXP(20);}} className="btn btn-gold" style={{flex:1,padding:"13px",fontSize:11}}>done · +20 xp</button>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="library"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Breathwork Library" sub="ancient & modern techniques" back={()=>nav("home")}/>
          {!isPro&&<div style={{margin:"10px 16px 0",background:"rgba(74,123,170,0.06)",border:"1px solid rgba(74,123,170,0.15)",padding:"9px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0,borderRadius:3}}>
            <span style={{fontSize:13}}>🔒</span>
            <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:"rgba(147,197,253,0.7)",flex:1}}>4 free techniques. 5 more with Pro.</div>
            <button onClick={()=>setShowUpgrade(true)} className="btn" style={{fontSize:9,padding:"4px 10px",borderColor:"rgba(74,123,170,0.3)",color:"rgba(147,197,253,0.7)"}}>unlock</button>
          </div>}
          <div style={{padding:"8px 14px 6px",display:"flex",gap:6,flexShrink:0,overflowX:"auto"}}>
            {FILTERS.map(f=><button key={f} className={`btn${filter===f?" btn-gold":""}`} style={{padding:"5px 12px",fontSize:9,whiteSpace:"nowrap",textTransform:"uppercase"}} onClick={()=>setFilter(f)}>{f}</button>)}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"8px 14px 16px",display:"flex",flexDirection:"column",gap:8}}>
            {filteredEx.map((ex,i)=>{const locked=!ex.free&&!isPro;return(
              <div key={ex.id} className={`excard${locked?" locked":""}`} onClick={()=>!locked&&openExercise(ex)} style={{animation:`stagger 0.3s ${i*0.04}s both`}}>
                {locked&&<div style={{position:"absolute",top:8,right:8,fontFamily:"'JetBrains Mono',monospace",background:"rgba(15,26,46,0.9)",border:"1px solid rgba(74,123,170,0.2)",padding:"2px 6px",fontSize:8,color:"rgba(147,197,253,0.6)",textTransform:"uppercase",letterSpacing:"0.06em"}}>pro 🔒</div>}
                <div style={{position:"absolute",inset:0,background:`linear-gradient(135deg,${ex.color}06,transparent)`,pointerEvents:"none",borderRadius:4}}/>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,position:"relative"}}>
                  <span style={{fontSize:17,filter:locked?"grayscale(1)":`drop-shadow(0 0 4px ${ex.color}66)`}}>{ex.icon}</span>
                  <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:locked?`${TEXT}0.3)`:`${TEXT}0.9)`}}>{ex.name}</div><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:locked?`${TEXT}0.15)`:ex.tagColor,letterSpacing:"0.1em",textTransform:"uppercase"}}>{ex.tag}</span></div>
                  {!locked&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,flexShrink:0}}>+{ex.xp}xp</div>}
                </div>
                <div style={{fontFamily:"'Lora',serif",fontSize:12,color:locked?`${TEXT}0.2)`:`${TEXT}0.5)`,lineHeight:1.55,marginBottom:locked?0:8,position:"relative"}}>{ex.desc}</div>
                {!locked&&<div style={{display:"flex",gap:4,flexWrap:"wrap",position:"relative"}}>{ex.steps.map((s,j)=><span key={j} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,border:`1px solid ${BORDER}0.06)`,padding:"2px 6px",borderRadius:2,textTransform:"uppercase",letterSpacing:"0.04em"}}>{s}</span>)}</div>}
              </div>
            );})}
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="exercise"&&activeExercise&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 18px",gap:14,animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <div style={{width:"100%",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>{setExActive(false);clearInterval(exInterval.current);nav("library");}} style={{background:"none",border:"none",color:ACCENT,cursor:"pointer",fontSize:20,padding:0,fontFamily:"'Lora',serif"}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:activeExercise.tagColor,letterSpacing:"0.12em",textTransform:"uppercase"}}>{activeExercise.tag}</div>
              <div style={{fontFamily:"'Lora',serif",fontWeight:700,fontSize:16,color:`${TEXT}0.95)`}}>{activeExercise.name}</div>
            </div>
            <span style={{fontSize:22,filter:`drop-shadow(0 0 6px ${activeExercise.color}88)`}}>{activeExercise.icon}</span>
          </div>
          <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.5)`,textAlign:"center",lineHeight:1.65,padding:"0 4px"}}>{activeExercise.desc}</div>
          <BreathOrb phase={exPhase} color={activeExercise.color} timer={exTimer} label={activeExercise.labels[exPhase]} active={exActive}/>
          {exActive&&<div style={{display:"flex",gap:8,alignItems:"center"}}>{[0,1,2,3].map(i=><div key={i} style={{width:8,height:8,background:i<exRounds?activeExercise.color:"rgba(255,255,255,0.06)",border:`1px solid ${i<exRounds?activeExercise.color:"rgba(255,255,255,0.1)"}`,borderRadius:2,transition:"all 0.4s",boxShadow:i<exRounds?`0 0 8px ${activeExercise.color}`:""}}/>)}<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.3)`,marginLeft:4,textTransform:"uppercase"}}>{exRounds} rounds</span></div>}
          {showExCelebration&&(
            <div style={{background:`linear-gradient(135deg,${activeExercise.color}18,rgba(10,8,8,0.98))`,border:`1px solid ${activeExercise.color}55`,borderRadius:4,padding:"18px",textAlign:"center",animation:"slideUp 0.4s cubic-bezier(0.4,0,0.2,1)",width:"100%",boxSizing:"border-box",boxShadow:`0 0 30px ${activeExercise.color}33`}}>
              <div style={{fontSize:32,marginBottom:8,animation:"floatY 2s ease-in-out infinite"}}>🌬️</div>
              <div style={{fontFamily:"'Lora',serif",fontSize:17,fontWeight:700,color:`${TEXT}0.95)`,marginBottom:4}}>4 rounds complete.</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.5)`,marginBottom:10}}>your nervous system just reset.</div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:activeExercise.color}}>+{activeExercise.xp} xp earned</div>
            </div>
          )}
          <div style={{...cardStyle(),width:"100%",boxSizing:"border-box"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,letterSpacing:"0.1em",marginBottom:10,textTransform:"uppercase"}}>sequence</div>
            {activeExercise.steps.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:18,height:18,background:exActive&&exPhase===i?activeExercise.color:"rgba(255,255,255,0.04)",border:`1px solid ${exActive&&exPhase===i?activeExercise.color:"rgba(255,255,255,0.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:exActive&&exPhase===i?"#000":`${TEXT}0.6)`,flexShrink:0,borderRadius:2,transition:"all 0.3s"}}>{i+1}</div>
                <span style={{fontFamily:"'Lora',serif",fontSize:12,color:exActive&&exPhase===i?`${TEXT}0.9)`:`${TEXT}0.4)`,transition:"color 0.3s"}}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,width:"100%"}}>
            {!exActive?<button onClick={startExercise} className="btn" style={{flex:1,background:`linear-gradient(135deg,${activeExercise.color},${activeExercise.color}AA)`,color:"#fff",border:"none",padding:"14px",fontSize:12,boxShadow:`0 4px 20px ${activeExercise.color}33`}}>start · +{activeExercise.xp}xp</button>:
            (<><button onClick={()=>{setExActive(false);clearInterval(exInterval.current);}} className="btn" style={{flex:1,padding:"13px"}}>pause</button><button onClick={completeExercise} className="btn btn-gold" style={{flex:1,padding:"13px"}}>✓ done</button></>)}
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="intel"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="The Intel" sub="classified briefings from flux" back={()=>nav("home")}/>
          <div style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:14}}>
            {[1,2].map(tier=>(
              <div key={tier}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:tier===1?ACCENT:"rgba(155,107,170,0.7)",letterSpacing:"0.15em",marginBottom:2,textTransform:"uppercase",opacity:0.8}}>tier {tier} — {tier===1?"what's happening":"what to do"}</div>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:10,color:`${TEXT}0.2)`,marginBottom:10}}>{tier===1?"free · understand your body":"pro · techniques that work"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {INTEL.filter(i=>i.tier===tier).map((item,idx)=>{
                    const locked=!item.free&&!isPro;const done=readIntel.includes(item.id);
                    return(<button key={item.id} onClick={()=>{if(locked){setShowUpgrade(true);return;}setActiveIntel(item);nav("intel_read");}} style={{...cardStyle(done?`${item.color}08`:"transparent"),border:`1px solid ${done?item.color+"33":"rgba(242,232,220,0.07)"}`,cursor:"pointer",textAlign:"left",animation:`stagger 0.3s ${idx*0.07}s both`,opacity:locked?0.4:1}} onMouseEnter={e=>{if(!locked){e.currentTarget.style.borderColor=item.color+"44";e.currentTarget.style.transform="translateY(-1px)";}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=done?item.color+"33":"rgba(242,232,220,0.07)";e.currentTarget.style.transform="translateY(0)";}}>
                      {locked&&<div style={{position:"absolute",top:8,right:8,fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:"rgba(147,197,253,0.5)",textTransform:"uppercase",letterSpacing:"0.06em"}}>pro 🔒</div>}
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                        <span style={{fontSize:18,filter:locked?"grayscale(1)":done?`drop-shadow(0 0 4px ${item.color}88)`:"none"}}>{item.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:locked?`${TEXT}0.15)`:item.tagColor,letterSpacing:"0.08em",marginBottom:2,textTransform:"uppercase"}}>{item.tag}</div>
                          <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:done?item.color:`${TEXT}0.85)`}}>{item.title}</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:done?"#7B9E6B":`${TEXT}0.2)`,textTransform:"uppercase"}}>{done?"read ✓":`+${item.xp}xp`}</div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.15)`,textTransform:"uppercase"}}>{item.readTime}</div>
                        </div>
                      </div>
                      <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.35)`,lineHeight:1.5}}>{item.body[0].slice(0,85)}…</div>
                    </button>);
                  })}
                </div>
              </div>
            ))}
            <div style={{...cardStyle(),border:`1px solid ${BORDER}0.04)`,textAlign:"center",marginTop:4}}>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.2)`,lineHeight:1.9}}>More intel dropping soon.<br/>Tier 3 · The Long Game · coming.</div>
            </div>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="intel_read"&&activeIntel&&(()=>{
        const item=activeIntel;const done=readIntel.includes(item.id);
        const goBack=()=>{if(!done){setReadIntel(p=>[...p,item.id]);gainXP(item.xp);}nav("intel");};
        return(
          <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",background:BG,position:"relative",minHeight:"100vh"}}>
            <div style={{padding:"12px 18px 10px",borderBottom:`1px solid ${BORDER}0.06)`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <button onClick={goBack} style={{background:"none",border:"none",color:item.color,cursor:"pointer",fontSize:20,padding:0,fontFamily:"'Lora',serif",transition:"opacity 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.6"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>←</button>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:item.tagColor,letterSpacing:"0.12em",textTransform:"uppercase"}}>{item.tag}</div>
                <div style={{fontFamily:"'Lora',serif",fontWeight:700,fontSize:14,color:`${TEXT}0.95)`}}>{item.title}</div>
              </div>
              <span style={{fontSize:20}}>{item.icon}</span>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"20px 20px 100px 20px",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20,padding:"10px 14px",background:`linear-gradient(135deg,${item.color}08,transparent)`,border:`1px solid ${item.color}18`,borderRadius:3}}>
                <FluxCharacter size={26} mood="neutral" warm={night}/>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:item.color,letterSpacing:"0.1em",opacity:0.8,textTransform:"uppercase"}}>flux · intel briefing · {item.readTime}</div>
              </div>
              {item.body.map((para,i)=>(
                <p key={i} style={{fontFamily:"'Lora',serif",fontSize:14,color:night?"rgba(242,220,180,0.8)":`${TEXT}0.75)`,lineHeight:1.85,margin:`0 0 20px 0`,animation:`stagger 0.4s ${i*0.1}s both`}}>{para}</p>
              ))}
              {!done&&<div style={{background:`linear-gradient(135deg,${item.color}0A,transparent)`,border:`1px solid ${item.color}22`,padding:"14px",marginTop:4,marginBottom:16,textAlign:"center",animation:"stagger 0.4s 0.4s both",borderRadius:3}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:item.color,letterSpacing:"0.12em",marginBottom:4,opacity:0.8,textTransform:"uppercase"}}>briefing complete</div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:22,fontWeight:500,color:`${TEXT}0.95)`}}>+{item.xp} xp</div>
              </div>}
              <button onClick={()=>{if(!done){setReadIntel(p=>[...p,item.id]);gainXP(item.xp);}nav(item.action.screen);}} className="btn" style={{background:`linear-gradient(135deg,${item.color},${item.color}AA)`,color:"#fff",border:"none",padding:"14px",fontSize:11,marginBottom:10,borderRadius:3}}>
                → {item.action.label}
              </button>
              <button onClick={goBack} style={{width:"100%",padding:"12px",background:"none",border:`1px solid ${item.color}22`,borderRadius:3,color:`${item.color}99`,fontFamily:"'JetBrains Mono',monospace",fontSize:10,cursor:"pointer",letterSpacing:"0.08em",textTransform:"uppercase",transition:"all 0.2s",marginBottom:4}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${item.color}55`;e.currentTarget.style.color=item.color;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=`${item.color}22`;e.currentTarget.style.color=`${item.color}99`;}}>← back to intel</button>
            </div>

          </div>
        );
      })()}

      {hasOnboarded&&screen==="tracker"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <div style={{padding:"12px 18px 10px",borderBottom:`1px solid ${BORDER}0.06)`,display:"flex",alignItems:"center",gap:12,flexShrink:0,background:BG}}>
            <button onClick={()=>nav("home")} style={{background:"none",border:"none",color:ACCENT,cursor:"pointer",fontSize:20,padding:0,fontFamily:"'Lora',serif"}}>←</button>
            <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontWeight:600,fontSize:16,color:`${TEXT}0.95)`}}>Mood Tracker</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.25)`,marginTop:2,textTransform:"uppercase",letterSpacing:"0.08em"}}>your calm score over time</div></div>
            <div style={{display:"flex",gap:6}}>
              <button className={`btn${trackerView==="week"?" btn-gold":""}`} style={{padding:"4px 10px",fontSize:9,textTransform:"uppercase"}} onClick={()=>setTrackerView("week")}>7d</button>
              <button className={`btn${trackerView==="month"?" btn-gold":""}`} style={{padding:"4px 10px",fontSize:9,textTransform:"uppercase"}} onClick={()=>setTrackerView("month")}>30d</button>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{label:"avg mood",value:avgMood,color:ACCENT},{label:"sessions",value:totalSessions,color:"#4AABB5"},{label:"top feeling",value:topFeeling,color:"#9B6BAA"}].map((s,i)=>(
                <div key={s.label} style={{...cardStyle(),textAlign:"center",animation:`stagger 0.3s ${i*0.07}s both`}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:500,color:s.color,marginBottom:4}}>{s.value}</div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:`${TEXT}0.25)`,letterSpacing:"0.1em",textTransform:"uppercase"}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{...cardStyle()}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"8px 10px",background:"rgba(74,171,181,0.05)",border:"1px solid rgba(74,171,181,0.1)",borderRadius:3}}>
                <FluxCharacter size={22} mood="neutral"/>
                <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.6)`,lineHeight:1.5}}>{moodHistory.filter(d=>d.date).length>0?`${moodHistory.filter(d=>d.date).length} real check-in${moodHistory.filter(d=>d.date).length>1?"s":""} logged. avg mood ${(moodHistory.filter(d=>d.date).reduce((a,b)=>a+b.score,0)/Math.max(moodHistory.filter(d=>d.date).length,1)).toFixed(1)}/5.`:"No real check-ins yet — this is demo data. Do your first check-in to start tracking."}</div>
              </div>
              <div style={{display:"flex",gap:0}}>
                <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",paddingRight:6,height:chartH+12}}>
                  {[5,4,3,2,1].map(n=><div key={n} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:moodColor(n)}}>{n}</div>)}
                </div>
                <div style={{flex:1}}>
                  <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{overflow:"visible"}}>
                    {[1,2,3,4,5].map(n=>{const y=padT+innerH-((n-1)/4)*innerH;return <line key={n} x1={padL} y1={y} x2={chartW-padR} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>;} )}
                    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ACCENT} stopOpacity="0.2"/><stop offset="100%" stopColor={ACCENT} stopOpacity="0"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                    <path d={smoothD+` L${pts[pts.length-1].x},${padT+innerH} L${pts[0].x},${padT+innerH} Z`} fill="url(#ag)"/>
                    <path d={smoothD} fill="none" stroke={ACCENT} strokeWidth="1.5" filter="url(#glow)" style={{strokeDasharray:800,animation:"drawLine 1.2s ease forwards"}}/>
                    {pts.map((p,i)=><rect key={i} x={p.x-3} y={p.y-3} width={6} height={6} fill={moodColor(p.score)} stroke={BG} strokeWidth="1" style={{cursor:"pointer",filter:`drop-shadow(0 0 3px ${moodColor(p.score)})`}} onClick={()=>setHoveredDay(hoveredDay===i?null:i)}/>)}
                    {hoveredDay!==null&&pts[hoveredDay]&&(()=>{const p=pts[hoveredDay];const d=recentData[hoveredDay];const txLeft=p.x>chartW*0.7;return(<g><rect x={txLeft?p.x-72:p.x+6} y={p.y-26} width={64} height={22} fill="#1A0E08" stroke={ACCENT} strokeWidth="0.5" rx="2"/><text x={txLeft?p.x-40:p.x+38} y={p.y-16} textAnchor="middle" fill={moodColor(d.score)} fontSize="9" fontFamily="monospace" fontWeight="700">{moodLabel(d.score).toUpperCase()}</text><text x={txLeft?p.x-40:p.x+38} y={p.y-7} textAnchor="middle" fill="rgba(242,232,220,0.4)" fontSize="8" fontFamily="monospace">{d.feelings[0]||""}</text></g>)})()}
                  </svg>
                </div>
              </div>
            </div>
            <div style={{...cardStyle()}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.1em"}}>distribution</div>
              {MOODS.slice().reverse().map(m=>{const count=recentData.filter(d=>d.score===m.score).length;const pct=Math.round((count/recentData.length)*100);return(
                <div key={m.score} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <div style={{fontSize:13,width:20}}>{m.emoji}</div>
                  <div style={{fontFamily:"'Lora',serif",fontSize:10,color:`${TEXT}0.4)`,width:44}}>{m.label}</div>
                  <div style={{flex:1,height:4,background:"rgba(255,255,255,0.04)",borderRadius:2,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${moodColor(m.score)}88,${moodColor(m.score)})`,transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)",borderRadius:2}}/></div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,width:26,textAlign:"right"}}>{pct}%</div>
                </div>
              );})}
            </div>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="missions"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Missions" sub="no penalty for skipping · they'll be here" back={()=>nav("home")}/>
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${ACCENT}88`,letterSpacing:"0.15em",marginBottom:2,textTransform:"uppercase"}}>daily quests</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:10,color:`${TEXT}0.2)`,marginBottom:10}}>refresh every day</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {DAILY_MISSIONS.map((m,i)=>{const done=completedMissions.includes(m.id);return(
                  <div key={m.id} style={{...cardStyle(done?"rgba(232,160,64,0.05)":"transparent"),border:`1px solid ${done?"rgba(232,160,64,0.2)":"rgba(242,232,220,0.07)"}`,display:"flex",alignItems:"center",gap:12,opacity:done?0.65:1,animation:`stagger 0.3s ${i*0.07}s both`}}>
                    <div style={{width:38,height:38,background:done?"rgba(232,160,64,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${done?"rgba(232,160,64,0.25)":"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,borderRadius:3}}>{done?"✓":m.icon}</div>
                    <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:done?`${TEXT}0.4)`:`${TEXT}0.9)`,marginBottom:2}}>{m.label}</div><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.3)`}}>{m.desc}</div></div>
                    {done?<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:ACCENT}}>+{m.xp}xp</div>:<button onClick={()=>{setCompletedMissions(p=>[...p,m.id]);gainXP(m.xp);nav(m.action);}} className="btn btn-gold" style={{fontSize:10,padding:"5px 10px"}}>go →</button>}
                  </div>
                );})}
              </div>
            </div>
            <div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:"rgba(155,107,170,0.7)",letterSpacing:"0.15em",marginBottom:2,textTransform:"uppercase"}}>weekly quests</div>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:10,color:`${TEXT}0.2)`,marginBottom:10}}>progress carries over</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {WEEKLY_MISSIONS.map((m,i)=>{const done=completedMissions.includes(m.id)||(m.progress>=m.goal);const prog=done?m.goal:m.progress;return(
                  <div key={m.id} style={{...cardStyle(),border:`1px solid ${done?"rgba(155,107,170,0.2)":"rgba(242,232,220,0.07)"}`,opacity:done?0.55:1,animation:`stagger 0.3s ${i*0.07}s both`}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:done?0:10}}>
                      <div style={{width:38,height:38,background:"rgba(255,255,255,0.03)",border:`1px solid ${done?"rgba(155,107,170,0.25)":"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,borderRadius:3}}>{done?"✓":m.icon}</div>
                      <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:done?`${TEXT}0.4)`:`${TEXT}0.9)`,marginBottom:2}}>{m.label}</div><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.3)`}}>{m.desc}</div></div>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:done?"#9B6BAA":`${TEXT}0.25)`}}>{done?`+${m.xp}xp`:`${prog}/${m.goal}`}</div>
                    </div>
                    {!done&&<XPBar current={prog} max={m.goal} color="#9B6BAA"/>}
                  </div>
                );})}
              </div>
            </div>
            <div style={{...cardStyle(),border:`1px solid ${BORDER}0.04)`,textAlign:"center"}}>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.2)`,lineHeight:2}}>missions expire quietly<br/>no notifications · no guilt<br/>they'll be here when you are</div>
            </div>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="voices"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Choose Your Voice" sub="your companion's personality & sound" back={()=>{nav("home");}}/>
          <div style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...cardStyle(),marginBottom:4}}>
              <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:`${TEXT}0.4)`,lineHeight:1.65}}>Each voice has a different energy. Preview them — pick the one that feels right.</div>
            </div>
            {VOICES.map((v,i)=>{const isSel=selectedVoiceTemp===v.id;const isPrev=previewingVoice===v.id&&speaking;return(
              <div key={v.id} style={{...cardStyle(isSel?`${v.color}08`:"transparent"),border:`1.5px solid ${isSel?v.color+"55":"rgba(242,232,220,0.07)"}`,cursor:"pointer",transition:"all 0.2s",boxShadow:isSel?`0 0 20px ${v.color}12`:"none",animation:`stagger 0.3s ${i*0.05}s both`}} onClick={()=>setSelectedVoiceTemp(v.id)}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                  <div style={{width:42,height:42,background:isSel?`${v.color}12`:"rgba(255,255,255,0.03)",border:`1px solid ${isSel?v.color+"33":"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,borderRadius:3,boxShadow:isSel?`0 0 12px ${v.color}33`:"none",transition:"all 0.3s"}}>{v.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:500,color:isSel?v.color:`${TEXT}0.85)`,transition:"all 0.3s"}}>{v.name}</div>
                      {isSel&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:v.color,border:`1px solid ${v.color}44`,padding:"1px 6px",textTransform:"uppercase",letterSpacing:"0.08em"}}>active</div>}
                    </div>
                    <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.35)`,marginBottom:4}}>{v.personality}</div>
                    <div style={{fontFamily:"'Lora',serif",fontSize:12,color:`${TEXT}0.5)`,lineHeight:1.55}}>{v.desc}</div>
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${isSel?v.color+"18":"rgba(255,255,255,0.04)"}`,padding:"10px 12px",marginBottom:10,borderRadius:3}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:`${TEXT}0.2)`,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>sample</div>
                  <div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:12,color:`${TEXT}0.6)`,lineHeight:1.6}}>"{v.sample}"</div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                  <button onClick={e=>{e.stopPropagation();if(isPrev){stopSpeaking();}else{setPreviewingVoice(v.id);speak(v.sample,v.id);}}} className="btn" style={{fontSize:10,padding:"5px 12px",borderColor:`${v.color}33`,color:v.color,flexShrink:0}}>{isPrev?"■ stop":"► preview"}</button>
                </div>
              </div>
            );})}
            <button onClick={()=>{setSelectedVoice(selectedVoiceTemp);nav("home");gainXP(5);}} className="btn btn-gold" style={{padding:"13px",fontSize:11,marginTop:4}}>
              set {VOICES.find(v=>v.id===selectedVoiceTemp)?.name} as my voice
            </button>
          </div>
        </div>
      )}

      {hasOnboarded&&screen==="sleep"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",background:`linear-gradient(180deg,#08060F 0%,${BG} 100%)`,animation:"screenIn 0.3s ease",minHeight:"100vh"}}>
          <H title="Wind-Down Flow" sub="3 stages to drift off" back={()=>{clearInterval(sleepInterval.current);setSleepActive(false);nav("home");}} accent="#818CF8"/>
          <div style={{padding:"10px 16px",flexShrink:0}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:`${TEXT}0.2)`,letterSpacing:"0.12em",marginBottom:6,textTransform:"uppercase"}}>soundscape</div>
            <div style={{display:"flex",gap:6}}>{SOUNDSCAPES.map(s=><button key={s.id} className={`btn${soundscape===s.id?" btn-gold":""}`} style={{padding:"6px 8px",fontSize:11,flex:1,textAlign:"center"}} onClick={()=>setSoundscape(s.id)}>{s.icon}</button>)}</div>
          </div>
          <div style={{flex:1,padding:"0 16px",display:"flex",flexDirection:"column",gap:8,overflowY:"auto"}}>
            {SLEEP_STEPS.map((step,idx)=>{const isActive=sleepStep===idx&&sleepActive;const isDone=sleepStep>idx;return(
              <div key={step.id} style={{...cardStyle(isActive?"rgba(99,102,241,0.05)":"transparent"),border:`1px solid ${isActive?"rgba(99,102,241,0.2)":isDone?"rgba(123,158,107,0.2)":"rgba(255,255,255,0.05)"}`,cursor:"pointer",transition:"all 0.3s"}} onClick={()=>beginSleepStep(idx)}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:isActive?12:0}}>
                  <div style={{width:36,height:36,background:isActive?"rgba(99,102,241,0.08)":isDone?"rgba(123,158,107,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${isActive?"rgba(99,102,241,0.25)":isDone?"rgba(123,158,107,0.2)":"rgba(255,255,255,0.07)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,borderRadius:3}}>{isDone?"✓":step.icon}</div>
                  <div style={{flex:1}}><div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:isActive?`${TEXT}0.9)`:isDone?"rgba(168,200,152,0.8)":`${TEXT}0.4)`}}>{step.label}</div><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:11,color:`${TEXT}0.25)`,marginTop:2}}>{step.desc}</div></div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.2)`,textTransform:"uppercase"}}>{fmtTime(step.duration)}</div>
                </div>
                {isActive&&idx===0&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,paddingTop:8}}><BreathOrb phase={sleepPhase} color={["#4338CA","#312E81","#1E3A5F"][sleepPhase]} timer={sleepTimer} label={["INHALE","HOLD","EXHALE"][sleepPhase]} active/><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.2)`,textTransform:"uppercase"}}>{sleepBreaths} of 8 breaths</div></div>)}
                {isActive&&idx===1&&(<div style={{paddingTop:8,textAlign:"center"}}><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:14,color:"rgba(199,210,254,0.7)",lineHeight:1.8,marginBottom:8,animation:"stagger 0.5s"}}>{scanMsg}</div><div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>{SCAN_STEPS.map((_,i)=><div key={i} style={{width:4,height:4,background:i<=scanStep?"#6366F1":"rgba(255,255,255,0.07)",borderRadius:1,transition:"background 0.3s"}}/>)}</div></div>)}
                {isActive&&idx===2&&(<div style={{paddingTop:8,textAlign:"center"}}><div style={{fontFamily:"'Lora',serif",fontStyle:"italic",fontSize:13,color:"rgba(129,140,248,0.6)",marginBottom:4}}>let your mind go quiet…</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:`${TEXT}0.2)`,textTransform:"uppercase"}}>{fmtTime(sleepTimer)} · {SOUNDSCAPES.find(s=>s.id===soundscape)?.icon}</div></div>)}
              </div>
            );})}
          </div>
          <div style={{padding:"14px 16px 80px 16px"}}>
            {!sleepActive?<button onClick={()=>beginSleepStep(sleepStep)} className="btn" style={{width:"100%",background:"rgba(99,102,241,0.08)",borderColor:"rgba(99,102,241,0.25)",color:"rgba(199,210,254,0.8)",padding:"14px",fontSize:12}}>begin wind-down</button>:<button onClick={()=>{clearInterval(sleepInterval.current);setSleepActive(false);gainXP(40);}} className="btn" style={{width:"100%",padding:"14px",fontSize:12}}>pause · save progress</button>}
          </div>
        </div>
      )}

      {hasOnboarded&&screen!=="sos"&&screen!=="chat"&&(
        <button onClick={startSOS} style={{position:"fixed",bottom:76,right:16,zIndex:500,width:50,height:50,borderRadius:"50%",background:"linear-gradient(135deg,rgba(196,104,122,0.92),rgba(140,50,70,0.96))",border:"1.5px solid rgba(196,104,122,0.55)",boxShadow:"0 4px 20px rgba(196,104,122,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,cursor:"pointer",animation:"sosPulse 3s ease-in-out infinite",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>🆘</button>
      )}

      {hasOnboarded&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:490,background:`linear-gradient(180deg,${BG}CC 0%,${BG}FF 40%)`,borderTop:`1px solid rgba(242,232,220,0.12)`,backdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"space-around",padding:"10px 0 14px",boxShadow:"0 -8px 32px rgba(0,0,0,0.6)"}}>
          {[
            {icon:"🏠",label:"Home",s:"home"},
            {icon:"✦",label:"FLUX",s:"chat"},
            {icon:"💨",label:"Breathe",s:"library"},
            {icon:"📈",label:"Track",s:"tracker"},
            {icon:"📡",label:"Intel",s:"intel"},
          ].map(b=>{
            const active=screen===b.s;
            return(
              <button key={b.s} onClick={()=>nav(b.s)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"4px 12px",transition:"all 0.2s",flex:1}}>
                <span style={{fontSize:20,filter:active?`drop-shadow(0 0 8px ${ACCENT}CC) drop-shadow(0 0 16px ${ACCENT}66)`:"drop-shadow(0 0 1px rgba(255,255,255,0.2))",transition:"all 0.2s",opacity:active?1:0.55,transform:active?"scale(1.1)":"scale(1)"}}>{b.icon}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:active?ACCENT:"rgba(242,232,220,0.5)",letterSpacing:"0.07em",textTransform:"uppercase",transition:"color 0.2s",fontWeight:active?500:400}}>{b.label}</span>
                {active&&<div style={{width:18,height:2,background:ACCENT,borderRadius:2,boxShadow:`0 0 8px ${ACCENT}, 0 0 16px ${ACCENT}88`,marginTop:1}}/>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
