const fs = require('fs');
const vm = require('vm');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname,'..','scheduler-v2.js'),'utf8');

function makeCtx(custom={}) {
  const ctx = {
    console,
    Date,
    JSON,
    Math,
    Set,
    Map,
    Intl,
    parseInt,
    Number,
    String,
    Array,
    Object,
    Infinity,
    window: null,
    setTimeout(){ return 0; }, clearTimeout(){},
    document: { getElementById(){return null;}, createElement(){return {style:{}, innerHTML:'', querySelector(){return {onclick:null,textContent:''};}, appendChild(){}, setAttribute(){}, classList:{add(){},remove(){}}};}, body:{appendChild(){}} },
    showToast(){}, logKoy(){}, save(){}, tabloyuOlustur(){}, refreshUI(){}, closeModal(){}, saveStateToHistory(){},
    database:{ref(){return {once(){return Promise.resolve({exists(){return false;}})},update(){},set(){},on(){}}}},
    firebase:{auth(){return {currentUser:null}}},
    isAdmin:true,
    hariciIzinler:[],
    formatTarih(t){return t||'';},
    getDateKey(d){const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;},
    getMonday(d){ const x=new Date(d); x.setHours(12,0,0,0); const day=x.getDay(); const diff=(day===0?-6:1-day); x.setDate(x.getDate()+diff); return x; },
    currentMonday:new Date('2026-09-14T12:00:00'),
    GUNLER:['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'],
    SHIFTS:{SABAH:'06:30–16:00',GUNDUZ:'09:00–18:00',OGLEN:'12:00–20:00',AKSAM:'16:00–00:00',GECE:'00:00–07:00',IZIN:'İZİNLİ',BOS:'BOŞ',YILLIK:'YILLIK İZİN',RAPOR:'RAPORLU'},
    state:null,
    enterSystem(){}, vardiyaSecimiAc(){}, geciciBirimAta(){}, talepIslem(){}, drop(){}, vardiyaAta(){},
  };
  ctx.window=ctx;
  Object.assign(ctx, custom);
  vm.createContext(ctx);
  vm.runInContext(code, ctx, {filename:'scheduler-v2.js'});
  return ctx;
}

function baseState(people, units, shifts) {
  return {
    birimler:units,
    saatler:shifts,
    personeller:people,
    kapasite:{},
    manuelAtamalar:{},
    haftaIciSabitler:{}, haftaSonuYedekler:{},
    mcrAyarlari:{baslangicTarihi:'2026-09-14',ofsetler:{}},
    geciciGorevler:{}, logs:[], duyuruMetni:'', birimAyarlari:{}, saatAyarlari:{}, gorunum:{}
  };
}
function setCap(st,u,s,arr){st.kapasite[`${u}_${s}`]=arr;}
function assert(cond,msg){if(!cond) throw new Error('ASSERT: '+msg);}

// T1 exact capacity + 2 consecutive off, deterministic
{
  const unit='PLAYOUT OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=Array.from({length:7},(_,i)=>({ad:`P${i+1}`,birim:unit,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[unit],[m,e]);
  st.birimAyarlari[unit]={tip:'HAVUZ',renk:'#000'};
  setCap(st,unit,m,[3,3,3,3,3,3,3]); setCap(st,unit,e,[2,2,2,2,2,2,2]);
  const ctx=makeCtx({state:st});
  let r=ctx.SchedulerV2.solveSchedule({full:true,units:[unit]});
  assert(r.ok,'T1 solve');
  // exact 5/day
  for(let d=0;d<7;d++){
    const a=people.filter(p=>r.work.matrix[p.ad][d]===m).length;
    const b=people.filter(p=>r.work.matrix[p.ad][d]===e).length;
    assert(a===3 && b===2,`T1 cap day ${d}: ${a}/${b}`);
  }
  const snap=JSON.stringify(r.work.matrix);
  let r2=ctx.SchedulerV2.solveSchedule({full:true,units:[unit]});
  assert(r2.ok,'T1 repeat');
  assert(JSON.stringify(r2.work.matrix)===snap,'T1 deterministic');
  console.log('T1 PASS exact+deterministic',r.unitPhases);
}

// T2 rest: previous-day evening cannot go early next day
{
  const unit='PLAYOUT OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=[1,2,3].map(i=>({ad:`R${i}`,birim:unit,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[unit],[m,e]); st.birimAyarlari[unit]={tip:'HAVUZ'};
  setCap(st,unit,m,[1,1,1,1,1,1,1]); setCap(st,unit,e,[1,1,1,1,1,1,1]);
  st.manuelAtamalar['2026-09-14_R1_0']=e;
  st.schedulerV2={manualLocks:{'2026-09-14_R1_0':true},assignmentSource:{'2026-09-14_R1_0':'MANUAL_V62'},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:5,maxWorkDays:6}};
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[unit]});
  assert(r.ok,'T2 solve');
  assert(r.work.matrix.R1[1]!==m,'T2 rest blocked');
  console.log('T2 PASS rest',r.work.matrix.R1);
}

// T3 expertise: cross-unit only specialist can fill
{
  const u='PLAYOUT OPERATÖRÜ', other='KJ OPERATÖRÜ', m='06:30–16:00';
  const people=[
    {ad:'A',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[0]},
    {ad:'B',birim:other,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'C',birim:other,uzmanlik:['KJ'],izinGunleri:[]},
  ];
  const st=baseState(people,[u,other],[m]); st.birimAyarlari[u]={tip:'HAVUZ'}; st.birimAyarlari[other]={tip:'HAVUZ'};
  st.schedulerV2={manualLocks:{},assignmentSource:{},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:1,minWorkDays:1,maxWorkDays:6}};
  setCap(st,u,m,[1,1,1,1,1,1,1]); setCap(st,other,m,[0,0,0,0,0,0,0]);
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T3 solve');
  assert(r.work.matrix.B[0]===m,'T3 specialist B assigned');
  assert(r.work.matrix.C[0]!==m,'T3 non-specialist C not assigned');
  console.log('T3 PASS expertise',r.work.matrix);
}

