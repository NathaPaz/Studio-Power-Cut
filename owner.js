/* Studio Power Cut: painel do dono (Hoje, Agenda, Caixa e janelas de ação). */
(function(){
"use strict";
var S=window.SPC,st=S.st,esc=S.esc,ic=S.ic,DB=S.DB,money=S.money;
var cur={barber:S.load("spc4_ob","all"),cx:{per:"mes",ref:null}};
var PAY=[["pix","Pix","pix"],["dinheiro","Dinheiro","bill"],["debito","Débito","card"],["credito","Crédito","card"]];
var PAYN={pix:"Pix",dinheiro:"Dinheiro",debito:"Débito",credito:"Crédito"};
var STL={confirmado:"Confirmado",concluido:"Concluído",faltou:"Faltou",cancelado:"Cancelado",bloqueio:"Bloqueado"};
var CATS=["Aluguel","Produtos","Energia e água","Marketing","Equipamentos","Impostos","Outros"];
var loaded=false;

function durText(m){return m<60?m+" min":Math.floor(m/60)+"h"+(m%60?(" "+("0"+(m%60)).slice(-2)):"")}
function barbersList(){return st.shop.barbers}
function sel(){return cur.barber==="all"||!S.barberOf(cur.barber)?"all":cur.barber}
function amount(b){return b.paidTotal!=null?b.paidTotal:b.total}
function commOf(b){var p=b.commPct!=null?b.commPct:(st.comm[b.barber]||0);return amount(b)*p/100}
function svcText(b){return (b.services||[]).map(function(x){return x.name}).join(" + ")}
function first(n){return String(n||"").split(" ")[0]}
function fresh(){S.route(true)}

/* ---------- estrutura ---------- */
function tabs(active){
  var T=[["hoje","Hoje","today"],["agenda","Agenda","cal"],["caixa","Caixa","cash"],["ajustes","Ajustes","tune"]];
  return '<nav class="o-tabs" aria-label="Painel">'+T.map(function(t){return '<a href="#'+t[0]+'"'+(active===t[0]?' aria-current="page"':"")+'>'+ic(t[2],22)+'<span>'+t[1]+'</span></a>'}).join("")+'</nav>';
}
function chips(){
  if(barbersList().length<2)return "";
  var cs=[["all","Todos"]].concat(barbersList().map(function(b){return [b.id,first(b.name)]}));
  return '<div class="chips" id="chips" role="group" aria-label="Profissional">'+cs.map(function(c){return '<button class="chip" data-b="'+esc(c[0])+'" aria-pressed="'+(sel()===c[0])+'">'+esc(c[1])+'</button>'}).join("")+'</div>';
}
function bindChips(){
  var el=document.getElementById("chips");if(!el)return;
  el.onclick=function(e){var b=e.target.closest(".chip");if(!b)return;cur.barber=b.dataset.b;S.save("spc4_ob",cur.barber);fresh()};
}
function shell(active,title,sub,inner,opts){
  opts=opts||{};
  S.render('<div class="o-wrap"><header class="o-head"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':"")+'</div><a class="o-site" href="#">Ver site</a></header>'+
    '<main class="o-main">'+inner+'</main>'+(opts.fab===false?"":'<button class="fab" id="fab" aria-label="Novo">'+ic("plus",26)+'</button>')+tabs(active)+'</div>',{view:"owner",title:title});
  var f=document.getElementById("fab");if(f)f.onclick=function(){openMenu(opts.date||S.today())};
  bindChips();
}

/* ---------- linha do tempo do dia ---------- */
function dayList(date){
  var b=sel(),list=S.dayBookings(date).filter(function(x){return (b==="all"||x.barber===b)&&x.status!=="cancelado"}).sort(function(a,c){return a.start-c.start||a.barber.localeCompare(c.barber)});
  return list;
}
function gaps(date,barber){
  var iv=S.hoursFor(barber,date),out=[],now=date===S.today()?S.nowMin():-1;
  var bs=S.dayBookings(date,barber).filter(function(x){return S.ACTIVE.indexOf(x.status)>=0}).sort(function(a,c){return a.start-c.start});
  iv.forEach(function(x){
    var s0=S.toMin(x[0]),e0=S.toMin(x[1]),p=Math.max(s0,now>=0?Math.ceil(now/5)*5:s0);
    bs.forEach(function(k){
      if(k.start+k.dur<=p||k.start>=e0)return;
      if(k.start>p&&k.start-p>=20)out.push([p,k.start]);
      p=Math.max(p,k.start+k.dur);
    });
    if(e0-p>=20)out.push([p,e0]);
  });
  return out;
}
function rowHtml(b,all){
  var now=b.date===S.today()?S.nowMin():-1,cls="tl-i st-"+b.status;
  if(b.status==="confirmado"&&now>=0&&now>=b.start&&now<b.start+b.dur)cls+=" now";
  var name=b.status==="bloqueio"?"Bloqueado":esc(b.name||"Sem nome");
  var sub=b.status==="bloqueio"?esc(b.note||"Horário indisponível"):esc(svcText(b));
  return '<button class="'+cls+'" data-id="'+esc(b.id)+'"><span class="tl-t"><b>'+S.fmt(b.start)+'</b><i>'+S.fmt(b.start+b.dur)+'</i></span><span class="tl-b"><b>'+name+(b.over?' <u>encaixe</u>':"")+'</b><i>'+sub+(all&&b.status!=="bloqueio"?' · '+esc(first(S.barberName(b.barber))):all?' · '+esc(first(S.barberName(b.barber))):"")+'</i></span>'+
    '<span class="tl-r">'+(b.status==="bloqueio"?"":'<em>'+money(b.status==="concluido"?amount(b):b.total)+'</em>')+'<span class="chip-s">'+(b.status==="confirmado"&&now>=0&&now>=b.start&&now<b.start+b.dur?"Agora":STL[b.status])+'</span></span></button>';
}
function timeline(date){
  var b=sel(),list=dayList(date),h="";
  var offs=[];(b==="all"?barbersList().map(function(x){return x.id}):[b]).forEach(function(id){var o=S.offReason(id,date);if(o)offs.push({id:id,o:o})});
  offs.forEach(function(x){
    var label={folga:"Folga",ferias:"Férias",feriado:"Feriado"}[x.o.kind]||"Fechado";
    h+='<div class="banner off">'+ic("moon",18)+'<span><b>'+label+(x.o.barber?' · '+esc(S.barberName(x.id)):' · loja fechada')+'</b>'+(x.o.reason?'<i>'+esc(x.o.reason)+'</i>':"")+'</span></div>';
  });
  if(b!=="all"&&!offs.length&&!S.hoursFor(b,date).length)h+='<div class="banner">'+ic("moon",18)+'<span><b>Sem expediente neste dia</b></span></div>';
  var items=list.map(function(x){return {t:x.start,html:rowHtml(x,b==="all")}});
  if(b!=="all")gaps(date,b).forEach(function(g){items.push({t:g[0]-0.5,html:'<button class="tl-free" data-t="'+g[0]+'" data-e="'+g[1]+'" data-b="'+esc(b)+'"><span class="tl-t"><b>'+S.fmt(g[0])+'</b><i>'+S.fmt(g[1])+'</i></span><span class="tl-b"><i>Livre · '+durText(g[1]-g[0])+'</i></span><span class="tl-r">'+ic("plus",18)+'</span></button>'})});
  items.sort(function(a,c){return a.t-c.t});
  if(!items.length&&!offs.length&&b==="all"&&!barbersList().some(function(x){return S.hoursFor(x.id,date).length}))h+='<div class="banner">'+ic("moon",18)+'<span><b>Loja fechada neste dia</b></span></div>';
  if(!items.length&&!h)h='<p class="empty">Nenhum horário marcado.</p>';
  return h+'<div class="tl" id="tl">'+items.map(function(i){return i.html}).join("")+'</div>';
}
function bindTimeline(date){
  var el=document.getElementById("tl");if(!el)return;
  el.onclick=function(e){
    var r=e.target.closest(".tl-i"),g=e.target.closest(".tl-free");
    if(r){var b=st.bk.filter(function(x){return x.id===r.dataset.id})[0];if(b)openBooking(b)}
    else if(g)openNew({date:date,start:+g.dataset.t,barber:g.dataset.b,gapEnd:+g.dataset.e});
  };
  var now=el.querySelector(".now")||el.querySelector(".st-confirmado");
  if(now&&date===S.today()&&now.getBoundingClientRect().top>window.innerHeight*0.7)setTimeout(function(){now.scrollIntoView({block:"center",behavior:"smooth"})},150);
}
function daySum(date){
  var l=dayList(date).filter(function(x){return x.status==="confirmado"||x.status==="concluido"});
  var done=l.filter(function(x){return x.status==="concluido"}),pend=l.filter(function(x){return x.status==="confirmado"});
  return {done:done.reduce(function(a,x){return a+amount(x)},0),pend:pend.reduce(function(a,x){return a+x.total},0),nd:done.length,np:pend.length};
}

/* ---------- Hoje ---------- */
function viewToday(){
  var t=S.today(),sm=daySum(t);
  var h=chips()+'<button class="sum" id="sum"><span class="sum-a"><i>Recebido hoje</i><b>'+money(sm.done)+'</b></span><span class="sum-b"><i>A receber</i><b>'+money(sm.pend)+'</b></span><span class="sum-c">'+sm.nd+' feitos · '+sm.np+' na fila</span>'+ic("right",18)+'</button>'+timeline(t);
  shell("hoje",S.DOWF[S.dow(t)].replace(/^./,function(c){return c.toUpperCase()}),S.dnum(t)+" de "+S.monf(t),h,{date:t});
  bindTimeline(t);
  document.getElementById("sum").onclick=function(){openClose(t)};
}

/* ---------- Agenda (semana) ---------- */
function monday(k){var d=S.dow(k);return S.addDays(k,d===0?-6:1-d)}
function occupancy(date){
  var b=sel(),ids=b==="all"?barbersList().map(function(x){return x.id}):[b],open=0,used=0;
  ids.forEach(function(id){
    S.hoursFor(id,date).forEach(function(x){open+=S.toMin(x[1])-S.toMin(x[0])});
    S.dayBookings(date,id).forEach(function(k){if(S.ACTIVE.indexOf(k.status)>=0)used+=k.dur});
  });
  return open?Math.min(1,used/open):-1;
}
function viewAgenda(r){
  var t=S.today(),date=/^\d{4}-\d{2}-\d{2}$/.test(r.args[0]||"")?r.args[0]:t,mon=monday(date);
  var days=[];for(var i=0;i<7;i++)days.push(S.addDays(mon,i));
  var h=chips()+'<div class="wk-nav"><button class="icon-btn" id="wp" aria-label="Semana anterior">'+ic("left",20)+'</button><b>'+S.dnum(days[0])+' '+S.mon(days[0])+' a '+S.dnum(days[6])+' '+S.mon(days[6])+'</b><button class="icon-btn" id="wn" aria-label="Próxima semana">'+ic("right",20)+'</button></div>'+
    '<div class="week" id="week">'+days.map(function(d){
      var oc=occupancy(d),off=oc<0;
      return '<button class="wd'+(d===date?" on":"")+(d===t?" today":"")+(off?" off":"")+'" data-d="'+d+'" aria-label="'+esc(S.fmtDayLong(d))+'"><span class="w-w">'+S.DOW[S.dow(d)]+'</span><span class="w-n">'+S.dnum(d)+'</span><span class="w-o"><i style="height:'+(off?0:Math.max(8,Math.round(oc*100)))+'%"></i></span></button>'}).join("")+'</div>'+
    '<div class="day-h"><h2>'+esc(S.fmtDayLong(date))+'</h2>'+(date!==t?'<button class="lnk" id="tod">Voltar a hoje</button>':"")+'</div>'+timeline(date);
  shell("agenda","Agenda",S.monf(date)+" de "+date.slice(0,4),h,{date:date});
  bindTimeline(date);
  var go=function(d){location.hash="agenda/"+d};
  document.getElementById("wp").onclick=function(){go(S.addDays(date,-7))};
  document.getElementById("wn").onclick=function(){go(S.addDays(date,7))};
  document.getElementById("week").onclick=function(e){var b=e.target.closest(".wd");if(b)go(b.dataset.d)};
  var td=document.getElementById("tod");if(td)td.onclick=function(){go(t)};
}

/* ---------- menu + ações ---------- */
function openMenu(date){
  S.sheet("O que você quer fazer?",'<div class="menu-l"><button class="mrow" data-a="new">'+ic("user",22)+'<span><b>Agendar cliente</b><i>Marcar um horário por aqui</i></span>'+ic("right",18)+'</button><button class="mrow" data-a="blk">'+ic("ban",22)+'<span><b>Bloquear horário</b><i>Almoço, compromisso, curso</i></span>'+ic("right",18)+'</button><button class="mrow" data-a="off">'+ic("moon",22)+'<span><b>Folga, férias ou dia especial</b><i>Fechar dias ou mudar o expediente</i></span>'+ic("right",18)+'</button></div>',function(el){
    el.onclick=function(e){var b=e.target.closest("[data-a]");if(!b)return;var a=b.dataset.a;S.closeSheet();setTimeout(function(){if(a==="new")openNew({date:date});else if(a==="blk")openBlock({date:date});else openTimeOff({date:date})},280)};
  });
}
function waRemind(b){
  var d=b.date===S.today()?"hoje":b.date===S.addDays(S.today(),1)?"amanhã":S.fmtDay(b.date).toLowerCase();
  return S.waLink(b.phone,"Olá, "+first(b.name)+"! Passando para lembrar do seu horário "+d+" às "+S.fmt(b.start)+" no "+st.shop.name+". Até lá!");
}
function openBooking(b){
  var bar=S.barberOf(b.barber),blk=b.status==="bloqueio";
  var h='<div class="b-head"><p class="b-when">'+esc(S.fmtDayLong(b.date))+'<br><b>'+S.fmt(b.start)+' às '+S.fmt(b.start+b.dur)+'</b> · '+durText(b.dur)+'</p>'+
    (blk?'<p class="muted">'+esc(b.note||"Horário bloqueado")+'</p>':'<p class="b-name">'+esc(b.name)+'</p><p class="muted">'+esc(svcText(b))+' · '+money(b.status==="concluido"?amount(b):b.total)+'</p>'+(b.status==="concluido"&&b.paid?'<p class="muted">Pago em '+esc(PAYN[b.paid]||b.paid)+'</p>':"")+(b.note?'<p class="muted">'+esc(b.note)+'</p>':""))+
    '<p class="muted">'+esc(bar?bar.name:"Ex-profissional")+(b.source==="link"?" · veio pelo link":b.source==="manual"&&!blk?" · marcado por você":"")+'</p></div><div class="acts">';
  if(blk)h+='<button class="btn ghost" data-a="del">'+ic("trash",18)+'<span>Remover bloqueio</span></button>';
  else{
    if(b.status==="confirmado")h+='<button class="btn" data-a="done">'+ic("check",18)+'<span>Concluir atendimento</span></button><button class="btn ghost" data-a="miss">'+ic("ban",18)+'<span>Cliente faltou</span></button>';
    else h+='<button class="btn ghost" data-a="reopen">'+ic("swap",18)+'<span>Voltar para confirmado</span></button>'+(b.status==="concluido"?'<button class="btn ghost" data-a="done">'+ic("edit",18)+'<span>Editar pagamento</span></button>':"");
    if(b.status==="confirmado"||b.status==="concluido")h+='<button class="btn ghost" data-a="edit">'+ic("clock",18)+'<span>Remarcar ou ajustar</span></button>';
    if(b.phone&&b.status==="confirmado"){var w=waRemind(b);if(w)h+='<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(w)+'">'+ic("chat",18)+'<span>Lembrar pelo WhatsApp</span></a>'}
    if(b.status==="confirmado")h+='<button class="btn ghost danger" data-a="cancel">'+ic("close",18)+'<span>Cancelar horário</span></button>';
    h+='<button class="btn quiet danger" data-a="del">'+ic("trash",18)+'<span>Excluir registro</span></button>';
  }
  S.sheet(blk?"Bloqueio":"Atendimento",h+'</div>',function(el){
    el.onclick=function(e){
      var a=e.target.closest("[data-a]");if(!a)return;var act=a.dataset.a;
      if(act==="done"){S.closeSheet();setTimeout(function(){openPay(b)},280);return}
      if(act==="edit"){S.closeSheet();setTimeout(function(){openEdit(b)},280);return}
      if(act==="miss")return setStatus(b,"faltou","Marcado como falta");
      if(act==="reopen")return setStatus(b,"confirmado","Voltou para confirmado",{paid:"",paidTotal:null,commPct:null});
      if(act==="cancel")return S.confirm("Cancelar este horário?","O horário volta a ficar livre para outros clientes.","Cancelar horário",true).then(function(y){if(y)setStatus(b,"cancelado","Horário cancelado")});
      if(act==="del")return S.confirm(blk?"Remover bloqueio?":"Excluir este registro?",blk?"O horário volta a ficar livre.":"O registro some da agenda e do Caixa. Prefira cancelar se quiser manter o histórico.","Excluir",true).then(function(y){if(y)DB.removeBooking(b.id).then(function(ok){if(ok){S.closeSheet();S.toast("Excluído");fresh()}else S.toast("Não foi possível excluir. Tente de novo.")})});
    };
  });
}
function setStatus(b,status,msg,extra){
  var patch=Object.assign({status:status},extra||{});
  DB.updateBooking(b.id,patch).then(function(ok){if(ok){S.closeSheet();S.toast(msg);fresh()}else S.toast("Não foi possível salvar. Tente de novo.")});
}
function openPay(b){
  var method=b.paid||"pix",val=amount(b);
  var h='<p class="muted">'+esc(b.name)+' · '+esc(svcText(b))+'</p><div class="field"><label for="pv">Valor cobrado (R$)</label><input id="pv" class="input big-in" inputmode="decimal" value="'+String(val).replace(".",",")+'"></div>'+
    '<div class="field"><span class="label">Forma de pagamento</span><div class="pay" id="pay">'+PAY.map(function(p){return '<button class="pay-i" data-m="'+p[0]+'" aria-pressed="'+(p[0]===method)+'">'+ic(p[2],22)+'<span>'+p[1]+'</span></button>'}).join("")+'</div></div>'+
    '<div class="field"><label for="pn">Observação (opcional)</label><input id="pn" class="input" value="'+esc(b.note||"")+'" placeholder="Ex.: gorjeta, desconto, produto"></div><p id="err" class="err" hidden></p><button class="btn" id="sv">Registrar e concluir</button>';
  S.sheet("Concluir atendimento",h,function(el){
    el.querySelector("#pay").onclick=function(e){var p=e.target.closest(".pay-i");if(!p)return;method=p.dataset.m;el.querySelectorAll(".pay-i").forEach(function(x){x.setAttribute("aria-pressed",String(x===p))})};
    el.querySelector("#sv").onclick=function(){
      var v=S.num(el.querySelector("#pv").value);
      if(v<0||isNaN(v)){var er=el.querySelector("#err");er.hidden=false;er.textContent="Informe o valor cobrado.";return}
      DB.updateBooking(b.id,{status:"concluido",paid:method,paidTotal:Math.round(v*100)/100,commPct:st.comm[b.barber]||0,note:el.querySelector("#pn").value.trim()}).then(function(ok){if(ok){S.closeSheet();S.toast("Atendimento registrado");fresh()}else S.toast("Não foi possível salvar. Tente de novo.")});
    };
  });
}
function opts(list,cur0,fn){return list.map(function(x){return '<option value="'+esc(fn(x)[0])+'"'+(fn(x)[0]===cur0?" selected":"")+'>'+esc(fn(x)[1])+'</option>'}).join("")}
function openEdit(b){
  var h='<div class="row"><div class="field"><label for="ed">Dia</label><input id="ed" class="input" type="date" value="'+b.date+'"></div><div class="field"><label for="et">Hora</label><input id="et" class="input" type="time" step="300" value="'+S.fmt(b.start)+'"></div></div>'+
    '<div class="row"><div class="field"><label for="eb">Profissional</label><select id="eb" class="input">'+opts(barbersList(),b.barber,function(x){return [x.id,x.name]})+'</select></div><div class="field"><label for="el">Duração (min)</label><input id="el" class="input" inputmode="numeric" value="'+b.dur+'"></div></div>'+
    '<label class="chk" id="ovw" hidden><input type="checkbox" id="ov"><span>Encaixar mesmo com outro horário no mesmo período</span></label><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv">Salvar alterações</button>';
  S.sheet("Remarcar ou ajustar",h,function(el){
    var g=function(i){return el.querySelector("#"+i)},err=g("err");
    g("sv").onclick=function(){
      var date=g("ed").value,start=S.toMin(g("et").value||"00:00"),barber=g("eb").value,dur=parseInt(g("el").value,10);
      if(!date||!g("et").value||!(dur>=5)){err.hidden=false;err.textContent="Confira dia, hora e duração.";return}
      var busy=!S.barberFree(barber,date,start,dur,b.id);
      if(busy&&!g("ov").checked){g("ovw").hidden=false;err.hidden=false;err.textContent="Esse profissional já tem horário nesse período. Escolha outro horário ou marque para encaixar.";return}
      DB.updateBooking(b.id,{date:date,start:start,dur:dur,barber:barber,over:busy||b.over}).then(function(ok){if(ok){S.closeSheet();S.toast("Horário atualizado");
        var w=b.phone&&(date!==b.date||start!==b.start)?S.waLink(b.phone,"Olá, "+first(b.name)+"! Seu horário no "+st.shop.name+" foi remarcado para "+S.fmtDayLong(date)+" às "+S.fmt(start)+"."):"";
        fresh();if(w)setTimeout(function(){S.sheet("Avisar o cliente?",'<p class="lead">Mande a nova data para '+esc(first(b.name))+' pelo WhatsApp.</p><div class="btnrow"><button class="btn ghost" data-x="1">Agora não</button><a class="btn" target="_blank" rel="noopener" href="'+esc(w)+'" data-x="1">Enviar</a></div>')},350);
      }else S.toast("Não foi possível salvar. Tente de novo.")});
    };
  });
}

/* ---------- novo agendamento / bloqueio / folga ---------- */
function openNew(p){
  p=p||{};var s=st.shop,svc={},barber=p.barber&&p.barber!=="all"?p.barber:(sel()!=="all"?sel():barbersList()[0].id);
  var h='<div class="field"><span class="label">Serviços</span><div class="tags" id="sv">'+s.services.map(function(v){return '<button class="tag" data-id="'+esc(v.id)+'" aria-pressed="false">'+esc(v.name)+'<i>'+money(v.price)+'</i></button>'}).join("")+'</div></div>'+
    '<div class="row"><div class="field"><label for="nd">Dia</label><input id="nd" class="input" type="date" value="'+(p.date||S.today())+'"></div><div class="field"><label for="nt">Hora</label><input id="nt" class="input" type="time" step="300" value="'+(p.start!=null?S.fmt(p.start):"")+'"></div></div>'+
    '<div class="field"><label for="nb">Profissional</label><select id="nb" class="input">'+opts(barbersList(),barber,function(x){return [x.id,x.name]})+'</select></div>'+
    '<div class="row"><div class="field"><label for="nn">Nome do cliente</label><input id="nn" class="input" autocomplete="off"></div><div class="field"><label for="np">WhatsApp (opcional)</label><input id="np" class="input" type="tel" inputmode="tel"></div></div>'+
    '<p class="note" id="tot"></p><label class="chk" id="ovw" hidden><input type="checkbox" id="ov"><span>Encaixar mesmo com outro horário no mesmo período</span></label><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv2">Agendar</button>';
  S.sheet("Agendar cliente",h,function(el){
    var g=function(i){return el.querySelector("#"+i)},err=g("err");
    function total(){var ids=Object.keys(svc),t=S.svcDur(ids);g("tot").textContent=ids.length?durText(t.dur)+" · "+money(t.total):"";return t}
    g("np").oninput=function(){g("np").value=S.maskPhone(g("np").value)};
    g("sv").onclick=function(e){var b=e.target.closest(".tag");if(!b)return;var id=b.dataset.id;if(svc[id]){delete svc[id];b.setAttribute("aria-pressed","false")}else{svc[id]=1;b.setAttribute("aria-pressed","true")}total()};
    g("sv2").onclick=function(){
      var ids=Object.keys(svc),t=total(),date=g("nd").value,tm=g("nt").value,name=g("nn").value.trim(),bar=g("nb").value;
      function fail(m){err.hidden=false;err.textContent=m}
      if(!ids.length)return fail("Escolha ao menos um serviço.");
      if(!date||!tm)return fail("Informe o dia e a hora.");
      if(!name)return fail("Informe o nome do cliente.");
      var start=S.toMin(tm),busy=!S.barberFree(bar,date,start,t.dur);
      if(busy&&!g("ov").checked){g("ovw").hidden=false;return fail("Esse profissional já tem horário nesse período. Escolha outro horário ou marque para encaixar.")}
      var rec={barber:bar,date:date,start:start,dur:t.dur,services:ids.map(function(id){var v=s.services.filter(function(x){return x.id===id})[0];return {id:v.id,name:v.name,price:+v.price}}),total:t.total,name:name,phone:g("np").value.trim(),status:"confirmado",source:"manual",over:busy,note:""};
      g("sv2").disabled=true;
      DB.addBookings([rec]).then(function(ok){g("sv2").disabled=false;if(ok){S.closeSheet();S.toast("Horário marcado");fresh()}else fail("Não foi possível salvar. Tente de novo.")});
    };
  });
}
function openBlock(p){
  p=p||{};
  var h='<div class="field"><label for="bb">Profissional</label><select id="bb" class="input"><option value="all">Todos</option>'+opts(barbersList(),sel(),function(x){return [x.id,x.name]})+'</select></div>'+
    '<div class="row"><div class="field"><label for="bd">Dia</label><input id="bd" class="input" type="date" value="'+(p.date||S.today())+'"></div><div class="field"><label for="br">Repetir</label><select id="br" class="input"><option value="1">Só neste dia</option><option value="4">Toda semana, por 4 semanas</option><option value="8">Toda semana, por 8 semanas</option><option value="12">Toda semana, por 12 semanas</option></select></div></div>'+
    '<div class="row"><div class="field"><label for="bs">Das</label><input id="bs" class="input" type="time" step="300" value="'+(p.start!=null?S.fmt(p.start):"12:00")+'"></div><div class="field"><label for="be">Até</label><input id="be" class="input" type="time" step="300" value="'+(p.start!=null?S.fmt(Math.min(p.start+60,1439)):"13:00")+'"></div></div>'+
    '<div class="field"><label for="bn">Motivo (opcional)</label><input id="bn" class="input" placeholder="Ex.: dentista, curso, banco"></div><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv">Bloquear horário</button>';
  S.sheet("Bloquear horário",h,function(el){
    var g=function(i){return el.querySelector("#"+i)},err=g("err");
    g("bb").value=sel();
    g("sv").onclick=function(){
      var date=g("bd").value,a=S.toMin(g("bs").value||"0:0"),e=S.toMin(g("be").value||"0:0"),n=+g("br").value;
      if(!date||e<=a){err.hidden=false;err.textContent="O fim precisa ser depois do início.";return}
      var ids=g("bb").value==="all"?barbersList().map(function(x){return x.id}):[g("bb").value],list=[];
      for(var w=0;w<n;w++)ids.forEach(function(id){list.push({barber:id,date:S.addDays(date,7*w),start:a,dur:e-a,services:[],total:0,name:"",phone:"",status:"bloqueio",source:"manual",note:g("bn").value.trim()})});
      g("sv").disabled=true;
      DB.addBookings(list).then(function(ok){g("sv").disabled=false;if(ok){S.closeSheet();S.toast(list.length>1?list.length+" bloqueios criados":"Horário bloqueado");fresh()}else{err.hidden=false;err.textContent="Não foi possível salvar. Tente de novo."}});
    };
  });
}
var KINDS=[["folga","Folga"],["ferias","Férias"],["feriado","Feriado"],["especial","Horário especial"]];
function openTimeOff(p){
  p=p||{};var d0=p.date||S.today();
  var h='<div class="field"><span class="label">Tipo</span><div class="seg" id="kd">'+KINDS.map(function(k,i){return '<button class="seg-i" data-k="'+k[0]+'" aria-pressed="'+(i===0)+'">'+k[1]+'</button>'}).join("")+'</div></div>'+
    '<div class="field"><label for="ob">Vale para</label><select id="ob" class="input"><option value="">Loja toda</option>'+opts(barbersList(),"",function(x){return [x.id,x.name]})+'</select></div>'+
    '<div class="row"><div class="field"><label for="of">De</label><input id="of" class="input" type="date" value="'+d0+'"></div><div class="field"><label for="ot">Até</label><input id="ot" class="input" type="date" value="'+d0+'"></div></div>'+
    '<div class="row" id="sp" hidden><div class="field"><label for="sa">Abre às</label><input id="sa" class="input" type="time" value="10:00"></div><div class="field"><label for="sb">Fecha às</label><input id="sb" class="input" type="time" value="14:00"></div></div>'+
    '<div class="field"><label for="on">Motivo (só você vê)</label><input id="on" class="input" placeholder="Ex.: viagem, consulta, Natal"></div>'+
    '<div id="warn"></div><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv">Salvar</button>';
  S.sheet("Folga, férias ou dia especial",h,function(el){
    var g=function(i){return el.querySelector("#"+i)},err=g("err"),kind="folga";
    function conflicts(){
      var f=g("of").value,t=g("ot").value,b=g("ob").value;if(!f||!t)return [];
      return st.bk.filter(function(x){return x.status==="confirmado"&&x.date>=f&&x.date<=t&&(!b||x.barber===b)});
    }
    function warn(){
      var c=kind==="especial"?[]:conflicts(),w=g("warn");
      w.innerHTML=c.length?'<div class="banner warn">'+ic("bell",18)+'<span><b>'+c.length+(c.length>1?" horários marcados":" horário marcado")+' nesse período</b><i>Eles não são cancelados sozinhos. Avise os clientes ou remarque antes.</i></span></div>':"";
    }
    g("kd").onclick=function(e){var b=e.target.closest(".seg-i");if(!b)return;kind=b.dataset.k;el.querySelectorAll(".seg-i").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});g("sp").hidden=kind!=="especial";warn()};
    ["of","ot","ob"].forEach(function(i){g(i).onchange=warn});warn();
    g("sv").onclick=function(){
      var f=g("of").value,t=g("ot").value;
      if(!f||!t||t<f){err.hidden=false;err.textContent="A data final precisa ser igual ou depois da inicial.";return}
      var iv=[];
      if(kind==="especial"){var a=g("sa").value,b=g("sb").value;if(!a||!b||S.toMin(b)<=S.toMin(a)){err.hidden=false;err.textContent="O fechamento precisa ser depois da abertura.";return}iv=[[a,b]]}
      g("sv").disabled=true;
      DB.addTimeOff({barber:g("ob").value||null,from:f,to:t,kind:kind,intervals:iv,reason:g("on").value.trim()}).then(function(ok){g("sv").disabled=false;if(ok){S.closeSheet();S.toast("Salvo na agenda");fresh()}else{err.hidden=false;err.textContent="Não foi possível salvar. Tente de novo."}});
    };
  });
}

