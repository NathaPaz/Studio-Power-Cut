/* Studio Power Cut: telas do cliente (início, agendar, confirmação, meu horário). */
(function(){
"use strict";
var S=window.SPC,st=S.st,esc=S.esc,ic=S.ic,DB=S.DB;
var flow=null,done=null,busyAt=0;

function ensureBusy(force){
  if(!S.REMOTE)return Promise.resolve(true);
  if(!force&&Date.now()-busyAt<45000)return Promise.resolve(true);
  return DB.loadBusy().then(function(ok){if(ok)busyAt=Date.now();return ok});
}
function newFlow(pre){return {svc:[],barber:pre||"any",date:"",t:null,name:"",phone:"",remember:true,resched:""}}
function mine(){return S.load("spc4_mine",[])}
function addMine(rec){var m=mine().filter(function(x){return x.token!==rec.token});m.unshift({token:rec.token,date:rec.date,start:rec.start});S.save("spc4_mine",m.slice(0,8))}
function lastPick(){var l=S.load(S.K.last,null);if(!l||!Array.isArray(l.svc))return null;
  var ok=l.svc.filter(function(id){return st.shop.services.some(function(s){return s.id===id})});
  return ok.length?{svc:ok,barber:l.barber,name:l.name||"",phone:l.phone||""}:null}
function svcNames(ids){return ids.map(function(id){var s=st.shop.services.filter(function(x){return x.id===id})[0];return s?s.name:""}).filter(Boolean).join(" + ")}
function durText(m){return m<60?m+" min":Math.floor(m/60)+"h"+(m%60?(" "+("0"+(m%60)).slice(-2)):"")}
function whenWord(d){var t=S.today();return d===t?"hoje":d===S.addDays(t,1)?"amanhã":S.fmtDay(d).toLowerCase()}
function avatar(b,cls){return b.photo?'<img class="'+cls+'" src="'+esc(b.photo)+'" alt="" loading="lazy" decoding="async">':'<span class="'+cls+' noimg">'+esc((b.name||"?").charAt(0))+'</span>'}
function mapsUrl(s){return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([s.address,s.city].filter(Boolean).join(", "))}
function igUrl(h){return "https://instagram.com/"+String(h||"").replace(/^@/,"").trim()}

/* ---------- início ---------- */
function videoInfo(u){
    if(!S.isUrl(u))return null;
    var m=u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if(m)return {kind:"frame",src:"https://www.youtube-nocookie.com/embed/"+m[1]+"?autoplay=1&rel=0&playsinline=1",thumb:"https://i.ytimg.com/vi/"+m[1]+"/hqdefault.jpg"};
    m=u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if(m)return {kind:"frame",src:"https://player.vimeo.com/video/"+m[1]+"?autoplay=1",thumb:""};
    if(/\.(mp4|webm|mov)(\?\S*)?$/i.test(u))return {kind:"file",src:u,thumb:""};
    return null;
  }
  function viewHome(){
  var s=st.shop,courses=s.courses||[],feat=courses.filter(function(c){return S.isUrl(c.video)})[0]||courses[0];
  var news=(s.news||[]).slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,3);
  var products=(s.products||[]).filter(function(p){return p.on!==false});
  var last=lastPick(),mm=mine().filter(function(m){return m.date>=S.today()});
  function wa(text,label,cls){var u=S.waLink(s.whatsapp,text);return u?'<a class="btn '+(cls||"ghost")+'" target="_blank" rel="noopener" href="'+esc(u)+'">'+ic("chat",18)+'<span>'+label+'</span></a>':""}
  var h='<header class="hero">'+(s.cover?'<img class="hero-img" src="'+esc(s.cover)+'" alt="" fetchpriority="high">':"")+'<div class="hero-shade"></div>'+
    '<div class="hero-top">'+(s.logo?'<img class="mark" src="'+esc(s.logo)+'" alt="">':"")+'<span class="status"><i></i>'+esc(S.statusLabel())+'</span></div>'+
    '<div class="hero-copy"><h1>'+esc(s.name)+'</h1><span class="rule"></span><p>'+esc(s.tagline||"")+'</p>'+
    '<div class="quick" id="quick">'+(mm.length?'<a class="quick-i" href="#meu/'+esc(mm[0].token)+'"><span class="q-k">Seu horário</span><span class="q-v">'+esc(whenWord(mm[0].date)+", "+S.fmt(mm[0].start))+'</span>'+ic("right",18)+'</a>':"")+
    (last?'<button class="quick-i" id="repeat"><span class="q-k">Repetir</span><span class="q-v">'+esc(svcNames(last.svc))+'</span>'+ic("right",18)+'</button>':"")+
    '<span class="quick-i ghosted" id="nextfree" hidden></span></div></div></header>'+
    '<main class="home">';
  if(feat){
    var vid=videoInfo(feat.video),cover=feat.img||(vid&&vid.thumb)||"";
    var poster=vid?'<div class="poster" id="vp" data-kind="'+vid.kind+'" data-src="'+esc(vid.src)+'">'+(cover?'<img src="'+esc(cover)+'" alt="" loading="lazy" decoding="async">':"")+'<button class="play-btn" type="button" aria-label="Assistir ao vídeo de apresentação do curso '+esc(feat.name)+'"><span class="play">'+ic("play",26)+'</span><span class="cap">Assistir à apresentação</span></button></div>':
      S.isUrl(feat.video)?'<a class="poster" target="_blank" rel="noopener" href="'+esc(feat.video)+'" aria-label="Assistir ao vídeo de apresentação do curso '+esc(feat.name)+'">'+(feat.img?'<img src="'+esc(feat.img)+'" alt="" loading="lazy" decoding="async">':"")+'<span class="play">'+ic("play",26)+'</span><span class="cap">Assistir à apresentação</span></a>':
      feat.img?'<div class="poster off"><img src="'+esc(feat.img)+'" alt="" loading="lazy" decoding="async"><span class="cap">Vídeo de apresentação em breve</span></div>':"";
    h+='<section class="blk" id="curso"><h2>Curso</h2>'+poster+'<h3 class="course-n">'+esc(feat.name)+'</h3>'+(feat.info?'<p class="muted">'+esc(feat.info)+'</p>':"")+(feat.desc?'<p>'+esc(feat.desc)+'</p>':"")+(feat.price?'<p class="price-big">'+S.money(feat.price)+'</p>':"")+
      wa("Olá! Quero saber mais sobre o "+feat.name+".","Quero saber mais","")+'</section>';
  }
  if(news.length){
    h+='<section class="blk"><h2>Novidades</h2>'+news.map(function(n){
      var u=S.waLink(s.whatsapp,"Olá! Vi a novidade \""+n.title+"\" no site e quero saber mais.");
      return '<article class="news">'+(n.img?'<img src="'+esc(n.img)+'" alt="" loading="lazy" decoding="async">':"")+'<div><h3>'+esc(n.title)+'</h3><p>'+esc(n.text)+'</p>'+(u?'<a class="lnk" target="_blank" rel="noopener" href="'+esc(u)+'">Saber mais no WhatsApp '+ic("arrow",16)+'</a>':"")+'</div></article>'}).join("")+'</section>';
  }
  h+='<section class="blk" id="servicos"><h2>Serviços</h2><ul class="menu">'+s.services.map(function(v){
    return '<li><span class="m-n">'+esc(v.name)+'</span><span class="m-d">'+durText(+v.min)+'</span><span class="m-p">'+S.money(v.price)+'</span></li>'}).join("")+'</ul>'+(s.priceNote?'<p class="foot">'+esc(s.priceNote)+'</p>':"")+'</section>';
  if(s.barbers.length){
    h+='<section class="blk"><h2>Equipe</h2><div class="crew">'+s.barbers.map(function(b){
      return '<a class="crew-i" href="#agendar-'+esc(b.id)+'">'+avatar(b,"crew-img")+'<span class="crew-n">'+esc(b.name)+'</span>'+(b.nick?'<span class="crew-k">'+esc(b.nick)+'</span>':"")+'<span class="crew-go">Agendar '+ic("arrow",15)+'</span></a>'}).join("")+'</div></section>';
  }
  if(products.length){
    h+='<section class="blk"><h2>Produtos</h2><div class="rail">'+products.map(function(p){
      var u=S.waLink(s.whatsapp,"Olá! Quero pedir: "+p.name+" ("+S.money(p.price)+").");
      return '<a class="prod" '+(u?'target="_blank" rel="noopener" href="'+esc(u)+'"':'')+'><span class="prod-img">'+(p.img?'<img src="'+esc(p.img)+'" alt="" loading="lazy" decoding="async">':"")+'</span><span class="prod-n">'+esc(p.name)+'</span><span class="prod-p">'+S.money(p.price)+'</span></a>'}).join("")+'</div><p class="foot">Peça pelo WhatsApp e retire na barbearia.</p></section>';
  }
  h+='<section class="blk" id="onde"><h2>Onde estamos</h2>'+(s.address?'<a class="line" target="_blank" rel="noopener" href="'+esc(mapsUrl(s))+'">'+ic("pin",20)+'<span>'+esc(s.address)+(s.city?', '+esc(s.city):"")+'</span></a>':"")+
    '<dl class="hours">'+S.hoursSummary().map(function(r){return '<div><dt>'+esc(r.label)+'</dt><dd>'+esc(r.txt)+'</dd></div>'}).join("")+'</dl>'+
    '<div class="btnrow">'+wa("Olá! Vim pelo site.","WhatsApp","")+(s.instagram?'<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(igUrl(s.instagram))+'">'+ic("star",18)+'<span>'+esc(s.instagram)+'</span></a>':"")+'</div></section>'+
    '<footer class="foot-nav"><a href="#painel">Área do dono</a></footer></main>'+
    '<div class="cta-dock"><a class="btn big" href="#agendar">Agendar horário</a></div>';
  S.render(h,{view:"home"});
  var vp=document.getElementById("vp");
  if(vp)vp.querySelector(".play-btn").onclick=function(){
    var src=vp.dataset.src,el;
    if(vp.dataset.kind==="file"){el=document.createElement("video");el.src=src;el.controls=true;el.autoplay=true;el.playsInline=true;el.setAttribute("playsinline","");}
    else{el=document.createElement("iframe");el.src=src;el.title="Vídeo de apresentação do curso";el.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";el.allowFullscreen=true;el.referrerPolicy="strict-origin-when-cross-origin";}
    vp.innerHTML="";vp.classList.add("playing");vp.appendChild(el);
  };
  var rep=document.getElementById("repeat");
  if(rep)rep.onclick=function(){flow=newFlow();flow.svc=last.svc.slice();flow.barber=last.barber||"any";flow.name=last.name;flow.phone=last.phone;S.go("agendar/3")};
  /* próximo horário livre para o corte padrão */
  ensureBusy().then(function(){
    if(S.parse().name!=="inicio")return;
    var cut=s.services.filter(function(v){return /^corte$/i.test(v.name)})[0]||s.services[0];if(!cut)return;
    var nf=S.nextFree(+cut.min,"any",21),el=document.getElementById("nextfree");if(!el)return;
    if(!nf){el.hidden=true;return}
    var b=S.barberOf(nf.barber);
    el.outerHTML='<button class="quick-i" id="nextfree"><span class="q-k">Próximo horário</span><span class="q-v">'+esc(whenWord(nf.date)+", "+S.fmt(nf.t)+(b?" com "+b.name.split(" ")[0]:""))+'</span>'+ic("right",18)+'</button>';
    document.getElementById("nextfree").onclick=function(){flow=newFlow();flow.svc=[cut.id];flow.barber=nf.barber;flow.date=nf.date;flow.t=nf.t;var l=lastPick();if(l){flow.name=l.name;flow.phone=l.phone}S.go("agendar/4")};
  });
}

/* ---------- agendar ---------- */
var TITLES=["O que vamos fazer?","Com quem?","Quando?","Seus dados"];
function shell(step,inner,bar){
  return '<div class="flow"><header class="flow-top"><button class="back" id="back" aria-label="Voltar">'+ic("left",22)+'</button><div class="prog" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="'+step+'" aria-label="Passo '+step+' de 4"><i style="width:'+(step*25)+'%"></i></div><span class="step-n">'+step+'/4</span></header>'+
    '<main class="flow-main"><h1>'+TITLES[step-1]+'</h1>'+inner+'</main><div class="flow-bar">'+bar+'</div></div>';
}
function bindBack(step){
  document.getElementById("back").onclick=function(){
    if(step>1)S.go("agendar/"+(step-1));else S.go("");
  };
}
function totals(){return S.svcDur(flow.svc)}
function barText(){var t=totals();return flow.svc.length?'<span class="bar-s"><b>'+S.money(t.total)+'</b><i>'+flow.svc.length+(flow.svc.length>1?" serviços":" serviço")+" · "+durText(t.dur)+'</i></span>':'<span class="bar-s"><i>Escolha ao menos um serviço</i></span>'}

function step1(){
  var s=st.shop;
  var h='<ul class="pick-list" id="svc">'+s.services.map(function(v){
    var on=flow.svc.indexOf(v.id)>=0;
    return '<li><button class="pick" data-id="'+esc(v.id)+'" aria-pressed="'+on+'"><span class="pick-box">'+ic("check",16)+'</span><span class="pick-t"><b>'+esc(v.name)+'</b><i>'+durText(+v.min)+'</i></span><span class="pick-p">'+S.money(v.price)+'</span></button></li>'}).join("")+'</ul>'+(s.priceNote?'<p class="foot">'+esc(s.priceNote)+'</p>':"");
  S.render(shell(1,h,'<div id="bar1">'+barText()+'</div><button class="btn" id="nx">Continuar</button>'),{view:"flow",title:"Agendar"});
  bindBack(1);
  var nx=document.getElementById("nx");nx.disabled=!flow.svc.length;
  document.getElementById("svc").onclick=function(e){
    var b=e.target.closest(".pick");if(!b)return;
    var id=b.dataset.id,i=flow.svc.indexOf(id);if(i>=0)flow.svc.splice(i,1);else flow.svc.push(id);
    b.setAttribute("aria-pressed",String(i<0));document.getElementById("bar1").innerHTML=barText();nx.disabled=!flow.svc.length;
    flow.date="";flow.t=null;
  };
  nx.onclick=function(){S.go("agendar/2")};
}
function step2(){
  var s=st.shop,dur=totals().dur;
  S.render(shell(2,'<p class="lead">Carregando agenda…</p>','<span class="bar-s"></span>'),{view:"flow",title:"Agendar"});bindBack(2);
  ensureBusy().then(function(){
    if(S.parse().args[0]!=="2")return;
    function card(id,name,nick,photo){
      var nf=S.nextFree(dur,id,21);
      var info=nf?"Próximo: "+whenWord(nf.date)+", "+S.fmt(nf.t):"Sem horários nos próximos dias";
      var b=id==="any"?null:S.barberOf(id);
      return '<li><button class="who" data-id="'+esc(id)+'" aria-pressed="'+(flow.barber===id)+'">'+(b?avatar(b,"who-img"):'<span class="who-img any">'+ic("users",26)+'</span>')+'<span class="pick-t"><b>'+esc(name)+'</b><i>'+esc(nick)+'</i></span><span class="who-n">'+esc(info)+'</span></button></li>'}
    var h='<ul class="pick-list" id="who">'+card("any","Sem preferência","O primeiro horário livre")+s.barbers.map(function(b){return card(b.id,b.name,b.nick||"")}).join("")+'</ul>';
    S.render(shell(2,h,barText()+'<button class="btn" id="nx">Continuar</button>'),{view:"flow",title:"Agendar"});bindBack(2);
    document.getElementById("who").onclick=function(e){
      var b=e.target.closest(".who");if(!b)return;
      flow.barber=b.dataset.id;flow.date="";flow.t=null;S.go("agendar/3");
    };
    document.getElementById("nx").onclick=function(){S.go("agendar/3")};
  });
}
function step3(){
  var s=st.shop,dur=totals().dur;
  S.render(shell(3,'<p class="lead">Carregando agenda…</p>','<span class="bar-s"></span>'),{view:"flow",title:"Agendar"});bindBack(3);
  ensureBusy().then(function(){
    if(S.parse().args[0]!=="3")return;
    var today=S.today(),days=[];for(var i=0;i<28;i++)days.push(S.addDays(today,i));
    var info=days.map(function(d){return {d:d,open:S.dayOpen(d,flow.barber),n:S.slots(d,dur,flow.barber).length}});
    if(!flow.date||!info.some(function(x){return x.d===flow.date&&x.n}))flow.t=null;
    if(!flow.date||!info.some(function(x){return x.d===flow.date&&x.n})){
      var first=info.filter(function(x){return x.n})[0];flow.date=first?first.d:today;
    }
    var who=flow.barber==="any"?"qualquer profissional":S.barberName(flow.barber);
    var h='<p class="lead">Com '+esc(who)+' · '+durText(dur)+'</p><div class="days" id="days" role="listbox" aria-label="Dia">'+info.map(function(x){
      var on=x.d===flow.date;
      return '<button class="day'+(on?" on":"")+(x.n?"":" off")+'" data-d="'+x.d+'" role="option" aria-selected="'+on+'" '+(x.n?"":"disabled")+' aria-label="'+esc(S.fmtDayLong(x.d)+(x.n?"":x.open?", sem horários":", fechado"))+'"><span class="d-w">'+S.DOW[S.dow(x.d)]+'</span><span class="d-n">'+S.dnum(x.d)+'</span><span class="d-m">'+(S.dnum(x.d)===1||x.d===today?S.mon(x.d):"")+'</span></button>'}).join("")+'</div><div id="slots" aria-live="polite"></div>';
    S.render(shell(3,h,'<div id="bar3"></div><button class="btn" id="nx">Continuar</button>'),{view:"flow",title:"Agendar"});bindBack(3);
    var nx=document.getElementById("nx"),daysEl=document.getElementById("days");
    function bar(){document.getElementById("bar3").innerHTML=flow.t!=null?'<span class="bar-s"><b>'+esc(S.fmtDay(flow.date))+' · '+S.fmt(flow.t)+'</b><i>'+durText(dur)+'</i></span>':'<span class="bar-s"><i>Escolha um horário</i></span>';nx.disabled=flow.t==null}
    function paint(){
      var sl=S.slots(flow.date,dur,flow.barber),el=document.getElementById("slots");
      if(!sl.length){el.innerHTML='<p class="empty">Sem horários neste dia. Escolha outro dia.</p>';bar();return}
      var groups=[["Manhã",0,720],["Tarde",720,1080],["Noite",1080,1440]];
      el.innerHTML=groups.map(function(g){
        var part=sl.filter(function(x){return x.t>=g[1]&&x.t<g[2]});if(!part.length)return "";
        return '<div class="slot-g"><h3>'+g[0]+'</h3><div class="slots">'+part.map(function(x){return '<button class="slot" data-t="'+x.t+'" aria-pressed="'+(flow.t===x.t)+'">'+S.fmt(x.t)+'</button>'}).join("")+'</div></div>'}).join("");
      bar();
    }
    paint();
    var on=daysEl.querySelector(".on");if(on)daysEl.scrollLeft=on.offsetLeft-(daysEl.clientWidth-on.offsetWidth)/2;
    daysEl.onclick=function(e){
      var b=e.target.closest(".day");if(!b||b.disabled)return;
      flow.date=b.dataset.d;flow.t=null;
      daysEl.querySelectorAll(".day").forEach(function(x){var o=x===b;x.classList.toggle("on",o);x.setAttribute("aria-selected",String(o))});paint();
    };
    document.getElementById("slots").onclick=function(e){
      var b=e.target.closest(".slot");if(!b)return;flow.t=+b.dataset.t;
      document.querySelectorAll(".slot").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});bar();
    };
    nx.onclick=function(){S.go("agendar/4")};
  });
}
function step4(){
  var t=totals(),svc=flow.svc.map(function(id){return st.shop.services.filter(function(x){return x.id===id})[0]}).filter(Boolean);
  var who=flow.barber==="any"?"Primeiro profissional livre":S.barberName(flow.barber);
  var h='<dl class="receipt"><div><dt>Quando</dt><dd>'+esc(S.fmtDayLong(flow.date))+' às '+S.fmt(flow.t)+'</dd></div><div><dt>Com</dt><dd>'+esc(who)+'</dd></div>'+
    '<div><dt>Serviços</dt><dd>'+svc.map(function(v){return esc(v.name)}).join("<br>")+'</dd></div><div class="tot"><dt>Total</dt><dd>'+S.money(t.total)+'</dd></div></dl>'+
    '<div class="field"><label for="nm">Seu nome</label><input id="nm" class="input" autocomplete="name" value="'+esc(flow.name)+'" maxlength="80"></div>'+
    '<div class="field"><label for="ph">WhatsApp</label><input id="ph" class="input" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(51) 99999-9999" value="'+esc(S.maskPhone(flow.phone))+'"></div>'+
    '<label class="chk"><input type="checkbox" id="rem" '+(flow.remember?"checked":"")+'><span>Lembrar meus dados neste aparelho</span></label>'+
    '<p id="err" class="err" role="alert" hidden></p><p class="foot">Usamos seu nome e WhatsApp só para este agendamento. Você paga na barbearia.</p>';
  S.render(shell(4,h,barText()+'<button class="btn" id="nx">Confirmar horário</button>'),{view:"flow",title:"Agendar"});bindBack(4);
  var nm=document.getElementById("nm"),ph=document.getElementById("ph"),err=document.getElementById("err"),nx=document.getElementById("nx");
  ph.oninput=function(){ph.value=S.maskPhone(ph.value)};
  function fail(m){err.hidden=false;err.textContent=m}
  nx.onclick=async function(){
    err.hidden=true;
    var name=nm.value.trim().replace(/\s+/g," "),phone=ph.value.trim();
    if(name.length<2){fail("Informe seu nome.");nm.focus();return}
    var d=S.digits(phone);if(d.length<10||d.length>11){fail("Informe o WhatsApp com DDD, por exemplo (51) 99999-9999.");ph.focus();return}
    flow.name=name;flow.phone=phone;flow.remember=document.getElementById("rem").checked;
    nx.disabled=true;nx.textContent="Confirmando…";
    var r=await DB.createBooking({barber:flow.barber,date:flow.date,start:flow.t,dur:t.dur,total:t.total,svc:svc,name:name,phone:phone});
    if(!r.ok){
      nx.disabled=false;nx.textContent="Confirmar horário";
      if(r.code==="slot_taken"||r.code==="bad_hours"||r.code==="bad_time"){await ensureBusy(true);flow.t=null;fail(S.ERR[r.code]);setTimeout(function(){S.go("agendar/3")},1400)}
      else fail((S.ERR[r.code]||S.ERR.other));
      return;
    }
    if(flow.remember)S.save(S.K.last,{svc:flow.svc,barber:flow.barber,name:name,phone:phone});else S.save(S.K.last,null);
    if(flow.resched){await DB.cancelMyBooking(flow.resched);removeMine(flow.resched)}
    addMine(r.rec);busyAt=0;done=r.rec;flow=null;S.go("confirmado");
  };
}
function removeMine(tok){S.save("spc4_mine",mine().filter(function(m){return m.token!==tok}))}

/* ---------- confirmação ---------- */
function icsFor(r){
  function z(n){return ("0"+n).slice(-2)}
  function stamp(date,min){return date.replace(/-/g,"")+"T"+z(Math.floor(min/60))+z(min%60)+"00"}
  var s=st.shop;
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Studio Power Cut//PT","BEGIN:VEVENT","UID:"+r.id+"@studiopowercut","DTSTAMP:"+stamp(S.today(),S.nowMin()),
    "DTSTART;TZID=America/Sao_Paulo:"+stamp(r.date,r.start),"DTEND;TZID=America/Sao_Paulo:"+stamp(r.date,r.start+r.dur),
    "SUMMARY:"+s.name+" - "+r.services.map(function(x){return x.name}).join(" + "),"LOCATION:"+[s.address,s.city].filter(Boolean).join(", "),
    "BEGIN:VALARM","TRIGGER:-PT1H","ACTION:DISPLAY","DESCRIPTION:Seu horário é em 1 hora","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");
}
function viewDone(){
  if(!done){S.go("");return}
  var s=st.shop,r=done,b=S.barberOf(r.barber),first=r.name.split(" ")[0];
  var link=location.href.split("#")[0]+"#meu/"+r.token;
  var msg="Olá! Agendei pelo site: "+r.services.map(function(x){return x.name}).join(", ")+", "+S.fmtDayLong(r.date)+" às "+S.fmt(r.start)+(b?" com "+b.name:"")+". Nome: "+r.name+".";
  var wa=S.waLink(s.whatsapp,msg);
  S.render('<main class="done"><svg class="seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/><path d="m19 33 9 9 17-19"/></svg><h1>Horário marcado, '+esc(first)+'.</h1>'+
    '<p class="big-when">'+esc(S.fmtDayLong(r.date))+'<br><b>'+S.fmt(r.start)+'</b>'+(b?' com '+esc(b.name):"")+'</p>'+
    '<p class="muted">'+r.services.map(function(x){return esc(x.name)}).join(" + ")+' · '+S.money(r.total)+(s.address?'<br>'+esc(s.address):"")+'</p>'+
    '<div class="stackb">'+(wa?'<a class="btn" target="_blank" rel="noopener" href="'+esc(wa)+'">'+ic("chat",18)+'<span>Avisar a barbearia no WhatsApp</span></a>':"")+
    '<button class="btn ghost" id="ics">'+ic("cal",18)+'<span>Adicionar ao calendário</span></button>'+
    '<button class="btn ghost" id="cp">'+ic("link",18)+'<span>Copiar link para cancelar ou remarcar</span></button>'+
    '<a class="btn quiet" href="#">Voltar ao início</a></div>'+
    '<p class="foot">Guarde o link acima: com ele você cancela ou remarca até '+s.cancelHours+' horas antes, sem precisar de senha.</p></main>',{view:"done",title:"Horário marcado"});
  document.getElementById("ics").onclick=function(){
    var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([icsFor(r)],{type:"text/calendar"}));a.download="horario-power-cut.ics";document.body.appendChild(a);a.click();a.remove();
  };
  document.getElementById("cp").onclick=function(){
    (navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject()).then(function(){S.toast("Link copiado")},function(){S.toast("Não foi possível copiar. Segure o link para copiar.")});
  };
}

