'use strict';
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {reported:'What you shared',observation:'From your answers',hypothesis:'A possibility to explore',unknown:'Still open',recommendation:'A suggestion to try'};
async function loadManual(){
 try {
  const response=await fetch('report-data.json');if(!response.ok)throw new Error('Report unavailable');const data=await response.json();
  const answers=new Map(data.persona.answers.map(answer=>[answer.id,answer]));
  const evidence=ids=>ids.length?`<details class="evidence"><summary>What this is based on <span aria-hidden="true">· ${ids.join(', ')}</span></summary>${ids.map(id=>{const a=answers.get(id);return `<div class="quote"><span>${esc(id)} / ${esc(a.question)}</span><blockquote>“${esc(a.text)}”</blockquote></div>`;}).join('')}</details>`:'';
  document.querySelector('#chapter-nav').innerHTML=data.sections.map(s=>`<a href="#${s.id}"><span>${s.id}</span><span>${esc(s.title)}</span></a>`).join('');
  document.querySelector('#report').innerHTML=data.sections.map(s=>{
   let body=`<p>${esc(s.body)}</p>`;
   if(s.id==='B')body+=s.items.map((item,i)=>`<div class="observation"><span class="obs-index">${i+1}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div></div>`).join('');
   else if(s.id==='H')body+=`<div class="timeline">${s.plan.map(p=>`<article><span>${esc(p.label)}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('')}</div>`;
   else if(s.bullets)body+=`<ul>${s.bullets.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`;
   if(s.id==='J')body=`<div class="invitation">${body}<button type="button" id="booking-preview" aria-expanded="false" aria-controls="booking-note">${esc(s.cta.label)}</button><p id="booking-note" class="booking-note" hidden>${esc(s.cta.demoMessage)} In the finished experience, this would lead to the agreed booking service, with the user’s permission.</p><p><a href="manual.pdf" download>Keep the full fictional manual as a PDF</a></p></div>`;
   return `<section id="${s.id}" class="report-section" aria-labelledby="title-${s.id}"><div class="section-heading"><span class="letter" aria-hidden="true">${s.id}</span><h2 id="title-${s.id}">${esc(s.title)}</h2></div><span class="kind ${s.kind}">${labels[s.kind]}</span>${body}${evidence(s.evidence)}</section>`;
  }).join('');
  document.querySelector('#answer-list').innerHTML=data.persona.answers.map(a=>`<details><summary><span>${esc(a.id)}</span>${esc(a.question)}</summary><blockquote>“${esc(a.text)}”</blockquote></details>`).join('');
  document.querySelector('#booking-preview').addEventListener('click',e=>{const note=document.querySelector('#booking-note');note.hidden=!note.hidden;e.currentTarget.setAttribute('aria-expanded',String(!note.hidden));});
  if(location.hash){const target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView();}
 } catch(error){document.querySelector('#report').innerHTML='<p role="alert">The example could not load. Please reload, or <a href="manual.pdf">read the PDF manual</a>.</p>';}
}
loadManual();
