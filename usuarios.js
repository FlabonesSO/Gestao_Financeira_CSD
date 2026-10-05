/* Usuários e autenticação — Supabase (Auth + tabela "perfis" + Edge Function "admin-usuarios").
   Senhas ficam só no servidor (bcrypt). O navegador nunca vê hash. Criar/redefinir/ativar/excluir passam pela Edge Function. */
const IDLE=30*60e3,LRX=/^[a-z0-9._-]{3,30}$/,
 esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pwOk=p=>p.length>=8&&/[a-zA-Z]/.test(p)&&/\d/.test(p),PWMSG='A senha deve ter ao menos 8 caracteres, com letras e números.',
 SB=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true}}), // sessão por aba, como antes
 toEmail=l=>l+'@'+EMAIL_DOMAIN,
 mapP=r=>({id:r.id,l:r.login,n:r.nome,r:r.papel,a:r.ativo?1:0,mc:r.mc?1:0});
let US=[],ME='',AUD=[],EU=null,LOADERR='';
function uLog(e){SB.rpc('log_evento',{e}).then(()=>{},()=>{})}
async function uPerfil(id){const{data,error}=await SB.from('perfis').select('*').eq('id',id).maybeSingle();return error||!data?null:mapP(data)}
async function uSignIn(l,pw){const{data,error}=await SB.auth.signInWithPassword({email:toEmail(l),password:pw});
 if(error)throw new Error(error.status==429?'Muitas tentativas. Aguarde alguns minutos.':/banned/i.test(error.message)?'Usuário desativado. Fale com o administrador.':'Usuário ou senha inválidos.');
 const p=await uPerfil(data.user.id);
 if(!p){await SB.auth.signOut();throw new Error('Perfil não encontrado. Fale com o administrador.')}
 if(!p.a){await SB.auth.signOut();throw new Error('Usuário desativado. Fale com o administrador.')}
 return p}
async function uAdm(a,p){const{data,error}=await SB.functions.invoke('admin-usuarios',{body:{a,...p}});
 if(error){let m='Falha na operação.';try{m=(await error.context.json()).error||m}catch(e){}throw new Error(m)}
 return data}
async function uLoad(){LOADERR='';if(!EU)return;if(EU.r!='admin'){US=[EU];AUD=[];return}
 const[a,b]=await Promise.all([SB.from('perfis').select('*').order('nome'),SB.from('auditoria').select('*').order('t',{ascending:false}).limit(15)]);
 if(a.error)LOADERR=a.error.message;US=(a.data||[]).map(mapP);AUD=(b.data||[]).map(x=>({t:x.t,u:x.usuario,e:x.evento}))}
