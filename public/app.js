(function(){
'use strict';
var DAY=864e5, MIN=6e4, WEEK=7*DAY;
var KEY='startline.v1';
var $=function(s,r){return (r||document).querySelector(s);};
var uid=function(){return Math.random().toString(36).slice(2,9);};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
function startOfDay(t){var d=new Date(t);d.setHours(0,0,0,0);return d.getTime();}
function addDays(t,n){var d=new Date(t);d.setDate(d.getDate()+n);return d.getTime();}
function ymd(t){var x=new Date(t);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function parseYmd(s){var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).getTime();}
function fmtDate(s){return new Date(parseYmd(s)).toLocaleDateString(undefined,{day:'numeric',month:'short'});}
function fmtDur(ms){var m=ms/MIN;if(m<1)return '<1 min';if(m<100)return Math.round(m)+' min';return (Math.round(m/6)/10)+' h';}
function fmtClock(ms){var s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function clip(v,n){return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);}

/* ---------- state (stays on this device) ---------- */
function fresh(){return {v:1,stage:null,tasks:[],sessions:[],parked:[],races:[],timer:null,demo:false,pause:null,pauses:[],seen:{},remind:null,style:null};}
function load(){try{var r=localStorage.getItem(KEY);if(r){var o=JSON.parse(r);if(o&&o.v===1&&Array.isArray(o.tasks))return o;}}catch(e){}return null;}
function save(nosync){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}if(!nosync)scheduleSync();}
var S=load();
var ui={ageErr:'',login:false,afterLogin:'',pendingPaid:'',loginErr:'',demoName:'',conflict:null,confirmDelAcct:false,paywall:null,busy:false,payErr:'',confirmCancel:false,tab:'today',len:null,focusTask:'',raceOpen:null,raceForm:null,confirmErase:false,confirmDel:false,draft:{title:'',step:'',when:'',edited:false},reset:false,abort:null,rv:{},gOpen:'',crewOpen:false,lapOpen:{},tourOn:null,tourStep:0,bErr:'',welcomeOff:''};

/* ---------- plan and billing ---------- */
var ENT={nextFreeAt:0,aiFree:false,pro:false,signedIn:false,uid:'',cfg:{provider:'demo',testMode:false,priceLabel:'',trialDays:0,auth:{mode:'demo',googleClientId:''},ai:{ready:false}}};
var TKEY='startline.token',PKEY='startline.pro';
function getTok(){try{return localStorage.getItem(TKEY)||'';}catch(e){return '';}}
function setTok(t){try{if(t)localStorage.setItem(TKEY,t);else localStorage.removeItem(TKEY);}catch(e){}}
function lastPro(){try{return localStorage.getItem(PKEY)==='1';}catch(e){return false;}}
function setLastPro(v){try{if(v)localStorage.setItem(PKEY,'1');else localStorage.removeItem(PKEY);}catch(e){}}
async function api(path,body,signal,method){
  var opt={method:method||(body===undefined?'GET':'POST'),headers:{}};
  var t=getTok();if(t)opt.headers.Authorization='Bearer '+t;
  if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  if(signal)opt.signal=signal;
  var r=await fetch(path,opt),j=null;
  try{j=await r.json();}catch(e){}
  if(!r.ok){var er=new Error((j&&j.message)||'Something went wrong. Please try again.');er.code=(j&&j.error)||('http_'+r.status);if(er.code==='login_required'){setTok('');ENT.signedIn=false;ENT.pro=false;ENT.uid='';}throw er;}
  return j;
}
async function refreshStatus(){
  try{var s=await api('/api/status');ENT.signedIn=!!s.signedIn;ENT.uid=s.uid||'';ENT.pro=!!s.pro;ENT.aiFree=!!s.aiFree;ENT.nextFreeAt=Number(s.nextFreeAt)||0;setLastPro(ENT.pro);if(!s.signedIn&&getTok())setTok('');}
  catch(e){ENT.signedIn=!!getTok();ENT.pro=ENT.signedIn&&lastPro();}
}
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('Could not load the payment window. Check your connection.'));};document.head.appendChild(s);});}
async function confirmPayment(body){
  try{
    var j=await api('/api/billing/confirm',body);
    ENT.pro=true;setLastPro(true);ui.paywall=null;ui.payErr='';render();toast('Pro is on. Thank you.');
  }catch(e){ui.payErr=e.message;render();}
}
async function openRazorpay(r){
  if(!window.Razorpay)await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  await new Promise(function(resolve){
    var rz=new window.Razorpay({key:r.keyId,subscription_id:r.subscriptionId,name:'Startline',description:'Startline Pro',theme:{color:'#111111'},
      handler:function(p){confirmPayment(p).then(resolve,resolve);},
      modal:{ondismiss:function(){resolve();}}});
    rz.open();
  });
}
async function startCheckout(){
  if(ui.busy)return;
  ui.busy=true;ui.payErr='';render();
  try{
    var r=await api('/api/billing/checkout',{});
    if(r.provider==='stripe'&&r.url){location.href=r.url;return;}
    if(r.provider==='razorpay')await openRazorpay(r);
    else await confirmPayment({});
  }catch(e){ui.payErr=e.message||'Could not start checkout.';if(e.code==='login_required'){ui.afterLogin='checkout';ui.login=true;}if(e.code==='already_pro'){await refreshStatus();ui.paywall=null;}}
  ui.busy=false;render();
}
async function managePlan(){
  try{
    var r=await api('/api/billing/portal',{});
    if(r.url){location.href=r.url;return;}
    if(ENT.cfg.provider==='demo'){setTok('');ENT.pro=false;setLastPro(false);toast('Pro turned off (test mode).');}
    else{toast('Cancelled. Pro stays until the end of the period you paid for.');await refreshStatus();}
  }catch(e){toast(e.message);}
  ui.confirmCancel=false;render();
}
async function boot(){
  try{ENT.cfg=await api('/api/config');}catch(e){}
  await refreshStatus();
  var q=new URLSearchParams(location.search);
  if(q.get('paid')){
    var pid=q.get('paid');history.replaceState(null,'',location.pathname);
    if(ENT.signedIn)await confirmPayment({session_id:pid});
    else{ui.pendingPaid=pid;ui.afterLogin='paid';ui.login=true;}
  }else if(q.get('canceled')){history.replaceState(null,'',location.pathname);toast('Checkout canceled. No charge was made.');}
  render();
  pullSync();
}

/* ---------- progress backup ---------- */
var SYNCKEY='startline.sync',syncing=false,syncT=null;
function getMeta(){try{return JSON.parse(localStorage.getItem(SYNCKEY)||'null')||{uid:'',at:0};}catch(e){return {uid:'',at:0};}}
function setMeta(m){try{localStorage.setItem(SYNCKEY,JSON.stringify(m));}catch(e){}}
function exportState(){
  var nd=function(x){return !x.demo;};
  return {v:1,stage:S.stage,tasks:S.tasks.filter(nd),sessions:S.sessions.filter(nd),parked:S.parked,races:S.races.filter(nd),pause:S.pause||null,pauses:S.pauses||[]};
}
function hasReal(st){return st.tasks.length>0||st.sessions.length>0||st.races.length>0||st.parked.length>0;}
function adopt(st){
  S.stage=st.stage||S.stage;
  S.tasks=Array.isArray(st.tasks)?st.tasks:[];S.sessions=Array.isArray(st.sessions)?st.sessions:[];
  S.parked=Array.isArray(st.parked)?st.parked:[];S.races=Array.isArray(st.races)?st.races:[];
  S.pause=st.pause&&st.pause.since?{since:Number(st.pause.since)}:null;S.pauses=Array.isArray(st.pauses)?st.pauses:[];S.demo=false;S.timer=null;ui.focusTask='';ui.raceOpen=null;save(true);
}
function scheduleSync(){
  if(!ENT.signedIn||ui.conflict||getMeta().uid!==ENT.uid)return;
  clearTimeout(syncT);syncT=setTimeout(function(){pushSync(false);},4000);
}
async function pushSync(force,m){
  m=m||getMeta();
  if(!ENT.signedIn||m.uid!==ENT.uid)return;
  var local=exportState();if(!hasReal(local))return;
  try{
    var r=await api('/api/sync',{baseAt:m.at,state:local,force:!!force},undefined,'PUT');
    setMeta({uid:ENT.uid,at:r.at});
  }catch(e){
    if(e.code==='conflict')pullSync();
    else if(e.code==='too_big')toast('Your progress is too large to back up.');
  }
}
async function pullSync(){
  if(!ENT.signedIn||!ENT.uid||syncing)return;
  syncing=true;
  try{
    var c=await api('/api/sync'),m=getMeta();
    if(m.uid!==ENT.uid){m={uid:ENT.uid,at:0};setMeta(m);}
    var hasLocal=hasReal(exportState());
    if(!c.at){if(hasLocal)await pushSync(true,m);}
    else if(m.at===c.at){if(hasLocal)await pushSync(false,m);}
    else if(!hasLocal){adopt(c.state);setMeta({uid:ENT.uid,at:c.at});render();toast('Your progress is back.');}
    else{ui.conflict={cloud:c};render();}
  }catch(e){}
  finally{syncing=false;}
}
async function resolveConflict(useCloud){
  var c=ui.conflict;if(!c)return;
  ui.conflict=null;
  if(useCloud){adopt(c.cloud.state);setMeta({uid:ENT.uid,at:c.cloud.at});render();toast('Your account copy is now on this device.');}
  else{render();await pushSync(true,{uid:ENT.uid,at:c.cloud.at});toast('This device is now saved to your account.');}
  runAfterLogin();
}