// T4 MCR continuity: same specialist replaces absent operator across contiguous absence
{
  const u='24TV MCR OPERATÖRÜ', src='PLAYOUT OPERATÖRÜ';
  const mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[
    {ad:'M1',birim:u,izinGunleri:[0,1,2]},
    {ad:'M2',birim:u,izinGunleri:[]},
    {ad:'M3',birim:u,izinGunleri:[]},
    {ad:'M4',birim:u,izinGunleri:[]},
    {ad:'SUB',birim:src,uzmanlik:['24 MCR'],izinGunleri:[]},
    {ad:'NOSPEC',birim:src,uzmanlik:['PLAYOUT'],izinGunleri:[]},
  ];
  const st=baseState(people,[u,src],[mo,ev,ni]);
  st.birimAyarlari[u]={tip:'DONGU8'}; st.birimAyarlari[src]={tip:'HAVUZ'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{M1:0,M2:2,M3:4,M4:6}};
  // one slot each relevant shift each day (cycle-like); src no demand
  setCap(st,u,mo,[1,1,1,1,1,1,1]); setCap(st,u,ev,[1,1,1,1,1,1,1]); setCap(st,u,ni,[1,1,1,1,1,1,1]);
  setCap(st,src,mo,[0,0,0,0,0,0,0]); setCap(st,src,ev,[0,0,0,0,0,0,0]); setCap(st,src,ni,[0,0,0,0,0,0,0]);
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  // Capacity is intentionally too high for 4 MCR + sub (21 slots) vs max 6*5=30, possible, but rest may constrain.
  assert(r.ok,'T4 solve');
  const reps=Object.values(r.work.replacements);
  assert(reps.some(x=>x.absent==='M1' && x.substitute==='SUB'),'T4 same specialist replacement');
  console.log('T4 PASS MCR replacement',reps);
}


// T5 local reopt: only target unit work assignments are changed; other unit work remains frozen
{
  const u1='PLAYOUT OPERATÖRÜ', u2='KJ OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=[];
  for(let i=1;i<=4;i++) people.push({ad:`A${i}`,birim:u1,uzmanlik:['PLAYOUT'],izinGunleri:[]});
  for(let i=1;i<=4;i++) people.push({ad:`B${i}`,birim:u2,uzmanlik:['KJ'],izinGunleri:[]});
  const st=baseState(people,[u1,u2],[m,e]); st.birimAyarlari[u1]={tip:'HAVUZ'}; st.birimAyarlari[u2]={tip:'HAVUZ'};
  setCap(st,u1,m,[1,1,1,1,1,1,1]); setCap(st,u1,e,[1,1,1,1,1,1,1]);
  setCap(st,u2,m,[1,1,1,1,1,1,1]); setCap(st,u2,e,[1,1,1,1,1,1,1]);
  const ctx=makeCtx({state:st});
  const full=ctx.SchedulerV2.solveSchedule({full:true,units:[u1,u2]});
  assert(full.ok,'T5 full solve');
  st.schedulerV2=st.schedulerV2||{}; st.schedulerV2.manualLocks={}; st.schedulerV2.assignmentSource={}; st.schedulerV2.manualUnitLocks={}; st.schedulerV2.tempUnitSource={}; st.schedulerV2.mcrReplacements={}; st.schedulerV2.config={preferredWorkDays:5,maxWorkDays:6};
  for(const p of people){for(let d=0;d<7;d++){const k=`2026-09-14_${p.ad}_${d}`;st.manuelAtamalar[k]=full.work.matrix[p.ad][d];st.schedulerV2.assignmentSource[k]='AUTO_V62';}}
  const beforeB={}; for(const p of people.filter(x=>x.birim===u2)) beforeB[p.ad]=full.work.matrix[p.ad].slice();
  // Find a working A on Monday and lock it OFF
  const pa=people.find(p=>p.birim===u1 && [m,e].includes(full.work.matrix[p.ad][0]));
  ctx.SchedulerV2.markManualAssignment(pa.ad,0,'İZİNLİ','MANUAL_V62');
  const local=ctx.SchedulerV2.solveSchedule({full:false,units:[u1]});
  assert(local.ok,'T5 local solve');
  for(const p of people.filter(x=>x.birim===u2)){
    for(let d=0;d<7;d++){
      const old=beforeB[p.ad][d], now=local.work.matrix[p.ad][d];
      if([m,e].includes(old)) assert(now===old,`T5 frozen ${p.ad} d${d}`);
    }
  }
  assert(local.work.matrix[pa.ad][0]==='İZİNLİ','T5 manual lock preserved');
  console.log('T5 PASS local-only reopt');
}

// T6 impossible hard overcapacity must fail instead of overwriting capacity
{
  const u='24TV MCR OPERATÖRÜ', m='07:00–16:00';
  const people=[1,2].map(i=>({ad:`X${i}`,birim:u,izinGunleri:[]}));
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'DONGU8'}; st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{X1:0,X2:2}}; setCap(st,u,m,[1,0,0,0,0,0,0]);
  st.manuelAtamalar={'2026-09-14_X1_0':m,'2026-09-14_X2_0':m};
  st.schedulerV2={manualLocks:{'2026-09-14_X1_0':true,'2026-09-14_X2_0':true},assignmentSource:{},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:5,maxWorkDays:6}};
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(!r.ok,'T6 must fail');
  console.log('T6 PASS hard capacity failure',r.errors[0]);
}