/* ---------- meu horário ---------- */
async function viewMine(token){
  S.render('<main class="msg"><p class="lead">Buscando seu horário…</p></main>',{view:"flow"});
  var b=await DB.getMyBooking(token);
  if(!b){S.message("Não encontramos esse horário","O link pode estar incompleto. Se precisar, chame a barbearia no WhatsApp.");return}
  var s=st.shop,bar=S.barberOf(b.barber),wa=S.waLink(s.whatsapp,"Olá! Preciso falar sobre meu horário de "+S.fmtDayLong(b.day)+" às "+S.fmt(b.start)+".");
  var cancelled=b.status==="cancelado",over=b.status==="concluido"||b.status==="faltou";
  var h='<main class="done mine"><h1>'+(cancelled?"Horário cancelado":over?"Atendimento encerrado":"Seu horário")+'</h1>'+
    '<p class="big-when">'+esc(S.fmtDayLong(b.day))+'<br><b>'+S.fmt(b.start)+'</b>'+(bar?' com '+esc(bar.name):"")+'</p>'+
    '<p class="muted">'+(b.services||[]).map(function(x){return esc(x.name)}).join(" + ")+' · '+S.money(b.total)+'</p><div class="stackb">';
  if(b.can_cancel)h+='<button class="btn" id="resch">'+ic("swap",18)+'<span>Remarcar</span></button><button class="btn danger ghost" id="canc">'+ic("ban",18)+'<span>Cancelar horário</span></button>';
  else if(!cancelled&&!over)h+='<p class="note">Faltam menos de '+b.cancel_hours+' horas para o horário. Para alterar, fale com a barbearia.</p>'+(wa?'<a class="btn" target="_blank" rel="noopener" href="'+esc(wa)+'">'+ic("chat",18)+'<span>Falar no WhatsApp</span></a>':"");
  if(cancelled||over)h+='<a class="btn" href="#agendar">Agendar de novo</a>';
  h+='<a class="btn quiet" href="#">Voltar ao início</a></div></main>';
  S.render(h,{view:"done",title:"Meu horário"});
  var rs=document.getElementById("resch"),cn=document.getElementById("canc");
  if(rs)rs.onclick=function(){
    flow=newFlow(b.barber);flow.resched=token;
    flow.svc=(b.services||[]).map(function(x){var m=s.services.filter(function(v){return v.id===x.id||v.name===x.name})[0];return m&&m.id}).filter(Boolean);
    var l=lastPick();if(l){flow.name=l.name;flow.phone=l.phone}
    if(!flow.svc.length){S.go("agendar/1");return}
    S.go("agendar/3");
  };
  if(cn)cn.onclick=function(){
    S.confirm("Cancelar este horário?","Você libera o horário para outra pessoa. Para voltar, é só marcar de novo.","Cancelar horário",true).then(function(yes){
      if(!yes)return;
      DB.cancelMyBooking(token).then(function(r){
        if(r.ok){removeMine(token);busyAt=0;S.toast("Horário cancelado");viewMine(token)}
        else S.toast((S.ERR[r.code]||S.ERR.other).replace("{h}",b.cancel_hours));
      });
    });
  };
}

S.routes.client=async function(r,keep,my){
  if(r.name==="agendar"){
    var step=+r.args[0]||1;
    if(r.pre!==undefined)flow=newFlow(S.barberOf(r.pre)?r.pre:"any");
    else if(!flow)flow=newFlow();
    var l=lastPick();if(l&&!flow.name){flow.name=l.name;flow.phone=l.phone}
    if(step>1&&!flow.svc.length){S.go("agendar/1");return}
    if(step>3&&(!flow.date||flow.t==null)){S.go("agendar/3");return}
    if(step===1)step1();else if(step===2)step2();else if(step===3)step3();else step4();
    return;
  }
  if(r.name==="confirmado"){viewDone();return}
  if(r.name==="meu"&&r.args[0]){await viewMine(r.args[0]);return}
  viewHome();
};
S.boot();
})();