/* ---------- sign in ---------- */
var gInit=false;
async function mountAuth(){
  var cfg=ENT.cfg.auth||{};
  if(cfg.mode!=='google')return;
  var el=$('#gbtn');if(!el)return;
  try{
    if(!window.google||!window.google.accounts)await loadScript('https://accounts.google.com/gsi/client');
    if(!gInit){window.google.accounts.id.initialize({client_id:cfg.googleClientId,callback:function(r){onGoogle(r.credential);}});gInit=true;}
    var el2=$('#gbtn');if(!el2)return;
    window.google.accounts.id.renderButton(el2,{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:Math.max(200,Math.min(300,el2.clientWidth||300))});
  }catch(e){var er=$('#loginErr');if(er)er.textContent='Could not load Google sign-in. Check your connection.';}
}
async function onAuthed(tok){
  setTok(tok);ui.loginErr='';
  await refreshStatus();
  ui.login=false;render();
  await pullSync();
  if(!ui.conflict){toast('Signed in.');runAfterLogin();}
}
async function onGoogle(cred){
  try{var j=await api('/api/auth/google',{credential:cred,adult:true});await onAuthed(j.token);}
  catch(e){ui.loginErr=e.message;render();}
}
async function onDemo(){
  var name=($('#demoName')||{}).value||'';
  try{var j=await api('/api/auth/demo',{name:name,adult:true});await onAuthed(j.token);}
  catch(e){ui.loginErr=e.message;render();}
}
function runAfterLogin(){
  var a=ui.afterLogin;ui.afterLogin='';
  if(a==='checkout'){
    if(ENT.pro){ui.paywall=null;render();toast('Pro is already on for your account.');}
    else startCheckout();
  }else if(a==='plan'){if(ui.raceForm&&!ui.raceForm.loading&&ui.raceForm.step==='goal')nextStep();
  }else if(a==='paid'&&ui.pendingPaid){var id=ui.pendingPaid;ui.pendingPaid='';confirmPayment({session_id:id});}
}
async function eraseAll(){
  if(ENT.signedIn){
    try{await api('/api/sync',undefined,undefined,'DELETE');setMeta({uid:ENT.uid,at:0});}
    catch(e){toast('Could not erase your account copy, so nothing was erased. Try again.');return;}
  }
  try{localStorage.removeItem(KEY);}catch(e){}
  S=fresh();ui.tab='today';ui.raceOpen=null;ui.raceForm=null;ui.confirmErase=false;ui.draft={title:'',step:'',when:'',edited:false};ui.reset=true;
  save(true);render();toast(ENT.signedIn?'Erased from this device and your account.':'All data erased from this device.');
}
async function deleteAccount(){
  try{await api('/api/account',undefined,undefined,'DELETE');}
  catch(e){ui.confirmDelAcct=false;render();toast(e.message);return;}
  setTok('');ENT.signedIn=false;ENT.pro=false;ENT.uid='';setLastPro(false);setMeta({uid:'',at:0});
  ui.confirmDelAcct=false;render();toast('Account deleted. Your data on this device is unchanged.');
}
var AGEKEY='startline.adult',ageMem='';
function ageState(){if(ageMem)return ageMem;try{return localStorage.getItem(AGEKEY)||'';}catch(e){return '';}}
function setAge(v){ageMem=v;try{localStorage.setItem(AGEKEY,v);}catch(e){}}
function vAge(){
  if(ageState()==='0')return '<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true" aria-label="Age check"><span class="badge">Startline</span><h2 style="font-size:24px">Startline is for people 18 and over</h2><p class="sub">Please come back when you turn 18. Nothing was saved.</p></div></div>';
  var ny=new Date().getFullYear(),mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],o1='<option value="">Month</option>',o2='<option value="">Year</option>',i;
  for(i=0;i<12;i++)o1+='<option value="'+(i+1)+'">'+mo[i]+'</option>';
  for(i=ny-14;i>=ny-60;i--)o2+='<option value="'+i+'">'+i+'</option>';
  return '<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true" aria-label="Age check"><span class="badge">Startline</span><h2 style="font-size:24px">Before you start</h2><p class="sub">Startline is for people 18 and over. Tell us your birth month and year.</p>'+
    '<div class="row"><select id="ageM" aria-label="Birth month">'+o1+'</select><select id="ageY" aria-label="Birth year">'+o2+'</select></div>'+
    '<button type="button" class="btn primary big" data-action="ageok">Continue</button><p class="err" role="alert">'+esc(ui.ageErr)+'</p>'+
    '<p class="note">We do not save your birth date. Only a yes or no stays on this device.</p></div></div>';
}
function checkAge(){
  var m=parseInt(($('#ageM')||{}).value,10),y=parseInt(($('#ageY')||{}).value,10);
  if(!m||!y){ui.ageErr='Please choose your birth month and year.';render();return;}
  var n=new Date(),age=n.getFullYear()-y-((n.getMonth()+1)<m?1:0);
  ui.ageErr='';setAge(age>=18?'1':'0');render();
}
function vLogin(){
  var a=ENT.cfg.auth||{},why=ui.afterLogin==='checkout'?'Sign in first so Pro follows you to every device.':(ui.afterLogin==='paid'?'Sign in to finish turning on Pro.':'Back up your progress and keep Pro on every device.');
  var h='<div class="sheet-back" data-action="loginbg"><div class="sheet" role="dialog" aria-modal="true" aria-label="Sign in"><div class="row"><span class="badge">Sign in</span>'+(a.mode==='demo'?'<span class="badge">Test mode</span>':'')+'</div><h2 style="font-size:24px">'+esc(why)+'</h2>';
  if(a.mode==='google')h+='<div id="gbtn" style="min-height:44px"></div>';
  else h+='<div><label class="lbl" for="demoName">Test name (any name you like)</label><input id="demoName" type="text" maxlength="20" autocomplete="off" placeholder="e.g. alex" value="'+esc(ui.demoName||'')+'"></div><button type="button" class="btn primary big" data-action="demologin">Continue</button><p class="note">Test mode: sign in with the same name on another device to see your account follow you.</p>';
  h+='<p class="err" id="loginErr" role="alert">'+esc(ui.loginErr)+'</p>'+
    '<p class="note">We keep an account id, your subscription, and a backup of your progress. We do not keep your name or email.</p>'+
    '<button type="button" class="btn ghost" data-action="loginclose">Not now</button></div></div>';
  return h;
}
function vConflict(){
  var c=ui.conflict.cloud,l=exportState();
  var cnt=function(s){return (s.tasks||[]).length+' tasks, '+(s.sessions||[]).length+' sprints, '+(s.races||[]).length+' races';};
  return '<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true" aria-label="Choose which progress to keep"><span class="badge">Your progress</span><h2 style="font-size:22px">Two versions of your progress</h2><p class="sub">This device and your account have different progress. Pick the one to keep. The other is replaced.</p>'+
    '<div class="card"><div class="tag">Your account · saved '+esc(new Date(c.at).toLocaleDateString(undefined,{day:'numeric',month:'short'}))+'</div><div style="margin-top:4px">'+esc(cnt(c.state))+'</div></div>'+
    '<div class="card"><div class="tag">This device</div><div style="margin-top:4px">'+esc(cnt(l))+'</div></div>'+
    '<button type="button" class="btn primary big" data-action="useCloud">Use my account copy</button><button type="button" class="btn big" data-action="keepLocal">Keep this device</button></div></div>';
}
function accountRow(){
  var t=ENT.cfg.auth&&ENT.cfg.auth.mode==='demo'?' <span class="badge">Test mode</span>':'';
  if(ENT.signedIn)return '<div class="lbl">Account</div><div class="row" style="justify-content:space-between"><span>Signed in'+t+'</span><button type="button" class="btn small" data-action="signout">Sign out</button></div><p class="note" style="margin-top:8px">Your progress is backed up to your account and follows you to other devices.</p>';
  return '<div class="lbl">Account</div><div class="row" style="justify-content:space-between"><span>Not signed in'+t+'</span><button type="button" class="btn small primary" data-action="login">Sign in</button></div><p class="note" style="margin-top:8px">Sign in to back up your progress and keep Pro on every device.</p>';
}
function deleteAcctRow(){
  if(!ENT.signedIn)return '';
  if(ui.confirmDelAcct)return '<div class="row" style="margin-top:12px"><span class="note">Delete your account and its backup?</span><button type="button" class="btn small primary" data-action="deleteyes">Yes, delete</button><button type="button" class="btn small" data-action="deleteno">Keep it</button></div>';
  return '<div style="margin-top:8px"><button type="button" class="btn ghost small" data-action="deleteacct" style="padding:0">Delete my account</button></div>';
}
function freeRaceWait(){
  var days=Number(ENT.cfg.freeCooldownDays)||3,last=0;
  S.races.forEach(function(r){if(!r.demo&&r.created>last)last=r.created;});
  var t=Math.max(last?last+days*DAY:0,ENT.nextFreeAt||0);
  return Math.max(0,t-Date.now());
}
function freeRaceDate(){return new Date(Date.now()+freeRaceWait()).toLocaleDateString(undefined,{day:'numeric',month:'short'});}
function vPaywall(){
  var c=ENT.cfg,why={races:'Free plan: one race every '+(Number(c.freeCooldownDays)||3)+' days.',ai:'Get a plan tailored to your goal.',report:'See how much sooner you start.',general:'Go further with Pro.'}[ui.paywall]||'Go further with Pro.';
  return '<div class="sheet-back" data-action="paywallbg"><div class="sheet" role="dialog" aria-modal="true" aria-label="Startline Pro">'+
    '<div class="row"><span class="badge">Startline Pro</span>'+(c.testMode?'<span class="badge">Test mode</span>':'')+'</div>'+
    '<h2 style="font-size:24px">'+esc(why)+'</h2>'+(ui.paywall==='races'&&freeRaceWait()>0?'<p class="sub">Your next free race opens on '+esc(freeRaceDate())+'. Pro has no waiting.</p>':'')+
    '<ul class="perks"><li>Start a new race any time, each planned by AI around your answers</li><li>Week-by-week proof that you start sooner</li><li>Cancel any time</li></ul>'+
    '<div><span class="price">'+esc(c.priceLabel)+'</span>'+(c.trialDays?'<div class="note">'+c.trialDays+'-day free trial first.</div>':'')+'</div>'+
    (!ENT.signedIn?'<p class="note">You sign in first, so Pro follows you to every device.</p>':'')+'<button type="button" class="btn primary big" data-action="subscribe"'+(ui.busy?' disabled':'')+'>'+(ui.busy?'One moment...':(!ENT.signedIn?'Sign in to continue':(c.trialDays?'Start '+c.trialDays+'-day free trial':'Go Pro')))+'</button>'+
    (c.testMode?'<p class="note">Test mode: payments are simulated. Nobody is charged.</p>':'')+
    (ui.payErr?'<p class="err" role="alert">'+esc(ui.payErr)+'</p>':'')+
    '<button type="button" class="btn ghost" data-action="paywallclose">Not now</button></div></div>';
}
function planRow(){
  var c=ENT.cfg;
  if(!ENT.pro)return '<div class="lbl">Your plan</div><div class="row" style="justify-content:space-between"><span>Free</span><button type="button" class="btn small primary" data-action="gopro">Go Pro</button></div>';
  var s='<div class="lbl">Your plan</div><div class="row" style="justify-content:space-between"><span><span class="badge">Pro</span>'+(c.testMode?' <span class="badge">Test mode</span>':'')+'</span>';
  if(ui.confirmCancel)return s+'</div><div class="row" style="margin-top:8px"><span class="note">Cancel your subscription?</span><button type="button" class="btn small primary" data-action="cancelyes">Yes, cancel</button><button type="button" class="btn small" data-action="cancelno">Keep Pro</button></div>';
  return s+'<button type="button" class="btn small" data-action="manage">'+(c.provider==='stripe'?'Manage subscription':'Cancel subscription')+'</button></div>';
}
function lockHero(o){
  return '<div class="tag">Average start delay · last 7 days</div><div class="pair"><span class="num">'+esc(fmtDur(o.recent))+'</span></div><p class="sub">Your before and after comparison is ready. Pro shows how much sooner you start than in your baseline week.</p><div><button type="button" class="btn primary" data-action="gopro2">Unlock with Pro</button></div>';
}
function lockChart(){
  return '<section class="card locked"><h2>Start delay by week</h2><p class="sub" style="margin:6px 0 12px">See your progress week by week, with your baseline marked.</p><button type="button" class="btn" data-action="gopro2">Unlock with Pro</button></section>';
}

/* ---------- helpers ---------- */
var STYLES=[
 {id:'pomo',name:'Pomodoro',d:'25 min work, 5 min break',work:25,brk:5},
 {id:'fifty',name:'50 and 10',d:'50 min work, 10 min break',work:50,brk:10},
 {id:'deep',name:'Deep work',d:'90 min work, 20 min break',work:90,brk:20},
 {id:'burst',name:'Short bursts',d:'15 min work, 3 min break',work:15,brk:3},
 {id:'flow',name:'Go until done',d:'no fixed breaks',work:45,brk:0},
 {id:'unsure',name:'Not sure yet',d:'we start you at 15 min',work:15,brk:3}
];
function styleObj(){return S.style?STYLES.find(function(x){return x.id===S.style;})||null:null;}
function defLen(){var st=styleObj();return st?st.work:(S.stage==='school'?15:25);}
function taskLen(t){
  if(!t||!t.min)return defLen();
  var st=styleObj();return st&&st.id!=='flow'?Math.min(t.min,st.work):Math.min(t.min,90);
}
function lenChips(len){
  var a=[2,defLen(),15,25,45,len];a=a.filter(function(v,i){return v>=2&&a.indexOf(v)===i;}).sort(function(x,y){return x-y;});
  if(a.length>5)a=a.filter(function(v){return v===2||v===len||v===defLen()||v===25||v===45;});
  return a.slice(0,5);
}
function startBreak(m){
  var now=Date.now();S.timer={taskId:null,len:m,endAt:now+m*MIN,paused:false,remainMs:m*MIN,began:now,ended:false,sid:null,brk:true};
  save();ui.tab='focus';ui.reset=true;render();
}
function taskById(id){return S.tasks.find(function(t){return t.id===id;});}
function openTasks(){return S.tasks.filter(function(t){return !t.done;}).sort(function(a,b){return a.created-b.created;});}
function suggestStep(text){
  var s=String(text).toLowerCase();
  var rules=[
    [/\b(study|revise|revision|read|chapter|notes|exam|learn|unit)\b/,'Open the notes or book to the right page and read only the first heading.'],
    [/\b(write|essay|assignment|report|draft|article|paper|thesis|letter|resume|cv|outline)\b/,'Open a blank document and type the title plus one rough bullet.'],
    [/\b(email|mail|message|reply|text|call|ring)\b/,'Open the app and write or say just the first line.'],
    [/\b(clean|tidy|organi[sz]e|laundry|room|desk|files)\b/,'Set a 2-minute timer and clear one small surface.'],
    [/\b(gym|workout|exercise|run|walk|jog|yoga|stretch)\b/,'Put on your shoes or workout clothes. Nothing else yet.'],
    [/\b(apply|application|internship|job|form|submit)\b/,'Open the page and fill in only your name and the first field.'],
    [/\b(code|build|project|app|program|debug)\b/,'Open the project and write one line saying the next thing to do.'],
    [/\b(math|maths|problem|practice|homework|quiz|mock|lab)\b/,'Open the first question and copy it onto paper.']
  ];
  for(var i=0;i<rules.length;i++){if(rules[i][0].test(s))return rules[i][1];}
  return 'Write down the very first physical action for this, then do only that.';
}
var WINS=['Done. That counts.','One down.','Started, then finished. That is the whole trick.','Finished. Look at the wins list.'];
function toast(msg){
  var old=$('.toast');if(old)old.remove();
  var d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=msg;
  $('#app').appendChild(d);setTimeout(function(){d.remove();},2600);
}

/* ---------- example data ---------- */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function dayAgo(n){return addDays(startOfDay(Date.now()),-n);}
function seedDemo(){
  var now=Date.now(),rnd=mulberry(29092026);
  var titles=['Revise Unit 3 notes','Maths practice set','Draft cover letter','Read chapter 5','Reply to placement email','Outline the assignment','Update resume','Practice mock quiz','Write lab report','Plan the presentation','Submit the form','Tidy project files'];
  for(var d=30;d>=1;d--){
    var prog=(30-d)/29;
    if(d>6&&rnd()>0.6+0.3*prog)continue;
    var n=1+Math.floor(rnd()*(2+prog));
    for(var i=0;i<n;i++){
      var created=dayAgo(d)+(9+Math.floor(rnd()*11))*36e5+Math.floor(rnd()*60)*MIN;
      var delayMin=(55-39*prog)*(0.7+0.6*rnd());
      var t={id:uid(),title:titles[Math.floor(rnd()*titles.length)],step:'',created:created,started:null,done:null,demo:1};
      t.step=suggestStep(t.title);
      if(d<=6||rnd()<0.85+0.1*prog){
        t.started=created+delayMin*MIN;
        var len=rnd()<0.5?15:25,fm=Math.round(len*(0.8+0.2*rnd()));
        S.sessions.push({id:uid(),taskId:t.id,start:t.started,min:fm,feel:Math.min(5,Math.max(1,Math.round(2.3+2*prog+(rnd()-0.5)*1.5))),demo:1});
        if(rnd()<0.5+0.35*prog||(d<=6&&i===0))t.done=t.started+(fm+5+Math.floor(rnd()*40))*MIN;
      }
      S.tasks.push(t);
    }
  }
  var w={id:uid(),title:'Reply to placement email',created:now-190*MIN,started:now-172*MIN,done:now-140*MIN,demo:1};
  w.step=suggestStep(w.title);S.tasks.push(w);
  S.sessions.push({id:uid(),taskId:w.id,start:w.started,min:15,feel:4,demo:1});
  ['Revise Unit 3 notes:42','Draft cover letter:15'].forEach(function(x){
    var p=x.split(':'),o={id:uid(),title:p[0],created:now-Number(p[1])*MIN,started:null,done:null,demo:1};
    o.step=suggestStep(o.title);S.tasks.push(o);
  });
  var H=function(n){return now-n*36e5;};
  var laps=[
    {title:'Get moving',steps:[{text:'Walk fast for 15 minutes',min:15,done:H(300)},{text:'Choose three running days in your week',min:5,done:H(290)},{text:'Find a flat route near home',min:10,done:H(280)}]},
    {title:'Build the base',steps:[{text:'Run 1 minute, walk 2 minutes, repeat 5 times',min:20,done:H(120)},{text:'Repeat it twice this week and add a 2-minute run',min:25},{text:'Write down how your legs felt afterwards',min:5}]},
    {title:'Stretch the distance',steps:[{text:'Run 10 minutes without a walking break',min:15},{text:'Add one longer run on the weekend',min:30},{text:'Eat something small before you run',min:5}]},
    {title:'Race week',steps:[{text:'Rest for two days before the run',min:5},{text:'Run the 5K at an easy pace',min:35}]}
  ];
  S.races.push(makeRace('Run a 5K without stopping','Run a 5K',ymd(addDays(startOfDay(now),42)),30,laps,false,true));
  S.demo=true;
}
function makeRace(goal,name,due,mins,laps,ai,demo){
  var start=startOfDay(Date.now()),end=parseYmd(due);
  var tw=laps.reduce(function(a,l){return a+(l.weight||1);},0),cum=0;
  var r={id:uid(),goal:goal,name:name,due:due,mins:mins,created:Date.now(),ai:!!ai,note:'',laps:laps.map(function(l){
    cum+=(l.weight||1);
    return {id:uid(),title:l.title,focus:l.focus||'',rhythm:l.rhythm||'',milestone:l.milestone||'',w:l.weight||1,due:ymd(start+(end-start)*cum/tw),steps:l.steps.map(function(s){return {id:uid(),text:s.text,min:s.min,done:s.done||null,taskId:null};})};
  })};
  if(demo)r.demo=1;
  return r;
}
if(!S){S=fresh();seedDemo();save();}
S.pauses=Array.isArray(S.pauses)?S.pauses:[];S.seen=S.seen||{};if(S.pause===undefined)S.pause=null;