// T7 fairness: if exact capacity can be met with balanced workload, same-unit gap must be <= 1.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=Array.from({length:7},(_,i)=>({ad:`F${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[u],[m,e]); st.birimAyarlari[u]={tip:'HAVUZ'};
  // 35 weekly slots / 7 people = exactly 5 days each.
  setCap(st,u,m,[3,3,3,3,3,3,3]); setCap(st,u,e,[2,2,2,2,2,2,2]);
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T7 solve');
  const counts=people.map(p=>r.work.matrix[p.ad].filter(v=>[m,e].includes(v)).length);
  assert(Math.max(...counts)-Math.min(...counts)<=1,`T7 unfair counts ${counts.join(',')}`);
  assert(counts.every(x=>x===5),`T7 expected all 5 days ${counts.join(',')}`);
  console.log('T7 PASS weekly fairness',counts);
}


// T8 previous-week rotation: same people should not receive an identical weekly matrix when alternatives exist.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=Array.from({length:7},(_,i)=>({ad:`W${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[u],[m,e]); st.birimAyarlari[u]={tip:'HAVUZ'};
  setCap(st,u,m,[3,3,3,3,3,3,3]); setCap(st,u,e,[2,2,2,2,2,2,2]);

  // Önce 7 Eylül haftasını üret ve tarihçeye yaz.
  const c1=makeCtx({state:st,currentMonday:new Date('2026-09-07T12:00:00')});
  const w1=c1.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(w1.ok,'T8 week1 solve');
  for(const p of people){for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-07_${p.ad}_${d}`]=w1.work.matrix[p.ad][d];}

  // Sonraki hafta aynı kapasiteyle önceki hafta kopyalanmamalı.
  const c2=makeCtx({state:st,currentMonday:new Date('2026-09-14T12:00:00')});
  const w2=c2.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(w2.ok,'T8 week2 solve');
  let same=0,total=0;
  for(const p of people){for(let d=0;d<7;d++){total++; if(w1.work.matrix[p.ad][d]===w2.work.matrix[p.ad][d]) same++;}}
  assert(same < total,`T8 identical week ${same}/${total}`);
  assert(JSON.stringify(w1.work.matrix)!==JSON.stringify(w2.work.matrix),'T8 matrix must rotate');
  console.log('T8 PASS previous-week rotation',`${same}/${total} exact same cells`);
}

// T9 min-5 + weekend morning preference: hard available person must reach 5 days when weekly capacity permits.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00', e='16:00–00:00';
  const people=Array.from({length:5},(_,i)=>({ad:`M${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  // M1 has two fixed off weekdays, so its only way to reach 5 is to work Wed-Sun; weekend slots are morning only.
  people[0].izinGunleri=[0,1];
  const st=baseState(people,[u],[m,e]); st.birimAyarlari[u]={tip:'HAVUZ'};
  setCap(st,u,m,[2,2,2,2,1,3,3]); // 15
  setCap(st,u,e,[2,2,2,2,2,0,0]); // 10 => total 25 = 5x5
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T9 solve');
  const counts=people.map(p=>r.work.matrix[p.ad].filter(v=>[m,e].includes(v)).length);
  assert(counts.every(x=>x===5),`T9 min5 ${counts.join(',')}`);
  assert(r.work.matrix.M1[5]===m && r.work.matrix.M1[6]===m,`T9 weekend morning M1 ${r.work.matrix.M1[5]} / ${r.work.matrix.M1[6]}`);
  console.log('T9 PASS min5 + weekend morning',counts,r.work.matrix.M1);
}

// T10 fixed weekday staff: weekends are hard off by default, selected reserves are still not used if normal pool is enough.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const fixed=[1,2].map(i=>({ad:`S${i}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const normals=Array.from({length:5},(_,i)=>({ad:`N${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const people=[...fixed,...normals];
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'HAVUZ'};
  st.haftaIciSabitler={S1:m,S2:m}; st.haftaSonuYedekler={S1:true};
  setCap(st,u,m,[5,5,5,5,5,5,5]);
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T10a solve');
  assert(r.work.matrix.S1[5]==='İZİNLİ' && r.work.matrix.S1[6]==='İZİNLİ','T10a selected reserve must not be used unless needed');
  assert(r.work.matrix.S2[5]==='İZİNLİ' && r.work.matrix.S2[6]==='İZİNLİ','T10a nonreserve weekend hard off');
  console.log('T10a PASS fixed weekend off / reserve last-resort');
}

// T10b weekend capacity shortage: only selected fixed-weekday reserves may be used, in 6-day fallback.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const fixed=[1,2].map(i=>({ad:`R${i}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const normals=Array.from({length:6},(_,i)=>({ad:`Q${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const people=[...fixed,...normals];
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'HAVUZ'};
  st.haftaIciSabitler={R1:m,R2:m}; st.haftaSonuYedekler={R1:true,R2:true};
  // 40 exact slots: weekdays 28, weekend 12. Q1 is hard annual leave Thu-Sun (target 3).
  setCap(st,u,m,[6,6,6,5,5,6,6]);
  const leaves=[{durum:'onaylandı',personel_adi:'Q1',baslangic_tarihi:'2026-09-17',bitis_tarihi:'2026-09-20'}];
  const ctx=makeCtx({state:st,hariciIzinler:leaves});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T10b solve');
  const reserveWeekend=[r.work.matrix.R1[5],r.work.matrix.R1[6],r.work.matrix.R2[5],r.work.matrix.R2[6]].filter(v=>v===m).length;
  assert(reserveWeekend===2,`T10b expected two reserve weekend person-days, got ${reserveWeekend}`);
  assert(r.work.matrix.Q1.slice(3).every(v=>v==='YILLIK İZİN'),'T10b annual lock Q1 Thu-Sun');
  for(const n of normals.slice(1)) assert(r.work.matrix[n.ad].filter(v=>v===m).length>=5,`T10b ${n.ad} min5`);
  console.log('T10b PASS selected weekend reserves fill shortage only',reserveWeekend);
}