/* ---------- fechamento do dia ---------- */
function openClose(date){
  var l=S.dayBookings(date).filter(function(x){return x.status==="concluido"&&(sel()==="all"||x.barber===sel())});
  var by={},tot=0,comm=0;l.forEach(function(x){var m=x.paid||"outro";by[m]=(by[m]||0)+amount(x);tot+=amount(x);comm+=commOf(x)});
  var miss=S.dayBookings(date).filter(function(x){return x.status==="faltou"}).length,pend=S.dayBookings(date).filter(function(x){return x.status==="confirmado"});
  var rows=Object.keys(by).map(function(m){return '<div><dt>'+esc(PAYN[m]||"Sem forma")+'</dt><dd>'+money(by[m])+'</dd></div>'}).join("");
  var h='<dl class="receipt">'+(rows||'<div><dt>Nenhum atendimento concluído</dt><dd></dd></div>')+'<div class="tot"><dt>Total recebido</dt><dd>'+money(tot)+'</dd></div>'+(comm?'<div><dt>Comissões</dt><dd>'+money(comm)+'</dd></div><div><dt>Fica na casa</dt><dd>'+money(tot-comm)+'</dd></div>':"")+'</dl>'+
    '<p class="muted">'+l.length+' atendimento'+(l.length===1?"":"s")+' concluído'+(l.length===1?"":"s")+(miss?' · '+miss+' falta'+(miss>1?"s":""):"")+'</p>'+
    (pend.length?'<div class="banner warn">'+ic("bell",18)+'<span><b>'+pend.length+' ainda '+(pend.length>1?"estão":"está")+' como confirmado</b><i>Conclua ou marque falta para o Caixa ficar certo.</i></span></div>':"")+
    '<button class="btn ghost" id="cp">'+ic("copy",18)+'<span>Copiar resumo</span></button>';
  S.sheet("Fechamento do dia",h,function(el){
    el.querySelector("#cp").onclick=function(){
      var t="Fechamento "+S.fmtShort(date)+"\n"+Object.keys(by).map(function(m){return (PAYN[m]||"Sem forma")+": "+money(by[m])}).join("\n")+"\nTotal: "+money(tot)+"\nAtendimentos: "+l.length;
      (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){S.toast("Resumo copiado")},function(){S.toast("Não foi possível copiar")});
    };
  });
}

