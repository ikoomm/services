/* UI only. All input is untrusted and rendered through textContent. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const core = window.ExportReconcile;
  const state = {master:null,incoming:null,result:null,tab:'changes',generation:{master:0,incoming:0},bytes:{master:0,incoming:0}};
  const maxBytes = 5 * 1024 * 1024;
  const maxRows = 50000;
  function status(message, error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
  function invalidate() { state.result=null; $('results').hidden=true; }
  function resetOptions(select, headers) { select.replaceChildren(); for (const h of ['', ...headers]) {const o=document.createElement('option');o.value=h;o.textContent=h||'Select a column';select.append(o);} select.disabled=!headers.length; }
  function prepare() {
    invalidate();
    const a=state.master,b=state.incoming;
    const ready=a&&b;
    const headers=ready?a.headers:[];
    resetOptions($('key-column'),headers);resetOptions($('date-column'),headers);
    $('compare').disabled=true;
    if(!ready) return;
    if (a.rows.length+b.rows.length>maxRows) {status('This demo supports at most 50,000 data rows across both files. Choose smaller exports.',true);return;}
    const matches=a.headers.length===b.headers.length&&a.headers.every(h=>b.headers.includes(h));
    if(!matches) {status('The files have different columns. Use matching headers in both files, then choose the files again.',true);return;}
    for(const [id,names] of [['key-column',['id','record_id','customer_id','asset_id']],['date-column',['updated_at','updated','date','timestamp']]]) {
      const found=headers.find(h=>names.includes(h.toLowerCase())); if(found) $(id).value=found;
    }
    updateReady();
    status('Files ready. Confirm the record ID and updated-date columns before previewing.');
  }
  function updateReady() {
    invalidate();const a=state.master,b=state.incoming,k=$('key-column').value,d=$('date-column').value;
    $('compare').disabled=!(a&&b&&k&&d&&k!==d&&a.rows.length+b.rows.length<=maxRows&&a.headers.length===b.headers.length&&a.headers.every(h=>b.headers.includes(h)));
    if(k&&k===d)status('Use different columns for the record ID and updated date.',true);
  }
  async function readFile(which,file) {
    const generation=++state.generation[which];
    state[which]=null;state.bytes[which]=0;invalidate();prepare();
    $(which+'-name').textContent=file?file.name:'Choose a CSV file';
    $(which+'-meta').textContent='';
    if(!file)return;
    const other=which==='master'?'incoming':'master';
    if(file.size+state.bytes[other]>maxBytes){status('Files exceed the 5 MB combined limit. Choose smaller exports.',true);return;}
    state.bytes[which]=file.size;
    status('Reading CSV…');
    try {
      const buffer=await file.arrayBuffer();
      if(generation!==state.generation[which])return;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
      const parsed=core.parseCSV(text);
      if(parsed.rows.length>maxRows)throw new Error('This file exceeds the 50,000-row limit.');
      state[which]=parsed;state.bytes[which]=file.size;
      $(which+'-meta').textContent=parsed.rows.length.toLocaleString()+' records · '+parsed.headers.length+' columns';
      prepare();
    }catch(error){if(generation!==state.generation[which])return;state.bytes[which]=0;status('Could not read '+file.name+': '+error.message,true);}
  }
  function sample() {
    state.generation.master++;state.generation.incoming++;
    $('master-file').value='';$('incoming-file').value='';
    const master='asset_id,updated_at,status,site,notes\nPUMP-01,2026-09-01,Needs service,North,Inspect seal\nPUMP-02,2026-09-04,OK,East,Routine check\nPUMP-03,2026-09-05,OK,West,Pressure normal\nPUMP-04,2026-09-01,OK,South,Master-only record\n';
    const incoming='asset_id,updated_at,status,site,notes\nPUMP-01,2026-09-14,OK,North,Seal replaced\nPUMP-02,2026-09-02,Needs service,East,Older export\nPUMP-03,2026-09-05,Needs service,West,Same date conflicting values\nPUMP-05,2026-09-14,OK,Central,New asset\nPUMP-06,not-a-date,OK,Central,Date needs review\n';
    state.master=core.parseCSV(master);state.incoming=core.parseCSV(incoming);state.bytes={master:master.length,incoming:incoming.length};
    $('master-name').textContent='sample-master.csv';$('incoming-name').textContent='sample-export.csv';
    $('master-meta').textContent='4 records · 5 columns · synthetic';$('incoming-meta').textContent='5 records · 5 columns · synthetic';
    prepare();status('Synthetic sample loaded: one update, one addition, one conflict and one invalid date. Click Preview changes.');
  }
  function el(tag,text) {const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;}
  function table(headers,rows) {
    const box=$('table-container');box.replaceChildren();
    if(!rows.length){const e=el('p','No rows to show.');e.className='empty';box.append(e);return;}
    const t=el('table'),head=el('thead'),tr=el('tr');for(const h of headers){const th=el('th',h);th.scope='col';tr.append(th);}head.append(tr);t.append(head);
    const body=el('tbody');for(const row of rows.slice(0,100)){const tr=el('tr');for(const value of row){const cell=el('td');cell.append(el('pre',value??''));tr.append(cell);}body.append(tr);}t.append(body);box.append(t);
  }
  function renderTable() {
    const r=state.result;if(!r)return;
    for(const name of ['changes','issues','output']){$(name+'-tab').classList.toggle('selected',state.tab===name);$(name+'-tab').setAttribute('aria-pressed',String(state.tab===name));}
    if(state.tab==='changes') {
      $('table-summary').textContent=r.changes.length+' applied changes. All other master records are retained. First 100 shown.';
      table(['Action','Record ID','Changed columns','Before','After'],r.changes.map(c=>[c.type,c.key,c.changedColumns.join(', '),c.before?c.changedColumns.map(h=>h+': '+c.before[h]).join('\n'):'New record',c.changedColumns.map(h=>h+': '+c.after[h]).join('\n')]));
    }else if(state.tab==='issues'){
      $('table-summary').textContent=r.issues.length+' log entries. Review these before using the result. First 100 shown.';
      table(['Type','Source / record','Record ID','Details'],r.issues.map(i=>[i.code,i.source+(i.row?' / '+i.row:''),i.key,i.message]));
    }else{
      $('table-summary').textContent=r.rows.length+' records in the updated master. Original order retained; new IDs appended. First 100 shown.';
      table(r.headers,r.rows.map(row=>r.headers.map(h=>row[h])));
    }
  }
  function compare() {
    try{
      state.result=core.reconcile(state.master,state.incoming,{key:$('key-column').value,date:$('date-column').value});
      const r=state.result,s=r.stats;$('stats').replaceChildren();
      for(const [number,label,warn] of [[s.updated,'Updated records',false],[s.added,'New records',false],[s.unchanged,'Master records retained',false],[s.conflictKeys,'Conflicting IDs',true]]){const card=el('div');card.className='stat'+(warn&&number?' warn':'');card.append(el('strong',number),el('span',label));$('stats').append(card);}
      $('notice').hidden=!r.issues.length;
      $('notice').textContent=r.issues.length+' log entries need a look. Conflicted IDs keep the master row, or are not added when no master row exists. Invalid incoming rows are skipped. Download the issue log for details.';
      state.tab='changes';renderTable();$('results').hidden=false;
      status('Comparison complete. Review changes and issues before downloading. Your original files have not changed.');
      $('results').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    }catch(error){invalidate();status(error.message,true);}
  }
  function download(name,headers,rows){
    try {
      const text=core.exportCSV(headers,rows),blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status('Download prepared: '+name+'. Formula-like cells are escaped for spreadsheet safety.');
    } catch(error) { status('Could not prepare download: '+error.message,true); }
  }
  for(const which of ['master','incoming'])$(which+'-file').addEventListener('change',event=>readFile(which,event.target.files[0]));
  for(const id of ['key-column','date-column'])$(id).addEventListener('change',updateReady);
  $('sample').addEventListener('click',sample);$('compare').addEventListener('click',compare);
  for(const name of ['changes','issues','output'])$(name+'-tab').addEventListener('click',()=>{state.tab=name;renderTable();});
  $('clear').addEventListener('click',()=>{state.generation.master++;state.generation.incoming++;state.master=null;state.incoming=null;state.bytes={master:0,incoming:0};for(const which of ['master','incoming']){$(which+'-file').value='';$(which+'-name').textContent='Choose a CSV file';$(which+'-meta').textContent='';}prepare();status('Files cleared from this tab. Choose two files or try the sample.');$('sample').focus();});
  $('download-master').addEventListener('click',()=>{if(state.result)download('updated-master.csv',state.result.headers,state.result.rows);});
  $('download-changes').addEventListener('click',()=>{if(state.result)download('change-log.csv',['action','record_id','changed_columns','before_json','after_json'],state.result.changes.map(c=>({action:c.type,record_id:c.key,changed_columns:c.changedColumns.join(', '),before_json:c.before?JSON.stringify(c.before):'',after_json:JSON.stringify(c.after)})));});
  $('download-issues').addEventListener('click',()=>{if(state.result)download('issue-log.csv',['code','source','record','record_id','message','details_json'],state.result.issues.map(i=>({code:i.code,source:i.source,record:String(i.row??''),record_id:i.key??'',message:i.message,details_json:i.details?JSON.stringify(i.details):''})));});
})();
