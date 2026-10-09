/* Menu lateral (MODS), tema, login e inicialização — carregado por último */
/* ---------- Menu lateral: para novos módulos, adicione um item em MODS e um <main data-view="id"> ---------- */
const MODS=[{id:'fundo',nome:'Fundo de Reserva',ic:'💰'},{id:'reidi',nome:'REIDI',ic:'🏗️',roles:['admin','viewer','lancador']},{id:'lanc',nome:'Projeção REIDI',ic:'📝',roles:['admin','lancador']},{id:'fluxo',nome:'Programação Financeira Quadrimestral',ic:'📊'},{id:'dash',nome:'Dashboard',ic:'📈'},{id:'usuarios',nome:'Usuários',ic:'👥',adm:true}]; // adm:true → só administrador · roles:[...] → só esses perfis · sem roles: admin e visualizador (o Lançador REIDI só enxerga "Projeção REIDI")
const vis=m=>m.roles?m.roles.includes(ROLE):(ROLE!='lancador'&&(!m.adm||ROLE=='admin')),HOME=()=>ROLE=='lancador'?'lanc':'fundo',PAPEL={admin:'administrador',viewer:'visualizador',lancador:'lançador REIDI'};
function sb(o){$('#sb').classList.toggle('-translate-x-full',!o);$('#bd').classList.toggle('hidden',!o)}
function go(id){const m0=MODS.find(m=>m.id==id);if(m0&&!vis(m0)||!m0)id=HOME();document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('hidden',v.dataset.view!=id));
 $('#nav').innerHTML=MODS.filter(vis).map(m=>`<button onclick="go('${m.id}')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left ${m.id==id?'bg-indigo-600 text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}"><span>${m.ic}</span>${m.nome}</button>`).join('');
 $('#pt2').textContent=(MODS.find(m=>m.id==id)||{}).nome||'';if(id=='usuarios')uRender();if(id=='dash'&&window.dash)dash.show();if(id=='reidi'&&window.reidi)reidi.show();if(id=='lanc'&&window.lanc)lanc.show();if(id=='fluxo'&&window.fluxo)fluxo.show();if(id=='fundo'&&D.length)fundoNuvem();sb(0)}
/* ---------- Tema e login ---------- */
function setTheme(dk){document.documentElement.classList.toggle('dark',dk);try{localStorage.th=dk?1:0}catch(e){}
 Chart.defaults.color=dk?'#94a3b8':'#475569';Chart.defaults.borderColor=dk?'#1e293b':'#e2e8f0';if(D.length&&!$('#app').classList.contains('hidden'))render()}
function showLogin(t){$('#app').classList.add('hidden');$('#lg').classList.remove('hidden');if(t){const e=$('#err');e.textContent=t;e.classList.remove('hidden')}}
function start(){$('#who').textContent=ME+' ('+(PAPEL[ROLE]||'visualizador')+')';document.body.classList.toggle('viewer',ROLE!='admin');
 $('#lg').classList.add('hidden');$('#app').classList.remove('hidden');go(HOME());idle();if(ROLE!='lancador')fundoNuvem().then(ok=>{if(!ok){if(!D.length)seed();else render()}})}
/* Carrega o perfil (public.perfis) da sessão atual; só entra quem existe e está ativo */
async function enter(uid){const{data:{session}}=await sb_.auth.getSession();if(!session)return showLogin();
 const r=await sb_.from('perfis').select('*').eq('id',uid||session.user.id).maybeSingle(),p=r.data;
 if(r.error||!p||!p.ativo){await sb_.auth.signOut();return showLogin(r.error?'Falha ao carregar o perfil.':!p?'Usuário sem perfil. Fale com o administrador.':'Usuário desativado. Fale com o administrador.')}
 PF={...p,email:session.user.email};ME=p.login;ROLE=p.papel;
 if(p.mc){$('#lg').classList.add('hidden');$('#app').classList.remove('hidden');pwModal(1);return}
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
async function logout(){try{if(PF)await uLog('logout');await sb_.auth.signOut()}catch(e){}location.reload()}
function seed(){setData([norm({d:'2026-09-30',ded:4864267,base:7296400.52,aliq:.05,iss:364820.03,inss:468185.69,bruto:12160667.52,ret:833005.72,liq:11327661.8,adi:2432183.5})])}
let dk=true;try{dk=localStorage.th!=='0'}catch(e){}setTheme(dk);
if(SB_OK){sb_.auth.onAuthStateChange(ev=>{if(ev=='SIGNED_OUT'&&PF){PF=null;showLogin('Sessão encerrada.')}});enter()}else showLogin('Supabase não configurado: informe a chave pública em js/core/config.js.');