// T11 external approved annual leave is a hard lock and exact capacity is solved around it.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const people=Array.from({length:7},(_,i)=>({ad:`A${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'HAVUZ'}; setCap(st,u,m,[5,5,5,5,5,5,5]);
  const leaves=[{durum:'onaylandı',personel_adi:'A1',baslangic_tarihi:'2026-09-18',bitis_tarihi:'2026-09-20'}];
  const ctx=makeCtx({state:st,hariciIzinler:leaves});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T11 solve');
  assert(r.work.matrix.A1[4]==='YILLIK İZİN' && r.work.matrix.A1[5]==='YILLIK İZİN' && r.work.matrix.A1[6]==='YILLIK İZİN','T11 external leave preserved');
  for(let d=0;d<7;d++) assert(people.filter(p=>r.work.matrix[p.ad][d]===m).length===5,`T11 exact cap d${d}`);
  console.log('T11 PASS external annual hard lock + exact capacity');
}

// T12 realtime/source tracking layer writes approved external leave as ANNUAL_EXTERNAL hard locks.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const people=[{ad:'EXT PERSONEL',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}];
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'HAVUZ'};
  const ctx=makeCtx({state:st});
  const rec=[{durum:'onaylandı',personel_adi:'EXT PERSONEL',baslangic_tarihi:'2026-09-15',bitis_tarihi:'2026-09-16'}];
  const out=ctx.SchedulerV2.applyExternalAnnualLocks(rec,{reoptimize:false});
  assert(out.count===2,'T12 two lock days');
  assert(st.manuelAtamalar['2026-09-14_EXT PERSONEL_1']==='YILLIK İZİN','T12 Tue lock');
  assert(st.manuelAtamalar['2026-09-14_EXT PERSONEL_2']==='YILLIK İZİN','T12 Wed lock');
  assert(st.schedulerV2.assignmentSource['2026-09-14_EXT PERSONEL_1']==='ANNUAL_EXTERNAL','T12 source tracking');
  console.log('T12 PASS external annual source tracking');
}



// T13 pool capacity is a FLOOR: MIN5 may add the minimum extra staff above base capacity.
{
  const u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const people=Array.from({length:7},(_,i)=>({ad:`E${i+1}`,birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]}));
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'HAVUZ'};
  // Base capacity 4/day = 28 slots. MIN5 needs 35 person-days, so exactly 7 controlled extras are required.
  setCap(st,u,m,[4,4,4,4,4,4,4]);
  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T13 solve');
  const counts=people.map(p=>r.work.matrix[p.ad].filter(v=>v===m).length);
  assert(counts.every(x=>x===5),`T13 min5 ${counts.join(',')}`);
  let total=0;
  for(let d=0;d<7;d++){
    const actual=people.filter(p=>r.work.matrix[p.ad][d]===m).length;
    assert(actual>=4,`T13 floor d${d} actual ${actual}`);
    total+=actual;
  }
  assert(total===35,`T13 extras minimized total ${total}`);
  console.log('T13 PASS capacity floor + controlled MIN5 extras',counts,total);
}

// T14 full-week approved MCR annual leave: one qualified cross-unit substitute must cover the absent operator consistently.
{
  const u='24TV MCR OPERATÖRÜ', src='PLAYOUT OPERATÖRÜ';
  const mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[
    {ad:'AM1',birim:u,izinGunleri:[]},
    {ad:'AM2',birim:u,izinGunleri:[]},
    {ad:'AM3',birim:u,izinGunleri:[]},
    {ad:'AM4',birim:u,izinGunleri:[]},
    {ad:'ASUB',birim:src,uzmanlik:['24 MCR'],izinGunleri:[]},
  ];
  const st=baseState(people,[u,src],[mo,ev,ni]);
  st.birimAyarlari[u]={tip:'DONGU8'}; st.birimAyarlari[src]={tip:'HAVUZ'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{AM1:0,AM2:2,AM3:4,AM4:6}};
  setCap(st,u,mo,[1,1,1,1,1,1,1]); setCap(st,u,ev,[1,1,1,1,1,1,1]); setCap(st,u,ni,[1,1,1,1,1,1,1]);
  setCap(st,src,mo,[0,0,0,0,0,0,0]); setCap(st,src,ev,[0,0,0,0,0,0,0]); setCap(st,src,ni,[0,0,0,0,0,0,0]);
  const leaves=[{durum:'onaylandı',personel_adi:'AM1',baslangic_tarihi:'2026-09-14',bitis_tarihi:'2026-09-20'}];
  const ctx=makeCtx({state:st,hariciIzinler:leaves});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T14 solve');
  assert(r.work.matrix.AM1.every(v=>v==='YILLIK İZİN'),'T14 annual hard lock full week');
  const reps=Object.values(r.work.replacements).filter(x=>x.absent==='AM1');
  assert(reps.length===1 && reps[0].substitute==='ASUB','T14 same qualified substitute');
  console.log('T14 PASS MCR full-week annual cover',reps[0]);
}

