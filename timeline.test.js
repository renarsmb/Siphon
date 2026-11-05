const assert=require('node:assert/strict'),T=require('./timeline.js');
const plan=(id,start,end,priority=2)=>({id,plan_date:start.slice(0,10),start_time:start.slice(11),end_date:end.slice(0,10),end_time:end.slice(11),priority});
const original=plan('a','2026-11-03 14:00','2026-11-03 15:00');
assert.deepEqual(T.split(T.stamp('2026-03-29','03:30')),{date:'2026-03-29',time:'03:30'});
assert.equal(T.stamp('2026-03-30','03:30')-T.stamp('2026-03-29','03:30'),1440);
assert.deepEqual(T.patch(T.stamp('2026-11-03','23:30'),T.stamp('2026-11-04','01:30'),1),{plan_date:'2026-11-03',start_time:'23:30',end_date:'2026-11-04',end_time:'01:30',priority:1});
const occupied=[plan('b','2026-11-03 13:00','2026-11-03 16:00'),plan('c','2026-11-03 16:00','2026-11-03 17:00')];
let next=T.nearestFree(original,occupied,2,T.stamp('2026-11-03','14:00'),'2026-11-02');
assert.equal(next.start_time,'12:00');assert.equal(next.end_time,'13:00');
next=T.nearestFree(original,occupied,1,T.stamp('2026-11-03','14:00'),'2026-11-02');assert.equal(next.start_time,'14:00');
assert.equal(T.nearestFree(original,[plan('b','2026-11-02 00:00','2026-11-09 00:00')],2,T.stamp('2026-11-03','14:00'),'2026-11-02'),null);
next=T.nearestFree(original,[{...occupied[0],status:'postponed'}],2,T.stamp('2026-11-03','14:00'),'2026-11-02');assert.equal(next.start_time,'14:00');
// The candidate calculation must not mutate stored plans before explicit Save.
const before=JSON.stringify(original);T.patch(T.range(original).start+30,T.range(original).end+30,4);assert.equal(JSON.stringify(original),before);
console.log('Timeline checks passed: DST, overnight ranges, nearest gaps, full week, priority isolation, no mutation.');