/* ---------- Caixa ---------- */
function range(per,ref){
  if(per==="dia")return [ref,ref];
  if(per==="semana"){var m=monday(ref);return [m,S.addDays(m,6)]}
  if(per==="ano")return [ref.slice(0,4)+"-01-01",ref.slice(0,4)+"-12-31"];
  return [S.monthStart(ref),S.monthEnd(ref)];
}
function shiftRef(per,ref,n){
  if(per==="dia")return S.addDays(ref,n);if(per==="semana")return S.addDays(ref,7*n);
  if(per==="ano")return (+ref.slice(0,4)+n)+ref.slice(4);return S.addMonths(ref,n);
}
function label(per,ref){
  var r=range(per,ref);
  if(per==="dia")return ref===S.today()?"Hoje":S.fmtDay(ref);
  if(per==="semana")return S.dnum(r[0])+" "+S.mon(r[0])+" a "+S.dnum(r[1])+" "+S.mon(r[1]);
  if(per==="ano")return ref.slice(0,4);
  return S.monf(ref).replace(/^./,function(c){return c.toUpperCase()})+" de "+ref.slice(0,4);
}
function calc(from,to,barber){
  var bs=st.bk.filter(function(b){return b.date>=from&&b.date<=to&&b.status!=="bloqueio"&&(barber==="all"||b.barber===barber)});
  var done=bs.filter(function(b){return b.status==="concluido"}),miss=bs.filter(function(b){return b.status==="faltou"}),pend=bs.filter(function(b){return b.status==="confirmado"});
  var rev=done.reduce(function(a,b){return a+amount(b)},0),comm=done.reduce(function(a,b){return a+commOf(b)},0);
  var exp=barber==="all"?st.exp.filter(function(e){return e.day>=from&&e.day<=to}):[];
  var expT=exp.reduce(function(a,e){return a+e.amount},0);
  var byB={},byS={},byP={},byD={};
  done.forEach(function(b){
    var x=byB[b.barber]=byB[b.barber]||{n:0,rev:0,comm:0};x.n++;x.rev+=amount(b);x.comm+=commOf(b);
    var list=(b.services||[]),sum=list.reduce(function(a,s){return a+(+s.price||0)},0);
    list.forEach(function(s){var y=byS[s.name]=byS[s.name]||{n:0,rev:0};y.n++;y.rev+=sum?amount(b)*(+s.price||0)/sum:amount(b)/list.length});
    var m=b.paid||"outro";byP[m]=(byP[m]||0)+amount(b);byD[b.date]=(byD[b.date]||0)+amount(b);
  });
  return {rev:rev,comm:comm,exp:exp,expT:expT,profit:rev-comm-expT,n:done.length,ticket:done.length?rev/done.length:0,miss:miss.length,missV:miss.reduce(function(a,b){return a+b.total},0),
    cancel:bs.filter(function(b){return b.status==="cancelado"}).length,pend:pend.reduce(function(a,b){return a+b.total},0),npend:pend.length,byB:byB,byS:byS,byP:byP,byD:byD,from:from,to:to};
}
function viewCash(){
  var cx=cur.cx;if(!cx.ref)cx.ref=S.today();
  var r=range(cx.per,cx.ref),c=calc(r[0],r[1],sel()),all=sel()==="all";
  var h=chips()+'<div class="seg wide" id="per">'+[["dia","Dia"],["semana","Semana"],["mes","Mês"],["ano","Ano"]].map(function(p){return '<button class="seg-i" data-p="'+p[0]+'" aria-pressed="'+(cx.per===p[0])+'">'+p[1]+'</button>'}).join("")+'</div>'+
    '<div class="wk-nav"><button class="icon-btn" id="pp" aria-label="Anterior">'+ic("left",20)+'</button><b>'+esc(label(cx.per,cx.ref))+'</b><button class="icon-btn" id="pn" aria-label="Próximo">'+ic("right",20)+'</button></div>';
  h+='<section class="kpi-hero"><i>'+(all?"Lucro":"Receita")+'</i><b>'+money(all?c.profit:c.rev)+'</b>'+(all?'<dl class="kpi-eq"><div><dt>Receita</dt><dd>'+money(c.rev)+'</dd></div><div><dt>Comissões</dt><dd>− '+money(c.comm)+'</dd></div><div><dt>Despesas</dt><dd>− '+money(c.expT)+'</dd></div></dl>':'<dl class="kpi-eq"><div><dt>Comissão</dt><dd>'+money(c.comm)+'</dd></div><div><dt>Fica na casa</dt><dd>'+money(c.rev-c.comm)+'</dd></div></dl>')+'</section>';
  if(cx.per==="mes"&&all){
    var pct=st.goal>0?Math.min(100,Math.round(c.rev/st.goal*100)):0;
    h+='<button class="goal" id="goal">'+(st.goal>0?'<span><b>Meta do mês</b><i>'+money(c.rev)+' de '+money(st.goal)+' · '+pct+'%</i></span><span class="bar"><i style="width:'+pct+'%"></i></span>':'<span><b>Definir meta do mês</b><i>Acompanhe quanto falta para bater</i></span>')+ic("right",18)+'</button>';
  }
  h+='<div class="kpis"><div><b>'+c.n+'</b><i>Atendimentos</i></div><div><b>'+money(c.ticket)+'</b><i>Ticket médio</i></div><div><b>'+c.miss+'</b><i>Faltas'+(c.miss?' · '+money(c.missV):"")+'</i></div><div><b>'+money(c.pend)+'</b><i>A receber ('+c.npend+')</i></div></div>';
  var days=Object.keys(c.byD);
  if((cx.per==="semana"||cx.per==="mes")&&days.length){
    var list=[],d=r[0];while(d<=r[1]){list.push(d);d=S.addDays(d,1)}
    var mx=Math.max.apply(null,list.map(function(k){return c.byD[k]||0}))||1;
    h+='<section class="blk-o"><h2>Receita por dia</h2><div class="bars" role="img" aria-label="Receita por dia">'+list.map(function(k){var v=c.byD[k]||0;return '<span class="bar-c'+(k===S.today()?" now":"")+'" title="'+esc(S.fmtDay(k)+": "+money(v))+'"><i style="height:'+Math.max(v?6:2,Math.round(v/mx*100))+'%"></i>'+(list.length<=8||S.dnum(k)%5===1?'<em>'+S.dnum(k)+'</em>':"")+'</span>'}).join("")+'</div></section>';
  }
  var bk=Object.keys(c.byB);
  if(all&&bk.length>0)h+='<section class="blk-o"><h2>Por profissional</h2><dl class="rows">'+bk.sort(function(a,b){return c.byB[b].rev-c.byB[a].rev}).map(function(id){var x=c.byB[id];return '<div><dt>'+esc(S.barberName(id))+'<i>'+x.n+' atend. · comissão '+money(x.comm)+'</i></dt><dd>'+money(x.rev)+'</dd></div>'}).join("")+'</dl></section>';
  var sk=Object.keys(c.byS);
  if(sk.length)h+='<section class="blk-o"><h2>Por serviço</h2><dl class="rows">'+sk.sort(function(a,b){return c.byS[b].rev-c.byS[a].rev}).map(function(n){var x=c.byS[n];return '<div><dt>'+esc(n)+'<i>'+x.n+'x</i></dt><dd>'+money(x.rev)+'</dd></div>'}).join("")+'</dl></section>';
  var pk=Object.keys(c.byP);
  if(pk.length)h+='<section class="blk-o"><h2>Forma de pagamento</h2><dl class="rows">'+pk.sort(function(a,b){return c.byP[b]-c.byP[a]}).map(function(m){return '<div><dt>'+esc(PAYN[m]||"Sem forma")+'</dt><dd>'+money(c.byP[m])+'</dd></div>'}).join("")+'</dl></section>';
  if(all)h+='<section class="blk-o"><div class="h-row"><h2>Despesas</h2><button class="btn small ghost" id="adde">'+ic("plus",16)+'<span>Adicionar</span></button></div>'+(c.exp.length?'<dl class="rows">'+c.exp.map(function(e){return '<div><dt><button class="plain" data-e="'+esc(e.id)+'">'+esc(e.category)+'<i>'+esc(S.fmtShort(e.day)+(e.note?" · "+e.note:""))+'</i></button></dt><dd>'+money(e.amount)+'</dd></div>'}).join("")+'</dl>':'<p class="empty">Nenhuma despesa neste período.</p>')+'</section>';
  if(!c.n&&!c.exp.length&&!c.npend)h+='<p class="empty">Ainda não há atendimentos concluídos neste período. Conclua os atendimentos na aba Hoje para ver o lucro aqui.</p>';
  shell("caixa","Caixa","Receita, comissões e lucro",h,{fab:false});
  document.getElementById("per").onclick=function(e){var b=e.target.closest(".seg-i");if(!b)return;cx.per=b.dataset.p;fresh()};
  document.getElementById("pp").onclick=function(){cx.ref=shiftRef(cx.per,cx.ref,-1);fresh()};
  document.getElementById("pn").onclick=function(){cx.ref=shiftRef(cx.per,cx.ref,1);fresh()};
  var gl=document.getElementById("goal");if(gl)gl.onclick=openGoal;
  var ae=document.getElementById("adde");if(ae)ae.onclick=function(){openExpense(r[0]<=S.today()&&S.today()<=r[1]?S.today():r[0])};
  document.querySelectorAll("[data-e]").forEach(function(b){b.onclick=function(){
    var e=st.exp.filter(function(x){return x.id===b.dataset.e})[0];if(!e)return;
    S.sheet("Despesa",'<p class="b-name">'+esc(e.category)+' · '+money(e.amount)+'</p><p class="muted">'+esc(S.fmtDayLong(e.day))+(e.note?'<br>'+esc(e.note):"")+'</p><button class="btn ghost danger" id="rm">'+ic("trash",18)+'<span>Excluir despesa</span></button>',function(el){
      el.querySelector("#rm").onclick=function(){DB.removeExpense(e.id).then(function(ok){if(ok){S.closeSheet();S.toast("Despesa excluída");fresh()}else S.toast("Não foi possível excluir.")})};
    });
  }});
}
function openExpense(day){
  var h='<div class="field"><span class="label">Categoria</span><div class="tags" id="cat">'+CATS.map(function(c,i){return '<button class="tag" data-c="'+esc(c)+'" aria-pressed="'+(i===0)+'">'+esc(c)+'</button>'}).join("")+'</div></div>'+
    '<div class="row"><div class="field"><label for="ea">Valor (R$)</label><input id="ea" class="input" inputmode="decimal"></div><div class="field"><label for="ed">Dia</label><input id="ed" class="input" type="date" value="'+day+'"></div></div>'+
    '<div class="field"><label for="en">Observação (opcional)</label><input id="en" class="input"></div><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv">Salvar despesa</button>';
  S.sheet("Nova despesa",h,function(el){
    var cat=CATS[0],g=function(i){return el.querySelector("#"+i)};
    g("cat").onclick=function(e){var b=e.target.closest(".tag");if(!b)return;cat=b.dataset.c;el.querySelectorAll(".tag").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))})};
    g("sv").onclick=function(){
      var v=S.num(g("ea").value);if(!(v>0)||!g("ed").value){var er=g("err");er.hidden=false;er.textContent="Informe o valor e o dia.";return}
      DB.addExpense({day:g("ed").value,category:cat,amount:Math.round(v*100)/100,note:g("en").value.trim()}).then(function(ok){if(ok){S.closeSheet();S.toast("Despesa salva");fresh()}else S.toast("Não foi possível salvar. Tente de novo.")});
    };
  });
}
function openGoal(){
  S.sheet("Meta do mês",'<p class="lead">Quanto a barbearia quer faturar por mês. Deixe em branco para remover.</p><div class="field"><label for="gv">Meta (R$)</label><input id="gv" class="input big-in" inputmode="decimal" value="'+(st.goal?String(st.goal).replace(".",","):"")+'"></div><button class="btn" id="sv">Salvar meta</button>',function(el){
    el.querySelector("#sv").onclick=function(){DB.saveGoal(Math.max(0,S.num(el.querySelector("#gv").value))).then(function(ok){if(ok){S.closeSheet();S.toast("Meta salva");fresh()}else S.toast("Não foi possível salvar.")})};
  });
}