// T15 no qualified MCR substitute: annual leave remains hard and solver must fail clearly rather than use unqualified staff.
{
  const u='24TV MCR OPERATÖRÜ', src='PLAYOUT OPERATÖRÜ';
  const mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[
    {ad:'BM1',birim:u,izinGunleri:[]},{ad:'BM2',birim:u,izinGunleri:[]},{ad:'BM3',birim:u,izinGunleri:[]},{ad:'BM4',birim:u,izinGunleri:[]},
    {ad:'NOQUAL',birim:src,uzmanlik:['PLAYOUT'],izinGunleri:[]},
  ];
  const st=baseState(people,[u,src],[mo,ev,ni]); st.birimAyarlari[u]={tip:'DONGU8'}; st.birimAyarlari[src]={tip:'HAVUZ'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{BM1:0,BM2:2,BM3:4,BM4:6}};
  setCap(st,u,mo,[1,1,1,1,1,1,1]); setCap(st,u,ev,[1,1,1,1,1,1,1]); setCap(st,u,ni,[1,1,1,1,1,1,1]);
  setCap(st,src,mo,[0,0,0,0,0,0,0]); setCap(st,src,ev,[0,0,0,0,0,0,0]); setCap(st,src,ni,[0,0,0,0,0,0,0]);
  const leaves=[{durum:'onaylandı',personel_adi:'BM1',baslangic_tarihi:'2026-09-14',bitis_tarihi:'2026-09-20'}];
  const ctx=makeCtx({state:st,hariciIzinler:leaves});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(!r.ok,'T15 must fail');
  assert((r.errors||[]).some(x=>String(x).includes('uzman yedeği')||String(x).includes('uygun personel')),'T15 clear qualified backup failure');
  console.log('T15 PASS no unqualified MCR replacement',r.errors[0]);
}

console.log('ALL TESTS PASS');

// T16 Excel/KAMERAMAN preserve: V62 full solve must not touch camera rows or use them as MIN5 pool.
{
  const cam='24 TV - 360 TV KAMERAMANLAR', u='PLAYOUT OPERATÖRÜ', m='06:30–16:00';
  const people=[
    {ad:'CAM1',birim:cam,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'P1',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'P2',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'P3',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'P4',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]},
    {ad:'P5',birim:u,uzmanlik:['PLAYOUT'],izinGunleri:[]},
  ];
  const st=baseState(people,[cam,u],[m]); st.birimAyarlari[cam]={tip:'HAVUZ'}; st.birimAyarlari[u]={tip:'HAVUZ'};
  setCap(st,cam,m,[1,1,1,1,1,1,1]); setCap(st,u,m,[1,1,1,1,1,1,1]);
  for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-14_CAM1_${d}`] = d<5 ? m : 'İZİNLİ';
  const ctx=makeCtx({state:st});
  assert(ctx.SchedulerV2.isLegacyExternalUnit(cam),'T16 camera recognized legacy');
  const managed=ctx.SchedulerV2.autoManagedUnits(st.birimler);
  assert(managed.length===1 && managed[0]===u,'T16 camera excluded from managed units');
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:st.birimler});
  assert(r.ok,'T16 solve');
  const got=r.work.matrix.CAM1;
  assert(got[0]===m && got[4]===m && got[5]==='İZİNLİ' && got[6]==='İZİNLİ','T16 camera Excel rows preserved');
  console.log('T16 PASS camera/excel preserve',got);
}

// T17 Manual leave must remain hard even when exact capacity cannot be covered.
{
  const u='24TV MCR OPERATÖRÜ', m='07:00–16:00';
  const people=[{ad:'M1',birim:u,izinGunleri:[]}];
  const st=baseState(people,[u],[m]); st.birimAyarlari[u]={tip:'DONGU8'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{M1:0}};
  setCap(st,u,m,[1,0,0,0,0,0,0]);
  st.manuelAtamalar['2026-09-14_M1_0']=m;
  st.schedulerV2={manualLocks:{},assignmentSource:{'2026-09-14_M1_0':'AUTO_V62'},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:5,minWorkDays:5,maxWorkDays:6}};
  const ctx=makeCtx({state:st});
  ctx.vardiyaAta('M1',0,'İZİNLİ');
  assert(st.manuelAtamalar['2026-09-14_M1_0']==='İZİNLİ','T17 leave preserved after reopt failure');
  assert(st.schedulerV2.manualLocks['2026-09-14_M1_0']===true,'T17 leave remains manual hard lock');
  console.log('T17 PASS manual leave preserved on capacity shortage');
}

// T18 Units with zero configured weekly capacity are preserved and do not block global OTO scheduling.
{
  const core='PLAYOUT OPERATÖRÜ', ext='24 TV REKLAM AKIŞ', m='06:30–16:00';
  const people=[
    ...Array.from({length:5},(_,i)=>({ad:`CORE${i+1}`,birim:core,uzmanlik:['PLAYOUT'],izinGunleri:[]})),
    {ad:'EXT1',birim:ext,izinGunleri:[]},{ad:'EXT2',birim:ext,izinGunleri:[]}
  ];
  const st=baseState(people,[core,ext],[m]); st.birimAyarlari[core]={tip:'HAVUZ'}; st.birimAyarlari[ext]={tip:'HAVUZ'};
  setCap(st,core,m,[4,4,4,4,4,4,4]); // ext intentionally has NO capacity definition
  for(let d=0;d<5;d++) st.manuelAtamalar[`2026-09-14_EXT1_${d}`]=m;
  for(let d=0;d<5;d++) st.manuelAtamalar[`2026-09-14_EXT2_${d}`]=m;
  const ctx=makeCtx({state:st});
  assert(ctx.SchedulerV2.isNoCapacityPreservedUnit(ext),'T18 zero-cap unit recognized as preserved');
  const managed=ctx.SchedulerV2.autoManagedUnits(st.birimler);
  assert(managed.length===1 && managed[0]===core,'T18 only configured-capacity unit managed');
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:st.birimler});
  assert(r.ok,'T18 global solve must ignore zero-cap support unit');
  assert(r.work.matrix.EXT1[0]===m && r.work.matrix.EXT1[4]===m,'T18 existing support schedule frozen in work state');
  console.log('T18 PASS zero-capacity support unit preserved / no MIN5 global failure');
}

// T19 Any unit imported from Excel can be frozen for that week, not only KAMERAMAN.
{
  const core='PLAYOUT OPERATÖRÜ', excelUnit='24TV - 360TV BİLGİ İŞLEM', m='06:30–16:00';
  const people=[
    ...Array.from({length:5},(_,i)=>({ad:`P${i+1}`,birim:core,uzmanlik:['PLAYOUT'],izinGunleri:[]})),
    {ad:'IT1',birim:excelUnit,izinGunleri:[]},{ad:'IT2',birim:excelUnit,izinGunleri:[]}
  ];
  const st=baseState(people,[core,excelUnit],[m]); st.birimAyarlari[core]={tip:'HAVUZ'}; st.birimAyarlari[excelUnit]={tip:'HAVUZ'};
  setCap(st,core,m,[4,4,4,4,4,4,4]); setCap(st,excelUnit,m,[1,1,1,1,1,1,1]);
  for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-14_IT1_${d}`]=d<5?m:'İZİNLİ';
  const ctx=makeCtx({state:st});
  ctx.SchedulerV2.markExternalUnitWeek(excelUnit,'2026-09-14');
  assert(ctx.SchedulerV2.isLegacyExternalUnit(excelUnit),'T19 Excel-imported unit flagged for week');
  const managed=ctx.SchedulerV2.autoManagedUnits(st.birimler);
  assert(managed.length===1 && managed[0]===core,'T19 Excel unit excluded despite configured capacity');
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:st.birimler});
  assert(r.ok,'T19 solve');
  assert(r.work.matrix.IT1[0]===m && r.work.matrix.IT1[5]==='İZİNLİ','T19 Excel list preserved');
  console.log('T19 PASS arbitrary Excel-imported unit preserved for current week');
}

