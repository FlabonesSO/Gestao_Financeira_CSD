/* Módulo "Projeção REIDI" · lançamento das compras previstas (INCLUIR · EDITAR · EXCLUIR) + exportação da planilha no modelo.
   As áreas responsáveis lançam aqui; o relatório REIDI lê os mesmos dados (js/core/reidi_dados.js → tabela public.reidi_compras),
   então cada lançamento aparece na hora para todos os usuários, em qualquer navegador.
   Quem pode: administrador (tudo) e Lançador REIDI (inclui compras e edita/exclui SOMENTE as que ele mesmo lançou; a regra real fica no banco — RLS). O Responsável é sempre o nome do cadastro de quem lançou.
   MÓDULO ISOLADO: usa de js/core: $, f, br, N, ROLE, PF, mo/closeMd/dlg (usuarios.js), uLog, RDB. */
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
  let VNM = false, FQ = '', FC = '', FR = '', FM = '', FS = '', SK = 'dt', SD = 1, MSG = '', ERR = false, EDIT = null, PEND = false;
  const adm = () => ROLE == 'admin', eu = () => (typeof PF != 'undefined' && PF && (PF.nome || PF.login)) || '', meu = x => !!(x && x.cp && typeof PF != 'undefined' && PF && x.cp == PF.id), pode = x => adm() || (ROLE == 'lancador' && meu(x));
  const SORT = { f: x => N(x.f), i: x => N(x.i), cat: x => N(x.cat), dt: x => x.dt, rp: x => N(x.rp), vo: x => x.vo, vn: x => x.vn, ec: x => x.vo - x.vn, st: x => x.st, et: x => RDB.teor(x.vo, x.pc) };

  function filtradas() {
    const q = N(FQ), r = RDB.L.filter(x => (!q || N([x.f, x.i, x.ped, x.rp, x.cat].join(' ')).includes(q)) && (!FC || x.cat == FC) && (!FR || x.rp == FR) && (!FM || x.dt.slice(0, 7) == FM) && (!FS || x.st == FS)), g = SORT[SK] || SORT.dt;
    return r.sort((a, b) => { const A = g(a), B = g(b); return (A < B ? -1 : A > B ? 1 : 0) * SD || (a.f < b.f ? -1 : 1) })
  }
  const opts = (arr, v, todos) => `<option value="">${todos}</option>` + arr.map(x => `<option value="${esc(x[0])}" ${x[0] == v ? 'selected' : ''}>${esc(x[1])}</option>`).join('');
  const th = (k, t, r) => `<th class="px-2 py-2 ${r ? 'text-right' : ''} whitespace-nowrap ${SORT[k] ? 'cursor-pointer select-none' : ''}" ${SORT[k] ? `onclick="lanc.s('${k}')"` : ''}>${t}${SK == k ? (SD > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Projeção de Compras REIDI</h1><p class="text-sm text-slate-500">Lançamento das compras previstas · o relatório REIDI e todos os usuários veem na hora${RDB.L.length ? ' · ' + RDB.L.length + ' compra(s)' : ''}</p>${ROLE == 'lancador' ? `<p id="lanc-aviso" class="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">Você pode editar e excluir apenas os lançamentos feitos por você (${RDB.L.filter(meu).length}). Os demais aparecem com 🔒.</p>` : ''}</div>
    <button class="btn" onclick="lanc.f()">＋ Incluir compra</button>${adm() ? '<button class="btn2" title="Baixa a planilha no modelo Projeção Mensal de Compras REIDI" onclick="lanc.exp()">⬇ Exportar planilha (modelo)</button>' : ''}</div>
    ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  function render() {
    if (!RDB.ok) { VIEW.innerHTML = head() + `<div class="card py-10 text-center text-slate-500">${ERR ? '' : 'Carregando…'}</div>`; return }
    const T = filtradas(), cats = [...new Set(RDB.L.map(x => x.cat).filter(Boolean))].sort(), rps = [...new Set(RDB.L.map(x => x.rp).filter(Boolean))].sort(), mes = [...new Set(RDB.L.map(x => x.dt.slice(0, 7)))].sort(),
      vo = sum(T, 'vo'), vn = sum(T, 'vn'), et = T.reduce((t, x) => t + RDB.teor(x.vo, x.pc), 0), kp = (t, v, s) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-xl font-bold mt-0.5">${v}</div>${s ? `<div class="text-xs text-slate-500">${s}</div>` : ''}</div>`;
    VIEW.innerHTML = head() + `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">${kp('Compras', T.length, T.length != RDB.L.length ? 'de ' + RDB.L.length + ' lançadas' : 'lançadas')}${kp('Valor original', brl(vo))}${kp('Valor após REIDI', brl(vn))}${kp('Economia REIDI real', '<span class="text-emerald-600">' + brl(vo - vn) + '</span>', vo ? pct((vo - vn) / vo) + ' do valor original' : '')}${kp('Economia REIDI teórica', brl(et), vo ? pct(et / vo) + ' do valor original' : '')}${kp('Real × teórica', et ? pct((vo - vn) / et) : '—', 'diferença ' + brl(vo - vn - et))}</div>
    <div class="card"><div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3"><input id="lanc-q" class="inp col-span-2" placeholder="🔍 Buscar fornecedor, item, pedido ou responsável" value="${esc(FQ)}" oninput="lanc.q(this.value)">
      <select class="inp ${FS ? 'ring-2 ring-amber-500' : ''}" title="Filtrar por status" onchange="lanc.fl('s',this.value)">${opts([['A pagar', 'A pagar'], ['Pago', 'Pago']], FS, 'Todos os status')}</select>
      <select class="inp" onchange="lanc.fl('c',this.value)">${opts(cats.map(c => [c, c]), FC, 'Todas as categorias')}</select><select class="inp" onchange="lanc.fl('r',this.value)">${opts(rps.map(c => [c, c]), FR, 'Todos os responsáveis')}</select>
      <select class="inp" onchange="lanc.fl('m',this.value)">${opts(mes.map(m => [m, mesNome(m)]), FM, 'Todos os meses')}</select></div>
      <div id="lanc-t" class="overflow-x-auto"></div></div>`;
    tbl(T)
  }
  function tbl(T) {
    T = T || filtradas(); const el = document.getElementById('lanc-t'); if (!el) return;
    el.innerHTML = RDB.L.length ? `<table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-2 py-2">Nº</th>${th('f', 'Fornecedor')}${th('i', 'Item / descrição')}${th('cat', 'Categoria')}<th class="px-2 py-2">Pedido</th>${th('dt', 'Data prevista')}<th class="px-2 py-2">Pagamento</th><th class="px-2 py-2 text-right">% PIS/COFINS</th>${th('rp', 'Responsável')}${th('vo', 'Valor original', 1)}${th('vn', 'Após REIDI', 1)}${th('ec', 'Economia REIDI real', 1)}${th('et', 'Economia REIDI teórica', 1)}${th('st', 'Status')}<th class="px-2 py-2 text-right">Ações</th></tr></thead>
      <tbody>${T.map((x, i) => { const p = pode(x), pg = RDB.pagto(x.dt); return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top"><td class="px-2 py-1.5 text-slate-500">${i + 1}</td><td class="px-2 py-1.5 font-medium">${esc(x.f)}</td><td class="px-2 py-1.5">${esc(x.i)}</td><td class="px-2 py-1.5 whitespace-nowrap">${esc(x.cat)}</td><td class="px-2 py-1.5">${esc(x.ped) || '-'}</td><td class="px-2 py-1.5 whitespace-nowrap">${dmy(x.dt)}</td><td class="px-2 py-1.5 whitespace-nowrap">${dmy(pg)}</td><td class="px-2 py-1.5 text-right">${pct(x.pc)}</td><td class="px-2 py-1.5">${esc(x.rp)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(x.vo)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(x.vn)}</td><td class="px-2 py-1.5 text-right whitespace-nowrap text-emerald-600">${brl(x.vo - x.vn)}<div class="text-[11px] text-slate-500">${x.vo ? pct((x.vo - x.vn) / x.vo) : ''}</div></td><td class="px-2 py-1.5 text-right whitespace-nowrap">${brl(RDB.teor(x.vo, x.pc))}<div class="text-[11px] text-slate-500">${x.vo ? pct(x.pc * RDB.FATOR) : ''}</div></td>
        <td class="px-2 py-1.5 whitespace-nowrap" title="${esc(x.ae ? 'Última alteração: ' + new Date(x.ae).toLocaleString('pt-BR') + (x.an ? ' · ' + x.an : '') : '')}">${p ? `<select class="inp !py-0.5 !text-xs font-semibold ${x.st == 'Pago' ? '!text-emerald-600' : '!text-amber-600'}" onchange="lanc.st('${x.id}',this.value)"><option ${x.st == 'A pagar' ? 'selected' : ''}>A pagar</option><option ${x.st == 'Pago' ? 'selected' : ''}>Pago</option></select>` : `<span class="text-xs font-semibold ${x.st == 'Pago' ? 'text-emerald-600' : 'text-amber-600'}">${esc(x.st)}</span>`}</td>
        <td class="px-2 py-1.5 text-right whitespace-nowrap">${p ? `<button class="btn2 !py-1 !text-xs" onclick="lanc.f('${x.id}')">Editar</button> <button class="btn2 !py-1 !text-xs !text-rose-500" onclick="lanc.del('${x.id}')">Excluir</button>` : '<span class="text-xs text-slate-400" title="Só quem lançou (ou o administrador) pode editar ou excluir">🔒</span>'}</td></tr>` }).join('') || '<tr><td colspan="15" class="px-2 py-6 text-center text-slate-500">Nenhuma compra encontrada com esse filtro.</td></tr>'}</tbody>
      <tfoot class="font-semibold border-t-2 border-slate-300 dark:border-slate-700"><tr><td class="px-2 py-2" colspan="9">TOTAL (${T.length})</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'vo'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(sum(T, 'vn'))}</td><td class="px-2 py-2 text-right whitespace-nowrap text-emerald-600">${brl(sum(T, 'vo') - sum(T, 'vn'))}</td><td class="px-2 py-2 text-right whitespace-nowrap">${brl(T.reduce((t, x) => t + RDB.teor(x.vo, x.pc), 0))}</td><td colspan="2"></td></tr></tfoot></table>`
      : '<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">📝</div><p class="font-semibold">Nenhuma compra lançada ainda</p><p class="text-sm mt-1">Clique em “Incluir compra” para começar.</p></div>'
  }

  /* ---------- formulário (incluir / editar) ---------- */
  function form(id) {
    const x = id ? RDB.L.find(r => r.id == id) : null; if (id && (!x || !pode(x))) return; EDIT = id || null;
    const sup = [...new Set(RDB.L.map(r => r.f))].sort(), rps = [...new Set(RDB.L.map(r => r.rp).filter(Boolean))].sort(), cats = [...new Set(['Pedido de Compra', 'Previsão', ...(x && x.cat ? [x.cat] : [])])],
      v = x || { f: '', i: '', st: 'A pagar', cat: 'Previsão', ped: '', dt: '', pc: RDB.ALIQ[0], rp: eu(), vo: '', vn: '', ba: RDB.hoje() }, L = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-3">${x ? 'Editar compra' : 'Incluir compra'}</h2><div class="max-h-[70vh] overflow-y-auto pr-1">
    ${L('Fornecedor *')}<input id="lf-f" class="inp w-full mb-3" list="lf-fl" value="${esc(v.f)}" autocomplete="off"><datalist id="lf-fl">${sup.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    ${L('Item / descrição')}<input id="lf-i" class="inp w-full mb-3" value="${esc(v.i)}">
    <div class="grid grid-cols-2 gap-3 mb-3"><div>${L('Categoria')}<select id="lf-c" class="inp w-full">${cats.map(c => `<option value="${esc(c)}" ${c == v.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div>${L('Nº pedido / processo / NF')}<input id="lf-p" class="inp w-full" value="${esc(v.ped)}"></div></div>
    <div class="grid grid-cols-2 gap-3 mb-1"><div>${L('Data prevista de pagamento *')}<input id="lf-d" type="date" class="inp w-full" value="${esc(v.dt)}" oninput="lanc.pv()"></div><div>${L('% de PIS e COFINS *')}<select id="lf-pc" class="inp w-full" onchange="lanc.cv()">${[...new Set([...RDB.ALIQ, ...(x ? [x.pc] : [])])].map(a => `<option value="${(a * 100).toFixed(2)}" ${Math.abs(a - v.pc) < 1e-9 ? 'selected' : ''}>${p3(Math.round(a * 1e5) / 1e3)}%</option>`).join('')}</select></div></div>
    <p id="lf-pg" class="text-xs text-slate-500 mb-3"></p>
    ${L('Responsável', x ? '(quem lançou)' : '(preenchido com o seu nome de cadastro)')}<input id="lf-r" class="inp w-full mb-3 opacity-80" value="${esc(v.rp || eu())}" readonly tabindex="-1" title="O responsável é quem lança a compra e não pode ser alterado">
    <div class="grid grid-cols-2 gap-3 mb-1"><div>${L('Valor original (R$) *')}<input id="lf-vo" class="inp w-full" inputmode="decimal" value="${v.vo === '' ? '' : esc(m2(v.vo))}" oninput="lanc.cv()"></div><div>${L('Valor após negociação REIDI (R$) *')}<input id="lf-vn" class="inp w-full" inputmode="decimal" value="${v.vn === '' ? '' : esc(m2(v.vn))}" oninput="lanc.vm()"></div></div>
    <p id="lf-h" class="text-xs text-slate-500 mb-3"></p>
    <div class="grid grid-cols-2 gap-3 mb-3"><div>${L('Status')}<select id="lf-s" class="inp w-full"><option ${v.st != 'Pago' ? 'selected' : ''}>A pagar</option><option ${v.st == 'Pago' ? 'selected' : ''}>Pago</option></select></div><div>${L('Data base de atualização')}<input id="lf-b" type="date" class="inp w-full" value="${esc(v.ba)}"></div></div>
    <p id="lf-pv" class="text-sm rounded-lg bg-slate-500/10 px-3 py-2 mb-3"></p></div>
    <p id="lf-e" class="hidden text-sm text-rose-500 mb-3"></p><div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="lf-ok" class="btn" onclick="lanc.sv()">${x ? 'Salvar alterações' : 'Incluir compra'}</button></div>`);
    VNM = x ? Math.abs(x.vn - auto(x.vo, x.pc)) > 0.011 : false; pv(); setTimeout(() => { const e = document.getElementById('lf-f'); e && e.focus() }, 30)
  }
  const g = id => (document.getElementById(id) || {}).value || '';
  function lido() { const pc = parseFloat(g('lf-pc')), vo = num(g('lf-vo')), vn = num(g('lf-vn')); return { f: g('lf-f').trim(), i: g('lf-i').trim(), cat: g('lf-c').trim() || 'Previsão', ped: g('lf-p').trim(), dt: g('lf-d'), pc: isNaN(pc) ? NaN : Math.round(pc * 100) / 1e4, rp: g('lf-r').trim(), vo, vn, st: g('lf-s') == 'Pago' ? 'Pago' : 'A pagar', ba: g('lf-b') || RDB.hoje() } }
  function pv() {
    const x = lido(), a = document.getElementById('lf-pg'), b = document.getElementById('lf-pv'); if (!a || !b) return;
    const h = document.getElementById('lf-h'); if (h) h.textContent = !isNaN(x.pc) ? (VNM ? 'Valor negociado digitado por você (economia real).' : 'Sugestão = valor teórico: valor original − (valor original × ' + p3(Math.round(x.pc * 1e5) / 1e3) + '% × 90%). Digite o valor negociado se for diferente.') : '';
    a.textContent = x.dt ? 'Pagamento em ' + dmy(RDB.pagto(x.dt)) + ' (' + wd(RDB.pagto(x.dt)) + ') · transferência 3 dias antes' : '';
    b.innerHTML = !isNaN(x.vo) && !isNaN(x.vn) ? `Economia REIDI real: <b class="text-emerald-600">${brl(x.vo - x.vn)}</b>${x.vo ? ' (' + pct((x.vo - x.vn) / x.vo) + ')' : ''}${!isNaN(x.pc) ? ' · teórica <b>' + brl(RDB.teor(x.vo, x.pc)) + '</b> · diferença ' + brl(x.vo - x.vn - RDB.teor(x.vo, x.pc)) : ''}${x.vn > x.vo ? ' <span class="text-amber-500">⚠ valor após REIDI maior que o original</span>' : ''}` : '<span class="text-slate-500">Informe os valores para ver a economia.</span>'
  }
  /* sugestão do valor após negociação REIDI = valor TEÓRICO: valor original − (valor original × alíquota × 90%); preenchida ao digitar o valor original (e ao trocar a alíquota), até o usuário digitar o valor negociado */
  const auto = (vo, pc) => Math.round((vo - RDB.teor(vo, pc)) * 100) / 100;
  function cv() {
    const x = lido(), e = document.getElementById('lf-vn');
    if (!VNM && e) e.value = !isNaN(x.vo) && !isNaN(x.pc) && x.pc <= 1 ? m2(auto(x.vo, x.pc)) : ''; pv()
  }
  function vm() { VNM = true; pv() }
  async function sv() {
    const x = lido(), er = m => { const e = document.getElementById('lf-e'); e.textContent = m; e.classList.remove('hidden') };
    if (!x.f) return er('Informe o fornecedor.'); if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dt)) return er('Informe a data prevista de pagamento.');
    if (isNaN(x.pc) || x.pc < 0 || x.pc > 1) return er('Escolha o % de PIS e COFINS.'); if (isNaN(x.vo) || x.vo < 0) return er('Informe o valor original.'); if (isNaN(x.vn) || x.vn < 0) return er('Informe o valor após negociação REIDI.');
    const b = document.getElementById('lf-ok'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      const id = EDIT; if (id) await RDB.editar(id, x); else await RDB.incluir(x);
      const t = (id ? 'REIDI: editou compra ' : 'REIDI: incluiu compra ') + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn); try { uLog(t) } catch (e) { }
      closeMd(); MSG = id ? '✔ Compra atualizada.' : '✔ Compra incluída. Já aparece no relatório REIDI para todos.'; ERR = false; render()
    } catch (e) { b.disabled = false; b.textContent = EDIT ? 'Salvar alterações' : 'Incluir compra'; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function del(id) {
    const x = RDB.L.find(r => r.id == id); if (!x || !pode(x)) return;
    dlg('Excluir compra', `Excluir a compra de <b>${esc(x.f)}</b> (${esc(x.i) || 'sem descrição'}), ${dmy(x.dt)}, ${brl(x.vn)}? Ela some do relatório REIDI para todos. Esta ação não pode ser desfeita.`, async () => {
      try { await RDB.excluir(id); try { uLog('REIDI: excluiu compra ' + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn)) } catch (e) { } MSG = '✔ Compra excluída.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
    })
  }
  async function nuvem() { try { ERR = false; await RDB.carregar() } catch (e) { MSG = 'Não consegui carregar as compras: ' + (e.message || e) + '. Confira se o SQL supabase/reidi-lancamentos.sql foi executado.'; ERR = true } render() }
  function atual() {
    if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } render()
  }
  try { RDB.on(atual, () => !VIEW.classList.contains('hidden')); VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; render() } }, 80) }) } catch (e) { }

  window.lanc = {
    show() { MSG = ''; render(); nuvem() }, f: form, pv, cv, vm, sv, del, exp() { if (!adm()) return; RDB.exportar().catch(e => { MSG = '⚠ Não consegui gerar a planilha: ' + (e.message || e); ERR = true; render() }) },
    q(v) { FQ = v; tbl() }, fl(k, v) { if (k == 'c') FC = v; else if (k == 'r') FR = v; else if (k == 's') FS = v; else FM = v; render() },
    async st(id, v) {
      const x = RDB.L.find(r => r.id == id); if (!x || !pode(x) || x.st == v) return;
      try { await RDB.editar(id, { ...x, st: v }); try { uLog('REIDI: marcou ' + v + ' · ' + x.f + ' ' + dmy(x.dt) + ' R$ ' + m2(x.vn)) } catch (e) { } MSG = '✔ ' + x.f + ' (' + dmy(x.dt) + ') marcada como ' + v + '.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
    }, s(k) { if (SK == k) SD = -SD; else { SK = k; SD = 1 } tbl() },
    _r: render
  };
})();
