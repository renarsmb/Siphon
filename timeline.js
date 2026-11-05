/* Wall-clock timeline arithmetic: dates never shift with time zone or DST. */
(function(root){
  'use strict';
  const dayNumber=k=>{const [y,m,d]=k.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
  const dateKey=n=>new Date(n*86400000).toISOString().slice(0,10);
  const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
  const stamp=(date,time)=>dayNumber(date)*1440+minutes(time);
  const split=n=>({date:dateKey(Math.floor(n/1440)),time:`${String(Math.floor(((n%1440)+1440)%1440/60)).padStart(2,'0')}:${String(((n%60)+60)%60).padStart(2,'0')}`});
  const range=p=>({start:stamp(p.plan_date,p.start_time),end:stamp(p.end_date||p.plan_date,p.end_time)});
  const patch=(start,end,priority)=>{const a=split(start),b=split(end);return {plan_date:a.date,start_time:a.time,end_date:b.date,end_time:b.time,priority:Number(priority)};};
  function nearestFree(plan,items,priority,desired,week){
    const r=range(plan),duration=r.end-r.start,lo=dayNumber(week)*1440,hi=lo+7*1440;
    const occupied=items.filter(p=>p.id!==plan.id&&!p.done&&p.status!=='postponed'&&Number(p.priority||2)===Number(priority)).map(range).filter(r=>r.end>lo&&r.start<hi).sort((a,b)=>a.start-b.start);
    let cursor=lo;const gaps=[];
    for(const r of occupied){if(r.start>cursor)gaps.push([cursor,Math.min(r.start,hi)]);cursor=Math.max(cursor,r.end);}
    if(cursor<hi)gaps.push([cursor,hi]);
    const candidates=gaps.filter(([a,b])=>b-a>=duration).map(([a,b])=>Math.max(a,Math.min(Math.round(desired/30)*30,b-duration))).filter(n=>n>=lo&&n+duration<=hi);
    if(!candidates.length)return null;
    const start=candidates.sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired)||a-b)[0];return patch(start,start+duration,priority);
  }
  const api={dayNumber,dateKey,minutes,stamp,split,range,patch,nearestFree};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DaylineTimeline=api;
})(typeof window!=='undefined'?window:globalThis);