/* ---------- timer ---------- */
function startSprint(taskId,len){
  var now=Date.now(),t=taskId?taskById(taskId):null;
  S.timer={taskId:t?t.id:null,len:len,endAt:now+len*MIN,paused:false,remainMs:len*MIN,began:now,ended:false,sid:null};
  if(t&&!t.started)t.started=now;
  save();ui.tab='focus';ui.reset=true;render();buddyPing(true);
}
function endSprint(){
  var T=S.timer;if(!T||T.ended)return;
  if(T.brk){S.timer=null;save();render();toast('Break over. Ready when you are.');return;}
  var remain=T.paused?T.remainMs:Math.max(0,T.endAt-Date.now());
  var el=T.len*MIN-remain;
  if(el<30000){S.timer=null;save();render();return;}
  var s={id:uid(),taskId:T.taskId,start:T.began,min:Math.max(1,Math.round(el/MIN)),feel:null};
  S.sessions.push(s);T.ended=true;T.sid=s.id;save();render();buddyPing(true);
}
function tick(){
  var T=S.timer;if(!T||T.ended||T.paused)return;
  var remain=T.endAt-Date.now();
  if(remain<=0){endSprint();if(ui.tab!=='focus'&&S.timer)toast('Sprint complete. Open Focus to log how it went.');return;}
  var c=$('#clock');
  if(c){c.textContent=fmtClock(remain);var b=$('#barFill');if(b)b.style.width=((T.len*MIN-remain)/(T.len*MIN)*100)+'%';}
}
setInterval(tick,250);
document.addEventListener('visibilitychange',tick);

/* ---------- task actions ---------- */
function completeTask(id){
  var t=taskById(id);if(!t||t.done)return;
  t.done=Date.now();buddyPing(true);
  S.races.forEach(function(r){r.laps.forEach(function(l){l.steps.forEach(function(s){if(s.taskId===id&&!s.done)s.done=t.done;});});});
  save();
}
function findStep(rid,sid){
  var r=S.races.find(function(x){return x.id===rid;});if(!r)return null;
  for(var i=0;i<r.laps.length;i++){var s=r.laps[i].steps.find(function(x){return x.id===sid;});if(s)return {r:r,l:r.laps[i],s:s};}
  return null;
}

