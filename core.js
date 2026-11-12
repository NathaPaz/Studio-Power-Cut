/* Studio Power Cut: núcleo (dados, regras de horário, componentes e rotas).
   Com SUPABASE_URL e chave em config.js, tudo vai para o Supabase.
   Sem config, o site roda em modo de teste, salvando só neste navegador. */
(function(){
"use strict";
var S=window.SPC={};
var CONFIG=window.SPC_CONFIG||{};
var sb=null;
try{if(CONFIG.supabaseUrl&&CONFIG.supabaseAnonKey&&window.supabase)sb=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey)}catch(e){sb=null}
S.REMOTE=!!sb;
/* Estado em memória. bk = agendamentos (para o cliente, só os horários ocupados). */
var st=S.st={shop:null,bk:[],ex:[],session:null,exp:[],comm:{},goal:0};

/* ---------- utilidades ---------- */
var TZ="America/Sao_Paulo";
var MON=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
var MONF=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
var DOW=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
var DOWF=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
S.DOW=DOW;S.DOWF=DOWF;S.MON=MON;S.MONF=MONF;
var fmtBR=null;
try{fmtBR=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}catch(e){}
function brNow(){
  var d=new Date();
  if(fmtBR){var p={};fmtBR.formatToParts(d).forEach(function(x){p[x.type]=x.value});return {date:p.year+"-"+p.month+"-"+p.day,min:(+p.hour)*60+(+p.minute)}}
  return {date:S.dkey(d),min:d.getHours()*60+d.getMinutes()};
}
S.dkey=function(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)};
S.today=function(){return brNow().date};
S.nowMin=function(){return brNow().min};
function utc(k){return new Date(k+"T00:00:00Z")}
S.dow=function(k){return utc(k).getUTCDay()};
S.addDays=function(k,n){var d=utc(k);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
S.diffDays=function(a,b){return Math.round((utc(b)-utc(a))/864e5)};
S.dnum=function(k){return +k.slice(8,10)};
S.mon=function(k){return MON[+k.slice(5,7)-1]};
S.monf=function(k){return MONF[+k.slice(5,7)-1]};
S.fmtDay=function(k){return DOW[S.dow(k)]+", "+S.dnum(k)+" "+S.mon(k)};
S.fmtDayLong=function(k){return DOWF[S.dow(k)]+", "+S.dnum(k)+" de "+S.monf(k)};
S.fmtShort=function(k){return k.slice(8,10)+"/"+k.slice(5,7)};
S.monthStart=function(k){return k.slice(0,8)+"01"};
S.addMonths=function(k,n){var y=+k.slice(0,4),m=+k.slice(5,7)-1+n;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+"-"+("0"+(m+1)).slice(-2)+"-01"};
S.monthEnd=function(k){return S.addDays(S.addMonths(k,1),-1)};
S.esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
S.money=function(n){n=Number(n)||0;return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})};
S.num=function(v){var n=parseFloat(String(v).replace(/\./g,"").replace(",","."));return isNaN(n)?0:n};
S.toMin=function(t){var p=String(t).split(":");return +p[0]*60+ +p[1]};
S.fmt=function(m){var h=Math.floor(m/60),mm=m%60;return (h<10?"0":"")+h+":"+(mm<10?"0":"")+mm};
S.hh=function(t){var p=t.split(":");return p[1]==="00"?(+p[0])+"h":(+p[0])+"h"+p[1]};
S.digits=function(s){return String(s||"").replace(/\D/g,"")};
S.uid=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)};
S.maskPhone=function(v){
  var d=S.digits(v).slice(0,11);if(!d)return "";
  if(d.length<3)return "("+d;
  if(d.length<7)return "("+d.slice(0,2)+") "+d.slice(2);
  if(d.length<11)return "("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);
  return "("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7);
};
S.waLink=function(phone,text){
  var d=S.digits(phone);if(d.length<10)return "";
  return "https://wa.me/"+(d.length<=11?"55"+d:d)+(text?"?text="+encodeURIComponent(text):"");
};
S.isUrl=function(u){return /^https?:\/\/\S+$/i.test(u||"")};
S.load=function(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
S.save=function(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
S.barberName=function(id){var b=(st.shop.barbers||[]).filter(function(x){return x.id===id})[0];return b?b.name:"Ex-profissional"};
S.barberOf=function(id){return (st.shop.barbers||[]).filter(function(x){return x.id===id})[0]};
S.clientKey=function(b){var d=S.digits(b.phone);return d.length>=10?d:"n-"+String(b.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"-")};

/* ---------- ícones (traço fino, desenhados para este site) ---------- */
var P={
  today:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  cal:'<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  cash:'<path d="M4 17.5 9.5 12l3.5 3.2L20 7.5"/><path d="M15 7.5h5v5"/>',
  tune:'<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  right:'<path d="m9.5 6 6 6-6 6"/>',
  left:'<path d="m14.5 6-6 6 6 6"/>',
  down:'<path d="m6 9.5 6 6 6-6"/>',
  close:'<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chat:'<path d="M4.5 18.5 5.8 15A7.5 7.5 0 1 1 9 18.2z"/><path d="M9.2 9.6c.3 2 2 3.8 4 4.2l1.2-1.2-1.7-1-.8.6a3 3 0 0 1-1.4-1.4l.6-.8-1-1.7z"/>',
  pin:'<path d="M12 20.5s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="10.5" r="2.2"/>',
  user:'<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5"/>',
  trash:'<path d="M5 7h14M9.5 7V4.8h5V7M7 7l.8 12.5h8.4L17 7"/>',
  edit:'<path d="m5 19 .8-3.8L16 5l3 3-10.2 10.2z"/><path d="m14 7 3 3"/>',
  copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  ban:'<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  moon:'<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.3c-.5-.9-1.5-1.3-2.8-1.3-1.6 0-2.6.8-2.6 1.9 0 2.7 5.4 1.2 5.4 4 0 1.1-1.1 1.9-2.8 1.9-1.3 0-2.4-.5-3-1.5M12 6.5V8M12 16v1.5"/>',
  scissors:'<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.5 8.5 20 17M8.5 15.5 20 7"/>',
  bag:'<path d="M5.5 8h13l-1 11.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  play:'<path d="M9 6.5v11l9-5.5z"/>',
  star:'<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z"/>',
  users:'<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.2 2.8-5 6-5s5.5 1.8 6 5M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.8c1.8.6 2.8 2.2 3 4.7"/>',
  box:'<path d="M4 8 12 4l8 4v8.5L12 20.5 4 16.5z"/><path d="m4 8 8 4 8-4M12 12v8.5"/>',
  news:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9.5h8M8 13h8M8 16h4.5"/>',
  link:'<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-.8.8M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l.8-.8"/>',
  logout:'<path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10M14 8l4 4-4 4M18 12H9.5"/>',
  card:'<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10.5h17M7 15h3"/>',
  pix:'<path d="m12 4.5 7.5 7.5-7.5 7.5L4.5 12z"/><path d="M9.2 12 12 9.2l2.8 2.8L12 14.8z"/>',
  bill:'<rect x="3.5" y="7" width="17" height="10" rx="2"/><circle cx="12" cy="12" r="2.3"/>',
  shield:'<path d="M12 4 5 6.5v5c0 4 2.8 7 7 8.5 4.2-1.5 7-4.5 7-8.5v-5z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  bell:'<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14zM10 20.5a2 2 0 0 0 4 0"/>',
  swap:'<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
  dots:'<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'
};
S.ic=function(n,size,cls){return '<svg class="ic'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" width="'+(size||22)+'" height="'+(size||22)+'" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||"")+'</svg>'};

/* ---------- mensagens e janelas ---------- */
S.toast=function(m){
  var t=document.getElementById("toast");if(!t)return;
  t.textContent=m;t.classList.add("on");clearTimeout(S.toast.t);S.toast.t=setTimeout(function(){t.classList.remove("on")},2800);
};
var sheetEl=null,lastFocus=null;
S.closeSheet=function(){
  if(!sheetEl)return;var el=sheetEl;sheetEl=null;
  el.classList.remove("on");document.body.classList.remove("lock");
  setTimeout(function(){el.remove()},260);
  if(lastFocus&&lastFocus.focus)try{lastFocus.focus()}catch(e){}
};
/* Janela que sobe da base. mount(el, close) liga os botões. */
S.sheet=function(title,html,mount){
  S.closeSheet();lastFocus=document.activeElement;
  var el=document.createElement("div");el.className="sheet";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label",title);
  el.innerHTML='<div class="sheet-bg" data-x="1"></div><div class="sheet-box"><div class="grip"></div><div class="sheet-head"><h2>'+S.esc(title)+'</h2><button class="x" data-x="1" aria-label="Fechar">'+S.ic("close",20)+'</button></div><div class="sheet-body">'+html+'</div></div>';
  document.body.appendChild(el);document.body.classList.add("lock");
  el.addEventListener("click",function(e){if(e.target.closest("[data-x]"))S.closeSheet()});
  el.addEventListener("keydown",function(e){if(e.key==="Escape")S.closeSheet()});
  sheetEl=el;
  requestAnimationFrame(function(){el.classList.add("on");var f=el.querySelector("input,select,textarea,.sheet-body button");if(f&&!window.matchMedia("(pointer:coarse)").matches)f.focus()});
  if(mount)mount(el,S.closeSheet);
  return el;
};
S.confirm=function(title,text,yes,danger){
  return new Promise(function(res){
    var done=false;
    var el=S.sheet(title,'<p class="lead">'+S.esc(text)+'</p><div class="btnrow"><button class="btn ghost" data-x="1" id="cf-no">Voltar</button><button class="btn '+(danger?"danger":"")+'" id="cf-yes">'+S.esc(yes)+'</button></div>',function(el){
      el.querySelector("#cf-yes").onclick=function(){done=true;S.closeSheet();res(true)};
    });
    new MutationObserver(function(_,o){if(!document.body.contains(el)){o.disconnect();if(!done)res(false)}}).observe(document.body,{childList:true});
  });
};

/* ---------- loja padrão (modo de teste) ---------- */
var IMG={logo:"assets/logo.jpg",cover:"assets/cover.jpg",plano:"assets/plano.jpg",miguel:"assets/miguel.jpg",vitor:"assets/vitor.jpg",balm:"assets/balm.jpg",black:"assets/black.jpg",brilho:"assets/brilho.jpg",morango:"assets/morango.jpg",uva:"assets/uva.jpg",esponja:"assets/esponja.jpg",gel:"assets/gel.jpg",posbarba:"assets/posbarba.jpg"};
function baseShop(){
  return {id:"spc",slug:"studio-power-cut",name:"Studio Power Cut",tagline:"Barbearia Premium. Corte, barba e experiência completa.",
    city:"Porto Alegre, RS",address:"Rua Dona Firmina, 528",whatsapp:"(51) 98194-5319",instagram:"@studiopowercut",
    logo:IMG.logo,cover:IMG.cover,priceNote:"O preço pode variar conforme a data escolhida.",
    hours:{0:[["09:00","12:00"]],1:[["09:00","12:00"],["14:00","21:00"]],2:[["09:00","12:00"],["14:00","21:00"]],3:[["09:00","12:00"],["14:00","18:30"]],4:[["09:00","12:00"],["14:00","18:30"]],5:[["09:00","12:00"],["13:00","22:00"]],6:[["08:00","12:00"],["13:00","22:00"]]},
    services:[
      {id:"v1",name:"Barba",price:20,min:20},{id:"v2",name:"Corte",price:40,min:30},{id:"v3",name:"Corte + barba",price:60,min:45},
      {id:"v4",name:"Corte + barba + sobrancelha",price:70,min:60},{id:"v5",name:"Corte + luzes",price:120,min:120},
      {id:"v6",name:"Corte + pigmentação",price:70,min:40},{id:"v7",name:"Corte + pigmentação + sobrancelha",price:80,min:45},{id:"v8",name:"Corte + sobrancelha",price:50,min:40}],
    barbers:[{id:"b1",name:"Miguel",nick:"Neves",photo:IMG.miguel},{id:"b2",name:"Vitor Teixeira",nick:"Vitinho",photo:IMG.vitor}],
    products:[
      {id:"p1",name:"Balm hidratante",price:32,desc:"Hidrata pele, barba, bigode e cabelo.",img:IMG.balm,on:true},
      {id:"p2",name:"Cera black 120g",price:26,desc:"",img:IMG.black,on:true},{id:"p3",name:"Cera brilho 120g",price:26,desc:"",img:IMG.brilho,on:true},
      {id:"p4",name:"Cera modeladora - morango",price:26,desc:"",img:IMG.morango,on:true},{id:"p5",name:"Cera modeladora - uva",price:26,desc:"",img:IMG.uva,on:true},
      {id:"p6",name:"Esponja",price:40,desc:"",img:IMG.esponja,on:true},{id:"p7",name:"Gel cola 300g",price:24,desc:"Fixação extra forte, sem álcool.",img:IMG.gel,on:true},
      {id:"p8",name:"Pós barba 120ml",price:32,desc:"",img:IMG.posbarba,on:true}],
    courses:[{id:"c1",name:"Curso Studio Power Cut",price:0,info:"",desc:"Fale com a gente pelo WhatsApp para saber datas, conteúdo e valores.",video:"",img:""}],
    news:[{id:"n1",date:"2026-03-24",title:"Assinatura mensal",text:"Se você corta o cabelo toda semana ou de 15 em 15 dias, não faz sentido pagar avulso. Cabelo, barba e sobrancelha por R$ 179,99 (de R$ 280) ou só o corte por R$ 134,99 (de R$ 160). Chame no WhatsApp para saber como funciona.",img:IMG.plano}]
  };
}
/* Preenche o que faltar sem apagar campos desconhecidos (vitrines antigas continuam valendo). */
function normShop(c){
  c.id="spc";
  ["services","barbers","products","courses","news"].forEach(function(k){if(!Array.isArray(c[k]))c[k]=[]});
  if(!c.hours)c.hours=baseShop().hours;
  c.bufferMin=+c.bufferMin||0;c.slotStep=+c.slotStep||30;c.leadMin=+c.leadMin||0;c.cancelHours=c.cancelHours!=null?+c.cancelHours:2;
  return c;
}

/* ---------- banco de dados ---------- */
var K={shop:"spc4_shop",bk:"spc4_bookings",ex:"spc4_timeoff",exp:"spc4_expenses",comm:"spc4_comm",goal:"spc4_goal",ses:"spc4_session",last:"spc4_last"};
S.K=K;
function fromRow(r){return {id:r.id,barber:r.barber_id,date:r.day,start:r.start_min,dur:r.dur_min,services:r.services||[],total:Number(r.total),name:r.name||"",phone:r.phone||"",status:r.status,source:r.source,paid:r.paid_method||"",paidTotal:r.paid_total==null?null:Number(r.paid_total),commPct:r.commission_pct==null?null:Number(r.commission_pct),note:r.note||"",over:!!r.overbook,token:r.cancel_token||""}}
function toRow(b){return {barber_id:b.barber,day:b.date,start_min:b.start,dur_min:b.dur,services:b.services,total:b.total,name:b.name,phone:b.phone,status:b.status,source:b.source,paid_method:b.paid||null,paid_total:b.paidTotal==null?null:b.paidTotal,commission_pct:b.commPct==null?null:b.commPct,note:b.note||"",overbook:!!b.over}}
var PATCH={status:"status",paid:"paid_method",paidTotal:"paid_total",commPct:"commission_pct",note:"note",barber:"barber_id",date:"day",start:"start_min",dur:"dur_min",over:"overbook"};
S.ERR={
  slot_taken:"Esse horário acabou de ser ocupado. Escolha outro.",
  too_many:"Você já tem 3 horários marcados. Para marcar mais, fale com a barbearia.",
  bad_hours:"Esse horário não está mais disponível. Escolha outro.",
  bad_time:"Esse horário não está mais disponível. Escolha outro.",
  bad_date:"Esse dia não está mais disponível. Escolha outro.",
  bad_phone:"Confira o número do WhatsApp.",bad_name:"Confira o nome informado.",
  bad_services:"A lista de serviços mudou. Atualize a página e tente de novo.",
  bad_barber:"A equipe mudou. Atualize a página e tente de novo.",
  too_late:"Faltam menos de {h} horas para o horário. Para cancelar, fale com a barbearia.",
  not_cancellable:"Esse horário já foi cancelado ou concluído.",not_found:"Não encontramos esse agendamento.",
  other:"Não foi possível agora. Tente de novo ou chame a barbearia no WhatsApp."
};
function errCode(e){var m=/(slot_taken|too_many|too_late|not_cancellable|not_found|bad_[a-z]+|not_configured)/.exec((e&&e.message)||"");return m?m[1]:"other"}
function failSafe(fn){return function(){try{return Promise.resolve(fn.apply(null,arguments)).catch(function(){return false})}catch(e){return Promise.resolve(false)}}}

var DB=S.DB={
  init:async function(){
    if(S.REMOTE){
      var r=await sb.from("shop_config").select("config").eq("id",1).maybeSingle();
      if(r.error)throw r.error;
      st.shop=r.data&&r.data.config?normShop(r.data.config):null;
      var ss=await sb.auth.getSession();
      if(ss.data&&ss.data.session){var o=await sb.rpc("is_owner");if(o.data===true)st.session="owner";else await sb.auth.signOut()}
    }else{
      st.shop=normShop(S.load(K.shop,null)||baseShop());
      st.bk=S.load(K.bk,[]);st.ex=S.load(K.ex,[]);st.session=S.load(K.ses,null);
    }
  },
  saveShop:failSafe(async function(){
    if(!S.REMOTE)return S.save(K.shop,st.shop);
    var r=await sb.from("shop_config").update({config:st.shop}).eq("id",1).select("id");
    return !r.error&&!!r.data&&r.data.length===1;
  }),
  /* Cliente: horários ocupados e folgas dos próximos 60 dias. */
  loadBusy:failSafe(async function(){
    if(!S.REMOTE)return true;
    var from=S.today(),to=S.addDays(from,60);
    var r=await Promise.all([sb.rpc("get_busy",{p_from:from,p_to:to}),sb.rpc("get_exceptions",{p_from:from,p_to:to})]);
    if(r[0].error)return false;
    st.bk=(r[0].data||[]).map(function(x,i){return {id:"busy"+i,barber:x.barber_id,date:x.day,start:x.start_min,dur:x.dur_min,services:[],total:0,name:"",phone:"",status:x.blk?"bloqueio":"confirmado"}});
    st.ex=(r[1].data||[]).map(function(x){return {barber:x.barber_id,from:x.day_from,to:x.day_to,kind:x.kind,intervals:x.intervals||[]}});
    return true;
  }),
  /* Dono: tudo (agenda paginada, folgas, despesas, comissão e meta). */
  loadOwner:failSafe(async function(){
    if(!S.REMOTE)return true;
    var all=[],from=0,page=1000;
    for(;;){
      var r=await sb.from("bookings").select("*").order("day",{ascending:true}).order("start_min",{ascending:true}).order("id",{ascending:true}).range(from,from+page-1);
      if(r.error)return false;
      all=all.concat(r.data||[]);if(!r.data||r.data.length<page)break;from+=page;
    }
    st.bk=all.map(fromRow);
    var q=await Promise.all([sb.from("time_off").select("*").order("day_from",{ascending:true}),sb.from("expenses").select("*").order("day",{ascending:false}).limit(2000),sb.from("barber_finance").select("*"),sb.from("owner_settings").select("*").eq("id",1).maybeSingle()]);
    if(q[0].error||q[1].error||q[2].error)return false;
    st.ex=(q[0].data||[]).map(function(x){return {id:x.id,barber:x.barber_id,from:x.day_from,to:x.day_to,kind:x.kind,intervals:x.intervals||[],reason:x.reason||""}});
    st.exp=(q[1].data||[]).map(function(x){return {id:x.id,day:x.day,category:x.category,amount:Number(x.amount),note:x.note||""}});
    st.comm={};(q[2].data||[]).forEach(function(x){st.comm[x.barber_id]=Number(x.commission_pct)});
    st.goal=q[3].data?Number(q[3].data.monthly_goal)||0:0;
    return true;
  }),
  loadLocalOwner:function(){st.exp=S.load(K.exp,[]);st.comm=S.load(K.comm,{});st.goal=S.load(K.goal,0)},
  addBookings:failSafe(async function(list){
    if(!S.REMOTE){list.forEach(function(b){b.id=b.id||"k"+S.uid();st.bk.push(b)});S.save(K.bk,st.bk);return true}
    var r=await sb.from("bookings").insert(list.map(toRow)).select("*");
    if(r.error||!r.data)return false;
    r.data.forEach(function(x){st.bk.push(fromRow(x))});return true;
  }),
  /* patch usa os nomes do app (status, paid, paidTotal, date, start...). */
  updateBooking:failSafe(async function(id,patch){
    var b=st.bk.filter(function(x){return x.id===id})[0];if(!b)return false;
    if(S.REMOTE){
      var row={};Object.keys(patch).forEach(function(k){if(PATCH[k])row[PATCH[k]]=patch[k]===""&&k==="paid"?null:patch[k]});
      var r=await sb.from("bookings").update(row).eq("id",id).select("id");
      if(r.error||!r.data||r.data.length!==1)return false;
    }
    Object.keys(patch).forEach(function(k){b[k]=patch[k]});
    if(!S.REMOTE)S.save(K.bk,st.bk);
    return true;
  }),
  removeBooking:failSafe(async function(id){
    if(S.REMOTE){var r=await sb.from("bookings").delete().eq("id",id).select("id");if(r.error||!r.data||r.data.length!==1)return false}
    st.bk=st.bk.filter(function(x){return x.id!==id});if(!S.REMOTE)S.save(K.bk,st.bk);return true;
  }),
  /* Cliente cria o horário. No modo de teste, valida aqui mesmo. */
  createBooking:async function(q){
    var rec={barber:q.barber,date:q.date,start:q.start,dur:q.dur,services:q.svc.map(function(x){return {id:x.id,name:x.name,price:x.price}}),total:q.total,name:q.name,phone:q.phone,status:"confirmado",source:"link"};
    if(!S.REMOTE){
      var bid=q.barber==="any"?(S.freeBarbers(q.date,q.start,q.dur)[0]||""):q.barber;
      if(!bid||!S.barberFree(bid,q.date,q.start,q.dur))return {ok:false,code:"slot_taken"};
      rec.barber=bid;rec.id="k"+S.uid();rec.token="t"+S.uid()+S.uid();st.bk.push(rec);S.save(K.bk,st.bk);return {ok:true,rec:rec};
    }
    try{
      var r=await sb.rpc("create_booking",{p_barber:q.barber,p_day:q.date,p_start:q.start,p_service_ids:q.svc.map(function(x){return x.id}),p_name:q.name,p_phone:q.phone});
      if(r.error)return {ok:false,code:errCode(r.error)};
      var d=r.data;rec.id=d.id;rec.barber=d.barber;rec.dur=d.dur;rec.total=Number(d.total);rec.services=d.services;rec.token=d.token;
      return {ok:true,rec:rec};
    }catch(e){return {ok:false,code:"other"}}
  },
  getMyBooking:async function(token){
    if(!S.REMOTE){var b=st.bk.filter(function(x){return x.token===token})[0];if(!b)return null;
      var diff=(S.diffDays(S.today(),b.date)*1440+b.start)-S.nowMin();return {barber:b.barber,day:b.date,start:b.start,dur:b.dur,services:b.services,total:b.total,name:b.name,status:b.status,cancel_hours:st.shop.cancelHours,can_cancel:b.status==="confirmado"&&diff>=st.shop.cancelHours*60}}
    try{var r=await sb.rpc("get_my_booking",{p_token:token});return r.error?null:r.data}catch(e){return null}
  },
  cancelMyBooking:async function(token){
    if(!S.REMOTE){var b=st.bk.filter(function(x){return x.token===token})[0];if(!b)return {ok:false,code:"not_found"};b.status="cancelado";S.save(K.bk,st.bk);return {ok:true}}
    try{var r=await sb.rpc("cancel_my_booking",{p_token:token});return r.error?{ok:false,code:errCode(r.error)}:{ok:true}}catch(e){return {ok:false,code:"other"}}
  },
  addTimeOff:failSafe(async function(t){
    if(!S.REMOTE){t.id="o"+S.uid();st.ex.push(t);S.save(K.ex,st.ex);return true}
    var r=await sb.from("time_off").insert({barber_id:t.barber||null,day_from:t.from,day_to:t.to,kind:t.kind,intervals:t.intervals||[],reason:t.reason||""}).select("id");
    if(r.error||!r.data||!r.data.length)return false;t.id=r.data[0].id;st.ex.push(t);return true;
  }),
  removeTimeOff:failSafe(async function(id){
    if(S.REMOTE){var r=await sb.from("time_off").delete().eq("id",id).select("id");if(r.error||!r.data||r.data.length!==1)return false}
    st.ex=st.ex.filter(function(x){return x.id!==id});if(!S.REMOTE)S.save(K.ex,st.ex);return true;
  }),
  addExpense:failSafe(async function(e){
    if(!S.REMOTE){e.id="e"+S.uid();st.exp.unshift(e);S.save(K.exp,st.exp);return true}
    var r=await sb.from("expenses").insert({day:e.day,category:e.category,amount:e.amount,note:e.note||""}).select("id");
    if(r.error||!r.data||!r.data.length)return false;e.id=r.data[0].id;st.exp.unshift(e);return true;
  }),
  removeExpense:failSafe(async function(id){
    if(S.REMOTE){var r=await sb.from("expenses").delete().eq("id",id).select("id");if(r.error||!r.data||r.data.length!==1)return false}
    st.exp=st.exp.filter(function(x){return x.id!==id});if(!S.REMOTE)S.save(K.exp,st.exp);return true;
  }),
  saveCommission:failSafe(async function(barberId,pct){
    if(S.REMOTE){var r=await sb.from("barber_finance").upsert({barber_id:barberId,commission_pct:pct});if(r.error)return false}
    st.comm[barberId]=pct;if(!S.REMOTE)S.save(K.comm,st.comm);return true;
  }),
  saveGoal:failSafe(async function(v){
    if(S.REMOTE){var r=await sb.from("owner_settings").upsert({id:1,monthly_goal:v});if(r.error)return false}
    st.goal=v;if(!S.REMOTE)S.save(K.goal,v);return true;
  }),
  signIn:async function(email,pw){
    if(!S.REMOTE){st.session="owner";S.save(K.ses,"owner");return {ok:true}}
    try{
      var r=await sb.auth.signInWithPassword({email:email,password:pw});
      if(r.error)return {ok:false,error:"E-mail ou senha incorretos."};
      var o=await sb.rpc("is_owner");
      if(o.data!==true){await sb.auth.signOut();return {ok:false,error:"Este usuário não tem acesso ao painel."}}
      st.session="owner";return {ok:true};
    }catch(e){return {ok:false,error:"Não foi possível entrar agora. Verifique a conexão."}}
  },
  signOut:async function(){
    st.session=null;st.bk=[];st.exp=[];
    if(!S.REMOTE){S.save(K.ses,null);return}
    try{await sb.auth.signOut()}catch(e){}
  },
  uploadImage:async function(dataUrl){
    try{
      var m=/^data:([^;]+);base64,/.exec(dataUrl),type=m?m[1]:"image/jpeg",ext=type==="image/png"?"png":"jpg";
      var blob=await (await fetch(dataUrl)).blob(),path="uploads/"+S.uid()+"."+ext;
      var r=await sb.storage.from("media").upload(path,blob,{contentType:type,cacheControl:"31536000"});
      if(r.error)return null;
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    }catch(e){return null}
  }
};
S.persist=function(){return DB.saveShop().then(function(ok){if(!ok)S.toast("Não foi possível salvar. Verifique a conexão e tente de novo.");return ok})};
S.putImg=function(dataUrl,cb){
  if(!S.REMOTE){cb(dataUrl);return}
  DB.uploadImage(dataUrl).then(function(u){if(u)cb(u);else S.toast("Não foi possível enviar a imagem. Tente de novo.")});
};
S.resizeImg=function(file,max,cb,type){
  var rd=new FileReader();
  rd.onload=function(){var im=new Image();im.onload=function(){
    var r=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");
    c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height);S.putImg(c.toDataURL(type||"image/jpeg",.84),cb)};
    im.onerror=function(){S.toast("Não foi possível ler essa imagem")};im.src=rd.result};
  rd.readAsDataURL(file);
};

/* ---------- regras de horário (as mesmas do servidor) ---------- */
var ACTIVE=["confirmado","concluido","bloqueio"];
S.ACTIVE=ACTIVE;
/* Expediente do barbeiro no dia: folga/férias/feriado fecham, "especial" troca,
   senão vale o horário do barbeiro ou o da loja. */
S.hoursFor=function(barberId,date){
  var shop=st.shop,special=null,general=null;
  for(var i=0;i<st.ex.length;i++){
    var e=st.ex[i];
    if(date<e.from||date>e.to||(e.barber&&e.barber!==barberId))continue;
    if(e.kind!=="especial")return [];
    if(e.barber)special=e.intervals;else if(!general)general=e.intervals;
  }
  if(special)return special;if(general)return general;
  var dow=S.dow(date),b=S.barberOf(barberId);
  if(b&&b.hours&&Array.isArray(b.hours[dow]))return b.hours[dow];
  return (shop.hours&&shop.hours[dow])||[];
};
/* Motivo da folga do dia (para mostrar ao dono), ou null. */
S.offReason=function(barberId,date){
  for(var i=0;i<st.ex.length;i++){var e=st.ex[i];if(date>=e.from&&date<=e.to&&(!e.barber||e.barber===barberId)&&e.kind!=="especial")return e}
  return null;
};
S.dayBookings=function(date,barber){
  return st.bk.filter(function(b){return b.date===date&&(!barber||barber==="all"||b.barber===barber)});
};
function gapOf(b){return b.status==="bloqueio"?0:st.shop.bufferMin}
S.barberFree=function(barber,date,start,dur,ignoreId){
  return !st.bk.some(function(b){
    if(b.barber!==barber||b.date!==date||ACTIVE.indexOf(b.status)<0||b.id===ignoreId)return false;
    var g=gapOf(b);
    return start<b.start+b.dur+g&&b.start<start+dur+g;
  });
};
S.fits=function(iv,start,dur){return iv.some(function(x){return start>=S.toMin(x[0])&&start+dur<=S.toMin(x[1])})};
S.isOpen=function(barber,date,start,dur){return S.fits(S.hoursFor(barber,date),start,dur)};
S.freeBarbers=function(date,start,dur){
  return st.shop.barbers.map(function(b){return b.id}).filter(function(id){return S.isOpen(id,date,start,dur)&&S.barberFree(id,date,start,dur)&&!S.past(date,start)});
};
S.past=function(date,start){
  var t=S.today();if(date<t)return true;
  return date===t&&start<=S.nowMin()+st.shop.leadMin;
};
/* Horários livres do dia: [{t, barbers:[ids]}]. barber "any" junta todos. */
S.slots=function(date,dur,barber){
  var ids=barber&&barber!=="any"?[barber]:st.shop.barbers.map(function(b){return b.id});
  var step=st.shop.slotStep,map={};
  ids.forEach(function(id){
    S.hoursFor(id,date).forEach(function(iv){
      for(var t=S.toMin(iv[0]);t+dur<=S.toMin(iv[1]);t+=step){
        if(S.past(date,t)||!S.barberFree(id,date,t,dur))continue;
        (map[t]=map[t]||[]).push(id);
      }
    });
  });
  return Object.keys(map).map(Number).sort(function(a,b){return a-b}).map(function(t){return {t:t,barbers:map[t]}});
};
S.dayOpen=function(date,barber){
  var ids=barber&&barber!=="any"?[barber]:st.shop.barbers.map(function(b){return b.id});
  return ids.some(function(id){return S.hoursFor(id,date).length>0});
};
/* Primeiro horário livre dos próximos dias para uma duração. */
S.nextFree=function(dur,barber,days){
  var t=S.today();
  for(var i=0;i<(days||14);i++){
    var d=S.addDays(t,i),sl=S.slots(d,dur,barber);
    if(sl.length)return {date:d,t:sl[0].t,barber:sl[0].barbers[0]};
  }
  return null;
};
S.svcDur=function(ids){var d=0,p=0;ids.forEach(function(id){var s=st.shop.services.filter(function(x){return x.id===id})[0];if(s){d+=+s.min;p+=+s.price}});return {dur:d,total:p}};
S.statusLabel=function(){
  var t=S.today(),m=S.nowMin(),shop=st.shop,dow=S.dow(t);
  var any=shop.barbers.some(function(b){return S.hoursFor(b.id,t).length});
  if(!any)return "Fechado hoje";
  var iv=[];shop.barbers.forEach(function(b){iv=iv.concat(S.hoursFor(b.id,t))});
  var open=iv.some(function(x){return m>=S.toMin(x[0])&&m<S.toMin(x[1])});
  if(open)return "Aberto agora";
  var next=iv.map(function(x){return S.toMin(x[0])}).filter(function(x){return x>m}).sort(function(a,b){return a-b})[0];
  return next!=null?"Abre às "+S.hh(S.fmt(next)):"Fechado agora";
};
S.hoursSummary=function(){
  var h=st.shop.hours,out=[],order=[1,2,3,4,5,6,0];
  order.forEach(function(d){
    var iv=h[d]||[],txt=iv.length?iv.map(function(x){return S.hh(x[0])+" às "+S.hh(x[1])}).join(" · "):"Fechado";
    var last=out[out.length-1];
    if(last&&last.txt===txt)last.days.push(d);else out.push({txt:txt,days:[d]});
  });
  return out.map(function(o){
    var d=o.days,label=d.length===1?S.DOWF[d[0]]:S.DOW[d[0]]+" a "+S.DOW[d[d.length-1]];
    return {label:label,txt:o.txt};
  });
};

/* ---------- rotas ---------- */
var app=S.app=document.getElementById("app");
S.routes={};
S.loaded={};
S.need=function(file){
  if(S.loaded[file])return S.loaded[file];
  S.loaded[file]=new Promise(function(res,rej){
    var s=document.createElement("script");s.src=file;s.onload=res;s.onerror=function(){delete S.loaded[file];rej(new Error("load "+file))};document.head.appendChild(s);
  });
  return S.loaded[file];
};
S.OWNER_ROUTES=["hoje","agenda","caixa","ajustes","painel"];
S.render=function(html,opts){
  S.closeSheet();
  app.innerHTML=html;
  document.body.dataset.view=(opts&&opts.view)||"client";
  document.title=(opts&&opts.title?opts.title+" | ":"")+st.shop.name;
};
S.message=function(title,text,retry){
  app.innerHTML='<main class="msg"><h1>'+S.esc(title)+'</h1><p class="lead">'+S.esc(text)+'</p>'+(retry?'<button class="btn" id="retry">Tentar de novo</button>':"")+'</main>';
  var b=document.getElementById("retry");if(b)b.onclick=function(){location.reload()};
};
S.go=function(h){if(location.hash==="#"+h)S.route(true);else location.hash=h};
var tok=0;
S.parse=function(){
  var h=(location.hash||"").replace(/^#/,"").split("?")[0],p=h.split("/");
  /* links antigos: #agendar-miguel */
  if(p[0].indexOf("agendar-")===0){return {name:"agendar",args:["1"],pre:p[0].slice(8)}}
  return {name:p[0]||"inicio",args:p.slice(1)};
};
S.route=async function(keep){
  var my=++tok,y=window.scrollY,r=S.parse();
  if(!st.shop){S.message("Site em configuração","Volte em alguns minutos.");return}
  var owner=r.name==="painel"||S.OWNER_ROUTES.indexOf(r.name)>=0;
  try{
    if(owner){
      if(r.name!=="painel"&&st.session!=="owner"){location.hash="painel";return}
      if(r.name==="painel"&&st.session==="owner"){location.hash="hoje";return}
      await S.need("owner.js");if(my!==tok)return;
      if(r.name==="ajustes"&&r.args[0])await S.need("settings.js");if(my!==tok)return;
      await S.routes.owner(r,keep,my);
    }else{
      await S.routes.client(r,keep,my);
    }
  }catch(e){if(my===tok)S.message("Não foi possível carregar","Verifique sua conexão e tente de novo.",true)}
  if(my===tok)window.scrollTo({top:keep?y:0,left:0,behavior:"instant"});
};
S.isCurrent=function(my){return my===tok};
window.addEventListener("hashchange",function(){S.route(false)});
S.boot=function(){
  DB.init().then(function(){
    if(!st.shop){S.message("Site em configuração","Volte em alguns minutos.");return}
    S.route(false);
    if(S.REMOTE)setInterval(function(){
      var r=S.parse();
      if(document.hidden||st.session!=="owner"||(r.name!=="hoje"&&r.name!=="agenda"))return;
      if(document.querySelector(".sheet"))return;
      DB.loadOwner().then(function(ok){if(ok&&S.refresh)S.refresh()});
    },60000);
  }).catch(function(){S.message("Não foi possível carregar","Verifique sua conexão com a internet e tente de novo.",true)});
};
})();
