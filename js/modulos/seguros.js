/* Módulo "Seguros" · cadastro das empresas e dos tipos de seguro sob responsabilidade de cada uma + PAGAMENTOS REALIZADOS com comprovante.
   • Aba "Empresas": código, razão social completa, CNPJ (numérico ou alfanumérico, conferido pelos dígitos verificadores), os TIPOS DE SEGURO de cada empresa
     (marque na lista ou digite um tipo novo), situação (Ativa/Inativa) e observação. Empresa com pagamentos não pode ser excluída: marque como Inativa (sai da lista de novos pagamentos; o histórico fica).
   • Aba "Pagamentos realizados": a EMPRESA é escolhida numa LISTA SUSPENSA com as empresas cadastradas (razão social — código), depois o tipo de seguro (da própria empresa), a data,
     o VALOR PAGO, o Nº DA PARCELA e o COMPROVANTE (PDF, PNG, JPG ou WEBP, até 10 MB) com 👁 Visualizar (abre na tela) e ⬇ Baixar. Sem comprovante o pagamento fica "pendente" e pode ser anexado depois.
     Trocar o comprovante não apaga o anterior: ele vai para o histórico (🕘) e continua disponível para visualizar e baixar.
   • Avisa quando o pagamento parece repetido (mesma empresa, tipo, parcela e valor) ou quando a parcela já tem outro pagamento.
   • Cartões no topo (Empresas · Tipos de seguro · Pagamentos · Total pago) e o Excel (abas Empresas e Pagamentos) seguem os filtros da aba aberta.
   Dados em js/core/seguros_dados.js (SEG → public.seguros_empresas, public.seguros_pagamentos e o bucket privado seguros-comprovantes). Regras reais no banco (RLS, supabase/seguros.sql):
   seg.ver vê/visualiza/baixa/exporta · seg.lancar cadastra e edita empresas e registra/edita pagamentos e comprovantes · seg.excluir exclui. A Auditoria é gravada pelo próprio banco.
   MÓDULO ISOLADO: usa de js/core: $, N, PERM, mo/closeMd/dlg (usuarios.js), saveAs, SEG, NFV (nf_visualizador.js), XR/XP (Excel). */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="seguros"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '',
    dh = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    brl = n => ((+n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    fnum = n => n == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    /* valor digitado em reais ("12.160.667,52", "12160667,52", "12160667.52", "R$ 1.234,56") → número com 2 casas; NaN se não for um valor */
    num = t => { let x = String(t == null ? '' : t).replace(/R\$|\s/g, ''); if (!x) return NaN; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); return /^\d+(\.\d+)?$/.test(x) ? Math.round(parseFloat(x) * 100) / 100 : NaN },
    pt = (a, b) => String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
    pl = (n, s, p) => n + ' ' + (n == 1 ? s : p),
    el = id => document.getElementById(id), g = id => (el(id) || {}).value || '', ck = id => !!(el(id) || {}).checked;

  /* ---------- cartões de indicador (mesmo padrão visual de Contas a Receber e do Dashboard) ---------- */
  const SV = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IP = {
      emp: '<path d="M3 21h18"/><path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16"/><path d="M14 9h4a1 1 0 0 1 1 1v11"/><path d="M8.5 8h.01M8.5 12h.01M8.5 16h.01M10.5 8h.01M10.5 12h.01M10.5 16h.01"/>',
      escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
      cartao: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
      recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>'
    },
    TOM = { ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', amb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ind: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
    kp = (id, t, v, ic, tom, s, tt) => `<div class="card py-4 min-w-0 flex flex-col justify-center" data-kpi="${id}"${tt ? ` title="${esc(tt)}"` : ''}><div class="w-full" style="container-type:inline-size"><div class="flex items-center gap-2.5"><span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center ${TOM[tom]}">${SV(IP[ic])}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-[13px] text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,7.4cqw,1.04rem)">${t}</div></div><div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl" data-v style="font-size:clamp(.8rem,10.2cqw,1.6rem)">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1" data-s>${s}</div>` : ''}</div></div>`,
    SI = d => `<svg viewBox="0 0 16 16" width="12" height="12" class="inline-block align-[-1px] mr-0.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    /* situação da empresa: ícone + rótulo (a cor nunca é o único sinal) */
    SIT = {
      ativa: { t: 'Ativa', i: SI('<path d="m3 8.6 3.2 3.2L13 4.8"/>'), c: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
      inativa: { t: 'Inativa', i: SI('<path d="M4 8h8"/>'), c: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' }
    },
    AMB = 'text-amber-600 dark:text-amber-400',
    TXT_COMP = { carregando: 'Carregando o comprovante…', falhaAbrir: 'Não foi possível abrir o comprovante', falhaBaixar: 'Não consegui baixar o comprovante', falhaCarregar: 'Não consegui carregar o comprovante' };

  /* TAB = 'emp' | 'pag' · FQ busca · FE empresa · FT tipo de seguro (comuns às duas abas) · FS situação (só Empresas) · FD1/FD2 data do pagamento e FC comprovante (só Pagamentos)
     EDIT = id da empresa/pagamento aberto na janela · ABRE = pagamentos com o histórico de comprovantes aberto */
  let TAB = 'emp', FQ = '', FE = '', FT = '', FS = '', FD1 = '', FD2 = '', FC = '', MSG = '', ERR = false, LIM = 100, EDIT = null, PEND = false, ABRE = {};
  try { const s = JSON.parse(localStorage.getItem('csd_seguros_v1') || '{}'); if (s.tab == 'emp' || s.tab == 'pag') TAB = s.tab } catch (e) { }
  const salva = () => { try { localStorage.setItem('csd_seguros_v1', JSON.stringify({ tab: TAB })) } catch (e) { } },
    lanca = () => PERM.tem('seg.lancar'), exclui = () => PERM.tem('seg.excluir'), pode = () => PERM.tem('seg.ver');

  /* ---------- dados filtrados ---------- */
  const hit = (blob, q) => { /* a busca ignora acento e maiúsculas; o CNPJ vale com ou sem pontuação */
    if (!q) return true; const b = N(blob); if (b.includes(q)) return true;
    const a = q.replace(/[^0-9a-z]/g, ''); return a.length > 2 && b.replace(/[^0-9a-z]/g, '').includes(a)
  };
  const emp = id => SEG.empresa(id) || { id, cod: '?', razao: '(empresa não encontrada)', cnpj: '', tipos: [], ativo: false },
    usados = () => SEG.tiposNorm([].concat(...SEG.E.map(e => e.tipos), SEG.P.map(p => p.tipo).filter(Boolean))).sort(pt),
    somaC = L => L.reduce((t, p) => t + SEG.c(p.v), 0) / 100,
    ultimo = L => L.reduce((m, p) => p.dp > m ? p.dp : m, '');
  function empVis() {
    const q = N(FQ), ft = N(FT);
    return SEG.E.filter(e => (!FE || e.id == FE) && (!FT || e.tipos.some(t => N(t) == ft)) && (!FS || (FS == 'ativa') == e.ativo)
      && hit([e.cod, e.razao, e.cnpj, SEG.cnpjFmt(e.cnpj), e.tipos.join(' '), e.obs, e.ativo ? 'ativa' : 'inativa'].join(' '), q))
  }
  function pagVis() {
    const q = N(FQ), ft = N(FT);
    return SEG.P.filter(p => {
      const e = emp(p.emp);
      return (!FE || p.emp == FE) && (!FT || N(p.tipo) == ft) && (!FD1 || p.dp >= FD1) && (!FD2 || p.dp <= FD2) && (!FC || (FC == 'com') == !!p.path)
        && hit([e.cod, e.razao, e.cnpj, SEG.cnpjFmt(e.cnpj), p.tipo, 'parcela ' + p.parc, dmy(p.dp), fnum(p.v), p.obs, p.nome, p.path ? '' : 'pendente', p.cn, p.an].join(' '), q)
    }).sort((a, b) => a.dp < b.dp ? 1 : a.dp > b.dp ? -1 : a.ce < b.ce ? 1 : a.ce > b.ce ? -1 : 0)
  }

  /* ---------- tela ---------- */
  function head() {
    const e = TAB == 'emp';
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto min-w-0"><h1 class="text-2xl font-bold leading-tight">Seguros</h1>
      <p class="text-sm text-slate-500">Empresas, tipos de seguro sob responsabilidade de cada uma e pagamentos realizados com comprovante</p></div>
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        ${lanca() ? `<button class="${e ? 'btn' : 'btn2'}" data-act="nova-empresa" onclick="seguros.ne()">＋ Nova empresa</button><button class="${e ? 'btn2' : 'btn'}" data-act="novo-pagamento" onclick="seguros.np()">＋ Registrar pagamento</button>` : ''}
        <button class="btn2" data-act="excel" onclick="seguros.xl()">Excel</button></div></div>
      <div id="sg-msg"></div><div id="sg-tabs"></div>`
  }
  const tabsHtml = () => `<div class="flex flex-wrap gap-2" role="tablist">${[['emp', '🏢', 'Empresas', SEG.E.length], ['pag', '💳', 'Pagamentos realizados', SEG.P.length]].map(t =>
    `<button role="tab" aria-selected="${TAB == t[0]}" data-tab-btn="${t[0]}" class="${TAB == t[0] ? 'btn' : 'btn2'}" onclick="seguros.tab('${t[0]}')"><span aria-hidden="true">${t[1]}</span> ${t[2]}${SEG.ok ? ` <span class="opacity-75 tabular-nums" data-n>(${t[3]})</span>` : ''}</button>`).join('')}</div>`;
  function filtros() {
    const e = TAB == 'emp', ES = SEG.E.slice().sort((a, b) => pt(a.razao, b.razao) || pt(a.cod, b.cod)), T = usados();
    if (FT && !T.some(t => N(t) == N(FT))) T.push(FT);
    const ring = on => on ? 'ring-2 ring-amber-500' : '';
    return `<div class="card"><div class="flex flex-wrap items-center gap-2">
      <input id="sg-q" class="inp" style="flex:2 1 250px;min-width:200px" aria-label="Buscar" title="${e ? 'Busca por código, razão social, CNPJ (com ou sem pontuação), tipo de seguro ou observação' : 'Busca por empresa, CNPJ, tipo, parcela, valor, nome do comprovante, observação ou responsável'}" placeholder="${e ? '🔍 Buscar código, razão social, CNPJ ou tipo' : '🔍 Buscar empresa, CNPJ, tipo, parcela, valor…'}" value="${esc(FQ)}" oninput="seguros.q(this.value)">
      <select id="sg-fe" class="inp ${ring(FE)}" style="flex:1 1 200px;min-width:170px;max-width:320px" title="Empresa" aria-label="Empresa" onchange="seguros.fl('e',this.value)"><option value="">Todas as empresas</option>${ES.map(x => `<option value="${esc(x.id)}" ${x.id == FE ? 'selected' : ''}>${esc(x.razao)} — ${esc(x.cod)}${x.ativo ? '' : ' (inativa)'}</option>`).join('')}</select>
      <select id="sg-ft" class="inp ${ring(FT)}" style="flex:1 1 170px;min-width:150px;max-width:240px" title="Tipo de seguro" aria-label="Tipo de seguro" onchange="seguros.fl('t',this.value)"><option value="">Todos os tipos</option>${T.map(t => `<option value="${esc(t)}" ${N(t) == N(FT) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      ${e ? `<select id="sg-fs" class="inp ${ring(FS)}" style="flex:1 1 160px;min-width:150px;max-width:200px" title="Situação" aria-label="Situação" onchange="seguros.fl('s',this.value)"><option value="">Todas as situações</option><option value="ativa" ${FS == 'ativa' ? 'selected' : ''}>Ativas</option><option value="inativa" ${FS == 'inativa' ? 'selected' : ''}>Inativas</option></select>`
        : `<label class="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">Pago de <input id="sg-d1" type="date" class="inp ${ring(FD1)}" style="width:9.25rem" title="Data do pagamento: de" aria-label="Data do pagamento: de" value="${esc(FD1)}" onchange="seguros.fl('d1',this.value)"></label>
      <label class="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">até <input id="sg-d2" type="date" class="inp ${ring(FD2)}" style="width:9.25rem" title="Data do pagamento: até" aria-label="Data do pagamento: até" value="${esc(FD2)}" onchange="seguros.fl('d2',this.value)"></label>
      <select id="sg-fc" class="inp ${ring(FC)}" style="flex:1 1 170px;min-width:160px;max-width:210px" title="Comprovante" aria-label="Comprovante" onchange="seguros.fl('c',this.value)"><option value="">Todos os comprovantes</option><option value="com" ${FC == 'com' ? 'selected' : ''}>Com comprovante</option><option value="sem" ${FC == 'sem' ? 'selected' : ''}>Comprovante pendente</option></select>`}
      <button class="btn2" data-act="limpar" onclick="seguros.lm()">Limpar</button></div></div>`
  }
  function render() {
    VIEW.innerHTML = head() + filtros() + `<div id="sg-k" class="grid grid-cols-2 lg:grid-cols-4 gap-3"></div><div class="card"><div id="sg-t" class="overflow-x-auto"></div></div>`;
    atualiza()
  }
  /* repinta abas, cartões e tabela com os filtros atuais (não recria os campos de filtro: não perde o foco de quem está digitando) */
  function atualiza() {
    const k = el('sg-k'); if (!k) return;
    const tb = el('sg-tabs'), msg = el('sg-msg'); if (tb) tb.innerHTML = tabsHtml();
    if (msg) msg.innerHTML = MSG ? `<div class="text-sm rounded-lg px-3 py-2 mt-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}" data-msg>${esc(MSG)}</div>` : '';
    if (!SEG.ok) {
      k.innerHTML = ['Empresas', 'Tipos de seguro', 'Pagamentos', 'Total pago'].map((t, i) => kp('k' + i, t, '…', ['emp', 'escudo', 'cartao', 'recibo'][i], ['ind', 'azul', 'amb', 'ver'][i], SEG.erro ? 'indisponível' : 'carregando…')).join('');
      const box = el('sg-t'); if (box) box.innerHTML = SEG.erro ? `<div class="py-10 text-center text-slate-500" data-erro><div class="text-4xl mb-2">⚠️</div><p class="font-semibold">Não consegui carregar os Seguros</p><p class="text-sm mt-1 max-w-xl mx-auto">${esc(SEG.erro)}</p></div>` : '<div class="py-10 text-center text-slate-500">Carregando…</div>';
      return
    }
    cards(k); const box = el('sg-t'); if (box) { if (TAB == 'emp') tabEmp(box); else tabPag(box) }
  }
  function cards(k) {
    const e = TAB == 'emp'; let E, P, tipos;
    if (e) { E = empVis(); const ids = new Set(E.map(x => x.id)); P = SEG.P.filter(p => ids.has(p.emp)); tipos = SEG.tiposNorm([].concat(...E.map(x => x.tipos))) }
    else { P = pagVis(); const ids = new Set(P.map(p => p.emp)); E = SEG.E.filter(x => ids.has(x.id)); tipos = SEG.tiposNorm(P.map(p => p.tipo).filter(Boolean)) }
    const sem = P.filter(p => !p.path).length, tot = somaC(P), ult = ultimo(P);
    const sEmp = e ? (() => { const ina = E.filter(x => !x.ativo).length; return pl(E.length - ina, 'ativa', 'ativas') + (ina ? ' · ' + pl(ina, 'inativa', 'inativas') : '') + (E.length != SEG.E.length ? ' · de ' + SEG.E.length : '') })() : (E.length != SEG.E.length || P.length != SEG.P.length ? 'de ' + pl(SEG.E.length, 'cadastrada', 'cadastradas') : 'com pagamento registrado'),
      semTipo = e ? E.filter(x => !x.tipos.length).length : P.filter(p => !p.tipo).length,
      sTipos = semTipo ? `<span class="${AMB}">${e ? pl(semTipo, 'empresa sem tipo cadastrado', 'empresas sem tipo cadastrado') : pl(semTipo, 'pagamento sem tipo informado', 'pagamentos sem tipo informado')}</span>` : (e ? 'nas empresas mostradas' : 'nos pagamentos mostrados');
    k.innerHTML = kp('emp', 'Empresas', E.length, 'emp', 'ind', sEmp, e ? 'Empresas cadastradas que atendem aos filtros' : 'Empresas com pagamento nos filtros atuais')
      + kp('tipos', 'Tipos de seguro', tipos.length, 'escudo', 'azul', sTipos, 'Tipos de seguro diferentes ' + (e ? 'nas empresas mostradas' : 'nos pagamentos mostrados'))
      + kp('pag', 'Pagamentos', P.length, 'cartao', 'amb', P.length ? (sem ? `<span class="${AMB}">${sem} sem comprovante</span>` : 'todos com comprovante') : 'nenhum pagamento', e ? 'Pagamentos das empresas mostradas' : 'Pagamentos que atendem aos filtros')
      + kp('total', 'Total pago', brl(tot), 'recibo', 'ver', ult ? 'último pagamento em ' + dmy(ult) : 'nenhum pagamento', 'Soma dos valores pagos' + (e ? ' pelas empresas mostradas' : ' nos filtros atuais'))
  }
  const vazio = (ic, t, x, btn) => `<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">${ic}</div><p class="font-semibold">${t}</p><p class="text-sm mt-1 max-w-xl mx-auto">${x}</p>${btn || ''}</div>`,
    mais = n => `<div class="text-center mt-3"><button class="btn2" data-act="mais" onclick="seguros.mais()">Mostrar mais (${n})</button></div>`;

  /* ---------- tabela: empresas ---------- */
  const sit = e => { const s = SIT[e.ativo ? 'ativa' : 'inativa']; return `<span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.c}" data-sit="${e.ativo ? 'ativa' : 'inativa'}">${s.i}${s.t}</span>` };
  function linhaEmp(e, a) {
    return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top ${e.ativo ? '' : 'opacity-80'}" data-id="${esc(e.id)}" data-cod="${esc(e.cod)}">
      <td class="px-3 py-2 whitespace-nowrap font-semibold" data-c="cod">${esc(e.cod)}</td>
      <td class="px-3 py-2 min-w-[170px]" data-c="razao"><div class="font-medium">${esc(e.razao)}</div>${e.obs ? `<div class="text-[11px] text-slate-500 max-w-[320px] truncate" title="${esc(e.obs)}">${esc(e.obs)}</div>` : ''}</td>
      <td class="px-3 py-2 whitespace-nowrap tabular-nums" data-c="cnpj">${esc(SEG.cnpjFmt(e.cnpj))}</td>
      <td class="px-3 py-2 min-w-[150px]" data-c="tipos">${e.tipos.length ? e.tipos.map(t => `<span class="inline-block px-2 py-0.5 mr-1 mb-1 rounded-full text-xs bg-sky-500/15 text-sky-700 dark:text-sky-300" data-tipo>${esc(t)}</span>`).join('') : `<span class="text-xs ${AMB}" data-sem-tipo>nenhum tipo cadastrado</span>`}</td>
      <td class="px-3 py-2" data-c="pag">${a ? `<button class="underline text-indigo-600 dark:text-indigo-400" data-act="ver-pag" title="Ver os pagamentos desta empresa" onclick="seguros.pg('${esc(e.id)}')">${pl(a.n, 'pagamento', 'pagamentos')}</button><div class="text-[11px] tabular-nums text-slate-500 whitespace-nowrap">${brl(a.tot)}</div>${a.sem ? `<div class="text-[11px] ${AMB}">${a.sem} sem comprovante</div>` : ''}` : '<span class="text-slate-400">—</span>'}</td>
      <td class="px-3 py-2" data-c="sit">${sit(e)}</td>
      <td class="px-3 py-2 text-right"><div class="flex flex-wrap justify-end gap-1 ml-auto max-w-[260px]">${lanca() && e.ativo ? `<button class="btn !py-1 !text-xs" data-act="pagar" title="Registrar um pagamento desta empresa" onclick="seguros.np('${esc(e.id)}')">＋ Pagamento</button>` : ''}${lanca() ? `<button class="btn2 !py-1 !text-xs" data-act="editar" onclick="seguros.ee('${esc(e.id)}')">✎ Editar</button>` : ''}${exclui() ? `<button class="btn2 !py-1 !text-xs !text-rose-500" data-act="excluir" onclick="seguros.xe('${esc(e.id)}')">Excluir</button>` : ''}</div></td></tr>`
  }
  function tabEmp(box) {
    if (!SEG.E.length) { box.innerHTML = vazio('🏢', 'Nenhuma empresa cadastrada', lanca() ? 'Clique em “Nova empresa” e informe o código, a razão social completa, o CNPJ e os tipos de seguro sob responsabilidade dela. Depois é só escolher a empresa na lista ao registrar os pagamentos.' : 'Quando as empresas forem cadastradas, elas aparecem aqui.', lanca() ? '<button class="btn mt-4" data-act="nova-empresa-vazio" onclick="seguros.ne()">＋ Nova empresa</button>' : ''); return }
    const E = empVis(), A = SEG.agrega(), P = 'px-3 py-2', n = E.reduce((t, e) => t + ((A[e.id] || {}).n || 0), 0), tot = E.reduce((t, e) => t + ((A[e.id] || {}).c || 0), 0) / 100;
    box.innerHTML = `<table class="w-full text-sm" data-tab="emp"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="${P}">Código</th><th class="${P}">Razão social</th><th class="${P}">CNPJ</th><th class="${P}">Tipos de seguro</th><th class="${P}">Pagamentos</th><th class="${P}">Situação</th><th class="${P} text-right">Ações</th></tr></thead>
      <tbody>${E.slice(0, LIM).map(e => linhaEmp(e, A[e.id])).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Nenhuma empresa encontrada com esse filtro.</td></tr>'}</tbody>
      ${E.length > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="${P}" colspan="4" data-t="n">Total (${pl(E.length, 'empresa', 'empresas')})</td><td class="${P} whitespace-nowrap" colspan="3" data-t="pag">${pl(n, 'pagamento', 'pagamentos')} · ${brl(tot)}</td></tr></tfoot>` : ''}</table>${E.length > LIM ? mais(E.length - LIM) : ''}`
  }

  /* ---------- tabela: pagamentos realizados ---------- */
  const bt = 'btn2 !py-0.5 !px-1.5 !text-[11px]';
  function comp(p) { /* célula do comprovante: arquivo + 👁 Visualizar + ⬇ Baixar, ou "pendente" (+ 📎 Anexar) */
    const id = esc(p.id), h = p.ant.length ? `<div><button class="mt-1 text-[11px] underline text-slate-500" data-act="hist" onclick="seguros.hist('${id}')">🕘 ${ABRE[p.id] ? '▾' : '▸'} ${pl(p.ant.length, 'anterior', 'anteriores')}</button></div>` : '';
    if (!p.path) return `<span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-amber-500/15 text-amber-700 dark:text-amber-400" data-pend>⚠ Pendente</span>${lanca() ? `<div class="mt-1"><button class="${bt}" data-act="anexar" title="Anexar o comprovante deste pagamento" onclick="seguros.ep('${id}',1)">📎 Anexar</button></div>` : ''}${h}`;
    return `<div class="max-w-[220px] truncate text-xs font-medium" title="${esc(p.nome)}"><span aria-hidden="true">📎 </span><span data-nome>${esc(p.nome)}</span></div><div class="text-[11px] text-slate-500">${SEG.tam(p.bytes)}</div>
      <div class="flex flex-wrap gap-1 mt-1"><button class="${bt}" data-act="ver" title="Abrir o comprovante na tela, sem baixar" onclick="seguros.ver('${id}')">👁 Visualizar</button><button class="${bt}" data-act="dl" title="Baixar o comprovante" onclick="seguros.dl('${id}')">⬇ Baixar</button></div>${h}`
  }
  function histRow(p) { /* comprovantes anteriores do pagamento (mais recente primeiro) */
    const id = esc(p.id);
    return `<tr class="bg-slate-500/5" data-hist="${id}"><td colspan="7" class="px-3 py-3"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Comprovantes anteriores deste pagamento (o vigente está na linha acima)</div><div class="overflow-x-auto"><table class="w-full text-xs whitespace-nowrap">
      <thead class="text-slate-500 text-left"><tr><th class="py-1 pr-4">Arquivo</th><th class="pr-4">Tamanho</th><th class="pr-4">Anexado por</th><th class="pr-4">Substituído por</th><th></th></tr></thead>
      <tbody>${p.ant.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => `<tr class="border-t border-slate-200 dark:border-slate-700" data-h="${i}"><td class="py-1.5 pr-4 max-w-[260px] truncate" title="${esc(h.nome)}">📎 ${esc(h.nome)}</td><td class="pr-4">${SEG.tam(h.bytes)}</td>
        <td class="pr-4">${esc(h.por) || '—'}<div class="text-[11px] text-slate-500">${dh(h.em)}</div></td><td class="pr-4">${esc(h.sub) || '—'}<div class="text-[11px] text-slate-500">${dh(h.sem)}</div></td>
        <td class="text-right"><button class="${bt}" data-act="ver-ant" onclick="seguros.ver('${id}',${i})">👁 Visualizar</button> <button class="${bt}" data-act="dl-ant" onclick="seguros.dl('${id}',${i})">⬇ Baixar</button></td></tr>`).join('')}</tbody></table></div></td></tr>`
  }
  function linhaPag(p) {
    const e = emp(p.emp), alt = p.an && p.ae && p.ae != p.ce;
    return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-id="${esc(p.id)}">
      <td class="px-3 py-2 min-w-[112px]" data-c="dp"><div class="font-semibold whitespace-nowrap" data-dp>${dmy(p.dp)}</div><div class="text-[11px] leading-tight text-slate-500 mt-0.5" data-c="reg" title="${alt ? 'Alterado' : 'Registrado'} em ${esc(dh(alt ? p.ae : p.ce))}">${alt ? 'alterado' : 'registrado'} por ${esc(alt ? p.an : p.cn) || '—'}</div></td>
      <td class="px-3 py-2 min-w-[180px]" data-c="emp"><div class="font-medium">${esc(e.razao)}</div><div class="text-[11px] text-slate-500 whitespace-nowrap">${esc(e.cod)} · ${esc(SEG.cnpjFmt(e.cnpj))}${e.ativo ? '' : ' · inativa'}</div>${p.obs ? `<div class="text-[11px] text-slate-500 max-w-[320px] truncate" title="${esc(p.obs)}">${esc(p.obs)}</div>` : ''}</td>
      <td class="px-3 py-2 min-w-[100px]" data-c="tipo">${p.tipo ? esc(p.tipo) : '<span class="text-slate-400">—</span>'}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap tabular-nums font-semibold" data-c="v">${brl(p.v)}</td>
      <td class="px-3 py-2 text-center tabular-nums" data-c="parc">${p.parc}</td>
      <td class="px-3 py-2" data-c="comp">${comp(p)}</td>
      <td class="px-3 py-2 text-right"><div class="flex flex-wrap justify-end gap-1 ml-auto max-w-[170px]">${lanca() ? `<button class="btn2 !py-1 !text-xs" data-act="editar" onclick="seguros.ep('${esc(p.id)}')">✎ Editar</button>` : ''}${exclui() ? `<button class="btn2 !py-1 !text-xs !text-rose-500" data-act="excluir" onclick="seguros.xp('${esc(p.id)}')">Excluir</button>` : ''}</div></td></tr>${ABRE[p.id] && p.ant.length ? histRow(p) : ''}`
  }
  function tabPag(box) {
    if (!SEG.P.length) { box.innerHTML = vazio('💳', 'Nenhum pagamento registrado ainda', lanca() ? (SEG.E.length ? 'Clique em “Registrar pagamento”, escolha a empresa na lista e informe o valor pago, o número da parcela e o comprovante.' : 'Cadastre primeiro as empresas na aba Empresas: o pagamento é registrado escolhendo a empresa numa lista.') : 'Quando os pagamentos forem registrados, eles aparecem aqui.', lanca() && SEG.E.length ? '<button class="btn mt-4" data-act="novo-pagamento-vazio" onclick="seguros.np()">＋ Registrar pagamento</button>' : ''); return }
    const L = pagVis(), P = 'px-3 py-2', tot = somaC(L);
    box.innerHTML = `<table class="w-full text-sm" data-tab="pag"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="${P}">Data do pagamento</th><th class="${P}">Empresa</th><th class="${P}">Tipo de seguro</th><th class="${P} text-right whitespace-nowrap">Valor pago</th><th class="${P} text-center">Nº da parcela</th><th class="${P}">Comprovante</th><th class="${P} text-right">Ações</th></tr></thead>
      <tbody>${L.slice(0, LIM).map(linhaPag).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Nenhum pagamento encontrado com esse filtro.</td></tr>'}</tbody>
      ${L.length > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="${P}" colspan="3" data-t="n">Total (${L.length})</td><td class="${P} text-right whitespace-nowrap tabular-nums" data-t="v">${brl(tot)}</td><td colspan="3"></td></tr></tfoot>` : ''}</table>${L.length > LIM ? mais(L.length - LIM) : ''}`
  }

  /* ---------- visualizar / baixar o comprovante (o arquivo só chega para quem tem seg.ver: regra do armazenamento) ---------- */
  function ver(id, i) {
    let a; try { a = SEG.arq(id, i) } catch (e) { return NFV.abrirArquivo({ titulo: 'Comprovante', erro: e, rotulo: 'Visualizar comprovante', t: TXT_COMP }) }
    const p = a.p, e = emp(p.emp);
    NFV.abrirArquivo({
      titulo: 'Comprovante · ' + a.nome,
      sub: [e.razao, p.tipo, 'parcela ' + p.parc, brl(p.v), 'pago em ' + dmy(p.dp), SEG.tam(a.bytes), a.vigente ? '' : 'comprovante anterior (substituído)'].filter(Boolean).join(' · '),
      nome: a.nome, tipo: a.tipo, rotulo: 'Visualizar comprovante', t: TXT_COMP,
      bloqueio: pode() ? '' : 'Você não tem permissão para ver os comprovantes. Peça ao administrador.',
      obter: () => SEG.blob(a.path), baixar: () => SEG.baixar(a.path, a.nome)
    })
  }
  async function dl(id, i) {
    try { const a = SEG.arq(id, i); await SEG.baixar(a.path, a.nome) }
    catch (e) { MSG = '⚠ Não consegui baixar o comprovante: ' + (e.message || e); ERR = true; atualiza() }
  }

  /* ---------- empresa: cadastrar / editar ---------- */
  const lb = (t, h, f) => `<label${f ? ` for="${f}"` : ''} class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`,
    chk = (t, on) => `<label class="flex items-center gap-2 text-sm py-0.5 cursor-pointer"><input type="checkbox" data-tp value="${esc(t)}" ${on ? 'checked' : ''}><span>${esc(t)}</span></label>`,
    erroEm = id => m => { const e = el(id); if (e) { e.textContent = m; e.classList.remove('hidden') } };
  function formE(id) {
    const x = id ? SEG.empresa(id) : null; if (!lanca() || (id && !x)) return;
    if (!SEG.ok) { dlg('Seguros', esc(SEG.erro || 'Os dados ainda estão carregando. Tente de novo em instantes.')); return }
    EDIT = id || null; const on = new Set((x ? x.tipos : []).map(t => N(t)));
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar empresa' : 'Nova empresa'}</h2>
      <div class="max-h-[70vh] overflow-y-auto pr-1">
      <div class="grid grid-cols-3 gap-3 mb-3"><div>${lb('Código *', '', 'se-cod')}<input id="se-cod" class="inp w-full" maxlength="20" autocomplete="off" value="${esc(x ? x.cod : '')}"></div>
        <div class="col-span-2">${lb('CNPJ *', '', 'se-cnpj')}<input id="se-cnpj" class="inp w-full tabular-nums" autocomplete="off" maxlength="18" placeholder="00.000.000/0000-00" value="${esc(x ? SEG.cnpjFmt(x.cnpj) : '')}" oninput="seguros.cnpj(this)"></div></div>
      <p id="se-cnpj-i" class="text-xs -mt-2 mb-3 min-h-[1rem]"></p>
      ${lb('Razão social completa *', '', 'se-razao')}<input id="se-razao" class="inp w-full mb-3" maxlength="200" autocomplete="off" value="${esc(x ? x.razao : '')}">
      ${lb('Tipos de seguro sob responsabilidade desta empresa', '(marque um ou mais)')}
      <div id="se-tipos" class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 mb-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2 max-h-48 overflow-y-auto">${SEG.tiposLista(x ? x.tipos : []).map(t => chk(t, on.has(N(t)))).join('')}</div>
      <div class="flex gap-2 mb-3"><input id="se-outro" class="inp flex-1 min-w-0" maxlength="60" autocomplete="off" aria-label="Outro tipo de seguro" placeholder="Outro tipo de seguro (digite e clique em Adicionar)" onkeydown="if(event.key=='Enter'){event.preventDefault();seguros.add()}"><button id="se-add" type="button" class="btn2" onclick="seguros.add()">＋ Adicionar</button></div>
      <div class="grid grid-cols-2 gap-3 mb-3"><div>${lb('Situação', '', 'se-sit')}<select id="se-sit" class="inp w-full"><option value="1" ${!x || x.ativo ? 'selected' : ''}>Ativa</option><option value="0" ${x && !x.ativo ? 'selected' : ''}>Inativa</option></select></div>
        <p class="text-xs text-slate-500 self-end pb-2">Inativa: some da lista de novos pagamentos; o histórico continua.</p></div>
      ${lb('Observação', '(opcional)', 'se-obs')}<input id="se-obs" class="inp w-full mb-3" maxlength="300" value="${esc(x ? x.obs : '')}">
      </div>
      <p id="se-e" class="hidden text-sm text-rose-500 mb-3"></p>
      <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="se-ok" class="btn" onclick="seguros.se()">${x ? 'Salvar alterações' : 'Cadastrar empresa'}</button></div>`);
    $('#mdb').style.maxWidth = '38rem'; cnpjInfo()
  }
  /* máscara do CNPJ enquanto digita (00.000.000/0000-00; aceita letras nas 12 primeiras posições) mantendo o cursor no lugar */
  function cnpjIn(i) {
    const p = i.selectionStart, n = SEG.cnpjNorm(String(i.value).slice(0, p)).length; i.value = SEG.cnpjMasc(i.value);
    if (document.activeElement === i) { let k = 0, q = 0; while (q < i.value.length && k < n) { if (/[0-9A-Z]/i.test(i.value[q])) k++; q++ } try { i.setSelectionRange(q, q) } catch (e) { } }
    cnpjInfo()
  }
  function cnpjInfo() {
    const p = el('se-cnpj-i'); if (!p) return; const c = SEG.cnpjNorm(g('se-cnpj')); let t = '', k = 'text-slate-500';
    if (c && c.length < 14) t = c.length + ' de 14 caracteres';
    else if (c) {
      if (!SEG.cnpjOk(c)) { t = '⚠ CNPJ inválido: os dígitos verificadores não conferem. Confira os números.'; k = 'text-rose-500' }
      else { const d = SEG.E.find(e => e.cnpj == c && e.id != EDIT); if (d) { t = '⚠ Este CNPJ já está cadastrado para ' + d.cod + ' · ' + d.razao + '.'; k = AMB } else { t = '✔ CNPJ válido'; k = 'text-emerald-600 dark:text-emerald-400' } }
    }
    p.className = 'text-xs -mt-2 mb-3 min-h-[1rem] ' + k; p.textContent = t
  }
  function addTipo() { /* tipo digitado: entra na lista já marcado (ou marca o que já existe) */
    const i = el('se-outro'), box = el('se-tipos'); if (!i || !box) return; const t = i.value.replace(/\s+/g, ' ').trim(); if (!t) return;
    if (t.length > 60) { erroEm('se-e')('Cada tipo de seguro pode ter no máximo 60 caracteres.'); return }
    const ja = [...box.querySelectorAll('[data-tp]')].find(c => N(c.value) == N(t));
    if (ja) ja.checked = true; else box.insertAdjacentHTML('beforeend', chk(t, true));
    i.value = ''; i.focus(); const e = el('se-e'); if (e) e.classList.add('hidden')
  }
  async function saveE() {
    const er = erroEm('se-e'), id = EDIT;
    if (g('se-outro').trim()) { addTipo(); if (g('se-outro').trim()) return } /* tipo digitado e não adicionado: entra junto (se for inválido, o aviso já apareceu) */
    const x = { cod: g('se-cod').trim(), razao: g('se-razao'), cnpj: g('se-cnpj'), tipos: [...document.querySelectorAll('#se-tipos [data-tp]:checked')].map(c => c.value), ativo: g('se-sit') != '0', obs: g('se-obs').trim() };
    const m = SEG.validaEmpresa(x, id); if (m) return er(m);
    const b = el('se-ok'), t0 = b.textContent; b.disabled = true; b.textContent = 'Salvando…';
    try {
      const r = await SEG.salvarEmpresa(id, x); closeMd(); ERR = false;
      MSG = id ? '✔ Empresa atualizada: ' + r.cod + ' · ' + r.razao + '.' : '✔ Empresa cadastrada: ' + r.cod + ' · ' + r.razao + '.'; render()
    } catch (e) { b.disabled = false; b.textContent = t0; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function delE(id) {
    const x = SEG.empresa(id); if (!exclui() || !x) return; const n = SEG.P.filter(p => p.emp == id).length;
    if (n) { dlg('Esta empresa não pode ser excluída', `<b>${esc(x.razao)}</b> (${esc(x.cod)}) tem ${pl(n, 'pagamento registrado', 'pagamentos registrados')}. Para preservar o histórico, ela não é excluída. ${lanca() ? 'Abra <b>Editar</b> e marque a situação como <b>Inativa</b>: ela sai da lista de novos pagamentos e o histórico continua.' : 'Peça a quem faz o cadastro para marcá-la como Inativa.'}`); return }
    dlg('Excluir empresa', `Excluir a empresa <b>${esc(x.razao)}</b> (${esc(x.cod)}, CNPJ ${esc(SEG.cnpjFmt(x.cnpj))})? Esta ação não pode ser desfeita e fica registrada na Auditoria.`, async () => {
      try { await SEG.excluirEmpresa(id); MSG = '✔ Empresa excluída.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
    })
  }

  /* ---------- pagamento: registrar / editar ---------- */
  function formP(emp0, id, foco) {
    const x = id ? SEG.P.find(r => r.id == id) : null; if (!lanca() || (id && !x)) return;
    if (!SEG.ok) { dlg('Seguros', esc(SEG.erro || 'Os dados ainda estão carregando. Tente de novo em instantes.')); return }
    /* a lista traz as empresas ATIVAS (a do próprio pagamento sempre entra, mesmo inativa), em ordem alfabética da razão social */
    const ES = SEG.E.filter(e => e.ativo || (x && e.id == x.emp)).sort((a, b) => pt(a.razao, b.razao) || pt(a.cod, b.cod));
    if (!x && !ES.length) { dlg('Registrar pagamento', SEG.E.length ? 'Todas as empresas cadastradas estão inativas. Reative uma empresa na aba Empresas para registrar pagamentos.' : 'Cadastre primeiro a empresa na aba Empresas: o pagamento é registrado escolhendo a empresa numa lista.'); return }
    EDIT = id || null; const e0 = x ? x.emp : (emp0 && ES.some(e => e.id == emp0) ? emp0 : ''), hoje = SEG.hoje();
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar pagamento' : 'Registrar pagamento'}</h2>
      <div class="max-h-[72vh] overflow-y-auto pr-1">
      ${lb('Empresa *', '(escolha na lista · razão social — código)', 'sp-emp')}<select id="sp-emp" class="inp w-full mb-1" onchange="seguros.pe()"><option value="">Selecione a empresa…</option>${ES.map(e => `<option value="${esc(e.id)}" ${e.id == e0 ? 'selected' : ''}>${esc(e.razao)} — ${esc(e.cod)}${e.ativo ? '' : ' (inativa)'}</option>`).join('')}</select>
      <p id="sp-emp-i" class="text-xs text-slate-500 mb-3 min-h-[1rem]"></p>
      <div class="grid grid-cols-2 gap-3 mb-3"><div>${lb('Tipo de seguro', '(opcional)', 'sp-tipo')}<select id="sp-tipo" class="inp w-full" onchange="seguros.pi()"></select></div>
        <div>${lb('Data do pagamento *', '', 'sp-dp')}<input id="sp-dp" type="date" class="inp w-full" min="2000-01-01" max="${hoje}" value="${esc(x ? x.dp : hoje)}" oninput="seguros.pi()"></div></div>
      <div class="grid grid-cols-2 gap-3 mb-1"><div>${lb('Valor pago *', '(R$)', 'sp-v')}<input id="sp-v" class="inp w-full text-right tabular-nums" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${x ? esc(fnum(x.v)) : ''}" oninput="seguros.pi()" onblur="seguros.vf(this)"></div>
        <div>${lb('Nº da parcela *', '(1 a 999)', 'sp-parc')}<input id="sp-parc" type="number" min="1" max="999" step="1" inputmode="numeric" class="inp w-full tabular-nums" placeholder="1" value="${x ? x.parc : ''}" oninput="seguros.pi()"></div></div>
      <p id="sp-i" class="text-xs mb-3 min-h-[1rem]"></p>
      ${lb('Observação', '(opcional)', 'sp-obs')}<input id="sp-obs" class="inp w-full mb-3" maxlength="300" value="${esc(x ? x.obs : '')}">
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3" data-comp><div class="text-sm font-semibold mb-1">Comprovante de pagamento <span class="text-xs font-normal text-slate-400">(opcional · PDF, PNG, JPG ou WEBP · até 10 MB)</span></div>
        ${x && x.path ? `<div class="flex flex-wrap items-center gap-2 text-sm mb-2" data-atual><span class="min-w-0 truncate max-w-[270px]" title="${esc(x.nome)}">📎 ${esc(x.nome)} <span class="text-xs text-slate-500">· ${SEG.tam(x.bytes)}</span></span><button type="button" class="${bt}" onclick="seguros.ver('${esc(x.id)}')">👁 Visualizar</button><button type="button" class="${bt}" onclick="seguros.dl('${esc(x.id)}')">⬇ Baixar</button></div>
          <label class="flex items-center gap-2 text-xs mb-2 cursor-pointer"><input id="sp-rem" type="checkbox"> Remover este comprovante (ele continua guardado no histórico)</label>` : ''}
        <input id="sp-arq" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" class="inp w-full" aria-label="Arquivo do comprovante" onchange="seguros.pa(this)">
        <p id="sp-arq-i" class="text-xs text-slate-500 mt-1 min-h-[1rem]">${x && x.path ? 'Escolha um arquivo só se for trocar: o comprovante atual vai para o histórico.' : ''}</p>
        ${x && x.ant.length ? `<div class="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2" data-ant><div class="text-xs font-semibold text-slate-500 mb-1">Comprovantes anteriores (${x.ant.length})</div>${x.ant.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => `<div class="flex flex-wrap items-center gap-2 text-xs py-0.5"><span class="min-w-0 truncate max-w-[230px]" title="${esc(h.nome)}">${esc(h.nome)}</span><span class="text-slate-500">${SEG.tam(h.bytes)}${h.sem ? ' · substituído em ' + dh(h.sem) : ''}</span><button type="button" class="${bt}" onclick="seguros.ver('${esc(x.id)}',${i})">👁</button><button type="button" class="${bt}" onclick="seguros.dl('${esc(x.id)}',${i})">⬇</button></div>`).join('')}</div>` : ''}</div>
      </div>
      <p id="sp-e" class="hidden text-sm text-rose-500 mb-3"></p>
      <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="sp-ok" class="btn" onclick="seguros.sp()">${x ? 'Salvar alterações' : 'Registrar pagamento'}</button></div>`);
    $('#mdb').style.maxWidth = '38rem'; tipoOpts(true); empInfo(); pagInfo();
    if (foco) setTimeout(() => { const a = el('sp-arq'); if (a) a.focus() }, 0)
  }
  /* tipos de seguro da empresa escolhida (abrir = montando a janela; senão, trocou a empresa). Só um tipo cadastrado: já vem marcado, exceto ao abrir um pagamento existente */
  function tipoOpts(abrir) {
    const s = el('sp-tipo'); if (!s) return; const e = SEG.empresa(g('sp-emp')), x = EDIT ? SEG.P.find(r => r.id == EDIT) : null, T = e ? e.tipos.slice() : [];
    const velho = x && e && x.emp == e.id && x.tipo && !T.some(t => N(t) == N(x.tipo)) ? x.tipo : ''; if (velho) T.push(velho);
    const cur = abrir ? (x ? x.tipo : '') : s.value; let sel = cur ? T.find(t => N(t) == N(cur)) : '';
    if (!sel && T.length == 1 && !(abrir && x)) sel = T[0];
    s.innerHTML = `<option value="">${!e ? 'Escolha a empresa primeiro' : T.length ? '— não informar —' : 'Empresa sem tipos cadastrados'}</option>${T.map(t => `<option value="${esc(t)}" ${sel && t == sel ? 'selected' : ''}>${esc(t)}${t == velho ? ' (não consta mais no cadastro)' : ''}</option>`).join('')}`;
    s.disabled = !e || !T.length
  }
  function empInfo() { /* CNPJ, seguros e resumo de pagamentos da empresa escolhida */
    const p = el('sp-emp-i'); if (!p) return; const e = SEG.empresa(g('sp-emp'));
    if (!e) { p.className = 'text-xs text-slate-500 mb-3 min-h-[1rem]'; p.textContent = 'A lista traz as empresas cadastradas na aba Empresas.'; return }
    const a = SEG.agrega()[e.id];
    p.className = 'text-xs mb-3 ' + (e.ativo ? 'text-slate-500' : AMB);
    p.textContent = 'CNPJ ' + SEG.cnpjFmt(e.cnpj) + ' · ' + (e.tipos.length ? 'Seguros: ' + e.tipos.join(', ') : 'sem tipos de seguro cadastrados') + ' · ' + (a ? pl(a.n, 'pagamento', 'pagamentos') + ' (' + brl(a.tot) + ')' : 'nenhum pagamento ainda') + (e.ativo ? '' : ' · EMPRESA INATIVA')
  }
  function pagInfo() { /* avisos de duplicidade e a última parcela registrada */
    const p = el('sp-i'); if (!p) return; const id = g('sp-emp'), tipo = g('sp-tipo'), parc = parseInt(g('sp-parc'), 10), v = num(g('sp-v'));
    let t = '', k = 'text-slate-500';
    if (id) {
      const L = SEG.P.filter(r => r.id != EDIT && r.emp == id && N(r.tipo) == N(tipo)), nm = tipo ? ' (' + tipo + ')' : '';
      const igual = parc > 0 && isFinite(v) ? L.find(r => r.parc == parc && SEG.c(r.v) == SEG.c(v)) : null, outra = parc > 0 ? L.find(r => r.parc == parc) : null;
      if (igual) { t = `⚠ Já existe um pagamento igual (mesma empresa, tipo, parcela ${parc} e valor) registrado em ${dmy(igual.dp)}: confira para não lançar em duplicidade.`; k = AMB }
      else if (outra) { t = `⚠ A parcela ${parc} desta empresa${nm} já tem pagamento de ${brl(outra.v)} em ${dmy(outra.dp)}. Se este é um pagamento complementar, pode continuar.`; k = AMB }
      else { const u = L.reduce((m, r) => Math.max(m, r.parc), 0); if (u) t = `Última parcela registrada para esta empresa${nm}: ${u}.` }
    }
    p.className = 'text-xs mb-3 min-h-[1rem] ' + k; p.textContent = t
  }
  function arqSel(inp) { /* arquivo escolhido: mostra nome e tamanho (ou o problema, antes de enviar) */
    const a = el('sp-arq-i'), f0 = inp && inp.files && inp.files[0], rem = el('sp-rem'), x = EDIT ? SEG.P.find(r => r.id == EDIT) : null; if (!a) return;
    if (!f0) { a.className = 'text-xs text-slate-500 mt-1 min-h-[1rem]'; a.textContent = x && x.path ? 'Escolha um arquivo só se for trocar: o comprovante atual vai para o histórico.' : ''; if (rem) rem.disabled = false; return }
    const v = SEG.validar(f0); a.className = 'text-xs mt-1 min-h-[1rem] ' + (v ? 'text-rose-500' : 'text-slate-500');
    a.textContent = v || '📎 ' + f0.name + ' · ' + SEG.tam(f0.size) + (x && x.path ? ' — substitui o comprovante atual (que fica no histórico)' : '');
    if (rem) { rem.checked = false; rem.disabled = true }
  }
  async function saveP() {
    const er = erroEm('sp-e'), id = EDIT, inp = el('sp-arq'), file = (inp && inp.files && inp.files[0]) || null, vt = g('sp-v').trim(), v = num(vt), pt_ = g('sp-parc').trim(), parc = /^\d+$/.test(pt_) ? parseInt(pt_, 10) : NaN;
    const x = { emp: g('sp-emp'), tipo: g('sp-tipo'), dp: g('sp-dp'), v, parc, obs: g('sp-obs').trim(), file, remover: !file && ck('sp-rem') };
    /* ordem dos campos da janela: Empresa · Tipo · Data · Valor · Parcela · Comprovante */
    if (!x.emp) return er('Escolha a empresa na lista.');
    if (!x.dp) return er('Informe a data do pagamento.');
    if (!isFinite(v)) return er(vt ? 'Valor pago inválido: informe um valor em reais (ex.: 1.250,00).' : 'Informe o valor pago.');
    if (isNaN(parc)) return er(pt_ ? 'Número da parcela inválido: use um número inteiro de 1 a 999.' : 'Informe o número da parcela.');
    const m = SEG.validaPagamento(x, id); if (m) return er(m);
    const b = el('sp-ok'), t0 = b.textContent; b.disabled = true; b.textContent = file ? 'Enviando…' : 'Salvando…';
    try {
      let novo = null; if (id) await SEG.alterar(id, x); else novo = await SEG.registrar(x);
      closeMd(); ERR = false; const e = emp(x.emp);
      MSG = id ? '✔ Pagamento atualizado.' : '✔ Pagamento de ' + brl(v) + ' (parcela ' + parc + ') registrado para ' + e.razao + '.' + (file ? '' : ' Comprovante pendente: anexe-o depois em “📎 Anexar”.');
      if (!id && TAB != 'pag') { TAB = 'pag'; salva() }
      if (novo && !pagVis().some(p => p.id == novo.id)) { FQ = FE = FT = FD1 = FD2 = FC = ''; LIM = 100 } /* o filtro esconderia o pagamento recém-registrado */
      render()
    } catch (e) { b.disabled = false; b.textContent = t0; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function delP(id) {
    const p = SEG.P.find(r => r.id == id); if (!exclui() || !p) return; const e = emp(p.emp), n = (p.path ? 1 : 0) + p.ant.length;
    dlg('Excluir pagamento', `Excluir o pagamento de <b>${brl(p.v)}</b> (parcela ${p.parc}) de <b>${esc(e.razao)}</b>, pago em ${dmy(p.dp)}? ${n ? (n == 1 ? 'O comprovante também será apagado. ' : 'Os ' + n + ' comprovantes (o atual e os anteriores) também serão apagados. ') : ''}Esta ação não pode ser desfeita e fica registrada na Auditoria.`, async () => {
      try { await SEG.excluir(id); MSG = '✔ Pagamento excluído.'; ERR = false } catch (e2) { MSG = '⚠ ' + (e2.message || e2); ERR = true } render()
    })
  }

  /* ---------- Excel (padrão visual do Consórcio, js/core/xlsx_rel.js): abas Empresas e Pagamentos, valores em R$ Contábil, CNPJ e código como texto ---------- */
  async function xl() {
    try {
      let ES, PS;
      if (TAB == 'emp') { ES = empVis(); const s = new Set(ES.map(e => e.id)); PS = SEG.P.filter(p => s.has(p.emp)) }
      else { PS = pagVis(); const s = new Set(PS.map(p => p.emp)); ES = SEG.E.filter(e => s.has(e.id)) }
      if (!(TAB == 'emp' ? ES : PS).length) { MSG = TAB == 'emp' ? 'Não há empresas para exportar com os filtros atuais.' : 'Não há pagamentos para exportar com os filtros atuais.'; ERR = true; atualiza(); return }
      const E = XR, A = SEG.agrega(PS), eN = id => emp(id), fe = FE ? emp(FE) : null;
      PS = PS.slice().sort((a, b) => a.dp < b.dp ? -1 : a.dp > b.dp ? 1 : a.ce < b.ce ? -1 : a.ce > b.ce ? 1 : 0);
      const filtros = [FQ.trim() && 'Busca: “' + FQ.trim() + '”', fe && 'Empresa: ' + fe.razao, FT && 'Tipo de seguro: ' + FT,
        TAB == 'emp' ? (FS && 'Situação: ' + (FS == 'ativa' ? 'Ativas' : 'Inativas')) : (FD1 || FD2 ? 'Pagamento de ' + (FD1 ? dmy(FD1) : '…') + ' a ' + (FD2 ? dmy(FD2) : '…') : ''),
        TAB == 'pag' && FC && (FC == 'com' ? 'Com comprovante' : 'Comprovante pendente')].filter(Boolean),
        sub = [pl(ES.length, 'empresa', 'empresas'), pl(PS.length, 'pagamento', 'pagamentos'), filtros.length ? 'Filtros: ' + filtros.join(' · ') : '', 'Gerado em ' + E.hoje()].filter(Boolean).join(' · '),
        wb = XP.book({ titulo: 'Seguros' });
      const ce = [
        { h: 'CÓDIGO', g: e => e.cod, nf: 'texto', al: 'center', tot: 'TOTAL' },
        { h: 'RAZÃO SOCIAL', g: e => e.razao, w: 1, maxW: 52 },
        { h: 'CNPJ', g: e => SEG.cnpjFmt(e.cnpj), nf: 'texto', al: 'center' },
        { h: 'TIPOS DE SEGURO', g: e => e.tipos.join('; ') || null, w: 1, maxW: 52 },
        { h: 'SITUAÇÃO', g: e => e.ativo ? 'Ativa' : 'Inativa', al: 'center' },
        { h: 'PAGAMENTOS', g: e => (A[e.id] || {}).n || 0, nf: 'int', al: 'center', tal: 'center', tot: 'sum' },
        { h: 'TOTAL PAGO', g: e => (A[e.id] || {}).tot || 0, nf: 'contabil', tot: 'sum' },
        { h: 'ÚLTIMO PAGAMENTO', g: e => (A[e.id] || {}).ult ? XP.serial(A[e.id].ult) : null, nf: 'data' },
        { h: 'SEM COMPROVANTE', g: e => (A[e.id] || {}).sem || 0, nf: 'int', al: 'center', tal: 'center', tot: 'sum' },
        { h: 'OBSERVAÇÃO', g: e => e.obs || null, w: 1, maxW: 40 }];
      const a1 = E.dados(wb, 'Empresas', { titulo: 'Seguros · Empresas e tipos de seguro', sub, rod: 'Consórcio Santa Dulce · Seguros', rows: ES, hr: 8, fz: 1, cent: 1, total: ES.length > 1, cols: ce });
      a1.ws.o.zoom = 90;
      const cp = [
        { h: 'DATA DO PAGAMENTO', g: p => XP.serial(p.dp), nf: 'data', tot: 'TOTAL' },
        { h: 'CÓDIGO', g: p => eN(p.emp).cod, nf: 'texto', al: 'center' },
        { h: 'EMPRESA (RAZÃO SOCIAL)', g: p => eN(p.emp).razao, w: 1, maxW: 52 },
        { h: 'CNPJ', g: p => SEG.cnpjFmt(eN(p.emp).cnpj), nf: 'texto', al: 'center' },
        { h: 'TIPO DE SEGURO', g: p => p.tipo || null, w: 1, maxW: 34 },
        { h: 'VALOR PAGO', g: p => p.v, nf: 'contabil', tot: 'sum' },
        { h: 'Nº DA PARCELA', g: p => p.parc, nf: 'int', al: 'center' },
        { h: 'COMPROVANTE', g: p => p.path ? p.nome : 'Pendente', w: 1, maxW: 40 },
        { h: 'OBSERVAÇÃO', g: p => p.obs || null, w: 1, maxW: 40 },
        { h: 'REGISTRADO POR', g: p => p.cn || null },
        { h: 'REGISTRADO EM', g: p => p.ce ? dh(p.ce) : null, al: 'center' }];
      const a2 = E.dados(wb, 'Pagamentos', { titulo: 'Seguros · Pagamentos realizados', sub, rod: 'Consórcio Santa Dulce · Seguros', rows: PS, hr: 8, fz: 1, cent: 1, total: PS.length > 1, cols: cp });
      a2.ws.o.zoom = 90;
      await saveAs('seguros.xlsx', await wb.save())
    } catch (e) { MSG = '⚠ Não consegui gerar o Excel: ' + (e.message || e); ERR = true; atualiza() }
  }

  /* ---------- atualização automática (outro usuário cadastrou, registrou, anexou comprovante...) ---------- */
  function atual() {
    if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } atualiza()
  }
  try {
    SEG.on(atual);
    VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; atualiza() } }, 80) })
  } catch (e) { }

  window.seguros = {
    show() { MSG = ''; ERR = false; render(); SEG.carregar().catch(e => { if (!SEG.erro) SEG.erro = e.message || String(e) }).then(atualiza) },
    tab(t) { if (t != 'emp' && t != 'pag') return; TAB = t; LIM = 100; salva(); render() },
    q(v) { FQ = v; LIM = 100; atualiza() },
    fl(k, v) { if (k == 'e') FE = v; else if (k == 't') FT = v; else if (k == 's') FS = v; else if (k == 'd1') FD1 = v; else if (k == 'd2') FD2 = v; else if (k == 'c') FC = v; LIM = 100; render() },
    lm() { FQ = FE = FT = FS = FD1 = FD2 = FC = ''; LIM = 100; render() },
    mais() { LIM += 100; atualiza() },
    pg(id) { TAB = 'pag'; FE = id; LIM = 100; salva(); render() },     /* "N pagamentos" da empresa → aba de pagamentos filtrada por ela */
    hist(id) { ABRE[id] = !ABRE[id]; atualiza() },
    ne: () => formE(), ee: id => formE(id), se: saveE, xe: delE, cnpj: cnpjIn, add: addTipo,
    np: emp0 => formP(emp0), ep: (id, foco) => formP(null, id, foco), sp: saveP, xp: delP, pe() { tipoOpts(); empInfo(); pagInfo() }, pi: pagInfo, pa: arqSel,
    vf(i) { const n = num(i.value); if (isFinite(n) && n > 0) i.value = fnum(n) },
    ver, dl, xl, _r: render
  };
})();
