/* Menu lateral (MODS), tema, login e inicialização — carregado por último */
/* ---------- Menu lateral: para novos módulos, adicione um item em MODS e um <main data-view="id"> ---------- */
const MODS=[{id:'fundo',nome:'Fundo de Reserva',ic:'💰'},{id:'reidi',nome:'REIDI',ic:'🏗️'},{id:'fluxo',nome:'Fluxo de Caixa',ic:'📊'},{id:'boletim',nome:'Boletim de Caixa',ic:'🧾'},{id:'usuarios',nome:'Usuários',ic:'👥',adm:true}]; // adm:true → só administrador
function sb(o){$('#sb').classList.toggle('-translate-x-full',!o);$('#bd').classList.toggle('hidden',!o)}
function go(id){if((MODS.find(m=>m.id==id)||{}).adm&&ROLE!='admin')id='fundo';document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('hidden',v.dataset.view!=id));
 $('#nav').innerHTML=MODS.filter(m=>!m.adm||ROLE=='admin').map(m=>`<button onclick="go('${m.id}')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left ${m.id==id?'bg-indigo-600 text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}"><span>${m.ic}</span>${m.nome}</button>`).join('');
 $('#pt2').textContent=(MODS.find(m=>m.id==id)||{}).nome||'';if(id=='usuarios')uRender();sb(0)}
/* ---------- Tema e login ---------- */
function setTheme(dk){document.documentElement.classList.toggle('dark',dk);try{localStorage.th=dk?1:0}catch(e){}
 Chart.defaults.color=dk?'#94a3b8':'#475569';Chart.defaults.borderColor=dk?'#1e293b':'#e2e8f0';if(D.length&&!$('#app').classList.contains('hidden'))render()}
function start(p){EU=p;ME=p.l;ROLE=p.r;document.body.classList.toggle('viewer',ROLE!='admin');$('#who').textContent=p.l+' ('+(ROLE=='admin'?'administrador':'visualizador')+')';
 closeMd();$('#lg').classList.add('hidden');$('#app').classList.remove('hidden');go('fundo');idle();if(!D.length)seed();else render()}
let UREADY;async function login(){await UREADY;const l=$('#u').value.trim().toLowerCase(),pw=$('#pw').value,e=$('#err'),b=$('#lgb'),bad=t=>{e.textContent=t;e.classList.remove('hidden')};
 if(SUPABASE_URL.includes('SEU-PROJETO'))return bad('Configure js/core/config.js com a URL e a chave do Supabase.');
 if(!LRX.test(l)||!pw)return bad('Usuário ou senha inválidos.');
 b.disabled=true;
 try{const p=await uSignIn(l,pw);e.classList.add('hidden');EU=p;ME=p.l;uLog('login');if(p.mc)pwModal(1);else start(p)}
 catch(x){bad(x.message)}
 b.disabled=false}
let _t;function idle(){clearTimeout(_t);_t=setTimeout(async()=>{await SB.rpc('log_evento',{e:'sessão expirada'}).then(()=>{},()=>{});logout()},IDLE)}
['click','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{if(!$('#app').classList.contains('hidden'))idle()},{passive:true}));
async function logout(){try{await SB.auth.signOut()}catch(e){}location.reload()}
function seed(){setData([norm({d:'2026-09-30',ded:4864267,base:7296400.52,aliq:.05,iss:364820.03,inss:468185.69,bruto:12160667.52,ret:833005.72,liq:11327661.8,adi:2432183.5})])}
let dk=true;try{dk=localStorage.th!=='0'}catch(e){}setTheme(dk);
UREADY=uBoot();