/* ---------- views ---------- */
var I={
  check:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  timer:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg>',
  flag:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V11M10 20V5M16 20v-8M22 20H2"/></svg>'
};
function chip(label,on,action,v,extra){return '<button type="button" class="chip" aria-pressed="'+(on?'true':'false')+'" data-action="'+action+'" data-v="'+v+'"'+(extra||'')+'>'+label+'</button>';}
function banner(){
  return '<div class="banner"><span>Example data is showing so you can see how it works. Anything you add stays yours.</span><button type="button" class="btn small" data-action="cleardemo">Clear examples</button></div>';
}
function vToday(){
  var now=Date.now(),sod=startOfDay(now),open=openTasks();
  var wins=S.tasks.filter(function(t){return t.done&&t.done>=sod;}).sort(function(a,b){return b.done-a.done;});
  var sess=S.sessions.filter(function(s){return s.start>=sod;});
  var mins=sess.reduce(function(a,s){return a+s.min;},0);
  var ph={school:'Revise Unit 4 notes',college:'Start the assignment',work:'Update my résumé'}[S.stage]||'Start the assignment';
  var h='<div class="head"><div class="eyebrow">Startline · '+esc(new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}))+'</div><h1>Today</h1></div>';
  if(!S.stage){
    h+='<section class="card"><h2>One quick question</h2><p class="sub" style="margin:6px 0 12px">What are you working towards? It sets your default sprint length.</p><div class="chips">'+
      chip('Exam prep',false,'stage','school')+chip('College',false,'stage','college')+chip('Job or internship',false,'stage','work')+'</div></section>';
  }
  if(S.stage&&!S.style)h+='<section class="card"><h2>How do you like to work?</h2><p class="sub" style="margin:6px 0 14px">Your timers and breaks will follow this. You can change it later in Report.</p><div class="chips">'+STYLES.map(function(x){return chip(esc(x.name)+' · '+x.work+'/'+x.brk,false,'style',x.id);}).join('')+'</div><p class="note" style="margin-top:12px">Work minutes / break minutes. Pomodoro is 25/5.</p></section>';
  h+=welcomeBack()+seasonCard();
  h+='<form class="card" data-form="add" autocomplete="off"><label class="lbl" for="tTitle">What have you been putting off?</label>'+
    '<input id="tTitle" type="text" maxlength="90" placeholder="'+esc(ph)+'" value="'+esc(ui.draft.title)+'">'+
    '<details class="fold"'+(ui.draft.edited||ui.draft.when?' open':'')+'><summary>Add details (optional)</summary>'+
    '<label class="lbl" for="tStep">First step, under 2 minutes</label>'+
    '<input id="tStep" type="text" maxlength="140" placeholder="Filled in for you. Change it if you like." value="'+esc(ui.draft.step)+'">'+
    '<label class="lbl" for="tWhen">When and where will you start?</label><input id="tWhen" type="text" maxlength="80" placeholder="e.g. After dinner, at my desk" value="'+esc(ui.draft.when)+'"></details>'+
    '<div style="margin-top:14px"><button class="btn primary big" type="submit">Add task</button></div></form>';
  if(open.length)h+='<section class="card"><div class="wins-head"><h2>Up next</h2><span class="tag">'+open.length+' open</span></div><ul class="list">'+open.map(function(t){
    return '<li class="item"><button type="button" class="check" data-action="toggle" data-id="'+t.id+'" aria-label="Mark done: '+esc(t.title)+'"></button>'+
      '<div class="body"><div class="t">'+esc(t.title)+'</div><div class="s">First step: '+esc(t.step)+'</div>'+(t.when?'<div class="s mono">Plan: '+esc(t.when)+'</div>':'')+'</div>'+
      '<div class="acts">'+(t.min>2?'<button type="button" class="btn small primary" data-action="startt" data-id="'+t.id+'">Start '+taskLen(t)+' min</button><button type="button" class="btn small" data-action="start2" data-id="'+t.id+'">Just 2 min</button>':'<button type="button" class="btn small primary" data-action="start2" data-id="'+t.id+'">Start 2 min</button>')+
      '<button type="button" class="btn small ghost" data-action="remove" data-id="'+t.id+'">Remove</button></div></li>';
  }).join('')+'</ul>';
  if(open.length)h+='</section>';
  if(wins.length)h+='<section class="card"><div class="wins-head"><h2>Today’s wins</h2><span class="tag">'+wins.length+' done · '+sess.length+' sprint'+(sess.length===1?'':'s')+' · '+mins+' min</span></div>';
  if(wins.length)h+='<ul class="list">'+wins.map(function(t){
    return '<li class="item dn"><button type="button" class="check on" data-action="toggle" data-id="'+t.id+'" aria-label="Undo: '+esc(t.title)+'"></button>'+
      '<div class="body"><div class="t">'+esc(t.title)+'</div><div class="s mono">'+new Date(t.done).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+'</div></div></li>';
  }).join('')+'</ul>';
  if(wins.length)h+='</section>';
  if(!open.length&&!wins.length)h+='<section class="card"><h2>Your day starts here</h2><p class="sub" style="margin:6px 0 12px">Add the one thing you keep putting off above. Two minutes is enough to begin.</p><button type="button" class="btn small" data-action="tour">Take the 1-minute tour</button></section>';
  return h+weekCard();
}
function parkCard(){
  return '<section class="card"><h2>Parking lot</h2><p class="sub" style="margin:4px 0 12px;font-size:13px">A thought pops up? Park it here and get back to work.</p>'+
    '<form data-form="park" class="row" autocomplete="off" style="flex-wrap:nowrap"><input id="parkIn" type="text" maxlength="120" placeholder="Park a thought" aria-label="Park a thought"><button class="btn" type="submit">Park it</button></form>'+
    (S.parked.length?'<ul class="list" style="margin-top:12px">'+S.parked.map(function(p){
      return '<li class="item" style="grid-template-columns:1fr auto;align-items:center;padding:10px 0"><div class="body t" style="font-weight:400">'+esc(p.text)+'</div><button type="button" class="btn small ghost" data-action="unpark" data-id="'+p.id+'" aria-label="Remove thought">Clear</button></li>';
    }).join('')+'</ul>':'')+'</section>';
}
function vFocus(){
  var T=S.timer,h='<div class="head"><div class="eyebrow">Sprint</div><h1>Focus</h1></div>';
  if(!T){
    var open=openTasks(),sel=ui.focusTask&&taskById(ui.focusTask)&&!taskById(ui.focusTask).done?ui.focusTask:(open[0]?open[0].id:'');
    ui.focusTask=sel;var selT=sel?taskById(sel):null,len=ui.len||taskLen(selT);
    h+='<p class="sub">Pick a task and a length. If it feels heavy, start with 2 minutes. Starting is the hard part.</p>'+
      '<section class="card"><label class="lbl" for="fTask">Task</label><select id="fTask">'+
      open.map(function(t){return '<option value="'+t.id+'"'+(t.id===sel?' selected':'')+'>'+esc(t.title)+'</option>';}).join('')+
      '<option value=""'+(sel===''?' selected':'')+'>No task, just focus</option></select>'+
      '<div class="lbl">Length</div><div class="chips">'+
      lenChips(len).map(function(m){return chip(m===2?'2 min · starter':m+' min',len===m,'setlen',m);}).join('')+'</div>'+
      '<div style="margin-top:16px"><button type="button" class="btn primary big" data-action="startFocus">Start '+len+'-minute sprint</button></div></section>';
    return h+parkCard();
  }
  var t=T.taskId?taskById(T.taskId):null;
  if(T.ended){
    var s=S.sessions.find(function(x){return x.id===T.sid;})||{min:0,feel:null};
    h+='<section class="card"><h2>Sprint logged: '+s.min+' min</h2><p class="sub" style="margin:4px 0 0">How focused did you feel? Optional.</p>'+
      '<div class="rate" style="margin-top:12px">'+[1,2,3,4,5].map(function(n){return chip(n,s.feel===n,'rate',n);}).join('')+'</div>'+
      '<div class="scale"><span>Scattered</span><span>Locked in</span></div>';
    if(t){
      h+='<div class="lbl" style="margin-top:18px">Did you finish “'+esc(t.title)+'”?</div><div class="row"><button type="button" class="btn primary" data-action="finish">Yes, finished</button><button type="button" class="btn" data-action="notyet">Not yet</button></div>';
      if(T.len===2)h+='<div class="lbl">You already started. Keep the momentum?</div><button type="button" class="btn" data-action="momentum">Keep going: '+defLen()+'-minute sprint</button>';
    }else h+='<div style="margin-top:16px"><button type="button" class="btn primary" data-action="dismiss">Done</button></div>';
    if(s.min>=10&&styleObj()&&styleObj().brk)h+='<div class="lbl">Rest before the next one?</div><button type="button" class="btn" data-action="brk" data-v="'+styleObj().brk+'">Take a '+styleObj().brk+'-minute break</button>';
    return h+'</section>'+parkCard();
  }
  var remain=T.paused?T.remainMs:Math.max(0,T.endAt-Date.now());
  h+='<section class="card">'+(t?'<div class="t" style="font-weight:600;overflow-wrap:anywhere">'+esc(t.title)+'</div><div class="s note" style="margin-top:2px">First step: '+esc(t.step)+'</div>':'<div class="t" style="font-weight:600">'+(T.brk?'Break time. Step away from the screen.':'Free focus')+'</div>')+
    '<div class="clock" id="clock" role="timer" aria-label="Time left">'+fmtClock(remain)+'</div>'+
    '<div class="bar"><i id="barFill" style="width:'+((T.len*MIN-remain)/(T.len*MIN)*100)+'%"></i></div>'+
    '<div class="row" style="margin-top:16px">'+(T.paused?'<button type="button" class="btn primary" data-action="resume">Resume</button>':'<button type="button" class="btn" data-action="pause">Pause</button>')+
    '<button type="button" class="btn" data-action="early">Finish early</button>'+
    (ENT.cfg.testMode?'<button type="button" class="btn ghost small" data-action="skip">Prototype: jump to end</button>':'')+'</div>'+
    (T.paused?'<p class="note" style="margin-top:10px">Paused. The clock is stopped until you resume.</p>':'')+'</section>';
  return h+parkCard();
}
function raceStats(r){
  var tot=0,dn=0,cur=-1;
  r.laps.forEach(function(l,i){var d=l.steps.filter(function(s){return s.done;}).length;tot+=l.steps.length;dn+=d;if(cur<0&&d<l.steps.length)cur=i;});
  return {tot:tot,dn:dn,cur:cur};
}
function daysLeft(r){return Math.ceil((parseYmd(r.due)-startOfDay(Date.now()))/DAY);}
function leftText(r){var d=daysLeft(r);return d>0?d+' day'+(d===1?'':'s')+' left':(d===0?'Finish line is today':'Past the finish date');}
function vRace(){
  if(ui.raceForm)return vRaceForm();
  if(ui.crewOpen)return vCrew();
  var r=S.races.find(function(x){return x.id===ui.raceOpen;});
  return r?vRaceDetail(r):vRaceList();
}
function vRaceList(){
  var h='<div class="head"><div class="eyebrow">Long-term goals</div><h1>Race</h1><p class="sub">Turn a big goal into small laps with real dates, up to 2 years.</p></div>';
  h+='<button type="button" class="btn primary big" data-action="racenew">New race</button>';
  if(!ENT.pro)h+='<p class="note">Free plan: one AI-planned race every '+(Number(ENT.cfg.freeCooldownDays)||3)+' days. Pro has no waiting. <button type="button" class="btn ghost small" data-action="gopro" style="min-height:32px;padding:0 6px;color:var(--accent)">See Pro</button></p>';
  if(!S.races.length)h+='<p class="empty">No races yet. Pick one goal that matters to you.</p>';
  S.races.forEach(function(r){
    var st=raceStats(r);
    h+='<button type="button" class="card racecard" data-action="raceopen" data-id="'+r.id+'"><div><div class="tag">'+(r.demo?'Example · ':'')+esc(leftText(r))+'</div><h2 style="margin-top:4px;overflow-wrap:anywhere">'+esc(r.name)+'</h2></div>'+
      '<div class="bar"><i style="width:'+(st.tot?Math.round(st.dn/st.tot*100):0)+'%"></i></div><div class="note mono">'+st.dn+' of '+st.tot+' steps · finish '+esc(fmtDate(r.due))+'</div></button>';
  });
  h+=crewRow();
  return h;
}
function etaEst(f){
  var k=f.loading==='questions'?'questions':'plan',def=k==='questions'?15000:(35000+Math.round((f.weeks||8)/104*25000));
  try{var o=JSON.parse(localStorage.getItem('startline.eta')||'{}');if(o[k])def=o[k];}catch(e){}
  return def;
}
function etaSave(k,ms){
  if(!(ms>2000))return;
  try{var o=JSON.parse(localStorage.getItem('startline.eta')||'{}');o[k]=Math.min(120000,Math.round(o[k]?o[k]*0.6+ms*0.4:ms));localStorage.setItem('startline.eta',JSON.stringify(o));}catch(e){}
}
function etaText(f){
  if(f.retry)return 'The planner is busy. Trying again automatically (attempt '+(f.retry+1)+')...';
  var est=etaEst(f),left=est-(Date.now()-(f.t0||Date.now()));
  return left>1500?'About '+Math.ceil(left/1000)+' seconds left':'Almost there. This one is taking a little longer than usual.';
}
setInterval(function(){
  var f=ui.raceForm,el=$('#eta');if(!f||!f.loading||!el)return;
  el.textContent=etaText(f);var b=$('#etaFill');
  if(b)b.style.width=Math.min(95,Math.max(2,(Date.now()-f.t0)/etaEst(f)*100))+'%';
},1000);
var THINK=['Reading your goal','Caramelizing onions','Triangulating your deadline','Untangling your calendar','Sharpening pencils','Weighing the hard weeks','Charting the laps','Pacing the marathon','Balancing the rhythm','Whisking in your answers','Stress-testing the schedule','Polishing the finish line','Consulting the compass','Folding in rest days','Calibrating realism'],thkI=0;
setInterval(function(){var el=document.getElementById('thk');if(!el)return;thkI=(thkI+1+Math.floor(Math.random()*3))%THINK.length;el.textContent=THINK[thkI]+'...';},2200);
function pingDone(t,keep){try{if(ui.notify&&document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Startline',{body:t});}catch(e){}if(!keep)ui.notify=false;}
function vRaceForm(){
  var f=ui.raceForm,h='<button type="button" class="btn ghost small" data-action="raceback" style="align-self:flex-start">Back</button><div class="head"><div class="eyebrow">New race</div><h1>'+(f.step==='questions'?'A few questions':'Set the finish line')+'</h1></div>';
  if(f.loading){
    var m=f.loading==='questions'?'Reading your goal and preparing questions for you.':'Building your plan. Longer plans can take up to a minute.';
    var nb='';
    if(typeof Notification!=='undefined'&&Notification.permission!=='denied'){nb=Notification.permission==='granted'&&ui.notify?'<p class="note">We will notify you when it is ready. You can switch apps.</p>':'<button type="button" class="btn" data-action="racenotify">Notify me when ready</button> ';}
    return h+'<section class="card"><p><span class="spin"></span>'+m+'</p><p class="note" aria-live="off" id="thk">'+THINK[0]+'...</p><div class="bar" style="margin-top:14px"><i id="etaFill" style="width:2%"></i></div><p class="note mono" id="eta" style="margin-top:8px">'+etaText(f)+'</p><div style="margin-top:14px">'+nb+'<button type="button" class="btn" data-action="racecancel">Cancel</button></div></section>';
  }
  if(f.step==='questions'){
    h+='<p class="sub">Your answers shape the plan. Tap an option or type your own. Skip any you like.</p>';
    f.qs.forEach(function(q,i){
      h+='<section class="card"><label class="lbl" for="qa'+i+'" style="margin-top:0">'+esc(q.q)+'</label>';
      if(q.options&&q.options.length)h+='<div class="chips" style="margin-bottom:10px">'+q.options.map(function(o,j){return chip(esc(o),q.a===o,'qopt',j,' data-id="'+i+'"');}).join('')+'</div>';
      h+='<input id="qa'+i+'" type="text" maxlength="240" placeholder="Or type your own answer" value="'+esc(q.a)+'"></section>';
    });
    if(f.event)h+='<section class="card"><div class="tag">Real date found</div><h2 style="margin-top:6px">'+esc(f.event.name)+'</h2><p class="sub" style="margin:6px 0 10px">'+esc(fmtDateY(f.event.date))+' · '+Math.ceil((parseYmd(f.event.date)-startOfDay(Date.now()))/DAY)+' days from today.'+(f.event.note?' '+esc(f.event.note)+'.':'')+' '+(f.event.source?'Source: '+esc(f.event.source)+'. ':'')+'Always confirm on the official site.</p><div class="chips">'+chip('Plan to this date',f.useEvent,'evon',1)+chip('Use my own timeline',!f.useEvent,'evon',0)+'</div>'+(f.useEvent?'<label class="lbl" for="evDate">Wrong date? Change it</label><input id="evDate" type="date" value="'+esc(f.event.date)+'" style="max-width:190px">':'')+'</section>';
    if(f.err)h+='<p class="err" role="alert">'+esc(f.err)+'</p>';
    h+='<button type="button" class="btn primary big" data-action="racebuild">Build my plan</button><button type="button" class="btn ghost" data-action="raceskipq">Skip the questions</button><button type="button" class="btn ghost" data-action="racebasic">Use a basic plan instead (no AI)</button>';
    return h;
  }
  var wk=[[4,'4 weeks'],[8,'8 weeks'],[12,'12 weeks'],[26,'6 months'],[52,'1 year'],[78,'18 months'],[104,'2 years']];
  h+='<section class="card"><div class="lbl" style="margin-top:0">Quick starts</div><div class="chips" style="margin-bottom:6px">'+TPL.map(function(x,i){return chip(esc(x[0]),false,'rtpl',i);}).join('')+'</div><label class="lbl" for="rGoal">Your goal</label><input id="rGoal" type="text" maxlength="160" placeholder="e.g. Prepare for a Goldman Sachs interview" value="'+esc(f.goal)+'">'+
    '<div class="lbl">Finish line</div><div class="chips">'+wk.map(function(x){return chip(x[1],f.weeks===x[0],'rweeks',x[0]);}).join('')+'</div>'+
    '<div class="lbl">Time you can give each day</div><div class="chips">'+[15,30,60,90].map(function(m){return chip(m+' min',f.mins===m,'rmins',m);}).join('')+'</div>'+
    (f.err?'<p class="err" style="margin-top:12px" role="alert">'+esc(f.err)+'</p>':'')+
    '<div style="margin-top:16px"><button type="button" class="btn primary big" data-action="racenext">Continue</button></div>'+
    '<button type="button" class="btn ghost" data-action="racebasic" style="margin-top:6px">Use a basic plan instead (no AI)</button>'+
    '<p class="note" style="margin-top:10px">Next you answer a few short questions about your situation, so the plan fits you. Only your goal, your answers and the dates are sent to the AI, and only when you tap Continue. '+(ENT.pro?'':'Free plan: one race every '+(Number(ENT.cfg.freeCooldownDays)||3)+' days.')+'</p></section>';
  return h;
}
function vRaceDetail(r){
  var st=raceStats(r);
  var h='<div class="row" style="justify-content:space-between"><button type="button" class="btn ghost small" data-action="raceback">All races</button><button type="button" class="btn small primary" data-action="racenew">New race</button></div>'+
    '<div class="head"><div class="eyebrow">'+(r.demo?'Example race':(r.ai?'Plan written by AI':'Built-in plan'))+'</div><h1 style="overflow-wrap:anywhere">'+esc(r.name)+'</h1><p class="sub">'+esc(leftText(r))+' · finish '+esc(fmtDate(r.due))+' · '+r.mins+' min a day</p></div>';
  if(r.note)h+='<p class="note">'+esc(r.note)+'</p>';
  if(r.realism)h+='<section class="card"><div class="tag">Is this realistic?</div><p style="margin-top:6px">'+esc(r.realism)+'</p></section>';
  h+=vRoute(r);
  r.laps.forEach(function(l,i){
    var d=l.steps.filter(function(s){return s.done;}).length;
    if(!(i===st.cur||ui.lapOpen[l.id])){h+='<button type="button" class="card racecard lapsum" data-action="lapopen" data-v="'+l.id+'"><div><div class="tag">'+(d===l.steps.length?'Done':'By '+esc(fmtDate(l.due)))+'</div><h2 style="margin-top:4px">Lap '+(i+1)+' · '+esc(l.title)+'</h2></div><span class="tag mono">'+d+'/'+l.steps.length+' steps</span></button>';return;}
    h+='<section class="card lap"><div class="laphead"><h2>Lap '+(i+1)+' · '+esc(l.title)+'</h2><span class="tag">by '+esc(fmtDate(l.due))+' · '+d+'/'+l.steps.length+'</span></div>'+(l.focus?'<p class="sub" style="margin:4px 0 6px">'+esc(l.focus)+'</p>':'')+(l.rhythm?'<p class="note mono" style="margin:0 0 8px">Weekly rhythm: '+esc(l.rhythm)+'</p>':'')+'<ul class="list">';
    l.steps.forEach(function(s){
      var tk=s.taskId?taskById(s.taskId):null,inToday=tk&&!tk.done;
      h+='<li class="item'+(s.done?' dn':'')+'"><button type="button" class="check'+(s.done?' on':'')+'" data-action="stepToggle" data-r="'+r.id+'" data-s="'+s.id+'" aria-label="'+(s.done?'Undo step':'Mark step done')+': '+esc(s.text)+'"></button>'+
        '<div class="body"><div class="t">'+esc(s.text)+'</div><div class="s mono">'+s.min+' min</div></div>'+
        (s.done?'':'<div class="acts">'+(inToday?'<span class="tag">In Today</span>':'<button type="button" class="btn small" data-action="stepToday" data-r="'+r.id+'" data-s="'+s.id+'">Add to Today</button>')+'</div>')+'</li>';
    });
    h+='</ul>'+lapTools(r,l,i,st)+'</section>';
  });
  h+='<details class="card fold"'+(ui.confirmDel?' open':'')+'><summary>Race settings</summary>'+dueTool(r);
  h+=ui.confirmDel?'<div class="row"><span class="note">Delete this race?</span><button type="button" class="btn small primary" data-action="racedelyes" data-id="'+r.id+'">Yes, delete</button><button type="button" class="btn small" data-action="racedelno">Keep it</button></div>':'<button type="button" class="btn ghost small" data-action="racedel" style="align-self:flex-start">Delete this race</button>';
  h+='</details>';
  return h;
}
function stats(){
  var now=Date.now(),avg=function(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:null;};
  var st=S.tasks.filter(function(t){return t.started;}),dl=function(t){return Math.max(0,t.started-t.created);};
  var o={baseline:null,recent:null,unlocked:false,dayN:0,weeks:[]};
  if(st.length){
    var first=Math.min.apply(null,st.map(function(t){return t.created;}));
    o.dayN=Math.min(7,Math.floor((now-first)/DAY)+1);
    var wT=Math.floor((now-first)/WEEK)+1;
    o.baseline=avg(st.filter(function(t){return t.created<first+WEEK;}).map(dl));
    o.recent=avg(st.filter(function(t){return t.created>=now-WEEK;}).map(dl));
    o.unlocked=now>=first+2*WEEK&&o.baseline!==null&&o.recent!==null;
    var idx=[];for(var k=1;k<=wT;k++)idx.push(k);
    var show=idx.length<=5?idx:[1].concat(idx.slice(-4));
    o.weeks=show.map(function(k){var a=st.filter(function(t){return Math.floor((t.created-first)/WEEK)+1===k;});return {k:k,avg:avg(a.map(dl)),cur:k===wT};});
  }
  var pl=S.tasks.filter(function(t){return t.created>=now-WEEK;});
  o.planned=pl.length;o.done=pl.filter(function(t){return t.done;}).length;
  var s7=S.sessions.filter(function(s){return s.start>=now-WEEK;});
  o.focus=s7.reduce(function(a,s){return a+s.min;},0);
  var fs=s7.filter(function(s){return s.feel;});o.feel=avg(fs.map(function(s){return s.feel;}));
  var days={},firstDone=Infinity;S.tasks.forEach(function(t){if(t.done){var k=startOfDay(t.done);days[k]=1;if(k<firstDone)firstDone=k;}});
  var d=startOfDay(now),streak=0,forgiven=-99;if(!days[d])d=addDays(d,-1);
  for(var i=0;i<400&&d>=firstDone;i++,d=addDays(d,-1)){
    if(days[d]){streak++;continue;}
    if(inPause(d))continue;
    if(i-forgiven>=7){forgiven=i;continue;}
    break;
  }
  o.streak=streak;
  return o;
}
function vReport(){
  var o=stats(),h='<div class="head"><div class="eyebrow">Effectiveness</div><h1>Is it working?</h1></div>';
  h+='<section class="card hero">';
  if(o.baseline===null){
    h+='<h2>No baseline yet</h2><p class="sub">Add a task and start a 2-minute sprint. Your baseline is measured from your first start: the time between adding a task and actually starting it.</p>';
  }else if(!o.unlocked){
    h+='<div class="tag">Baseline · day '+o.dayN+' of 7 and counting</div><div class="pair"><span class="num">'+esc(fmtDur(o.baseline))+'</span></div><p class="sub">Average start delay so far. Your first comparison unlocks after two weeks of use, so it is a fair one.</p>';
  }else if(!ENT.pro){
    h+=lockHero(o);
  }else{
    var pct=Math.round((o.baseline-o.recent)/o.baseline*100);
    var msg=pct>=5?'You start '+pct+'% sooner than in your baseline week.':(pct<=-5?'Start delay is up '+(-pct)+'% from baseline. Busy weeks do that. Shrink the first step and try again.':'About the same as your baseline. Try the 2-minute starter on the task you dread most.');
    h+='<div class="tag">Average start delay</div><div class="pair"><span class="num mute">'+esc(fmtDur(o.baseline))+'</span><span class="arrow">→</span><span class="num">'+esc(fmtDur(o.recent))+'</span></div><div class="note mono">Baseline week → last 7 days</div><p>'+esc(msg)+'</p>';
  }
  h+='</section>';
  if(o.weeks.length&&!ENT.pro)h+=lockChart();
  if(o.weeks.length&&ENT.pro){
    var vals=o.weeks.map(function(w){return w.avg==null?0:w.avg/MIN;}),mx=Math.max.apply(null,vals.concat([1]))*1.08,H=112;
    h+='<section class="card"><h2>Start delay by week</h2><p class="note" style="margin-top:4px">Minutes from adding a task to starting it. Shorter is better. Week 1 is your baseline.</p><div class="plot">';
    if(o.baseline!==null&&o.weeks.length>1)h+='<div class="ref" style="bottom:'+Math.round(o.baseline/MIN/mx*H)+'px"></div>';
    o.weeks.forEach(function(w,i){
      var v=w.avg==null?null:w.avg/MIN;
      h+='<div class="col"><span class="v">'+(v==null?'–':(v<1?'<1':Math.round(v)))+'</span><div class="b'+(w.k===1?' base':'')+(v==null?' none':'')+'" style="'+(v==null?'':'height:'+Math.max(3,Math.round(v/mx*H))+'px')+'"></div></div>';
    });
    h+='</div><div class="xl">'+o.weeks.map(function(w){return '<span>'+(w.k===1?'Base':(w.cur?'Now':'Wk '+w.k))+'</span>';}).join('')+'</div></section>';
  }
  h+='<section class="card metrics"><div class="metric"><div class="k">Start delay<span class="n">Last 7 days'+(o.baseline!==null?' · baseline '+esc(fmtDur(o.baseline)):'')+'</span></div><div class="val">'+(o.recent==null?'–':esc(fmtDur(o.recent)))+'</div></div>'+
    '<div class="metric"><div class="k">Tasks finished<span class="n">'+o.done+' of '+o.planned+' added in the last 7 days</span></div><div class="val">'+(o.planned?Math.round(o.done/o.planned*100)+'%':'–')+'</div></div>'+
    '<div class="metric"><div class="k">Focus time<span class="n">Last 7 days</span></div><div class="val">'+o.focus+' min</div></div>'+
    '<div class="metric"><div class="k">Follow-through streak<span class="n">'+(o.streak?'Days in a row with a finished task':'Ready when you are.')+'</span></div><div class="val">'+o.streak+' day'+(o.streak===1?'':'s')+'</div></div>'+
    '<div class="metric"><div class="k">Felt focus<span class="n">Your own rating, last 7 days</span></div><div class="val">'+(o.feel==null?'–':o.feel.toFixed(1)+' / 5')+'</div></div></section>';
  h+='<details class="card fold"><summary>Settings and account</summary>'+accountRow()+planRow()+'<div class="lbl">What you are working towards</div><div class="chips">'+
    chip('Exam prep',S.stage==='school','stage','school')+chip('College',S.stage==='college','stage','college')+chip('Job or internship',S.stage==='work','stage','work')+'</div>'+
    '<div class="lbl">How you like to work</div><div class="chips">'+STYLES.map(function(x){return chip(esc(x.name)+' · '+x.work+'/'+x.brk,S.style===x.id,'style',x.id);}).join('')+'</div>'+remindRow()+'<div class="lbl">Break and help</div><div class="row">'+(isPaused()?'<button type="button" class="btn small primary" data-action="resumeplan">Resume my plans</button>':'<button type="button" class="btn small" data-action="pauseplan">Pause my plans</button>')+'<button type="button" class="btn small" data-action="tour">Replay the tour</button></div><p class="note" style="margin-top:14px">Your tasks and progress stay on this device. No account, no name needed. Erasing them keeps your subscription.</p>'+
    '<div style="margin-top:12px">'+(ui.confirmErase?'<div class="row"><span class="note">'+(ENT.signedIn?'Erase your progress here and in your account?':'Erase everything on this device?')+'</span><button type="button" class="btn small primary" data-action="eraseyes">Yes, erase</button><button type="button" class="btn small" data-action="eraseno">Keep it</button></div>':'<button type="button" class="btn small" data-action="erase">Erase all my data</button>')+'</div>'+deleteAcctRow()+'</details>';
  return h;
}
function renderTabs(){
  var t=[['today','Today',I.check],['focus','Focus',I.timer],['race','Race',I.flag],['report','Report',I.chart]];
  $('#tabs').innerHTML=t.map(function(x){return '<button type="button" class="tab" data-action="tab" data-v="'+x[0]+'"'+(ui.tab===x[0]?' aria-current="page"':'')+'>'+x[2]+'<span>'+x[1]+'</span></button>';}).join('');
}
function render(){
  var scr=$('#screen'),top=ui.reset?0:scr.scrollTop;ui.reset=false;
  var views={today:vToday,focus:vFocus,race:vRace,report:vReport};
  scr.innerHTML=(S.demo?banner():'')+views[ui.tab]();
  scr.scrollTop=top;renderTabs();
  var ov=$('#overlay');if(!ov){ov=document.createElement('div');ov.id='overlay';$('#app').appendChild(ov);}
  ov.innerHTML=ageState()!=='1'?vAge():ui.conflict?vConflict():(ui.login?vLogin():(ui.paywall?vPaywall():(showTour()?vTour():'')));
  if(ageState()==='1'&&ui.login&&!ui.conflict)mountAuth();
}

/* ---------- race building ---------- */
function templateLaps(mins){
  var m=Math.min(mins,15);
  return [
    {title:'Get clear',steps:[{text:'Write your goal in one sentence',min:5},{text:'List three reasons it matters to you',min:10},{text:'Write what “done” looks like',min:10}]},
    {title:'Find the path',steps:[{text:'Search for three guides or people who did this',min:m},{text:'Pick one path and write its first five steps',min:m},{text:'Note what you need: time, tools, money',min:10}]},
    {title:'Build the habit',steps:[{text:'Choose a fixed time each day for '+mins+' minutes',min:5},{text:'Do your first '+mins+'-minute session',min:mins},{text:'Write down what got in the way',min:5}]},
    {title:'Halfway check',steps:[{text:'Write what is done and what is left',min:10},{text:'Shrink or drop one step that feels stuck',min:10},{text:'Tell one person about your progress',min:5}]},
    {title:'Final push',steps:[{text:'List everything left as small steps',min:10},{text:'Do the hardest step first, for 25 minutes',min:25},{text:'Finish the last item on the list',min:m}]}
  ];
}
function normalizeLaps(out,cap){
  if(!out||!Array.isArray(out.laps))return null;
  var laps=out.laps.slice(0,12).map(function(l){
    var steps=(l&&Array.isArray(l.steps)?l.steps:[]).slice(0,6).map(function(s){
      var m=Math.round(Number(s&&s.minutes));if(!(m>=2))m=10;
      return {text:clip(s&&s.text,120),min:Math.min(m,cap)};
    }).filter(function(s){return s.text;});
    var w=Math.round(Number(l&&l.weight));if(!(w>=1))w=1;if(w>10)w=10;
    return {title:clip(l&&l.title,40)||'Next lap',focus:clip(l&&l.focus,170),rhythm:clip(l&&l.rhythm,170),milestone:clip(l&&l.milestone,60),weight:w,steps:steps};
  }).filter(function(l){return l.steps.length;});
  return laps.length>=3?{name:clip(out.race_name,48),realism:clip(out.realism,500),laps:laps}:null;
}
function aiOn(){return !!(ENT.cfg.ai&&ENT.cfg.ai.ready);}
function failNote(e){
  var c=e&&e.code;
  if(c==='free_cooldown')return e.message+' A basic plan was used this time.';
  if(c==='pro_required')return 'A basic plan was used. Pro writes unlimited personal plans.';
  if(c==='daily_limit')return 'You reached today\u2019s AI planning limit, so a basic plan was used.';
  return 'The AI planner was not available, so a basic plan was used.';
}
function keepBasic(e){var c=e&&e.code;return c==='free_cooldown'||c==='pro_required'||c==='daily_limit'||c==='ai_unavailable';}
async function apiRetry(path,body,ctl,f){
  var delays=[3000,6000,10000],stop={login_required:1,free_cooldown:1,pro_required:1,daily_limit:1,bad_goal:1,ai_unavailable:1};
  f.retry=0;
  for(var i=0;;i++){
    try{var out=await api(path,body,ctl.signal);f.retry=0;return out;}
    catch(e){
      if(e&&e.name==='AbortError')throw e;
      if((e&&stop[e.code])||i>=delays.length){f.retry=0;throw e;}
      f.retry=i+1;
      await new Promise(function(r){var t=setTimeout(r,delays[i]);ctl.signal.addEventListener('abort',function(){clearTimeout(t);r();},{once:true});});
      if(ctl.signal.aborted){f.retry=0;throw {name:'AbortError'};}
    }
  }
}
function failStay(f){f.loading=false;f.err='The planner could not answer after several automatic tries. Nothing was lost. Tap the button again, or use a basic plan.';ui.reset=false;render();}
function planBody(f,extra){
  var b={goal:clip(f.goal,160),weeks:f.weeks,mins:f.mins,stage:S.stage||'',today:ymd(Date.now())};
  var st0=styleObj();if(st0){b.sprint=st0.work;b.brk=st0.brk;}
  if(f.event&&f.useEvent&&evOk(f.event))b.event={name:f.event.name,date:f.event.date,source:f.event.source||'',note:f.event.note||''};
  if(extra)for(var k in extra)b[k]=extra[k];
  return b;
}
function evOk(e){return !!(e&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))&&parseYmd(e.date)>=addDays(startOfDay(Date.now()),14)&&parseYmd(e.date)<=addDays(startOfDay(Date.now()),730));}
function needLogin(){var f=ui.raceForm;if(f)f.loading=false;ui.afterLogin='plan';ui.login=true;render();}
async function nextStep(){
  var f=ui.raceForm;if(!f)return;
  if(clip(f.goal,160).length<3){f.err='Write your goal first. A few words is enough.';render();return;}
  f.err='';
  if(!aiOn()){buildRace(true,'The AI planner is not set up on this server yet, so a basic plan was used.');return;}
  if(!ENT.signedIn){needLogin();return;}
  f.loading='questions';f.t0=Date.now();render();
  var ctl=new AbortController();ui.abort=ctl;
  try{
    var out=await apiRetry('/api/plan/questions',planBody(f),ctl,f);
    ui.abort=null;if(ui.raceForm!==f)return;
    f.qs=(out.questions||[]).map(function(q){return {q:clip(q.q,140),options:(q.options||[]).map(function(o){return clip(o,40);}),a:''};});
    if(f.qs.length<2)throw {code:'bad_shape'};
    etaSave('questions',Date.now()-f.t0);f.event=out.event&&evOk(out.event)?out.event:null;f.useEvent=!!f.event;f.step='questions';f.loading=false;ui.reset=true;render();pingDone('Your questions are ready.',1);
  }catch(e){
    ui.abort=null;if(ui.raceForm!==f)return;
    if(e&&e.name==='AbortError'){f.loading=false;render();return;}
    if(e&&e.code==='login_required'){needLogin();return;}
    if(keepBasic(e)){buildRace(true,failNote(e));return;}
    failStay(f);
  }
}
async function buildRace(basic,note0){
  var f=ui.raceForm,goal=clip(f.goal,160);
  if(goal.length<3){f.err='Write your goal first. A few words is enough.';render();return;}
  var useEv=!!(f.event&&f.useEvent&&evOk(f.event)),due=useEv?f.event.date:ymd(addDays(startOfDay(Date.now()),f.weeks*7)),cap=Math.max(f.mins,10),plan=null,note=note0||'',ai=false;
  if(!basic){
    f.loading='plan';f.t0=Date.now();f.err='';render();
    var ctl=new AbortController();ui.abort=ctl;
    var ans=(f.qs||[]).filter(function(x){return x.a&&x.a.trim();}).map(function(x){return {q:x.q,a:clip(x.a,240)};});
    try{
      var out=await apiRetry('/api/plan',planBody(f,{answers:ans}),ctl,f);
      plan=normalizeLaps(out,cap);
      if(!plan)throw {code:'bad_shape'};
      ai=true;etaSave('plan',Date.now()-f.t0);
    }catch(e){
      ui.abort=null;if(ui.raceForm!==f)return;
      if(e&&e.name==='AbortError'){f.loading=false;render();return;}
      if(e&&e.code==='login_required'){needLogin();return;}
      if(!keepBasic(e)){failStay(f);return;}
      note=failNote(e);
    }
  }
  ui.abort=null;
  if(ui.raceForm!==f)return;
  var laps=plan?plan.laps:templateLaps(f.mins),name=(plan&&plan.name)||clip(goal,48);
  var r=makeRace(goal,name,due,f.mins,laps,ai,false);r.note=note;if(plan&&plan.realism)r.realism=plan.realism;if(useEv)r.event={name:clip(f.event.name,60),date:f.event.date,source:clip(f.event.source,60),note:clip(f.event.note,100)};
  S.races.unshift(r);save();
  if(ai&&!ENT.pro)ENT.aiFree=false;
  ui.raceForm=null;ui.raceOpen=r.id;ui.reset=true;render();pingDone('Your plan is ready.');
  toast(ai?'Your plan is ready.':'Your race is ready (basic plan).');
}

/* ---------- events ---------- */
function act(a,d){
  var T=S.timer;
  switch(a){
    case 'tab':ui.crewOpen=false;ui.tab=d.v;ui.reset=true;ui.confirmErase=false;ui.confirmDel=false;render();if(d.v==='race')buddyPing(false,true);break;
    case 'stage':S.stage=d.v;save();render();break;
    case 'toggle':{var t=taskById(d.id);if(!t)break;if(t.done){t.done=null;save();render();}else{completeTask(d.id);render();toast(WINS[Math.floor(Math.random()*WINS.length)]);}break;}
    case 'start2':startSprint(d.id,2);break;
    case 'startt':startSprint(d.id,taskLen(taskById(d.id)));break;
    case 'style':S.style=d.v;ui.len=null;save();render();toast('Timers now follow your style.');break;
    case 'brk':startBreak(Number(d.v));break;
    case 'remove':S.tasks=S.tasks.filter(function(x){return x.id!==d.id;});if(S.timer&&S.timer.taskId===d.id)S.timer.taskId=null;S.races.forEach(function(r){r.laps.forEach(function(l){l.steps.forEach(function(s){if(s.taskId===d.id)s.taskId=null;});});});save();render();break;
    case 'setlen':ui.len=Number(d.v);render();break;
    case 'startFocus':startSprint(ui.focusTask||null,ui.len||defLen());break;
    case 'pause':if(T&&!T.paused){T.remainMs=Math.max(0,T.endAt-Date.now());T.paused=true;save();render();}break;
    case 'resume':if(T&&T.paused){T.endAt=Date.now()+T.remainMs;T.paused=false;save();render();}break;
    case 'early':endSprint();break;
    case 'skip':if(T&&!T.ended){T.endAt=Date.now();T.paused=false;endSprint();}break;
    case 'rate':{if(T&&T.sid){var s=S.sessions.find(function(x){return x.id===T.sid;});if(s){s.feel=Number(d.v);save();render();}}break;}
    case 'finish':if(T&&T.taskId){completeTask(T.taskId);}S.timer=null;save();render();toast(WINS[Math.floor(Math.random()*WINS.length)]);break;
    case 'notyet':case 'dismiss':S.timer=null;save();render();break;
    case 'momentum':if(T&&T.taskId)startSprint(T.taskId,defLen());break;
    case 'unpark':S.parked=S.parked.filter(function(x){return x.id!==d.id;});save();render();break;
    case 'racenew':if(!ENT.pro&&freeRaceWait()>0){ui.paywall='races';render();break;}ui.raceOpen=null;ui.raceForm={goal:'',weeks:8,mins:30,loading:false,err:'',step:'goal',qs:[]};ui.reset=true;render();var g=$('#rGoal');if(g)g.focus();break;
    case 'racenotify':try{Notification.requestPermission().then(function(p){ui.notify=(p==='granted');if(ui.raceForm&&ui.raceForm.loading)render();});}catch(e){}break;
    case 'tour':ui.tourOn=true;ui.tourStep=0;render();break;
    case 'tournext':ui.tourStep=Math.min(TOUR.length-1,ui.tourStep+1);render();break;
    case 'tourback':ui.tourStep=Math.max(0,ui.tourStep-1);render();break;
    case 'tourdone':lset('startline.tour','1');ui.tourOn=false;ui.tourStep=0;ui.reset=true;render();break;
    case 'crewopen':ui.crewOpen=true;ui.reset=true;render();buddyPing(false,true);break;
    case 'lapopen':ui.lapOpen[d.v]=true;render();break;
    case 'raceback':if(ui.crewOpen){ui.crewOpen=false;ui.reset=true;render();break;}if(ui.raceForm){if(!ui.raceForm.loading){ui.raceForm=null;render();}}else{ui.raceOpen=null;ui.confirmDel=false;ui.reset=true;render();}break;
    case 'raceopen':ui.raceOpen=d.id;ui.reset=true;render();break;
    case 'rweeks':ui.raceForm.weeks=Number(d.v);render();break;
    case 'rmins':ui.raceForm.mins=Number(d.v);render();break;
    case 'racenext':nextStep();break;
    case 'racebasic':buildRace(true,'Basic plan (no AI).');break;
    case 'racebuild':buildRace(false);break;
    case 'raceskipq':ui.raceForm.qs=[];buildRace(false);break;
    case 'qopt':(function(){var q=ui.raceForm.qs[Number(d.id)];if(q){var o=q.options[Number(d.v)];q.a=(q.a===o?'':o);render();}})();break;
    case 'racecancel':if(ui.abort)ui.abort.abort();break;
    case 'stepToggle':{var f=findStep(d.r,d.s);if(!f)break;if(f.s.done){f.s.done=null;}else{f.s.done=Date.now();var tk=f.s.taskId?taskById(f.s.taskId):null;if(tk&&!tk.done)tk.done=f.s.done;}save();render();break;}
    case 'stepToday':{var g2=findStep(d.r,d.s);if(!g2)break;var nt={id:uid(),title:g2.s.text,step:suggestStep(g2.s.text),min:g2.s.min,created:Date.now(),started:null,done:null};if(g2.r.demo)nt.demo=1;S.tasks.push(nt);g2.s.taskId=nt.id;save();render();toast('Added to Today.');break;}
    case 'racedel':ui.confirmDel=true;render();break;
    case 'racedelno':ui.confirmDel=false;render();break;
    case 'racedelyes':S.races=S.races.filter(function(x){return x.id!==d.id;});ui.raceOpen=null;ui.confirmDel=false;ui.reset=true;save();render();break;
    case 'pauseplan':pauseNow();break;
    case 'resumeplan':resumeNow();break;
    case 'restart':restartNow();break;
    case 'welcomeoff':ui.welcomeOff=ymd(Date.now());render();break;
    case 'replan':replanAll();break;
    case 'shrink':shrinkLap(d.r,d.s);break;
    case 'unshrink':unshrinkLap(d.r,d.s);break;
    case 'racedue':(function(){var r=S.races.find(function(x){return x.id===d.id;}),v=($('#rDue')||{}).value;if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return;var t=parseYmd(v);if(t<addDays(startOfDay(Date.now()),1)||t>addDays(startOfDay(Date.now()),730)){toast('Pick a date within the next 2 years.');return;}r.due=v;if(r.event){r.event.date=v;r.event.note='date edited by you';}respread(r);save();render();toast('Finish date updated. Laps re-planned.');})();break;
    case 'seen':S.seen[d.v]=1;save();render();break;
    case 'newprefill':ui.tab='race';act('racenew',{});if(ui.raceForm){var tp=TPL[Number(d.v)]||TPL[0];ui.raceForm.goal=d.v==='4'?'Do well this semester':tp[1];ui.raceForm.weeks=d.v==='4'?16:tp[2];render();}break;
    case 'rtpl':if(ui.raceForm){var tq=TPL[Number(d.v)];if(tq){ui.raceForm.goal=tq[1];ui.raceForm.weeks=tq[2];render();}}break;
    case 'evon':if(ui.raceForm){ui.raceForm.useEvent=d.v==='1';render();}break;
    case 'sharecard':shareCard();break;
    case 'remind':(function(){
      if(d.v==='off'){S.remind={on:false,hour:-1};save(true);render();return;}
      var go=function(){S.remind={on:true,hour:d.v==='auto'?-1:Number(d.v)};save(true);render();toast('Daily nudge is on.');};
      try{Notification.requestPermission().then(function(p){if(p==='granted')go();else toast('Notifications were not allowed in this browser.');});}catch(e){toast('Notifications are not supported here.');}
    })();break;
    case 'gopen':ui.gOpen=d.v;render();break;
    case 'gclose':ui.gOpen='';render();break;
    case 'gsave':goalSave(d.v);break;
    case 'gstep':goalStep(d.v,d.id);break;
    case 'bcreate':buddyJoin(true);break;
    case 'bjoin':buddyJoin(false);break;
    case 'bcopy':(function(){var t='Join my crew on Startline. Invite code: '+d.v+' at '+location.origin;try{navigator.clipboard.writeText(t).then(function(){toast('Invite copied.');},function(){toast('Code: '+d.v);});}catch(e){toast('Code: '+d.v);}})();break;
    case 'bleave':api('/api/buddy/leave',{code:d.v}).catch(function(){});setRooms(rooms().filter(function(x){return x.code!==d.v;}));delete ui.rv[d.v];render();break;
    case 'paywallclose':case 'paywallbg':ui.paywall=null;ui.payErr='';render();break;
    case 'subscribe':if(!ENT.signedIn){ui.afterLogin='checkout';ui.login=true;ui.loginErr='';render();}else startCheckout();break;
    case 'login':ui.afterLogin='';ui.login=true;ui.loginErr='';render();break;
    case 'loginbg':case 'loginclose':ui.login=false;ui.afterLogin='';render();break;
    case 'demologin':onDemo();break;
    case 'ageok':checkAge();break;
    case 'signout':setTok('');ENT.signedIn=false;ENT.pro=false;ENT.uid='';setLastPro(false);ui.confirmDelAcct=false;render();toast('Signed out. Your tasks stay on this device.');break;
    case 'useCloud':resolveConflict(true);break;
    case 'keepLocal':resolveConflict(false);break;
    case 'deleteacct':ui.confirmDelAcct=true;render();break;
    case 'deleteno':ui.confirmDelAcct=false;render();break;
    case 'deleteyes':deleteAccount();break;
    case 'gopro':ui.paywall='general';render();break;
    case 'gopro2':ui.paywall='report';render();break;
    case 'manage':if(ENT.cfg.provider==='stripe')managePlan();else{ui.confirmCancel=true;render();}break;
    case 'cancelyes':managePlan();break;
    case 'cancelno':ui.confirmCancel=false;render();break;
    case 'cleardemo':
      S.tasks=S.tasks.filter(function(x){return !x.demo;});S.sessions=S.sessions.filter(function(x){return !x.demo;});S.races=S.races.filter(function(x){return !x.demo;});
      if(S.timer&&S.timer.taskId&&!taskById(S.timer.taskId))S.timer.taskId=null;
      if(ui.raceOpen&&!S.races.some(function(r){return r.id===ui.raceOpen;}))ui.raceOpen=null;
      S.demo=false;save();render();toast('Examples cleared. Start with your own.');break;
    case 'erase':ui.confirmErase=true;render();break;
    case 'eraseno':ui.confirmErase=false;render();break;
    case 'eraseyes':eraseAll();break;
  }
}
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-action]');if(!b)return;
  var _a=b.getAttribute('data-action');if((_a==='paywallbg'||_a==='loginbg')&&e.target!==b)return;
  act(b.getAttribute('data-action'),{v:b.getAttribute('data-v'),id:b.getAttribute('data-id'),r:b.getAttribute('data-r'),s:b.getAttribute('data-s')});
});
document.addEventListener('input',function(e){
  var el=e.target;
  if(el.id==='tTitle'){
    ui.draft.title=el.value;
    if(!ui.draft.edited){var st=$('#tStep');var sg=el.value.trim()?suggestStep(el.value):'';if(st)st.value=sg;ui.draft.step=sg;}
  }else if(el.id==='tStep'){ui.draft.step=el.value;ui.draft.edited=true;}
  else if(el.id==='tWhen'){ui.draft.when=el.value;}
  else if(el.id==='rGoal'&&ui.raceForm){ui.raceForm.goal=el.value;}
  else if(/^qa\d+$/.test(el.id)&&ui.raceForm&&ui.raceForm.qs){var qi=ui.raceForm.qs[Number(el.id.slice(2))];if(qi)qi.a=el.value;}
  else if(el.id==='evDate'&&ui.raceForm&&ui.raceForm.event){ui.raceForm.event.date=el.value;}
  else if(el.id==='demoName'){ui.demoName=el.value;}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!ui.conflict){if(ui.login){ui.login=false;ui.afterLogin='';render();}else if(ui.paywall){ui.paywall=null;ui.payErr='';render();}}
  if(e.key==='Enter'&&e.target&&e.target.id==='demoName'){e.preventDefault();act('demologin',{});}});