// T20 Manual leave on a preserved/no-capacity unit must be accepted without trying to regenerate the whole unit.
{
  const ext='24 TV REKLAM AKIŞ', m='06:30–16:00';
  const people=[{ad:'E1',birim:ext,izinGunleri:[]}];
  const st=baseState(people,[ext],[m]); st.birimAyarlari[ext]={tip:'HAVUZ'};
  st.manuelAtamalar['2026-09-14_E1_0']=m;
  const ctx=makeCtx({state:st});
  ctx.vardiyaAta('E1',0,'İZİNLİ');
  assert(st.manuelAtamalar['2026-09-14_E1_0']==='İZİNLİ','T20 leave retained');
  assert(st.schedulerV2.manualLocks['2026-09-14_E1_0']===true,'T20 leave hard lock');
  console.log('T20 PASS preserved unit manual leave accepted without global solve');
}

console.log('FIX6 EXTENDED TESTS PASS');

// T21 MCR strict cycle: zero capacity table must NOT preserve/skip the unit; date+offset cycle is authoritative.
{
  const u='24TV MCR OPERATÖRÜ', mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[0,2,4,6].map((off,i)=>({ad:`C${i+1}`,birim:u,izinGunleri:[]}));
  const st=baseState(people,[u],[mo,ev,ni]);
  st.birimAyarlari[u]={tip:'DONGU8'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{C1:0,C2:2,C3:4,C4:6}};
  // deliberately NO capacity rows
  const ctx=makeCtx({state:st});
  assert(ctx.SchedulerV2.autoManagedUnits([u]).includes(u),'T21 cycle must be auto-managed without capacity');
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T21 solve');
  for(const p of people){
    for(let d=0;d<7;d++){
      const exp=ctx.SchedulerV2.cycleExpectedShift(p,u,d);
      assert(r.work.matrix[p.ad][d]===exp,`T21 ${p.ad} d${d}: ${r.work.matrix[p.ad][d]} != ${exp}`);
    }
  }
  assert(r.unitPhases[u]==='SABIT_DONGU_KILIDI','T21 strict cycle phase');
  console.log('T21 PASS strict MCR cycle / zero-capacity independent');
}

