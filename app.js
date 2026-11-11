(function(){
"use strict";
var DAYN=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
var SWATCHES=["#946d12","#b3261e","#0d5c4c","#1f4e8c","#c27a12","#5b3a8c","#16191c"];
var ACTIVE=["confirmado","concluido","bloqueio"];
var STLAB={confirmado:"Confirmado",concluido:"Concluído",faltou:"Faltou",cancelado:"Cancelado"};
var IC=function(p){return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'};
var ICON={
  sun:IC('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  cal:IC('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  users:IC('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M19 14c2 1 3 3.5 3 7"/>'),
  set:IC('<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>')
};

/* ---------- dados ----------
   Com SUPABASE_URL e chave em config.js, tudo vai para o Supabase (produção).
   Sem config, o site roda em modo de teste, salvando só neste navegador. */
var CONFIG=window.SPC_CONFIG||{};
var sb=null;
try{if(CONFIG.supabaseUrl&&CONFIG.supabaseAnonKey&&window.supabase)sb=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey)}catch(e){sb=null}
var REMOTE=!!sb;
var SHOP=null,bookings=[],session=null;
function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function normShop(c){
  c.id="spc";c.done=c.done||{};
  ["services","barbers","products","courses","news"].forEach(function(k){if(!Array.isArray(c[k]))c[k]=[]});
  return c;
}
function fromRow(r){return {id:r.id,shop:"spc",barber:r.barber_id,date:r.day,start:r.start_min,dur:r.dur_min,services:r.services||[],total:Number(r.total),name:r.name||"",phone:r.phone||"",status:r.status,source:r.source}}
function toRow(b){return {barber_id:b.barber,day:b.date,start_min:b.start,dur_min:b.dur,services:b.services,total:b.total,name:b.name,phone:b.phone,status:b.status,source:b.source}}
var DB={
  init:async function(){
    if(REMOTE){
      var r=await sb.from("shop_config").select("config").eq("id",1).maybeSingle();
      if(r.error)throw r.error;
      SHOP=r.data&&r.data.config?normShop(r.data.config):null;
      var ss=await sb.auth.getSession();
      if(ss.data&&ss.data.session){
        var o=await sb.rpc("is_owner");
        if(o.data===true)session="owner";else await sb.auth.signOut();
      }
    }else{
      SHOP=normShop((load("spc3_shops",[])[0])||baseShop());
      bookings=load("spc3_bookings",[]);
      session=load("spc3_session",null);
    }
  },
  saveShop:async function(){
    if(!REMOTE)return save("spc3_shops",[SHOP]);
    try{
      var r=await sb.from("shop_config").update({config:SHOP}).eq("id",1).select("id");
      return !r.error&&!!r.data&&r.data.length===1;
    }catch(e){return false}
  },
  saveLocalBookings:function(){save("spc3_bookings",bookings)},
  loadBusy:async function(){
    if(!REMOTE)return true;
    try{
      var from=dkey(new Date()),r=await sb.rpc("get_busy",{p_from:from,p_to:addDays(from,60)});
      if(r.error)return false;
      bookings=(r.data||[]).map(function(x,i){return {id:"busy"+i,shop:"spc",barber:x.barber_id,date:x.day,start:x.start_min,dur:x.dur_min,services:[],total:0,name:"",phone:"",status:"confirmado",source:"link"}});
      return true;
    }catch(e){return false}
  },
  loadOwnerBookings:async function(){
    if(!REMOTE)return true;
    try{
      var all=[],from=0,page=1000;
      for(;;){
        var r=await sb.from("bookings").select("*").order("day",{ascending:true}).order("start_min",{ascending:true}).range(from,from+page-1);
        if(r.error)return false;
        all=all.concat(r.data||[]);
        if(!r.data||r.data.length<page)break;
        from+=page;
      }
      bookings=all.map(fromRow);
      return true;
    }catch(e){return false}
  },
  addBookings:async function(list){
    if(!REMOTE){list.forEach(function(b){bookings.push(b)});DB.saveLocalBookings();return true}
    try{
      var r=await sb.from("bookings").insert(list.map(toRow)).select("*");
      if(r.error||!r.data)return false;
      r.data.forEach(function(x){bookings.push(fromRow(x))});
      return true;
    }catch(e){return false}
  },
  setStatus:async function(id,status){
    var b=bookings.filter(function(x){return x.id===id})[0];if(!b)return false;
    if(!REMOTE){b.status=status;DB.saveLocalBookings();return true}
    try{
      var r=await sb.from("bookings").update({status:status}).eq("id",id).select("id");
      if(r.error||!r.data||r.data.length!==1)return false;
      b.status=status;return true;
    }catch(e){return false}
  },
  removeBooking:async function(id){
    if(!REMOTE){bookings=bookings.filter(function(x){return x.id!==id});DB.saveLocalBookings();return true}
    try{
      var r=await sb.from("bookings").delete().eq("id",id).select("id");
      if(r.error||!r.data||r.data.length!==1)return false;
      bookings=bookings.filter(function(x){return x.id!==id});return true;
    }catch(e){return false}
  },
  createBooking:async function(q){
    var rec={shop:"spc",barber:q.barber,date:q.date,start:q.start,dur:q.dur,services:q.svc.map(function(x){return {name:x.name,price:x.price}}),total:q.total,name:q.name,phone:q.phone,status:"confirmado",source:"link"};
    if(!REMOTE){rec.id="k"+uid();bookings.push(rec);DB.saveLocalBookings();return {ok:true,rec:rec}}
    try{
      var r=await sb.rpc("create_booking",{p_barber:q.barber,p_day:q.date,p_start:q.start,p_service_ids:q.svc.map(function(x){return x.id}),p_name:q.name,p_phone:q.phone});
      if(r.error){var m=/(slot_taken|too_many|bad_[a-z]+|not_configured)/.exec(r.error.message||"");return {ok:false,code:m?m[1]:"other"}}
      var d=r.data;rec.id=d.id;rec.dur=d.dur;rec.total=Number(d.total);rec.services=d.services;
      bookings.push(rec);
      return {ok:true,rec:rec};
    }catch(e){return {ok:false,code:"other"}}
  },
  signIn:async function(email,pw){
    if(!REMOTE){session="owner";save("spc3_session",session);return {ok:true}}
    try{
      var r=await sb.auth.signInWithPassword({email:email,password:pw});
      if(r.error)return {ok:false,error:"E-mail ou senha incorretos."};
      var o=await sb.rpc("is_owner");
      if(o.data!==true){await sb.auth.signOut();return {ok:false,error:"Este usuário não tem acesso ao painel."}}
      session="owner";return {ok:true};
    }catch(e){return {ok:false,error:"Não foi possível entrar agora. Verifique a conexão."}}
  },
  signOut:async function(){
    session=null;bookings=[];
    if(!REMOTE){save("spc3_session",null);return}
    try{await sb.auth.signOut()}catch(e){}
  },
  uploadImage:async function(dataUrl){
    try{
      var m=/^data:([^;]+);base64,/.exec(dataUrl),type=m?m[1]:"image/jpeg",ext=type==="image/png"?"png":"jpg";
      var blob=await (await fetch(dataUrl)).blob(),path="uploads/"+uid()+"."+ext;
      var r=await sb.storage.from("media").upload(path,blob,{contentType:type,cacheControl:"31536000"});
      if(r.error)return null;
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    }catch(e){return null}
  }
};
function persist(){return DB.saveShop().then(function(ok){if(!ok)toast("Não foi possível salvar. Verifique a conexão e tente de novo.");return ok})}
function putImg(dataUrl,cb){
  if(!REMOTE){cb(dataUrl);return}
  DB.uploadImage(dataUrl).then(function(u){if(u)cb(u);else toast("Não foi possível enviar a imagem. Tente de novo.")});
}
var BOOK_ERR={
  slot_taken:"Esse horário acabou de ser ocupado. Volte e escolha outro.",
  too_many:"Você já tem 3 horários marcados. Para marcar mais, fale com a barbearia.",
  bad_hours:"Esse horário não está mais disponível. Volte e escolha outro.",
  bad_time:"Esse horário não está mais disponível. Volte e escolha outro.",
  bad_date:"Esse dia não está mais disponível. Volte e escolha outro.",
  bad_phone:"Confira o número do WhatsApp.",
  bad_name:"Confira o nome informado.",
  bad_services:"A lista de serviços mudou. Atualize a página e tente de novo.",
  bad_barber:"A equipe mudou. Atualize a página e tente de novo.",
  other:"Não foi possível agendar agora. Tente de novo ou chame a barbearia no WhatsApp."
};
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
var IMG={logo:"assets/logo.jpg",cover:"assets/cover.jpg",plano:"assets/plano.jpg",miguel:"assets/miguel.jpg",vitor:"assets/vitor.jpg",balm:"assets/balm.jpg",black:"assets/black.jpg",brilho:"assets/brilho.jpg",morango:"assets/morango.jpg",uva:"assets/uva.jpg",esponja:"assets/esponja.jpg",gel:"assets/gel.jpg",posbarba:"assets/posbarba.jpg"};
function baseShop(){
  return {id:"spc",ownerId:"owner",slug:"studio-power-cut",name:"Studio Power Cut",tagline:"Barbearia Premium. Corte, barba e experiência completa.",
    city:"Porto Alegre, RS",address:"Rua Dona Firmina, 528",whatsapp:"(51) 98194-5319",instagram:"@studiopowercut",
    brand:"#946d12",hero:"#111111",logo:IMG.logo,cover:IMG.cover,priceNote:"O preço pode variar conforme a data escolhida.",sample:false,
    hours:{0:[["09:00","12:00"]],1:[["09:00","12:00"],["14:00","21:00"]],2:[["09:00","12:00"],["14:00","21:00"]],3:[["09:00","12:00"],["14:00","18:30"]],4:[["09:00","12:00"],["14:00","18:30"]],5:[["09:00","12:00"],["13:00","22:00"]],6:[["08:00","12:00"],["13:00","22:00"]]},
    done:{servicos:1,equipe:1,perfil:1},
    services:[
      {id:"v1",name:"Barba",price:20,min:20},
      {id:"v2",name:"Corte",price:40,min:30},
      {id:"v3",name:"Corte + barba",price:60,min:45},
      {id:"v4",name:"Corte + barba + sobrancelha",price:70,min:60},
      {id:"v5",name:"Corte + luzes",price:120,min:120},
      {id:"v6",name:"Corte + pigmentação",price:70,min:40},
      {id:"v7",name:"Corte + pigmentação + sobrancelha",price:80,min:45},
      {id:"v8",name:"Corte + sobrancelha",price:50,min:40}],
    barbers:[{id:"b1",name:"Miguel",nick:"Neves",photo:IMG.miguel},{id:"b2",name:"Vitor Teixeira",nick:"Vitinho",photo:IMG.vitor}],
    products:[
      {id:"p1",name:"Balm hidratante",price:32,desc:"Hidrata pele, barba, bigode e cabelo.",img:IMG.balm,on:true},
      {id:"p2",name:"Cera black 120g",price:26,desc:"",img:IMG.black,on:true},
      {id:"p3",name:"Cera brilho 120g",price:26,desc:"",img:IMG.brilho,on:true},
      {id:"p4",name:"Cera modeladora - morango",price:26,desc:"",img:IMG.morango,on:true},
      {id:"p5",name:"Cera modeladora - uva",price:26,desc:"",img:IMG.uva,on:true},
      {id:"p6",name:"Esponja",price:40,desc:"",img:IMG.esponja,on:true},
      {id:"p7",name:"Gel cola 300g",price:24,desc:"Fixação extra forte, sem álcool.",img:IMG.gel,on:true},
      {id:"p8",name:"Pós barba 120ml",price:32,desc:"",img:IMG.posbarba,on:true}],
    courses:[{id:"c1",name:"Curso Studio Power Cut",price:0,info:"",desc:"Fale com a gente pelo WhatsApp para saber datas, conteúdo e valores.",video:"",img:""}],
    news:[{id:"n1",date:"2026-03-24",title:"Assinatura mensal",text:"Se você corta o cabelo toda semana ou de 15 em 15 dias, não faz sentido pagar avulso. Cabelo, barba e sobrancelha por R$ 179,99 (de R$ 280) ou só o corte por R$ 134,99 (de R$ 160). Chame no WhatsApp para saber como funciona.",img:IMG.plano}]
  };
}
function theShop(){return SHOP}
function myShop(){return session==="owner"?SHOP:null}

/* ---------- utilidades ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function money(n){return Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function toMin(t){var p=t.split(":");return +p[0]*60+ +p[1]}
function fmt(m){var h=Math.floor(m/60),mm=m%60;return (h<10?"0":"")+h+":"+(mm<10?"0":"")+mm}
function hh(t){var p=t.split(":");return p[1]==="00"?(+p[0])+"h":(+p[0])+"h"+p[1]}
function dkey(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function dateOf(k){return new Date(k+"T00:00:00")}
function addDays(k,n){var d=dateOf(k);d.setDate(d.getDate()+n);return dkey(d)}
function fmtDate(k){var d=dateOf(k);return DAYN[d.getDay()]+", "+("0"+d.getDate()).slice(-2)+"/"+("0"+(d.getMonth()+1)).slice(-2)}
function nowMin(){var n=new Date();return n.getHours()*60+n.getMinutes()}
function digits(s){return String(s||"").replace(/\D/g,"")}
function onBrand(hex){
  var h=hex.replace("#","");if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);
  return (0.299*r+0.587*g+0.114*b)>165?"#16191c":"#ffffff";
}
function scopeStyle(s){var hero=s.hero||s.brand;return "--brand:"+esc(s.brand)+";--on-brand:"+onBrand(s.brand)+";--hero:"+esc(hero)+";--on-hero:"+onBrand(hero)}
function initials(n){var w=n.replace(/[^A-Za-zÀ-ú0-9 ]/g,"").trim().split(/\s+/);return ((w[0]||"?")[0]+(w[1]?w[1][0]:"")).toUpperCase()}
function logo(s,size){
  var st="width:"+size+"px;height:"+size+"px;font-size:"+Math.round(size*.42)+"px";
  if(s.logo)st+=";border-radius:50%;background:#1b1b1b";
  return '<div class="logo" style="'+st+'">'+(s.logo?'<img alt="Logo de '+esc(s.name)+'" src="'+esc(s.logo)+'">':esc(initials(s.name)))+'</div>';
}
function daysText(d){
  var s=d.slice().sort();if(s.length===7)return "Todos os dias";
  var run=s.every(function(x,i){return i===0||x===s[i-1]+1});
  return run&&s.length>2?DAYN[s[0]]+" a "+DAYN[s[s.length-1]]:s.map(function(x){return DAYN[x]}).join(", ");
}
function pseudo(str){var h=0;for(var i=0;i<str.length;i++){h=(h*31+str.charCodeAt(i))|0}return Math.abs(h)}
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){t.hidden=true},2600)}
function slugify(n){return n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/&/g," e ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"barbearia"}
function copy(text){
  var fb=function(){toast("Selecione o texto e copie")};
  try{navigator.clipboard.writeText(text).then(function(){toast("Copiado")},fb)}catch(e){fb()}
}
function waLink(phone,text){
  var d=digits(phone);if(d.length<10)return "";
  return "https://wa.me/"+(d.length<=11?"55"+d:d)+(text?"?text="+encodeURIComponent(text):"");
}
function shareLink(s){return location.href.split("#")[0]}

/* ---------- agenda ---------- */
function dayBookings(s,date,barber){
  return bookings.filter(function(b){return b.shop===s.id&&b.date===date&&(barber==="all"||b.barber===barber)})
    .sort(function(a,b){return a.start-b.start});
}
function barberFree(s,b,date,st,dur){
  return !bookings.some(function(x){return x.shop===s.id&&x.barber===b.id&&x.date===date&&ACTIVE.indexOf(x.status)>=0&&st<x.start+x.dur&&x.start<st+dur});
}
var DAYFULL=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
function hoursOf(s,dow){
  if(!s.hours){s.hours={};for(var i=0;i<7;i++)s.hours[i]=(s.days||[]).indexOf(i)>=0?[[s.open,s.close]]:[]}
  return s.hours[dow]||[];
}
function isOpenDay(s,dow){return hoursOf(s,dow).length>0}
function dayHoursText(iv){return iv.map(function(x){return hh(x[0])+" às "+hh(x[1])}).join(" · ")}
function fitsHours(iv,st,dur){return iv.some(function(x){return st>=toMin(x[0])&&st+dur<=toMin(x[1])})}
function hoursRows(s){
  var today=new Date().getDay();
  return [1,2,3,4,5,6,0].map(function(d){var iv=hoursOf(s,d);return '<div><b>'+DAYN[d]+'</b><span'+(d===today?' style="font-weight:700"':"")+'>'+(iv.length?dayHoursText(iv):"Fechado")+'</span></div>'}).join("");
}
function statusText(s){
  var n=new Date(),dow=n.getDay(),nm=nowMin(),iv=hoursOf(s,dow),i;
  for(i=0;i<iv.length;i++){if(nm>=toMin(iv[i][0])&&nm<toMin(iv[i][1]))return "Aberto até "+hh(iv[i][1])}
  for(i=0;i<iv.length;i++){if(nm<toMin(iv[i][0]))return "Fechado agora · abre às "+hh(iv[i][0])}
  for(var k=1;k<=7;k++){var d=(dow+k)%7,v=hoursOf(s,d);if(v.length)return "Fechado agora · abre "+(k===1?"amanhã":DAYN[d])+" às "+hh(v[0][0])}
  return "Fechado";
}
function avatar(b,size){
  var st="width:"+size+"px;height:"+size+"px;font-size:"+Math.round(size*.4)+"px";
  return b.photo?'<img class="avatar" alt="" style="'+st+'" src="'+esc(b.photo)+'">':'<span class="avatar" style="'+st+'">'+esc(initials(b.name))+'</span>';
}
function durOpts(cur){
  var l=[15,20,30,40,45,60,75,90,120,150,180];if(l.indexOf(cur)<0){l.push(cur);l.sort(function(a,b){return a-b})}
  return l.map(function(m){return '<option value="'+m+'"'+(cur===m?" selected":"")+'>'+m+' min</option>'}).join("");
}
function slotsFor(s,date,dur,sel){
  var iv=hoursOf(s,dateOf(date).getDay());if(!iv.length)return null;
  var today=date===dkey(new Date()),nm=nowMin(),out=[];
  var cand=sel==="any"?s.barbers:s.barbers.filter(function(b){return b.id===sel});
  iv.forEach(function(x){
    var o=toMin(x[0]),c=toMin(x[1]);
    for(var st=o;st+dur<=c;st+=30){
      if(today&&st<=nm)continue;
      out.push({s:st,free:cand.some(function(b){return barberFree(s,b,date,st,dur)})});
    }
  });
  return out;
}
function occupancy(s,date,barber){
  var iv=hoursOf(s,dateOf(date).getDay());if(!iv.length)return null;
  var n=barber==="all"?s.barbers.length:1,cap=n*iv.reduce(function(a,x){return a+Math.floor((toMin(x[1])-toMin(x[0]))/30)},0);
  var used=dayBookings(s,date,barber).filter(function(b){return ACTIVE.indexOf(b.status)>=0}).reduce(function(a,b){return a+Math.ceil(b.dur/30)},0);
  return {used:used,cap:cap,pct:cap?Math.min(100,Math.round(used*100/cap)):0};
}
function barberName(s,id){var b=s.barbers.filter(function(x){return x.id===id})[0];return b?b.name:"Ex-profissional"}
function clientKey(b){var d=digits(b.phone);return d.length>=10?d:"n-"+slugify(b.name)}

/* ---------- agendamentos de exemplo (marcados com ex, removíveis) ---------- */
function seedExamples(){
  var s=theShop(),names=[["Marcos Silva","(51) 99111-2233"],["João Pedro","(51) 99222-3344"],["Rodrigo Alves","(51) 99333-4455"],["Felipe Costa","(51) 99444-5566"],["André Lima","(51) 99555-6677"],["Bruno Souza","(51) 99666-7788"]];
  var starts=[540,600,660,840,900,960],today=dkey(new Date()),nm=nowMin();
  bookings=bookings.filter(function(b){return !b.ex});
  for(var off=-12;off<=3;off++){
    var date=addDays(today,off),iv=hoursOf(s,dateOf(date).getDay());if(!iv.length)continue;
    var cnt=2+pseudo(date)%3,p=pseudo(date)%2;
    for(var k=0;k<cnt;k++){
      var h=pseudo(date+k),sv=s.services[h%s.services.length],cl=names[h%names.length],start=starts[(k*2+p)%6],bar=s.barbers[k%s.barbers.length];
      if(!fitsHours(iv,start,sv.min)||!barberFree(s,bar,date,start,sv.min))continue;
      var past=date<today||(date===today&&start+sv.min<=nm);
      bookings.push({id:"k"+uid()+k,ex:true,shop:s.id,barber:bar.id,date:date,start:start,dur:sv.min,services:[{name:sv.name,price:sv.price}],total:sv.price,
        name:cl[0],phone:cl[1],status:past?(h%9===0?"faltou":"concluido"):"confirmado",source:h%3===0?"manual":"link"});
    }
  }
  DB.saveLocalBookings();
}
function clearExamples(){bookings=bookings.filter(function(b){return !b.ex});DB.saveLocalBookings()}

/* ---------- casca ---------- */
var app=document.getElementById("app");
var cancelId=null,agDate=null,agBar="all",agOff=0,nf=null,flow=null;

function ownerTop(s){
  return '<header class="top"><div class="who">'+logo(s,36)+'<strong>'+esc(s.name)+'</strong></div><a class="toplink" href="#">Página do cliente</a></header>';
}
function tabs(active){
  var t=[["hoje","Hoje",ICON.sun],["agenda","Agenda",ICON.cal],["clientes","Clientes",ICON.users],["ajustes","Ajustes",ICON.set]];
  return '<nav class="tabs" aria-label="Principal"><div>'+t.map(function(x){
    return '<a class="tab" href="#'+x[0]+'"'+(active===x[0]?' aria-current="page"':'')+'>'+x[2]+x[1]+'</a>'}).join("")+'</div></nav>';
}
function shell(s,active,inner){
  app.innerHTML='<div class="scope" style="'+scopeStyle(s)+'">'+ownerTop(s)+'<main class="stack">'+inner+'</main>'+tabs(active)+'</div>';
}
function subpage(s,title,inner,backHref){
  app.innerHTML='<div class="scope" style="'+scopeStyle(s)+'">'+ownerTop(s)+'<main class="stack"><a class="back" href="#'+(backHref||"ajustes")+'">‹ Voltar</a><h1>'+title+'</h1>'+inner+'</main>'+tabs(backHref==="agenda"?"agenda":(backHref==="clientes"?"clientes":"ajustes"))+'</div>';
}

/* ---------- cartão de agendamento ---------- */
function bcard(b,s){
  if(b.status==="bloqueio"){
    return '<div class="bk block"><div class="tm">'+fmt(b.start)+'<small>'+fmt(b.start+b.dur)+'</small></div><div class="bd"><strong>Bloqueado</strong><span>'+esc(b.name||"Sem motivo")+' · '+esc(barberName(s,b.barber))+'</span>'+
      '<div class="acts"><button class="btn ghost small" data-rm="'+b.id+'">Remover bloqueio</button></div></div></div>';
  }
  var wa=waLink(b.phone),off=(b.status==="cancelado"||b.status==="faltou");
  var acts="";
  if(cancelId===b.id){
    acts='<button class="btn danger small" data-yes="'+b.id+'">Confirmar cancelamento</button><button class="btn ghost small" data-no="1">Manter</button>';
  }else if(b.status==="confirmado"){
    acts='<button class="btn small" data-st="concluido" data-id="'+b.id+'">Concluir</button><button class="btn ghost small" data-st="faltou" data-id="'+b.id+'">Faltou</button><button class="btn ghost small" data-cancel="'+b.id+'">Cancelar</button>';
  }else{
    acts='<button class="btn ghost small" data-st="confirmado" data-id="'+b.id+'">Reabrir</button>';
  }
  if(wa&&cancelId!==b.id)acts+='<a class="btn ghost small" target="_blank" rel="noopener" href="'+esc(wa)+'">WhatsApp</a>';
  return '<div class="bk'+(off?" off":"")+'"><div class="tm">'+fmt(b.start)+'<small>'+fmt(b.start+b.dur)+'</small></div><div class="bd"><strong>'+esc(b.name)+'</strong>'+
    '<span>'+b.services.map(function(x){return esc(x.name)}).join(", ")+' · '+money(b.total)+'</span><span>'+esc(barberName(s,b.barber))+(b.source==="link"?" · pelo link":"")+'</span>'+
    '<span class="chipst s-'+b.status+'">'+STLAB[b.status]+'</span><div class="acts">'+acts+'</div></div></div>';
}

/* ---------- Hoje ---------- */
function viewToday(){
  var s=myShop(),today=dkey(new Date()),list=dayBookings(s,today,"all"),real=list.filter(function(b){return b.status==="confirmado"||b.status==="concluido"});
  var prevto=real.reduce(function(a,b){return a+b.total},0),feito=real.filter(function(b){return b.status==="concluido"}).reduce(function(a,b){return a+b.total},0);
  var nx=list.filter(function(b){return b.status==="confirmado"&&b.start+b.dur>nowMin()})[0];
  var hasAny=bookings.some(function(b){return b.shop===s.id&&b.status!=="bloqueio"});
  var d=dateOf(today),title=["domingo","segunda","terça","quarta","quinta","sexta","sábado"][d.getDay()]+", "+("0"+d.getDate()).slice(-2)+"/"+("0"+(d.getMonth()+1)).slice(-2);
  var h='<div><p class="label">Hoje</p><h1>'+title+'</h1></div>';
  if(s.sample)h+='<div class="note stack tight"><span>Serviços, preços, equipe, produtos, cursos e novidades são exemplos. Troque pelos dados reais em Ajustes.</span><div><button class="btn ghost small" id="dis">Entendi, ocultar</button></div></div>';
  h+='<div class="tiles"><div class="tile"><small>Clientes</small><b>'+real.length+'</b></div><div class="tile"><small>Previsto</small><b>'+money(prevto)+'</b></div><div class="tile"><small>Recebido</small><b>'+money(feito)+'</b></div></div>';
  if(nx)h+='<div class="next"><small>Próximo cliente</small><b>'+fmt(nx.start)+' · '+esc(nx.name)+'</b><span>'+nx.services.map(function(x){return esc(x.name)}).join(", ")+' com '+esc(barberName(s,nx.barber))+'</span></div>';
  if(!hasAny){
    var dn=s.done||{};
    h+='<div><h2>Primeiros passos</h2></div><div class="card">'+
      '<a class="check-li" href="#ajustes-servicos"><span class="ck '+(dn.servicos?"on":"")+'">'+(dn.servicos?"✓":"")+'</span><span><strong>Confirme serviços e preços</strong><br><span class="muted">Cadastrei os que aparecem no seu site atual. Confira.</span></span></a>'+
      '<a class="check-li" href="#ajustes-equipe"><span class="ck '+(dn.equipe?"on":"")+'">'+(dn.equipe?"✓":"")+'</span><span><strong>Cadastre quem atende</strong><br><span class="muted">Cada barbeiro tem a própria agenda.</span></span></a>'+
      '<a class="check-li" href="#ajustes-perfil"><span class="ck '+(dn.perfil?"on":"")+'">'+(dn.perfil?"✓":"")+'</span><span><strong>Coloque sua logo e cor</strong><br><span class="muted">Aparecem na página que o cliente vê.</span></span></a>'+
      '<a class="check-li" href="#ajustes-link"><span class="ck '+(dn.link?"on":"")+'">'+(dn.link?"✓":"")+'</span><span><strong>Envie seu link aos clientes</strong><br><span class="muted">Eles marcam sozinhos, só na sua barbearia.</span></span></a></div>';
  }
  h+='<a class="btn block-btn" href="#agenda-novo">+ Novo agendamento</a>';
  h+='<div><h2>Agenda de hoje</h2></div>';
  if(!isOpenDay(s,d.getDay()))h+='<p class="note">Hoje a barbearia está fechada.</p>';
  h+=list.length?'<div class="stack tight">'+list.map(function(b){return bcard(b,s)}).join("")+'</div>':'<p class="note">Nenhum horário marcado para hoje. Envie seu link aos clientes na aba Ajustes.</p>';
  h+='<div class="copybox"><input class="input" readonly value="'+esc(shareLink(s))+'" aria-label="Seu link de agendamento" onfocus="this.select()"><button class="btn small" id="cp">Copiar link</button></div>';
  shell(s,"hoje",h);
  document.getElementById("cp").onclick=function(){s.done.link=1;persist();copy(shareLink(s))};
  var dis=document.getElementById("dis");if(dis)dis.onclick=function(){s.sample=false;persist();viewToday()};
}

/* ---------- Agenda ---------- */
function viewAgenda(){
  var s=myShop(),today=dkey(new Date());
  if(!agDate)agDate=today;
  var start=addDays(today,agOff),days=[];for(var i=0;i<7;i++)days.push(addDays(start,i));
  var h='<h1>Agenda</h1><div class="row" style="flex-wrap:nowrap;align-items:center"><button class="btn ghost small" id="pv" style="flex:0 0 auto" aria-label="Semana anterior">‹</button><p class="muted" style="text-align:center">'+fmtDate(days[0])+' a '+fmtDate(days[6])+'</p><button class="btn ghost small" id="nx" style="flex:0 0 auto" aria-label="Próxima semana">›</button></div>';
  h+='<div class="days" role="group" aria-label="Dias">'+days.map(function(k){
    var c=dayBookings(s,k,agBar).filter(function(b){return ACTIVE.indexOf(b.status)>=0&&b.status!=="bloqueio"}).length;
    return '<button class="day" data-d="'+k+'" aria-pressed="'+(k===agDate)+'"><small>'+DAYN[dateOf(k).getDay()]+'</small><b>'+dateOf(k).getDate()+'</b><em>'+(c?c+" cliente"+(c>1?"s":""):"")+'</em></button>'}).join("")+'</div>';
  h+='<div class="chips row" style="gap:8px"><button class="toplink" data-bar="all" aria-pressed="'+(agBar==="all")+'" style="'+(agBar==="all"?"background:var(--brand);color:var(--on-brand);border-color:var(--brand)":"")+'">Todos</button>'+
    s.barbers.map(function(b){return '<button class="toplink" data-bar="'+b.id+'" aria-pressed="'+(agBar===b.id)+'" style="'+(agBar===b.id?"background:var(--brand);color:var(--on-brand);border-color:var(--brand)":"")+'">'+esc(b.name)+'</button>'}).join("")+'</div>';
  var oc=occupancy(s,agDate,agBar);
  h+=oc?'<div class="stack tight"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>'+fmtDate(agDate)+'</b><span class="muted">Ocupação '+oc.pct+'%</span></div><div class="meter" role="img" aria-label="Ocupação do dia '+oc.pct+'%"><i style="width:'+oc.pct+'%"></i></div><span class="muted" style="font-size:.88rem">'+oc.used*30+' de '+oc.cap*30+' minutos ocupados · atende '+dayHoursText(hoursOf(s,dateOf(agDate).getDay()))+'</span></div>':'<p class="note">Fechado em '+fmtDate(agDate)+'.</p>';
  h+='<a class="btn block-btn" href="#agenda-novo">+ Novo agendamento ou bloqueio</a>';
  var list=dayBookings(s,agDate,agBar);
  h+=list.length?'<div class="stack tight">'+list.map(function(b){return bcard(b,s)}).join("")+'</div>':'<p class="note">Nenhum horário marcado neste dia.</p>';
  shell(s,"agenda",h);
  document.getElementById("pv").onclick=function(){if(agOff>-28){agOff-=7;viewAgenda()}};
  document.getElementById("nx").onclick=function(){if(agOff<84){agOff+=7;viewAgenda()}};
  app.querySelectorAll("[data-d]").forEach(function(b){b.onclick=function(){agDate=b.dataset.d;viewAgenda()}});
  app.querySelectorAll("[data-bar]").forEach(function(b){b.onclick=function(){agBar=b.dataset.bar;viewAgenda()}});
}

/* ---------- novo agendamento / bloqueio ---------- */
function viewNew(){
  var s=myShop(),today=dkey(new Date());
  if(!nf)nf={type:"ag",services:[],barber:s.barbers[0].id,date:agDate||today,time:null,name:"",phone:"",reason:"",from:"12:00",to:"13:00"};
  var svc=s.services.filter(function(x){return nf.services.indexOf(x.id)>=0}),dur=svc.reduce(function(a,x){return a+x.min},0),total=svc.reduce(function(a,x){return a+x.price},0);
  var h='<div class="seg" role="group" aria-label="Tipo"><button data-t="ag" aria-pressed="'+(nf.type==="ag")+'">Agendamento</button><button data-t="bl" aria-pressed="'+(nf.type==="bl")+'">Bloqueio</button></div>';
  if(nf.type==="ag"){
    h+='<div class="field"><label for="nn">Nome do cliente</label><input id="nn" class="input" value="'+esc(nf.name)+'" placeholder="Nome" autocomplete="off"></div>'+
      '<div class="field"><label for="np">WhatsApp (opcional)</label><input id="np" class="input" inputmode="tel" value="'+esc(nf.phone)+'" placeholder="(51) 99999-9999"></div>'+
      '<div class="field"><span class="label">Serviços</span><div class="stack tight">'+s.services.map(function(x){return '<button type="button" class="pick" data-sv="'+x.id+'" aria-pressed="'+(nf.services.indexOf(x.id)>=0)+'"><span class="tick">✓</span><span class="grow"><strong>'+esc(x.name)+'</strong><small>'+x.min+' min</small></span><span class="price">'+money(x.price)+'</span></button>'}).join("")+'</div></div>';
  }else{
    h+='<div class="field"><label for="nr">Motivo</label><input id="nr" class="input" value="'+esc(nf.reason)+'" placeholder="Ex.: almoço, folga, curso"></div>';
  }
  h+='<div class="field"><label for="nb">Profissional</label><select id="nb" class="input">'+(nf.type==="bl"?'<option value="all"'+(nf.barber==="all"?" selected":"")+'>Todos</option>':"")+s.barbers.map(function(b){return '<option value="'+b.id+'"'+(nf.barber===b.id?" selected":"")+'>'+esc(b.name)+'</option>'}).join("")+'</select></div>';
  h+='<div class="field"><label for="nd">Data</label><input id="nd" class="input" type="date" min="'+today+'" value="'+nf.date+'"></div>';
  if(nf.type==="ag"){
    h+='<div class="field"><span class="label">Horário</span><div id="slots"></div></div>';
  }else{
    h+='<div class="row"><div class="field"><label for="nfm">Das</label><input id="nfm" class="input" type="time" value="'+nf.from+'"></div><div class="field"><label for="nto">Até</label><input id="nto" class="input" type="time" value="'+nf.to+'"></div></div>';
  }
  h+='<p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">'+(nf.type==="ag"?"Salvar agendamento"+(total?" · "+money(total):""):"Salvar bloqueio")+'</button>';
  subpage(s,"Novo",h,"agenda");
  var g=function(i){return document.getElementById(i)};
  app.querySelectorAll("[data-t]").forEach(function(b){b.onclick=function(){nf.type=b.dataset.t;nf.time=null;if(nf.type==="ag"&&nf.barber==="all")nf.barber=s.barbers[0].id;viewNew()}});
  app.querySelectorAll("[data-sv]").forEach(function(b){b.onclick=function(){var i=nf.services.indexOf(b.dataset.sv);if(i>=0)nf.services.splice(i,1);else nf.services.push(b.dataset.sv);nf.time=null;viewNew()}});
  if(g("nn"))g("nn").oninput=function(e){nf.name=e.target.value};
  if(g("np"))g("np").oninput=function(e){nf.phone=e.target.value};
  if(g("nr"))g("nr").oninput=function(e){nf.reason=e.target.value};
  g("nb").onchange=function(e){nf.barber=e.target.value;nf.time=null;viewNew()};
  g("nd").onchange=function(e){nf.date=e.target.value||today;nf.time=null;viewNew()};
  if(g("nfm"))g("nfm").onchange=function(e){nf.from=e.target.value};
  if(g("nto"))g("nto").onchange=function(e){nf.to=e.target.value};
  if(nf.type==="ag"){
    var box=g("slots");
    if(!dur)box.innerHTML='<p class="note">Escolha os serviços para ver os horários livres.</p>';
    else{
      var sl=slotsFor(s,nf.date,dur,nf.barber);
      if(!sl||!sl.length)box.innerHTML='<p class="note">Sem horários neste dia.</p>';
      else{box.innerHTML='<div class="slots">'+sl.map(function(x){return '<button type="button" class="slot" data-tm="'+x.s+'" '+(x.free?"":"disabled")+' aria-pressed="'+(nf.time===x.s)+'">'+fmt(x.s)+'</button>'}).join("")+'</div>';
        box.querySelectorAll("[data-tm]").forEach(function(b){b.onclick=function(){nf.time=+b.dataset.tm;viewNew()}})}
    }
  }
  g("sv").onclick=function(){
    var er=g("err");function fail(m){er.hidden=false;er.textContent=m;er.scrollIntoView({block:"center"})}
    var rows=[];
    if(nf.type==="ag"){
      if(nf.name.trim().length<2)return fail("Informe o nome do cliente.");
      if(!dur)return fail("Escolha ao menos um serviço.");
      if(nf.time==null)return fail("Escolha um horário.");
      rows.push({id:"k"+uid(),shop:s.id,barber:nf.barber,date:nf.date,start:nf.time,dur:dur,services:svc.map(function(x){return {name:x.name,price:x.price}}),total:total,name:nf.name.trim(),phone:nf.phone.trim(),status:"confirmado",source:"manual"});
    }else{
      var a=toMin(nf.from),b=toMin(nf.to);
      if(!(b>a))return fail("O fim do bloqueio deve ser depois do início.");
      var targets=nf.barber==="all"?s.barbers:s.barbers.filter(function(x){return x.id===nf.barber});
      var clash=targets.some(function(t){return !barberFree(s,t,nf.date,a,b-a)});
      if(clash)return fail("Já existe agendamento nesse intervalo. Cancele ou mova antes de bloquear.");
      targets.forEach(function(t){rows.push({id:"k"+uid(),shop:s.id,barber:t.id,date:nf.date,start:a,dur:b-a,services:[],total:0,name:nf.reason.trim(),phone:"",status:"bloqueio",source:"manual"})});
    }
    var btn=g("sv");btn.disabled=true;
    DB.addBookings(rows).then(function(ok){
      btn.disabled=false;
      if(!ok)return fail("Não foi possível salvar. Verifique a conexão e tente de novo.");
      agDate=nf.date;agOff=Math.floor((dateOf(nf.date)-dateOf(dkey(new Date())))/864e5/7)*7;if(agOff<-28)agOff=-28;nf=null;
      toast("Salvo na agenda");location.hash="agenda";if(location.hash==="#agenda")route(false,true);
    });
  };
}

/* ---------- Clientes ---------- */
function clientsOf(s){
  var map={};
  bookings.filter(function(b){return b.shop===s.id&&b.status!=="bloqueio"}).forEach(function(b){
    var k=clientKey(b),c=map[k]||(map[k]={key:k,name:b.name,phone:b.phone,list:[]});
    c.list.push(b);if(b.phone)c.phone=b.phone;c.name=b.name;
  });
  var today=dkey(new Date());
  return Object.keys(map).map(function(k){
    var c=map[k];c.list.sort(function(a,b){return (a.date+fmt(a.start))<(b.date+fmt(b.start))?1:-1});
    var done=c.list.filter(function(b){return b.status==="concluido"});
    c.visits=done.length;c.noshow=c.list.filter(function(b){return b.status==="faltou"}).length;
    c.spent=done.reduce(function(a,b){return a+b.total},0);
    c.last=done[0]?done[0].date:null;
    c.next=c.list.filter(function(b){return b.status==="confirmado"&&b.date>=today}).slice(-1)[0]||null;
    return c;
  }).sort(function(a,b){return (b.last||"")<(a.last||"")?-1:1});
}
function viewClients(){
  var s=myShop(),cl=clientsOf(s);
  shell(s,"clientes",'<h1>Clientes</h1><div class="field"><label for="q">Buscar por nome ou telefone</label><input id="q" class="input" type="search"></div><div id="cl" class="card"></div>');
  function paint(){
    var q=document.getElementById("q").value.trim().toLowerCase(),qd=digits(q);
    var l=cl.filter(function(c){return !q||c.name.toLowerCase().indexOf(q)>=0||(qd&&digits(c.phone).indexOf(qd)>=0)});
    document.getElementById("cl").innerHTML=l.length?l.map(function(c){
      return '<a class="client" href="#clientes-'+esc(c.key)+'"><span><strong>'+esc(c.name)+'</strong><small>'+(c.visits?c.visits+" visita"+(c.visits>1?"s":"")+" · última em "+fmtDate(c.last):"Ainda sem visita concluída")+'</small></span><span class="price">'+money(c.spent)+'</span></a>'}).join("")
      :'<p style="padding:16px" class="muted">'+(cl.length?"Nenhum cliente encontrado.":"Seus clientes aparecem aqui assim que agendarem.")+'</p>';
  }
  document.getElementById("q").addEventListener("input",paint);paint();
}
function viewClient(key){
  var s=myShop(),c=clientsOf(s).filter(function(x){return x.key===key})[0];
  if(!c)return location.hash="clientes";
  var wa=waLink(c.phone);
  var h='<div class="tiles"><div class="tile"><small>Visitas</small><b>'+c.visits+'</b></div><div class="tile"><small>Faltas</small><b>'+c.noshow+'</b></div><div class="tile"><small>Total gasto</small><b>'+money(c.spent)+'</b></div></div>'+
    '<div class="card info"><div><b>Telefone</b><span>'+esc(c.phone||"Não informado")+'</span></div><div><b>Próximo</b><span>'+(c.next?fmtDate(c.next.date)+", "+fmt(c.next.start):"Nenhum agendado")+'</span></div></div>'+
    (wa?'<a class="btn block-btn" target="_blank" rel="noopener" href="'+esc(wa)+'">Chamar no WhatsApp</a>':"")+
    '<h2>Histórico</h2><div class="stack tight">'+c.list.map(function(b){return '<div class="bk"><div class="bd"><strong>'+fmtDate(b.date)+' às '+fmt(b.start)+'</strong><span>'+b.services.map(function(x){return esc(x.name)}).join(", ")+' · '+money(b.total)+' · '+esc(barberName(s,b.barber))+'</span><span class="chipst s-'+b.status+'">'+STLAB[b.status]+'</span></div></div>'}).join("")+'</div>';
  subpage(s,esc(c.name),h,"clientes");
}

/* ---------- Ajustes ---------- */
function viewSettings(){
  var s=myShop(),hasEx=bookings.some(function(b){return b.ex});
  shell(s,"ajustes",'<h1>Ajustes</h1><div class="card"><div class="menu">'+
    '<a href="#ajustes-link"><span><strong>Link para clientes</strong><small>Copie e envie no WhatsApp e Instagram</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-servicos"><span><strong>Serviços e preços</strong><small>'+s.services.length+' cadastrados</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-equipe"><span><strong>Equipe</strong><small>'+s.barbers.map(function(b){return esc(b.name)}).join(", ")+'</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-horarios"><span><strong>Horário de funcionamento</strong><small>Dias, manhã e tarde</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-cursos"><span><strong>Cursos e vídeo</strong><small>'+s.courses.length+' cadastrados</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-produtos"><span><strong>Produtos</strong><small>'+s.products.length+' cadastrados</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-novidades"><span><strong>Novidades</strong><small>'+s.news.length+' publicadas</small></span><span class="chev">›</span></a>'+
    '<a href="#ajustes-perfil"><span><strong>Perfil da barbearia</strong><small>Logo, capa, cor, endereço e contato</small></span><span class="chev">›</span></a></div></div>'+
    (REMOTE?"":'<button class="btn ghost block-btn" id="ex">'+(hasEx?"Apagar agendamentos de exemplo":"Carregar agendamentos de exemplo")+'</button>')+
    '<button class="btn ghost block-btn" id="out">Sair do painel</button>'+(REMOTE?"":'<p class="foot">Modo de teste: dados salvos só neste navegador.</p>'));
  var exb=document.getElementById("ex");if(exb)exb.onclick=function(){if(hasEx){clearExamples();toast("Exemplos apagados")}else{seedExamples();toast("Exemplos carregados")}viewSettings()};
  document.getElementById("out").onclick=function(){DB.signOut().then(function(){location.hash="";route(false)})};
}
function viewLink(){
  var s=myShop(),link=shareLink(s),book=link+"#agendar",msg=s.name+": agende seu horário online em "+book;
  var h='<p class="lead">Coloque o primeiro link na bio do Instagram. O segundo leva direto para marcar horário.</p>'+
    '<div class="field"><label for="lk">Página principal</label><div class="copybox"><input id="lk" class="input" readonly value="'+esc(link)+'" onfocus="this.select()"><button class="btn small" id="c1">Copiar</button></div></div>'+
    '<div class="field"><label for="lk2">Direto para agendar</label><div class="copybox"><input id="lk2" class="input" readonly value="'+esc(book)+'" onfocus="this.select()"><button class="btn small" id="c3">Copiar</button></div></div>'+
    '<div class="field"><label for="ms">Mensagem pronta</label><div class="copybox"><input id="ms" class="input" readonly value="'+esc(msg)+'" onfocus="this.select()"><button class="btn small" id="c2">Copiar</button></div></div>'+
    '<a class="btn ghost block-btn" href="#">Ver como o cliente vê</a>'+
    (REMOTE?"":'<p class="note">Modo de teste: os dados ficam só neste navegador, então um cliente em outro aparelho não enxerga sua agenda. Configure o Supabase (veja o README) para valer de verdade.</p>');
  subpage(s,"Link para clientes",h);
  document.getElementById("c1").onclick=function(){s.done.link=1;persist();copy(link)};
  document.getElementById("c3").onclick=function(){s.done.link=1;persist();copy(book)};
  document.getElementById("c2").onclick=function(){s.done.link=1;persist();copy(msg)};
}
function viewServices(){
  var s=myShop();
  function row(x){return '<div class="rowline" data-id="'+esc(x.id||"")+'"><input class="input" data-k="n" placeholder="Serviço" value="'+esc(x.name||"")+'" aria-label="Nome do serviço"><input class="input num" data-k="p" inputmode="decimal" placeholder="R$" value="'+esc(x.price!=null&&x.price!==""?x.price:"")+'" aria-label="Preço"><select class="input dur" data-k="m" aria-label="Duração">'+durOpts(x.min||30)+'</select><button type="button" class="rm" aria-label="Remover serviço">×</button></div>'}
  subpage(s,"Serviços",'<p class="lead">Nome, preço e duração. Os horários livres do cliente respeitam a duração.</p><div id="rows" class="stack tight">'+s.services.map(row).join("")+'</div><button type="button" class="btn ghost small" id="add">+ Adicionar serviço</button><p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">Salvar serviços</button>');
  var rows=document.getElementById("rows");
  rows.addEventListener("click",function(e){if(e.target.classList.contains("rm")&&rows.children.length>1)e.target.parentNode.remove()});
  document.getElementById("add").onclick=function(){rows.insertAdjacentHTML("beforeend",row({}))};
  document.getElementById("sv").onclick=function(){
    var out=[].slice.call(rows.children).map(function(r){
      var g=function(k){return r.querySelector('[data-k="'+k+'"]').value.trim()},p=parseFloat(g("p").replace(",","."));
      return g("n")?{id:r.dataset.id||"v"+uid(),name:g("n"),price:isNaN(p)?0:p,min:+g("m")}:null}).filter(Boolean);
    if(!out.length){var e=document.getElementById("err");e.hidden=false;e.textContent="Cadastre ao menos um serviço.";return}
    s.services=out;s.done.servicos=1;persist().then(function(ok){if(ok){toast("Serviços salvos");location.hash="ajustes"}});
  };
}
function viewTeam(){
  var s=myShop();
  function row(b){
    var id=uid();
    return '<div class="card pad stack tight" data-id="'+esc(b.id||"")+'"><div class="logo-up"><div class="imgp" data-prev="1" style="border-radius:50%">'+prev(b.photo||"")+'</div><input type="file" accept="image/*" data-img="1" aria-label="Foto do barbeiro"></div>'+
      '<div class="field"><label for="tn'+id+'">Nome</label><input id="tn'+id+'" class="input" data-k="n" value="'+esc(b.name||"")+'"></div>'+
      '<div class="field"><label for="tk'+id+'">Apelido ou sobrenome (opcional)</label><input id="tk'+id+'" class="input" data-k="k" value="'+esc(b.nick||"")+'"></div>'+
      '<button type="button" class="btn danger small" data-del="1">Remover</button></div>';
  }
  subpage(s,"Equipe",'<p class="lead">Cada barbeiro tem a própria agenda. O cliente pode escolher um deles ou deixar em qualquer um.</p><div id="rows" class="stack tight"></div><button type="button" class="btn ghost small" id="add">+ Adicionar barbeiro</button><p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">Salvar equipe</button>');
  var rows=document.getElementById("rows");
  function addCard(b){rows.insertAdjacentHTML("beforeend",row(b));rows.lastElementChild.photo=b.photo||""}
  s.barbers.forEach(addCard);
  rows.addEventListener("click",function(e){if(e.target.dataset.del&&rows.children.length>1)e.target.closest(".card").remove()});
  rows.addEventListener("change",function(e){
    var inp=e.target;if(!(inp.dataset.img&&inp.files&&inp.files[0]))return;
    var el=inp.closest(".card");
    resizeImg(inp.files[0],240,function(d){el.photo=d;el.querySelector("[data-prev]").innerHTML=prev(d)});
  });
  document.getElementById("add").onclick=function(){addCard({});rows.lastElementChild.scrollIntoView({block:"center"})};
  document.getElementById("sv").onclick=function(){
    var out=[].slice.call(rows.children).map(function(el){
      var n=el.querySelector('[data-k="n"]').value.trim();
      return n?{id:el.dataset.id||"b"+uid(),name:n,nick:el.querySelector('[data-k="k"]').value.trim(),photo:el.photo||""}:null}).filter(Boolean);
    if(!out.length){var e=document.getElementById("err");e.hidden=false;e.textContent="Cadastre ao menos um barbeiro.";return}
    s.barbers=out;s.done.equipe=1;persist().then(function(ok){if(ok){toast("Equipe salva");location.hash="ajustes"}});
  };
}
function viewHours(){
  var s=myShop(),h='<p class="lead">Informe os períodos de atendimento de cada dia. Deixe em branco o período em que não atende, como o almoço, ou o dia inteiro para fechar.</p>';
  [1,2,3,4,5,6,0].forEach(function(d){
    var iv=hoursOf(s,d);
    h+='<div class="card pad stack tight" data-d="'+d+'"><strong>'+DAYFULL[d]+'</strong>'+[0,1].map(function(i){
      var x=iv[i]||["",""];
      return '<div class="row"><div class="field"><label for="h'+d+i+'a">'+(i?"Tarde":"Manhã")+' · abre</label><input id="h'+d+i+'a" class="input" type="time" data-i="'+i+'a" value="'+x[0]+'"></div><div class="field"><label for="h'+d+i+'b">Fecha</label><input id="h'+d+i+'b" class="input" type="time" data-i="'+i+'b" value="'+x[1]+'"></div></div>'}).join("")+'</div>';
  });
  h+='<p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">Salvar horários</button>';
  subpage(s,"Horários",h);
  document.getElementById("sv").onclick=function(){
    var out={},er=document.getElementById("err");
    function fail(m){er.hidden=false;er.textContent=m;er.scrollIntoView({block:"center"})}
    for(var d=0;d<7;d++){
      var el=document.querySelector('[data-d="'+d+'"]'),iv=[];
      for(var i=0;i<2;i++){
        var a=el.querySelector('[data-i="'+i+'a"]').value,b=el.querySelector('[data-i="'+i+'b"]').value;
        if(a&&b){if(toMin(b)<=toMin(a))return fail(DAYFULL[d]+": o fechamento deve ser depois da abertura.");iv.push([a,b])}
        else if(a||b)return fail(DAYFULL[d]+": preencha abertura e fechamento do período, ou deixe os dois em branco.");
      }
      iv.sort(function(x,y){return toMin(x[0])-toMin(y[0])});
      if(iv.length===2&&toMin(iv[1][0])<toMin(iv[0][1]))return fail(DAYFULL[d]+": os períodos não podem se sobrepor.");
      out[d]=iv;
    }
    if(!Object.keys(out).some(function(k){return out[k].length}))return fail("Mantenha ao menos um dia aberto.");
    s.hours=out;delete s.days;delete s.open;delete s.close;persist().then(function(ok){if(ok){toast("Horários salvos");location.hash="ajustes"}});
  };
}
function viewProfile(){
  var s=myShop(),brand=s.brand,lg=s.logo,cv=s.cover||"";
  var h='<div class="logo-up"><div id="lp"></div><div class="field"><label for="lgf">Logo</label><input id="lgf" type="file" accept="image/*"></div></div>'+
    '<div class="field"><span class="label">Foto de capa da tela inicial</span><div class="logo-up"><div class="imgp" id="cvp"></div><div class="stack tight"><input id="cvf" type="file" accept="image/*" aria-label="Foto de capa"><button type="button" class="btn ghost small" id="cvx">Remover capa</button></div></div></div>'+
    '<div class="field"><label for="f-name">Nome da barbearia</label><input id="f-name" class="input" value="'+esc(s.name)+'"></div>'+
    '<div class="field"><label for="f-tag">Frase de apresentação</label><input id="f-tag" class="input" value="'+esc(s.tagline)+'" placeholder="Ex.: Corte clássico e barba na toalha quente"></div>'+
    '<div class="field"><span class="label">Cor dos botões</span><div class="swatches" id="sws"></div></div>'+
    '<div class="field"><label for="f-city">Cidade</label><input id="f-city" class="input" value="'+esc(s.city)+'" placeholder="Ex.: Porto Alegre, RS"></div>'+
    '<div class="field"><label for="f-addr">Endereço</label><input id="f-addr" class="input" value="'+esc(s.address)+'" placeholder="Rua e número"></div>'+
    '<div class="row"><div class="field"><label for="f-wa">WhatsApp</label><input id="f-wa" class="input" inputmode="tel" value="'+esc(s.whatsapp)+'"></div><div class="field"><label for="f-ig">Instagram</label><input id="f-ig" class="input" value="'+esc(s.instagram)+'" placeholder="@suabarbearia"></div></div>'+
    '<div class="field"><label for="f-pn">Aviso sobre preços (opcional)</label><input id="f-pn" class="input" value="'+esc(s.priceNote||"")+'" placeholder="Ex.: O preço pode variar conforme a data"></div>'+
    '<p class="foot">Os horários de funcionamento ficam em Ajustes, em Horário de funcionamento.</p><p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">Salvar perfil</button>';
  subpage(s,"Perfil",h);
  var g=function(i){return document.getElementById(i)};
  function paintLogo(){g("lp").innerHTML=logo({name:g("f-name").value||s.name,logo:lg},72)}
  function paintCv(){g("cvp").innerHTML=prev(cv)}
  function tint(){var m=document.querySelector(".scope");m.style.setProperty("--brand",brand);m.style.setProperty("--on-brand",onBrand(brand));paintLogo()}
  function paintSw(){
    g("sws").innerHTML=SWATCHES.map(function(c){return '<button type="button" class="sw" style="background:'+c+'" data-c="'+c+'" aria-label="Cor '+c+'" aria-pressed="'+(brand===c)+'"></button>'}).join("")+'<input type="color" id="cc" value="'+brand+'" aria-label="Escolher outra cor">';
    g("sws").querySelectorAll("[data-c]").forEach(function(b){b.onclick=function(){brand=b.dataset.c;paintSw();tint()}});
    g("cc").oninput=function(e){brand=e.target.value;tint();g("sws").querySelectorAll("[data-c]").forEach(function(b){b.setAttribute("aria-pressed","false")})};
    tint();
  }
  g("f-name").oninput=paintLogo;
  g("lgf").onchange=function(e){
    var file=e.target.files[0];if(!file)return;var rd=new FileReader();
    rd.onload=function(){var im=new Image();im.onload=function(){
      var c=document.createElement("canvas"),sz=240;c.width=c.height=sz;var x=c.getContext("2d"),r=Math.min(im.width,im.height);
      x.drawImage(im,(im.width-r)/2,(im.height-r)/2,r,r,0,0,sz,sz);putImg(c.toDataURL("image/png"),function(u){lg=u;paintLogo()})};
      im.onerror=function(){toast("Não foi possível ler essa imagem")};im.src=rd.result};
    rd.readAsDataURL(file);
  };
  g("cvf").onchange=function(e){var f=e.target.files[0];if(f)resizeImg(f,900,function(d){cv=d;paintCv()})};
  g("cvx").onclick=function(){cv="";paintCv()};
  paintCv();paintSw();
  g("sv").onclick=function(){
    var er=g("err");function fail(m){er.hidden=false;er.textContent=m;er.scrollIntoView({block:"center"})}
    var name=g("f-name").value.trim();if(!name)return fail("Informe o nome da barbearia.");
    s.name=name;s.tagline=g("f-tag").value.trim();s.city=g("f-city").value.trim();s.address=g("f-addr").value.trim();s.whatsapp=g("f-wa").value.trim();s.instagram=g("f-ig").value.trim();
    s.priceNote=g("f-pn").value.trim();s.brand=brand;s.logo=lg;s.cover=cv;s.done.perfil=1;persist().then(function(ok){if(ok){toast("Perfil salvo");location.hash="ajustes"}});
  };
}

/* ---------- cadastros: produtos, cursos, novidades ---------- */
var CFG={
  produtos:{key:"products",title:"Produtos",lead:"Foto, preço e descrição. O cliente pede pelo WhatsApp da barbearia.",add:"+ Adicionar produto",pk:"name",
    fields:[["name","Nome","t"],["price","Preço (R$)","n"],["desc","Descrição curta","t"],["img","Foto","i"],["on","Disponível para pedido","c"]]},
  cursos:{key:"courses",title:"Cursos",lead:"O primeiro curso com link de vídeo aparece em destaque na tela inicial. O vídeo abre em outra aba (YouTube, Instagram e outros).",add:"+ Adicionar curso",pk:"name",
    fields:[["name","Nome do curso","t"],["price","Valor (R$, opcional)","n"],["info","Data e carga horária","t"],["desc","Descrição","a"],["video","Link do vídeo de apresentação","u"],["img","Capa do vídeo (opcional)","i"]]},
  novidades:{key:"news",title:"Novidades",lead:"Avisos e promoções da tela inicial. As 3 mais recentes ficam visíveis.",add:"+ Adicionar novidade",pk:"title",
    fields:[["title","Título","t"],["text","Texto","a"],["img","Imagem (opcional)","i"]]}
};
function isUrl(u){return /^https?:\/\/\S+$/i.test(u||"")}
function resizeImg(file,max,cb){
  var rd=new FileReader();
  rd.onload=function(){var im=new Image();im.onload=function(){
    var r=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");
    c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height);putImg(c.toDataURL("image/jpeg",.82),cb)};
    im.onerror=function(){toast("Não foi possível ler essa imagem")};im.src=rd.result};
  rd.readAsDataURL(file);
}
function prev(v){return v?'<img alt="" src="'+esc(v)+'">':'<span class="muted" style="font-size:.78rem">Sem foto</span>'}
function viewList(kind){
  var s=myShop(),c=CFG[kind];
  function card(it){
    var h='<div class="card pad stack tight" data-id="'+esc(it.id||"")+'" data-date="'+esc(it.date||"")+'">';
    c.fields.forEach(function(f){
      var k=f[0],l=f[1],t=f[2],v=it[k],id=uid()+k;
      if(t==="i")h+='<div class="field"><span class="label">'+l+'</span><div class="logo-up"><div class="imgp" data-prev="'+k+'">'+prev(v)+'</div><input type="file" accept="image/*" data-img="'+k+'" aria-label="'+l+'"></div></div>';
      else if(t==="c")h+='<label class="pick" style="min-height:48px"><input type="checkbox" data-k="'+k+'" '+(v!==false?"checked":"")+'><span class="grow">'+l+'</span></label>';
      else if(t==="a")h+='<div class="field"><label for="'+id+'">'+l+'</label><textarea id="'+id+'" class="input" rows="3" data-k="'+k+'">'+esc(v||"")+'</textarea></div>';
      else h+='<div class="field"><label for="'+id+'">'+l+'</label><input id="'+id+'" class="input" data-k="'+k+'" '+(t==="n"?'inputmode="decimal"':(t==="u"?'inputmode="url" placeholder="https://"':""))+' value="'+esc(t==="n"?(v?v:""):(v||""))+'"></div>';
    });
    return h+'<button type="button" class="btn danger small" data-del="1">Remover</button></div>';
  }
  subpage(s,c.title,'<p class="lead">'+c.lead+'</p><div id="rows" class="stack tight"></div><button type="button" class="btn ghost small" id="add">'+c.add+'</button><p id="err" class="err" hidden></p><button class="btn block-btn" id="sv">Salvar</button>');
  var rows=document.getElementById("rows");
  function addCard(it){
    rows.insertAdjacentHTML("beforeend",card(it));var el=rows.lastElementChild;el.imgs={};
    c.fields.forEach(function(f){if(f[2]==="i")el.imgs[f[0]]=it[f[0]]||""});
  }
  (s[c.key]||[]).forEach(addCard);
  rows.addEventListener("click",function(e){if(e.target.dataset.del){e.target.closest(".card").remove()}});
  rows.addEventListener("change",function(e){
    var inp=e.target;if(!(inp.dataset.img&&inp.files&&inp.files[0]))return;
    var el=inp.closest(".card"),k=inp.dataset.img;
    resizeImg(inp.files[0],520,function(d){el.imgs[k]=d;el.querySelector('[data-prev="'+k+'"]').innerHTML=prev(d)});
  });
  document.getElementById("add").onclick=function(){addCard(kind==="produtos"?{on:true}:{});rows.lastElementChild.scrollIntoView({block:"center"})};
  document.getElementById("sv").onclick=function(){
    var out=[];
    [].slice.call(rows.children).forEach(function(el){
      var it={id:el.dataset.id||uid(),date:el.dataset.date||dkey(new Date())};
      c.fields.forEach(function(f){
        var k=f[0],t=f[2],inp=el.querySelector('[data-k="'+k+'"]');
        if(t==="i")it[k]=el.imgs[k]||"";
        else if(t==="c")it[k]=inp.checked;
        else if(t==="n"){var n=parseFloat(String(inp.value).replace(",","."));it[k]=isNaN(n)?0:n}
        else it[k]=inp.value.trim();
      });
      if(it[c.pk])out.push(it);
    });
    var bad=out.filter(function(x){return x.video&&!isUrl(x.video)})[0];
    if(bad){var er=document.getElementById("err");er.hidden=false;er.textContent="O link do vídeo precisa começar com http:// ou https://.";return}
    s[c.key]=out;persist().then(function(ok){if(ok){toast("Salvo");location.hash="ajustes"}});
  };
}

/* ---------- tela inicial do cliente ---------- */
function shortDate(k){var d=dateOf(k);return ("0"+d.getDate()).slice(-2)+"/"+("0"+(d.getMonth()+1)).slice(-2)+"/"+d.getFullYear()}
function igUrl(h){return "https://instagram.com/"+String(h||"").replace(/^@/,"").trim()}
function poster(c){
  var img=c.img?'<img alt="" src="'+esc(c.img)+'">':"";
  if(isUrl(c.video))return '<a class="poster" target="_blank" rel="noopener" href="'+esc(c.video)+'" aria-label="Assistir ao vídeo de apresentação do curso '+esc(c.name)+'">'+img+'<span class="play" aria-hidden="true"></span><span class="cap">Assistir apresentação</span></a>';
  return '<div class="poster">'+img+'<span class="cap">Vídeo de apresentação em breve</span></div>';
}
function viewHome(){
  var s=theShop(),mine=myShop();
  var viewing=mine?'<div class="viewing"><span>Você está vendo como seus clientes veem.</span><a href="#hoje" style="font-weight:700">Voltar ao painel</a></div>':"";
  var courses=s.courses,feat=courses.filter(function(c){return isUrl(c.video)})[0]||courses[0],others=courses.filter(function(c){return c!==feat});
  var news=s.news.slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,3);
  function cta(txt,label,cls){var u=waLink(s.whatsapp,txt);return u?'<a class="btn '+(cls||"")+'" target="_blank" rel="noopener" href="'+esc(u)+'">'+label+'</a>':""}
  var hs=s.cover?' style="background-image:linear-gradient(rgba(10,10,10,.6),rgba(10,10,10,.92)),url(\''+esc(s.cover)+'\');background-size:cover;background-position:center 25%"':"";
  var h='<div class="scope" style="'+scopeStyle(s)+'">'+viewing+clientHeader(s)+
    '<section class="hero"'+hs+'>'+logo(s,96)+'<h1>'+esc(s.name)+'</h1><p>'+esc(s.tagline||"")+'</p><span class="status">'+esc(statusText(s))+'</span><div class="row"><a class="btn" href="#agendar">Agendar horário</a>'+(feat?'<button class="btn ghost" id="goc">Conhecer o curso</button>':"")+'</div></section><main class="stack">';
  if(feat){
    h+='<section class="sec" id="curso"><p class="label">Curso em destaque</p>'+poster(feat)+'<h2>'+esc(feat.name)+'</h2>'+
      (feat.info?'<p class="muted">'+esc(feat.info)+'</p>':"")+(feat.desc?'<p>'+esc(feat.desc)+'</p>':"")+
      (feat.price>0?'<p><b class="price">'+money(feat.price)+'</b></p>':"")+
      (cta("Olá! Tenho interesse no curso: "+feat.name,"Quero me inscrever","")||'<p class="note">Fale com a barbearia para se inscrever.</p>')+'</section>';
    if(others.length)h+='<section class="sec"><p class="label">Outros cursos</p><div class="card pad stack tight">'+others.map(function(c){
      var b=cta("Olá! Tenho interesse no curso: "+c.name,"Saber mais","ghost small");
      return '<div class="row" style="flex-wrap:nowrap;align-items:center"><div style="min-width:0"><strong>'+esc(c.name)+'</strong>'+(c.info?'<br><span class="muted">'+esc(c.info)+'</span>':"")+(c.price>0?'<br><span class="price">'+money(c.price)+'</span>':"")+'</div>'+
        (b?'<div style="flex:0 0 auto">'+b+'</div>':"")+'</div>'}).join("")+'</div></section>';
  }
  if(news.length)h+='<section class="sec"><h2>Novidades</h2>'+news.map(function(n){
    return '<article class="card pad stack tight">'+(n.img?'<img class="news-img" alt="" src="'+esc(n.img)+'">':"")+'<span class="label">'+shortDate(n.date)+'</span><h3>'+esc(n.title)+'</h3>'+(n.text?'<p>'+esc(n.text)+'</p>':"")+'</article>'}).join("")+'</section>';
  if(s.barbers.length)h+='<section class="sec"><h2>Agende com um profissional</h2><div class="team">'+s.barbers.map(function(b){
    return '<a class="mate" href="#agendar-'+esc(b.id)+'">'+avatar(b,72)+'<strong>'+esc(b.name)+'</strong>'+(b.nick?'<small>'+esc(b.nick)+'</small>':"")+'</a>'}).join("")+'</div></section>';
  if(s.services.length)h+='<section class="sec"><h2>Serviços e preços</h2><div class="card">'+s.services.map(function(x){
    return '<div class="item"><div><strong>'+esc(x.name)+'</strong><small>'+x.min+' min</small></div><span class="price">'+money(x.price)+'</span></div>'}).join("")+'</div>'+(s.priceNote?'<p class="foot">*'+esc(s.priceNote)+'</p>':"")+'<a class="btn block-btn" href="#agendar">Agendar horário</a></section>';
  if(s.products.length)h+='<section class="sec"><h2>Produtos</h2><div class="grid2">'+s.products.map(function(p){
    var on=p.on!==false,btn=on?(cta("Olá! Quero pedir o produto: "+p.name,"Pedir","small")||""):'<span class="chipst s-cancelado">Esgotado</span>';
    return '<div class="prod"><div class="ph">'+(p.img?'<img alt="'+esc(p.name)+'" src="'+esc(p.img)+'">':esc(initials(p.name)))+'</div><div class="pb"><strong>'+esc(p.name)+'</strong>'+(p.desc?'<small>'+esc(p.desc)+'</small>':"")+
      (p.price>0?'<span class="price">'+money(p.price)+'</span>':"")+btn+'</div></div>'}).join("")+'</div>'+(waLink(s.whatsapp)?'<p class="foot">Os pedidos são combinados pelo WhatsApp da barbearia.</p>':"")+'</section>';
  var addr=[s.address,s.city].filter(Boolean).join(", "),maps=addr?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(addr):"";
  var info="";
  if(addr)info+='<div><b>Endereço</b><span>'+esc(s.address)+(s.city?'<br>'+esc(s.city):"")+'</span></div>';
  if(s.whatsapp)info+='<div><b>WhatsApp</b><span>'+esc(s.whatsapp)+'</span></div>';
  if(s.instagram)info+='<div><b>Instagram</b><span><a target="_blank" rel="noopener" href="'+esc(igUrl(s.instagram))+'">'+esc(s.instagram)+'</a></span></div>';
  h+='<section class="sec"><h2>Onde estamos</h2>'+(info?'<div class="card info">'+info+'</div>':"")+
    (maps?'<a class="btn ghost block-btn" target="_blank" rel="noopener" href="'+esc(maps)+'">Como chegar</a>':"")+
    '<h3>Horário de funcionamento</h3><div class="card info">'+hoursRows(s)+'</div></section><p class="foot"><a href="#painel">Área do dono</a></p></main>'+
    '<div class="bar"><div><div class="sum"><small>'+esc(s.name)+'</small><b>Agende seu horário</b></div><a class="btn" href="#agendar">Agendar</a></div></div></div>';
  app.innerHTML=h;
  var g=document.getElementById("goc");
  if(g)g.onclick=function(){var r=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;document.getElementById("curso").scrollIntoView({behavior:r?"auto":"smooth",block:"start"})};
}

/* ---------- entrada do dono ---------- */
function viewOwnerLogin(){
  var s=theShop();
  app.innerHTML='<div class="scope" style="'+scopeStyle(s)+'">'+clientHeader(s)+'<main class="stack"><h1>Painel do dono</h1>'+
    '<p class="lead">Entre com o e-mail e a senha cadastrados para ver a agenda.</p>'+
    '<div class="field"><label for="a-mail">E-mail</label><input id="a-mail" class="input" type="email" autocomplete="username" inputmode="email"></div>'+
    '<div class="field"><label for="a-pw">Senha</label><input id="a-pw" class="input" type="password" autocomplete="current-password"></div>'+
    '<p id="err" class="err" hidden></p><button class="btn block-btn" id="go">Entrar</button>'+
    '<a class="back" href="#">‹ Voltar à página de agendamento</a>'+(REMOTE?"":'<p class="foot">Modo de teste, sem banco de dados: qualquer e-mail e senha entram.</p>')+'</main></div>';
  var g=function(i){return document.getElementById(i)};
  function fail(m){g("err").hidden=false;g("err").textContent=m}
  function go(){
    var mail=g("a-mail").value.trim(),pw=g("a-pw").value;
    if(!mail||!pw)return fail("Informe e-mail e senha.");
    g("err").hidden=true;g("go").disabled=true;
    DB.signIn(mail,pw).then(function(r){
      g("go").disabled=false;
      if(!r.ok)return fail(r.error);
      location.hash="hoje";
    });
  }
  g("go").onclick=go;
  g("a-pw").onkeydown=function(e){if(e.key==="Enter")go()};
}

/* ---------- página do cliente (só da barbearia) ---------- */
var STEPN=["Serviços","Profissional","Horário","Seus dados"];
function clientHeader(s){return '<header class="top"><div class="who">'+logo(s,36)+'<strong>'+esc(s.name)+'</strong></div></header>'}
function viewBook(pre){
  var s=theShop(),slug="spc";
  if(!flow||flow.slug!==slug)flow={slug:slug,step:0,services:[],barber:null,date:null,time:null,name:"",phone:"",done:null};
  if(pre&&s.barbers.some(function(b){return b.id===pre}))flow.barber=pre;
  var f=flow,mine=myShop()&&myShop().id===s.id;
  var viewing=mine?'<div class="viewing"><span>Você está vendo como seus clientes veem.</span><a href="#hoje" style="font-weight:700">Voltar ao painel</a></div>':"";
  if(f.done)return viewDone(s,viewing);
  var svc=s.services.filter(function(x){return f.services.indexOf(x.id)>=0});
  var total=svc.reduce(function(a,x){return a+x.price},0),dur=svc.reduce(function(a,x){return a+x.min},0);
  var phoneOk=digits(f.phone).length>=10;
  var ok=[svc.length>0,!!f.barber,!!f.date&&f.time!=null,f.name.trim().length>1&&phoneOk][f.step];
  var top=f.step===0?"":clientHeader(s);
  var body="";
  if(f.step===0){
    body='<a class="back" href="#">‹ Voltar ao início</a><div class="card info"><div><b>Endereço</b><span>'+esc(s.address||"Consulte a barbearia")+(s.city?'<br>'+esc(s.city):"")+'</span></div><div><b>Hoje</b><span>'+esc(statusText(s))+'</span></div></div>'+
      '<h2>O que vai ser hoje?</h2>'+(s.priceNote?'<p class="foot">*'+esc(s.priceNote)+'</p>':"")+'<div class="stack tight">'+s.services.map(function(x){
      return '<button class="pick" data-svc="'+x.id+'" aria-pressed="'+(f.services.indexOf(x.id)>=0)+'"><span class="tick">✓</span><span class="grow"><strong>'+esc(x.name)+'</strong><small>'+x.min+' min</small></span><span class="price">'+money(x.price)+'</span></button>'}).join("")+'</div>';
  }else if(f.step===1){
    body='<h2>Com quem?</h2><div class="stack tight">'+
      '<button class="pick" data-bar="any" aria-pressed="'+(f.barber==="any")+'"><span class="tick">✓</span><span class="grow"><strong>Qualquer profissional</strong><small>Mais horários disponíveis</small></span></button>'+
      s.barbers.map(function(b){return '<button class="pick" data-bar="'+b.id+'" aria-pressed="'+(f.barber===b.id)+'"><span class="tick">✓</span>'+avatar(b,40)+'<span class="grow"><strong>'+esc(b.name)+'</strong>'+(b.nick?'<small>'+esc(b.nick)+'</small>':"")+'</span></button>'}).join("")+'</div>';
  }else if(f.step===2){
    var t=new Date(),days=[];for(var i=0;i<14;i++)days.push(dkey(new Date(t.getFullYear(),t.getMonth(),t.getDate()+i)));
    body='<h2>Escolha o dia</h2><div class="days" role="group" aria-label="Dias">'+days.map(function(k){
      var closed=!isOpenDay(s,dateOf(k).getDay());
      return '<button class="day" data-date="'+k+'" '+(closed?"disabled":"")+' aria-pressed="'+(f.date===k)+'"><small>'+DAYN[dateOf(k).getDay()]+'</small><b>'+dateOf(k).getDate()+'</b></button>'}).join("")+'</div><h2>Horários</h2><div id="slots"></div>';
  }else{
    body='<h2>Seus dados</h2><div class="field"><label for="nm">Nome</label><input id="nm" class="input" autocomplete="name" value="'+esc(f.name)+'" placeholder="Como devemos te chamar"></div>'+
      '<div class="field"><label for="ph">WhatsApp</label><input id="ph" class="input" inputmode="tel" autocomplete="tel" value="'+esc(f.phone)+'" placeholder="(51) 99999-9999"></div>'+
      '<div class="card info"><div><b>Serviços</b><span>'+svc.map(function(x){return esc(x.name)}).join(", ")+'</span></div>'+
      '<div><b>Profissional</b><span>'+esc(f.barber==="any"?"Qualquer disponível":barberName(s,f.barber))+'</span></div>'+
      '<div><b>Quando</b><span>'+fmtDate(f.date)+', '+fmt(f.time)+'</span></div><div><b>Total</b><span>'+money(total)+'</span></div></div>'+(s.priceNote?'<p class="foot">*'+esc(s.priceNote)+'</p>':"")+'<p class="foot">Usamos seu nome e WhatsApp só para este agendamento.</p>';
  }
  var hero=f.step===0?'<section class="hero">'+logo(s,84)+'<h1>'+esc(s.name)+'</h1><p>'+esc(s.tagline||"Agende seu horário online.")+'</p></section>':"";
  app.innerHTML='<div class="scope" style="'+scopeStyle(s)+'">'+viewing+(f.step===0?"":top)+hero+
    '<div class="steps" aria-label="Etapa '+(f.step+1)+' de 4">'+STEPN.map(function(_,i){return '<i class="'+(i<=f.step?"on":"")+'"></i>'}).join("")+'</div>'+
    '<main class="stack" style="padding-top:14px"><p class="label">Etapa '+(f.step+1)+' de 4 · '+STEPN[f.step]+'</p>'+body+'<p id="err" class="err" hidden></p>'+
    (f.step===0?'<p class="foot"><a href="#painel">Área do dono</a></p>':"")+'</main>'+
    '<div class="bar"><div>'+(f.step>0?'<button class="btn ghost" id="prev" aria-label="Voltar">‹</button>':"")+'<div class="sum"><small>'+(dur?dur+' min':'Nenhum serviço')+'</small><b>'+money(total)+'</b></div>'+
    '<button class="btn" id="next" '+(ok?"":"disabled")+'>'+(f.step===3?"Confirmar":"Continuar")+'</button></div></div></div>';
  var nx=document.getElementById("next");
  function refresh(){viewBook(slug)}
  app.querySelectorAll("[data-svc]").forEach(function(b){b.onclick=function(){var id=b.dataset.svc,i=f.services.indexOf(id);if(i>=0)f.services.splice(i,1);else f.services.push(id);f.time=null;refresh()}});
  app.querySelectorAll("[data-bar]").forEach(function(b){b.onclick=function(){f.barber=b.dataset.bar;f.time=null;refresh()}});
  app.querySelectorAll("[data-date]").forEach(function(b){b.onclick=function(){f.date=b.dataset.date;f.time=null;refresh()}});
  if(f.step===2){
    var box=document.getElementById("slots");
    if(!f.date)box.innerHTML='<p class="note">Escolha um dia para ver os horários livres.</p>';
    else{var sl=slotsFor(s,f.date,dur,f.barber);
      if(!sl||!sl.length)box.innerHTML='<p class="note">Sem horários neste dia. Tente outra data.</p>';
      else{box.innerHTML='<div class="slots">'+sl.map(function(x){return '<button class="slot" data-t="'+x.s+'" '+(x.free?"":"disabled")+' aria-pressed="'+(f.time===x.s)+'">'+fmt(x.s)+'</button>'}).join("")+'</div>';
        box.querySelectorAll("[data-t]").forEach(function(b){b.onclick=function(){f.time=+b.dataset.t;refresh()}})}}
  }
  if(f.step===3){
    var chk=function(){nx.disabled=!(f.name.trim().length>1&&digits(f.phone).length>=10)};
    document.getElementById("nm").oninput=function(e){f.name=e.target.value;chk()};
    document.getElementById("ph").oninput=function(e){f.phone=e.target.value;chk()};
  }
  var pv=document.getElementById("prev");if(pv)pv.onclick=function(){f.step--;refresh();window.scrollTo(0,0)};
  nx.onclick=function(){
    if(f.step<3){
      var go=function(){f.step++;refresh();window.scrollTo(0,0)};
      if(f.step===1){nx.disabled=true;DB.loadBusy().then(go)}else go();
      return;
    }
    var er=document.getElementById("err");
    function fail(m){er.hidden=false;er.textContent=m}
    var bid=f.barber;
    if(bid==="any"){var c=s.barbers.filter(function(b){return barberFree(s,b,f.date,f.time,dur)})[0];if(!c)return fail(BOOK_ERR.slot_taken);bid=c.id}
    else if(!barberFree(s,s.barbers.filter(function(b){return b.id===bid})[0],f.date,f.time,dur))return fail(BOOK_ERR.slot_taken);
    nx.disabled=true;er.hidden=true;
    DB.createBooking({barber:bid,date:f.date,start:f.time,dur:dur,total:total,svc:svc,name:f.name.trim(),phone:f.phone.trim()}).then(function(r){
      if(r.ok){f.done=r.rec;viewBook(slug);window.scrollTo(0,0);return}
      DB.loadBusy();
      nx.disabled=false;fail(BOOK_ERR[r.code]||BOOK_ERR.other);
    });
  };
}
function viewDone(s,viewing){
  var r=flow.done;
  app.innerHTML='<div class="scope" style="'+scopeStyle(s)+'">'+viewing+clientHeader(s)+
    '<main class="stack done"><div class="check">✓</div><h1>Horário marcado</h1><p class="lead">'+esc(r.name)+', seu horário na '+esc(s.name)+' está reservado.</p>'+
    '<div class="card info" style="width:100%;text-align:left"><div><b>Quando</b><span>'+fmtDate(r.date)+', '+fmt(r.start)+'</span></div><div><b>Profissional</b><span>'+esc(barberName(s,r.barber))+'</span></div>'+
    '<div><b>Serviços</b><span>'+r.services.map(function(x){return esc(x.name)}).join(", ")+'</span></div><div><b>Total</b><span>'+money(r.total)+'</span></div>'+
    (s.address?'<div><b>Local</b><span>'+esc(s.address)+'</span></div>':"")+'</div>'+
    (function(){var u=waLink(s.whatsapp,"Olá! Agendei pelo site: "+r.services.map(function(x){return x.name}).join(", ")+", "+fmtDate(r.date)+" às "+fmt(r.start)+" com "+barberName(s,r.barber)+". Nome: "+r.name+".");return u?'<a class="btn block-btn" target="_blank" rel="noopener" href="'+esc(u)+'">Avisar a barbearia pelo WhatsApp</a>':""})()+
    '<a class="btn ghost block-btn" href="#">Voltar ao início</a>'+
    '<p class="foot">Para remarcar ou cancelar, fale com a barbearia'+(s.whatsapp?' pelo WhatsApp '+esc(s.whatsapp):"")+'.</p></main></div>';
  flow=null;
}

/* ---------- ações de agendamento (delegadas) ---------- */
app.addEventListener("click",function(e){
  var t=e.target.closest("button");if(!t)return;
  var id;
  function done(ok,msg){if(!ok)toast("Não foi possível salvar. Verifique a conexão e tente de novo.");else if(msg)toast(msg);cancelId=null;route(true,true)}
  if((id=t.dataset.st)){DB.setStatus(t.dataset.id,id).then(function(ok){done(ok)});return}
  if((id=t.dataset.cancel)){cancelId=id;return route(true,true)}
  if(t.dataset.no){cancelId=null;return route(true,true)}
  if((id=t.dataset.yes)){DB.setStatus(id,"cancelado").then(function(ok){done(ok,"Horário cancelado")});return}
  if((id=t.dataset.rm)){DB.removeBooking(id).then(function(ok){done(ok,"Bloqueio removido")});return}
});

/* ---------- rotas ---------- */
var routeTok=0;
function viewMessage(title,text,retry){
  app.innerHTML='<main class="stack" style="padding-top:48px"><h1>'+esc(title)+'</h1><p class="lead">'+esc(text)+'</p>'+(retry?'<button class="btn block-btn" id="retry">Tentar de novo</button>':"")+'</main>';
  var b=document.getElementById("retry");if(b)b.onclick=function(){location.reload()};
}
async function route(keep,noload){
  var tok=++routeTok,y=window.scrollY,h=(location.hash||"").replace(/^#/,"");
  if(!SHOP){viewMessage("Site em configuração","Volte em alguns minutos.");return}
  var isOwner=["hoje","agenda","agenda-novo","clientes","ajustes","ajustes-link","ajustes-servicos","ajustes-equipe","ajustes-perfil","ajustes-horarios","ajustes-produtos","ajustes-cursos","ajustes-novidades"].indexOf(h)>=0||h.indexOf("clientes-")===0;
  var owner=!!myShop();
  if(h==="painel"){
    if(owner){location.hash="hoje";return}
    flow=null;viewOwnerLogin();
  }else if(isOwner){
    if(!owner){location.hash="painel";return}
    if(!noload){
      var ok=await DB.loadOwnerBookings();
      if(tok!==routeTok)return;
      if(!ok)toast("Não foi possível atualizar a agenda. Mostrando o último estado carregado.");
    }
    flow=null;
    if(h==="hoje")viewToday();
    else if(h==="agenda")viewAgenda();
    else if(h==="agenda-novo")viewNew();
    else if(h==="clientes")viewClients();
    else if(h.indexOf("clientes-")===0)viewClient(h.slice(9));
    else if(h==="ajustes")viewSettings();
    else if(h==="ajustes-link")viewLink();
    else if(h==="ajustes-servicos")viewServices();
    else if(h==="ajustes-equipe")viewTeam();
    else if(h==="ajustes-horarios")viewHours();
    else if(h==="ajustes-produtos")viewList("produtos");
    else if(h==="ajustes-cursos")viewList("cursos");
    else if(h==="ajustes-novidades")viewList("novidades");
    else viewProfile();
    if(h!=="agenda-novo")nf=null;
    if(h!=="agenda"&&h!=="hoje")cancelId=null;
  }else if(h==="agendar"||h.indexOf("agendar-")===0||h.indexOf("b-")===0){
    if(!noload){
      if(owner)await DB.loadOwnerBookings();else await DB.loadBusy();
      if(tok!==routeTok)return;
    }
    viewBook(h.indexOf("agendar-")===0?h.slice(8):null);
  }else{
    viewHome();
  }
  window.scrollTo(0,keep?y:0);
}
window.addEventListener("hashchange",function(){route(false)});
if(REMOTE)setInterval(function(){
  var h=(location.hash||"").replace(/^#/,"");
  if(document.hidden||!myShop()||cancelId||(h!=="hoje"&&h!=="agenda"))return;
  DB.loadOwnerBookings().then(function(ok){if(ok)route(true,true)});
},60000);
DB.init().then(function(){route(false)}).catch(function(){viewMessage("Não foi possível carregar","Verifique sua conexão com a internet e tente de novo.",true)});
})();
