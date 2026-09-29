import {parseExpected,inferAssignment,inspectPackage,makeZip,makeManifest,exportSafeCsv} from './core.mjs';
const $=id=>document.getElementById(id);
let files=[], expected=[], listErrors=[], inspection=null, demoMode=false, busy=false;
const encode=new TextEncoder();
const statusLabels={draft:'مسودة',final:'نهائي باختيارك','user-confirmed':'اعتماد تؤكده أنت'};
const issueText={
 'expected-count':'حدّد من نسخة واحدة إلى 50 نسخة مطلوبة.','invalid-expected':'بيانات إحدى النسخ المطلوبة غير صالحة.','duplicate-expected':'هناك نسخة مطلوبة مكررة.',
 'file-count':'الحد الأقصى 50 ملفًا مضمنًا.','excluded-file':'ملف مستبعد من الحزمة.','unsafe-input-name':'اسم الملف غير صالح للتجميع. أعد تسميته على جهازك.',
 'invalid-size':'حجم الملف غير صالح.','file-size':'حجم الملف يتجاوز 50 MB.','unmapped-file':'اختر النسخة المطلوبة لهذا الملف أو استبعده.',
 'unsupported-extension':'صيغة الملف غير مدعومة.','extension-mismatch':'صيغة الملف تختلف عن النسخة التي اخترتها. لا تحوّل الأداة الصيغ.',
 'invalid-version':'حدّد إصدارًا صحيحًا من 1 إلى 999.','invalid-status':'اختر حالة صالحة للملف.','draft-file':'هذا الملف مصنّف مسودة؛ راجعه ثم غيّر الحالة إن كان نهائيًا.',
 'unsafe-output-name':'اسم الملف الناتج غير صالح.','output-collision':'سيتكرر اسم الملف داخل الحزمة.','total-size':'حجم المجموعة يتجاوز 100 MB.'
};
const localIssue=i=>issueText[i.code]||i.message;
function notice(text,error=false){$('notice').textContent=text;$('notice').hidden=!text;$('notice').classList.toggle('error',error)}
function keyLabel(key){const item=expected.find(i=>i.key===key);return item?`${item.id} · ${item.language} · ${item.extension}`:key}
function el(tag,props={},children=[]){const n=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else n.setAttribute(k,v)}for(const c of children)n.append(c);return n}
function parseList(remap=false){const result=parseExpected($('expected').value);expected=result.items;listErrors=result.errors;$('expected-errors').replaceChildren(...listErrors.map(e=>el('div',{text:e})));if(remap)files.forEach(f=>{Object.assign(f,inferAssignment(f.name,expected))});render()}
function render(){
 inspection=inspectPackage(expected,files,{project:$('project').value});
 const conflictKeys=new Set(inspection.duplicates.map(d=>d.key));
 const readyCount=inspection.rows.filter(r=>r.included&&r.key&&!r.errors.length&&!conflictKeys.has(r.key)).length;
 $('stat-files').textContent=files.length;$('stat-ready').textContent=`${readyCount} / ${expected.length}`;
 $('stat-issues').textContent=inspection.issues.filter(i=>i.severity!=='info').length+listErrors.length;
 const box=$('file-list');box.replaceChildren();
 if(!files.length)box.append(el('p',{class:'empty',text:'أضف ملفاتك أو جرّب المثال أعلاه.'}));
 files.forEach((file,index)=>{
  const row=inspection.rows.find(r=>r.index===index)||{};const card=el('article',{class:`file-row${file.included?'':' excluded'}`});
  const check=el('input',{type:'checkbox','aria-label':`تضمين ${file.name}`});check.checked=file.included;check.addEventListener('change',()=>{file.included=check.checked;render()});
  card.append(el('div',{class:'file-head'},[el('label',{},[check,el('bdi',{text:file.name})]),el('small',{text:`${(file.size/1024).toFixed(1)} KB`})]));
  const select=el('select',{'aria-label':`مطابقة ${file.name}`});select.append(el('option',{value:'',text:'اختر النسخة المطلوبة'}));expected.forEach(item=>select.append(el('option',{value:item.key,text:keyLabel(item.key)})));select.value=file.key||'';select.disabled=!file.included;select.addEventListener('change',()=>{file.key=select.value;render()});
  const version=el('input',{type:'number',min:'1',max:'999',step:'1','aria-label':`إصدار ${file.name}`});version.value=file.version??'';version.disabled=!file.included;version.addEventListener('change',()=>{file.version=version.value===''?null:Number(version.value);render()});
  const status=el('select',{'aria-label':`حالة ${file.name}`});Object.entries(statusLabels).forEach(([k,v])=>status.append(el('option',{value:k,text:v})));status.value=file.status||'draft';status.disabled=!file.included;status.addEventListener('change',()=>{file.status=status.value;render()});
  card.append(el('div',{class:'fields'},[el('label',{text:'النسخة المطلوبة'},[select]),el('label',{text:'الإصدار'},[version]),el('label',{text:'الحالة التي تؤكدها'},[status])]));
  if(row.outputName&&file.included)card.append(el('div',{class:'output-name',text:row.outputName}));
  for(const issue of inspection.issues.filter(i=>i.fileIndex===index&&i.severity==='error'))card.append(el('div',{class:'row-error',text:localIssue(issue)}));box.append(card);
 });
 const issues=$('review-issues');issues.replaceChildren();let notes=[];
 if(listErrors.length)notes.push('صحّح قائمة النسخ المطلوبة أولًا.');
 if(inspection.missing.length)notes.push(`نسخ لم تُضف: ${inspection.missing.map(keyLabel).join('، ')}`);
 if(inspection.duplicates.length)notes.push('أكثر من ملف للنسخة نفسها. أزل علامة التضمين عن الإصدار القديم.');
 if(inspection.unmapped.length)notes.push('هناك ملفات غير مطابقة؛ اختر النسخة لكل ملف أو استبعده.');
 const generic=[...new Set(inspection.issues.filter(i=>i.severity==='error'&&!['missing','duplicate','unmapped'].some(x=>i.code?.toLowerCase().includes(x))).map(localIssue))];notes.push(...generic);
 const ready=inspection.canExport&&!listErrors.length&&expected.length>0;
 issues.classList.toggle('ready',ready);issues.append(el('h3',{text:ready?'النسخ المحددة موجودة، ولا توجد تعارضات أسماء.':'راجع هذه الملاحظات قبل التنزيل:'}));
 if(notes.length)issues.append(el('ul',{},notes.map(x=>el('li',{text:x}))));
 if(ready)issues.append(el('p',{class:'hint',text:'نجاح الفحص يخص قائمة الملفات وبياناتها فقط، وليس صحة محتوى التصميم أو موافقة العميل.'}));
 $('ready-label').textContent=ready?'حزمة مرتبة، جاهزة للتنزيل':'الحزمة غير مكتملة';$('download').disabled=!ready||busy;
}
async function addFiles(incoming){
 const incomingFiles=Array.from(incoming);if(!incomingFiles.length)return;
 if(demoMode){files=[];demoMode=false;notice('أُزيلت ملفات المثال عند إضافة ملفاتك. راجع قائمة النسخ المطلوبة.');}
 if(files.length+incomingFiles.length>50){notice('الحد 50 ملفًا في الجلسة. أضف مجموعة أصغر.',true);return}
 if(incomingFiles.some(f=>f.size>50*1024*1024)||files.reduce((n,f)=>n+f.size,0)+incomingFiles.reduce((n,f)=>n+f.size,0)>100*1024*1024){notice('تجاوز الحجم المسموح: 50 MB للملف، و100 MB للمجموعة.',true);return}
 for(const file of incomingFiles)files.push({name:file.name,size:file.size,source:file,included:true,...inferAssignment(file.name,expected)});
 render();$('files').value='';
}
function sampleSvg(label,language){const ar=language==='AR';return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#e7ede5"/><rect x="38" y="38" width="524" height="524" rx="26" fill="#185542"/><text x="300" y="260" text-anchor="middle" fill="white" font-family="Arial" font-size="42">${ar?'مثال تجريبي':'Demo artwork'}</text><text x="300" y="330" text-anchor="middle" fill="#d5e6cf" font-family="Arial" font-size="22">${label} · ${language}</text><text x="300" y="500" text-anchor="middle" fill="#d5e6cf" font-family="Arial" font-size="16">Synthetic sample — not client work</text></svg>`}
function loadDemo(complete){
 $('project').value='spring-campaign';$('expected').value='asset,language,format\nsocial-square,AR,svg\nsocial-square,EN,svg\nstory,AR,svg\nstory,EN,svg';parseList();
 const names=complete?['social-square_AR_v2_final.svg','social-square_EN_v2_final.svg','story_AR_v1_final.svg','story_EN_v1_final.svg']:['social-square_AR_v1_final.svg','social-square_AR_v2_final.svg','social-square_EN_v2_draft.svg'];
 files=names.map(name=>{const info=inferAssignment(name,expected),bytes=encode.encode(sampleSvg(name.includes('story')?'story':'social-square',name.includes('_AR_')?'AR':'EN'));return {name,size:bytes.length,source:new Blob([bytes],{type:'image/svg+xml'}),included:true,...info}});demoMode=true;render();notice(complete?'مثال اصطناعي مكتمل. يمكنك تنزيل الحزمة وفحص سجلها.':'هذا مثال اصطناعي: نسختان متعارضتان، مسودة، وملفا قصة ناقصان. الملفات ليست أعمال عميل.');
}
function downloadBytes(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function download(){
 render();if($('download').disabled)return;const button=$('download');busy=true;button.disabled=true;button.textContent='تجهيز الحزمة…';
 const captured=inspection, expectedSnapshot=expected.map(x=>({...x})), projectSnapshot=$('project').value, demoSnapshot=demoMode;
 try{const entries=[];for(const row of captured.rows){if(row.included)entries.push({name:row.outputName,bytes:new Uint8Array(await row.source.arrayBuffer())})}
 const manifest=makeManifest(expectedSnapshot,captured,{project:projectSnapshot,createdAt:new Date().toISOString()});manifest.syntheticDemo=demoSnapshot;
 entries.push({name:'manifest.json',bytes:encode.encode(JSON.stringify(manifest,null,2))});
 const mappings=captured.rows.filter(r=>r.included);
 entries.push({name:'file-map.csv',bytes:encode.encode(exportSafeCsv(mappings))});
 entries.push({name:'README.txt',bytes:encode.encode('Handoff Check / تسليم مرتب\n\nThis package contains copies of the selected files and a mapping manifest. Original file bytes are preserved.\nLanguage, version and status are user-declared metadata. Filename inference is a suggestion, not client approval.\nThis tool does not inspect artwork contents, linked assets, fonts, translation, dimensions, colour profiles or print readiness.\nCheck manifest.json and file-map.csv before sharing. No files were sent automatically.\n'+(demoSnapshot?'\nSYNTHETIC DEMO: sample artwork is not client work.\n':''))});
 const zip=await makeZip(entries);downloadBytes(zip,'handoff-package.zip','application/zip');notice('تم تجهيز التنزيل. افتح ZIP وراجع الملفات والسجل قبل إرسالها. لا ترسل هذه الأداة شيئًا إلى العميل.');
 }catch(error){notice(`تعذر تجهيز الحزمة: ${error.message}`,true)}finally{busy=false;button.textContent='تحميل حزمة التسليم ↓';render()}
}
$('apply-list').addEventListener('click',()=>{parseList(true);notice('حُدّثت القائمة واقتراحات المطابقة. راجع اختيارات الإصدار والحالة من جديد.')});
$('expected').addEventListener('input',()=>{parseList(false)});$('project').addEventListener('input',render);
$('files').addEventListener('change',e=>addFiles(e.target.files));$('clear-files').addEventListener('click',()=>{files=[];demoMode=false;$('files').value='';notice('أُزيلت الملفات من هذه الجلسة. لم تتغير ملفات جهازك.');render()});
$('demo').addEventListener('click',()=>loadDemo(false));$('complete-demo').addEventListener('click',()=>loadDemo(true));$('download').addEventListener('click',download);
const drop=$('dropzone');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');addFiles(e.dataTransfer.files)});
parseList();
