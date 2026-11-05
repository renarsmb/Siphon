(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const today = () => { const d = new Date(); return dateKey(d); };
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDate = (key) => { const [y,m,d] = key.split('-').map(Number);return new Date(y,m-1,d,12); };
  const shiftDay = (key,n) => { const d=parseDate(key);d.setDate(d.getDate()+n);return dateKey(d); };
  const mins = (s) => { const [h,m]=s.slice(0,5).split(':').map(Number);return h*60+m; };
  const hhmm = (n) => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const minuteNow = () => new Date().getHours()*60 + new Date().getMinutes();
  const formatTime = (s) => s.slice(0,5);
  const escapeHTML = (v) => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const storageKey = 'dayline-plans-v1';
  let selected = today(), view='timeline', plans=[], client=null, user=null, activeId=null, toastTimer=null, loadVersion=0, busy=false;
  const config = window.DAYLINE_CONFIG || {};
  const ready = !!(config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient);
  if (ready) { try { client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey); } catch(e){ console.error(e); } }
  const loadLocal = () => { try { const p=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(p)?p:[]; } catch { return []; } };
  const saveLocal = () => localStorage.setItem(storageKey, JSON.stringify(plans));
  const message = (s) => { const el=$('toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300); };
  async function reload() {
    const version=++loadVersion;
    if (!user || !client){plans=loadLocal();render();return;}
    const {data,error}=await client.from('plans').select('*').order('plan_date',{ascending:true}).order('start_time',{ascending:true});
    if(version!==loadVersion)return;
    if(error){message('Sync failed: '+error.message);return;}
    plans=data||[];render();
  }
  function render(){
    const d=parseDate(selected);
    $('dateTitle').textContent=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric'}).format(d);
    $('weekLabel').textContent=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(d);
    $('todayBtn').hidden=selected===today();
    $('weekStrip').innerHTML='';
    const monday=shiftDay(selected,-((d.getDay()+6)%7));
    for(let i=0;i<7;i++){
      const key=shiftDay(monday,i), dt=parseDate(key), btn=document.createElement('button');
      btn.className='day-cell'+(key===selected?' selected':'')+(key===today()?' is-today':'');
      btn.type='button';btn.setAttribute('aria-pressed',String(key===selected));btn.setAttribute('aria-label',new Intl.DateTimeFormat('en',{dateStyle:'full'}).format(dt));
      btn.innerHTML=`<span class="weekday">${new Intl.DateTimeFormat('en',{weekday:'short'}).format(dt)}</span><span class="day-num">${dt.getDate()}</span>`;
      btn.addEventListener('click',()=>{selected=key;view='timeline';render();});$('weekStrip').append(btn);
    }
    $('timelineTab').classList.toggle('active',view==='timeline');$('upcomingTab').classList.toggle('active',view==='upcoming');
    const display=view==='timeline'?plans.filter(x=>x.plan_date===selected):plans.filter(x=>x.plan_date>=today()&&x.plan_date<=shiftDay(today(),14));
    $('daySummary').textContent=view==='timeline'?`${display.filter(p=>p.done).length} of ${display.length} completed`:'Next 14 days';
    $('dateTitle').textContent=view==='upcoming'?'Upcoming':$('dateTitle').textContent;
    $('weekStrip').hidden=view==='upcoming';$('todayBtn').hidden=view==='upcoming'||selected===today();
    $('emptyState').hidden=display.length!==0;
    $('emptyState').textContent=view==='timeline'?'No plans for this day. Tap + to add one.':'Nothing scheduled in the next 14 days.';
    if(view==='timeline')renderTimeline(display);else renderUpcoming(display);
    $('accountBtn').textContent=user?'Synced':'Account';
  }
  function renderTimeline(items){
    const wrap=$('timeline');wrap.innerHTML='';wrap.className='timeline';
    let start=6*60,end=23*60;
    if(items.length){start=Math.min(start,Math.floor(Math.min(...items.map(p=>mins(p.start_time)))/60)*60);end=Math.max(end,Math.ceil(Math.max(...items.map(p=>mins(p.end_time)))/60)*60);}
    start=Math.max(0,start);end=Math.min(24*60,end);
    for(let m=start;m<=end;m+=60){const div=document.createElement('div');div.className='hour-row';div.innerHTML=`<span class="hour-label">${m===24*60?'24:00':hhmm(m)}</span><span class="hour-rule"></span>`;wrap.append(div);}
    const layer=document.createElement('div');layer.className='task-layer';wrap.append(layer);
    const sorted=[...items].sort((a,b)=>mins(a.start_time)-mins(b.start_time)||mins(a.end_time)-mins(b.end_time));
    // Compute layout columns per overlap cluster.
    const groups=[];let group=[],groupEnd=-1;
    for(const item of sorted){const s=mins(item.start_time),e=mins(item.end_time);if(group.length&&s>=groupEnd){groups.push(group);group=[];groupEnd=-1;}group.push(item);groupEnd=Math.max(groupEnd,e);}if(group.length)groups.push(group);
    for(const groupItems of groups){const columns=[];const positions=[];
      for(const p of groupItems){let col=columns.findIndex(x=>x<=mins(p.start_time));if(col<0){col=columns.length;columns.push(mins(p.end_time));}else columns[col]=mins(p.end_time);positions.push(col);}
      groupItems.forEach((p,i)=>{const col=positions[i],count=columns.length;const top=(mins(p.start_time)-start)*1.2,height=Math.max(20,(mins(p.end_time)-mins(p.start_time))*1.2-2);
        const b=document.createElement('button');b.type='button';b.className='task '+p.category+(p.done?' done':'');b.style.top=`${top}px`;b.style.height=`${height}px`;b.style.left=`calc(${col/count*100}% + 5px)`;b.style.width=`calc(${100/count}% - 7px)`;b.style.right='auto';
        b.innerHTML=`<span class="task-title">${escapeHTML(p.title)}</span>${height>34?`<span class="task-time">${formatTime(p.start_time)}–${formatTime(p.end_time)}</span>`:''}${height>65&&p.notes?`<span class="task-notes">${escapeHTML(p.notes)}</span>`:''}`;
        b.setAttribute('aria-label',`${p.title}, ${formatTime(p.start_time)} to ${formatTime(p.end_time)}`);b.addEventListener('click',()=>openEdit(p.id));layer.append(b);
      });
    }
    if(selected===today()){const n=minuteNow();if(n>=start&&n<=end){const line=document.createElement('div');line.className='now-line';line.style.top=`${(n-start)*1.2}px`;wrap.append(line);}}
  }
  function renderUpcoming(items){const wrap=$('timeline');wrap.innerHTML='';wrap.className='timeline upcoming-list';
    if(!items.length)return;
    const sorted=[...items].sort((a,b)=>a.plan_date.localeCompare(b.plan_date)||a.start_time.localeCompare(b.start_time));let previous='';
    for(const item of sorted){if(item.plan_date!==previous){const label=document.createElement('h3');label.style.cssText='font-size:13px;font-weight:700;margin:23px 0 10px;color:#62686d';label.textContent=new Intl.DateTimeFormat('en',{weekday:'long',month:'short',day:'numeric'}).format(parseDate(item.plan_date));wrap.append(label);previous=item.plan_date;}
      const b=document.createElement('button');b.className='upcoming-entry';b.style.cssText='width:100%;display:flex;align-items:center;gap:13px;border:0;border-bottom:1px solid #eceeee;background:white;text-align:left;padding:12px 2px;color:inherit';
      const mark=document.createElement('span');mark.style.cssText=`width:3px;height:34px;border-radius:2px;background:var(--${item.category});flex:0 0 auto`;
      const time=document.createElement('span');time.style.cssText='font-size:12px;color:#6f747a;width:46px;flex:0 0 auto';time.textContent=formatTime(item.start_time);
      const body=document.createElement('span');body.style.cssText=`font-weight:640;font-size:14px;opacity:${item.done?.5:1};${item.done?'text-decoration:line-through':''}`;body.textContent=item.title;b.append(mark,time,body);b.addEventListener('click',()=>openEdit(item.id));wrap.append(b);
    }
  }
  function openCreate(){activeId=null;$('taskForm').reset();$('sheetTitle').textContent='New plan';$('deleteTask').hidden=true;$('formError').textContent='';$('taskDate').value=selected;
    const n=minuteNow(),start=Math.max(6*60,Math.min(22*60,Math.ceil(n/30)*30));$('taskStart').value=hhmm(start);$('taskEnd').value=hhmm(Math.min(23*60+30,start+60));$('taskDialog').showModal();}
  function openEdit(id){const p=plans.find(x=>x.id===id);if(!p)return;activeId=id;$('sheetTitle').textContent='Edit plan';$('deleteTask').hidden=false;$('formError').textContent='';$('taskTitle').value=p.title;$('taskNotes').value=p.notes;$('taskDate').value=p.plan_date;$('taskCategory').value=p.category;$('taskStart').value=formatTime(p.start_time);$('taskEnd').value=formatTime(p.end_time);$('taskDone').checked=!!p.done;$('taskDialog').showModal();}
  async function persist(p){if(!client||!user){if(activeId)plans=plans.map(v=>v.id===activeId?{...v,...p}:v);else plans.push({id:uid(),...p});saveLocal();return;}
    let q=activeId?client.from('plans').update(p).eq('id',activeId):client.from('plans').insert(p);const {error}=await q;if(error)throw error;await reload();}
  $('taskForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const title=$('taskTitle').value.trim(),start=$('taskStart').value,end=$('taskEnd').value,date=$('taskDate').value;
    if(!title||!date||!start||!end){$('formError').textContent='Fill in the title, date and times.';return;}
    if(mins(end)<=mins(start)){$('formError').textContent='End time must be after start time.';return;}
    const p={title,notes:$('taskNotes').value.trim(),plan_date:date,start_time:start,end_time:end,category:$('taskCategory').value,done:$('taskDone').checked};busy=true;$('saveTask').disabled=true;
    try{await persist(p);$('taskDialog').close();selected=date;view='timeline';render();message('Plan saved');}catch(err){$('formError').textContent=err.message||'Unable to save plan.';}finally{busy=false;$('saveTask').disabled=false;}
  });
  $('deleteTask').addEventListener('click',async()=>{if(!activeId||busy||!confirm('Delete this plan?'))return;busy=true;try{if(user&&client){const {error}=await client.from('plans').delete().eq('id',activeId);if(error)throw error;await reload();}else{plans=plans.filter(p=>p.id!==activeId);saveLocal();}activeId=null;$('taskDialog').close();render();message('Plan deleted');}catch(err){$('formError').textContent=err.message||'Unable to delete plan';}finally{busy=false;}});
  for(const id of ['addFab','addTop'])$(id).addEventListener('click',openCreate);
  $('closeSheet').addEventListener('click',()=>$('taskDialog').close());
  $('todayBtn').addEventListener('click',()=>{selected=today();view='timeline';render();});
  $('timelineTab').addEventListener('click',()=>{view='timeline';render();});
  $('upcomingTab').addEventListener('click',()=>{view='upcoming';render();});
  $('accountBtn').addEventListener('click',showAccount);
  $('closeAccount').addEventListener('click',()=>$('accountDialog').close());
  function showAccount(){const wrap=$('accountContent');wrap.replaceChildren();
    if(!client){const p=document.createElement('p');p.className='account-copy';p.textContent='Local mode is active. Your plans stay in this browser. To enable cloud sync, configure your Supabase project in config.js.';wrap.append(p);}
    else if(user){const p=document.createElement('p');p.className='account-status';p.textContent=`Signed in as ${user.email||'your account'}. Your cloud plans sync across devices.`;const button=document.createElement('button');button.className='secondary-button';button.textContent='Sign out';button.addEventListener('click',async()=>{const {error}=await client.auth.signOut();if(error)message(error.message);else $('accountDialog').close();});wrap.append(p,button);}
    else {const p=document.createElement('p');p.className='account-copy';p.textContent='Sign in with an email link to sync plans across devices. Local plans will stay on this device.';
      const form=document.createElement('form');const label=document.createElement('label');label.textContent='Email address';label.htmlFor='accountEmail';const input=document.createElement('input');input.type='email';input.id='accountEmail';input.required=true;input.placeholder='you@example.com';const button=document.createElement('button');button.type='submit';button.className='primary-button';button.style.marginTop='12px';button.textContent='Send sign-in link';form.append(label,input,button);
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;const {error}=await client.auth.signInWithOtp({email:input.value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});button.disabled=false;message(error?error.message:'Check your email for the sign-in link.');});wrap.append(p,form);}
    $('accountDialog').showModal();
  }
  window.addEventListener('keydown',e=>{if(e.key==='ArrowRight'&&!document.querySelector('dialog[open]')){selected=shiftDay(selected,1);render();}if(e.key==='ArrowLeft'&&!document.querySelector('dialog[open]')){selected=shiftDay(selected,-1);render();}});
  if(client){client.auth.onAuthStateChange((_event,session)=>{const next=session?.user||null;const changed=(user?.id||null)!==(next?.id||null);user=next;if(changed)reload();else render();});client.auth.getSession().then(({data,error})=>{if(error)message(error.message);const next=data?.session?.user||null;if((user?.id||null)!==(next?.id||null)){user=next;reload();}}).catch(e=>message(e.message));}
  reload();setInterval(()=>{if(selected===today()&&view==='timeline')render();},60000);
})();