/* Janelas internas (alert/confirm podem ser bloqueados pelo navegador) */
function mo(h){$('#mdb').innerHTML=h;$('#md').classList.remove('hidden')}
function closeMd(){$('#md').classList.add('hidden')}
let _yes=null;
function dlg(t,x,fn){_yes=fn;mo(`<h2 class="text-lg font-bold mb-2">${t}</h2><p class="text-sm text-slate-500 mb-4">${x}</p><div class="flex justify-end gap-2">${fn?'<button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="closeMd();_yes()">Confirmar</button>':'<button class="btn" onclick="closeMd()">OK</button>'}</div>`)}
const merr=m=>{const e=$('#me');e.textContent=m;e.classList.remove('hidden')},lbl=t=>`<label class="block text-sm mb-1">${t}</label>`;
async function uRender(){await uLoad();const sy=$('#usync');
 if(sy)sy.innerHTML=LOADERR?`<span class="text-rose-500">● Erro ao ler o banco: ${esc(LOADERR)}</span>`:'<span class="text-emerald-600 dark:text-emerald-400">● Conectado ao Supabase</span> — criações e trocas de senha valem em qualquer navegador, na hora.';
 const b='btn2 !py-1 !text-xs';
 $('#utb').innerHTML=US.map(u=>{const me=u.l==ME;
  return `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-2 font-medium">${esc(u.n)}${me?' <span class="text-xs text-slate-500">(você)</span>':''}</td><td class="px-3 py-2">${esc(u.l)}</td><td class="px-3 py-2">${u.r=='admin'?'Administrador':'Visualizador'}</td>
  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs ${u.a?'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400':'bg-slate-500/20 text-slate-500'}">${u.a?'Ativo':'Desativado'}</span>${u.mc?' <span class="text-xs text-amber-500">troca de senha pendente</span>':''}</td>
  <td class="px-3 py-2 text-right whitespace-nowrap space-x-1"><button class="${b}" onclick="uForm('${u.l}')">Editar</button><button class="${b}" onclick="uReset('${u.l}')">Redefinir senha</button>${me?'':`<button class="${b}" onclick="uToggle('${u.l}')">${u.a?'Desativar':'Ativar'}</button><button class="${b} !text-rose-500" onclick="uDel('${u.l}')">Excluir</button>`}</td></tr>`}).join('');
 const g=$('#ulog');if(g)g.innerHTML=AUD.map(x=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5 whitespace-nowrap">${new Date(x.t).toLocaleString('pt-BR')}</td><td class="px-3 py-1.5">${esc(x.u)}</td><td class="px-3 py-1.5">${esc(x.e)}</td></tr>`).join('')||'<tr><td class="px-3 py-2 text-slate-500" colspan="3">Sem registros.</td></tr>'}
function uForm(l){const u=US.find(x=>x.l==l),nw=!u,me=u&&u.l==ME;
 mo(`<h2 class="text-lg font-bold mb-4">${nw?'Novo usuário':'Editar usuário'}</h2>
 ${lbl('Nome')}<input id="uf-n" class="inp w-full mb-3" value="${esc(u?u.n:'')}">
 ${lbl('Usuário (login)')}<input id="uf-l" class="inp w-full mb-3" value="${esc(u?u.l:'')}" placeholder="ex.: maria.silva" ${nw?'':'disabled'}>
 ${lbl('Perfil')}<select id="uf-r" class="inp w-full mb-3" ${me?'disabled':''}><option value="viewer" ${u&&u.r=='viewer'?'selected':''}>Visualizador (só consulta e exporta)</option><option value="admin" ${u&&u.r=='admin'?'selected':''}>Administrador (tudo, inclusive usuários)</option></select>
 ${nw?`${lbl('Senha inicial (mín. 8, com letras e números)')}<input id="uf-p" class="inp w-full mb-3" autocomplete="off"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no primeiro acesso</label>`:''}
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="ufb" class="btn" onclick="uSaveForm('${nw?'':u.l}')">Salvar</button></div>`)}
async function uSaveForm(l0){const n=$('#uf-n').value.trim(),r=$('#uf-r').value;if(!n)return merr('Informe o nome.');
 let args,act;
 if(l0){const u=US.find(x=>x.l==l0);act='update';args={id:u.id,n,r}}
 else{const l=$('#uf-l').value.trim().toLowerCase(),pw=$('#uf-p').value;
  if(!LRX.test(l))return merr('Usuário: 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou _).');
  if(US.some(x=>x.l==l))return merr('Esse usuário já existe.');
  if(!pwOk(pw))return merr(PWMSG);
  act='create';args={l,n,r,pw,mc:$('#uf-m').checked}}
 $('#ufb').disabled=true;
 try{await uAdm(act,args);closeMd();uRender()}catch(e){merr(e.message);$('#ufb').disabled=false}}
function uReset(l){mo(`<h2 class="text-lg font-bold mb-1">Redefinir senha</h2><p class="text-sm text-slate-500 mb-4">Usuário: ${esc(l)}</p>
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="uf-p" class="inp w-full mb-3" autocomplete="off"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no próximo acesso</label>
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="uDoReset('${l}')">Salvar</button></div>`)}
async function uDoReset(l){const pw=$('#uf-p').value;if(!pwOk(pw))return merr(PWMSG);
 try{await uAdm('reset',{id:US.find(x=>x.l==l).id,pw,mc:$('#uf-m').checked&&l!=ME});closeMd();uRender()}catch(e){merr(e.message)}}
async function uToggle(l){const u=US.find(x=>x.l==l);if(!u||l==ME)return;
 try{await uAdm('toggle',{id:u.id})}catch(e){return dlg('Não permitido',esc(e.message))}uRender()}
function uDel(l){const u=US.find(x=>x.l==l);if(l==ME||!u)return;
 dlg('Excluir usuário','Excluir "'+esc(l)+'"? Esta ação não pode ser desfeita.',async()=>{try{await uAdm('delete',{id:u.id})}catch(e){return dlg('Não permitido',esc(e.message))}uRender()})}
function pwModal(forced){mo(`<h2 class="text-lg font-bold mb-1">${forced?'Defina uma nova senha':'Alterar minha senha'}</h2>${forced?'<p class="text-sm text-slate-500 mb-4">Por segurança, troque a senha provisória para continuar.</p>':'<p class="text-sm text-slate-500 mb-4">A nova senha vale em qualquer navegador.</p>'}
 ${forced?'':lbl('Senha atual')+'<input id="pw0" type="password" class="inp w-full mb-3" autocomplete="current-password">'}
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="pw1" type="password" class="inp w-full mb-3" autocomplete="new-password">${lbl('Repita a nova senha')}<input id="pw2" type="password" class="inp w-full mb-3" autocomplete="new-password">
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="${forced?'logout()':'closeMd()'}">${forced?'Sair':'Cancelar'}</button><button class="btn" onclick="pwSave(${forced?1:0})">Salvar</button></div>`)}
async function pwSave(forced){const a=$('#pw1').value;
 if(!pwOk(a))return merr(PWMSG);
 if(a!==$('#pw2').value)return merr('As senhas não conferem.');
 if(!forced){const o=$('#pw0').value;if(a===o)return merr('Escolha uma senha diferente da atual.');
  const{error}=await SB.auth.signInWithPassword({email:toEmail(ME),password:o});if(error)return merr('Senha atual incorreta.')}
 const{error}=await SB.auth.updateUser({password:a});
 if(error)return merr(/different/i.test(error.message)?'Escolha uma senha diferente da atual.':'Não foi possível alterar a senha: '+error.message);
 if(forced){await SB.rpc('limpar_mc');EU.mc=0}
 uLog('alterou a própria senha');closeMd();if(forced)start(EU);else dlg('Senha alterada','A nova senha já vale em qualquer navegador.')}
/* Retoma a sessão da aba (se existir e o usuário continuar ativo) */
async function uBoot(){try{const{data}=await SB.auth.getSession();if(!data.session)return;
 const p=await uPerfil(data.session.user.id);if(!p||!p.a){await SB.auth.signOut();return}
 EU=p;ME=p.l;if(!p.mc)start(p)}catch(e){}}