document.addEventListener('change',function(e){if(e.target.id==='fTask'){ui.focusTask=e.target.value;ui.len=null;render();}});
document.addEventListener('submit',function(e){
  var f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();
  if(f.getAttribute('data-form')==='add'){
    var title=clip($('#tTitle').value,90);
    if(!title){toast('Write the task first.');$('#tTitle').focus();return;}
    var step=clip($('#tStep').value,140)||suggestStep(title);
    S.tasks.push({id:uid(),title:title,step:step,when:clip($('#tWhen').value,80),created:Date.now(),started:null,done:null});
    ui.draft={title:'',step:'',when:'',edited:false};save();render();toast('Added. Start with the first step: 2 minutes.');
  }else{
    var txt=clip($('#parkIn').value,120);if(!txt)return;
    S.parked.unshift({id:uid(),text:txt,ts:Date.now()});save();render();var p=$('#parkIn');if(p)p.focus();
  }
});


/* ---------- pause, restart, re-plan ---------- */
function isPaused(){return !!(S.pause&&S.pause.since);}
function inPause(d){
  if(isPaused()&&d>=startOfDay(S.pause.since))return true;
  return (S.pauses||[]).some(function(p){return d>=p.from&&d<p.to;});
}
function respread(r){
  var today=startOfDay(Date.now()),rem=r.laps.filter(function(l){return l.steps.some(function(s){return !s.done;});});
  if(!rem.length)return;
  var end=parseYmd(r.due);
  if(end<=today){if(r.event)return;end=addDays(today,rem.length*7);r.due=ymd(end);}
  var span=end-today,tw=rem.reduce(function(a,l){return a+(l.w||1);},0),cum=0;
  rem.forEach(function(l){cum+=(l.w||1);l.due=ymd(today+span*cum/tw);});
}
function capacity(r){
  var need=0;r.laps.forEach(function(l){l.steps.forEach(function(s){if(!s.done)need+=s.min;});});
  var dl=Math.max(0,daysLeft(r));return {need:need,have:Math.round(dl*r.mins*0.8),days:dl};
}
function routeStats(r){
  var tot=0,dn=0,exp=0,today=startOfDay(Date.now()),prev=startOfDay(r.created);
  r.laps.forEach(function(l){
    var lm=0,ld=0;l.steps.forEach(function(s){lm+=s.min;if(s.done)ld+=s.min;});
    tot+=lm;dn+=ld;
    var due=parseYmd(l.due);
    if(due<=today)exp+=lm;else if(today>prev)exp+=lm*(today-prev)/Math.max(DAY,due-prev);
    prev=Math.max(prev,due);
  });
  var pct=tot?Math.round(dn/tot*100):0,ex=tot?Math.min(100,Math.round(exp/tot*100)):0,diff=pct-ex;
  return {pct:pct,exp:ex,state:diff>=5?'ahead':(diff>=-10?'on track':'behind')};
}
function fmtDateY(s){return new Date(parseYmd(s)).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}
function pauseNow(){S.pause={since:Date.now()};save();ui.reset=true;render();}
function resumeNow(){
  if(!isPaused())return;
  var today=startOfDay(Date.now()),days=Math.max(0,Math.round((today-startOfDay(S.pause.since))/DAY)),moved=0,fixed=0;
  S.pauses.push({from:startOfDay(S.pause.since),to:today});S.pauses=S.pauses.slice(-60);S.pause=null;
  S.races.forEach(function(r){
    if(r.demo)return;
    if(!r.event&&days>0){r.due=ymd(addDays(parseYmd(r.due),days));moved++;}else if(r.event)fixed++;
    respread(r);
  });
  save();ui.reset=true;render();
  toast(!S.races.some(function(r){return !r.demo;})?'Welcome back.':(moved?'Welcome back. Finish dates moved '+days+' day'+(days===1?'':'s')+'.':'Welcome back. Your dates are re-planned.'));
}
function lastActive(){
  var m=0;S.tasks.forEach(function(t){if(!t.demo){m=Math.max(m,t.done||0,t.started||0);}});
  S.sessions.forEach(function(s){if(!s.demo)m=Math.max(m,s.start);});return m;
}
function nextStepInfo(){
  for(var i=0;i<S.races.length;i++){
    var r=S.races[i];if(r.demo)continue;
    for(var j=0;j<r.laps.length;j++){var s=r.laps[j].steps.find(function(x){return !x.done;});if(s)return {r:r,l:r.laps[j],li:j,s:s};}
  }
  return null;
}
function nextStepText(){
  var n=nextStepInfo();if(n)return 'Lap '+(n.li+1)+': '+n.s.text+' ('+Math.min(n.s.min,10)+' min is enough to start)';
  var o=openTasks()[0];return o?('Start with: '+o.step+(o.when?' ('+o.when+')':'')):'Add one thing you have been putting off.';
}
function restartNow(){
  var n=nextStepInfo(),t=null;
  if(n){
    t=n.s.taskId?taskById(n.s.taskId):null;
    if(!t||t.done){t={id:uid(),title:n.s.text,step:suggestStep(n.s.text),created:Date.now(),started:null,done:null};S.tasks.push(t);n.s.taskId=t.id;}
  }else t=openTasks()[0]||null;
  ui.welcomeOff=ymd(Date.now());startSprint(t?t.id:null,2);
}
function replanAll(){var n=0;S.races.forEach(function(r){if(!r.demo){respread(r);n++;}});ui.welcomeOff=ymd(Date.now());save();render();toast(n?'Dates re-planned from today.':'No races to re-plan.');}
function shrinkLap(rid,lid){
  var r=S.races.find(function(x){return x.id===rid;}),l=r&&r.laps.find(function(x){return x.id===lid;});if(!l)return;
  var und=l.steps.filter(function(s){return !s.done;});if(und.length<2)return;
  var keep=Math.ceil(und.length/2),drop=und.slice(keep);
  l.steps=l.steps.filter(function(s){return drop.indexOf(s)<0;});l.later=(l.later||[]).concat(drop);
  save();render();toast(drop.length+' step'+(drop.length===1?'':'s')+' set aside. You can bring them back.');
}
function unshrinkLap(rid,lid){
  var r=S.races.find(function(x){return x.id===rid;}),l=r&&r.laps.find(function(x){return x.id===lid;});if(!l||!l.later)return;
  l.steps=l.steps.concat(l.later);l.later=[];save();render();
}
function lapTools(r,l,i,st){
  if(r.demo)return '';
  var und=l.steps.filter(function(s){return !s.done;}).length,h='';
  if(und>=2&&(i===st.cur||parseYmd(l.due)<startOfDay(Date.now())))h+='<button type="button" class="btn small" data-action="shrink" data-r="'+r.id+'" data-s="'+l.id+'">Shrink this lap</button> ';
  if(l.later&&l.later.length)h+='<button type="button" class="btn small ghost" data-action="unshrink" data-r="'+r.id+'" data-s="'+l.id+'">Bring back '+l.later.length+' step'+(l.later.length===1?'':'s')+'</button>';
  return h?'<div class="row" style="margin-top:10px">'+h+'</div>':'';
}
function vRoute(r){
  var rs=routeStats(r),st=raceStats(r),cap=capacity(r),over=daysLeft(r)<0;
  var h='<section class="card"><div class="wins-head"><h2>Route to your goal</h2><span class="tag">'+rs.pct+'% there</span></div><div class="bar"><i style="width:'+rs.pct+'%"></i></div>'+
    '<p class="note mono" style="margin:8px 0 0">'+(over?'Past the finish date':rs.state)+' · the plan expects '+rs.exp+'% by today · '+esc(leftText(r))+'</p>';
  if(!r.demo&&(rs.state==='behind'||over))h+='<p style="margin-top:10px">You are behind the dates. That is fixable: re-plan spreads what is left over the days you still have.</p><button type="button" class="btn small primary" data-action="replan">Re-plan my dates</button>';
  if(!r.demo&&cap.need>cap.have&&!over)h+='<p class="note" style="margin-top:10px">Heads up: about '+Math.round(cap.need/60)+' h of steps are left, but your daily time gives about '+Math.round(cap.have/60)+' h before the finish. Shrink a lap, add daily time, or move the date.</p>';
  h+='<ol class="route"><li class="rt done"><i></i><div><b>Start</b><span>'+esc(fmtDateY(ymd(r.created)))+'</span></div></li>';
  r.laps.forEach(function(l,i){
    var full=l.steps.length>0&&l.steps.every(function(s){return s.done;}),now=i===st.cur;
    h+='<li class="rt'+(full?' done':'')+(now?' now':'')+'"><i></i><div><b>Lap '+(i+1)+' · '+esc(l.title)+'</b><span>'+esc(fmtDateY(l.due))+'</span>'+(l.milestone?'<span>Checkpoint: '+esc(l.milestone)+'</span>':'')+(now?'<em>You are here</em>':'')+'</div></li>';
  });
  h+='<li class="rt fin'+(st.cur<0?' done':'')+'"><i></i><div><b>'+esc(r.event?r.event.name:'Finish line')+'</b><span>'+esc(fmtDateY(r.due))+'</span>'+(r.event?'<span>'+(r.event.source?'Source: '+esc(r.event.source)+'. ':'')+'Dates can change, so confirm on the official site.</span>':'')+'</div></li></ol></section>';
  return h;
}
function dueTool(r){
  if(r.demo)return '';
  var min=ymd(addDays(startOfDay(Date.now()),1));
  return '<div><label class="lbl" for="rDue">Finish date</label><div class="row"><input id="rDue" type="date" min="'+min+'" value="'+esc(r.due)+'" style="max-width:190px"><button type="button" class="btn small" data-action="racedue" data-id="'+r.id+'">Update and re-plan</button></div><p class="note" style="margin-top:8px">If the real date changes, set it here. Your remaining laps are re-spread to fit.</p></div>';
}
function pauseBtn(){
  if(isPaused()||!S.races.some(function(r){return !r.demo;})&&!S.tasks.some(function(t){return !t.demo;}))return '';
  return '<section class="card"><h2>Need a break?</h2><p class="note" style="margin:6px 0 10px">Pause everything. Your streak is safe, and when you come back your dates are re-planned for you.</p><button type="button" class="btn" data-action="pauseplan">Pause my plans</button></section>';
}