/* ---------- login ---------- */
function viewLogin(){
  S.render('<main class="login"><img class="mark big" src="'+esc(st.shop.logo||"")+'" alt=""><h1>Painel do dono</h1><p class="lead">Entre para ver a agenda, o caixa e os ajustes do '+esc(st.shop.name)+'.</p>'+
    (S.REMOTE?"":'<p class="note">Modo de teste: qualquer e-mail e senha entram.</p>')+
    '<form id="lf" class="stack"><div class="field"><label for="a-mail">E-mail</label><input id="a-mail" class="input" type="email" autocomplete="username" required></div><div class="field"><label for="a-pw">Senha</label><input id="a-pw" class="input" type="password" autocomplete="current-password" required></div><p id="err" class="err" role="alert" hidden></p><button class="btn" id="go" type="submit">Entrar</button></form><a class="btn quiet" href="#">Voltar ao site</a></main>',{view:"login",title:"Painel do dono"});
  document.getElementById("lf").onsubmit=function(e){
    e.preventDefault();var b=document.getElementById("go"),er=document.getElementById("err");
    b.disabled=true;b.textContent="Entrando…";er.hidden=true;
    DB.signIn(document.getElementById("a-mail").value.trim(),document.getElementById("a-pw").value).then(function(r){
      if(r.ok){loaded=false;location.hash="hoje";S.route(false)}else{b.disabled=false;b.textContent="Entrar";er.hidden=false;er.textContent=r.error}
    });
  };
}

S.owner={openNew:openNew,openBlock:openBlock,openTimeOff:openTimeOff,shell:shell,fresh:fresh,amount:amount,svcText:svcText,durText:durText,first:first};
S.routes.owner=async function(r,keep,my){
  if(r.name==="painel"){viewLogin();return}
  if(!loaded){
    S.render('<main class="msg"><p class="lead">Carregando sua agenda…</p></main>',{view:"owner"});
    var ok=await DB.loadOwner();if(!S.isCurrent(my))return;
    if(!ok){S.message("Não foi possível carregar a agenda","Verifique a conexão e tente de novo.",true);return}
    DB.loadLocalOwner&&!S.REMOTE&&DB.loadLocalOwner();loaded=true;
  }
  S.refresh=null;
  if(r.name==="hoje"){S.refresh=fresh;viewToday()}
  else if(r.name==="agenda"){S.refresh=fresh;viewAgenda(r)}
  else if(r.name==="caixa")viewCash();
  else if(r.name==="ajustes"){await S.need("settings.js");if(!S.isCurrent(my))return;S.settings(r.args[0]||"")}
};
})();
