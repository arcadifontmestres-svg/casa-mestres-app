(()=>{
'use strict';
const $=id=>document.getElementById(id);
const chat=$('chat'),route=$('route'),input=$('message'),speechNote=$('speechNote');
let listening=false,recognition=null,callActive=false;
let flow={stage:'idle',centre:''};
const centres=['Sarriera','Sarriera 1930','La Granada','L’Arboç','Arboç','Sitges','Piscina La Granada','Can Cartró','Hospitalet'];

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function addMsg(who,text){const d=document.createElement('div');d.className='msg '+who;d.innerHTML=`<span class="label">${who==='ai'?'RECEPCIÓ IA':'CLIENT'}</span>${escapeHtml(text)}`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function renderRoute(steps,alert=''){route.className='route';route.innerHTML=steps.map((s,i)=>`<div class="step"><div class="n">${i+1}</div><div><b>${escapeHtml(s[0])}</b><span>${escapeHtml(s[1])}</span></div></div>`).join('')+(alert?`<div class="alert">⚠ ${escapeHtml(alert)}</div>`:'')}
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function detectCentre(t){const n=normalize(t);return centres.find(c=>n.includes(normalize(c)))||''}
function paxOf(t){const m=t.match(/(?:per|som|de)\s+(\d{1,3})\s*(?:persones|pax)?/i)||t.match(/(\d{1,3})\s*(?:persones|pax)/i);return m?Number(m[1]):0}
function isDirection(t){return /direcci[oó]|joan ramon|ger[eè]ncia/i.test(t)}
function isCommercial(t){return /comercial|grup|esdeveniment|empresa/i.test(t)}
function isReservation(t){return /reserva|reservar|taula|sopar|dinar/i.test(t)}
function isTalk(t){return /parlar|passa|deriva|telefon|trucar/i.test(t)}

function startRecognition(){if(!recognition||listening)return;try{recognition.start()}catch{}}
function say(text,listenAfter=false){if(!('speechSynthesis' in window)){if(listenAfter&&callActive)setTimeout(startRecognition,200);return}
  window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ca-ES';const voices=window.speechSynthesis.getVoices();u.voice=voices.find(v=>/^ca/i.test(v.lang))||voices.find(v=>/^es/i.test(v.lang))||voices[0]||null;u.rate=.96;u.onend=()=>{if(listenAfter&&callActive)setTimeout(startRecognition,250)};window.speechSynthesis.speak(u)}
function answer(text,listenAfter=false){addMsg('ai',text);say(text,listenAfter)}

function finishReservation(centre,text){const pax=paxOf(text);
  if(pax>10){const r=`Entesos. Per ${pax} persones ho gestionarà l’equip de Grups. Deixo la petició per ${centre} com a pendent de confirmar.`;answer(r,false);renderRoute([['Recepció IA',`Detecta grup de ${pax} persones.`],['Comercial / Grups','Crea oportunitat pendent; no la dona per confirmada.'],['Agenda Centre','Mostra la capacitat potencial i una alerta al responsable.']],`PER CONFIRMAR · Grup ${pax} pax · ${centre}`);flow={stage:'idle',centre:''};return}
  if(!pax){flow.stage='need_pax';answer(`D’acord, ${centre}. Quantes persones sereu?`,true);renderRoute([['Recepció IA',`Reserva per ${centre}.`],['ARCADI Reserves','Falta el nombre de persones abans de consultar disponibilitat.']]);return}
  const r=`Perfecte. He recollit la petició per ${pax} persones a ${centre}. ARCADI Reserves comprovaria disponibilitat i, si és correcta, la reserva entraria immediatament a l’Agenda Centre.`;
  answer(r,false);renderRoute([['Recepció IA',`Reserva de ${pax} pax a ${centre}.`],['ARCADI Reserves','Consulta disponibilitat i aplica les regles del centre.'],['Agenda Centre','La reserva confirmada entra a ocupació real.']]);flow={stage:'idle',centre:''};
}

function reply(raw){const t=raw.trim();if(!t)return;addMsg('user',t);input.value='';const centre=detectCentre(t),pax=paxOf(t);

  if(flow.stage==='need_centre'){
    if(!centre){answer('No he identificat el restaurant. Em pots repetir el nom del centre?',true);return}
    flow.centre=centre;flow.stage='need_details';answer(`Perfecte, ${centre}. Digues-me el dia, l’hora i quantes persones sereu.`,true);renderRoute([['Recepció IA',`Reserva per ${centre}.`],['ARCADI Reserves','Recull data, hora i persones abans de consultar disponibilitat.']]);return;
  }
  if(flow.stage==='need_details'){
    finishReservation(flow.centre,t);return;
  }
  if(flow.stage==='need_pax'){
    const p=pax||Number((t.match(/\d{1,3}/)||[])[0]||0);if(!p){answer('No he captat el nombre de persones. Me’l pots repetir?',true);return}
    finishReservation(flow.centre,`per ${p} persones`);return;
  }

  if(isDirection(t)){
    const r='Perfecte. Aquesta trucada correspon a Direcció del Grup Tràfec. En producció, la centraleta la derivaria directament i, si no hi hagués resposta, ARCADI deixaria un avís de retorn.';
    answer(r,false);renderRoute([['Recepció corporativa','Identifica una petició de Direcció.'],['Centraleta','Transfereix la trucada a Direcció.'],['ARCADI','Si no respon, crea un avís de retorn de trucada.']]);return;
  }

  if(isCommercial(t)||pax>10){
    const c=centre||'el centre escollit';const p=pax||'més de 10';
    const r=`Entesos. Ho gestionarà l’equip de Grups i Comercial. La petició queda pendent de confirmació per ${c}.`;
    answer(r,false);renderRoute([['Recepció IA',`Detecta petició de grup (${p} pax).`],['Comercial / Grups','Crea oportunitat pendent; no la dona per confirmada.'],['Agenda Centre','Genera alerta de previsió al centre.']],`PER CONFIRMAR · Grup ${p} pax${centre?' · '+centre:''}`);return;
  }

  if(isTalk(t)&&centre){
    const r=`Cap problema. En producció, ara et derivaria directament amb ${centre}.`;
    answer(r,false);renderRoute([['Recepció corporativa','Identifica el centre demanat.'],['Centraleta',`Transfereix la trucada a ${centre}.`],['ARCADI','Registra l’origen i el resultat de la derivació.']]);return;
  }

  if(isReservation(t)){
    if(!centre){flow={stage:'need_centre',centre:''};answer('Perfecte. A quin restaurant del Grup Tràfec vols fer la reserva?',true);renderRoute([['Recepció IA','Entén que és una reserva.'],['ARCADI Reserves','Falta identificar el centre.']]);return}
    flow={stage:'need_details',centre};
    if(pax){finishReservation(centre,t);return}
    answer(`Perfecte, ${centre}. Digues-me el dia, l’hora i quantes persones sereu.`,true);renderRoute([['Recepció IA',`Reserva per ${centre}.`],['ARCADI Reserves','Recull les dades abans de consultar disponibilitat.']]);return;
  }

  if(centre){
    flow={stage:'idle',centre};const r=`Has demanat ${centre}. Vols fer una reserva o parlar directament amb el centre?`;answer(r,true);renderRoute([['Recepció IA',`Identifica ${centre}.`],['Centraleta / Reserves','Espera saber si és reserva o derivació.']]);return;
  }

  answer('T’he entès. Pots dir-me si vols fer una reserva, parlar amb un restaurant, amb Comercial o amb Direcció.',true);
  renderRoute([['Recepció IA','Classifica la intenció del client.'],['ARCADI','Aplica el circuit corresponent segons criteris del Grup.']]);
}

function reset(){callActive=false;flow={stage:'idle',centre:''};if(recognition&&listening)try{recognition.stop()}catch{};chat.innerHTML='';route.className='route empty';route.textContent='Encara no hi ha cap petició.';const hi='Bon dia, Grup Tràfec. Sóc l’assistent virtual de recepció. En què et puc ajudar?';addMsg('ai',hi);speechNote.textContent=''}
function startDemoCall(){reset();callActive=true;$('speakIntro').textContent='● Trucada demo activa';speechNote.textContent='Quan acabi la salutació, parla amb normalitat.';const hi='Bon dia, Grup Tràfec. Sóc l’assistent virtual de recepció. En què et puc ajudar?';say(hi,true)}
function initSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){speechNote.textContent='Aquest navegador no permet reconeixement de veu. La demo escrita continua disponible.';return}
  recognition=new SR();recognition.lang='ca-ES';recognition.interimResults=false;recognition.continuous=false;
  recognition.onstart=()=>{listening=true;$('micBtn').textContent='⏹️';speechNote.textContent='Escoltant...'};
  recognition.onend=()=>{listening=false;$('micBtn').textContent='🎙️';if(speechNote.textContent==='Escoltant...')speechNote.textContent=callActive?'Parla quan la recepció acabi de respondre.':''};
  recognition.onerror=()=>{speechNote.textContent='No he pogut captar la veu. Pots tornar a prémer el micròfon o escriure.'};
  recognition.onresult=e=>{const t=e.results?.[0]?.[0]?.transcript||'';input.value=t;reply(t)};
}
$('sendBtn').onclick=()=>reply(input.value);input.addEventListener('keydown',e=>{if(e.key==='Enter')reply(input.value)});$('resetBtn').onclick=()=>{reset();$('speakIntro').textContent='▶ Iniciar trucada demo'};$('speakIntro').onclick=startDemoCall;$('micBtn').onclick=()=>{if(!recognition)return initSpeech();callActive=true;if(listening)recognition.stop();else recognition.start()};document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>reply(b.dataset.demo));
initSpeech();reset();
})();