/* ---------- Today extras: welcome back, break, weekly card, seasons ---------- */
var TPL=[['Semester exams','Prepare for my semester exams',8],['Placement prep','Get placement-ready for campus interviews',26],['CAT / MBA entrance','Crack the CAT exam',52],['Internship hunt','Land a summer internship',12]];
function seasonCard(){
  var d=new Date(),m=d.getMonth(),day=d.getDate(),y=d.getFullYear(),key='',h='';
  if((m===0&&day<=20)||(m===5&&day>=15)||m===6||(m===7&&day<=20)){key='term'+y+(m<=4?'a':'b');h='<h2>New semester, fresh start</h2><p class="sub" style="margin:6px 0 12px">Pick one goal for this term and get a plan that fits it.</p><button type="button" class="btn primary" data-action="newprefill" data-v="4">Plan this semester</button> ';}
  else if((m===10&&day>=10)||m===11&&day<=20||(m===3&&day>=10)||(m===4&&day<=20)){key='exam'+y+(m>=9?'a':'b');h='<h2>Exam season</h2><p class="sub" style="margin:6px 0 12px">Turn the last few weeks into a plan you can actually follow.</p><button type="button" class="btn primary" data-action="newprefill" data-v="0">Plan my exam weeks</button> ';}
  if(!key||S.seen[key])return '';
  return '<section class="card">'+h+'<button type="button" class="btn ghost" data-action="seen" data-v="'+key+'">Not now</button></section>';
}
function weekView(){
  var now=Date.now(),sum=function(a){return a.reduce(function(x,s){return x+s.min;},0);};
  var m1=sum(S.sessions.filter(function(s){return s.start>=now-WEEK;})),m0=sum(S.sessions.filter(function(s){return s.start<now-WEEK&&s.start>=now-2*WEEK;}));
  return {o:stats(),m1:m1,m0:m0,done:S.tasks.filter(function(t){return t.done&&t.done>=now-WEEK;}).length};
}
function weekCard(){
  var w=weekView();if(!w.m1&&!w.done)return '';
  var o=w.o,line='';
  if(o.unlocked&&ENT.pro){var p=Math.round((o.baseline-o.recent)/o.baseline*100);if(p>=1)line=' · starting '+p+'% sooner';}
  return '<section class="card"><div class="wins-head" style="margin-bottom:8px"><h2>Your week</h2><span class="tag">'+o.streak+'-day streak</span></div><p class="mono" style="margin:0 0 12px">'+w.m1+' min focus · '+w.done+' task'+(w.done===1?'':'s')+' done'+esc(line)+'</p><button type="button" class="btn small" data-action="sharecard">Share as image</button></section>';
}
function welcomeBack(){
  if(isPaused())return '<section class="card"><div class="tag">On a break since '+esc(fmtDate(ymd(S.pause.since)))+'</div><h2 style="margin-top:6px">Take the time you need</h2><p class="sub" style="margin:6px 0 12px">Nothing is lost. When you resume, your dates are re-planned for you.</p><button type="button" class="btn primary big" data-action="resumeplan">Resume and re-plan</button></section>';
  var la=lastActive();
  if(!la||Date.now()-la<2*DAY||ui.welcomeOff===ymd(Date.now()))return '';
  if(!nextStepInfo()&&!openTasks().length)return '';
  var behind=S.races.some(function(r){return !r.demo&&daysLeft(r)>=0&&routeStats(r).state==='behind'||!r.demo&&daysLeft(r)<0&&!r.event;});
  return '<section class="card"><div class="tag">Welcome back</div><h2 style="margin-top:6px">Restart in 2 minutes</h2><p class="sub" style="margin:6px 0 12px">No catching up. Just this one small step:</p><p style="margin:0 0 14px"><b>'+esc(nextStepText())+'</b></p>'+
    '<button type="button" class="btn primary big" data-action="restart">Start 2 minutes</button>'+(behind?'<button type="button" class="btn" data-action="replan" style="margin-top:8px">Re-plan my dates first</button>':'')+
    '<button type="button" class="btn ghost" data-action="welcomeoff" style="margin-top:6px">Not now</button></section>';
}
function todayExtras(){return welcomeBack()+seasonCard()+weekCard();}
function shareCard(){
  var w=weekView(),c=document.createElement('canvas'),x=null;c.width=1080;c.height=1350;
  try{x=c.getContext('2d');}catch(e){}
  if(!x){toast('Sharing images is not supported on this browser.');return;}
  x.fillStyle='#0A0A0A';x.fillRect(0,0,1080,1350);x.fillStyle='#F5F5F5';x.textBaseline='alphabetic';
  x.font='600 40px system-ui,-apple-system,Segoe UI,sans-serif';x.fillText('S T A R T L I N E',90,150);
  x.fillRect(90,190,900,3);
  x.font='700 300px system-ui,-apple-system,Segoe UI,sans-serif';x.fillText(String(w.m1),90,560);
  x.font='500 56px system-ui,-apple-system,Segoe UI,sans-serif';x.fillText('minutes of focus this week',90,650);
  x.fillStyle='#9A9A9A';x.font='500 52px system-ui,-apple-system,Segoe UI,sans-serif';
  x.fillText(w.done+' task'+(w.done===1?'':'s')+' finished',90,790);
  x.fillText(w.o.streak+'-day streak',90,870);
  if(w.o.unlocked&&ENT.pro){var p=Math.round((w.o.baseline-w.o.recent)/w.o.baseline*100);if(p>=1)x.fillText('Starting '+p+'% sooner than week one',90,950);}
  x.fillStyle='#F5F5F5';x.font='600 44px system-ui,-apple-system,Segoe UI,sans-serif';x.fillText('Start before you feel ready.',90,1230);
  c.toBlob(function(b){
    if(!b)return;
    var f=null;try{f=new File([b],'startline-week.png',{type:'image/png'});}catch(e){}
    if(f&&navigator.canShare&&navigator.canShare({files:[f]})){navigator.share({files:[f],text:'My week on Startline'}).catch(function(){});return;}
    var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='startline-week.png';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},4000);toast('Image saved. Post it anywhere.');
  },'image/png');
}

