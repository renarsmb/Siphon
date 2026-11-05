(() => {
 'use strict';
 const $=id=>document.getElementById(id),T=window.DaylineTimeline;
 const uid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('');};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const shift=(key,n)=>T.dateKey(T.dayNumber(key)+n),parse=k=>new Date(k+'T12:00:00');
 const clock=t=>String(t||'00:00').slice(0,5),color=p=>/^#[a-f0-9]{6}$/i.test(p.color||'')?p.color:'#d3656b';
 const roles={admin:'Administrators',member:'Piederīgais',guest:'Viesis'},statuses={pending:'Gaida lēmumu',accepted:'Apstiprināta',declined:'Noraidīta'};
 const config=window.DAYLINE_CONFIG||{};
 let client=null,user=null,plans=[],organizations=[],members=[],profiles=[],assignments=[],bulletins=[],editors=[],workspace='',view='timeline',selected=localToday();
 let activeId=null,editBase=null,draft=null,moveCandidate=null,proposal=null,chatId=null,chatMessages=[],pendingFiles=[],busy=false,dragging=false,migrated=false,generation=0,toastTimer,editTimer,presencePlan=null,presenceDraft=null;
 const sessionId=uid(),storageKey='dayline-plans-v1';
 try{if(config.supabaseUrl&&(config.supabasePublishableKey||config.supabaseAnonKey)&&window.supabase)client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey||config.supabaseAnonKey);}catch(e){console.error(e);}
 const say=s=>{const el=$('toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);};
 function failure(e){return /PGRST20[245]|42P01|42703/.test(e?.code||'')?'Jāatjaunina datubāze: palaid collaboration.sql Supabase SQL Editorā.':e?.message||'Darbība neizdevās. Mēģini vēlreiz.';}
 const api=async q=>{const {data,error}=await q;if(error)throw error;return data;};
 const rpc=(name,args)=>api(client.rpc(name,args));
 const monday=()=>shift(selected,-((parse(selected).getDay()+6)%7));
 const visiblePlans=()=>plans.filter(p=>(p.organization_id||'')===workspace);
 const role=()=>members.find(m=>m.organization_id===workspace&&m.user_id===user?.id)?.role;
 const canEdit=p=>!user?!p.organization_id:!p.organization_id?p.user_id===user.id:members.some(m=>m.organization_id===p.organization_id&&m.user_id===user.id&&(m.role==='admin'||m.role==='member'&&p.user_id===user.id));
 const canCreate=()=>!workspace||['admin','member'].includes(role());
 const profile=id=>profiles.find(p=>p.id===id)||{id,display_name:user&&id===user.id?(user.user_metadata?.full_name||user.email?.split('@')[0]||'Es'):(id?'Dalībnieks':'Es'),avatar_url:''};
 const avatar=p=>`<span class="profile-avatar">${/^https:\/\//.test(p.avatar_url||'')?`<img src="${esc(p.avatar_url)}" alt="${esc(p.display_name)}" referrerpolicy="no-referrer">`:esc((p.display_name||'?').slice(0,1).toUpperCase())}</span>`;
 function loadLocal(){try{const a=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
 function storeLocal(next){localStorage.setItem(storageKey,JSON.stringify(next));plans=next;}
 function connection(){
  $('connectionStatus').textContent=!navigator.onLine?'Nav interneta. Mākoņa izmaiņas nevar saglabāt.':!user?'Vietējie plāni šajā pārlūkā':!migrated?'Jāatjaunina datubāze — palaid collaboration.sql Supabase SQL Editorā.':'';
  $('connectionStatus').classList.toggle('needs-setup',!!user&&!migrated);
 }
 async function reload(){
  const version=++generation;
  if(!user||!client){plans=loadLocal();organizations=[];members=[];profiles=[];assignments=[];bulletins=[];workspace='';migrated=false;render();return;}
  try{
   const results=await Promise.all([api(client.from('plans').select('*').order('plan_date')),client.from('organizations').select('*'),client.from('organization_members').select('*'),client.from('profiles').select('*'),client.from('plan_assignees').select('*'),client.from('bulletins').select('*').order('created_at',{ascending:false})]);
   if(version!==generation)return;
   plans=results[0];migrated=results.slice(1).every(r=>!r.error);
   [organizations,members,profiles,assignments,bulletins]=results.slice(1).map(r=>r.data||[]);
   if(workspace&&!organizations.some(o=>o.id===workspace))workspace='';
   if(chatId&&!bulletins.some(b=>b.id===chatId)){chatId=null;chatMessages=[];}
   render();
  }catch(e){if(version===generation){say(failure(e));connection();}}
 }
 function render(){
  connection();$('workspace').innerHTML='<option value="">Personīgi</option>'+organizations.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');$('workspace').value=workspace;
  $('accountBtn').textContent=user?'Konts ✓':'Konts';
  for(const name of ['timeline','upcoming','bulletins','settings'])$(name+'Tab').classList.toggle('active',view===name);
  $('calendarHeader').hidden=view!=='timeline';$('addTop').hidden=!['timeline','upcoming'].includes(view)||!canCreate();$('addFab').hidden=$('addTop').hidden;
  $('draftBar').hidden=!draft;$('commitDraft').textContent=draft&&!canEdit(draft.base)?'Iesniegt apstiprināšanai':'Saglabāt';
  $('schedule').classList.toggle('chat-mode',view==='bulletins'&&!!chatId);$('schedule').classList.toggle('panel-mode',view==='settings'||view==='bulletins');
  $('emptyState').hidden=true;
  if(view==='timeline'){renderWeek();renderTimeline();}
  else if(view==='upcoming')renderUpcoming();else if(view==='bulletins'){chatId?renderChat():renderBulletins();}else renderSettings();
 }
 function renderWeek(){
  const start=monday(),fmt=k=>new Intl.DateTimeFormat('lv',{day:'2-digit',month:'2-digit'}).format(parse(k));
  $('rangeLabel').textContent=fmt(start)+' – '+fmt(shift(start,6));$('jumpDate').value=selected;$('todayBtn').hidden=selected===localToday();
  $('weekStrip').innerHTML=Array.from({length:7},(_,i)=>{const d=shift(start,i);return `<button class="day-cell${d===selected?' selected':''}" data-date="${d}" aria-pressed="${d===selected}"><span class="day-num">${parse(d).getDate()}</span><span class="weekday">${new Intl.DateTimeFormat('lv',{weekday:'long'}).format(parse(d))}</span></button>`;}).join('');
  $('weekStrip').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.date;render();});
  const count=visiblePlans().filter(p=>p.plan_date<=shift(start,6)&&(p.end_date||p.plan_date)>=start).length;
  $('daySummary').textContent=`${count} ${count===1?'plāns':'plāni'} · V1 — augstākā prioritāte`;
 }
 function renderTimeline(){
  const wrap=$('timeline');wrap.className='timeline editor-timeline';wrap.innerHTML='';const week=monday(),lo=T.dayNumber(week)*1440;
  const items=visiblePlans().filter(p=>p.plan_date<=shift(week,6)&&(p.end_date||p.plan_date)>=week);
  for(let priority=1;priority<=4;priority++){
   const row=document.createElement('div');row.className='priority-row';row.dataset.priority=priority;row.innerHTML=`<span class="priority-label">V${priority}</span><div class="priority-lane"></div>`;
   const lane=row.lastElementChild,tracks=[];
   for(const original of items.filter(p=>Number((draft?.id===p.id?draft.patch.priority:p.priority)||2)===priority).sort((a,b)=>T.range(a).start-T.range(b).start)){
    const ownDraft=draft?.id===original.id;const remote=editors.find(e=>e.plan_id===original.id&&e.session_id!==sessionId&&new Date(e.expires_at)>new Date());
    const p={...original,...(ownDraft?draft.patch:{})};const r=T.range(p),left=Math.max(0,(r.start-lo)/1440),right=Math.min(7,(r.end-lo)/1440);if(right<=left)continue;
    const width=Math.min(Math.max(.8,right-left),7-left);let track=tracks.findIndex(end=>end<=left);if(track<0)track=tracks.length;tracks[track]=left+width;
    const b=document.createElement('button');b.type='button';b.className='editor-block'+(p.done?' done':'')+(ownDraft||remote?' ghost-block':'');b.style.cssText=`left:calc(${left/7*100}% + 8px);width:calc(${width/7*100}% - 12px);top:${track*112+14}px;background-color:${color(p)}`;
    b.innerHTML=`${ownDraft||remote?'<span class="material-symbols-outlined sync-mark" aria-hidden="true">sync</span>':''}<strong>${p.important?'! ':''}${esc(p.title)}</strong>${p.participants?`<span>${esc(p.participants)}</span>`:''}<small>${clock(p.start_time)}–${clock(p.end_time)}${p.status==='postponed'?' · Atlikts':''}</small>`;
    if(ownDraft||remote){const badge=document.createElement('span');badge.className='editor-avatar';badge.innerHTML=avatar(ownDraft?profile(user?.id):{display_name:remote.editor_name,avatar_url:remote.avatar_url});badge.title=(ownDraft?'Tu':remote.editor_name)+' rediģē';b.append(badge);}
    b.setAttribute('aria-label',`${p.title}, V${priority}, ${p.plan_date} ${clock(p.start_time)} – ${p.end_date||p.plan_date} ${clock(p.end_time)}${ownDraft?', nesaglabātas izmaiņas':''}`);
    b.onclick=()=>{if(!b.dataset.dragged)openEdit(original.id);};attachDrag(b,p,lane);lane.append(b);
   }
   row.style.minHeight=`${Math.max(1,tracks.length)*112+12}px`;row.style.setProperty("--row-height",`${Math.max(1,tracks.length)*112+12}px`);wrap.append(row);
  }
 }
 function renderUpcoming(){
  $('daySummary').textContent='Nākamās 14 dienas';const wrap=$('timeline');wrap.className='upcoming-list';
  const items=visiblePlans().filter(p=>(p.end_date||p.plan_date)>=localToday()&&p.plan_date<=shift(localToday(),14)).sort((a,b)=>T.range(a).start-T.range(b).start);
  wrap.innerHTML=items.length?items.map(p=>`<button class="list-row" data-plan="${p.id}"><span class="color-dot" style="background:${color(p)}"></span><span><strong>${esc(p.title)}</strong><small>${esc(p.plan_date)} · ${clock(p.start_time)}–${clock(p.end_time)} · V${p.priority||2}</small></span><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>`).join(''):'<p class="empty-copy">Nākamajās 14 dienās nav plānu.</p>';
  wrap.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>openEdit(b.dataset.plan));
 }
 function attachDrag(block,plan,lane){
  for(const edge of ['start','end']){const h=document.createElement('span');h.className='resize-handle '+edge;h.dataset.edge=edge;h.setAttribute('aria-hidden','true');block.append(h);}
  block.onpointerdown=e=>{
   if(e.button!==0||busy||draft&&draft.id!==plan.id)return;
   const x=e.clientX,y=e.clientY,edge=e.target.dataset.edge,old=T.range(plan),width=lane.getBoundingClientRect().width;let armed=e.pointerType==='mouse',moved=false,delta=0,target=Number(plan.priority||2);
   const timer=setTimeout(()=>{armed=true;},350);
   function cleanup(){clearTimeout(timer);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);}
   function move(ev){if(!armed||Math.hypot(ev.clientX-x,ev.clientY-y)<8)return;ev.preventDefault();if(!moved){const mark=document.createElement('span');mark.className='material-symbols-outlined sync-mark';mark.textContent='sync';block.append(mark);startPresence(plan.id,null);}
    moved=true;dragging=true;block.dataset.dragged='1';block.classList.add('ghost-block');
    delta=Math.round((ev.clientX-x)/width*7*1440/30)*30;if(edge==='start')delta=Math.min(delta,old.end-old.start-30);if(edge==='end')delta=Math.max(delta,old.start-old.end+30);
    block.style.transform=`translate(${edge?0:ev.clientX-x}px,${edge?0:ev.clientY-y}px)`;
    if(edge)block.style.width=`${Math.max(50,(old.end-old.start+(edge==='end'?delta:-delta))/1440/7*width)}px`;
    for(const row of document.querySelectorAll('.priority-row')){const r=row.getBoundingClientRect();if(ev.clientY>=r.top&&ev.clientY<=r.bottom)target=Number(row.dataset.priority);}
   }
   function finish(){cleanup();dragging=false;if(!moved)return;
    moveCandidate={base:plans.find(p=>p.id===plan.id),kept:T.patch(old.start,old.end,target),patch:T.patch(old.start+(edge==='end'?0:delta),old.end+(edge==='start'?0:delta),edge?plan.priority:target)};
    renderTimeline();if(edge){stage(moveCandidate.base,moveCandidate.patch);moveCandidate=null;}else{ $('moveError').textContent='';$('moveDescription').textContent=`V${target}. Izvēlies plāna laiku. Pēc tam izmaiņas varēsi saglabāt vai atcelt.`;$('moveDialog').showModal();}
   }
   function cancel(){cleanup();dragging=false;if(!draft)stopPresence();renderTimeline();}
   document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);
  };
 }
 function stage(base,patch){draft={id:base.id,base:structuredClone(base),patch:{...(draft?.id===base.id?draft.patch:{}),...patch}};$('draftError').textContent='';startPresence(base.id,draft.patch);render();}
 function discard(){draft=null;$('draftError').textContent='';stopPresence();render();}
 async function savePlan(base,changes,assigneeIds){
  if(!user){const id=base?.id||uid(),next=base?plans.map(p=>p.id===id?{...p,...changes,updated_at:new Date().toISOString()}:p):[...plans,{id,...changes,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];storeLocal(next);return id;}
  if(!migrated)throw new Error('Palaid collaboration.sql Supabase SQL Editorā, pēc tam pārlādē lapu.');
  let saved;
  if(base)saved=await rpc('dayline_save_plan',{pid:base.id,expected_updated_at:base.updated_at,changes,assignment_ids:assigneeIds||null});
  else saved=await rpc('dayline_insert_plan',{org:workspace||null,changes,assignment_ids:assigneeIds||null});
  await reload();return saved.id;
 }
 function formValues(){return {title:$('taskTitle').value.trim(),notes:$('taskNotes').value.trim(),plan_date:$('taskDate').value,end_date:$('taskEndDate').value,start_time:$('taskStart').value,end_time:$('taskEnd').value,priority:Number($('taskPriority').value),color:$('taskColor').value,participants:$('taskParticipants').value.trim(),category:$('taskCategory').value,done:$('taskDone').checked,status:$('taskStatus').value,important:$('taskImportant').checked};}
 function validate(p){if(!p.title||!p.plan_date||!p.end_date||!p.start_time||!p.end_time)throw new Error('Aizpildi nosaukumu, datumus un laikus.');if(T.range(p).end<=T.range(p).start)throw new Error('Beigām jābūt pēc sākuma.');}
 function fillTask(p){for(const [id,key] of Object.entries({taskTitle:'title',taskNotes:'notes',taskDate:'plan_date',taskEndDate:'end_date',taskStart:'start_time',taskEnd:'end_time',taskPriority:'priority',taskColor:'color',taskParticipants:'participants',taskCategory:'category',taskStatus:'status'}))$(id).value=p[key]??({end_date:p.plan_date,priority:2,color:'#d3656b',category:'personal',status:'scheduled'}[key]||'');$('taskStart').value=clock(p.start_time);$('taskEnd').value=clock(p.end_time);$('taskDone').checked=!!p.done;$('taskImportant').checked=!!p.important;}
 function openTask(p,base){
  activeId=base?.id||null;editBase=base?structuredClone(base):null;fillTask(p);$('formError').textContent='';$('sheetTitle').textContent=base?'Rediģēt plānu':'Jauns plāns';
  $('deleteTask').hidden=!base||!canEdit(base);$('saveTask').hidden=!!base&&!canEdit(base);$('requestApproval').hidden=!base?.organization_id||!migrated;
  $('assigneesField').hidden=!workspace||base&&!canEdit(base);$('assigneesList').innerHTML=members.filter(m=>m.organization_id===workspace).map(m=>`<label class="checkbox-label"><input type="checkbox" value="${m.user_id}" ${assignments.some(a=>a.plan_id===base?.id&&a.user_id===m.user_id)?'checked':''}>${esc(profile(m.user_id).display_name)} (${roles[m.role]})</label>`).join('');
  if(base)startPresence(base.id,draft?.id===base.id?draft.patch:null);$('taskDialog').showModal();
 }
 function openCreate(){if(draft)return say('Vispirms saglabā vai atcel nesaglabātās izmaiņas.');if(!canCreate())return say('Viesis nevar veidot plānus.');const n=new Date().getHours()*60+new Date().getMinutes(),start=Math.min(22*60,Math.ceil(n/30)*30);openTask({...T.patch(T.stamp(selected,'00:00')+start,T.stamp(selected,'00:00')+start+60,2),title:'',notes:'',participants:'',color:'#d3656b',category:'personal',status:'scheduled'},null);}
 function openEdit(id,override){const p=plans.find(p=>p.id===id);if(!p)return;openTask({...p,...(draft?.id===id?draft.patch:{}),...override},p);}
 $('taskForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{const p=formValues();validate(p);busy=true;$('saveTask').disabled=true;await savePlan(editBase,p,Array.from($('assigneesList').querySelectorAll('input:checked')).map(i=>i.value));if(draft?.id===activeId)draft=null;$('taskDialog').close();selected=p.plan_date;render();say('Plāns saglabāts');}catch(e){$('formError').textContent=failure(e);}finally{busy=false;$('saveTask').disabled=false;}};
 $('deleteTask').onclick=async()=>{if(!editBase||busy||!confirm('Dzēst šo plānu?'))return;try{busy=true;if(user)await api(client.from('plans').delete().eq('id',activeId).eq('updated_at',editBase.updated_at).select().single());else storeLocal(plans.filter(p=>p.id!==activeId));if(draft?.id===activeId)draft=null;$('taskDialog').close();await reload();say('Plāns izdzēsts');}catch(e){$('formError').textContent=failure(e);}finally{busy=false;}};
 $('closeSheet').onclick=()=>$('taskDialog').close();$('taskDialog').onclose=()=>{if(!draft)stopPresence();};
 $('taskDate').onchange=()=>{if($('taskEndDate').value<$('taskDate').value)$('taskEndDate').value=$('taskDate').value;};
 $('commitDraft').onclick=async()=>{if(!draft||busy)return;if(!canEdit(draft.base))return openBulletin(draft);try{busy=true;$('commitDraft').disabled=true;await savePlan(draft.base,draft.patch);draft=null;await stopPresence();render();say('Izmaiņas saglabātas');}catch(e){$('draftError').textContent=failure(e);}finally{busy=false;$('commitDraft').disabled=false;}};
 $('discardDraft').onclick=discard;$('editDraft').onclick=()=>draft&&openEdit(draft.id);
 $('keepTime').onclick=()=>{if(!moveCandidate)return;const {base,kept}=moveCandidate;stage(base,kept);moveCandidate=null;$('moveDialog').close();};
 $('nearestTime').onclick=()=>{if(!moveCandidate)return;const {base,patch}=moveCandidate;const found=T.nearestFree(base,visiblePlans(),patch.priority,T.range({...base,...patch}).start,monday());if(!found){$('moveError').textContent='Diemžēl šajā nedēļā nav brīva laika. Izvēlies citu laiku.';return;}stage(base,found);moveCandidate=null;$('moveDialog').close();};
 $('customTime').onclick=()=>{const c=moveCandidate;moveCandidate=null;$('moveDialog').close();if(c){stage(c.base,c.patch);openEdit(c.base.id,c.patch);}};
 $('closeMove').onclick=()=>{moveCandidate=null;$('moveDialog').close();if(!draft)stopPresence();};
 $('moveDialog').addEventListener('cancel',()=>{moveCandidate=null;if(!draft)stopPresence();});
 function needCloud(){if(!user){say('Vispirms pieslēdzies kontam.');showAccount();return true;}if(!migrated){say('Palaid collaboration.sql Supabase SQL Editorā.');return true;}return false;}
 function renderBulletins(){
  $('daySummary').textContent='Biļetenes';const wrap=$('timeline');wrap.className='bulletins-view';
  wrap.innerHTML=`<section class="panel-heading"><h1>Biļetenes</h1><button id="newBulletin" class="add-small"><span class="material-symbols-outlined" aria-hidden="true">add</span>Jauna</button></section>`;
  if(!user)wrap.innerHTML+='<p class="empty-copy">Pieslēdzies, lai skatītu privāto saraksti.</p>';
  else if(!workspace)wrap.innerHTML+='<p class="empty-copy">Izvēlies organizāciju, lai skatītu biļetenes.</p>';
  else {const list=bulletins.filter(b=>b.organization_id===workspace);wrap.innerHTML+=list.length?list.map(b=>{const other=profile(b.sender_id===user.id?b.recipient_id:b.sender_id);return `<button class="list-row bulletin-row" data-bulletin="${b.id}">${avatar(other)}<span><strong>${esc(b.subject)}</strong><small>${esc(other.display_name)}</small></span><span class="status-pill ${b.status}">${statuses[b.status]}</span></button>`;}).join(''):'<p class="empty-copy">Šeit vēl nav biļeteņu.</p>';}
  $('newBulletin').onclick=()=>openBulletin();wrap.querySelectorAll('[data-bulletin]').forEach(b=>b.onclick=()=>openChat(b.dataset.bulletin));
 }
 function openBulletin(fromDraft){
  if(needCloud())return;if(!workspace)return say('Vispirms izvēlies organizāciju.');
  const admins=members.filter(m=>m.organization_id===workspace&&m.role==='admin'&&m.user_id!==user.id);if(!admins.length)return say('Organizācijā vajadzīgs cits administrators, kuram iesniegt biļeteni.');
  proposal=fromDraft?structuredClone(fromDraft):null;$('bulletinForm').reset();$('bulletinError').textContent='';
  $('bulletinRecipient').innerHTML=admins.map(m=>`<option value="${m.user_id}">${esc(profile(m.user_id).display_name)}</option>`).join('');
  $('bulletinPlan').innerHTML='<option value="">Bez piesaistīta plāna</option>'+visiblePlans().map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('');
  $('bulletinPlan').value=proposal?.id||'';$('bulletinPlan').disabled=!!proposal;$('proposalNotice').hidden=!proposal;
  if(proposal)$('bulletinSubject').value='Izmaiņu apstiprināšana';$('bulletinDialog').showModal();
 }
 $('requestApproval').onclick=()=>{try{const values=formValues();validate(values);const data={id:activeId,base:editBase,patch:values};$('taskDialog').close();openBulletin(data);}catch(e){$('formError').textContent=failure(e);}};
 $('closeBulletin').onclick=()=>$('bulletinDialog').close();
 $('bulletinForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{busy=true;$('sendBulletin').disabled=true;const id=await rpc('dayline_create_bulletin',{org:workspace,recipient:$('bulletinRecipient').value,plan:$('bulletinPlan').value||null,heading:$('bulletinSubject').value.trim(),description:$('bulletinBody').value.trim(),proposal:proposal?.patch||null,base_version:proposal?.base.updated_at||null});
   if(draft?.id===proposal?.id){draft=null;stopPresence();}proposal=null;$('bulletinDialog').close();await reload();await openChat(id);say('Biļetene iesniegta');
  }catch(e){$('bulletinError').textContent=failure(e);}finally{busy=false;$('sendBulletin').disabled=false;}};
 async function openChat(id){chatId=id;view='bulletins';chatMessages=[];pendingFiles=[];render();try{await refreshChat();}catch(e){say(failure(e));}}
 async function refreshChat(){if(!chatId||!user)return;const id=chatId,messages=await api(client.from('bulletin_messages').select('*').eq('bulletin_id',id).order('created_at'));if(id!==chatId)return;chatMessages=messages;paintMessages();}
 function proposalSummary(p){if(!p)return '';const labels={plan_date:'Sākuma datums',end_date:'Beigu datums',start_time:'Sākums',end_time:'Beigas',priority:'Prioritāte',title:'Nosaukums',notes:'Piezīmes',status:'Statuss',important:'Svarīgs pasākums',color:'Krāsa',participants:'Dalībnieki'};return '<dl class="proposal-details">'+Object.entries(p).filter(([k])=>labels[k]).map(([k,v])=>`<div><dt>${labels[k]}</dt><dd>${esc(k==='priority'?'V'+v:k==='status'?(v==='postponed'?'Atlikts':'Ieplānots'):typeof v==='boolean'?(v?'Jā':'Nē'):v)}</dd></div>`).join('')+'</dl>';}
 function renderChat(){
  const b=bulletins.find(b=>b.id===chatId);if(!b){chatId=null;renderBulletins();return;}
  $('daySummary').textContent='Biļetenes sarakste';const other=profile(b.sender_id===user.id?b.recipient_id:b.sender_id),plan=plans.find(p=>p.id===b.plan_id);
  const wrap=$('timeline');wrap.className='chat-view';
  wrap.innerHTML=`<div class="chat-header"><button id="backChat" class="week-arrow" aria-label="Atpakaļ"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button><h1>Biļetenes sarakste</h1></div><div class="chat-person">${avatar(other)}<strong>${esc(other.display_name)}</strong></div><div id="chatScroll" class="chat-scroll"><article class="request-card">${plan?`<div class="linked-plan ghost-block">${esc(plan.title)}</div>`:''}<strong>${esc(b.subject)}</strong><p>${esc(b.body)}</p>${b.proposed_patch?`<details><summary>Ierosinātās izmaiņas</summary>${proposalSummary(b.proposed_patch)}</details>`:''}<span class="status-pill ${b.status}">${statuses[b.status]}</span>${b.status==='pending'&&b.recipient_id===user.id&&role()==='admin'?'<div class="decision-buttons"><button id="declineBulletin" aria-label="Noraidīt" class="decline"><span class="material-symbols-outlined" aria-hidden="true">close</span></button><button id="acceptBulletin" aria-label="Apstiprināt" class="accept"><span class="material-symbols-outlined" aria-hidden="true">check</span></button></div>':''}</article><div id="chatMessages"></div></div><form id="chatForm" class="chat-composer"><div id="attachmentPreview"></div><div class="composer-row"><label class="attach-button" aria-label="Pievienot failu"><span class="material-symbols-outlined" aria-hidden="true">attach_file</span><input id="chatFiles" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" multiple></label><textarea id="chatInput" placeholder="Rakstiet…" aria-label="Ziņa" rows="1" maxlength="4000"></textarea><button id="sendMessage" class="send-button" aria-label="Nosūtīt"><span class="material-symbols-outlined" aria-hidden="true">send</span></button></div><p id="chatError" class="error" role="alert"></p></form>`;
  $('backChat').onclick=()=>{chatId=null;pendingFiles=[];render();};
  if($('acceptBulletin')){$('acceptBulletin').onclick=()=>decide(true);$('declineBulletin').onclick=()=>decide(false);}
  $('chatForm').onsubmit=sendMessage;$('chatFiles').onchange=e=>{const files=[...e.target.files];if(files.length+pendingFiles.length>5){say('Vienai ziņai vari pievienot līdz 5 failiem.');return;}const bad=files.find(f=>f.size>10*1024*1024||!fileMime(f.name));if(bad){say('Atļauti PDF, DOCX, PNG, JPG un TXT faili līdz 10 MB.');return;}pendingFiles.push(...files);paintAttachments();};
  paintMessages();paintAttachments();
 }
 const fileMime=name=>({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain'}[name.split('.').pop().toLowerCase()]);
 function paintAttachments(){const wrap=$('attachmentPreview');if(!wrap)return;wrap.innerHTML=pendingFiles.map((f,i)=>`<button type="button" data-remove="${i}" class="attachment-chip">${esc(f.name)} ×</button>`).join('');wrap.querySelectorAll('button').forEach(b=>b.onclick=()=>{pendingFiles.splice(Number(b.dataset.remove),1);paintAttachments();});}
 function paintMessages(){const wrap=$('chatMessages');if(!wrap)return;const atBottom=$('chatScroll').scrollHeight-$('chatScroll').scrollTop-$('chatScroll').clientHeight<80;
  wrap.innerHTML=chatMessages.map(m=>`<article class="chat-bubble ${m.sender_id===user.id?'own':'received'}">${m.body?`<p>${esc(m.body)}</p>`:''}${(Array.isArray(m.attachments)?m.attachments:[]).map((a,i)=>`<button class="download-attachment" data-msg="${m.id}" data-file="${i}"><span class="material-symbols-outlined" aria-hidden="true">description</span>${esc(a.name)}</button>`).join('')}<time>${new Intl.DateTimeFormat('lv',{hour:'2-digit',minute:'2-digit'}).format(new Date(m.created_at))}</time></article>`).join('');
  wrap.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{try{const a=chatMessages.find(m=>m.id===b.dataset.msg).attachments[Number(b.dataset.file)];const data=await api(client.storage.from('dayline-attachments').createSignedUrl(a.path,60));const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.download=a.name;link.click();}catch(e){say(failure(e));}});
  if(atBottom)$('chatScroll').scrollTop=$('chatScroll').scrollHeight;
 }
 async function sendMessage(e){e.preventDefault();if(busy)return;const body=$('chatInput').value.trim(),files=[...pendingFiles],id=chatId;if(!body&&!files.length)return;const uploaded=[];try{busy=true;$('sendMessage').disabled=true;$('chatError').textContent='';
   for(const f of files){const safe=f.name.replace(/[^\p{L}\p{N}._-]/gu,'_'),path=`${id}/${user.id}/${uid()}-${safe}`;await api(client.storage.from('dayline-attachments').upload(path,f,{contentType:fileMime(f.name),upsert:false}));uploaded.push({path,name:f.name,size:f.size});}
   await api(client.from('bulletin_messages').insert({bulletin_id:id,body,attachments:uploaded}));pendingFiles=[];$('chatInput').value='';$('chatFiles').value='';paintAttachments();await refreshChat();$('chatScroll').scrollTop=$('chatScroll').scrollHeight;
  }catch(e){if(uploaded.length)await client.storage.from('dayline-attachments').remove(uploaded.map(f=>f.path));if($('chatError'))$('chatError').textContent=failure(e);}finally{busy=false;if($('sendMessage'))$('sendMessage').disabled=false;}}
 async function decide(accept){if(busy)return;try{busy=true;await rpc('dayline_decide',{bid:chatId,accept_request:accept});await reload();say(accept?'Biļetene apstiprināta':'Biļetene noraidīta');}catch(e){say(failure(e));}finally{busy=false;}}
 function renderSettings(){
  $('daySummary').textContent='Iestatījumi';const wrap=$('timeline');wrap.className='settings-view';
  if(!user){wrap.innerHTML='<h1>Iestatījumi</h1><p class="empty-copy">Organizācijām un koplietošanai pieslēdzies kontam.</p><button id="settingsLogin" class="primary-button">Pieslēgties</button>'; $('settingsLogin').onclick=showAccount;return;}
  const me=profile(user.id),org=organizations.find(o=>o.id===workspace),isAdmin=role()==='admin';
  wrap.innerHTML=`<h1>Iestatījumi</h1><section class="settings-section"><h2>Profils</h2><form id="profileForm"><label for="profileName">Vārds</label><input id="profileName" maxlength="100" required value="${esc(me.display_name)}"><label for="profileAvatar">Profila bildes HTTPS adrese</label><input id="profileAvatar" type="url" value="${esc(me.avatar_url)}"><button class="secondary-button">Saglabāt profilu</button></form></section><section class="settings-section"><h2>Organizācijas</h2><form id="orgForm"><label for="orgName">Jaunas organizācijas nosaukums</label><input id="orgName" maxlength="100" required><button class="secondary-button">Izveidot organizāciju</button></form><form id="joinForm"><label for="joinCode">Uzaicinājuma kods</label><input id="joinCode" required autocomplete="off"><button class="secondary-button">Pievienoties</button></form></section>`;
  if(org){wrap.innerHTML+=`<section class="settings-section"><h2>${esc(org.name)}</h2><p class="account-copy">Tava loma: ${roles[role()]}. Administrators pārvalda organizāciju. Piederīgais redz organizācijas plānus un rediģē savus. Viesis redz tikai viņam piešķirtos plānus.</p><div id="memberList">${members.filter(m=>m.organization_id===workspace).map(m=>`<div class="member-row">${avatar(profile(m.user_id))}<span>${esc(profile(m.user_id).display_name)}${org.owner_id===m.user_id?' · Īpašnieks':''}</span>${isAdmin&&org.owner_id!==m.user_id?`<select data-member="${m.user_id}" aria-label="${esc(profile(m.user_id).display_name)} loma">${Object.entries(roles).map(([v,n])=>`<option value="${v}" ${v===m.role?'selected':''}>${n}</option>`).join('')}</select><button class="text-button remove-member" data-remove-member="${m.user_id}">Noņemt</button>`:`<small>${roles[m.role]}</small>`}</div>`).join('')}</div>${isAdmin?'<form id="inviteForm"><label for="inviteRole">Uzaicināt ar lomu</label><select id="inviteRole"><option value="member">Piederīgais</option><option value="guest">Viesis</option><option value="admin">Administrators</option></select><button class="secondary-button">Izveidot uzaicinājumu</button><output id="inviteResult"></output></form><div id="invitesList"></div>':''}</section>`;}
  $('profileForm').onsubmit=e=>mutateForm(e,async()=>{const url=$('profileAvatar').value.trim();if(url&&!url.startsWith('https://'))throw new Error('Bildei vajadzīga HTTPS adrese.');await api(client.from('profiles').upsert({id:user.id,display_name:$('profileName').value.trim(),avatar_url:url}));});
  $('orgForm').onsubmit=e=>mutateForm(e,async()=>{if(needCloud())return;workspace=await rpc('dayline_create_organization',{org_name:$('orgName').value.trim()});});
  $('joinForm').onsubmit=e=>mutateForm(e,async()=>{if(needCloud())return;workspace=await rpc('dayline_join',{invite_code:$('joinCode').value.trim()});});
  if(isAdmin){$('inviteForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{busy=true;const code=await rpc('dayline_invite',{org:workspace,invite_role:$('inviteRole').value});$('inviteResult').innerHTML=`<label>Vienreizējs kods · derīgs 7 dienas</label><input readonly value="${esc(code)}" aria-label="Izveidotais uzaicinājuma kods"><button id="copyInvite" class="text-button" type="button">Kopēt kodu</button>`;$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(code);say('Kods nokopēts');}catch{say('Iezīmē un nokopē kodu.');}};await paintInvites();}catch(e){say(failure(e));}finally{busy=false;}};
   wrap.querySelectorAll('[data-member]').forEach(s=>s.onchange=async()=>{try{await rpc('dayline_member',{org:workspace,member_id:s.dataset.member,new_role:s.value});await reload();}catch(e){say(failure(e));await reload();}});
   wrap.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=async()=>{if(!confirm('Noņemt šī dalībnieka piekļuvi organizācijai?'))return;try{await rpc('dayline_member',{org:workspace,member_id:b.dataset.removeMember,new_role:null});await reload();}catch(e){say(failure(e));}});paintInvites().catch(e=>say(failure(e)));
  }
 }
 async function paintInvites(){const wrap=$('invitesList');if(!wrap)return;const list=await api(client.from('organization_invites').select('*').eq('organization_id',workspace).eq('revoked',false).is('used_by',null).gt('expires_at',new Date().toISOString()));if(!$('invitesList'))return;wrap.innerHTML=list.map(i=>`<div class="invite-row"><code>${esc(i.code)}</code><span>${roles[i.role]}</span><button data-revoke="${i.id}" class="text-button">Atsaukt</button></div>`).join('');wrap.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{try{await rpc('dayline_revoke_invite',{invite_id:b.dataset.revoke});await paintInvites();}catch(e){say(failure(e));}});}
 async function mutateForm(e,fn){e.preventDefault();if(busy)return;try{busy=true;await fn();await reload();say('Saglabāts');}catch(e){say(failure(e));}finally{busy=false;}}
 function showAccount(){
  const wrap=$('accountContent');
  if(user){wrap.innerHTML=`<p class="account-status">${esc(user.email)}</p><button id="signOut" class="secondary-button">Izrakstīties</button>`;$('signOut').onclick=async()=>{try{await stopPresence();await api(client.auth.signOut());$('accountDialog').close();}catch(e){say(failure(e));}};}
  else if(!client){wrap.innerHTML='<p class="account-copy">Aktīvs vietējais režīms. Plāni glabājas šajā pārlūkā.</p>';}
  else{
   wrap.innerHTML='<form id="authForm"><p id="authIntro" class="account-copy">Pieslēdzies, lai sinhronizētu plānus.</p><label for="accountEmail">E-pasta adrese</label><input id="accountEmail" type="email" required autocomplete="email"><label for="accountPassword">Parole</label><input id="accountPassword" type="password" minlength="6" required autocomplete="current-password"><p id="authError" class="error" role="alert"></p><button id="authSubmit" class="primary-button">Pieslēgties</button><button id="authSwitch" class="text-button" type="button">Izveidot kontu</button></form>';
   let joining=false;$('authSwitch').onclick=()=>{joining=!joining;$('authSubmit').textContent=joining?'Izveidot kontu':'Pieslēgties';$('authSwitch').textContent=joining?'Jau ir konts? Pieslēgties':'Izveidot kontu';$('accountPassword').autocomplete=joining?'new-password':'current-password';};
   $('authForm').onsubmit=async e=>{e.preventDefault();$('authSubmit').disabled=true;$('authError').textContent='';try{const credentials={email:$('accountEmail').value.trim(),password:$('accountPassword').value};const result=joining?await client.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword(credentials);if(result.error)throw result.error;if(joining&&!result.data.session)say('Apstiprini kontu e-pastā, pēc tam pieslēdzies.');else $('accountDialog').close();}catch(e){$('authError').textContent=failure(e);}finally{$('authSubmit').disabled=false;}};
  }
  $('accountDialog').showModal();
 }
 async function heartbeat(){if(!client||!user||!migrated||!presencePlan)return;try{const p=profile(user.id);await api(client.from('plan_edit_sessions').upsert({session_id:sessionId,plan_id:presencePlan,user_id:user.id,editor_name:p.display_name,avatar_url:p.avatar_url||'',draft:presenceDraft,expires_at:new Date(Date.now()+30000).toISOString()}));}catch{/* Expiry clears an interrupted editing session. */}}
 function startPresence(id,patch){presencePlan=id;presenceDraft=patch;clearInterval(editTimer);heartbeat();editTimer=setInterval(heartbeat,10000);}
 async function stopPresence(){clearInterval(editTimer);presencePlan=null;presenceDraft=null;editors=editors.filter(e=>e.session_id!==sessionId);if(client&&user&&migrated)await client.from('plan_edit_sessions').delete().eq('session_id',sessionId);}
 async function poll(){if(!client||!user||!migrated||document.visibilityState!=='visible'||busy||dragging)return;const version=generation;try{const data=await api(client.from('plan_edit_sessions').select('*').gt('expires_at',new Date().toISOString()));if(version!==generation)return;editors=data;if(view==='timeline'&&!document.querySelector('dialog[open]'))renderTimeline();if(chatId){await refreshChat();const current=await api(client.from('bulletins').select('*').eq('id',chatId).maybeSingle());if(current){bulletins=bulletins.map(b=>b.id===current.id?current:b);const badge=document.querySelector('.request-card .status-pill');if(badge){badge.textContent=statuses[current.status];badge.className='status-pill '+current.status;}if(current.status!=='pending')document.querySelector('.decision-buttons')?.remove();}else{chatId=null;render();}}
   // Refresh saved records without rebuilding a message composer or a settings form.
   const fresh=await api(client.from('plans').select('*').order('plan_date'));if(version===generation&&!busy&&!dragging){plans=fresh;if(view==='timeline'&&!document.querySelector('dialog[open]'))renderTimeline();}
  }catch{/* Keep the user's draft; the next poll can recover. */}}
 $('accountBtn').onclick=showAccount;$('closeAccount').onclick=()=>$('accountDialog').close();
 for(const id of ['addTop','addFab'])$(id).onclick=openCreate;
 for(const name of ['timeline','upcoming','bulletins','settings'])$(name+'Tab').onclick=()=>{view=name;chatId=null;render();};
 $('workspace').onchange=e=>{if(draft){e.target.value=workspace;return say('Vispirms saglabā vai atcel izmaiņas.');}workspace=e.target.value;chatId=null;render();};
 $('prevWeek').onclick=()=>{selected=shift(selected,-7);render();};$('nextWeek').onclick=()=>{selected=shift(selected,7);render();};$('todayBtn').onclick=()=>{selected=localToday();render();};$('jumpDate').onchange=e=>{if(e.target.value){selected=e.target.value;render();}};
 $('schedule').onscroll=()=>{$('weekStrip').style.transform=`translateX(-${$('schedule').scrollLeft}px)`;};
 window.addEventListener('beforeunload',e=>{if(draft){e.preventDefault();e.returnValue='';}});window.addEventListener('online',connection);window.addEventListener('offline',connection);
 if(client){client.auth.onAuthStateChange((_event,session)=>{const next=session?.user||null;if(user?.id===next?.id)return;user=next;draft=null;chatId=null;editors=[];clearInterval(editTimer);presencePlan=null;plans=[];organizations=[];members=[];profiles=[];assignments=[];bulletins=[];generation++;setTimeout(reload,0);});client.auth.getSession().then(({data,error})=>{if(error)say(failure(error));if(data?.session?.user&&user?.id!==data.session.user.id){user=data.session.user;reload();}}).catch(e=>say(failure(e)));}
 reload();setInterval(poll,5000);
})();
