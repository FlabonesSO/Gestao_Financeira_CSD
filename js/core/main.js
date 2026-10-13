/* Menu lateral (MODS), rotas protegidas, tema, login e inicialização — carregado por último */
/* ---------- Menu lateral: para novos módulos, adicione um item em MODS e um <main data-view="id"> ----------
   perm → permissão (js/core/permissoes.js) que libera o módulo · adm:true → só administrador.
   O menu só mostra o que o usuário pode abrir, e a ROTA é protegida do mesmo jeito: go('id') e o endereço #/id de um módulo sem permissão abrem a tela
   "Acesso negado" e não carregam nada dele. Os DADOS são protegidos no banco (RLS, supabase/permissoes.sql): esconder o menu nunca é a única proteção. */
const MODS=[{id:'fundo',nome:'Fundo de Reserva',ic:'💰',perm:'fundo.ver'},{id:'fat',nome:'Faturas Emitidas',ic:'🧾',perm:'fat.ver'},{id:'receber',nome:'Contas a Receber',ic:'💵',perm:'receber.ver'},{id:'reidi',nome:'REIDI',ic:'🏗️',perm:'reidi.ver'},{id:'lanc',nome:'Projeção REIDI',ic:'📝',perm:'lanc.lancar'},{id:'fluxo',nome:'Programação Financeira Quadrimestral',ic:'📊',perm:'fluxo.ver'},{id:'dash',nome:'Dashboard Financeiro',ic:'📈',perm:'dash.ver'},{id:'usuarios',nome:'Usuários',ic:'👥',adm:true}];
const vis=m=>!!m&&(m.adm?ROLE=='admin':PERM.tem(m.perm)),
 HOME_ORDEM=['fundo','fat','receber','lanc','reidi','fluxo','dash','usuarios'], // primeira tela: o primeiro módulo desta lista que o usuário pode abrir
 HOME=()=>HOME_ORDEM.find(i=>vis(MODS.find(m=>m.id==i)))||null,
 PAPEL={admin:'administrador',viewer:'visualizador',lancador:'lançador REIDI',faturamento:'faturamento'};
function sb(o){$('#sb').classList.toggle('-translate-x-full',!o);$('#bd').classList.toggle('hidden',!o)}
let ATUAL='',NEG={};
const navHtml=id=>MODS.filter(vis).map(m=>`<button onclick="go('${m.id}')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left ${m.id==id?'bg-indigo-600 text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}"><span>${m.ic}</span>${m.nome}</button>`).join(''),
 mostra=v=>document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('hidden',e.dataset.view!=v)),
 rotaDe=()=>{const m=/^#\/?([a-z0-9_-]+)\/?$/i.exec(location.hash||'');return m?m[1].toLowerCase():''};
/* acesso bloqueado: mostra o aviso e NÃO executa nada do módulo (nenhum dado é pedido). A tentativa vai para a Auditoria (uma vez por módulo e sessão) */
function negado(m){ATUAL=m?m.id:'';mostra('negado');$('#nav').innerHTML=navHtml('');$('#pt2').textContent=m?'Acesso negado':'Sem acesso';
 $('#neg-t').textContent=m?'Acesso negado':'Sem acesso a nenhum relatório';
 $('#neg-x').textContent=m?'Você não tem permissão para acessar “'+m.nome+'”. Se precisar desse acesso, peça ao administrador do sistema.':'Seu usuário ainda não tem acesso a nenhum relatório. Peça ao administrador do sistema para liberar.';
 $('#neg-b').classList.toggle('hidden',!HOME());
 if(m&&!NEG[m.id]){NEG[m.id]=1;uLog('acesso negado: '+m.nome)}sb(0)}
/* o = {hash:1 → veio do endereço (não grava no histórico) · rep:1 → substitui a entrada do histórico · sem:1 → não reconsulta as permissões} */
function go(id,o){o=o||{};const m0=MODS.find(m=>m.id==id);
 if(!m0){id=HOME();return id?go(id,o):negado(null)} // endereço desconhecido → tela inicial
 if(!vis(m0))return negado(m0);
 ATUAL=id;mostra(id);$('#nav').innerHTML=navHtml(id);
 try{if(!o.hash&&location.hash!='#/'+id)history[o.rep?'replaceState':'pushState'](null,'','#/'+id)}catch(e){}
 $('#pt2').textContent=m0.nome;if(id=='usuarios')uRender();if(id=='dash'&&window.dash)dash.show();if(id=='reidi'&&window.reidi)reidi.show();if(id=='lanc'&&window.lanc)lanc.show();if(id=='fat'&&window.fat)fat.show();if(id=='receber'&&window.receber)receber.show();if(id=='fluxo'&&window.fluxo)fluxo.show();if(id=='fundo'&&D.length){fundoNuvem();if(PERM.tem('fat.ver'))fNFcarrega()}sb(0);if(!o.sem)refreshPerm()}
addEventListener('hashchange',()=>{if(!PF||$('#app').classList.contains('hidden'))return;const id=rotaDe();if(id&&id!=ATUAL)go(id,{hash:1})});
/* ---------- Permissões em dia: se o administrador mudar o acesso de quem está logado, o menu e a tela acompanham (o banco já vale na hora) ---------- */
let _pt=0,_pb=false,_gt;
function aviso(t,erro){const e=$('#gt');e.textContent=t;e.className='fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg '+(erro?'bg-rose-600 text-white':'bg-indigo-600 text-white');clearTimeout(_gt);_gt=setTimeout(()=>e.classList.add('hidden'),8000)}
async function refreshPerm(force){if(!PF||_pb||!sb_)return;const t=Date.now();if(!force&&t-_pt<20000)return;_pt=t;_pb=true;
 try{const r=await sb_.from('perfis').select('*').eq('id',PF.id).maybeSingle();if(r.error||!PF)return; // sem rede ou erro temporário: mantém a tela (o banco continua bloqueando)
  const p=r.data;
  if(!p||!p.ativo){await sb_.auth.signOut();return showLogin(!p?'Usuário sem perfil. Fale com o administrador.':'Usuário desativado. Fale com o administrador.')}
  const mudou=JSON.stringify([p.papel,p.permissoes])!=JSON.stringify([PF.papel,PF.permissoes]);
  PF={...p,email:PF.email};ME=p.login;ROLE=p.papel;
  if(mudou){PERM.carregar(p);document.body.classList.toggle('viewer',ROLE!='admin');$('#who').textContent=ME+' ('+(PAPEL[ROLE]||'visualizador')+')';
   aviso('Suas permissões foram atualizadas pelo administrador.');
   const m=MODS.find(x=>x.id==ATUAL),neg=!$('[data-view=negado]').classList.contains('hidden');
   if(m&&!vis(m))negado(m);else if(m&&neg)go(ATUAL,{hash:1,sem:1});else if(!ATUAL&&HOME())go(HOME(),{rep:1,sem:1});else $('#nav').innerHTML=navHtml(ATUAL)}}
 catch(e){}finally{_pb=false}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPerm()});addEventListener('focus',()=>refreshPerm());