/* ---------- daily nudge ---------- */
function lget(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}
function lset(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function usualHour(){
  var hs=[],since=Date.now()-30*DAY;
  S.tasks.forEach(function(t){if(!t.demo&&t.started&&t.started>since)hs.push(new Date(t.started).getHours());});
  S.sessions.forEach(function(s){if(!s.demo&&s.start>since)hs.push(new Date(s.start).getHours());});
  if(hs.length<3)return 18;hs.sort(function(a,b){return a-b;});return hs[Math.floor(hs.length/2)];
}
function fmtHour(h){return (h%12||12)+(h<12?' am':' pm');}
function nudge(body){
  try{
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return false;
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){navigator.serviceWorker.getRegistration().then(function(r){if(r)r.showNotification('Startline',{body:body,tag:'nudge'});else new Notification('Startline',{body:body});}).catch(function(){});return true;}
    new Notification('Startline',{body:body});return true;
  }catch(e){return false;}
}
setInterval(function(){
  var R=S.remind;if(!R||!R.on||isPaused())return;
  var n=new Date(),hr=R.hour>=0?R.hour:usualHour();
  if(n.getHours()<hr||n.getHours()>22)return;
  var k=ymd(n.getTime());if(lget('startline.nudge')===k)return;
  var sod=startOfDay(n.getTime());
  if(S.sessions.some(function(s){return s.start>=sod;})||S.tasks.some(function(t){return t.started&&t.started>=sod;}))return;
  if(!S.tasks.length&&!S.races.length)return;
  lset('startline.nudge',k);
  var b=nextStepText();if(document.hidden)nudge(b);else toast('Time to start: '+b);
},60000);
function remindRow(){
  var R=S.remind||{on:false,hour:-1},on=!!R.on,auto=R.hour<0;
  var can=typeof Notification!=='undefined'&&Notification.permission!=='denied';
  if(!can)return '<div class="lbl">Daily nudge</div><p class="note">Notifications are blocked or not supported in this browser.</p>';
  return '<div class="lbl">Daily nudge</div><div class="chips">'+chip('Off',!on,'remind','off')+chip('Usual time ('+fmtHour(usualHour())+')',on&&auto,'remind','auto')+[8,13,18,21].map(function(h){return chip(fmtHour(h),on&&!auto&&R.hour===h,'remind',h);}).join('')+'</div>'+
    '<p class="note" style="margin-top:8px">One reminder a day, only if you have not started yet. It arrives while Startline is open in a tab or on your home screen. Reminders with the app fully closed need a push service, which is not added yet.</p>';
}

