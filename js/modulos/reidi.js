/* Módulo REIDI · Projeção Mensal de Compras com impacto REIDI.
   Fonte: as compras LANÇADAS no módulo "Projeção REIDI" (tabela public.reidi_compras) + os parâmetros do relatório (bases · reidi_config),
   lidos por js/core/reidi_dados.js (RDB). Não há mais upload de planilha: quem lança, vale para todos, e a tela se atualiza sozinha.
   Telas: Resumo Executivo (indicadores, gráfico por quinzena, transferência, alertas), Análise Financeira (ganho com o REIDI), Projeção de Compras (tabela filtrável).
   Os responsáveis NÃO aparecem na tela: só no Termo para assinatura (PDF), gerado pelo admin.
   Regras: compras com pagamento previsto do dia 1 ao 15 são pagas no dia 15; do 16 ao fim do mês, no último dia do mês;
   a transferência para a Belov Obras é feita N dias antes (padrão 3). Valor a transferir = máx(0; arredondar p/ cima((compras − saldo) / 5.000) × 5.000) — SEMPRE múltiplo de R$ 5.000 (total e cada transferência), por isso é maior ou igual ao valor da base.
   MÓDULO ISOLADO: usa de js/core: $, f, p, br, N, ROLE, saveAs, LOGO/LR, mo/closeMd (janela), BASE (base.js). */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="reidi"]'), CHAVE = 'reidi', LS = 'csd_reidi_v1', PASSO = 5000;
  if (!VIEW) return;

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pad = n => String(n).padStart(2, '0'), sum = (a, k) => a.reduce((t, x) => t + (+x[k] || 0), 0),
    isoOf = d => new Date(d.getTime() + 432e5).toISOString().slice(0, 10),
    addD = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) },
    eom = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate(),
    dm = iso => iso.slice(8) + '/' + iso.slice(5, 7),
    DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], DSL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
    dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay(), wd = iso => DS[dow(iso)],
    dmw = iso => dm(iso) + ' (' + wd(iso) + ')',
    num = v => {
      if (typeof v == 'number') return v; let s = String(v == null ? '' : v).trim(); if (!s) return NaN;
      const ng = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[^0-9.,]/g, '');
      if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      else if (s.includes(',')) s = s.replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      const n = parseFloat(s); return isNaN(n) ? NaN : ng ? -Math.abs(n) : n
    },
    isoAny = v => {
      if (Object.prototype.toString.call(v) == '[object Date]') return isNaN(v) ? '' : isoOf(v);
      if (typeof v == 'number') return v > 20000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : '';
      const s = String(v == null ? '' : v).trim(), a = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return a ? `${a[3]}-${a[2]}-${a[1]}` : b ? `${b[1]}-${b[2]}-${b[3]}` : ''
    },
    K = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2).replace('.', ',') + ' Mi' : Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil',
    mpdf = n => 'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    short = s => String(s || '').trim().replace(/\s+/g, ' ');

  /* ---------- feriados nacionais e dias úteis (alerta de data de transferência/pagamento) ---------- */
  function pascoa(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((b + 8) / 25), h = Math.floor((b - g + 1) / 3),
      i = (19 * a + b - d - h + 15) % 30, k = Math.floor(c / 4), l = c % 4, m = (32 + 2 * e + 2 * k - i - l) % 7, n = Math.floor((a + 11 * i + 22 * m) / 451),
      mo = Math.floor((i + l - 7 * n + 114) / 31), dy = ((i + l - 7 * n + 114) % 31) + 1; return `${y}-${pad(mo)}-${pad(dy)}`
  }
  const FC = {}, feriados = y => {
    if (FC[y]) return FC[y]; const e = pascoa(y), m = {};
    [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência'], ['10-12', 'N. Sra. Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal']].forEach(([k, n]) => m[`${y}-${k}`] = n);
    m[addD(e, -48)] = 'Carnaval'; m[addD(e, -47)] = 'Carnaval'; m[addD(e, -2)] = 'Sexta-feira Santa'; m[addD(e, 60)] = 'Corpus Christi'; return FC[y] = m
  };
  const motivo = iso => { const w = dow(iso); return w == 0 || w == 6 ? DSL[w] : (feriados(+iso.slice(0, 4))[iso] || '') },
    antDU = iso => { let i = 0; while (motivo(iso) && i++ < 10) iso = addD(iso, -1); return iso };

  /* ---------- estado ---------- */
  const RESP0 = { el: 'Financeiro do Consórcio', cf: 'Gerente Administrativo Financeiro (GAF)', d: ['Diretor Belov', 'Diretor Carioca', 'Diretor CTC'] };
  let B = null, META = '', ARQ = '', ST = '', tab = 'res', MSG = '', ERR = false, CH = {}, P = {};
  let RM = '', RQ = '', ESC = 'hor', FQF = '', FQ = '', FCt = '', FRp = '', FP = '', HZ = true, SK = 'dt', SD = 1;
  try { P = JSON.parse(localStorage.getItem(LS)) || {} } catch (e) { P = {} }
  ['ref', 'ant', 'd1', 'ba', 'hor'].forEach(k => delete P[k]); /* o horizonte agora é a contagem de dias do filtro de período (De/Até); os demais parâmetros vêm sempre dos parâmetros publicados */
  const limpa = () => ['ref', 'hor', 'ant', 'd1', 'saldo', 'de', 'ate'].forEach(k => delete P[k]), salva = () => { try { localStorage.setItem(LS, JSON.stringify(P)) } catch (e) { } };
  const dark = () => document.documentElement.classList.contains('dark');

  /* ---------- cálculo ---------- */
  const bas = () => [...new Set(B.c.map(x => x.ba).filter(Boolean))].sort(),
    baSel = () => 'all', /* os lançamentos valem todos juntos; o horizonte é que seleciona o período */
    baRef = (b = baSel()) => { const l = bas(); if (b == 'all' || b == l[l.length - 1]) return B.ref; const mn = B.c.filter(x => x.ba == b).map(x => x.dt).sort()[0]; return mn ? mn.slice(0, 8) + '01' : B.ref },
    dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5),
    perOn = () => !!(P.de && P.ate && /^\d{4}-\d{2}-\d{2}$/.test(P.de) && /^\d{4}-\d{2}-\d{2}$/.test(P.ate) && P.ate > P.de), /* filtro De/Até ativo: o horizonte passa a ser a contagem de dias entre as datas */
    par = (ba = baSel()) => ({ ref: (ba == baSel() && perOn() && P.de) || baRef(ba), hor: perOn() ? dias(P.de, P.ate) : (+B.hor || 30), ant: P.ant == null ? 3 : +P.ant, d1: P.d1 == null ? 15 : +P.d1, saldo: ROLE == 'admin' && P.saldo != null ? +P.saldo : (baRef(ba) == B.ref ? (+B.saldo || 0) : 0) }),
    payDate = (dt, d1) => dt.slice(8) * 1 <= d1 ? dt.slice(0, 8) + pad(d1) : dt.slice(0, 8) + pad(eom(dt)),
    teto = v => Math.max(0, Math.ceil(v / PASSO - 1e-9) * PASSO);
  function calc(ba) {
    const BA = ba == null ? baSel() : ba, q = par(BA), fim = addD(q.ref, q.hor);
    const L = B.c.map((x, k) => ({ x, k })).filter(({ x }) => BA == 'all' || x.ba == BA).map(({ x, k }) => { const pg = payDate(x.dt, q.d1), ec = x.vo - x.vn, I = RDB.ident(x.vo, x.vn), et = RDB.teor(x.vo, I.al); return { ...x, pc: I.al, pa: I.pa, k, pg, tr: addD(pg, -q.ant), ec, ecp: x.vo ? ec / x.vo : 0, et, etp: x.vo ? et / x.vo : 0, in: x.dt >= q.ref && x.dt <= fim } }),
      I = L.filter(x => x.in), tot = { n: I.length, vo: sum(I, 'vo'), vn: sum(I, 'vn'), ec: sum(I, 'ec'), et: sum(I, 'et') }, M = {};
    I.forEach(x => { (M[x.pg] = M[x.pg] || { pg: x.pg, tr: x.tr, n: 0, vo: 0, vn: 0, ec: 0, et: 0, it: [] }); const g = M[x.pg]; g.n++; g.vo += x.vo; g.vn += x.vn; g.ec += x.ec; g.et += x.et; g.it.push(x) });
    const G = Object.values(M).sort((a, b) => a.pg < b.pg ? -1 : 1), T = teto(tot.vn - q.saldo); let sr = q.saldo, rem = T;
    G.forEach((g, i) => {
      const nd = Math.max(0, g.vn - sr); g.sc = Math.min(g.vn, sr); sr = Math.max(0, sr - g.vn);
      g.tf = i == G.length - 1 ? rem : Math.min(rem, teto(nd)); rem -= g.tf;
      const d = +g.pg.slice(8); g.per = d <= q.d1 ? `01/${g.pg.slice(5, 7)} – ${pad(q.d1)}/${g.pg.slice(5, 7)}` : `${pad(q.d1 + 1)}/${g.pg.slice(5, 7)} – ${pad(eom(g.pg))}/${g.pg.slice(5, 7)}`;
      g.q = (d <= q.d1 ? '1ª' : '2ª') + ' quinzena'; g.mp = motivo(g.pg); g.mt = motivo(g.tr); g.sp = g.mp ? antDU(g.pg) : ''; g.st = g.mp || g.mt ? antDU(addD(g.sp || g.pg, -q.ant)) : ''
    });
    const liq = Math.max(0, tot.vn - q.saldo);
    return { q, fim, L, I, tot, G, T, liq, folga: Math.max(0, T - liq), out: L.length - I.length, outV: sum(L.filter(x => !x.in), 'vn') }
  }
  function alertas(C) {
    const A = [], { q, tot, G, T, I } = C;
    if (T > 0) A.push(['info', 'Transferir para a Belov Obras: ' + G.filter(g => g.tf > 0).map(g => `<b>${f(g.tf)}</b> até <b>${dmw(g.tr)}</b> para pagar em ${dmw(g.pg)}`).join(' · ') + '.']);
    else A.push(['ok', 'O saldo informado cobre todas as compras do período: nenhuma transferência necessária.']);
    const dts = G.filter(g => g.mp || g.mt).map(g => g.mp ? `pagamento de <b>${dmw(g.pg)}</b> cai em ${esc(g.mp)} → pagar em <b>${dmw(g.sp)}</b> e transferir até <b>${dmw(g.st)}</b>` : `transferência até <b>${dmw(g.tr)}</b> cai em ${esc(g.mt)} → transferir até <b>${dmw(g.st)}</b>`);
    if (dts.length) A.push(['warn', '<b>Datas fora de dia útil:</b> ' + dts.join(' · ') + '.']);
    const pv = sum(I.filter(x => N(x.cat).includes('previs')), 'vn');
    if (tot.vn && pv) A.push(['warn', `<b>${p(pv / tot.vn)}</b> do valor (${f(pv)}) ainda está em <b>Previsão</b>, sem pedido de compra: o valor a transferir pode mudar.`]);
    const dup = {}; I.forEach(x => { const k = N(x.f + '|' + x.i + '|' + x.vo); (dup[k] = dup[k] || []).push(x) });
    Object.values(dup).filter(a => a.length > 1).forEach(a => A.push(['info', `Possível duplicidade: <b>${esc(a[0].f)}</b> · ${esc(a[0].i)} · ${f(a[0].vo)} aparece ${a.length}× (${a.map(x => dm(x.dt)).join(', ')}). Confirme se são parcelas distintas.`]));
    if (tot.et && tot.ec < tot.et * .98) A.push(['warn', `A economia real (${f(tot.ec)}) está <b>${p(1 - tot.ec / tot.et)}</b> abaixo da teórica (${f(tot.et)}).`]);
    else if (tot.et) A.push(['ok', `Economia real ${f(tot.ec)} = <b>${p(tot.ec / tot.et)}</b> da teórica (${f(tot.et)}).`]);
    const top = {}; I.forEach(x => top[x.f] = (top[x.f] || 0) + x.vn); const mx = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
    if (mx && tot.vn && mx[1] / tot.vn > .3) A.push(['info', `Concentração: <b>${esc(mx[0])}</b> representa <b>${p(mx[1] / tot.vn)}</b> do valor das compras.`]);
    if (C.out) A.push(['info', `${C.out} compra(s) (${f(C.outV)}) estão fora do horizonte (${br(q.ref)} a ${br(C.fim)}) e não entram nos totais.`]);
    return A
  }

  /* ---------- telas ---------- */
  const ICON = { ok: '✔', warn: '⚠', info: 'ℹ' }, COR = { ok: 'text-emerald-600', warn: 'text-amber-600', info: 'text-indigo-500' };
  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">REIDI</h1></div>
  ${B ? `<button class="btn adm" onclick="reidi.termo()">📝 Termo p/ assinatura</button>` : ''}
  <button class="btn2 adm" title="Documento nº, data de referência, horizonte e saldo (valem para todos)" onclick="reidi.parm()">⚙ Parâmetros</button>
  <button class="btn2 adm" title="Incluir, editar ou excluir as compras do REIDI" onclick="go('lanc')">📝 Lançar compras</button>
  <button class="btn2 adm" title="Baixa a planilha no modelo Projeção Mensal de Compras REIDI" onclick="reidi.exp()">⬇ Planilha (modelo)</button>
  ${B ? '<button class="btn2" onclick="reidi.xl()">Excel</button>' : ''}</div>
  ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  const adm = () => ROLE == 'admin',
    sujo = () => adm() && B && P.saldo != null && +P.saldo != (+B.saldo || 0),
    pubBar = () => { if (!sujo()) return ''; const q = par(); return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm"><span class="mr-auto">⚠ Alterações <b>ainda não publicadas</b>: saldo ${f(q.saldo)}. Só você vê este valor até publicar.</span><button class="btn" onclick="reidi.pub()">📤 Publicar saldo para todos</button><button class="btn2" onclick="reidi.desc()">Descartar</button></div>` };
  /* filtro de período (De/Até): visível para todos; o horizonte é a contagem de dias entre as duas datas (Até − De) */
  const perBar = () => {
    const q = par(), de = q.ref, ate = addD(q.ref, q.hor), pub = B.ref, pubA = addD(B.ref, +B.hor || 30), difere = de != pub || ate != pubA,
      btn = (l, t, a) => `<button type="button" class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 hover:bg-indigo-500/20" title="${t}" onclick="${a}">${l}</button>`;
    return `<div id="reidi-per" class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 px-4 py-2.5">
      <div class="text-xs font-bold uppercase tracking-wide self-center">📅 Período</div>
      <label class="text-xs font-semibold uppercase tracking-wide">De<input id="reidi-de" type="date" value="${de}" class="block mt-0.5 rounded-md border border-indigo-500/40 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500" onchange="reidi.per('de',this.value)"></label>
      <label class="text-xs font-semibold uppercase tracking-wide">Até<input id="reidi-ate" type="date" value="${ate}" class="block mt-0.5 rounded-md border border-indigo-500/40 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500" onchange="reidi.per('ate',this.value)"></label>
      <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-center" title="Contagem de dias entre as duas datas (Até − De)"><div class="text-[10px] font-semibold uppercase tracking-wide">Horizonte</div><div id="reidi-hz" class="text-2xl font-bold leading-tight">${q.hor} <span class="text-sm font-semibold">dias</span></div></div>
      <div class="flex flex-wrap items-center gap-1.5 self-center">${btn('Mês atual', 'Do dia 1 ao último dia do mês atual', "reidi.pre('mes')")}${btn('Próximo mês', 'Do dia 1 ao último dia do próximo mês', "reidi.pre('prox')")}${btn('Próx. 30 dias', 'De hoje até 30 dias à frente', "reidi.pre('30')")}${difere ? btn('↺ Padrão', 'Voltar ao período publicado (' + br(pub) + ' a ' + br(pubA) + ')', "reidi.pre('pub')") : ''}</div>
      ${difere ? `<div class="text-xs self-center">Filtro ativo · padrão publicado: ${br(pub)} a ${br(pubA)}</div>` : ''}
    </div>`
  };
  const tabs = () =>
    `<div class="flex flex-wrap items-center gap-2"><div class="flex flex-wrap gap-1 mr-auto">${[['res', 'Resumo Executivo'], ['fin', 'Análise Financeira'], ['proj', 'Projeção de Compras'], ['real', 'REIDI Realizado']].map(([k, n]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium ${tab == k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="reidi.t('${k}')">${n}</button>`).join('')}</div></div>${tab == 'real' ? '' : perBar()}${pubBar()}`;
  const vazio = () => `<div class="card py-12 text-center"><div class="text-4xl mb-2">🏗️</div><p class="font-semibold">${ERR ? 'Não foi possível carregar o REIDI' : !RDB.ok ? 'Carregando…' : 'Nenhuma compra lançada ainda'}</p><p class="text-sm text-slate-500 mt-1">${!RDB.ok ? '' : ROLE == 'admin' ? 'Use “Projeção REIDI” (menu) para incluir as compras; o relatório se monta sozinho.' : 'Peça às áreas responsáveis para lançar as compras em “Projeção REIDI”.'}</p>${RDB.ok && ROLE == 'admin' ? '<button class="btn mt-4" onclick="go(\'lanc\')">📝 Ir para Projeção REIDI</button>' : ''}</div>`;
  const card = (t, v, s, c) => `<div class="card text-center"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-2xl font-bold mt-1 ${c || ''}">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div>`;

  function resumo() {
    const C = calc(), { q, tot, G, T } = C,
      kp = (t, v, c) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-xl font-bold mt-0.5 ${c || ''}">${v}</div></div>`,
      lin = G.map(g => `<div class="flex items-baseline justify-between gap-3 py-2 border-t border-slate-200 dark:border-slate-800 first:border-0"><div class="text-sm font-medium">${g.q}</div><div class="text-base font-semibold whitespace-nowrap">${f(g.tf)}</div></div>`).join(''),
      fm = {}; C.I.forEach(x => { const o = fm[x.f] = fm[x.f] || { f: x.f, ec: 0, et: 0, t: 0, g: {} }; o.t += x.vn; o.ec += x.ec; o.et += x.et; o.g[x.pg] = (o.g[x.pg] || 0) + x.vn });
    const FL = Object.values(fm).sort((a, b) => b.t - a.t), th = (l, r) => `<th class="px-2 py-1.5 ${r ? 'text-right' : 'text-left'}">${l}</th>`,
      mini = FL.length ? `<div class="mt-3 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800" style="max-height:230px"><table class="w-full text-xs whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr>${th('Fornecedor')}${G.map(g => th(g.q.replace(' quinzena', ' quinz.'), 1)).join('')}${th('Total', 1)}${th('Economia real', 1)}${th('Economia teórica', 1)}</tr></thead>
        <tbody>${FL.map(o => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 max-w-[220px] truncate" title="${esc(o.f)}">${esc(o.f)}</td>${G.map(g => `<td class="px-2 py-1 text-right">${o.g[g.pg] ? f(o.g[g.pg]) : '—'}</td>`).join('')}<td class="px-2 py-1 text-right font-semibold">${f(o.t)}</td><td class="px-2 py-1 text-right text-emerald-600">${f(o.ec)}</td><td class="px-2 py-1 text-right">${f(o.et)}</td></tr>`).join('')}</tbody>
        <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-2 py-1.5">TOTAL (${FL.length})</td>${G.map(g => `<td class="px-2 py-1.5 text-right">${f(g.vn)}</td>`).join('')}<td class="px-2 py-1.5 text-right">${f(tot.vn)}</td><td class="px-2 py-1.5 text-right text-emerald-600">${f(tot.ec)}</td><td class="px-2 py-1.5 text-right">${f(tot.et)}</td></tr></tfoot></table></div>` : '';;
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kp('Valor das compras · ' + q.hor + ' dias', f(tot.vn))}${kp('Economia REIDI real', f(tot.ec), 'text-emerald-600')}${kp('Economia REIDI teórica', f(tot.et))}${kp('Compras no período', tot.n)}</div>
  <div class="grid lg:grid-cols-5 gap-4">
    <div class="card lg:col-span-3"><h2 class="font-semibold mb-2">Compras por quinzena</h2><div style="height:300px"><canvas id="rc1"></canvas></div>${mini}</div>
    <div class="card lg:col-span-2 flex flex-col"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Valor a transferir para a Belov Obras</div><div class="text-4xl font-bold text-indigo-500 mt-1">${f(T)}</div>
      <div class="text-xs text-slate-500 mt-1">Compras ${f(tot.vn)}${q.saldo ? ' − saldo ' + f(q.saldo) : ''} = ${f(C.liq)} → arredondado para cima em múltiplos de ${f(PASSO)}${C.folga > .005 ? ' (<b>+' + f(C.folga) + '</b>)' : ''}</div>
      <label class="text-xs text-slate-500 mt-4 block">Saldo em C/C Belov Obras (Santander)</label><input id="reidi-sd" class="inp w-full text-lg font-semibold mt-1" inputmode="decimal" value="${esc(q.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" onchange="reidi.saldo(this.value)" onfocus="this.select()" ${adm() ? '' : 'readonly title="Definido pelo administrador"'}>
      <div class="mt-4">${lin || '<p class="text-sm text-slate-500">Nenhuma compra no horizonte.</p>'}</div></div></div>`
  }
  function tema() {
    const dk = dark(), tx = dk ? '#cbd5e1' : '#334155', BL = dk ? '#3987e5' : '#2a78d6', LA = dk ? '#d95926' : '#eb6834', AQ = dk ? '#199e70' : '#1baf7a', GR = dk ? '#64748b' : '#94a3b8',
      dl = (o = {}) => ({ color: tx, font: { size: 12, weight: '600' }, formatter: v => v ? K(v) : '', ...o }),
      leg = n => n > 1 ? { display: true, position: 'top', align: 'start', labels: { color: tx, boxWidth: 10, boxHeight: 10, font: { size: 11 } } } : { display: false },
      lb = c => c.dataset.label + ': ' + f(c.raw),
      horiz = (labels, ds) => ({ type: 'bar', data: { labels, datasets: ds }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 56 } }, plugins: { legend: leg(ds.length), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 11, weight: '600' } }), tooltip: { callbacks: { label: lb } } }, scales: { x: { display: false, beginAtZero: true, grid: { display: false } }, y: { grid: { display: false }, ticks: { color: tx, font: { size: 11 }, callback(v) { const s = String(this.getLabelForValue(v)); return s.length > 22 ? s.slice(0, 21) + '…' : s } } } } } });
    return { dk, tx, BL, LA, AQ, GR, dl, leg, lb, horiz }
  }
  function graficos() {
    const C = calc(), { tx, BL, AQ, dl, leg, lb } = tema();
    Object.values(CH).forEach(c => c.destroy()); CH = {};
    const mk = (id, cfg) => { const e = document.getElementById(id); if (e) CH[id] = new Chart(e, cfg) };
    /* gráfico principal: valor das compras × economia REIDI por quinzena (o múltiplo de 5.000 fica só no cartão de transferência) */
    mk('rc1', { type: 'bar', data: { labels: C.G.map(g => [g.q, g.per]), datasets: [{ label: 'Valor das compras', data: C.G.map(g => g.vn), backgroundColor: BL, maxBarThickness: 64, borderRadius: 5 }, { label: 'Economia REIDI', data: C.G.map(g => g.ec), backgroundColor: AQ, maxBarThickness: 64, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 13, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = C.G[it[0].dataIndex]; return g ? ['Compras: ' + g.n, 'Economia real: ' + f(g.ec) + (g.vo ? ' (' + p(g.ec / g.vo) + ')' : ''), 'Economia teórica: ' + f(g.et), 'Pagamento: ' + dmw(g.pg)] : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } });
  }

  /* ---------- Análise Financeira: quanto ganhamos aplicando o REIDI ---------- */
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function fdados(C) {
    const it = ESC == 'all' ? C.L : C.I, q = C.q, S = a => ({ n: a.length, vo: sum(a, 'vo'), vn: sum(a, 'vn'), ec: sum(a, 'ec') }), m = {};
    it.forEach(x => { (m[x.pg] = m[x.pg] || []).push(x) });
    const GP = Object.keys(m).sort().map(k => ({ k, lb: [(+k.slice(8) <= q.d1 ? '1ª' : '2ª') + ' quinzena', MES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4)], ...S(m[k]) }));
    return { it, t: S(it), GP }
  }
  function fin() {
    const C = calc(), D = fdados(C), { t } = D, q = C.q,
      seg = (k, n) => `<button class="px-3 py-1 rounded-md text-sm ${ESC == k ? 'bg-white dark:bg-slate-700 shadow font-medium' : 'text-slate-500'}" onclick="reidi.e('${k}')">${n}</button>`,
      kp = (l, v, s, c) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${l}</div><div class="text-2xl font-bold mt-0.5 ${c || ''}">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-0.5">${s}</div>` : ''}</div>`;
    if (!D.it.length) return `<div class="card py-10 text-center text-slate-500">Nenhuma compra no período. Use “Toda a base” ou ajuste o período (De/Até).</div>`;
    return `<div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">${seg('hor', 'Período · ' + q.hor + ' dias')}${seg('all', 'Toda a base')}</div><span class="text-xs text-slate-500">${ESC == 'all' ? 'Todas as ' + t.n + ' compras da planilha' : br(q.ref) + ' a ' + br(C.fim) + ' · ' + t.n + ' compras'}</span></div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${kp('Sem REIDI', f(t.vo), 'valor original')}${kp('Com REIDI', f(t.vn), 'após negociação')}${kp('Ganho com o REIDI', f(t.ec), p(t.vo ? t.ec / t.vo : 0) + ' do valor original', 'text-emerald-600')}</div>
  <div class="card"><h2 class="font-semibold mb-2">Sem REIDI × Com REIDI</h2><div class="overflow-x-auto"><div style="height:320px;min-width:${D.GP.length * 150}px"><canvas id="rf1"></canvas></div></div></div>
  <div class="card space-y-3"><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold mr-auto">Compras · economia compra a compra</h2><input id="reidi-fq" class="inp w-full sm:w-80" placeholder="Pesquisar por nome (fornecedor, item ou pedido)…" value="${esc(FQF)}" oninput="reidi.fq(this.value)"><span id="reidi-fn" class="text-xs text-slate-500"></span></div><div id="reidi-ft"></div></div>`
  }
  /* tabela compra a compra (com pesquisa); atualiza só a tabela para não perder o foco do campo */
  function ftbl() {
    const el = document.getElementById('reidi-ft'); if (!el || !B) return; const D = fdados(calc()), q = N(FQF),
      r = D.it.filter(x => !q || N(x.f + ' ' + x.i + ' ' + x.ped + ' ' + x.cat).includes(q)).sort((a, b) => a.pg < b.pg ? -1 : a.pg > b.pg ? 1 : a.k - b.k), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec') },
      th = (l, rt) => `<th class="px-3 py-2 ${rt ? 'text-right' : 'text-left'}">${l}</th>`;
    el.innerHTML = `<div class="card p-0 overflow-auto" style="max-height:60vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Nº')}${th('Fornecedor')}${th('Item / descrição')}${th('Categoria')}${th('Pagamento')}${th('Sem REIDI', 1)}${th('Com REIDI', 1)}${th('Economia R$', 1)}${th('%', 1)}</tr></thead>
    <tbody>${r.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${x.k + 1}</td><td class="px-3 py-1.5">${esc(x.f)}</td><td class="px-3 py-1.5">${esc(x.i)}</td><td class="px-3 py-1.5">${esc(x.cat)}</td><td class="px-3 py-1.5">${dm(x.pg)}/${x.pg.slice(2, 4)}</td><td class="px-3 py-1.5 text-right">${f(x.vo)}</td><td class="px-3 py-1.5 text-right">${f(x.vn)}</td><td class="px-3 py-1.5 text-right text-emerald-600">${f(x.ec)}</td><td class="px-3 py-1.5 text-right">${x.vo ? p(x.ec / x.vo) : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="px-3 py-6 text-center text-slate-500">Nenhuma compra encontrada.</td></tr>`}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="5">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right text-emerald-600">${f(t.ec)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.ec / t.vo) : ''}</td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-fn'); if (n) n.textContent = r.length + ' de ' + D.it.length + ' compras'
  }
  function gfin() {
    const C = calc(), D = fdados(C), { tx, BL, GR, dl, leg, lb } = tema(); Object.values(CH).forEach(c => c.destroy()); CH = {};
    const mk = (id, cfg) => { const e = document.getElementById(id); if (e) CH[id] = new Chart(e, cfg) };
    mk('rf1', { type: 'bar', data: { labels: D.GP.map(g => [g.lb[0], g.lb[1], 'ganho ' + K(g.ec)]), datasets: [{ label: 'Sem REIDI', data: D.GP.map(g => g.vo), backgroundColor: GR, maxBarThickness: 56, borderRadius: 5 }, { label: 'Com REIDI', data: D.GP.map(g => g.vn), backgroundColor: BL, maxBarThickness: 56, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 12, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = D.GP[it[0].dataIndex]; return g ? ['Compras: ' + g.n, 'Ganho REIDI: ' + f(g.ec) + ' (' + (g.vo ? p(g.ec / g.vo) : '') + ')'] : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } })
  }

  /* ---------- Projeção de Compras ---------- */
  function linhas(C) {
    const q = N(FQ); let r = C.L.filter(x => (!HZ || x.in) && (!FCt || x.cat == FCt) && (!FRp || x.rp == FRp) && (!FP || x.pg == FP) && (!q || N(x.f + ' ' + x.i + ' ' + x.ped).includes(q)));
    const g = x => x[SK]; r = r.slice().sort((a, b) => { const u = g(a), v = g(b); return (typeof u == 'number' ? u - v : String(u).localeCompare(String(v), 'pt-BR', { numeric: true })) * SD }); return r
  }
  const COLS = [['k', 'Nº', 'l'], ['f', 'Fornecedor', 'l'], ['i', 'Item / descrição', 'l'], ['cat', 'Categoria', 'l'], ['ped', 'Nº pedido / processo / NF', 'l'], ['dt', 'Data prevista', 'l'], ['pg', 'Pagamento', 'l'], ['pa', '% PIS/COFINS aplicado', 'r'], ['pc', 'Alíquota de referência', 'r'], ['rp', 'Responsável', 'l'], ['vo', 'Valor original', 'r'], ['vn', 'Valor negociado', 'r'], ['ec', 'Economia real R$', 'r'], ['ecp', '%', 'r'], ['et', 'Economia teórica R$', 'r'], ['etp', '%', 'r'], ['ba', 'Data base atualização', 'l']];
  const cel = (x, k) => k == 'k' ? x.k + 1 : ['dt', 'pg', 'ba'].includes(k) ? dm(x[k]) + '/' + x[k].slice(2, 4) : ['pa', 'pc', 'ecp', 'etp'].includes(k) ? (k == 'pa' && !x.vo ? '—' : p(x[k])) : ['vo', 'vn', 'ec', 'et'].includes(k) ? f(x[k]) : esc(x[k] || '');
  function proj() {
    const C = calc(), cats = [...new Set(B.c.map(x => x.cat).filter(Boolean))], rps = [...new Set(B.c.map(x => x.rp).filter(Boolean))], pgs = [...new Set(C.L.filter(x => !HZ || x.in).map(x => x.pg))].sort(),
      sel = (id, v, a, l, fn) => `<select class="inp" onchange="reidi.fl('${id}',this.value)"><option value="">${l}</option>${a.map(o => `<option value="${esc(o)}" ${o == v ? 'selected' : ''}>${esc(fn ? fn(o) : o)}</option>`).join('')}</select>`;
    return `<div class="flex flex-wrap items-center gap-2">${sel('cat', FCt, cats, 'Todas as categorias')}${sel('rp', FRp, rps, 'Todos os responsáveis')}${sel('pg', FP, pgs, 'Todas as datas de pagamento', dmw)}
    <input id="reidi-q" class="inp w-64" placeholder="Buscar fornecedor, item ou pedido…" value="${esc(FQ)}" oninput="reidi.fl('q',this.value)"><label class="text-sm flex items-center gap-1.5"><input type="checkbox" ${HZ ? 'checked' : ''} onchange="reidi.fl('hz',this.checked)"> só dentro do período</label><span id="reidi-n" class="text-xs text-slate-500 ml-auto"></span></div><div id="reidi-t"></div>
    <p class="text-xs text-slate-500">Pagamento e transferência seguem o calendário (dia ${C.q.d1} e último dia do mês; transferência ${C.q.ant} dia(s) antes). Economia real = valor original − valor negociado com o fornecedor. % PIS/COFINS aplicado (cálculo reverso) = (1 − valor negociado ÷ valor original) ÷ 90%. Economia teórica = valor original × alíquota de referência × 90%, sendo a alíquota de referência a mais próxima do % aplicado entre 3,65% e 9,25%.</p>`
  }
  function tbl() {
    const el = document.getElementById('reidi-t'); if (!el || !B) return; const C = calc(), r = linhas(C), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec'), et: sum(r, 'et') };
    el.innerHTML = `<div class="card p-0 overflow-auto" style="max-height:66vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${COLS.map(c => `<th class="px-3 py-2 ${c[2] == 'r' ? 'text-right' : 'text-left'} cursor-pointer select-none" onclick="reidi.s('${c[0]}')">${c[1]}${SK == c[0] ? (SD > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${r.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 ${x.in ? '' : 'opacity-50'}">${COLS.map(c => `<td class="px-3 py-1.5 ${c[2] == 'r' ? 'text-right' : ''} ${c[0] == 'ec' || c[0] == 'ecp' ? 'text-emerald-600' : ''}">${cel(x, c[0])}${c[0] == 'pg' && (x.pg && motivo(x.pg)) ? ' <span class="text-amber-600" title="' + esc(motivo(x.pg)) + '">⚠</span>' : ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="px-3 py-6 text-center text-slate-500">Nenhuma compra encontrada.</td></tr>`}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="10">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right text-emerald-600">${f(t.ec)}</td><td></td><td class="px-3 py-2 text-right">${f(t.et)}</td><td></td><td></td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-n'); if (n) n.textContent = r.length + ' de ' + B.c.length + ' compras · ' + (r.length && !HZ ? 'linhas esmaecidas = fora do horizonte' : '')
  }
  /* ---------- REIDI Realizado: somente as compras com Status = Pago ---------- */
  function pagas() {
    const d1 = par().d1; return B.c.filter(x => x.st == 'Pago').map(x => { const pg = payDate(x.dt, d1), ec = x.vo - x.vn, I = RDB.ident(x.vo, x.vn); return { ...x, pc: I.al, pa: I.pa, pg, ec, ecp: x.vo ? ec / x.vo : 0, et: RDB.teor(x.vo, I.al) } })
  }
  function rfiltro() {
    const q = N(RQ); return pagas().filter(x => (!RM || x.pg.slice(0, 7) == RM) && (!q || N(x.f + ' ' + x.i + ' ' + x.ped + ' ' + x.rp + ' ' + x.cat).includes(q))).sort((a, b) => a.pg < b.pg ? -1 : a.pg > b.pg ? 1 : a.f < b.f ? -1 : 1)
  }
  const mesLb = ym => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+ym.slice(5) - 1] + '/' + ym.slice(2, 4);
  function real() {
    const todas = pagas(), meses = [...new Set(todas.map(x => x.pg.slice(0, 7)))].sort(), tot = sum(B.c, 'vn'), pg = sum(todas, 'vn'), vo = sum(todas, 'vo'), ec = vo - pg,
      kp = (t, v, sb) => `<div class="card py-3"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-2xl font-bold mt-0.5">${v}</div>${sb ? `<div class="text-xs text-slate-500">${sb}</div>` : ''}</div>`;
    if (!todas.length) return `<div class="card py-12 text-center"><div class="text-4xl mb-2">✅</div><p class="font-semibold">Nenhuma compra paga ainda</p><p class="text-sm text-slate-500 mt-1">Em <b>Projeção REIDI</b>, mude o Status da compra para “Pago” e ela aparece aqui para todos.</p></div>`;
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kp('Compras pagas', todas.length, 'de ' + B.c.length + ' lançadas')}${kp('Valor pago (após REIDI)', f(pg), tot ? p(pg / tot) + ' do total lançado' : '')}${kp('Valor sem REIDI', f(vo))}${kp('Economia REIDI realizada', '<span class="text-emerald-600">' + f(ec) + '</span>', (vo ? p(ec / vo) + ' do valor original' : '') + ' · teórica ' + f(todas.reduce((t, x) => t + x.et, 0)))}</div>
    <div class="flex flex-wrap items-center gap-2"><select class="inp" onchange="reidi.rf('m',this.value)"><option value="">Todos os meses de pagamento</option>${meses.map(m => `<option value="${m}" ${m == RM ? 'selected' : ''}>${mesLb(m)}</option>`).join('')}</select>
    <input id="reidi-rq" class="inp w-64" placeholder="Buscar fornecedor, item, pedido…" value="${esc(RQ)}" oninput="reidi.rf('q',this.value)"><span id="reidi-rn" class="text-xs text-slate-500 ml-auto"></span></div><div id="reidi-rt"></div>
    <p class="text-xs text-slate-500">Mostra somente as compras com Status <b>Pago</b> na Projeção REIDI, independentemente do horizonte. A data de pagamento segue o calendário (dia ${par().d1} e último dia do mês).</p>`
  }
  function rtbl() {
    const el = document.getElementById('reidi-rt'); if (!el || !B) return; const r = rfiltro(), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec') }, G = {};
    r.forEach(x => { const g = G[x.pg] = G[x.pg] || { pg: x.pg, n: 0, vo: 0, vn: 0, ec: 0 }; g.n++; g.vo += x.vo; g.vn += x.vn; g.ec += x.ec });
    const th = (l, rt) => `<th class="px-3 py-2 ${rt ? 'text-right' : 'text-left'}">${l}</th>`, GL = Object.values(G);
    el.innerHTML = `<div class="card p-0 overflow-auto mb-3"><table class="w-full text-sm whitespace-nowrap"><thead class="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Pagamento')}${th('Nº compras', 1)}${th('Sem REIDI', 1)}${th('Valor pago', 1)}${th('Economia R$', 1)}${th('%', 1)}</tr></thead>
    <tbody>${GL.map(g => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${dmw(g.pg)}</td><td class="px-3 py-1.5 text-right">${g.n}</td><td class="px-3 py-1.5 text-right">${f(g.vo)}</td><td class="px-3 py-1.5 text-right font-medium">${f(g.vn)}</td><td class="px-3 py-1.5 text-right text-emerald-600">${f(g.ec)}</td><td class="px-3 py-1.5 text-right">${g.vo ? p(g.ec / g.vo) : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">Nenhuma compra paga com esse filtro.</td></tr>'}</tbody></table></div>
    <div class="card p-0 overflow-auto" style="max-height:60vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Nº')}${th('Fornecedor')}${th('Item / descrição')}${th('Categoria')}${th('Nº pedido / NF')}${th('Data prevista')}${th('Pagamento')}${th('% PIS/COFINS aplicado', 1)}${th('Responsável')}${th('Valor original', 1)}${th('Valor pago', 1)}${th('Economia R$', 1)}${th('%', 1)}</tr></thead>
    <tbody>${r.map((x, i) => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${i + 1}</td><td class="px-3 py-1.5">${esc(x.f)}</td><td class="px-3 py-1.5">${esc(x.i)}</td><td class="px-3 py-1.5">${esc(x.cat)}</td><td class="px-3 py-1.5">${esc(x.ped) || '-'}</td><td class="px-3 py-1.5">${dm(x.dt)}/${x.dt.slice(2, 4)}</td><td class="px-3 py-1.5">${dm(x.pg)}/${x.pg.slice(2, 4)}</td><td class="px-3 py-1.5 text-right" title="Cálculo reverso: (1 − valor pago ÷ valor original) ÷ 90% · alíquota de referência ${p(x.pc)}">${x.vo ? p(x.pa) : '—'}</td><td class="px-3 py-1.5">${esc(x.rp)}</td><td class="px-3 py-1.5 text-right">${f(x.vo)}</td><td class="px-3 py-1.5 text-right font-medium">${f(x.vn)}</td><td class="px-3 py-1.5 text-right text-emerald-600">${f(x.ec)}</td><td class="px-3 py-1.5 text-right text-emerald-600">${x.vo ? p(x.ecp) : ''}</td></tr>`).join('') || '<tr><td colspan="13" class="px-3 py-6 text-center text-slate-500">Nenhuma compra paga encontrada.</td></tr>'}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="9">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right text-emerald-600">${f(t.ec)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.ec / t.vo) : ''}</td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-rn'); if (n) n.textContent = r.length + ' de ' + pagas().length + ' compras pagas'
  }
  function render() {
    Object.values(CH).forEach(c => c.destroy()); CH = {};
    VIEW.innerHTML = head() + (B ? tabs() + (tab == 'res' ? resumo() : tab == 'fin' ? fin() : tab == 'real' ? real() : proj()) : vazio());
    if (B) { if (tab == 'res') graficos(); else if (tab == 'fin') { gfin(); ftbl() } else if (tab == 'real') rtbl(); else tbl() }
  }

  /* ---------- dados do Supabase (lançamentos + parâmetros) ---------- */
  const mes1 = () => RDB.hoje().slice(0, 8) + '01';
  function montar() {
    const C = RDB.cfg(), ae = RDB.L.map(x => x.ae).concat(RDB.Ct ? [RDB.Ct] : []).filter(Boolean).sort().pop();
    B = RDB.ok ? { v: 3, doc: C.doc, ref: C.ref, hor: C.hor, saldo: C.saldo, resp: C.resp, c: RDB.L.filter(x => x.dt).map(x => ({ ...x })) } : null;
    META = ae ? BASE.fdh(ae) : ''; const k = RDB.Ct || 'sem-config'; if (P.bst && P.bst != k) limpa(); P.bst = k; salva()
  }
  let PEND = false;
  function atual() {
    montar(); if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } render()
  }
  async function nuvem() {
    try { ERR = false; await RDB.carregar(); montar(); render() } catch (e) { MSG = 'Não consegui carregar o REIDI: ' + (e.message || e) + '. Confira se o SQL supabase/reidi-lancamentos.sql foi executado.'; ERR = true; render() }
  }
  try { RDB.on(atual, () => !VIEW.classList.contains('hidden')); VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; render() } }, 80) }) } catch (e) { }

  /* ---------- Excel ---------- */
  /* Excel formatado no tema azul do Consórcio: Resumo Executivo (indicadores, gráficos e quadros) + abas de dados com largura ajustada, valores e datas formatados, bordas só onde há dados e linhas de grade ocultas */
  async function xl() {
    if (!B) return;
    try {
      const E = XR, c = E.C, C = calc(), q = C.q, D = fdados(C), t = D.t, wb = XP.book({ titulo: 'REIDI · Projeção Mensal de Compras' }), sd = E.serial, PJ = 'Projeção por Período', RL = 'REIDI Realizado', strip = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const sub = 'Documento nº ' + B.doc + ' · Referência ' + br(q.ref) + ' · Horizonte de ' + q.hor + ' dias (até ' + br(C.fim) + ') · Gerado em ' + E.hoje(), rod = 'Consórcio Santa Dulce · REIDI · Projeção Mensal de Compras';
      const R0 = wb.sheet('Resumo Executivo', { tab: c.navy, grid: false, sel: true, rod, zoom: 90 });
      const pg = pagas().sort((a, b) => a.pg < b.pg ? -1 : a.pg > b.pg ? 1 : a.f < b.f ? -1 : 1), G = C.G, lbq = g => g.q + ' · ' + MES[+g.pg.slice(5, 7) - 1] + '/' + g.pg.slice(2, 4);
      const PRM = n => `'${PJ}'!$F$${n}`, FAT = PRM(19), AA = PRM(20), AB = PRM(21), /* parâmetros: fator 90% e alíquotas de referência (linhas 19–21 da aba Projeção por Período) */
        paF = (r, i, L) => `IF(${L.vo}${r}=0,0,(${L.vo}${r}-${L.vn}${r})/(${L.vo}${r}*${FAT}))`, alF = (r, i, L) => `IF(${L.pa}${r}>=(${AA}+${AB})/2,${AB},${AA})`, etF = (r, i, L) => `${L.vo}${r}*${L.al}${r}*${FAT}`,
        paT = (vo, ec) => ({ f: (rt, L) => `IF(${L.vo}${rt}=0,0,(${L.vo}${rt}-${L.vn}${rt})/(${L.vo}${rt}*${FAT}))`, v: vo ? ec / (vo * RDB.FATOR) : 0 }),
        ecF = (r, i, L) => `${L.vo}${r}-${L.vn}${r}`, pcF = (r, i, L) => `IF(${L.vo}${r}=0,0,${L.ec}${r}/${L.vo}${r})`, pcT = (vo, ec) => ({ f: (rt, L) => `IF(${L.vo}${rt}=0,0,${L.ec}${rt}/${L.vo}${rt})`, v: vo ? ec / vo : 0 });

      /* ---- Projeção por Período (parâmetros + quadro por quinzena) ---- */
      const P1 = E.dados(wb, PJ, { titulo: 'Projeção por período · pagamentos e transferências', sub, rod, hr: 24, rows: G, hh: 34,
        antes: (ws, r) => {
          const L = [['Documento nº', B.doc, null], ['Data de referência', sd(q.ref), 'data'], ['Horizonte (dias)', q.hor, 'int'], ['Saldo em C/C Belov Obras (Santander)', q.saldo, 'moeda'], ['Valor total das compras', C.tot.vn, 'moeda'], ['Economia REIDI real (negociada)', C.tot.ec, 'moeda'], ['Economia REIDI teórica (alíq. de referência × 90%)', C.tot.et, 'moeda'], ['Nº de compras', C.tot.n, 'int'], ['Valor a transferir (múltiplo de R$ 5.000)', C.T, 'moeda'], ['Compras − saldo (antes do arredondamento)', C.liq, 'moeda'], ['Arredondamento', C.folga, 'moeda'], ['Fator da economia teórica (sobre a alíquota)', RDB.FATOR, 'pct2'], ['Alíquota de referência A (PIS/COFINS)', RDB.ALIQ[0], 'pct2'], ['Alíquota de referência B (PIS/COFINS)', RDB.ALIQ[1], 'pct2']];
          E.sec(ws, r, 2, 9, 'Parâmetros e resultado');
          L.forEach(([k, v, nf], i) => { const rr = r + 1 + i, fg = i % 2 ? c.zebra : null; ws.merge(rr, 2, rr, 5, k, { box: c.line, fg, b: 1, c: c.navy, ind: 1, v: 'center' }); const st = { box: c.line, fg, b: 1, h: nf ? 'right' : 'center', v: 'center', ind: nf ? 1 : 0 }; if (nf) st.nf = E.NF[nf == 'moeda' ? 'moedaZ' : nf]; ws.put(rr, 6, v, st); for (let cc = 7; cc <= 9; cc++) ws.put(rr, cc, null, {}) });
          E.sec(ws, 23, 2, 9, 'Pagamentos e transferências por quinzena')
        },
        cols: [{ h: 'PERÍODO', g: g => g.q + ' (' + g.per + ')', tot: 'TOTAL', b: 1 }, { h: 'PAGAMENTO EM', g: g => sd(g.pg), nf: 'data' }, { h: 'TRANSFERIR ATÉ', g: g => sd(g.tr), nf: 'data' }, { h: 'Nº DE COMPRAS', g: g => g.n, nf: 'int', tot: 'sum', k: 'n' }, { h: 'VALOR DAS COMPRAS', g: g => g.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA REIDI REAL', g: g => g.ec, nf: 'moeda', tot: 'sum', k: 'ec' }, { h: 'ECONOMIA REIDI TEÓRICA', g: g => g.et, nf: 'moeda', tot: 'sum', k: 'et' }, { h: 'A TRANSFERIR', g: g => g.tf, nf: 'moeda', tot: 'sum', k: 'tf' }] });
      P1.ws.o.sel = false;

      /* ---- Análise Financeira ---- */
      const AF = D.it.slice().sort((a, b) => a.pg < b.pg ? -1 : a.pg > b.pg ? 1 : a.k - b.k);
      E.dados(wb, 'Análise Financeira', { titulo: 'Análise financeira · ganho com o REIDI', sub: 'Escopo: ' + (ESC == 'all' ? 'toda a base de compras' : 'período ' + br(q.ref) + ' a ' + br(C.fim)) + ' · Sem REIDI × Com REIDI · ' + E.hoje(), rod, rows: AF,
        cols: [{ h: 'Nº', g: x => x.k + 1, nf: 'int', al: 'center', tot: 'TOTAL' }, { h: 'FORNECEDOR', g: x => x.f, w: 1, maxW: 40 }, { h: 'ITEM / DESCRIÇÃO', g: x => x.i, w: 1, maxW: 50 }, { h: 'CATEGORIA', g: x => x.cat, w: 1, maxW: 30 }, { h: 'PAGAMENTO', g: x => sd(x.pg), nf: 'data' },
          { h: 'SEM REIDI', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'COM REIDI', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: x => x.vo ? x.ec / x.vo : 0, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(t.vo, t.ec) }] });

      /* ---- Projeção de Compras ---- */
      const LN = linhas(C), sU = k => LN.reduce((a, x) => a + (+x[k] || 0), 0), vo = sU('vo'), ec = sU('ec'), et = sU('et');
      E.dados(wb, 'Projeção de Compras', { titulo: 'Projeção de compras · detalhamento', sub: LN.length + ' compra(s)' + (HZ ? ' dentro do horizonte' : '') + ' · ' + E.hoje(), rod, rows: LN, fz: 2,
        cols: [{ h: 'Nº', g: x => x.k + 1, nf: 'int', al: 'center', tot: 'TOTAL' }, { h: 'FORNECEDOR', g: x => x.f, w: 1, maxW: 38 }, { h: 'ITEM / DESCRIÇÃO', g: x => x.i, w: 1, maxW: 48 }, { h: 'CATEGORIA', g: x => x.cat, w: 1, maxW: 28 }, { h: 'Nº PEDIDO / PROCESSO / NF', g: x => x.ped, w: 1, maxW: 24 },
          { h: 'DATA PREVISTA', g: x => sd(x.dt), nf: 'data' }, { h: 'PAGAMENTO', g: x => sd(x.pg), nf: 'data' }, { h: '% PIS/COFINS APLICADO (REVERSO)', g: x => x.pa, nf: 'pct2', al: 'center', k: 'pa', f: paF, tot: paT(vo, ec) }, { h: 'ALÍQUOTA DE REFERÊNCIA', g: x => x.pc, nf: 'pct2', al: 'center', k: 'al', f: alF }, { h: 'RESPONSÁVEL', g: x => x.rp, w: 1, maxW: 26 },
          { h: 'VALOR ORIGINAL', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'VALOR NEGOCIADO COM O FORNECEDOR', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA REAL R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA REAL %', g: x => x.ecp, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(vo, ec) },
          { h: 'ECONOMIA TEÓRICA R$', g: x => x.et, nf: 'moeda', tot: 'sum', k: 'et', f: etF }, { h: 'ECONOMIA TEÓRICA %', g: x => x.etp, nf: 'pct', k: 'etp', f: (r, i, L) => `IF(${L.vo}${r}=0,0,${L.et}${r}/${L.vo}${r})`, tot: { f: (rt, L) => `IF(${L.vo}${rt}=0,0,${L.et}${rt}/${L.vo}${rt})`, v: vo ? et / vo : 0 } }, { h: 'DATA BASE ATUALIZAÇÃO', g: x => sd(x.ba), nf: 'data' }] });

      /* ---- REIDI Realizado ---- */
      let RLt = null;
      if (pg.length) {
        const pvo = sum(pg, 'vo'), pvn = sum(pg, 'vn');
        RLt = E.dados(wb, RL, { titulo: 'REIDI realizado · somente compras pagas', sub: pg.length + ' compra(s) com status Pago · ' + E.hoje(), rod, rows: pg, fz: 2,
          cols: [{ h: 'Nº', g: (x, i) => i + 1, nf: 'int', al: 'center', tot: 'TOTAL' }, { h: 'FORNECEDOR', g: x => x.f, w: 1, maxW: 38 }, { h: 'ITEM / DESCRIÇÃO', g: x => x.i, w: 1, maxW: 48 }, { h: 'CATEGORIA', g: x => x.cat, w: 1, maxW: 28 }, { h: 'Nº PEDIDO / NF', g: x => x.ped, w: 1, maxW: 24 }, { h: 'DATA PREVISTA', g: x => sd(x.dt), nf: 'data' }, { h: 'PAGAMENTO', g: x => sd(x.pg), nf: 'data' }, { h: '% PIS/COFINS APLICADO (REVERSO)', g: x => x.pa, nf: 'pct2', al: 'center', k: 'pa', f: paF, tot: paT(pvo, pvo - pvn) }, { h: 'RESPONSÁVEL', g: x => x.rp, w: 1, maxW: 26 },
            { h: 'VALOR ORIGINAL', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'VALOR PAGO', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: x => x.ecp, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(pvo, pvo - pvn) }] }).t
      }

      /* ================= RESUMO EXECUTIVO ================= */
      [24, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5].forEach((w, i) => R0.width(2 + i, w));
      let r = E.cab(R0, 9, { titulo: 'Resumo Executivo · REIDI', sub });
      const tr = P1.t, lk = (sh, col, row) => `'${sh}'!${col}${row}`;
      r = E.kpi(R0, r, 2, { w: 2, label: 'VALOR DAS COMPRAS NO HORIZONTE', v: { f: lk(PJ, tr.letter.vn, tr.rt), v: C.tot.vn }, sub: C.tot.n + ' compras · ' + br(q.ref) + ' a ' + br(C.fim), cor: c.blue });
      E.kpi(R0, 6, 4, { w: 2, label: 'ECONOMIA REIDI REAL', v: { f: lk(PJ, tr.letter.ec, tr.rt), v: C.tot.ec }, sub: (C.tot.vo ? p(C.tot.ec / C.tot.vo) : '0%') + ' do valor original · teórica ' + f(C.tot.et), cor: c.grn });
      E.kpi(R0, 6, 6, { w: 2, label: 'A TRANSFERIR PARA A BELOV OBRAS', v: { f: lk(PJ, tr.letter.tf, tr.rt), v: C.T }, sub: 'Saldo C/C ' + f(q.saldo) + ' · múltiplos de R$ 5.000', cor: c.yel, vc: c.navy });
      E.kpi(R0, 6, 8, { w: 2, label: 'REIDI REALIZADO · COMPRAS PAGAS', v: RLt ? { f: lk(RL, RLt.letter.vn, RLt.rt), v: sum(pg, 'vn') } : 0, sub: pg.length + ' compra(s) paga(s) · economia ' + f(sum(pg, 'ec')), cor: c.navy });
      r = 10; R0.height(r, 8); r++;
      const mx = (() => { const o = {}; C.I.forEach(x => o[x.f] = (o[x.f] || 0) + x.vn); return Object.entries(o).sort((a, b) => b[1] - a[1])[0] })();
      E.kpi(R0, r, 2, { w: 2, label: 'SEM REIDI · VALOR ORIGINAL', v: C.tot.vo, sub: 'compras do horizonte', cor: c.line, sz: 14, vc: c.ink });
      E.kpi(R0, r, 4, { w: 2, label: 'SALDO EM C/C BELOV OBRAS', v: q.saldo, sub: 'Santander · abatido do valor a transferir', cor: c.line, sz: 14, vc: c.ink });
      E.kpi(R0, r, 6, { w: 2, label: 'COMPRAS FORA DO HORIZONTE', v: C.outV, sub: C.out + ' compra(s) não entram nos totais', cor: c.line, sz: 14, vc: c.ink });
      E.kpi(R0, r, 8, { w: 2, label: 'MAIOR FORNECEDOR NO PERÍODO', v: mx ? short(mx[0]) : '—', sub: mx && C.tot.vn ? f(mx[1]) + ' · ' + p(mx[1] / C.tot.vn) + ' do valor' : '', cor: c.line, sz: 12, vc: c.ink, nf: 'int' });
      r += 4; R0.height(r, 10); r++;

      /* gráficos (os quadros que os alimentam estão logo abaixo) */
      r = E.sec(R0, r, 2, 9, 'Compras por quinzena e por categoria'); const gr = r; r += 16; R0.height(r, 10); r++;

      R0.brk(r); r = E.sec(R0, r, 2, 9, 'Quadro · compras por quinzena');
      const T1 = E.tabela(R0, r, 2, [{ h: 'QUINZENA', g: g => lbq(g), tot: 'TOTAL', b: 1 }, { h: 'PAGAMENTO EM', g: g => sd(g.pg), nf: 'data' }, { h: 'TRANSFERIR ATÉ', g: g => sd(g.tr), nf: 'data' }, { h: 'SEM REIDI', g: g => g.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'COM REIDI', g: g => g.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: g => g.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: g => g.vo ? g.ec / g.vo : 0, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(C.tot.vo, C.tot.ec) }, { h: 'A TRANSFERIR', g: g => g.tf, nf: 'moeda', tot: 'sum', k: 'tf' }], G, { hh: 30 });
      r = T1.end + 1;

      const cats = {}; C.I.forEach(x => { const k = x.cat || 'Sem categoria'; (cats[k] = cats[k] || { cat: k, n: 0, vo: 0, vn: 0, ec: 0 }); const o = cats[k]; o.n++; o.vo += x.vo; o.vn += x.vn; o.ec += x.ec });
      let CL = Object.values(cats).sort((a, b) => b.vn - a.vn); if (CL.length > 8) { const rest = CL.slice(7).reduce((a, x) => ({ cat: 'Demais categorias', n: a.n + x.n, vo: a.vo + x.vo, vn: a.vn + x.vn, ec: a.ec + x.ec }), { cat: 'Demais categorias', n: 0, vo: 0, vn: 0, ec: 0 }); CL = CL.slice(0, 7).concat([rest]) }
      r = E.sec(R0, r, 2, 9, 'Quadro · compras por categoria');
      const totVn = C.tot.vn;
      const T2 = E.tabela(R0, r, 2, [{ h: 'CATEGORIA', g: x => x.cat, tot: 'TOTAL', b: 1, w: 1 }, { h: 'Nº DE COMPRAS', g: x => x.n, nf: 'int', tot: 'sum' }, { h: 'SEM REIDI', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'COM REIDI', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: x => x.vo ? x.ec / x.vo : 0, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(C.tot.vo, C.tot.ec) },
        { h: '% DO TOTAL', g: x => totVn ? x.vn / totVn : 0, nf: 'pct', k: 'sh', f: (rr, i, L) => `IF(SUM(${L.vn}$${r + 1}:${L.vn}$${r + CL.length})=0,0,${L.vn}${rr}/SUM(${L.vn}$${r + 1}:${L.vn}$${r + CL.length}))`, tot: { f: (rt, L, r1, r2) => `SUM(${L.sh}${r1}:${L.sh}${r2})`, v: totVn ? 1 : 0 } }], CL, { hh: 30 });
      if (CL.length) R0.dataBar(T2.r1, 8, T2.r2, 8, '5B9BD5');
      r = T2.end + 1;

      const fo = {}; C.I.forEach(x => { const k = short(x.f) || '—'; (fo[k] = fo[k] || { f: k, n: 0, vn: 0, ec: 0 }); const o = fo[k]; o.n++; o.vn += x.vn; o.ec += x.ec });
      const FL = Object.values(fo).sort((a, b) => b.vn - a.vn).slice(0, 5);
      r = E.sec(R0, r, 2, 9, 'Quadro · maiores fornecedores do período');
      const T3 = E.tabela(R0, r, 2, [{ h: 'FORNECEDOR', g: x => x.f, w: 1, b: 1, tot: 'TOTAL (TOP 5)' }, { h: 'Nº DE COMPRAS', g: x => x.n, nf: 'int', tot: 'sum' }, { h: 'VALOR COM REIDI', g: x => x.vn, nf: 'moeda', tot: 'sum' }, { h: '% DO VALOR TOTAL', g: x => totVn ? x.vn / totVn : 0, nf: 'pct', tot: { f: (rt, L, r1, r2) => `SUM(E${r1}:E${r2})`, v: totVn ? FL.reduce((a, x) => a + x.vn, 0) / totVn : 0 } }, { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', c: c.grn, b: 1 }], FL, { hh: 30 });
      if (FL.length) R0.dataBar(T3.r1, 5, T3.r2, 5, '5B9BD5');
      r = T3.end + 1;

      if (G.length) {
        R0.chart({ kind: 'col', title: 'Sem REIDI × Com REIDI por quinzena', r1: gr, c1: 2, r2: gr + 15, c2: 5, cats: { sh: R0, r1: T1.r1, c1: 2, r2: T1.r2, c2: 2 }, legend: 'b', lnf: '#,##0.0,,"M"', vnf: '#,##0.0,,"M"', asz: 800,
          series: [{ name: 'Sem REIDI', vals: { sh: R0, r1: T1.r1, c1: 5, r2: T1.r2, c2: 5 }, color: '9DB2CF', labels: true, lsz: 800 }, { name: 'Com REIDI', vals: { sh: R0, r1: T1.r1, c1: 6, r2: T1.r2, c2: 6 }, color: c.blue, labels: true, lsz: 800 }] });
        R0.chart({ kind: 'doughnut', title: 'Compras por categoria (valor com REIDI)', r1: gr, c1: 6, r2: gr + 15, c2: 9, cats: { sh: R0, r1: T2.r1, c1: 2, r2: T2.r2, c2: 2 }, legend: 'r', hole: 55,
          series: [{ name: 'Com REIDI', vals: { sh: R0, r1: T2.r1, c1: 5, r2: T2.r2, c2: 5 }, labels: true, pct: true, lnf: '0%', lc: 'FFFFFF', lsz: 800, colors: [c.navy, c.blue, '4A90D9', c.verde, c.yel, '8FB8E8', 'B7C9E2', '94A3B8'] }] })
      }
      await saveAs('reidi_projecao_compras.xlsx', await wb.save())
    } catch (e) { MSG = '⚠ Não consegui gerar o Excel: ' + (e.message || e); ERR = true; render() }
  }

  /* ---------- Termo para assinatura (PDF) — aqui, e só aqui, aparecem os responsáveis ---------- */
  function termo() {
    if (ROLE != 'admin' || !B) return; const R = B.resp || RESP0, d = R.d || RESP0.d, I = (id, l, v, t) => `<label class="block text-sm mb-1">${l}</label><input id="${id}" type="${t || 'text'}" class="inp w-full mb-3" value="${esc(v)}">`;
    mo(`<h2 class="text-lg font-bold mb-1">Termo para assinatura · REIDI</h2><p class="text-sm text-slate-500 mb-4">Resumo Executivo + Projeção de Compras</p>${I('rt-n', 'Documento nº', B.doc || '')}
    <p class="text-xs font-semibold uppercase text-slate-500 mb-2">Responsáveis (aparecem só no PDF)</p>${I('rt-e', 'Elaboração', R.el || RESP0.el)}${I('rt-c', 'Conferência', R.cf || RESP0.cf)}${I('rt-1', 'Atesto da Diretoria (1)', d[0] || '')}${I('rt-2', 'Atesto da Diretoria (2)', d[1] || '')}${I('rt-3', 'Atesto da Diretoria (3)', d[2] || '')}
    <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="reidi.termoOk()">Gerar PDF</button></div>`)
  }
  /* grava os parâmetros compartilhados (só admin); mantém o que já estava publicado e troca só o que veio em 'o' */
  async function cfgSalva(o) {
    if (!adm() || !B) return false; const x = { doc: B.doc, ref: B.ref, hor: B.hor, saldo: B.saldo, resp: B.resp, ...o };
    try { await RDB.gravarConfig(x); montar(); return true } catch (e) { MSG = '⚠ Não salvei os parâmetros: ' + (e.message || e); ERR = true; tela(); return false }
  }
  function termoOk() {
    const g = id => document.getElementById(id).value.trim(), o = { doc: g('rt-n'), resp: { el: g('rt-e'), cf: g('rt-c'), d: [g('rt-1'), g('rt-2'), g('rt-3')].filter(Boolean) } };
    closeMd(); pdf(o); cfgSalva({ doc: o.doc, resp: o.resp })
  }
  function pdf(o) {
    const C = calc(), { q, tot, G, T } = C, d = new jspdf.jsPDF('l', 'pt', 'a4'), X = 40, asc = s => String(s).replace(/[–—]/g, '-'), m0 = n => 'R$ ' + Math.round(+n || 0).toLocaleString('pt-BR'), pt = v => ((Math.round((+v || 0) * 10000 + 1e-6)) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
      NV = [31, 78, 121], CL = [221, 235, 247], AM = [255, 255, 153], VM = [192, 0, 0], PAL = [[79, 129, 189], [192, 80, 77], [155, 187, 89], [128, 100, 162], [75, 172, 198], [247, 150, 70]];
    const TT = (t, x, y, sz, b, al, cor) => d.setFont('helvetica', b ? 'bold' : 'normal').setFontSize(sz).setTextColor(...(cor || [0, 0, 0])).text(asc(t), x, y, { align: al || 'left' }),
      logo = (w) => d.addImage(LOGO, 'PNG', X, 26, w, w / LR),
      caixa = (x, y, w, t, cor) => { d.setFillColor(...CL).rect(x, y - 10, w, 14, 'F'); TT(t, x + w - 4, y, 9.5, 1, 'right', cor) };
    /* ===== página 1: Resumo Executivo ===== */
    logo(110); const WL = 450;
    d.setFillColor(...NV).rect(X, 82, WL, 20, 'F'); TT('PROJEÇÃO MENSAL DE COMPRAS COM IMPACTO REIDI', X + WL / 2, 96, 11.5, 1, 'center', [255, 255, 255]);
    TT('Documento nº: ', X + WL / 2 - 4, 117, 9, 1, 'right'); TT(o.doc || '', X + WL / 2 - 2, 117, 9, 0);
    TT('Data de referência:', X + 150, 146, 9, 1, 'right'); TT(br(q.ref), X + 160, 146, 9, 0, 'left', VM); TT('Horizonte:', X + 300, 146, 9, 1, 'right'); TT(q.hor + ' dias', X + 306, 146, 9, 0, 'left', VM);
    TT('Saldo em C/C Belov Obras (Santander)', X, 174, 9, 1); caixa(X + 230, 174, 80, m0(q.saldo));
    TT('Valor total das compras – próximos ' + q.hor + ' dias', X, 200, 9, 1); caixa(X + 230, 200, 80, m0(tot.vn));
    TT('Economia tributária estimada (REIDI) – real', X, 214, 9, 1); caixa(X + 230, 214, 80, m0(tot.ec));
    TT('Economia tributária teórica (alíq. ref. × 90%)', X, 228, 9, 1); caixa(X + 230, 228, 80, m0(tot.et));
    TT('Nº de processos/compras', X, 242, 9, 1); caixa(X + 230, 242, 80, String(tot.n));
    TT('RESUMO POR QUINZENA', X, 272, 9.5, 1);
    d.autoTable({ theme: 'plain', startY: 278, tableWidth: 450, margin: { left: X }, styles: { fontSize: 8.5, cellPadding: 2.2, textColor: 0, halign: 'center' }, headStyles: { fillColor: NV, textColor: 255, fontStyle: 'bold', cellPadding: 4 }, footStyles: { fontStyle: 'bold', lineColor: 0, lineWidth: { top: .8 } },
      head: [['PERÍODO', 'Nº COMPRAS', 'VALOR DAS COMPRAS', 'ECONOMIA REIDI REAL', 'ECONOMIA REIDI TEÓRICA']], body: G.map(g => [asc(g.per), String(g.n), m0(g.vn), m0(g.ec), m0(g.et)]), foot: [['TOTAL', String(tot.n), m0(tot.vn), m0(tot.ec), m0(tot.et)]] });
    let y = d.lastAutoTable.finalY + 16;
    const g1 = G.find(g => g.tf > 0) || G[0], dtr = g1 ? g1.tr : '', ate = dtr ? br(dtr) : '';
    TT('Saldo em C/C Belov Obras (Santander)', X + 225, y, 8.5, 1, 'right'); caixa(X + 230, y, 115, m0(q.saldo)); y += 8;
    d.setFillColor(255, 255, 0).setDrawColor(0).setLineWidth(1.4).rect(X, y, 345, 17, 'FD'); TT('VALOR A TRANSFERIR PARA A BELOV OBRAS ATÉ ' + ate.slice(0, 5) + ' ==>', X + 3, y + 12, 8.5, 1); TT(m0(T), X + 342, y + 12, 9, 1, 'right', VM); y += 17;
    /* responsáveis */
    const R = o.resp || RESP0, D = (R.d && R.d.length ? R.d : RESP0.d).slice(0, 3), yb = Math.max(y + 24, 350);
    d.setFillColor(...NV).rect(X, yb, WL, 13, 'F'); TT('RESPONSÁVEIS', X + 3, yb + 10, 9, 1, 'left', [255, 255, 255]);
    const ass = (x, y0, w) => { TT('Assinatura:', x, y0, 8.5, 0); d.setFillColor(...AM).setDrawColor(170).setLineWidth(.5).rect(x + 72, y0 - 9, w, 12, 'FD') };
    TT('ELABORAÇÃO', X, yb + 27, 8.5, 1); TT(R.el || '', X, yb + 39, 8.5, 0); ass(X, yb + 51, 110);
    TT('CONFERÊNCIA', X + 235, yb + 27, 8.5, 1); TT(R.cf || '', X + 235, yb + 39, 8.5, 0); ass(X + 235, yb + 51, 110);
    TT('ATESTO DA DIRETORIA', X, yb + 70, 8.5, 1); D.forEach((n, i) => { const y0 = yb + 83 + i * 30; TT(n, X, y0, 8.5, 0); ass(X, y0 + 12, 110) });
    /* gráfico (desenhado direto no PDF) */
    const cx = 520, cy = 82, cw = 282, ch = 225, px = cx + 38, pw = cw - 52, py = cy + 30, ph = ch - 74, mx = Math.max(1, ...G.map(g => g.vn)) * 1.2;
    d.setDrawColor(150).setLineWidth(.6).roundedRect(cx, cy, cw, ch, 8, 8, 'S'); TT('COMPRAS PREVISTAS POR PERÍODO', cx + cw / 2, cy + 16, 7.5, 1, 'center');
    d.setDrawColor(200, 215, 235).setLineWidth(.5); for (let i = 0; i <= 4; i++) d.line(px, py + ph - ph * i / 4, px + pw, py + ph - ph * i / 4);
    d.setFont('helvetica', 'bold').setFontSize(7).setTextColor(0, 0, 0).text('VALOR (R$)', cx + 14, py + ph / 2 + 18, { angle: 90 });
    G.forEach((g, i) => { const sl = pw / G.length, bw = Math.min(70, sl * .55), bx = px + sl * i + (sl - bw) / 2, bh = g.vn / mx * ph, c = PAL[i % PAL.length]; d.setFillColor(...c).rect(bx, py + ph - bh, bw, bh, 'F'); TT(m0(g.vn), bx + bw / 2, py + ph - bh - 5, 10, 1, 'center') });
    let lx = 0; const lw = G.map(g => 12 + d.getTextWidth(asc(g.per)) + 12); const tl = lw.reduce((a, b) => a + b, 0); lx = cx + (cw - tl) / 2;
    G.forEach((g, i) => { d.setFillColor(...PAL[i % PAL.length]).rect(lx, cy + ch - 24, 6, 6, 'F'); TT(g.per, lx + 9, cy + ch - 18, 7.5, 0); lx += lw[i] });
    /* ===== página 2: Base detalhada ===== */
    d.addPage('a4', 'l'); logo(70); TT('BASE DETALHADA – PROJEÇÃO DE COMPRAS REIDI', 421, 52, 10, 1, 'center');
    const r = C.I.slice().sort((a, b) => a.k - b.k), VD = [226, 239, 218], LI = [228, 223, 236], bd = { lineColor: 0, lineWidth: .5 };
    d.autoTable({ theme: 'plain', startY: 70, margin: { left: X, right: X, bottom: 36 }, tableWidth: 762, styles: { fontSize: 6.8, cellPadding: 2.4, textColor: 0, halign: 'center', valign: 'middle', overflow: 'linebreak' }, headStyles: { fillColor: NV, textColor: 255, fontStyle: 'bold', fontSize: 6.3 },
      head: [[{ content: '', colSpan: 10, styles: { fillColor: false } }, { content: 'ECONOMIA REIDI REAL', colSpan: 2, styles: { fillColor: [255, 255, 255], textColor: 0, ...bd } }, { content: 'ECONOMIA REIDI TEÓRICA', colSpan: 2, styles: { fillColor: [255, 255, 255], textColor: 0, ...bd } }],
        ['Nº', 'FORNECEDOR', 'ITEM/DESCRIÇÃO', 'CATEGORIA', 'Nº PEDIDO / PROCESSO / NF', 'DATA PAGAMENTO PREVISTA', '% APLICADO\n(ALÍQ. REF.)', 'RESPONSÁVEL', 'VALOR ORIGINAL (R$)', 'VALOR APÓS NEGOCIAÇÃO REIDI (R$)', { content: 'R$\n(I-J)', styles: { fillColor: VD, textColor: 0 } }, { content: '%\n(K/I)', styles: { fillColor: VD, textColor: 0 } }, { content: 'R$\n(I*ref*0,9)', styles: { fillColor: LI, textColor: 0 } }, { content: '%\n(M/I)', styles: { fillColor: LI, textColor: 0 } }]],
      body: r.map(x => [String(x.k + 1), x.f, x.i, x.cat, x.ped || '-', br(x.dt), (x.vo ? pt(x.pa) : '-') + '\n(' + pt(x.pc) + ')', x.rp, m0(x.vo), m0(x.vn), { content: m0(x.ec), styles: { fillColor: VD } }, { content: pt(x.ecp), styles: { fillColor: VD } }, { content: m0(x.et), styles: { fillColor: LI } }, { content: pt(x.etp), styles: { fillColor: LI } }]),
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 78 }, 3: { cellWidth: 52 }, 4: { cellWidth: 48 }, 5: { cellWidth: 48 }, 6: { cellWidth: 46 }, 7: { cellWidth: 58 }, 8: { cellWidth: 50 }, 9: { cellWidth: 56 }, 10: { cellWidth: 42 }, 11: { cellWidth: 32 }, 12: { cellWidth: 42 }, 13: { cellWidth: 32 } } });
    saveAs('reidi_termo_' + String(o.doc || 'documento').replace(/[^\w-]+/g, '-') + '.pdf', d.output('arraybuffer'))
  }

  /* ---------- ações da tela ---------- */
  const tela = () => render();
  window.reidi = {
    show() { try { VIEW.dataset.ok = 1 } catch (e) { } render(); nuvem() }, t(k) { tab = k; tela() }, rf(k, v) { if (k == 'm') { RM = v; tela() } else { RQ = v; rtbl() } }, fq(v) { FQF = v; ftbl() }, e(v) { ESC = v == 'all' ? 'all' : 'hor'; tela() }, ba(v) { P.ba = v; salva(); tela() },
    p(k, v) { if (!adm()) return; if (v === '' || (k == 'hor' && isNaN(parseInt(v, 10)))) { delete P[k] } else P[k] = k == 'ref' ? v : k == 'hor' ? Math.max(1, Math.min(365, Math.round(+v))) : +v; salva(); tela() }, saldo(v) { if (!adm()) return; const n = num(v); P.saldo = isNaN(n) ? 0 : Math.max(0, n); salva(); tela() },
    per(k, v) {
      MSG = ''; ERR = false; const q = par(), de0 = q.ref, ate0 = addD(q.ref, q.hor), span = Math.max(1, q.hor);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) { tela(); return }
      let de = k == 'de' ? v : de0, ate = k == 'ate' ? v : ate0;
      if (ate <= de) { if (k == 'de') ate = addD(de, span); else { ate = addD(de, 1); MSG = 'A data final precisa ser posterior à data inicial: ajustei para ' + br(ate) + '.'; ERR = true } }
      P.de = de; P.ate = ate; salva(); tela()
    },
    pre(t) {
      MSG = ''; ERR = false; const h = RDB.hoje(), m1 = h.slice(0, 8) + '01';
      if (t == 'pub') { delete P.de; delete P.ate }
      else if (t == 'mes') { P.de = m1; P.ate = addD(m1, eom(m1) - 1) }
      else if (t == 'prox') { const n = addD(m1, eom(m1)); P.de = n; P.ate = addD(n, eom(n) - 1) }
      else { P.de = h; P.ate = addD(h, 30) }
      salva(); tela()
    },
    rs() { limpa(); salva(); tela() }, desc() { delete P.saldo; salva(); MSG = ''; tela() },
    async pub() {
      if (!adm() || !B || !sujo()) return; const q = par(); MSG = 'Publicando o saldo para todos…'; ERR = false; tela();
      if (await cfgSalva({ saldo: q.saldo })) { delete P.saldo; P.bst = RDB.Ct || 'sem-config'; salva(); MSG = '✔ Saldo (' + f(q.saldo) + ') publicado: todos os usuários passam a ver este valor.'; ERR = false; tela() }
    },
    exp() { if (!adm() || !B) return; const q = par(); RDB.exportar(null, { ref: q.ref, hor: q.hor }).catch(e => { MSG = '⚠ Não consegui gerar a planilha: ' + (e.message || e); ERR = true; tela() }) },
    parm() {
      if (!adm() || !B) return; const I = (id, l, v, t, ex) => `<label class="block text-sm mb-1">${l}</label><input id="${id}" type="${t || 'text'}" class="inp w-full mb-3" value="${esc(v)}" ${ex || ''}>`;
      mo(`<h2 class="text-lg font-bold mb-1">Parâmetros do REIDI</h2><p class="text-sm text-slate-500 mb-4">Valem para todos os usuários assim que você salvar.</p>${I('rp-n', 'Documento nº', B.doc)}${I('rp-r', 'Data de referência (início do horizonte)', B.ref, 'date')}${I('rp-h', 'Horizonte (dias)', B.hor, 'number', 'min="1" max="365"')}${I('rp-s', 'Saldo em C/C Belov Obras (Santander)', (+B.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
      <p id="rp-e" class="hidden text-sm text-rose-500 mb-3"></p><div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="reidi.parmOk()">Salvar para todos</button></div>`)
    },
    async parmOk() {
      const g = id => document.getElementById(id).value.trim(), ref = g('rp-r'), hor = parseInt(g('rp-h'), 10), sd = num(g('rp-s')), e = m => { const x = document.getElementById('rp-e'); x.textContent = m; x.classList.remove('hidden') };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ref)) return e('Informe a data de referência.'); if (!(hor >= 1 && hor <= 365)) return e('Horizonte: de 1 a 365 dias.'); if (isNaN(sd) || sd < 0) return e('Saldo inválido.');
      closeMd(); delete P.de; delete P.ate; delete P.saldo; if (await cfgSalva({ doc: g('rp-n'), ref, hor, saldo: sd })) { MSG = '✔ Parâmetros salvos para todos os usuários.'; ERR = false; tela() }
    },
    fl(k, v) { if (k == 'cat') FCt = v; else if (k == 'rp') FRp = v; else if (k == 'pg') FP = v; else if (k == 'q') FQ = v; else if (k == 'hz') HZ = !!v; if (k == 'q') tbl(); else tela() },
    s(k) { if (SK == k) SD = -SD; else { SK = k; SD = 1 } tbl() }, xl, termo, termoOk,
    calc: () => B ? calc() : null, montar, alertas: () => B ? alertas(calc()) : [], _set: b => { B = b }
  };
  render();
  /* abre sozinho quando a tela do REIDI fica visível (mesmo que o menu do site seja uma versão antiga e não chame reidi.show) */
  try { new MutationObserver(() => { if (VIEW.classList.contains('hidden')) { delete VIEW.dataset.ok } else if (!VIEW.dataset.ok) { window.reidi.show() } }).observe(VIEW, { attributes: true, attributeFilter: ['class'] }) } catch (e) { }
})();
