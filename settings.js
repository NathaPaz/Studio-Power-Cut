/* Studio Power Cut: Ajustes do dono (horários, folgas, regras, serviços, equipe, vitrine, clientes). */
(function(){
"use strict";
var S=window.SPC,st=S.st,esc=S.esc,ic=S.ic,DB=S.DB,money=S.money,O=S.owner;
var KIND={folga:"Folga",ferias:"Férias",feriado:"Feriado",especial:"Horário especial"};

function sub(title,lead,inner,save){
  S.render('<div class="o-wrap sub"><header class="o-head"><a class="back" href="#ajustes" aria-label="Voltar para Ajustes">'+ic("left",22)+'</a><div><h1>'+esc(title)+'</h1></div></header><main class="o-main">'+(lead?'<p class="lead">'+lead+'</p>':"")+inner+'</main>'+(save?'<div class="save-bar"><p id="err" class="err" role="alert" hidden></p><button class="btn" id="sv">'+esc(save)+'</button></div>':"")+'</div>',{view:"owner sub",title:title});
}
function fail(m){var e=document.getElementById("err");if(!e)return;e.hidden=false;e.textContent=m;var b=document.getElementById("sv");if(b)b.disabled=false}
function saved(msg){S.persist().then(function(ok){if(ok){S.toast(msg);location.hash="ajustes"}else{var b=document.getElementById("sv");if(b)b.disabled=false}})}
function busy(){var b=document.getElementById("sv");if(b)b.disabled=true;var e=document.getElementById("err");if(e)e.hidden=true}
function prev(v){return v?'<img alt="" src="'+esc(v)+'">':'<span class="muted">Sem foto</span>'}
function durOpts(cur){var o=[10,15,20,25,30,40,45,50,60,75,90,105,120,150,180],h="";if(o.indexOf(+cur)<0)o.push(+cur),o.sort(function(a,b){return a-b});o.forEach(function(m){h+='<option value="'+m+'"'+(m===+cur?" selected":"")+'>'+(m<60?m+" min":Math.floor(m/60)+"h"+(m%60?" "+m%60:""))+'</option>'});return h}

/* ---------- índice ---------- */
function index(){
  function row(h,icn,t,d){return '<a class="srow" href="#'+h+'">'+ic(icn,22)+'<span><b>'+t+'</b><i>'+d+'</i></span>'+ic("right",18)+'</a>'}
  var g=function(t,rows){return '<section class="sgroup"><h2>'+t+'</h2>'+rows.join("")+'</section>'};
  var h=g("Agenda",[
    row("ajustes/horarios","clock","Horário de atendimento","Dias, almoço e horário de cada barbeiro"),
    row("ajustes/folgas","moon","Folgas, férias e datas especiais","Feriados e dias com expediente diferente"),
    row("ajustes/regras","shield","Regras de agendamento","Intervalo entre clientes, antecedência, cancelamento")])+
  g("Equipe e preços",[
    row("ajustes/servicos","scissors","Serviços e preços","Valor e duração de cada serviço"),
    row("ajustes/equipe","users","Equipe e comissão","Fotos, nomes e porcentagem de cada barbeiro"),
    row("ajustes/clientes","user","Clientes","Histórico, gastos e contato")])+
  g("Site",[
    row("ajustes/perfil","star","Perfil e logo","Nome, capa, endereço, WhatsApp, Instagram"),
    row("ajustes/novidades","news","Novidades","Avisos e promoções da tela inicial"),
    row("ajustes/produtos","bag","Produtos","Fotos, preços e disponibilidade"),
    row("ajustes/cursos","play","Curso e vídeo","Apresentação do curso em destaque"),
    row("ajustes/link","link","Link para clientes","Copiar e divulgar")])+
  '<button class="srow out" id="out">'+ic("logout",22)+'<span><b>Sair do painel</b><i>'+(S.REMOTE?"Encerrar a sessão neste aparelho":"Modo de teste: dados salvos só neste navegador")+'</i></span></button>';
  O.shell("ajustes","Ajustes","",h,{fab:false});
  document.getElementById("out").onclick=function(){DB.signOut().then(function(){location.hash="";S.route(false)})};
}

/* ---------- horários ---------- */
function clone(o){return JSON.parse(JSON.stringify(o))}
function hoursEditor(h){
  return [1,2,3,4,5,6,0].map(function(d){
    var iv=h[d]||[];
    return '<div class="dayrow" data-d="'+d+'"><b>'+S.DOWF[d].replace(/^./,function(c){return c.toUpperCase()})+'</b>'+[0,1].map(function(i){var x=iv[i]||["",""];
      return '<div class="range"><input class="input" type="time" aria-label="'+S.DOWF[d]+', período '+(i+1)+', abre" data-i="'+i+'a" value="'+x[0]+'"><span>às</span><input class="input" type="time" aria-label="'+S.DOWF[d]+', período '+(i+1)+', fecha" data-i="'+i+'b" value="'+x[1]+'"></div>'}).join("")+'</div>';
  }).join("");
}
function readEditor(root){
  var out={};
  for(var d=0;d<7;d++){
    var el=root.querySelector('[data-d="'+d+'"]'),iv=[],name=S.DOWF[d];
    for(var i=0;i<2;i++){
      var a=el.querySelector('[data-i="'+i+'a"]').value,b=el.querySelector('[data-i="'+i+'b"]').value;
      if(a&&b){if(S.toMin(b)<=S.toMin(a))return {error:name+": o fechamento deve ser depois da abertura."};iv.push([a,b])}
      else if(a||b)return {error:name+": preencha abertura e fechamento do período, ou deixe os dois em branco."};
    }
    iv.sort(function(x,y){return S.toMin(x[0])-S.toMin(y[0])});
    if(iv.length===2&&S.toMin(iv[1][0])<S.toMin(iv[0][1]))return {error:name+": os períodos não podem se sobrepor."};
    out[d]=iv;
  }
  return {hours:out};
}
function viewHours(){
  var H={shop:clone(st.shop.hours),b:{}},tab="shop";
  st.shop.barbers.forEach(function(b){H.b[b.id]=b.hours?clone(b.hours):null});
  function paint(){
    var seg=st.shop.barbers.length?'<div class="seg wide" id="tabs"><button class="seg-i" data-t="shop" aria-pressed="'+(tab==="shop")+'">Loja</button>'+st.shop.barbers.map(function(b){return '<button class="seg-i" data-t="'+esc(b.id)+'" aria-pressed="'+(tab===b.id)+'">'+esc(O.first(b.name))+'</button>'}).join("")+'</div>':"";
    var own=tab!=="shop"&&H.b[tab]!==null,h=seg;
    if(tab!=="shop")h+='<label class="chk"><input type="checkbox" id="same" '+(own?"":"checked")+'><span>Usar o horário da loja</span></label>';
    h+='<div id="ed">'+((tab==="shop"||own)?hoursEditor(tab==="shop"?H.shop:H.b[tab]):'<p class="note">'+esc(S.barberName(tab))+' segue o horário da loja. Desmarque para definir um horário só dele.</p>')+'</div>';
    sub("Horário de atendimento","Informe os períodos de cada dia. Deixe em branco o período em que não atende, como o almoço, ou o dia inteiro para fechar. Folgas e feriados ficam em Folgas e datas especiais.",h,"Salvar horários");
    var tb=document.getElementById("tabs");if(tb)tb.onclick=function(e){var b=e.target.closest(".seg-i");if(!b)return;if(!stash())return;tab=b.dataset.t;paint()};
    var same=document.getElementById("same");if(same)same.onchange=function(){if(same.checked)H.b[tab]=null;else H.b[tab]=clone(H.shop);paint()};
    document.getElementById("sv").onclick=function(){
      if(!stash())return;
      if(!Object.keys(H.shop).some(function(k){return H.shop[k].length}))return fail("Mantenha ao menos um dia aberto na loja.");
      busy();st.shop.hours=H.shop;delete st.shop.days;delete st.shop.open;delete st.shop.close;
      st.shop.barbers.forEach(function(b){if(H.b[b.id])b.hours=H.b[b.id];else delete b.hours});
      saved("Horários salvos");
    };
  }
  function stash(){
    var ed=document.getElementById("ed");if(!ed||!ed.querySelector("[data-d]"))return true;
    var r=readEditor(ed);if(r.error){fail(r.error);return false}
    if(tab==="shop")H.shop=r.hours;else H.b[tab]=r.hours;return true;
  }
  paint();
}

/* ---------- folgas ---------- */
function viewOff(){
  var t=S.today(),list=st.ex.slice().sort(function(a,b){return a.from<b.from?-1:1});
  var up=list.filter(function(x){return x.to>=t}),past=list.filter(function(x){return x.to<t}).reverse();
  function row(x){
    var who=x.barber?S.barberName(x.barber):"Loja toda",d=x.from===x.to?S.fmtDay(x.from):S.fmtShort(x.from)+" a "+S.fmtShort(x.to);
    var extra=x.kind==="especial"?" · "+(x.intervals||[]).map(function(i){return S.hh(i[0])+" às "+S.hh(i[1])}).join(", "):"";
    return '<div class="orow"><span><b>'+KIND[x.kind]+' · '+esc(who)+'</b><i>'+esc(d+extra+(x.reason?" · "+x.reason:""))+'</i></span><button class="icon-btn" data-id="'+esc(x.id)+'" aria-label="Excluir">'+ic("trash",20)+'</button></div>'}
  var h='<button class="btn" id="add">'+ic("plus",18)+'<span>Nova folga ou data especial</span></button><section class="sgroup"><h2>Próximas</h2>'+(up.length?up.map(row).join(""):'<p class="empty">Nenhuma folga marcada.</p>')+'</section>'+(past.length?'<section class="sgroup"><h2>Passadas</h2>'+past.slice(0,10).map(row).join("")+'</section>':"");
  sub("Folgas, férias e datas especiais","Dias fechados e dias com horário diferente. O cliente só enxerga os horários livres, sem o motivo.",h);
  document.getElementById("add").onclick=function(){O.openTimeOff({date:t})};
  document.querySelector(".o-main").onclick=function(e){
    var b=e.target.closest("[data-id]");if(!b)return;
    S.confirm("Excluir esta folga?","Os horários desses dias voltam a ficar disponíveis para os clientes.","Excluir",true).then(function(y){if(y)DB.removeTimeOff(b.dataset.id).then(function(ok){if(ok){S.toast("Excluída");O.fresh()}else S.toast("Não foi possível excluir.")})});
  };
}

/* ---------- regras ---------- */
function viewRules(){
  var s=st.shop;
  function sel(id,label,hint,vals,cur,fmt){return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'" class="input">'+vals.map(function(v){return '<option value="'+v+'"'+(+cur===v?" selected":"")+'>'+fmt(v)+'</option>'}).join("")+'</select><small>'+hint+'</small></div>'}
  var h=sel("rb","Intervalo entre clientes","Tempo livre depois de cada atendimento, para arrumar a cadeira.",[0,5,10,15,20,30],s.bufferMin,function(v){return v?v+" minutos":"Sem intervalo"})+
    sel("rs","Grade de horários","De quanto em quanto tempo o cliente vê um horário novo.",[15,20,30,45,60],s.slotStep,function(v){return "A cada "+v+" minutos"})+
    sel("rl","Antecedência mínima","Quanto antes do horário o cliente ainda consegue marcar no mesmo dia.",[0,15,30,60,120],s.leadMin,function(v){return v?v<60?v+" minutos":(v/60)+(v===60?" hora":" horas"):"Até o horário começar"})+
    sel("rc","Cancelamento pelo cliente","Até quanto tempo antes o cliente pode cancelar ou remarcar pelo próprio link.",[0,1,2,4,12,24],s.cancelHours,function(v){return v?v+(v===1?" hora antes":" horas antes"):"Qualquer momento"});
  sub("Regras de agendamento","Valem para todos os horários marcados pelo link.",h,"Salvar regras");
  document.getElementById("sv").onclick=function(){
    busy();s.bufferMin=+document.getElementById("rb").value;s.slotStep=+document.getElementById("rs").value;s.leadMin=+document.getElementById("rl").value;s.cancelHours=+document.getElementById("rc").value;saved("Regras salvas");
  };
}

/* ---------- serviços ---------- */
function viewServices(){
  var s=st.shop;
  function row(x){return '<div class="rowline" data-id="'+esc(x.id||"")+'"><input class="input" data-k="n" placeholder="Serviço" value="'+esc(x.name||"")+'" aria-label="Nome do serviço"><div class="r2"><input class="input num" data-k="p" inputmode="decimal" placeholder="R$" value="'+esc(x.price!=null&&x.price!==""?x.price:"")+'" aria-label="Preço"><select class="input" data-k="m" aria-label="Duração">'+durOpts(x.min||30)+'</select><button type="button" class="icon-btn rm" aria-label="Remover serviço">'+ic("trash",20)+'</button></div></div>'}
  sub("Serviços e preços","Nome, preço e duração. Os horários livres do cliente respeitam a duração.",'<div id="rows" class="stack tight">'+s.services.map(row).join("")+'</div><button type="button" class="btn ghost" id="add">'+ic("plus",18)+'<span>Adicionar serviço</span></button>',"Salvar serviços");
  var rows=document.getElementById("rows");
  rows.addEventListener("click",function(e){var b=e.target.closest(".rm");if(b&&rows.children.length>1)b.closest(".rowline").remove()});
  document.getElementById("add").onclick=function(){rows.insertAdjacentHTML("beforeend",row({}));rows.lastElementChild.querySelector("input").focus()};
  document.getElementById("sv").onclick=function(){
    var out=[].slice.call(rows.children).map(function(r){
      var g=function(k){return r.querySelector('[data-k="'+k+'"]').value.trim()};
      return g("n")?{id:r.dataset.id||"v"+S.uid(),name:g("n"),price:S.num(g("p")),min:+g("m")}:null}).filter(Boolean);
    if(!out.length)return fail("Cadastre ao menos um serviço.");
    busy();s.services=out;saved("Serviços salvos");
  };
}

/* ---------- equipe ---------- */
function viewTeam(){
  var s=st.shop;
  function row(b){
    var id=S.uid();
    return '<div class="tcard" data-id="'+esc(b.id||"")+'"><div class="t-top"><div class="imgp round" data-prev="1">'+prev(b.photo||"")+'</div><label class="up">Trocar foto<input type="file" accept="image/*" data-img="1"></label></div>'+
      '<div class="field"><label for="tn'+id+'">Nome</label><input id="tn'+id+'" class="input" data-k="n" value="'+esc(b.name||"")+'"></div>'+
      '<div class="row"><div class="field"><label for="tk'+id+'">Apelido</label><input id="tk'+id+'" class="input" data-k="k" value="'+esc(b.nick||"")+'"></div><div class="field"><label for="tc'+id+'">Comissão (%)</label><input id="tc'+id+'" class="input" inputmode="decimal" data-k="c" value="'+(b.id&&st.comm[b.id]!=null?String(st.comm[b.id]).replace(".",","):"")+'" placeholder="0"></div></div>'+
      '<button type="button" class="btn quiet danger" data-del="1">'+ic("trash",18)+'<span>Remover da equipe</span></button></div>';
  }
  sub("Equipe e comissão","A comissão é só sua: o cliente nunca vê. Ela entra no cálculo do lucro na aba Caixa.",'<div id="rows" class="stack"></div><button type="button" class="btn ghost" id="add">'+ic("plus",18)+'<span>Adicionar barbeiro</span></button>',"Salvar equipe");
  var rows=document.getElementById("rows");
  function addCard(b){rows.insertAdjacentHTML("beforeend",row(b));rows.lastElementChild.photo=b.photo||"";rows.lastElementChild.hours=b.hours}
  s.barbers.forEach(addCard);
  rows.addEventListener("click",function(e){var d=e.target.closest("[data-del]");if(d&&rows.children.length>1)d.closest(".tcard").remove()});
  rows.addEventListener("change",function(e){var i=e.target;if(!(i.dataset.img&&i.files&&i.files[0]))return;var el=i.closest(".tcard");S.resizeImg(i.files[0],360,function(d){el.photo=d;el.querySelector("[data-prev]").innerHTML=prev(d)})});
  document.getElementById("add").onclick=function(){addCard({});rows.lastElementChild.scrollIntoView({block:"center"})};
  document.getElementById("sv").onclick=function(){
    var comm={},out=[].slice.call(rows.children).map(function(el){
      var n=el.querySelector('[data-k="n"]').value.trim();if(!n)return null;
      var id=el.dataset.id||"b"+S.uid(),c=Math.min(100,Math.max(0,S.num(el.querySelector('[data-k="c"]').value)));comm[id]=c;
      var b={id:id,name:n,nick:el.querySelector('[data-k="k"]').value.trim(),photo:el.photo||""};if(el.hours)b.hours=el.hours;return b}).filter(Boolean);
    if(!out.length)return fail("Cadastre ao menos um barbeiro.");
    busy();s.barbers=out;
    S.persist().then(function(ok){
      if(!ok){document.getElementById("sv").disabled=false;return}
      return Promise.all(out.map(function(b){return DB.saveCommission(b.id,comm[b.id])})).then(function(r){
        if(r.every(Boolean)){S.toast("Equipe salva");location.hash="ajustes"}else{S.toast("Equipe salva, mas a comissão não foi gravada. Tente de novo.");document.getElementById("sv").disabled=false}
      });
    });
  };
}

/* ---------- perfil ---------- */
function viewProfile(){
  var s=st.shop,lg=s.logo||"",cv=s.cover||"";
  var h='<div class="field"><span class="label">Logo</span><div class="t-top"><div class="imgp round" id="lp"></div><label class="up">Trocar logo<input id="lgf" type="file" accept="image/*"></label></div></div>'+
    '<div class="field"><span class="label">Foto de capa da tela inicial</span><div class="imgp wide" id="cvp"></div><div class="btnrow"><label class="up">Trocar capa<input id="cvf" type="file" accept="image/*"></label><button type="button" class="btn quiet small" id="cvx">Remover capa</button></div></div>'+
    '<div class="field"><label for="f-name">Nome da barbearia</label><input id="f-name" class="input" value="'+esc(s.name)+'"></div>'+
    '<div class="field"><label for="f-tag">Frase de apresentação</label><input id="f-tag" class="input" value="'+esc(s.tagline||"")+'"></div>'+
    '<div class="field"><label for="f-city">Cidade</label><input id="f-city" class="input" value="'+esc(s.city||"")+'"></div>'+
    '<div class="field"><label for="f-addr">Endereço</label><input id="f-addr" class="input" value="'+esc(s.address||"")+'"></div>'+
    '<div class="row"><div class="field"><label for="f-wa">WhatsApp</label><input id="f-wa" class="input" type="tel" inputmode="tel" value="'+esc(s.whatsapp||"")+'"></div><div class="field"><label for="f-ig">Instagram</label><input id="f-ig" class="input" value="'+esc(s.instagram||"")+'"></div></div>'+
    '<div class="field"><label for="f-pn">Aviso sobre preços (opcional)</label><input id="f-pn" class="input" value="'+esc(s.priceNote||"")+'"></div>';
  sub("Perfil e logo","",h,"Salvar perfil");
  var g=function(i){return document.getElementById(i)};
  function pl(){g("lp").innerHTML=prev(lg)}function pc(){g("cvp").innerHTML=prev(cv)}pl();pc();
  g("lgf").onchange=function(e){var f=e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){var im=new Image();im.onload=function(){
    var c=document.createElement("canvas"),sz=320;c.width=c.height=sz;var x=c.getContext("2d"),r=Math.min(im.width,im.height);x.drawImage(im,(im.width-r)/2,(im.height-r)/2,r,r,0,0,sz,sz);
    S.putImg(c.toDataURL("image/png"),function(u){lg=u;pl()})};im.onerror=function(){S.toast("Não foi possível ler essa imagem")};im.src=rd.result};rd.readAsDataURL(f)};
  g("cvf").onchange=function(e){var f=e.target.files[0];if(f)S.resizeImg(f,1200,function(d){cv=d;pc()})};
  g("cvx").onclick=function(){cv="";pc()};
  g("sv").onclick=function(){
    var name=g("f-name").value.trim();if(!name)return fail("Informe o nome da barbearia.");
    busy();s.name=name;s.tagline=g("f-tag").value.trim();s.city=g("f-city").value.trim();s.address=g("f-addr").value.trim();s.whatsapp=g("f-wa").value.trim();s.instagram=g("f-ig").value.trim();s.priceNote=g("f-pn").value.trim();s.logo=lg;s.cover=cv;saved("Perfil salvo");
  };
}

/* ---------- novidades, produtos e cursos ---------- */
var CFG={
  produtos:{key:"products",title:"Produtos",lead:"Foto, preço e descrição. O cliente pede pelo WhatsApp da barbearia.",add:"Adicionar produto",pk:"name",
    fields:[["name","Nome","t"],["price","Preço (R$)","n"],["desc","Descrição curta","t"],["img","Foto","i"],["on","Disponível para pedido","c"]]},
  cursos:{key:"courses",title:"Curso e vídeo",lead:"O primeiro curso com link de vídeo aparece em destaque na tela inicial. O vídeo abre em outra aba (YouTube, Instagram e outros).",add:"Adicionar curso",pk:"name",
    fields:[["name","Nome do curso","t"],["price","Valor (R$, opcional)","n"],["info","Data e carga horária","t"],["desc","Descrição","a"],["video","Link do vídeo (YouTube, Vimeo ou .mp4)","u"],["img","Capa do vídeo (opcional)","i"]]},
  novidades:{key:"news",title:"Novidades",lead:"Avisos e promoções da tela inicial. As 3 mais recentes ficam visíveis.",add:"Adicionar novidade",pk:"title",
    fields:[["title","Título","t"],["text","Texto","a"],["img","Imagem (opcional)","i"]]}
};
function viewList(kind){
  var s=st.shop,c=CFG[kind];
  function card(it){
    var h='<div class="tcard" data-id="'+esc(it.id||"")+'" data-date="'+esc(it.date||"")+'">';
    c.fields.forEach(function(f){
      var k=f[0],l=f[1],t=f[2],v=it[k],id=S.uid()+k;
      if(t==="i")h+='<div class="field"><span class="label">'+l+'</span><div class="t-top"><div class="imgp" data-prev="'+k+'">'+prev(v)+'</div><label class="up">Escolher foto<input type="file" accept="image/*" data-img="'+k+'"></label></div></div>';
      else if(t==="c")h+='<label class="chk"><input type="checkbox" data-k="'+k+'" '+(v!==false?"checked":"")+'><span>'+l+'</span></label>';
      else if(t==="a")h+='<div class="field"><label for="'+id+'">'+l+'</label><textarea id="'+id+'" class="input" rows="3" data-k="'+k+'">'+esc(v||"")+'</textarea></div>';
      else h+='<div class="field"><label for="'+id+'">'+l+'</label><input id="'+id+'" class="input" data-k="'+k+'" '+(t==="n"?'inputmode="decimal"':(t==="u"?'inputmode="url" placeholder="https://"':""))+' value="'+esc(t==="n"?(v?String(v).replace(".",","):""):(v||""))+'"></div>';
    });
    return h+'<button type="button" class="btn quiet danger" data-del="1">'+ic("trash",18)+'<span>Remover</span></button></div>';
  }
  sub(c.title,c.lead,'<div id="rows" class="stack"></div><button type="button" class="btn ghost" id="add">'+ic("plus",18)+'<span>'+c.add+'</span></button>',"Salvar");
  var rows=document.getElementById("rows");
  function addCard(it){rows.insertAdjacentHTML("beforeend",card(it));var el=rows.lastElementChild;el.imgs={};c.fields.forEach(function(f){if(f[2]==="i")el.imgs[f[0]]=it[f[0]]||""})}
  (s[c.key]||[]).forEach(addCard);
  rows.addEventListener("click",function(e){var d=e.target.closest("[data-del]");if(d)d.closest(".tcard").remove()});
  rows.addEventListener("change",function(e){var i=e.target;if(!(i.dataset.img&&i.files&&i.files[0]))return;var el=i.closest(".tcard"),k=i.dataset.img;S.resizeImg(i.files[0],720,function(d){el.imgs[k]=d;el.querySelector('[data-prev="'+k+'"]').innerHTML=prev(d)})});
  document.getElementById("add").onclick=function(){addCard(kind==="produtos"?{on:true}:{});rows.lastElementChild.scrollIntoView({block:"center"})};
  document.getElementById("sv").onclick=function(){
    var out=[];
    [].slice.call(rows.children).forEach(function(el){
      var it={id:el.dataset.id||S.uid(),date:el.dataset.date||S.today()};
      c.fields.forEach(function(f){var k=f[0],t=f[2],inp=el.querySelector('[data-k="'+k+'"]');
        if(t==="i")it[k]=el.imgs[k]||"";else if(t==="c")it[k]=inp.checked;else if(t==="n")it[k]=S.num(inp.value);else it[k]=inp.value.trim()});
      if(it[c.pk])out.push(it);
    });
    var bad=out.filter(function(x){return x.video&&!S.isUrl(x.video)})[0];
    if(bad)return fail("O link do vídeo precisa começar com http:// ou https://.");
    busy();s[c.key]=out;saved("Salvo");
  };
}

/* ---------- clientes ---------- */
function clients(){
  var map={};
  st.bk.forEach(function(b){
    if(b.status==="bloqueio"||b.status==="cancelado")return;
    var k=S.clientKey(b),c=map[k]=map[k]||{key:k,name:b.name,phone:b.phone,visits:0,miss:0,spent:0,last:"",next:"",list:[]};
    c.list.push(b);if(b.name)c.name=b.name;if(b.phone)c.phone=b.phone;
    if(b.status==="concluido"){c.visits++;c.spent+=O.amount(b);if(b.date>c.last)c.last=b.date}
    if(b.status==="faltou")c.miss++;
    if(b.status==="confirmado"&&b.date>=S.today()&&(!c.next||b.date<c.next))c.next=b.date;
  });
  return Object.keys(map).map(function(k){return map[k]}).sort(function(a,b){return (b.last||b.next||"")<(a.last||a.next||"")?-1:1});
}
function viewClients(){
  var all=clients();
  sub("Clientes","",'<div class="field"><label for="q" class="sr">Buscar cliente</label><input id="q" class="input" type="search" placeholder="Buscar por nome ou telefone"></div><div id="cl"></div>');
  function paint(q){
    q=(q||"").toLowerCase().trim();var d=S.digits(q);
    var l=all.filter(function(c){return !q||c.name.toLowerCase().indexOf(q)>=0||(d&&S.digits(c.phone).indexOf(d)>=0)});
    document.getElementById("cl").innerHTML=l.length?'<div class="clist">'+l.slice(0,80).map(function(c){return '<button class="crow" data-k="'+esc(c.key)+'"><span class="av">'+esc((c.name||"?").charAt(0).toUpperCase())+'</span><span class="tl-b"><b>'+esc(c.name||"Sem nome")+'</b><i>'+c.visits+(c.visits===1?" visita":" visitas")+(c.last?" · última "+S.fmtShort(c.last):"")+(c.next?" · volta "+S.fmtShort(c.next):"")+'</i></span><em>'+money(c.spent)+'</em></button>'}).join("")+'</div>':'<p class="empty">'+(all.length?"Ninguém encontrado.":"Os clientes aparecem aqui conforme agendam.")+'</p>';
  }
  paint("");
  document.getElementById("q").oninput=function(e){paint(e.target.value)};
  document.getElementById("cl").onclick=function(e){
    var r=e.target.closest(".crow");if(!r)return;var c=all.filter(function(x){return x.key===r.dataset.k})[0];if(!c)return;
    var w=S.waLink(c.phone,"Olá, "+O.first(c.name)+"! Tudo bem? Aqui é do "+st.shop.name+".");
    S.sheet(c.name||"Cliente",'<p class="muted">'+esc(c.phone||"Sem telefone")+'</p><dl class="kpis small"><div><b>'+c.visits+'</b><i>Visitas</i></div><div><b>'+money(c.spent)+'</b><i>Gasto total</i></div><div><b>'+(c.visits?money(c.spent/c.visits):"-")+'</b><i>Ticket médio</i></div><div><b>'+c.miss+'</b><i>Faltas</i></div></dl>'+(w?'<a class="btn" target="_blank" rel="noopener" href="'+esc(w)+'">'+ic("chat",18)+'<span>Chamar no WhatsApp</span></a>':"")+
      '<section class="sgroup"><h2>Histórico</h2><dl class="rows">'+c.list.slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,12).map(function(b){return '<div><dt>'+esc(S.fmtShort(b.date)+" · "+O.svcText(b))+'<i>'+esc(S.barberName(b.barber)+" · "+({confirmado:"Confirmado",concluido:"Concluído",faltou:"Faltou"}[b.status]||b.status))+'</i></dt><dd>'+money(O.amount(b))+'</dd></div>'}).join("")+'</dl></section>');
  };
}