/* ---------- crew: friends with a shared goal ---------- */
var BKEY='startline.buddy',bT=0;
function rooms(){try{var a=JSON.parse(localStorage.getItem(BKEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function setRooms(a){lset(BKEY,JSON.stringify(a.slice(0,5)));}
function weekFocusMin(){var now=Date.now();return S.sessions.filter(function(s){return s.start>=now-WEEK;}).reduce(function(a,s){return a+s.min;},0);}
function rerenderRace(){
  if(ui.tab!=='race'||!ui.crewOpen)return;
  var el=document.activeElement;if(el&&/INPUT|TEXTAREA/.test(el.tagName))return;
  render();
}
function buddyPing(started,force){
  if(!ENT.signedIn)return;var L=rooms();if(!L.length)return;
  var now=Date.now();if(!force&&!started&&now-bT<4000)return;bT=now;
  var m=weekFocusMin();
  L.forEach(function(x){
    api('/api/buddy/update',{code:x.code,started:!!started,min:m}).then(function(v){ui.rv[x.code]=v;rerenderRace();}).catch(function(e){
      if(e&&e.code==='no_room'){setRooms(rooms().filter(function(y){return y.code!==x.code;}));rerenderRace();}
    });
  });
}
function crewRow(){
  var n=rooms().length;
  return '<button type="button" class="card racecard" data-action="crewopen"><div><div class="tag">With friends</div><h2 style="margin-top:4px">Your crew</h2></div><div class="note">'+(n?n+' crew'+(n===1?'':'s')+' · tap to open':'Share one goal with friends and see each other progress')+'</div></button>';
}
function vCrew(){
  return '<button type="button" class="btn ghost small" data-action="raceback" style="align-self:flex-start">Back</button><div class="head"><div class="eyebrow">Friends</div><h1>Your crew</h1><p class="sub">Team up on one shared goal. Everyone sees the same finish line and each other\'s progress.</p></div>'+vBuddy();
}
function vBuddy(){
  var h='<section class="card"><div class="wins-head"><h2>Your crews</h2><span class="tag">private</span></div><p class="note" style="margin:0 0 10px">Friends in your crew see only your nickname, whether you started today, and your focus minutes this week. No chat, nothing else. Use a nickname, not your full name.</p>';
  if(!ENT.signedIn)return h+'<button type="button" class="btn" data-action="login">Sign in to start a crew</button></section>';
  var L=rooms();
  L.forEach(function(x){
    var v=ui.rv[x.code];
    h+='<div class="room"><div class="row" style="justify-content:space-between"><span class="tag mono">Code '+esc(x.code)+'</span><span class="row"><button type="button" class="btn small" data-action="bcopy" data-v="'+esc(x.code)+'">Copy invite</button><button type="button" class="btn small ghost" data-action="bleave" data-v="'+esc(x.code)+'">Leave</button></span></div>';
    if(v)h+='<ul class="list">'+v.members.slice().sort(function(a,b){return (b.started-a.started)||(b.min-a.min);}).map(function(m){
      return '<li class="item"><div class="body"><div class="t">'+esc(m.nick)+(m.me?' (you)':'')+'</div><div class="s mono">'+m.min+' min this week</div></div><span class="tag">'+(m.started?'Started today':'Not yet')+'</span></li>';
    }).join('')+'</ul>';
    else h+='<p class="note" style="margin-top:8px">Loading...</p>';
    if(v)h+=goalBlock(x.code,v);
    h+='</div>';
  });
  if(L.length<5)h+='<label class="lbl" for="bNick">Your nickname</label><input id="bNick" type="text" maxlength="16" placeholder="e.g. Jish" value="'+esc(lget('startline.nick'))+'">'+
    '<div class="row" style="margin-top:10px"><button type="button" class="btn small primary" data-action="bcreate">Start a crew</button></div>'+
    '<label class="lbl" for="bCode">Have an invite code?</label><div class="row"><input id="bCode" type="text" maxlength="6" placeholder="6 characters" style="max-width:150px;text-transform:uppercase"><button type="button" class="btn small" data-action="bjoin">Join</button></div>';
  if(ui.bErr)h+='<p class="err" role="alert" style="margin-top:10px">'+esc(ui.bErr)+'</p>';
  return h+'</section>';
}
function goalBlock(code,v){
  var g=v.goal;
  if(!g){
    if(ui.gOpen!==code)return '<div style="margin-top:12px"><button type="button" class="btn small" data-action="gopen" data-v="'+esc(code)+'">Set a shared goal</button></div>';
    var min=ymd(addDays(startOfDay(Date.now()),1));
    return '<div class="goalbox"><h3 style="margin:0 0 4px">Shared goal</h3><p class="note" style="margin:0 0 8px">Any goal, big or small, short or long: fitness, money, a project, exams. One goal for the whole crew. It is <b>locked</b> once created, so nobody can move the goalposts.</p>'+
      '<label class="lbl" for="gTitle">Goal</label><input id="gTitle" type="text" maxlength="80" placeholder="e.g. Run a 10K together, save for the trip, launch our side project">'+
      '<label class="lbl" for="gDue">Finish date</label><input id="gDue" type="date" min="'+min+'" style="max-width:190px">'+
      '<label class="lbl" for="gSteps">Steps, one per line (2 to 12)</label><textarea id="gSteps" rows="5" maxlength="1400" placeholder="Run 3 km without stopping&#10;Run 5 km&#10;Run the 10K"></textarea>'+
      '<div class="row" style="margin-top:10px"><button type="button" class="btn small primary" data-action="gsave" data-v="'+esc(code)+'">Lock in the goal</button><button type="button" class="btn small ghost" data-action="gclose">Cancel</button></div></div>';
  }
  var left=Math.ceil((parseYmd(g.due)-startOfDay(Date.now()))/DAY),tot=0,dn=0;
  v.members.forEach(function(m){tot+=m.of;dn+=m.done;});
  var pct=tot?Math.round(dn/tot*100):0,mine=v.myDone||[];
  var h='<div class="goalbox"><div class="wins-head" style="margin-bottom:6px"><h3 style="margin:0;overflow-wrap:anywhere">'+esc(g.title)+'</h3><span class="tag">Locked</span></div>'+
    '<p class="note mono" style="margin:0 0 8px">Finish '+esc(fmtDateY(g.due))+' · '+(left>0?left+' day'+(left===1?'':'s')+' left':(left===0?'due today':'past the date'))+' · group '+pct+'%</p><div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<ul class="list" style="margin-top:10px">'+v.members.map(function(m){
      return '<li class="item"><div class="body"><div class="t">'+esc(m.nick)+(m.me?' (you)':'')+'</div><div class="bar" style="margin-top:6px"><i style="width:'+(m.of?Math.round(m.done/m.of*100):0)+'%"></i></div></div><span class="tag mono">'+m.done+'/'+m.of+'</span></li>';
    }).join('')+'</ul><div class="lbl">Your steps</div><ul class="list">'+g.steps.map(function(st){
      var on=mine.indexOf(st.id)>=0;
      return '<li class="item'+(on?' dn':'')+'"><button type="button" class="check'+(on?' on':'')+'" data-action="gstep" data-v="'+esc(code)+'" data-id="'+esc(st.id)+'" aria-label="'+(on?'Undo: ':'Mark done: ')+esc(st.text)+'"></button><div class="body"><div class="t">'+esc(st.text)+'</div></div></li>';
    }).join('')+'</ul></div>';
  return h;
}
async function goalSave(code){
  var steps=(($('#gSteps')||{}).value||'').split('\n').map(function(x){return clip(x,100);}).filter(Boolean);
  ui.bErr='';
  try{
    var v=await api('/api/buddy/goal',{code:code,title:clip(($('#gTitle')||{}).value,80),due:($('#gDue')||{}).value||'',steps:steps});
    ui.rv[code]=v;ui.gOpen='';toast('Shared goal locked in.');
  }catch(e){ui.bErr=e.message;if(e.code==='goal_locked')ui.gOpen='';}
  render();
}
async function goalStep(code,id){
  var v=ui.rv[code];if(!v||!v.goal)return;
  var mine=(v.myDone||[]).slice(),i=mine.indexOf(id);if(i>=0)mine.splice(i,1);else mine.push(id);
  v.myDone=mine;var me=v.members.find(function(m){return m.me;});if(me)me.done=mine.length;
  render();
  try{ui.rv[code]=await api('/api/buddy/update',{code:code,started:i<0,min:weekFocusMin(),done:mine});rerenderRace();}catch(e){ui.bErr=e.message;render();}
}
async function buddyJoin(create){
  var nick=clip(($('#bNick')||{}).value,16),code=clip(($('#bCode')||{}).value,6).toUpperCase();
  ui.bErr='';
  if(!nick){ui.bErr='Pick a nickname first.';render();return;}
  if(!create&&code.length!==6){ui.bErr='Enter the 6-character code.';render();return;}
  lset('startline.nick',nick);
  try{
    var v=await api(create?'/api/buddy/create':'/api/buddy/join',create?{nick:nick}:{code:code,nick:nick});
    var L=rooms().filter(function(x){return x.code!==v.code;});L.push({code:v.code});setRooms(L);ui.rv[v.code]=v;
    if(create)toast('Crew started. Copy the invite and send it to a friend.');
    buddyPing(false,true);
  }catch(e){if(e.code==='login_required'){ui.afterLogin='';ui.login=true;}else ui.bErr=e.message;}
  ui.reset=false;render();
}

/* ---------- walkthrough ---------- */
var TOUR=[
 {t:'Welcome to Startline',b:'Startline helps you begin the things you keep putting off. No guilt, and no big system to maintain. This tour takes one minute.'},
 {t:'Today: just begin',b:'Add one thing you have been putting off. We suggest a tiny first step. Tap Start 2 min and begin.',tip:'Two minutes is enough to get past the hardest part, which is starting.'},
 {t:'Focus: short sprints',b:'For longer work, pick a task and a length: 15, 25 or 45 minutes. When it ends, tell us how focused you felt.',tip:'A distracting thought? Park it on the list so it can wait.'},
 {t:'Race: big goals, real dates',b:'For a bigger goal like an exam, an interview or a fitness target, type it and answer a few questions. You get a plan made for you, up to 2 years long. For dated goals like CAT, we look up the real date.',tip:'The route map shows how close you are. If you fall behind, one tap re-plans your dates.'},
 {t:'Report: see that it works',b:'After two weeks you can see how much sooner you start compared with your first week. Your streak forgives one missed day a week, and you can pause your plans any time.'},
 {t:'Friends and reminders',b:'Start a crew with friends to share one goal. It is locked once created, and everyone ticks off their own steps. Turn on a daily nudge in Report, then Settings.',tip:'You can replay this tour from Report, then Settings.'}
];
function showTour(){return ui.tourOn===true||(ui.tourOn!==false&&lget('startline.tour')!=='1');}
function vTour(){
  var n=Math.min(ui.tourStep,TOUR.length-1),st=TOUR[n],last=n===TOUR.length-1;
  return '<div class="sheet-back"><div class="sheet tour" role="dialog" aria-modal="true" aria-label="How Startline works"><div class="dots" aria-hidden="true">'+TOUR.map(function(x,i){return '<i'+(i===n?' class="on"':'')+'></i>';}).join('')+'</div>'+
    '<div class="eyebrow">Step '+(n+1)+' of '+TOUR.length+'</div><h2 style="font-size:24px">'+esc(st.t)+'</h2><p>'+esc(st.b)+'</p>'+(st.tip?'<p class="note">'+esc(st.tip)+'</p>':'')+
    '<div class="row">'+(n?'<button type="button" class="btn" data-action="tourback">Back</button>':'')+'<button type="button" class="btn primary" style="flex:1" data-action="'+(last?'tourdone':'tournext')+'">'+(last?'Start using Startline':'Next')+'</button></div>'+
    (last?'':'<button type="button" class="btn ghost small" data-action="tourdone" style="align-self:center">Skip the tour</button>')+'</div></div>';
}

/* ---------- start ---------- */
if('serviceWorker' in navigator){try{navigator.serviceWorker.register('/sw.js').catch(function(){});}catch(e){}}
render();
if(S.timer&&!S.timer.ended&&!S.timer.paused&&S.timer.endAt<=Date.now())endSprint();
boot();
})();
