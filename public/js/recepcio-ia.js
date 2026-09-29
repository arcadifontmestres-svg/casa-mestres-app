(()=>{
'use strict';
const $=id=>document.getElementById(id);
const chat=$('chat'),route=$('route'),input=$('message'),speechNote=$('speechNote');
let listening=false,recognition=null;
const centres=['Sarriera','Sarriera 1930','La Granada','L’Arboç','Arboç','Sitges','Piscina La Granada','Can Cartró','Hospitalet'];

function addMsg(who,text){const d=document.createElement('div');d.className='msg '+who;d.innerHTML=`<span class="label">${who==='ai'?'RECEPCIÓ IA':'CLIENT'}</span>${escapeHtml(text)}`;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function say(text){if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ca-ES';const voices=window.speechSynthesis.getVoices();u.voice=voices.find(v=>/^ca/i.test(v.lang))||voices.find(v=>/^es/i.test(v.lang))||voices[0]||null;u.rate=.98;window.speechSynthesis.speak(u)}
function renderRoute(steps,alert=''){route.className='route';route.innerHTML=steps.map((s,i)=>`<div class="step"><div class="n">${i+1}</div><div><b>${escapeHtml(s[0])}</b><span>${escapeHtml(s[1])}</span></div></div>`).join('')+(alert?`<div class="alert">⚠ ${escapeHtml(alert)}</div>`:'')}
function detectCentre(t){const n=t.toLowerCase();return centres.find(c=>n.includes(c.toLowerCase()))||''}
function paxOf(t){const m=t.match(/(?:per|som|de)\s+(\d{1,3})\s*(?:persones|pax)?/i)||t.match(/(\d{1,3})\s*(?:persones|pax)/i);return m?Number(m[1]):0}
function reply(raw){const t=raw.trim();if(!t)return;addMsg('user',t);input.value='';const low=t.toLowerCase(),centre=detectCentre(t),pax=paxOf(t);

  if(/direcci[oó]|joan ramon|ger[eè]ncia/.test(low)){
    const r='Perfecte. Et derivaria ara amb Direcció del Grup Tràfec. Si no hi hagués resposta, deixaria l’avís amb el teu nom i telèfon.';
    addMsg('ai',r);say(r);renderRoute([['Recepció corporativa','Identifica una petició de Direcció.'],['Centraleta','Transfereix la trucada a Direcció.'],['ARCADI','Si no respon, crea un avís de retorn de trucada.']]);return;
  }

  if(/parlar|passa|deriva|centre|restaurant/.test(low)&&centre){
    const r=`Cap problema. Et derivaria ara amb ${centre}.`;
    addMsg('ai',r);say(r);renderRoute([['Recepció corporativa','Identifica el centre demanat.'],['Centraleta',`Transfereix la trucada a ${centre}.`],['ARCADI','Registra l’origen i resultat de la derivació.']]);return;
  }

  if((/grup|persones|pax|reserva|reservar/.test(low)&&pax>10)){
    const c=centre||'el centre escollit';
    const r=`Entesos. Per ${pax} persones ho gestionarà l’equip de Grups. Prendria les dades i deixaria la petició pendent de confirmació per ${c}.`;
    addMsg('ai',r);say(r);renderRoute([['Recepció IA',`Detecta grup de ${pax} persones.`],['Comercial / Grups','Crea oportunitat pendent; no la dona per confirmada.'],['Agenda Centre','Mostra la capacitat potencial i l’alerta al responsable.']],`PER CONFIRMAR · Grup ${pax} pax${centre?' · '+centre:''}`);return;
  }

  if(/reserva|reservar|taula|persones|pax/.test(low)){
    const c=centre||'centre pendent d’indicar';
    if(!centre){const r='Perfecte. A quin restaurant del Grup Tràfec vols fer la reserva?';addMsg('ai',r);say(r);renderRoute([['Recepció IA','Entén que és una reserva.'],['ARCADI Reserves','Falta identificar el centre abans de consultar disponibilitat.']]);return}
    if(!pax){const r=`Perfecte, a ${centre}. Per quantes persones?`;addMsg('ai',r);say(r);renderRoute([['Recepció IA',`Reserva per ${centre}.`],['ARCADI Reserves','Demana les dades que falten abans de consultar disponibilitat.']]);return}
    const r=`Perfecte. Consultaria ara ARCADI Reserves per ${pax} persones a ${centre}. Si hi ha disponibilitat, confirmaria la reserva i quedaria immediatament a l’Agenda Centre.`;
    addMsg('ai',r);say(r);renderRoute([['Recepció IA',`Reserva de ${pax} pax a ${centre}.`],['ARCADI Reserves','Consulta disponibilitat i aplica les regles del centre.'],['Agenda Centre','La reserva confirmada entra a ocupació real.']]);return;
  }

  const r='T’he entès. En producció, classificaria aquesta petició i la passaria al circuit correcte: Reserves, Grups, Direcció o centre.';
  addMsg('ai',r);say(r);renderRoute([['Recepció IA','Classifica la intenció del client.'],['ARCADI','Aplica el circuit corresponent segons criteris del Grup.']]);
}
function reset(){chat.innerHTML='';route.className='route empty';route.textContent='Encara no hi ha cap petició.';const hi='Bon dia, Grup Tràfec. Sóc l’assistent virtual de recepció. En què et puc ajudar?';addMsg('ai',hi)}
function initSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){speechNote.textContent='El reconeixement de veu no està disponible en aquest navegador; pots fer la demo escrivint.';return}
  recognition=new SR();recognition.lang='ca-ES';recognition.interimResults=false;recognition.continuous=false;
  recognition.onstart=()=>{listening=true;$('micBtn').textContent='⏹️';speechNote.textContent='Escoltant...'};
  recognition.onend=()=>{listening=false;$('micBtn').textContent='🎙️';if(speechNote.textContent==='Escoltant...')speechNote.textContent=''};
  recognition.onerror=()=>{speechNote.textContent='No he pogut captar la veu. Pots escriure la frase.'};
  recognition.onresult=e=>{const t=e.results?.[0]?.[0]?.transcript||'';input.value=t;reply(t)};
}
$('sendBtn').onclick=()=>reply(input.value);input.addEventListener('keydown',e=>{if(e.key==='Enter')reply(input.value)});$('resetBtn').onclick=reset;$('speakIntro').onclick=()=>say('Bon dia, Grup Tràfec. Sóc l’assistent virtual de recepció. En què et puc ajudar?');$('micBtn').onclick=()=>{if(!recognition)return initSpeech();if(listening)recognition.stop();else recognition.start()};document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>reply(b.dataset.demo));
initSpeech();reset();
})();
