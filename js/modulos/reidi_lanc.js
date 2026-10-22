/* Módulo "Projeção REIDI" · lançamento das compras previstas (INCLUIR · EDITAR · EXCLUIR) + exportação da planilha no modelo.
   As áreas responsáveis lançam aqui; o relatório REIDI lê os mesmos dados (js/core/reidi_dados.js → tabela public.reidi_compras),
   então cada lançamento aparece na hora para todos os usuários, em qualquer navegador.
   PAGAMENTO PARCIAL: ao mudar o Status para "Pago" abre uma janela pedindo o VALOR PAGO e a DATA DO PAGAMENTO (o valor sugerido é o saldo; pode ser só uma parte da compra).
     Cada pagamento fica em public.reidi_pagamentos (supabase/reidi-pagamentos.sql); o status é calculado: A pagar → Parcial (pago < negociado) → Pago (pago = negociado). O banco recusa pagamento acima do saldo.
     O relatório REIDI › REIDI Realizado mostra total, valor pago e saldo. "💰 N pagamento(s)" lista, edita e exclui os pagamentos de uma compra. Voltar para "A pagar" exclui os pagamentos da compra.
   Quem pode: administrador (tudo) e Lançador REIDI (inclui compras e edita/exclui SOMENTE as que ele mesmo lançou; a regra real fica no banco — RLS). O Responsável é sempre o nome do cadastro de quem lançou.
   Metodologia: o comprador NEGOCIA com o fornecedor e digita só o Valor Original e o Valor Negociado.
     economia REAL = original − negociado · % aplicado (cálculo reverso) = (1 − negociado ÷ original) ÷ 90% · a alíquota de referência (3,65% ou 9,25%, a mais próxima do % aplicado)
     dá a economia TEÓRICA = original × alíquota × 90%. Não há mais caixa de % de PIS/COFINS no formulário (RDB.ident em js/core/reidi_dados.js).
   TABELA (colunas, nesta ordem): Nº (com a caixa de seleção) · Fornecedor · Item/descrição · Categoria · Nº pedido/processo/NF · Pagamento previsto · Valor original · Valor negociado · Valor pago · Saldo ·
     Economia REIDI real · Economia REIDI teórica · Status · Ações. Mostrar a "Data prevista" junto do "Pagamento previsto" era redundante: fica só o Pagamento previsto (dia 15 ou último dia do mês). A data digitada no
     lançamento segue no formulário e continua sendo a que ordena a tabela (por isso a ordem não mudou; o cabeçalho "Pagamento previsto" é quem ordena). O % PIS/COFINS aplicado (com a alíquota de referência) e o
     Responsável saíram da tabela (o site continua calculando a alíquota para a economia teórica; o Responsável segue no filtro e na busca).
   EXCLUIR VÁRIAS DE UMA VEZ: cada linha tem uma caixa de seleção (dentro da coluna Nº; a do cabeçalho marca/desmarca todas as FILTRADAS que a pessoa pode excluir). Com algo marcado, uma barra fixa na base da tela mostra quantas, o valor
     e os pagamentos que vão junto, e o botão "Excluir N selecionadas" abre uma janela que LISTA o que será apagado. A seleção só vale para linhas que estão na tela (filtrou, pesquisou ou outra pessoa mexeu → o que saiu da tela sai da seleção).
     Ao confirmar, o site relê o banco: se alguma compra mudou enquanto a janela estava aberta, NADA é excluído e a lista é refeita. A exclusão vai em lotes de 50 por chamada (RDB.excluirLote); o banco confere a permissão de cada compra (Lançador só as dele).
   IMPORTAR O EXCEL: "⬆ Importar planilha" lê um Excel no modelo "Projeção Mensal de Compras REIDI" no navegador (js/core/reidi_importar.js), mostra uma PRÉVIA
     (novas · já estão na tabela · com erro) e, ao confirmar, sobe só as compras NOVAS para a tabela numa única gravação (tudo ou nada). Importar o mesmo arquivo de novo não duplica.
     As compras entram como "A pagar". Responsável: o administrador mantém o da planilha; quem só lança fica com o próprio nome (o banco confere: supabase/reidi-importar.sql).
   MÓDULO ISOLADO: usa de js/core: $, f, br, N, ROLE, PERM, PF, mo/closeMd/dlg (usuarios.js), uLog, RDB. */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="lanc"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), m2 = n => (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), p3 = n => (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }),
    pct = v => (Math.round((+v || 0) * 10000 + 1e-6) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
    num = v => { if (typeof v == 'number') return v; let s = String(v == null ? '' : v).trim().replace(/[^0-9.,-]/g, ''); if (!s) return NaN; if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (s.includes(',')) s = s.replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = parseFloat(s); return isNaN(n) ? NaN : n },
    dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '', DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], wd = iso => DS[new Date(iso + 'T12:00:00Z').getUTCDay()],
    mesNome = ym => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+ym.slice(5) - 1] + '/' + ym.slice(2, 4),
    sum = (a, k) => a.reduce((t, x) => t + (+x[k] || 0), 0);
  let FQ = '', FC = '', FR = '', FM = '', FS = '', SK = 'dt', SD = 1, MSG = '', ERR = false, EDIT = null, PEND = false, PCID = null, PEID = null, PLID = null, SEL = new Set(), LOTE = null; /* SEL = ids marcados para excluir · LOTE = janela "Excluir N compras" aberta · PCID/PEID = compra e pagamento do formulário de pagamento · PLID = compra cuja lista de pagamentos está aberta */
  const LEG = '<p class="text-xs text-slate-500 mt-2">Economia REIDI real: <b class="text-emerald-600 dark:text-emerald-400">verde</b> = igual ou maior que a teórica · <b class="text-rose-600 dark:text-rose-400">vermelho</b> = menor que a teórica.</p>';
  const adm = () => ROLE == 'admin', eu = () => (typeof PF != 'undefined' && PF && (PF.nome || PF.login)) || '', meu = x => !!(x && x.cp && typeof PF != 'undefined' && PF && x.cp == PF.id), pode = x => adm() || (PERM.tem('lanc.lancar') && meu(x)); /* administrador edita/exclui todas; quem tem "Acessar e lançar compras" só as que lançou (o banco confere igual) */
  const SORT = { f: x => N(x.f), i: x => N(x.i), cat: x => N(x.cat), dt: x => x.dt, vo: x => x.vo, vn: x => x.vn, pago: x => x.pago, sd: x => x.sd, ec: x => x.vo - x.vn, st: x => x.st, et: x => RDB.teor(x.vo, x.pc) },
    SCS = { 'Pago': '!text-emerald-600', 'Parcial': '!text-sky-600', 'A pagar': '!text-amber-600' }, SCT = { 'Pago': 'text-emerald-600', 'Parcial': 'text-sky-600', 'A pagar': 'text-amber-600' }, /* cor de cada status (classes completas: o Tailwind só gera o que encontra escrito) */
    dh = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  function filtradas() {
    const q = N(FQ), r = RDB.L.filter(x => (!q || N([x.f, x.i, x.ped, x.rp, x.cat].join(' ')).includes(q)) && (!FC || x.cat == FC) && (!FR || x.rp == FR) && (!FM || x.dt.slice(0, 7) == FM) && (!FS || x.st == FS)), g = SORT[SK] || SORT.dt;
    return r.sort((a, b) => { const A = g(a), B = g(b); return (A < B ? -1 : A > B ? 1 : 0) * SD || (a.f < b.f ? -1 : 1) })
  }
  const opts = (arr, v, todos) => `<option value="">${todos}</option>` + arr.map(x => `<option value="${esc(x[0])}" ${x[0] == v ? 'selected' : ''}>${esc(x[1])}</option>`).join('');
  const th = (k, t, r, dica, quebra) => `<th class="px-2 py-2 ${r ? 'text-right' : ''} ${quebra ? '' : 'whitespace-nowrap'} ${SORT[k] ? 'cursor-pointer select-none' : ''}"${dica ? ` title="${esc(dica)}"` : ''} ${SORT[k] ? `onclick="lanc.s('${k}')"` : ''}>${t}${SK == k ? (SD > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="flex-1 min-w-[18rem]"><h1 class="text-2xl font-bold leading-tight">Projeção de Compras REIDI</h1><p class="text-sm text-slate-500">Lançamento das compras previstas · o relatório REIDI e todos os usuários veem na hora${RDB.L.length ? ' · ' + RDB.L.length + ' compra(s)' : ''}</p>${ROLE != 'admin' ? `<p id="lanc-aviso" class="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">Você pode editar e excluir apenas os lançamentos feitos por você (${RDB.L.filter(meu).length}). Os demais aparecem com 🔒.</p>` : ''}</div>
    <div class="flex flex-wrap items-center justify-end gap-2"><button class="btn" onclick="lanc.f()">＋ Incluir compra</button><button id="lanc-imp" class="btn2" title="Sobe para a tabela as compras de um Excel no modelo Projeção Mensal de Compras REIDI (mostra uma prévia antes de gravar)" onclick="lanc.imp()">⬆ Importar planilha</button>${adm() ? '<button class="btn2" title="Baixa a planilha no modelo Projeção Mensal de Compras REIDI" onclick="lanc.exp()">⬇ Exportar planilha (modelo)</button>' : ''}</div></div>
    ${RDB.ok && !RDB.PGok ? '<div id="lanc-pgaviso" class="text-sm rounded-lg px-3 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-300">⚠ Os <b>pagamentos parciais</b> ainda não foram ativados no banco (falta rodar <b>supabase/reidi-pagamentos.sql</b> no Supabase). Por enquanto, marcar “Pago” quita a compra inteira.</div>' : ''}
    ${MSG ? `<div id="lanc-msg" class="text-sm rounded-lg px-3 py-2 ${ERR === 2 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  function render() {
    if (!RDB.ok) { VIEW.innerHTML = head() + `<div class="card py-10 text-center text-slate-500">${ERR ? '' : 'Carregando…'}</div>`; return }
    const T = filtradas(), cats = [...new Set(RDB.L.map(x => x.cat).filter(Boolean))].sort(), rps = [...new Set(RDB.L.map(x => x.rp).filter(Boolean))].sort(), mes = [...new Set(RDB.L.map(x => x.dt.slice(0, 7)))].sort(),
      vo = sum(T, 'vo'), vn = sum(T, 'vn'), pg = sum(T, 'pago'), sdo = sum(T, 'sd'), et = T.reduce((t, x) => t + RDB.teor(x.vo, x.pc), 0), kp = (t, v, s) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-xl font-bold mt-0.5">${v}</div>${s ? `<div class="text-xs text-slate-500">${s}</div>` : ''}</div>`;
    VIEW.innerHTML = head() + `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">${kp('Compras', T.length, T.length != RDB.L.length ? 'de ' + RDB.L.length + ' lançadas' : 'lançadas')}${kp('Valor original', brl(vo))}${kp('Valor negociado', brl(vn), 'pago ' + brl(pg) + ' · saldo ' + brl(sdo))}${kp('Economia REIDI real', '<span class="' + RDB.cor(vo - vn, et) + '" title="' + esc(RDB.dica(vo - vn, et)) + '">' + brl(vo - vn) + '</span>', vo ? pct((vo - vn) / vo) + ' do original' : '')}${kp('Economia REIDI teórica', brl(et), vo ? pct(et / vo) + ' do valor original' : '')}${kp('Real × teórica', et ? pct((vo - vn) / et) : '—', 'diferença ' + brl(vo - vn - et))}</div>
    <div class="card"><div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3"><input id="lanc-q" class="inp col-span-2" placeholder="🔍 Buscar fornecedor, item, pedido ou responsável" value="${esc(FQ)}" oninput="lanc.q(this.value)">
      <select class="inp ${FS ? 'ring-2 ring-amber-500' : ''}" title="Filtrar por status" onchange="lanc.fl('s',this.value)">${opts([['A pagar', 'A pagar'], ['Parcial', 'Parcial'], ['Pago', 'Pago']], FS, 'Todos os status')}</select>
      <select class="inp" onchange="lanc.fl('c',this.value)">${opts(cats.map(c => [c, c]), FC, 'Todas as categorias')}</select><select class="inp" onchange="lanc.fl('r',this.value)">${opts(rps.map(c => [c, c]), FR, 'Todos os responsáveis')}</select>
      <select class="inp" onchange="lanc.fl('m',this.value)">${opts(mes.map(m => [m, mesNome(m)]), FM, 'Todos os meses')}</select></div>
      <div><div id="lanc-t" class="overflow-x-auto"></div><div id="lanc-sel" class="sticky bottom-3 z-20 pointer-events-none"></div></div></div>`;
    tbl(T)
  }
  function tbl(T) {
    T = T || filtradas(); const el = document.getElementById('lanc-t'); if (!el) return; podaSel(T);
    el.innerHTML = RDB.L.length ? `<table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-2 py-2 whitespace-nowrap">${cbTodas(T)}</th>${th('f', 'Fornecedor')}${th('i', 'Item / descrição')}${th('cat', 'Categoria')}<th class="px-2 py-2 min-w-[7rem]">Nº pedido / processo / NF</th>${th('dt', 'Pagamento previsto', 0, 'Data de pagamento prevista pelo calendário (dia 15 ou último dia do mês). Os pagamentos reais ficam em “💰 pagamentos”.', 1)}${th('vo', 'Valor original', 1)}${th('vn', 'Valor negociado', 1)}${th('pago', 'Valor pago', 1)}${th('sd', 'Saldo', 1)}${th('ec', 'Economia REIDI real', 1)}${th('et', 'Economia REIDI teórica', 1)}${th('st', 'Status')}<th class="px-2 py-2 text-right">Ações</th></tr></thead>
      <tbody>${T.map((x, i) => { const p = pode(x), pg = RDB.pagto(x.dt); return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top${SEL.has(x.id) ? ' bg-indigo-500/10' : ''}" data-id="${esc(x.id)}"><td class="px-2 py-1.5 text-slate-500 whitespace-nowrap">${cbLinha(x, i, p)}</td><td class="px-2 py-1.5 font-medium">${esc(x.f)}</td><td class="px-2 py-1.5">${esc(x.i)}</td><td class="px-2 py-1.5 whitespace-nowrap">${esc(x.cat)}</td><td class="px-2 py-1.5">${esc(x.ped) || '-'}</td><td class="px-2 py-1.5 whitespace-nowrap">${dmy(pg)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(x.vo)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(x.vn)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap" data-c="pago">${x.pago > 0 ? brl(x.pago) + '<div class="text-[11px] text-slate-500">' + pct(x.pf) + ' do negociado</div>' : '<span class="text-slate-400">—</span>'}</td><td class="px-2 py-1.5 text-right whitespace-nowrap ${x.pago > 0 && x.sd > 0 ? 'font-medium text-sky-700 dark:text-sky-300' : ''}" data-c="sd">${x.sd > 0 ? brl(x.sd) : '<span class="text-slate-400">—</span>'}</td><td class="px-2 py-1.5 text-right whitespace-nowrap ${RDB.cor(x.vo - x.vn, RDB.teor(x.vo, x.pc))}" title="${esc(RDB.dica(x.vo - x.vn, RDB.teor(x.vo, x.pc)))}">${brl(x.vo - x.vn)}<div class="text-[11px] text-slate-500">${x.vo ? pct((x.vo - x.vn) / x.vo) : ''}</div></td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(RDB.teor(x.vo, x.pc))}<div class="text-[11px] text-slate-500">${x.vo ? pct(x.pc * RDB.FATOR) : ''}</div></td>
        <td class="px-2 py-1.5 whitespace-nowrap" data-c="st" title="${esc(x.ae ? 'Última alteração: ' + new Date(x.ae).toLocaleString('pt-BR') + (x.an ? ' · ' + x.an : '') : '')}">${p ? `<select class="inp !py-0.5 !text-xs font-semibold ${SCS[x.st]}" title="${RDB.PGok ? 'Escolher “Pago” abre a janela para informar o valor pago e a data do pagamento (pode ser só uma parte)' : 'Status da compra'}" onchange="lanc.st('${x.id}',this.value,this)"><option ${x.st == 'A pagar' ? 'selected' : ''}>A pagar</option>${x.st == 'Parcial' ? '<option selected disabled>Parcial</option>' : ''}<option ${x.st == 'Pago' ? 'selected' : ''}>Pago</option></select>` : `<span class="text-xs font-semibold ${SCT[x.st]}">${esc(x.st)}</span>`}${RDB.PGok && x.pgs.length ? `<div><button type="button" class="text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline" onclick="lanc.pl('${x.id}')" title="Ver${p ? ', editar ou excluir' : ''} os pagamentos desta compra">💰 ${x.pgs.length} pagamento${x.pgs.length > 1 ? 's' : ''}</button></div>` : ''}</td>
        <td class="px-2 py-1.5 text-right whitespace-nowrap">${p ? `<button class="btn2 !py-1 !text-xs" onclick="lanc.f('${x.id}')">Editar</button> <button class="btn2 !py-1 !text-xs !text-rose-500" onclick="lanc.del('${x.id}')">Excluir</button>` : '<span class="text-xs text-slate-400" title="Só quem lançou (ou o administrador) pode editar ou excluir">🔒</span>'}</td></tr>` }).join('') || '<tr><td colspan="14" class="px-2 py-6 text-center text-slate-500">Nenhuma compra encontrada com esse filtro.</td></tr>'}</tbody>
      <tfoot class="font-semibold border-t-2 border-slate-300 dark:border-slate-700"><tr><td class="px-2 py-2" colspan="6">TOTAL (${T.length})</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'vo'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'vn'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'pago'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'sd'))}</td><td class="px-2 py-2 text-right whitespace-nowrap ${RDB.cor(sum(T, 'vo') - sum(T, 'vn'), T.reduce((t, x) => t + RDB.teor(x.vo, x.pc), 0))}">${brl(sum(T, 'vo') - sum(T, 'vn'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(T.reduce((t, x) => t + RDB.teor(x.vo, x.pc), 0))}</td><td colspan="2"></td></tr></tfoot></table>${LEG}`
      : '<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">📝</div><p class="font-semibold">Nenhuma compra lançada ainda</p><p class="text-sm mt-1">Clique em “Incluir compra” para lançar uma compra ou em “Importar planilha” para subir o Excel da Projeção Mensal de Compras REIDI.</p></div>';
    selUi()
  }

  /* ---------- formulário (incluir / editar) ---------- */
  function form(id) {
    const x = id ? RDB.L.find(r => r.id == id) : null; if (id && (!x || !pode(x))) return; EDIT = id || null;
    const sup = [...new Set(RDB.L.map(r => r.f))].sort(), cats = [...new Set(['Pedido de Compra', 'Previsão', ...(x && x.cat ? [x.cat] : [])])],
      v = x || { f: '', i: '', st: 'A pagar', cat: 'Previsão', ped: '', dt: '', rp: eu(), vo: '', vn: '', ba: RDB.hoje() }, L = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar compra' : 'Incluir compra'}</h2><div class="max-h-[70vh] overflow-y-auto pr-1">
    ${L('Fornecedor *')}<input id="lf-f" class="inp w-full mb-3" list="lf-fl" value="${esc(v.f)}" autocomplete="off"><datalist id="lf-fl">${sup.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    ${L('Item / descrição')}<input id="lf-i" class="inp w-full mb-3" value="${esc(v.i)}">
    <div class="grid grid-cols-2 gap-3 mb-3"><div>${L('Categoria')}<select id="lf-c" class="inp w-full">${cats.map(c => `<option value="${esc(c)}" ${c == v.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div>${L('Nº pedido / processo / NF')}<input id="lf-p" class="inp w-full" value="${esc(v.ped)}"></div></div>
    <div class="grid grid-cols-2 gap-3 mb-1"><div>${L('Data prevista de pagamento *')}<input id="lf-d" type="date" class="inp w-full" value="${esc(v.dt)}" oninput="lanc.pv()"></div><div>${L('Responsável', x ? '(quem lançou)' : '(seu nome de cadastro)')}<input id="lf-r" class="inp w-full opacity-80" value="${esc(v.rp || eu())}" readonly tabindex="-1" title="O responsável é quem lança a compra e não pode ser alterado"></div></div>
    <p id="lf-pg" class="text-xs text-slate-500 mb-3"></p>
    <div class="grid grid-cols-2 gap-3 mb-2"><div>${L('Valor original (R$) *')}<input id="lf-vo" class="inp w-full" inputmode="decimal" value="${v.vo === '' ? '' : esc(m2(v.vo))}" oninput="lanc.pv()"></div><div>${L('Valor negociado com o fornecedor (R$) *')}<input id="lf-vn" class="inp w-full" inputmode="decimal" value="${v.vn === '' ? '' : esc(m2(v.vn))}" oninput="lanc.pv()"></div></div>
    <div id="lf-h" class="text-xs text-slate-500 rounded-lg border border-slate-300/70 dark:border-slate-700 px-3 py-2 mb-3"></div>
    <div class="grid grid-cols-2 gap-3 mb-3">${RDB.PGok ? '' : `<div>${L('Status')}<select id="lf-s" class="inp w-full"><option ${v.st != 'Pago' ? 'selected' : ''}>A pagar</option><option ${v.st == 'Pago' ? 'selected' : ''}>Pago</option></select></div>`}<div>${L('Data base de atualização')}<input id="lf-b" type="date" class="inp w-full" value="${esc(v.ba)}"></div>${RDB.PGok && x ? `<div>${L('Situação do pagamento', '(automática)')}<div id="lf-sit" class="inp w-full opacity-80 !flex items-center text-sm" title="Calculada pelos pagamentos. Para registrar ou corrigir, use o Status e “💰 pagamentos” na tabela.">${esc(x.st)} · pago ${brl(x.pago)} · saldo ${brl(x.sd)}</div></div>` : ''}</div>
    <p id="lf-pv" class="text-sm rounded-lg bg-slate-500/10 px-3 py-2 mb-3"></p></div>
    <p id="lf-e" class="hidden text-sm text-rose-500 mb-3"></p><div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="lf-ok" class="btn" onclick="lanc.sv()">${x ? 'Salvar alterações' : 'Incluir compra'}</button></div>`);
    pv(); foco('lf-f')
  }
  const g = id => (document.getElementById(id) || {}).value || '';
  /* lê o formulário; pc (alíquota de referência) NÃO é digitado: sai do cálculo reverso entre o valor original e o valor negociado */
  function lido() { const vo = num(g('lf-vo')), vn = num(g('lf-vn')); return { f: g('lf-f').trim(), i: g('lf-i').trim(), cat: g('lf-c').trim() || 'Previsão', ped: g('lf-p').trim(), dt: g('lf-d'), pc: !isNaN(vo) && !isNaN(vn) ? RDB.ident(vo, vn).al : NaN, rp: g('lf-r').trim(), vo, vn, st: g('lf-s') == 'Pago' ? 'Pago' : 'A pagar', ba: g('lf-b') || RDB.hoje() } }
  /* legenda do cálculo reverso + prévia da economia, atualizadas a cada tecla */
  function pv() {
    const x = lido(), a = document.getElementById('lf-pg'), b = document.getElementById('lf-pv'), h = document.getElementById('lf-h'); if (!a || !b) return;
    const FT = Math.round(RDB.FATOR * 100) + '%', ok = !isNaN(x.vo) && !isNaN(x.vn), I = ok ? RDB.ident(x.vo, x.vn) : null, B = t => `<b class="text-slate-800 dark:text-slate-100">${t}</b>`;
    a.textContent = x.dt ? 'Pagamento em ' + dmy(RDB.pagto(x.dt)) + ' (' + wd(RDB.pagto(x.dt)) + ') · transferência 3 dias antes' : '';
    if (h) h.innerHTML = ok && x.vo > 0
      ? `<div>% PIS/COFINS aplicado = (1 − valor negociado ÷ valor original) ÷ ${FT} = (1 − ${m2(x.vn)} ÷ ${m2(x.vo)}) ÷ ${FT} = ${B(pct(I.pa))}</div><div class="mt-0.5">Alíquota de referência identificada: ${B(pct(I.al))} (a mais próxima entre ${RDB.ALIQ.map(pct).join(' e ')}) · economia teórica = valor original × ${pct(I.al)} × ${FT}.</div>`
      : `<div>% PIS/COFINS aplicado = (1 − valor negociado ÷ valor original) ÷ ${FT}</div><div class="mt-0.5">Calculado sozinho (cálculo reverso) assim que você informar o valor original e o valor negociado com o fornecedor.</div>`;
    const et = ok ? RDB.teor(x.vo, I.al) : 0, df = ok ? I.ec - et : 0, cd = ok ? RDB.cor(I.ec, et) : '';
    b.innerHTML = ok
      ? `Economia REIDI real: <b class="${cd}">${brl(I.ec)}</b>${x.vo ? ' (' + pct(I.ec / x.vo) + ' do valor original)' : ''}${x.vo > 0 ? ` · teórica <b>${brl(et)}</b> · diferença <b class="${cd}">${brl(df)}</b>` : ''}${x.vn > x.vo ? ' <span class="text-amber-500">⚠ valor negociado maior que o original</span>' : ''}`
      : '<span class="text-slate-500">Informe o valor original e o valor negociado para ver a economia.</span>'
  }
  async function sv() {
    const x = lido(), er = m => { const e = document.getElementById('lf-e'); e.textContent = m; e.classList.remove('hidden') };
    if (!x.f) return er('Informe o fornecedor.'); if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dt)) return er('Informe a data prevista de pagamento.');
    if (isNaN(x.vo) || x.vo < 0) return er('Informe o valor original.'); if (isNaN(x.vn) || x.vn < 0) return er('Informe o valor negociado com o fornecedor.');
    if (EDIT && RDB.PGok) { const k = RDB.L.find(r => r.id == EDIT); if (k && RDB.c(x.vn) < RDB.c(k.pago)) return er('O valor negociado (' + brl(x.vn) + ') não pode ficar menor que o já pago (' + brl(k.pago) + '). Ajuste ou exclua os pagamentos antes (“💰 pagamentos” na tabela).') }
    const b = document.getElementById('lf-ok'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      const id = EDIT; if (id) await RDB.editar(id, x); else await RDB.incluir(x);
      const t = (id ? 'REIDI: editou compra ' : 'REIDI: incluiu compra ') + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn); try { uLog(t) } catch (e) { }
      closeMd(); MSG = id ? '✔ Compra atualizada.' : '✔ Compra incluída. Já aparece no relatório REIDI para todos.'; ERR = false; render()
    } catch (e) { b.disabled = false; b.textContent = EDIT ? 'Salvar alterações' : 'Incluir compra'; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function del(id) {
    const x = RDB.L.find(r => r.id == id); if (!x || !pode(x)) return;
    const np = RDB.PGok ? x.pgs.length : 0;
    dlg('Excluir compra', `Excluir a compra de <b>${esc(x.f)}</b> (${esc(x.i) || 'sem descrição'}), ${dmy(x.dt)}, ${brl(x.vn)}? Ela some do relatório REIDI para todos.${np ? ` Os <b>${np} pagamento${np > 1 ? 's' : ''}</b> já registrado${np > 1 ? 's' : ''} (${brl(x.pago)}) também serão excluídos e saem do REIDI Realizado.` : ''} Esta ação não pode ser desfeita.`, async () => {
      try { await RDB.excluir(id); try { uLog('REIDI: excluiu compra ' + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn)) } catch (e) { } MSG = '✔ Compra excluída.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
    })
  }

  /* ---------- SELEÇÃO E EXCLUSÃO EM LOTE (caixas de seleção da tabela) ----------
     SEL = ids marcados. A seleção só existe para linhas que estão NA TELA (filtro atual) e que a pessoa pode excluir (pode()): ao filtrar, pesquisar ou quando outra pessoa exclui/altera, o que sai da tela sai da seleção.
     "Excluir selecionadas" abre uma janela que LISTA o que será apagado (e os pagamentos que vão junto); ao confirmar, relê os dados e, se alguma compra mudou enquanto a janela estava aberta, NÃO exclui e pede nova conferência. */
  function podaSel(T) { const ok = new Set((T || filtradas()).filter(pode).map(x => String(x.id))); [...SEL].forEach(id => { if (!ok.has(String(id))) SEL.delete(id) }) }
  const pl_ = (n, s, p) => n == 1 ? s : p, pt = t => { t = String(t == null ? '' : t).trim(); return t + (/[.!?…]$/.test(t) ? '' : '.') } /* mensagem de erro do banco + ponto final (se faltar) */, cts = (L, k) => L.reduce((t, x) => t + RDB.c(x[k]), 0),
    /* assinatura da compra para detectar mudança entre abrir a janela e confirmar */
    sigC = x => [x.id, x.ae, x.pgs ? x.pgs.length : 0, RDB.c(x.vn), RDB.c(x.pago)].join('|');
  /* caixa "marcar todas" do cabeçalho (todas as filtradas que a pessoa pode excluir) e caixa de cada linha */
  function cbTodas(T) {
    const d = T.filter(pode).length;
    return `<label class="inline-flex items-center gap-1.5 ${d ? 'cursor-pointer' : ''}" title="Marcar ou desmarcar todas as compras filtradas que você pode excluir"><input type="checkbox" id="lanc-all" class="h-4 w-4 rounded accent-indigo-600" ${d ? '' : 'disabled'} aria-label="Marcar todas as ${d} compras filtradas que você pode excluir" onchange="lanc.sa(this.checked)"><span>Nº</span></label>`
  }
  function cbLinha(x, i, p) {
    return `<label class="inline-flex items-center gap-1.5 ${p ? 'cursor-pointer' : ''}"><input type="checkbox" class="h-4 w-4 rounded accent-indigo-600" data-sel="${esc(x.id)}" ${SEL.has(x.id) ? 'checked' : ''} ${p ? '' : 'disabled title="Só quem lançou (ou o administrador) pode excluir"'} aria-label="Marcar para excluir: ${esc(x.f)}${x.i ? ' · ' + esc(x.i) : ''}, ${dmy(x.dt)}" onchange="lanc.sk('${x.id}',this.checked)"><span>${i + 1}</span></label>`
  }
  /* barra fixa na base da tela com o que está marcado */
  function barra(L) {
    const n = L.length, np = RDB.PGok ? L.reduce((t, x) => t + x.pgs.length, 0) : 0, pv = RDB.PGok ? cts(L, 'pago') : 0;
    return `<div class="pointer-events-auto mt-3 rounded-xl border border-indigo-500/40 bg-white/95 dark:bg-slate-900/95 shadow-lg backdrop-blur px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2" role="status" aria-live="polite">
      <div class="text-xs sm:text-sm mr-auto min-w-0"><b>${n}</b> ${pl_(n, 'compra selecionada', 'compras selecionadas')} · <b>${brl(RDB.r2(cts(L, 'vn')))}</b> negociado${np ? ` · <span class="text-amber-700 dark:text-amber-300">inclui ${np} ${pl_(np, 'pagamento registrado', 'pagamentos registrados')} (${brl(RDB.r2(pv))})</span>` : ''}</div>
      <div class="flex flex-wrap items-center gap-2 ml-auto"><button type="button" id="lanc-sl" class="btn2 !text-xs sm:!text-sm" onclick="lanc.sl()">Limpar seleção</button>
      <button type="button" id="lanc-dx" class="btn !bg-rose-600 hover:!bg-rose-500 !text-xs sm:!text-sm" onclick="lanc.dx()">🗑 Excluir ${n == 1 ? '1 selecionada' : n + ' selecionadas'}</button></div></div>`
  }
  /* atualiza só o que depende da seleção (linhas, caixa do cabeçalho, barra) sem refazer a tabela: o foco e a rolagem ficam onde estão */
  function selUi() {
    const t = document.getElementById('lanc-t'), bar = document.getElementById('lanc-sel'); if (!t || !bar) return;
    const dels = filtradas().filter(pode), L = dels.filter(x => SEL.has(x.id)), S = new Set(L.map(x => String(x.id)));
    t.querySelectorAll('tr[data-id]').forEach(tr => { const on = S.has(tr.dataset.id); tr.classList.toggle('bg-indigo-500/10', on); const c = tr.querySelector('input[data-sel]'); if (c && c.checked != on) c.checked = on });
    const all = document.getElementById('lanc-all'); if (all) { all.checked = !!dels.length && L.length == dels.length; all.indeterminate = L.length > 0 && L.length < dels.length }
    bar.innerHTML = L.length ? barra(L) : ''
  }
  function selCompra(id, on) { const x = RDB.L.find(r => r.id == id); if (!x || !pode(x)) return; if (on) SEL.add(x.id); else SEL.delete(x.id); selUi() }
  function selTodas(on) { filtradas().filter(pode).forEach(x => { if (on) SEL.add(x.id); else SEL.delete(x.id) }); selUi() }
  function selLimpa() { SEL.clear(); selUi() }
  /* janela de confirmação: lista exatamente o que será excluído */
  function dxAbrir(aviso) {
    const L = filtradas().filter(x => SEL.has(x.id) && pode(x)); if (!L.length) { LOTE = null; closeMd(); return }
    LOTE = { ids: L.map(x => x.id), snap: L.map(sigC), busy: false };
    const n = L.length, np = RDB.PGok ? L.reduce((t, x) => t + x.pgs.length, 0) : 0, pv = RDB.PGok ? cts(L, 'pago') : 0, titulo = n == 1 ? '1 compra' : n + ' compras',
      lin = x => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top"><td class="px-2 py-1.5 font-medium">${esc(x.f)}<div class="sm:hidden text-xs font-normal text-slate-500">${esc(x.i) || 'sem descrição'} · ${dmy(x.dt)}</div></td><td class="px-2 py-1.5 hidden sm:table-cell">${esc(x.i) || '<span class="text-slate-400">—</span>'}</td><td class="px-2 py-1.5 whitespace-nowrap hidden sm:table-cell">${dmy(x.dt)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">${brl(x.vn)}</td>${RDB.PGok ? `<td class="px-2 py-1.5 text-right sm:whitespace-nowrap">${x.pgs.length ? `<span class="text-amber-700 dark:text-amber-300">💰 ${x.pgs.length} · ${brl(x.pago)}</span>` : '<span class="text-slate-400">—</span>'}</td>` : ''}</tr>`;
    mo(`<h2 class="text-lg font-bold mb-1">Excluir ${titulo}?</h2>
      <p class="text-sm text-slate-500 mb-3">Confira a lista: ${n == 1 ? 'esta compra some' : 'estas compras somem'} do relatório REIDI para todos. Esta ação não pode ser desfeita e fica registrada na Auditoria.</p>
      ${aviso ? `<p id="lx-aviso" class="text-sm rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-3">⚠ ${esc(aviso)}</p>` : ''}
      <div class="grid grid-cols-2 ${RDB.PGok ? 'sm:grid-cols-3' : ''} gap-2 mb-3 text-center">${bx('Compras', n)}${bx('Valor negociado', brl(RDB.r2(cts(L, 'vn'))))}${RDB.PGok ? bx('Pagamentos junto', np ? np + ' · ' + brl(RDB.r2(pv)) : 'nenhum', np ? 'text-amber-800 dark:text-amber-300' : '', 'col-span-2 sm:col-span-1') : ''}</div>
      ${np ? `<p id="lx-pag" class="text-sm rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-3">💰 ${pl_(np, 'O pagamento registrado', 'Os ' + np + ' pagamentos registrados')} ${n == 1 ? 'nessa compra' : 'nessas compras'} (${brl(RDB.r2(pv))}) ${pl_(np, 'também será excluído', 'também serão excluídos')} e ${pl_(np, 'sai', 'saem')} do REIDI Realizado.</p>` : ''}
      <div class="max-h-[40vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"><table class="w-full text-xs sm:text-sm" data-tab="lx"><thead class="text-xs uppercase text-slate-500 text-left sticky top-0 bg-white dark:bg-slate-900"><tr><th class="px-2 py-1.5">Fornecedor</th><th class="px-2 py-1.5 hidden sm:table-cell">Item</th><th class="px-2 py-1.5 hidden sm:table-cell">Data prevista</th><th class="px-2 py-1.5 text-right">Valor negociado</th>${RDB.PGok ? '<th class="px-2 py-1.5 text-right">Pagamentos</th>' : ''}</tr></thead>
        <tbody>${L.map(lin).join('')}</tbody>
        <tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="px-2 py-1.5">Total (${n})</td><td class="hidden sm:table-cell" colspan="2"></td><td class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">${brl(RDB.r2(cts(L, 'vn')))}</td>${RDB.PGok ? `<td class="px-2 py-1.5 text-right sm:whitespace-nowrap">${np ? brl(RDB.r2(pv)) : ''}</td>` : ''}</tr></tfoot></table></div>
      <p id="lx-e" class="hidden text-sm text-rose-500 mt-3" role="alert"></p>
      <div class="flex justify-end gap-2 mt-4"><button id="lx-no" class="btn2" onclick="lanc.dn()">Cancelar</button><button id="lx-ok" class="btn !bg-rose-600 hover:!bg-rose-500" onclick="lanc.dk()">Excluir ${titulo}</button></div>`);
    const b = document.getElementById('mdb'); if (b) b.style.maxWidth = '50rem';
    foco('lx-no') /* o foco começa em "Cancelar": um Enter sem querer não exclui */
  }
  async function dxOk() {
    const I = LOTE; if (!I || I.busy) return; const ok = el('lx-ok'), no = el('lx-no'), er = m => { const e = el('lx-e'); if (e) { e.textContent = m; e.classList.remove('hidden') } }, rot = ok ? ok.textContent : '';
    I.busy = true; if (ok) { ok.disabled = true; ok.textContent = 'Excluindo…' } if (no) no.disabled = true;
    const volta = m => { I.busy = false; if (ok) { ok.disabled = false; ok.textContent = rot } if (no) no.disabled = false; er(m) };
    try {
      await RDB.carregar(); /* dados do banco AGORA: a tabela pode ter mudado enquanto a janela estava aberta */
      const atuais = I.ids.map(id => RDB.L.find(r => r.id == id)), mudou = atuais.some((x, i) => x && sigC(x) != I.snap[i]);
      if (mudou) { podaSel(); dxAbrir('Alguma compra mudou enquanto você conferia (alguém editou a compra ou lançou/excluiu pagamentos). Nada foi excluído: confira a lista atualizada e confirme de novo.'); return }
      const L = atuais.filter(Boolean);
      if (!L.length) { LOTE = null; closeMd(); SEL.clear(); MSG = 'As compras selecionadas já tinham sido excluídas por outra pessoa. Nada foi excluído por você.'; ERR = 2; render(); return }
      const r = await RDB.excluirLote(L.map(x => x.id)), feitas = new Set(r.ok.map(String)), F = L.filter(x => feitas.has(String(x.id))), n = F.length, ficou = I.ids.length - n; /* ficou = o que NÃO foi excluído por esta ação (já tinha sido excluído por outra pessoa, ou o banco não deixou) */
      if (r.erro && !n) return volta('Não foi possível excluir: ' + pt(r.erro.message || r.erro) + ' Nenhuma compra foi excluída.');
      const np = RDB.PGok ? F.reduce((t, x) => t + x.pgs.length, 0) : 0, pv = RDB.PGok ? cts(F, 'pago') : 0, vn = cts(F, 'vn');
      try { if (n > 1) await uLog('REIDI: excluiu em lote ' + n + ' compras · R$ ' + m2(RDB.r2(vn)) + ' negociado') } catch (e) { }
      for (let i = 0; i < F.length; i += 8) await Promise.all(F.slice(i, i + 8).map(x => { try { return uLog('REIDI: excluiu compra ' + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn)) } catch (e) { } }));
      LOTE = null; closeMd();
      if (r.erro) { MSG = `⚠ Não foi possível excluir todas: ${pt(r.erro.message || r.erro)} ${n} de ${I.ids.length} ${pl_(n, 'compra foi excluída', 'compras foram excluídas')}; as demais continuam selecionadas.`; ERR = true }
      else { SEL.clear(); MSG = `${ficou ? '⚠' : '✔'} ${n} ${pl_(n, 'compra excluída', 'compras excluídas')} (${brl(RDB.r2(vn))} de valor negociado)${np ? ` junto com ${np} ${pl_(np, 'pagamento', 'pagamentos')} (${brl(RDB.r2(pv))})` : ''}.` + (ficou ? ` ${ficou} ${pl_(ficou, 'não foi excluída', 'não foram excluídas')} (${pl_(ficou, 'já tinha sido excluída', 'já tinham sido excluídas')} por outra pessoa ou você não tem permissão).` : ''); ERR = ficou ? 2 : false }
      render()
    } catch (e) { volta('Não foi possível excluir: ' + pt(e && (e.message || e)) + ' Confira a conexão e tente de novo.') }
  }

  /* ---------- pagamentos (parciais ou integrais) ---------- */
  /* foco inicial da janela (30 ms depois de abrir). Não "rouba" o foco: se a pessoa já clicou ou digitou em algum campo da janela, deixa onde está. */
  function foco(id, sel) {
    setTimeout(() => {
      const e = document.getElementById(id), m = document.getElementById('mdb'), a = document.activeElement;
      if (!e || (m && a && a !== m && m.contains(a))) return;
      e.focus(); if (sel) e.select()
    }, 30)
  }
  const el = id => document.getElementById(id), bx = (t, v, cls, ex) => `<div class="rounded-lg bg-slate-500/10 px-2 py-1.5 min-w-0${ex ? ' ' + ex : ''}"><div class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="font-semibold tabular-nums whitespace-nowrap ${cls || ''}">${v}</div></div>`;
  /* janela "Registrar pagamento": pergunta o VALOR PAGO e a DATA DO PAGAMENTO. Sugere o saldo (pagar o que falta); digite um valor menor para pagar só uma parte. */
  function pagForm(id, pid, daLista) {
    const k = RDB.L.find(r => r.id == id); if (!k || !pode(k) || !RDB.PGok) return;
    const p = pid ? k.pgs.find(r => r.id == pid) : null; if (pid && !p) return;
    const ja = RDB.c(k.pago) - (p ? RDB.c(p.v) : 0), sd = RDB.c(k.vn) - ja, hoje = RDB.hoje();
    if (RDB.c(k.vn) <= 0) { dlg('Compra sem valor a pagar', `A compra de <b>${esc(k.f)}</b> está com valor negociado de ${brl(k.vn)}: não há o que pagar. Informe o valor negociado em “Editar” antes de registrar o pagamento.`); return }
    if (sd <= 0) { dlg('Compra já quitada', `A compra de <b>${esc(k.f)}</b> já está totalmente paga (${brl(k.pago)}). Para corrigir um pagamento, use “💰 pagamentos”.`); return }
    PCID = id; PEID = pid || null; PLID = daLista ? id : null;
    const L = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-1">${p ? 'Editar pagamento' : 'Registrar pagamento'}</h2>
      <p class="text-sm text-slate-500 mb-3"><b class="text-slate-700 dark:text-slate-200">${esc(k.f)}</b>${k.i ? ' · ' + esc(k.i) : ''}${k.ped ? ' · pedido ' + esc(k.ped) : ''}</p>
      <div class="grid grid-cols-3 gap-2 mb-3 text-center">${bx('Total negociado', brl(k.vn))}${bx(p ? 'Pago (sem este)' : 'Já pago', brl(ja / 100))}${bx(p ? 'Saldo (com este)' : 'Saldo', brl(sd / 100), 'text-sky-700 dark:text-sky-300')}</div>
      <div class="flex items-end justify-between gap-2">${L('Valor pago *', '(R$)')}<button type="button" class="text-xs text-indigo-600 dark:text-indigo-300 hover:underline mb-1" onclick="lanc.psd()" title="Preenche com o saldo da compra">usar o saldo (${m2(sd / 100)})</button></div>
      <input id="pg-v" class="inp w-full mb-3 text-right tabular-nums text-lg font-semibold" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${m2(p ? p.v : sd / 100)}" oninput="lanc.pi()" onblur="lanc.vf(this)" onfocus="this.select()" onkeydown="lanc.kd(event)">
      ${L('Data do pagamento *')}<input id="pg-d" type="date" class="inp w-full mb-3" min="2000-01-01" max="${hoje}" value="${esc(p ? p.d : hoje)}" oninput="lanc.pi()" onkeydown="lanc.kd(event)">
      ${L('Observação', '(opcional · ex.: nº da NF, parcela 1/3)')}<input id="pg-o" class="inp w-full mb-3" maxlength="300" value="${esc(p ? p.obs : '')}" onkeydown="lanc.kd(event)">
      <p id="pg-i" class="text-sm rounded-lg bg-slate-500/10 px-3 py-2 mb-3 min-h-[3.25rem]"></p>
      <p id="pg-e" class="hidden text-sm text-rose-500 mb-3"></p>
      <div class="flex justify-end gap-2"><button class="btn2" onclick="lanc.pc()">Cancelar</button><button id="pg-ok" class="btn" onclick="lanc.ps()">${p ? 'Salvar alterações' : 'Registrar pagamento'}</button></div>`);
    pi(); foco('pg-v', true)
  }
  /* resumo ao vivo: quanto sobra de saldo, se quita a compra, a economia REIDI proporcional e aviso de duplicidade */
  function pi() {
    const o = el('pg-i'), k = RDB.L.find(r => r.id == PCID); if (!o || !k) return;
    const p = PEID ? k.pgs.find(r => r.id == PEID) : null, v = num(g('pg-v')), ja = RDB.c(k.pago) - (p ? RDB.c(p.v) : 0), sd = RDB.c(k.vn) - ja; let t, c = 'text-slate-500';
    if (!isFinite(v) || v <= 0) t = g('pg-v').trim() ? 'Valor pago inválido: informe um valor em reais (ex.: 150.000,00).' : 'Informe o valor pago.';
    else {
      const ap = sd - RDB.c(v);
      if (ap < 0) { t = `⚠ O valor passa do saldo em <b>${brl(-ap / 100)}</b>. O máximo para este pagamento é ${brl(sd / 100)}. Se o valor combinado com o fornecedor mudou, edite o valor negociado da compra.`; c = 'text-rose-600 dark:text-rose-400' }
      else {
        const ec = k.vn > 0 ? (k.vo - k.vn) * v / k.vn : 0;
        t = ap == 0 ? `✔ <b>Quita a compra</b>: o status passa para <b>Pago</b>.` : `Pagamento <b>parcial</b>: depois dele o saldo é <b>${brl(ap / 100)}</b> (${pct(1 - ap / RDB.c(k.vn))} da compra paga) e o status fica <b>Parcial</b>.`;
        t += ` <span class="text-slate-500">Economia REIDI deste pagamento: ${brl(ec)}.</span>`; c = ap == 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-300';
        if (k.pgs.some(r => r.id != PEID && r.d == g('pg-d') && RDB.c(r.v) == RDB.c(v))) { t += ' <b class="text-amber-600 dark:text-amber-400">⚠ Já existe um pagamento igual (mesma data e valor) nesta compra: confira para não lançar em duplicidade.</b>' }
      }
    }
    o.className = 'text-sm rounded-lg bg-slate-500/10 px-3 py-2 mb-3 min-h-[3.25rem] ' + c; o.innerHTML = t
  }
  async function ps() {
    const bt = el('pg-ok'); if (!bt || bt.disabled) return; /* já está salvando (Enter repetido): não envia de novo */
    const er = m => { const e = el('pg-e'); e.textContent = m; e.classList.remove('hidden') }, v = num(g('pg-v')), x = { d: g('pg-d'), v, obs: g('pg-o').trim() }, id = PCID, pid = PEID, k = RDB.L.find(r => r.id == id); if (!k) return;
    if (!isFinite(v)) return er(g('pg-v').trim() ? 'Valor pago inválido: informe um valor em reais (ex.: 150.000,00).' : 'Informe o valor pago.');
    const m = RDB.valida(x, id, pid); if (m) return er(m);
    const b = el('pg-ok'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      if (pid) await RDB.corrigirPag(pid, id, x); else await RDB.pagar(id, x);
      const k2 = RDB.L.find(r => r.id == id) || k;
      MSG = '✔ ' + (pid ? 'Pagamento atualizado' : 'Pagamento de ' + brl(v) + ' registrado') + ' · ' + k.f + ' · ' + (k2.st == 'Pago' ? 'compra quitada (Pago).' : 'saldo ' + brl(k2.sd) + ' (' + k2.st + ').'); ERR = false;
      const volta = PLID; PLID = null; closeMd(); render(); if (volta) pagLista(volta)
    } catch (e) { b.disabled = false; b.textContent = pid ? 'Salvar alterações' : 'Registrar pagamento'; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  /* cancelar o formulário: se veio da lista de pagamentos, volta para ela */
  function pc() { const volta = PLID; PLID = null; closeMd(); if (volta) pagLista(volta) }
  /* lista dos pagamentos de uma compra (total · pago · saldo) com editar/excluir para quem pode */
  function pagLista(id) {
    const k = RDB.L.find(r => r.id == id); if (!k || !RDB.PGok) return; PLID = id; const p = pode(k), n = k.pgs.length;
    mo(`<h2 class="text-lg font-bold mb-1">Pagamentos da compra</h2>
      <p class="text-sm text-slate-500 mb-3"><b class="text-slate-700 dark:text-slate-200">${esc(k.f)}</b>${k.i ? ' · ' + esc(k.i) : ''}${k.ped ? ' · pedido ' + esc(k.ped) : ''}</p>
      <div class="grid grid-cols-3 gap-2 mb-1 text-center">${bx('Total negociado', brl(k.vn))}${bx('Valor pago', brl(k.pago), 'text-emerald-700 dark:text-emerald-400')}${bx('Saldo', brl(k.sd), k.sd > 0 ? 'text-sky-700 dark:text-sky-300' : '')}</div>
      <p class="text-xs text-slate-500 mb-3"><span class="font-semibold ${SCT[k.st]}">${esc(k.st)}</span> · ${pct(k.pf)} da compra paga</p>
      <div class="max-h-[50vh] overflow-auto"><table class="w-full text-sm" data-tab="pag"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-2 py-1.5">Data</th><th class="px-2 py-1.5 text-right">Valor pago</th><th class="px-2 py-1.5">Observação</th><th class="px-2 py-1.5">Lançado por</th>${p ? '<th class="px-2 py-1.5 text-right">Ações</th>' : ''}</tr></thead>
        <tbody>${k.pgs.map(r => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-id="${r.id}"><td class="px-2 py-1.5 whitespace-nowrap font-semibold">${dmy(r.d)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">${brl(r.v)}</td><td class="px-2 py-1.5">${esc(r.obs) || '<span class="text-slate-400">—</span>'}</td>
          <td class="px-2 py-1.5 whitespace-nowrap"><div>${esc(r.an && r.ae != r.ce ? r.an : r.cn) || '—'}</div><div class="text-[11px] text-slate-500">${dh(r.ae && r.ae != r.ce ? r.ae : r.ce)}${r.ae && r.ae != r.ce ? ' · alterado' : ''}</div></td>
          ${p ? `<td class="px-2 py-1.5 text-right whitespace-nowrap"><button class="btn2 !py-1 !text-xs" onclick="lanc.pf('${id}','${r.id}',1)">Editar</button> <button class="btn2 !py-1 !text-xs !text-rose-500" onclick="lanc.pd('${r.id}')">Excluir</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="${p ? 5 : 4}" class="px-2 py-6 text-center text-slate-500">Nenhum pagamento registrado.</td></tr>`}</tbody>
        ${n > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold"><td class="px-2 py-1.5">Total (${n})</td><td class="px-2 py-1.5 text-right tabular-nums">${brl(k.pago)}</td><td colspan="${p ? 3 : 2}"></td></tr></tfoot>` : ''}</table></div>
      <div class="flex justify-end gap-2 mt-4">${p && k.sd > 0 ? `<button class="btn" onclick="lanc.pf('${id}',null,1)">＋ Registrar pagamento</button>` : ''}<button class="btn2" onclick="lanc.px()">Fechar</button></div>`);
    const b = document.getElementById('mdb'); if (b) b.style.maxWidth = '44rem'
  }
  /* confirmação que, ao CANCELAR, volta para a janela anterior (o dlg() padrão só fecha) */
  let CF_OK = null, CF_NO = null;
  function conf(t, x, ok, no) { CF_OK = ok; CF_NO = no || null; mo(`<h2 class="text-lg font-bold mb-2">${t}</h2><p class="text-sm text-slate-500 mb-4">${x}</p><div class="flex justify-end gap-2"><button class="btn2" onclick="lanc.cn()">Cancelar</button><button class="btn" onclick="lanc.cs()">Confirmar</button></div>`) }
  function pagDel(pid) {
    const k = RDB.L.find(r => r.id == PLID), r = k && k.pgs.find(y => y.id == pid); if (!k || !r || !pode(k)) return; const volta = PLID;
    conf('Excluir pagamento', `Excluir o pagamento de <b>${brl(r.v)}</b> de ${dmy(r.d)} (${esc(k.f)})? O saldo da compra volta a subir e o status é recalculado. Esta ação não pode ser desfeita e fica registrada na Auditoria.`, async () => {
      try { await RDB.excluirPag(pid); const k2 = RDB.L.find(y => y.id == volta); MSG = '✔ Pagamento excluído · ' + k.f + (k2 ? ' · saldo ' + brl(k2.sd) + ' (' + k2.st + ').' : '.'); ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render(); pagLista(volta)
    }, () => pagLista(volta))
  }
  /* ---------- importar o Excel (⬆ Importar planilha) ---------- */
  let IMP = null; /* importação aberta: {arq, aba, cab, linhas:[{n, f, i, cat, ped, dt, rp, vo, vn, ba, er, av, sit}], vazias, totais, busy, aviso} */
  const SIT = { nova: ['✔ Nova', 'text-emerald-600 dark:text-emerald-400 font-semibold'], dup: ['= Já está na tabela', 'text-slate-500'], erro: ['⚠', 'text-rose-500 font-semibold'] }, s_ = n => n == 1 ? '' : 's';
  function escolher() {
    if (!RDB.ok) { MSG = 'Aguarde: as compras ainda estão carregando.'; ERR = 2; render(); return }
    let i = document.getElementById('lanc-arq');
    if (!i) { i = document.createElement('input'); i.type = 'file'; i.id = 'lanc-arq'; i.accept = '.xlsx,.xlsm,.xls'; i.className = 'hidden'; i.tabIndex = -1; i.setAttribute('aria-hidden', 'true'); i.onchange = () => { const f = i.files && i.files[0]; i.value = ''; if (f) lerArq(f) }; document.body.appendChild(i) }
    i.click()
  }
  function lerArq(f) {
    if (f.size > RDB.IMP_BYTES) { dlg('Arquivo grande demais', `“${esc(f.name)}” tem ${(f.size / 1048576).toFixed(1).replace('.', ',')} MB; o limite é ${RDB.IMP_BYTES / 1048576} MB. Use o Excel da Projeção Mensal de Compras REIDI (costuma ter menos de 1 MB).`); return }
    const rd = new FileReader();
    rd.onerror = () => dlg('Não consegui abrir o arquivo', 'O navegador não conseguiu ler “' + esc(f.name) + '”. Confira se ele não está aberto em outro programa e tente de novo.');
    rd.onload = () => { try { IMP = RDB.lerPlanilha(rd.result, f.name); IMP.busy = false; IMP.aviso = ''; RDB.compara(IMP.linhas); previa() } catch (e) { IMP = null; dlg('Não consegui ler a planilha', esc(e && e.message || e)) } };
    rd.readAsArrayBuffer(f)
  }
  /* prévia: o que vai entrar, o que já está na tabela e o que tem erro. Nada é gravado até clicar em "Subir". */
  function previa() {
    const I = IMP; if (!I) return;
    const L = I.linhas, nv = L.filter(r => r.sit == 'nova'), du = L.filter(r => r.sit == 'dup'), er = L.filter(r => r.sit == 'erro'), quem = r => adm() && r.rp ? r.rp : eu(),
      so = nv.reduce((t, r) => t + RDB.c(r.vo), 0) / 100, sn = nv.reduce((t, r) => t + RDB.c(r.vn), 0) / 100, vz = er.some(r => r.er.some(m => /^sem valor/.test(m))),
      sit = r => `<div class="${SIT[r.sit][1]}">${r.sit == 'erro' ? '⚠ ' + esc(r.er.join('; ')) : SIT[r.sit][0]}</div>${r.av.length ? `<div class="text-[11px] text-amber-600 dark:text-amber-400">⚠ ${esc(r.av.join('; '))}</div>` : ''}`,
      lin = r => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top ${r.sit == 'erro' ? 'bg-rose-500/5' : r.sit == 'dup' ? 'text-slate-500' : ''}" data-n="${r.n}" data-sit="${r.sit}"><td class="px-2 py-1.5 text-slate-500">${r.n}</td><td class="px-2 py-1.5 font-medium">${esc(r.f) || '<span class="text-slate-400">—</span>'}<div class="md:hidden mt-0.5 text-xs font-normal">${sit(r)}</div></td><td class="px-2 py-1.5">${esc(r.i)}</td><td class="px-2 py-1.5 whitespace-nowrap">${esc(r.cat)}</td><td class="px-2 py-1.5 whitespace-nowrap">${esc(r.ped) || '-'}</td><td class="px-2 py-1.5 whitespace-nowrap">${r.dt ? dmy(r.dt) : '—'}</td><td class="px-2 py-1.5">${esc(quem(r))}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${isFinite(r.vo) ? brl(r.vo) : '—'}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${isFinite(r.vn) ? brl(r.vn) : '—'}</td><td class="px-2 py-1.5 min-w-[11rem] hidden md:table-cell">${sit(r)}</td></tr>`;
    mo(`<h2 class="text-lg font-bold mb-1">Importar planilha</h2>
      <p class="text-sm text-slate-500 mb-3"><b class="break-all text-slate-700 dark:text-slate-200">${esc(I.arq)}</b> · aba “${esc(I.aba)}” · cabeçalho na linha ${I.cab}</p>
      ${I.aviso ? `<p id="imp-aviso" class="text-sm rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-3">⚠ ${esc(I.aviso)}</p>` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center">${bx('Linhas lidas', L.length)}${bx('Novas', nv.length, 'text-emerald-700 dark:text-emerald-400')}${bx('Já estão na tabela', du.length)}${bx('Com erro', er.length, er.length ? 'text-rose-600 dark:text-rose-400' : '')}</div>
      ${nv.length ? `<p class="text-sm mb-3">${nv.length == 1 ? 'A <b>1</b> compra nova soma' : 'As <b>' + nv.length + '</b> compras novas somam'} <b>${brl(so)}</b> de valor original e <b>${brl(sn)}</b> de valor negociado (economia real <b>${brl(so - sn)}</b>).</p>` : '<p class="text-sm mb-3 text-slate-500">Nenhuma compra nova para subir: ' + (L.length ? 'tudo o que tem na planilha já está na tabela ou tem erro.' : 'a planilha não tem linhas com compras.') + '</p>'}
      <div class="max-h-[42vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"><table class="w-full text-sm" data-tab="imp"><thead class="text-xs uppercase text-slate-500 text-left sticky top-0 bg-white dark:bg-slate-900"><tr><th class="px-2 py-1.5">Linha</th><th class="px-2 py-1.5">Fornecedor</th><th class="px-2 py-1.5">Item</th><th class="px-2 py-1.5">Categoria</th><th class="px-2 py-1.5">Pedido</th><th class="px-2 py-1.5">Data prevista</th><th class="px-2 py-1.5">Responsável</th><th class="px-2 py-1.5 text-right">Valor original</th><th class="px-2 py-1.5 text-right">Valor negociado</th><th class="px-2 py-1.5 hidden md:table-cell">Situação</th></tr></thead>
        <tbody>${L.map(lin).join('') || '<tr><td colspan="10" class="px-2 py-6 text-center text-slate-500">Nenhuma linha com compra na planilha.</td></tr>'}</tbody></table></div>
      <ul class="text-xs text-slate-500 mt-3 mb-3 list-disc pl-4 space-y-0.5"><li>“Já está na tabela” = mesmo fornecedor, item, data prevista e valores: essas linhas não sobem de novo.</li>
        <li>As compras entram como <b>A pagar</b>; os pagamentos você registra depois (Status ou “💰 pagamentos”).</li>
        <li>${adm() ? 'Responsável: vem da coluna RESPONSÁVEL da planilha (linha sem responsável fica com o seu nome).' : 'Responsável: o seu nome de cadastro (a coluna RESPONSÁVEL da planilha não é usada).'}</li>
        <li>O “% de PIS e COFINS” e as colunas de economia da planilha não são lidos: o site calcula pelo valor original e pelo negociado.</li>
        ${I.totais ? '<li>A linha de TOTAL da planilha foi ignorada: o site calcula os totais sozinho.</li>' : ''}
        ${er.length ? `<li class="text-rose-600 dark:text-rose-400">${er.length == 1 ? 'A 1 linha com erro fica' : 'As ' + er.length + ' linhas com erro ficam'} de fora. Corrija no Excel e importe de novo: o que já subiu não duplica.${vz ? ' Se a célula do valor é uma fórmula, abra o arquivo no Excel e salve antes de importar.' : ''}</li>` : ''}</ul>
      <p id="imp-e" class="hidden text-sm text-rose-500 mb-3" role="alert"></p>
      <div class="flex justify-end gap-2"><button id="imp-no" class="btn2" onclick="lanc.ix()">${nv.length ? 'Cancelar' : 'Fechar'}</button><button id="imp-ok" class="btn" ${nv.length ? '' : 'disabled'} onclick="lanc.ik()">Subir ${nv.length} compra${s_(nv.length)} para a tabela</button></div>`);
    const b = document.getElementById('mdb'); if (b) b.style.maxWidth = '72rem';
    foco('imp-no')
  }
  async function impOk() {
    const I = IMP; if (!I || I.busy) return; const b = el('imp-ok'), er = m => { const e = el('imp-e'); if (e) { e.textContent = m; e.classList.remove('hidden') } }, rot = b ? b.textContent : '';
    I.busy = true; if (b) { b.disabled = true; b.textContent = 'Subindo…' }
    try {
      const n0 = I.linhas.filter(r => r.sit == 'nova').length;
      await RDB.carregar(); RDB.compara(I.linhas); /* a tabela pode ter mudado enquanto a prévia estava aberta: confere de novo antes de gravar */
      const novas = I.linhas.filter(r => r.sit == 'nova');
      if (novas.length != n0) { I.busy = false; I.aviso = 'A tabela mudou enquanto você conferia (alguém lançou ou importou compras iguais). Nada foi gravado: confira a prévia atualizada e confirme de novo.'; previa(); return }
      const dup = I.linhas.filter(r => r.sit == 'dup').length, err = I.linhas.filter(r => r.sit == 'erro').length, n = novas.length, vn = novas.reduce((t, r) => t + RDB.c(r.vn), 0) / 100, admin = adm(), nome = eu();
      const got = await RDB.importar(novas, admin, nome);
      const ign = admin && novas.some(r => r.rp && N(r.rp) != N(nome)) && got.length > 0 && got.every(x => N(x.responsavel) == N(nome)); /* o banco ainda estava com a regra antiga e gravou o nome de quem importou */
      try { uLog('REIDI: importou ' + n + ' compra' + s_(n) + ' da planilha "' + I.arq + '" · R$ ' + m2(vn) + ' negociado') } catch (e) { }
      MSG = `✔ ${n} compra${s_(n)} importada${s_(n)} de “${I.arq}” (${brl(vn)} de valor negociado). Já ${n == 1 ? 'aparece' : 'aparecem'} no relatório REIDI para todos.` + (dup ? ` ${dup} já ${dup == 1 ? 'estava' : 'estavam'} na tabela e ${dup == 1 ? 'foi ignorada' : 'foram ignoradas'}.` : '') + (err ? ` ${err} linha${s_(err)} com erro ${err == 1 ? 'ficou' : 'ficaram'} de fora.` : '') + (ign ? ' ⚠ O banco gravou o seu nome como responsável em todas elas: para manter o responsável da planilha, rode o arquivo supabase/reidi-importar.sql no Supabase.' : '');
      ERR = ign ? 2 : false; IMP = null; closeMd(); render()
    } catch (e) {
      I.busy = false; if (b) { b.disabled = false; b.textContent = rot }
      const m = String((e && (e.message || e.error_description)) || e || '');
      er('Não foi possível subir as compras: ' + (/row-level security|42501|permission denied/i.test(m + ' ' + ((e && e.code) || '')) ? 'sem permissão para incluir compras.' : m) + ' Nenhuma compra foi gravada.')
    }
  }
  async function nuvem() { try { ERR = false; await RDB.carregar() } catch (e) { MSG = 'Não consegui carregar as compras: ' + (e.message || e) + '. Confira se o SQL supabase/reidi-lancamentos.sql foi executado.'; ERR = true } render() }
  function atual() {
    if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } render()
  }
  try { RDB.on(atual, () => !VIEW.classList.contains('hidden')); VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; render() } }, 80) }) } catch (e) { }

  window.lanc = {
    show() { MSG = ''; SEL.clear(); LOTE = null; render(); nuvem() }, f: form, pv, sv, del, pl: pagLista, pf: pagForm, pi, ps, pc, pd: pagDel, px() { PLID = null; closeMd() },
    imp: escolher, ik: impOk, ix() { IMP = null; closeMd() },
    sk: selCompra, sa: selTodas, sl: selLimpa, dx() { dxAbrir() }, dk: dxOk, dn() { LOTE = null; closeMd() }, /* seleção e exclusão em lote */
    kd(e) { if (e.key == 'Enter') { e.preventDefault(); ps() } }, /* Enter nos campos do pagamento = Registrar */
    cs() { const f = CF_OK; CF_OK = CF_NO = null; closeMd(); if (f) f() }, cn() { const f = CF_NO; CF_OK = CF_NO = null; closeMd(); if (f) f() },
    psd() { const k = RDB.L.find(r => r.id == PCID); if (!k) return; const p = PEID ? k.pgs.find(r => r.id == PEID) : null, e = el('pg-v'); if (e) { e.value = m2((RDB.c(k.vn) - RDB.c(k.pago) + (p ? RDB.c(p.v) : 0)) / 100); pi() } },
    vf(e) { const n = num(e.value); if (isFinite(n) && n >= 0) e.value = m2(n) }, exp() { if (!adm()) return; RDB.exportar().catch(e => { MSG = '⚠ Não consegui gerar a planilha: ' + (e.message || e); ERR = true; render() }) },
    q(v) { FQ = v; tbl() }, fl(k, v) { if (k == 'c') FC = v; else if (k == 'r') FR = v; else if (k == 's') FS = v; else FM = v; render() },
    /* Status: "Pago" abre a janela do pagamento (valor + data); "A pagar" com pagamentos pede confirmação e exclui os pagamentos. O seletor só muda depois que o banco confirma. */
    async st(id, v, sel) {
      const x = RDB.L.find(r => r.id == id); if (sel && x) sel.value = x.st; /* desfaz a troca visual: o status real vem dos pagamentos gravados */
      if (!x || !pode(x) || x.st == v) return;
      if (!RDB.PGok) { /* modo antigo (SQL de pagamentos ainda não rodado): marca a compra inteira */
        try { await RDB.editar(id, { ...x, st: v }); try { uLog('REIDI: marcou ' + v + ' · ' + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn)) } catch (e) { } MSG = '✔ ' + x.f + ' (' + dmy(x.dt) + ') marcada como ' + v + '.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render(); return
      }
      if (v == 'Pago') { pagForm(id); return }
      if (v == 'A pagar' && x.pgs.length) {
        const n = x.pgs.length;
        dlg('Voltar para “A pagar”?', `A compra de <b>${esc(x.f)}</b> tem <b>${n} pagamento${n > 1 ? 's' : ''}</b> registrado${n > 1 ? 's' : ''} (${brl(x.pago)}). Voltar para “A pagar” <b>exclui ${n > 1 ? 'esses pagamentos' : 'esse pagamento'}</b> e a compra sai do REIDI Realizado. Fica registrado na Auditoria. Para corrigir só um pagamento, use “💰 pagamentos”.`, async () => {
          try { const q = await RDB.desfazer(id); MSG = '✔ ' + x.f + ' voltou para “A pagar” (' + q + ' pagamento' + (q > 1 ? 's excluídos' : ' excluído') + ').'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
        })
      }
    }, s(k) { if (SK == k) SD = -SD; else { SK = k; SD = 1 } tbl() },
    _r: render
  };
})();