/* ---------- link ---------- */
function viewLink(){
  var base=location.href.split("#")[0],s=st.shop;
  function box(t,u){return '<div class="linkbox"><b>'+t+'</b><code>'+esc(u)+'</code><button class="btn ghost small" data-c="'+esc(u)+'">'+ic("copy",16)+'<span>Copiar</span></button></div>'}
  var msg="Agende seu horário no "+s.name+": "+base+"#agendar";
  var h=box("Site completo",base)+box("Direto para agendar",base+"#agendar")+s.barbers.map(function(b){return box("Agenda de "+b.name,base+"#agendar-"+b.id)}).join("")+
    (S.waLink("",msg)||'<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(msg)+'">'+ic("chat",18)+'<span>Enviar o link pelo WhatsApp</span></a>')+
    '<p class="note">Coloque o link "Direto para agendar" na bio do Instagram. Cada cliente recebe, ao marcar, um link próprio para cancelar ou remarcar.</p>'+(S.REMOTE?"":'<p class="note">Modo de teste: os dados ficam só neste navegador. Configure o Supabase (veja o README) para valer de verdade.</p>');
  sub("Link para clientes","",h);
  document.querySelector(".o-main").onclick=function(e){var b=e.target.closest("[data-c]");if(!b)return;(navigator.clipboard?navigator.clipboard.writeText(b.dataset.c):Promise.reject()).then(function(){S.toast("Link copiado")},function(){S.toast("Não foi possível copiar")})};
}

S.settings=function(page){
  if(!page)index();
  else if(page==="horarios")viewHours();
  else if(page==="folgas")viewOff();
  else if(page==="regras")viewRules();
  else if(page==="servicos")viewServices();
  else if(page==="equipe")viewTeam();
  else if(page==="perfil")viewProfile();
  else if(CFG[page])viewList(page);
  else if(page==="clientes")viewClients();
  else if(page==="link")viewLink();
  else index();
};
})();