// T22 Previous-week history must never rotate/change MCR cycle.
{
  const u='24TV MCR OPERATÖRÜ', mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[0,2,4,6].map((off,i)=>({ad:`RMC${i+1}`,birim:u,izinGunleri:[]}));
  const st=baseState(people,[u],[mo,ev,ni]);
  st.birimAyarlari[u]={tip:'DONGU8'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{RMC1:0,RMC2:2,RMC3:4,RMC4:6}};
  // Put deliberately misleading previous-week history.
  for(const p of people) for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-07_${p.ad}_${d}`]=mo;
  const ctx=makeCtx({state:st,currentMonday:new Date('2026-09-14T12:00:00')});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T22 solve');
  for(const p of people) for(let d=0;d<7;d++) assert(r.work.matrix[p.ad][d]===ctx.SchedulerV2.cycleExpectedShift(p,u,d),`T22 cycle rotated ${p.ad} d${d}`);
  console.log('T22 PASS previous-week rotation cannot alter MCR');
}

// T23 Annual/manual absence only replaces the missing MCR slots; all other cycle operators remain untouched.
{
  const u='24TV MCR OPERATÖRÜ', src='PLAYOUT OPERATÖRÜ', mo='07:00–16:00', ev='16:00–00:00', ni='00:00–07:00';
  const people=[
    {ad:'A1',birim:u,izinGunleri:[]},{ad:'A2',birim:u,izinGunleri:[]},{ad:'A3',birim:u,izinGunleri:[]},{ad:'A4',birim:u,izinGunleri:[]},
    {ad:'BACKUP',birim:src,uzmanlik:['24 MCR'],izinGunleri:[]}
  ];
  const st=baseState(people,[u,src],[mo,ev,ni]);
  st.birimAyarlari[u]={tip:'DONGU8'}; st.birimAyarlari[src]={tip:'HAVUZ'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{A1:0,A2:2,A3:4,A4:6}};
  const leaves=[{durum:'onaylandı',personel_adi:'A1',baslangic_tarihi:'2026-09-14',bitis_tarihi:'2026-09-16'}];
  const ctx=makeCtx({state:st,hariciIzinler:leaves});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T23 solve');
  for(const name of ['A2','A3','A4']){
    const p=people.find(x=>x.ad===name);
    for(let d=0;d<7;d++) assert(r.work.matrix[name][d]===ctx.SchedulerV2.cycleExpectedShift(p,u,d),`T23 changed unaffected ${name} d${d}`);
  }
  for(let d=0;d<=2;d++){
    const exp=ctx.SchedulerV2.cycleExpectedShift(people[0],u,d);
    assert(r.work.matrix.A1[d]==='YILLIK İZİN',`T23 annual lock A1 d${d}`);
    if(exp!=='İZİNLİ') assert(r.work.matrix.BACKUP[d]===exp,`T23 backup shift d${d}`);
  }
  console.log('T23 PASS leave replaces only missing MCR slots / others unchanged');
}

// T24 INGEST user-defined weekly 3-person rotation.
// Roles for offsets 0/2/4 on base week:
// A = [Pzt SABAH, Sal-Cars AKSAM, Per-Cum IZIN, Cmt-Paz SABAH]
// B = [Pzt AKSAM, Sal-Cars IZIN, Per-Cum SABAH, Cmt-Paz AKSAM]
// C = [Pzt IZIN, Sal-Cars SABAH, Per-Cum AKSAM, Cmt-Paz IZIN]
{
  const u='INGEST OPERATÖRÜ', mo='06:30–16:00', ev='16:00–00:00', off='İZİNLİ';
  const people=[
    {ad:'RAMAZAN',birim:u,izinGunleri:[]},
    {ad:'MUSTAFA',birim:u,izinGunleri:[]},
    {ad:'ERCAN',birim:u,izinGunleri:[]}
  ];
  const st=baseState(people,[u],[mo,ev]);
  st.birimAyarlari[u]={tip:'DONGU6'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{RAMAZAN:0,MUSTAFA:2,ERCAN:4}};
  const ctx=makeCtx({state:st,currentMonday:new Date('2026-09-14T12:00:00')});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T24 solve');

  const A=[mo,ev,ev,off,off,mo,mo];
  const B=[ev,off,off,mo,mo,ev,ev];
  const C=[off,mo,mo,ev,ev,off,off];
  assert(JSON.stringify(r.work.matrix.RAMAZAN)===JSON.stringify(A),`T24 role A ${r.work.matrix.RAMAZAN}`);
  assert(JSON.stringify(r.work.matrix.MUSTAFA)===JSON.stringify(B),`T24 role B ${r.work.matrix.MUSTAFA}`);
  assert(JSON.stringify(r.work.matrix.ERCAN)===JSON.stringify(C),`T24 role C ${r.work.matrix.ERCAN}`);

  // Her gün normal modda tam 1 sabah + 1 akşam olmalı.
  for(let d=0;d<7;d++){
    const mc=people.filter(p=>r.work.matrix[p.ad][d]===mo).length;
    const ec=people.filter(p=>r.work.matrix[p.ad][d]===ev).length;
    assert(mc===1 && ec===1,`T24 day${d} coverage ${mc}/${ec}`);
  }
  console.log('T24 PASS INGEST weekly role rotation');
}

// T25 INGEST weekly roles rotate A->B->C->A from one calendar week to the next;
// natural cycle-off cards remain AUTO_CYCLE so UI can show DONGU IZNI.
{
  const u='INGEST OPERATÖRÜ', mo='06:30–16:00', ev='16:00–00:00', off='İZİNLİ';
  const people=[
    {ad:'RAMAZAN',birim:u,izinGunleri:[]},
    {ad:'MUSTAFA',birim:u,izinGunleri:[]},
    {ad:'ERCAN',birim:u,izinGunleri:[]}
  ];
  const mkState=()=>{
    const st=baseState(JSON.parse(JSON.stringify(people)),[u],[mo,ev]);
    st.birimAyarlari[u]={tip:'DONGU6'};
    st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{RAMAZAN:0,MUSTAFA:2,ERCAN:4}};
    return st;
  };
  const c1=makeCtx({state:mkState(),currentMonday:new Date('2026-09-14T12:00:00')});
  const r1=c1.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r1.ok,'T25 week1 solve');
  const c2=makeCtx({state:mkState(),currentMonday:new Date('2026-09-21T12:00:00')});
  const r2=c2.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r2.ok,'T25 week2 solve');

  const A=[mo,ev,ev,off,off,mo,mo];
  const B=[ev,off,off,mo,mo,ev,ev];
  assert(JSON.stringify(r1.work.matrix.RAMAZAN)===JSON.stringify(A),'T25 week1 RAMAZAN role A');
  assert(JSON.stringify(r2.work.matrix.RAMAZAN)===JSON.stringify(B),'T25 week2 RAMAZAN must rotate to role B');

  for(const rr of [r1,r2]) for(let d=0;d<7;d++) {
    if(rr.work.matrix.RAMAZAN[d]===off) assert(rr.work.source.RAMAZAN[d]==='AUTO_V62_CYCLE_LOCK',`T25 off source d${d}`);
  }
  console.log('T25 PASS INGEST A->B->C weekly rotation + cycle-off source');
}

// T26 INGEST annual leave with qualified outside backup: same backup carries the absent person's
// scheduled work slots until return; other two core operators keep their canonical roles.
{
  const u='INGEST OPERATÖRÜ', src='PLAYOUT OPERATÖRÜ', mo='06:30–16:00', ev='16:00–00:00';
  const people=[
    {ad:'I1',birim:u,izinGunleri:[]},
    {ad:'I2',birim:u,izinGunleri:[]},
    {ad:'I3',birim:u,izinGunleri:[]},
    {ad:'BACKUP',birim:src,uzmanlik:['INGEST'],izinGunleri:[]}
  ];
  const st=baseState(people,[u,src],[mo,ev]);
  st.birimAyarlari[u]={tip:'DONGU6'}; st.birimAyarlari[src]={tip:'HAVUZ'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{I1:0,I2:2,I3:4}};
  st.manuelAtamalar={};
  for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-14_I1_${d}`]='YILLIK İZİN';
  st.schedulerV2={manualLocks:{},assignmentSource:{},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:5,maxWorkDays:7}};
  for(let d=0;d<7;d++) st.schedulerV2.assignmentSource[`2026-09-14_I1_${d}`]='ANNUAL_LOCAL';

  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  assert(r.ok,'T26 solve');
  for(let d=0;d<7;d++){
    const exp=ctx.SchedulerV2.cycleExpectedShift(people[0],u,d);
    assert(r.work.matrix.I1[d]==='YILLIK İZİN',`T26 annual d${d}`);
    if(exp!=='İZİNLİ') assert(r.work.matrix.BACKUP[d]===exp,`T26 backup d${d}: ${r.work.matrix.BACKUP[d]} != ${exp}`);
  }
  for(const name of ['I2','I3']){
    const pp=people.find(x=>x.ad===name);
    for(let d=0;d<7;d++) assert(r.work.matrix[name][d]===ctx.SchedulerV2.cycleExpectedShift(pp,u,d),`T26 changed ${name} d${d}`);
  }
  console.log('T26 PASS INGEST same backup preserves absent card/role');
}

