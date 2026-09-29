(function(root){'use strict';
const services={creative:'Creative & content',web:'Web & conversion',automation:'Automation & reporting'};
function clean(value,max){return String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);}
function makeBrief(input){const service=Object.hasOwn(services,input.service)?input.service:'automation';const problem=clean(input.problem,1200);if(problem.length<15)throw new Error('Please describe the result you need in at least 15 characters.');const lines=['Hello Hazim,','',`Service: ${services[service]}`,`What I need: ${problem}`,`Budget: ${clean(input.budget,80)||'To discuss'}`,`Deadline: ${clean(input.deadline,80)||'Flexible'}`,`Public link / format: ${clean(input.source,300)||'To discuss'}`,'','Please check fit and confirm scope before we start.'];return{service,subject:`Project brief — ${services[service]}`,body:lines.join('\n')};}
function mailto(brief){return'mailto:hamammalsalmy9@gmail.com?subject='+encodeURIComponent(brief.subject)+'&body='+encodeURIComponent(brief.body);}
const events=new Set(['work_open','service_choose','brief_preview','email_open','brief_download']);
function cleanCounts(counts){const next={};if(!counts||typeof counts!=='object'||Array.isArray(counts))return next;for(const k of events){const v=counts[k];if(Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER)next[k]=v;}return next;}
function addEvent(counts,name){if(!events.has(name))throw new Error('Unsupported event');const next=cleanCounts(counts);next[name]=(next[name]||0)+1;return next;}
const api={makeBrief,mailto,addEvent,cleanCounts};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioCore=api;
})(typeof window==='undefined'?{}:window);