/* ---------- Tema e login ---------- */
function setTheme(dk){document.documentElement.classList.toggle('dark',dk);try{localStorage.th=dk?1:0}catch(e){}
 Chart.defaults.color=dk?'#94a3b8':'#475569';Chart.defaults.borderColor=dk?'#1e293b':'#e2e8f0';if(D.length&&!$('#app').classList.contains('hidden'))render()}
function showLogin(t){$('#app').classList.add('hidden');$('#lg').classList.remove('hidden');if(t){const e=$('#err');e.textContent=t;e.classList.remove('hidden')}}
function start(){$('#who').textContent=ME+' ('+(PAPEL[ROLE]||'visualizador')+')';document.body.classList.toggle('viewer',ROLE!='admin');
 $('#lg').classList.add('hidden');$('#app').classList.remove('hidden');_pt=Date.now();
 const r=rotaDe(),i=MODS.some(m=>m.id==r)?r:HOME(); // endereço direto (#/id) vale; sem permissão, cai na tela "Acesso negado"
 go(i||'',{hash:i==r&&!!r,rep:1,sem:1});idle();
 if(PERM.tem('fundo.ver')){if(PERM.tem('fat.ver'))fNFcarrega();fundoNuvem().then(ok=>{if(!ok){if(!D.length)seed();else render()}})}}
/* Carrega o perfil (public.perfis) da sessão atual; só entra quem existe e está ativo */
async function enter(uid){const{data:{session}}=await sb_.auth.getSession();if(!session)return showLogin();
 const r=await sb_.from('perfis').select('*').eq('id',uid||session.user.id).maybeSingle(),p=r.data;
 if(r.error||!p||!p.ativo){await sb_.auth.signOut();return showLogin(r.error?'Falha ao carregar o perfil.':!p?'Usuário sem perfil. Fale com o administrador.':'Usuário desativado. Fale com o administrador.')}
 PF={...p,email:session.user.email};ME=p.login;ROLE=p.papel;PERM.carregar(p);NEG={};
 if(p.mc){$('#lg').classList.add('hidden');$('#app').classList.remove('hidden');mostra('');pwModal(1);return}
 start()}
let FAIL={n:0,until:0};
async function login(){const l=$('#u').value.trim().toLowerCase(),e=$('#err'),now=Date.now(),bad=t=>{e.textContent=t;e.classList.remove('hidden')};
 if(!SB_OK)return bad('Supabase não configurado: informe a chave pública em js/core/config.js.');
 if(FAIL.until>now)return bad('Muitas tentativas. Aguarde '+Math.ceil((FAIL.until-now)/1000)+'s.');
 if(!l||!$('#pw').value)return bad('Informe usuário e senha.');
 const r=await sb_.auth.signInWithPassword({email:emailDe(l),password:$('#pw').value});$('#pw').value='';
 if(r.error){FAIL.n++;if(FAIL.n>=5){FAIL={n:0,until:now+60000};return bad('Muitas tentativas. Aguarde 60 s.')}return bad(r.error.status==429?'Muitas tentativas. Tente mais tarde.':'Usuário ou senha inválidos.')}
 FAIL={n:0,until:0};e.classList.add('hidden');await enter(r.data.user.id);if(PF)uLog('login')}
let _t;function idle(){clearTimeout(_t);_t=setTimeout(()=>{uLog('sessão expirada');logout()},IDLE)}
['click','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{if(!$('#app').classList.contains('hidden'))idle()},{passive:true}));
async function logout(){try{if(PF)await uLog('logout');await sb_.auth.signOut()}catch(e){}try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}location.reload()}
function seed(){setData([norm({d:'2026-09-30',ded:4864267,base:7296400.52,aliq:.05,iss:364820.03,inss:468185.69,bruto:12160667.52,ret:833005.72,liq:11327661.8,adi:2432183.5})])}
let dk=true;try{dk=localStorage.th!=='0'}catch(e){}setTheme(dk);
if(SB_OK){sb_.auth.onAuthStateChange(ev=>{if(ev=='SIGNED_OUT'&&PF){PF=null;PERM.carregar(null);showLogin('Sessão encerrada.')}});enter()}else showLogin('Supabase não configurado: informe a chave pública em js/core/config.js.');