// T27 INGEST no-backup full-week absence: the two remaining operators enter 6G/1I emergency mode.
// Mon-Fri = one morning + one evening; Sat = one morning/other off; Sun roles reverse.
{
  const u='INGEST OPERATÖRÜ', mo='06:30–16:00', ev='16:00–00:00', off='İZİNLİ';
  const people=[
    {ad:'I1',birim:u,izinGunleri:[]},
    {ad:'I2',birim:u,izinGunleri:[]},
    {ad:'I3',birim:u,izinGunleri:[]}
  ];
  const st=baseState(people,[u],[mo,ev]);
  st.birimAyarlari[u]={tip:'DONGU6'};
  st.mcrAyarlari={baslangicTarihi:'2026-09-14',ofsetler:{I1:0,I2:2,I3:4}};
  for(let d=0;d<7;d++) st.manuelAtamalar[`2026-09-14_I1_${d}`]='YILLIK İZİN';
  st.schedulerV2={manualLocks:{},assignmentSource:{},manualUnitLocks:{},tempUnitSource:{},mcrReplacements:{},config:{preferredWorkDays:5,maxWorkDays:7}};
  for(let d=0;d<7;d++) st.schedulerV2.assignmentSource[`2026-09-14_I1_${d}`]='ANNUAL_LOCAL';

  const ctx=makeCtx({state:st});
  const r=ctx.SchedulerV2.solveSchedule({full:true,units:[u]});
  console.log('T27 DEBUG',r.ok,r.errors,r.warnings,r.work&&r.work.ingestEmergency,r.work&&r.work.matrix);
  assert(r.ok,'T27 solve');

  for(let d=0;d<5;d++){
    const mc=['I2','I3'].filter(n=>r.work.matrix[n][d]===mo).length;
    const ec=['I2','I3'].filter(n=>r.work.matrix[n][d]===ev).length;
    assert(mc===1 && ec===1,`T27 weekday ${d} ${mc}/${ec}`);
  }
  const satM=['I2','I3'].filter(n=>r.work.matrix[n][5]===mo).length;
  const satO=['I2','I3'].filter(n=>r.work.matrix[n][5]===off).length;
  const sunM=['I2','I3'].filter(n=>r.work.matrix[n][6]===mo).length;
  const sunO=['I2','I3'].filter(n=>r.work.matrix[n][6]===off).length;
  assert(satM===1 && satO===1,'T27 Saturday split');
  assert(sunM===1 && sunO===1,'T27 Sunday split');
  assert(r.work.matrix.I2[5]!==r.work.matrix.I2[6],'T27 weekend must alternate I2');
  assert(r.work.matrix.I3[5]!==r.work.matrix.I3[6],'T27 weekend must alternate I3');
  const c2=['I2','I3'].map(n=>r.work.matrix[n].filter(v=>v===mo||v===ev).length);
  assert(c2[0]===6 && c2[1]===6,`T27 expected 6/6 workdays ${c2}`);
  console.log('T27 PASS INGEST no-backup emergency 6G/1I',c2);
}

console.log('FIX9 INGEST WEEKLY TESTS PASS');
