/* Usuários — Supabase (Auth + public.perfis). O navegador só LÊ perfis; toda escrita passa pela Edge Function admin-usuarios */
const LRX=/^[a-z0-9._-]{3,30}$/,IDLE=30*60e3,PWMSG='A senha deve ter ao menos 8 caracteres, com letras e números.',
 esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pwOk=p=>typeof p=='string'&&p.length>=8&&/[a-zA-Z]/.test(p)&&/\d/.test(p),
 tr=m=>/different/i.test(m)?'Escolha uma senha diferente da atual.':/weak|at least/i.test(m)?PWMSG:m;
let US=[],AUD=[],ME='',PF=null;
const admins=()=>US.filter(x=>x.papel=='admin'&&x.ativo).length;
async function uLog(e){try{await sb_.rpc('log_evento',{e})}catch(x){}}
function mo(h){$('#mdb').innerHTML=h;$('#md').classList.remove('hidden')}
function closeMd(){$('#md').classList.add('hidden')}
let _yes=null;
function dlg(t,x,fn){_yes=fn;mo(`<h2 class="text-lg font-bold mb-2">${t}</h2><p class="text-sm text-slate-500 mb-4">${x}</p><div class="flex justify-end gap-2">${fn?'<button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="closeMd();_yes()">Confirmar</button>':'<button class="btn" onclick="closeMd()">OK</button>'}</div>`)}
const merr=m=>{const e=$('#me');e.textContent=m;e.classList.remove('hidden')},lbl=t=>`<label class="block text-sm mb-1">${t}</label>`;
async function uRender(){const er=$('#uerr');er.classList.add('hidden');
 try{const a=await sb_.from('perfis').select('*').order('criado_em');if(a.error)throw a.error;US=a.data||[];
  const g=await sb_.from('auditoria').select('*').order('t',{ascending:false}).limit(15);AUD=g.data||[]}
 catch(e){er.textContent='Não foi possível carregar os usuários: '+e.message;er.classList.remove('hidden');return}
 const b='btn2 !py-1 !text-xs';
 $('#utb').innerHTML=US.map(u=>{const me=PF&&u.id==PF.id,last=u.papel=='admin'&&u.ativo&&admins()<2,dis=last?'disabled title="É preciso manter ao menos um administrador ativo" style="opacity:.4"':'';
  return `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-2 font-medium">${esc(u.nome)}${me?' <span class="text-xs text-slate-500">(você)</span>':''}</td><td class="px-3 py-2">${esc(u.login)}</td><td class="px-3 py-2">${u.papel=='admin'?'Administrador':'Visualizador'}</td>
  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs ${u.ativo?'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400':'bg-slate-500/20 text-slate-500'}">${u.ativo?'Ativo':'Desativado'}</span>${u.mc?' <span class="text-xs text-amber-500">troca de senha pendente</span>':''}</td>
  <td class="px-3 py-2 text-right whitespace-nowrap space-x-1"><button class="${b}" onclick="uForm('${u.id}')">Editar</button><button class="${b}" onclick="uReset('${u.id}')">Redefinir senha</button>${me?'':`<button class="${b}" ${dis} onclick="uToggle('${u.id}')">${u.ativo?'Desativar':'Ativar'}</button><button class="${b} !text-rose-500" ${dis} onclick="uDel('${u.id}')">Excluir</button>`}</td></tr>`}).join('');
 $('#ulog').innerHTML=AUD.map(x=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5 whitespace-nowrap">${new Date(x.t).toLocaleString('pt-BR')}</td><td class="px-3 py-1.5">${esc(x.usuario)}</td><td class="px-3 py-1.5">${esc(x.evento)}</td></tr>`).join('')||'<tr><td class="px-3 py-2 text-slate-500" colspan="3">Sem registros.</td></tr>'}
function uForm(id){const u=US.find(x=>x.id==id),nw=!u,me=u&&PF&&u.id==PF.id;
 mo(`<h2 class="text-lg font-bold mb-4">${nw?'Novo usuário':'Editar usuário'}</h2>
 ${lbl('Nome')}<input id="uf-n" class="inp w-full mb-3" value="${esc(u?u.nome:'')}">
 ${lbl('Usuário (login)')}<input id="uf-l" class="inp w-full mb-3" value="${esc(u?u.login:'')}" placeholder="ex.: maria.silva" ${nw?'':'disabled'}>
 ${lbl('Perfil')}<select id="uf-r" class="inp w-full mb-3" ${me?'disabled':''}><option value="viewer" ${u&&u.papel=='viewer'?'selected':''}>Visualizador (só consulta e exporta)</option><option value="admin" ${u&&u.papel=='admin'?'selected':''}>Administrador (tudo, inclusive usuários)</option></select>
 ${nw?`${lbl('Senha inicial (mín. 8, com letras e números)')}<input id="uf-p" type="password" autocomplete="new-password" class="inp w-full mb-3"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no primeiro acesso</label>`:''}
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="uSaveForm('${nw?'':u.id}')">Salvar</button></div>`)}
async function uRun(p){try{await adminUsuarios(p);closeMd();await uRender()}catch(e){merr(e.message)}finally{const x=$('#uf-p');if(x)x.value=''}}
async function uOp(p){try{await adminUsuarios(p);await uRender()}catch(e){dlg('Não foi possível concluir',esc(e.message))}}
function uSaveForm(id){const n=$('#uf-n').value.trim(),r=$('#uf-r').value;if(!n)return merr('Informe o nome.');
 if(id)return uRun({a:'update',id,n,r});
 const l=$('#uf-l').value.trim().toLowerCase(),pw=$('#uf-p').value;
 if(!LRX.test(l))return merr('Usuário: 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou _).');
 if(US.some(x=>x.login==l))return merr('Esse usuário já existe.');
 if(!pwOk(pw))return merr(PWMSG);
 return uRun({a:'create',l,n,r,pw,mc:$('#uf-m').checked})}
function uReset(id){const u=US.find(x=>x.id==id);mo(`<h2 class="text-lg font-bold mb-1">Redefinir senha</h2><p class="text-sm text-slate-500 mb-4">Usuário: ${esc(u.login)}</p>
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="uf-p" type="password" autocomplete="new-password" class="inp w-full mb-3"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no próximo acesso</label>
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="uDoReset('${id}')">Salvar</button></div>`)}
function uDoReset(id){const pw=$('#uf-p').value;if(!pwOk(pw))return merr(PWMSG);return uRun({a:'reset',id,pw,mc:$('#uf-m').checked})}
function uToggle(id){return uOp({a:'toggle',id})}
function uDel(id){const u=US.find(x=>x.id==id);if(!u)return;dlg('Excluir usuário','Excluir "'+esc(u.login)+'"? Esta ação não pode ser desfeita.',()=>uOp({a:'delete',id}))}
function pwModal(forced){mo(`<h2 class="text-lg font-bold mb-1">${forced?'Defina uma nova senha':'Alterar minha senha'}</h2>${forced?'<p class="text-sm text-slate-500 mb-4">Por segurança, troque a senha provisória para continuar.</p>':'<div class="mb-4"></div>'}
 ${forced?'':lbl('Senha atual')+'<input id="pw0" type="password" autocomplete="current-password" class="inp w-full mb-3">'}
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="pw1" type="password" autocomplete="new-password" class="inp w-full mb-3">${lbl('Repita a nova senha')}<input id="pw2" type="password" autocomplete="new-password" class="inp w-full mb-3">
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="${forced?'logout()':'closeMd()'}">${forced?'Sair':'Cancelar'}</button><button class="btn" onclick="pwSave(${forced?1:0})">Salvar</button></div>`)}
async function pwSave(forced){const a=$('#pw1').value;
 try{if(!forced){const r=await sb_.auth.signInWithPassword({email:PF.email,password:$('#pw0').value});if(r.error)return merr('Senha atual incorreta.')}
  if(!pwOk(a))return merr(PWMSG);if(a!==$('#pw2').value)return merr('As senhas não conferem.');
  const r=await sb_.auth.updateUser({password:a});if(r.error)return merr(tr(r.error.message));
  await sb_.rpc('limpar_mc');uLog('alterou a própria senha');closeMd();if(forced)await enter()}
 catch(e){merr('Falha ao alterar a senha: '+e.message)}
 finally{['pw0','pw1','pw2'].forEach(i=>{const x=$('#'+i);if(x)x.value=''})}}
