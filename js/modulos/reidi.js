/* Módulo REIDI · Projeção Mensal de Compras com impacto REIDI.
   Fonte: as compras LANÇADAS no módulo "Projeção REIDI" (tabela public.reidi_compras) + os parâmetros do relatório (bases · reidi_config),
   lidos por js/core/reidi_dados.js (RDB). Não há mais upload de planilha: quem lança, vale para todos, e a tela se atualiza sozinha.
   Telas: Resumo Executivo (indicadores, gráfico por quinzena, transferência, alertas), Análise Financeira (ganho com o REIDI), Projeção de Compras (tabela filtrável).
   Resumo Executivo = SÓ O QUE FALTA PAGAR: o valor negociado de cada compra MENOS os pagamentos lançados em "Projeção REIDI" (os mesmos que aparecem em "REIDI Realizado"). Cartões, gráfico por quinzena, quadro por fornecedor
   e valor a transferir usam esse saldo (calc().R e calc().G[].r, em centavos); o valor sem REIDI e as economias ficam proporcionais à parte ainda não paga (RDB.restante) e, somados ao que o REIDI Realizado
   mostra como pago, fecham a compra inteira ao centavo. Sem nenhum pagamento a tela é a mesma de antes. Termo para assinatura, Excel, alertas e "Publicar período" seguem a projeção COMPLETA
   (calc().tot, .T, .liq, .G[].tf — valor negociado inteiro, sem descontar pagamentos); a janela do Termo avisa essa diferença quando já há pagamento lançado.
   Gráficos interativos: clicar numa coluna de "A pagar por quinzena" (Resumo Executivo) ou de "Sem REIDI × Com REIDI" (Análise Financeira) abre a janela "A pagar aos fornecedores" daquela quinzena
   (por fornecedor: valor negociado, já pago e saldo = negociado − pagamentos registrados em Projeção REIDI, com as compras de cada um). Botões sob o gráfico fazem o mesmo (teclado e leitor de tela).
   Os responsáveis NÃO aparecem na tela: só no Termo para assinatura (PDF), gerado pelo admin.
   Regras: compras com pagamento previsto do dia 1 ao 15 são pagas no dia 15; do 16 ao fim do mês, no último dia do mês;
   a transferência para a Belov Obras é feita N dias antes (padrão 3). Valor a transferir = máx(0; arredondar p/ cima((compras − saldo) / 5.000) × 5.000) — SEMPRE múltiplo de R$ 5.000 (total e cada transferência), por isso é maior ou igual ao valor da base.
   Período (De/Até): cada usuário filtra o seu (fica só no navegador dele). Quem tem a permissão "Alterar os parâmetros" (o administrador sempre) vê, quando o filtro difere do padrão, o botão
   "Publicar período para todos": grava a data de referência (De) e o horizonte (dias entre De e Até) nos parâmetros compartilhados (bases · reidi_config) e todos passam a abrir o REIDI nesse período.
   MÓDULO ISOLADO: usa de js/core: $, f, p, br, N, ROLE, PERM, saveAs, LOGO/LR, mo/closeMd/dlg e uLog (usuarios.js), BASE (base.js). */
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
  let B = null, META = '', ARQ = '', ST = '', tab = 'res', MSG = '', ERR = false, CH = {}, P = {}, PUBP = false; /* PUBP = publicando o período agora (impede o duplo clique) */
  let RM = '', RQ = '', ESC = 'hor', FQF = '', FQ = '', FCt = '', FRp = '', FP = '', HZ = true, SK = 'dt', SD = 1, AP = null; /* AP = janela "A pagar aos fornecedores" aberta: { src: 'res'|'fin', key: data de pagamento AAAA-MM-DD, ex: fornecedores expandidos, volta: elemento que tinha o foco } */
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
    par = (ba = baSel()) => ({ ref: (ba == baSel() && perOn() && P.de) || baRef(ba), hor: perOn() ? dias(P.de, P.ate) : (+B.hor || 30), ant: P.ant == null ? 3 : +P.ant, d1: P.d1 == null ? 15 : +P.d1, saldo: PERM.tem('reidi.parametros') && P.saldo != null ? +P.saldo : (baRef(ba) == B.ref ? (+B.saldo || 0) : 0) }),
    payDate = (dt, d1) => dt.slice(8) * 1 <= d1 ? dt.slice(0, 8) + pad(d1) : dt.slice(0, 8) + pad(eom(dt)),
    teto = v => Math.max(0, Math.ceil(v / PASSO - 1e-9) * PASSO);
  function calc(ba) {
    const BA = ba == null ? baSel() : ba, q = par(BA), fim = addD(q.ref, q.hor);
    const L = B.c.map((x, k) => ({ x, k })).filter(({ x }) => BA == 'all' || x.ba == BA).map(({ x, k }) => { const pg = payDate(x.dt, q.d1), ec = x.vo - x.vn, I = RDB.ident(x.vo, x.vn), et = RDB.teor(x.vo, I.al); return { ...x, pc: I.al, pa: I.pa, k, pg, tr: addD(pg, -q.ant), ec, ecp: x.vo ? ec / x.vo : 0, et, etp: x.vo ? et / x.vo : 0, in: x.dt >= q.ref && x.dt <= fim, rs: RDB.restante({ ...x, pc: I.al }) } }),
      I = L.filter(x => x.in), tot = { n: I.length, vo: sum(I, 'vo'), vn: sum(I, 'vn'), ec: sum(I, 'ec'), et: sum(I, 'et') }, M = {}, Z = () => ({ n: 0, nq: 0, tt: 0, vo: 0, vn: 0, ec: 0, et: 0 }), RC = Z(); /* RC = visão "A PAGAR" em centavos (o que ainda falta pagar) */
    const soma = (o, x) => { o.n++; if (x.rs.vn > 0) o.nq++; o.tt += RDB.c(x.vn); o.vo += x.rs.vo; o.vn += x.rs.vn; o.ec += x.rs.ec; o.et += x.rs.et };
    I.forEach(x => { (M[x.pg] = M[x.pg] || { pg: x.pg, tr: x.tr, n: 0, vo: 0, vn: 0, ec: 0, et: 0, it: [], rc: Z() }); const g = M[x.pg]; g.n++; g.vo += x.vo; g.vn += x.vn; g.ec += x.ec; g.et += x.et; g.it.push(x); soma(g.rc, x); soma(RC, x) });
    const G = Object.values(M).sort((a, b) => a.pg < b.pg ? -1 : 1), T = teto(tot.vn - q.saldo), rep = (vals, T0) => { let sr = q.saldo, rem = T0; return vals.map((v, i) => { const nd = Math.max(0, v - sr), sc = Math.min(v, sr); sr = Math.max(0, sr - v); const tf = i == vals.length - 1 ? rem : Math.min(rem, teto(nd)); rem -= tf; return { sc, tf } }) }; /* o saldo em C/C cobre primeiro a 1ª quinzena; cada transferência é múltiplo de PASSO e a última leva o que sobrar */
    const rp = rep(G.map(g => g.vn), T), fr = o => ({ n: o.n, nq: o.nq, tt: RDB.r2(o.tt), vo: RDB.r2(o.vo), vn: RDB.r2(o.vn), ec: RDB.r2(o.ec), et: RDB.r2(o.et), pago: RDB.r2(o.tt - o.vn), qt: o.n - o.nq });
    const R = fr(RC); R.T = teto(R.vn - q.saldo); R.liq = Math.max(0, R.vn - q.saldo); R.folga = Math.max(0, R.T - R.liq); G.forEach(g => { g.r = fr(g.rc) }); const rr = rep(G.map(g => g.r.vn), R.T); /* R = o que AINDA FALTA PAGAR das compras do período (Resumo Executivo); T/liq/folga/tf acima seguem a projeção completa (Termo e Excel) */
    G.forEach((g, i) => {
      g.sc = rp[i].sc; g.tf = rp[i].tf; g.r.sc = rr[i].sc; g.r.tf = rr[i].tf;
      const d = +g.pg.slice(8); g.per = d <= q.d1 ? `01/${g.pg.slice(5, 7)} – ${pad(q.d1)}/${g.pg.slice(5, 7)}` : `${pad(q.d1 + 1)}/${g.pg.slice(5, 7)} – ${pad(eom(g.pg))}/${g.pg.slice(5, 7)}`;
      g.q = (d <= q.d1 ? '1ª' : '2ª') + ' quinzena'; g.mp = motivo(g.pg); g.mt = motivo(g.tr); g.sp = g.mp ? antDU(g.pg) : ''; g.st = g.mp || g.mt ? antDU(addD(g.sp || g.pg, -q.ant)) : ''
    });
    const liq = Math.max(0, tot.vn - q.saldo);
    return { q, fim, L, I, tot, R, G, T, liq, folga: Math.max(0, T - liq), out: L.length - I.length, outV: sum(L.filter(x => !x.in), 'vn') }
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
  <button class="btn2" data-perm="reidi.parametros" title="Documento nº, data de referência, horizonte e saldo (valem para todos)" onclick="reidi.parm()">⚙ Parâmetros</button>
  <button class="btn2" data-perm="lanc.lancar" title="Incluir, editar ou excluir as compras do REIDI" onclick="go('lanc')">📝 Lançar compras</button>
  <button class="btn2 adm" title="Baixa a planilha no modelo Projeção Mensal de Compras REIDI" onclick="reidi.exp()">⬇ Planilha (modelo)</button>
  ${B ? '<button class="btn2" onclick="reidi.xl()">Excel</button>' : ''}</div>
  ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  const adm = () => PERM.tem('reidi.parametros'), /* altera/publica os parâmetros e o saldo (permissão "Alterar os parâmetros") */
    soAdm = () => ROLE == 'admin', /* exclusivos do administrador: Termo para assinatura e Planilha (modelo) */
    sujo = () => adm() && B && P.saldo != null && +P.saldo != (+B.saldo || 0),
    pubBar = () => { if (!sujo()) return ''; const q = par(); return `<div class="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm"><span class="mr-auto">⚠ Alterações <b>ainda não publicadas</b>: saldo ${f(q.saldo)}. Só você vê este valor até publicar.</span><button class="btn" onclick="reidi.pub()">📤 Publicar saldo para todos</button><button class="btn2" onclick="reidi.desc()">Descartar</button></div>` };
  /* filtro de período (De/Até): visível para todos; o horizonte é a contagem de dias entre as duas datas (Até − De).
     Quem pode alterar os parâmetros (pode) vê, quando o filtro difere do período publicado, o botão que PUBLICA o período para todos. */
  const dd = n => n + (n == 1 ? ' dia' : ' dias'), /* "1 dia" · "29 dias" */
    perBar = () => {
    const q = par(), de = q.ref, ate = addD(q.ref, q.hor), pub = B.ref, pubA = addD(B.ref, +B.hor || 30), difere = de != pub || ate != pubA, pode = adm(), /* o botão e o aviso "só você vê" só existem dentro do bloco "difere" mais abaixo */
      btn = (l, t, a) => `<button type="button" class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 hover:bg-indigo-500/20" title="${t}" onclick="${a}">${l}</button>`;
    return `<div id="reidi-per" class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 px-4 py-2.5">
      <div class="text-xs font-bold uppercase tracking-wide self-center">📅 Período</div>
      <label class="text-xs font-semibold uppercase tracking-wide">De<input id="reidi-de" type="date" value="${de}" class="block mt-0.5 rounded-md border border-indigo-500/40 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500" onchange="reidi.per('de',this.value)"></label>
      <label class="text-xs font-semibold uppercase tracking-wide">Até<input id="reidi-ate" type="date" value="${ate}" class="block mt-0.5 rounded-md border border-indigo-500/40 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500" onchange="reidi.per('ate',this.value)"></label>
      <div class="rounded-lg bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-center" title="Contagem de dias entre as duas datas (Até − De)"><div class="text-[10px] font-semibold uppercase tracking-wide">Horizonte</div><div id="reidi-hz" class="text-2xl font-bold leading-tight">${q.hor} <span class="text-sm font-semibold">dias</span></div></div>
      <div class="flex flex-wrap items-center gap-1.5 self-center">${btn('Mês atual', 'Do dia 1 ao último dia do mês atual', "reidi.pre('mes')")}${btn('Próximo mês', 'Do dia 1 ao último dia do próximo mês', "reidi.pre('prox')")}${btn('Próx. 30 dias', 'De hoje até 30 dias à frente', "reidi.pre('30')")}${difere ? btn('↺ Padrão', 'Voltar ao período publicado (' + br(pub) + ' a ' + br(pubA) + ')', "reidi.pre('pub')") : ''}</div>
      ${difere ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 self-center${pode ? ' ml-auto' : ''}"><div class="text-xs">Filtro ativo · padrão publicado: ${br(pub)} a ${br(pubA)}${pode ? ' · <b>só você vê</b> este período até publicar' : ''}</div>${pode ? `<button type="button" id="reidi-pubper" data-perm="reidi.parametros" class="btn disabled:opacity-50 disabled:cursor-wait" ${PUBP ? 'disabled' : ''} title="Todos os usuários passam a abrir o REIDI neste período: ${br(de)} a ${br(ate)} (${dd(q.hor)})" onclick="reidi.pubPer()">📤 Publicar período para todos</button>` : ''}</div>` : ''}
    </div>`
  };
  const tabs = () =>
    `<div class="flex flex-wrap items-center gap-2"><div class="flex flex-wrap gap-1 mr-auto">${[['res', 'Resumo Executivo'], ['fin', 'Análise Financeira'], ['proj', 'Projeção de Compras'], ['real', 'REIDI Realizado']].map(([k, n]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium ${tab == k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="reidi.t('${k}')">${n}</button>`).join('')}</div></div>${tab == 'real' ? '' : perBar()}${pubBar()}`;
  const vazio = () => `<div class="card py-12 text-center"><div class="text-4xl mb-2">🏗️</div><p class="font-semibold">${ERR ? 'Não foi possível carregar o REIDI' : !RDB.ok ? 'Carregando…' : 'Nenhuma compra lançada ainda'}</p><p class="text-sm text-slate-500 mt-1">${!RDB.ok ? '' : ROLE == 'admin' ? 'Use “Projeção REIDI” (menu) para incluir as compras; o relatório se monta sozinho.' : 'Peça às áreas responsáveis para lançar as compras em “Projeção REIDI”.'}</p>${RDB.ok && ROLE == 'admin' ? '<button class="btn mt-4" onclick="go(\'lanc\')">📝 Ir para Projeção REIDI</button>' : ''}</div>`;
  /* cores da economia real frente à teórica (RDB.cor): verde = igual ou maior · vermelho = menor — vale para colunas e totais das tabelas */
  const LEG = '<p class="text-xs text-slate-500 mt-2">Economia real: <b class="text-emerald-600 dark:text-emerald-400">verde</b> = igual ou maior que a teórica · <b class="text-rose-600 dark:text-rose-400">vermelho</b> = menor que a teórica.</p>';
  /* ícone e cor do selo de cada cartão (visual padrão CRT, igual ao Dashboard Financeiro) */
  const ik = t => /econom|ganho/i.test(t) ? ['sobe', 'ver'] : /sem reidi|original/i.test(t) ? ['recibo', 'azul'] : /com reidi|valor pago|valor a pagar|valor das compras|total/i.test(t) ? ['carrinho', 'ind'] : ['lista', 'amb'],
    kcard = (t, v, s, c) => CRT.kpi({ t, v, s, c, ic: ik(t)[0], tom: ik(t)[1] });
  const card = (t, v, s, c) => `<div class="card text-center"><div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-2xl font-bold mt-1 ${c || ''}">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div>`;

  function resumo() {
    const C = calc(), { q, G } = C, R = C.R, T = R.T, pr = R.pago > 0, /* pr = há pagamento lançado nas compras do período: o Resumo mostra SÓ O QUE FALTA PAGAR (negociado − já pago) */
      kp = (t, v, c, s) => CRT.kpi({ t, v, s, c, ic: ik(t)[0], tom: ik(t)[1], mx: 1.3, tmx: '.92' }),
      lin = G.map(g => `<div class="flex items-baseline justify-between gap-3 py-2 border-t border-slate-200 dark:border-slate-800 first:border-0"><div class="text-sm font-medium">${g.q}</div><div class="text-base font-semibold whitespace-nowrap">${f(g.r.tf)}</div></div>`).join(''),
      fm = {}; C.I.forEach(x => { const o = fm[x.f] = fm[x.f] || { f: x.f, ec: 0, et: 0, t: 0, g: {} }; o.t += x.rs.vn; o.ec += x.rs.ec; o.et += x.rs.et; o.g[x.pg] = (o.g[x.pg] || 0) + x.rs.vn }); /* quadro por fornecedor: centavos do que falta pagar */
    const FL = Object.values(fm).filter(o => o.t > 0).sort((a, b) => b.t - a.t || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0)), th = (l, r) => `<th class="px-2 py-1.5 ${r ? 'text-right' : 'text-left'}">${l}</th>`, v2 = n => f(RDB.r2(n)),
      nota = pr ? `<div id="reidi-liq" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 px-4 py-2.5 text-sm"><span><b>💰 Só o que falta pagar:</b> já descontados os pagamentos lançados — pago ${f(R.pago)} de ${f(R.tt)} (${p(R.tt ? R.pago / R.tt : 0)})${R.qt ? ' · ' + R.qt + ' compra' + (R.qt == 1 ? '' : 's') + ' quitada' + (R.qt == 1 ? '' : 's') : ''}.</span><button type="button" class="ml-auto px-2.5 py-1 rounded-md text-xs font-medium border border-emerald-600/30 hover:bg-emerald-500/20" onclick="reidi.t('real')">Ver REIDI Realizado</button></div>` : '',
      mini = FL.length ? `<div class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">A pagar por fornecedor</div><div class="mt-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800" style="max-height:230px"><table class="w-full text-xs whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 uppercase text-slate-500"><tr>${th('Fornecedor')}${G.map(g => th(g.q.replace(' quinzena', ' quinz.'), 1)).join('')}${th('Total', 1)}${th('Economia real', 1)}${th('Economia teórica', 1)}</tr></thead>
        <tbody>${FL.map(o => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 max-w-[220px] truncate" title="${esc(o.f)}">${esc(o.f)}</td>${G.map(g => `<td class="px-2 py-1 text-right">${o.g[g.pg] ? v2(o.g[g.pg]) : '—'}</td>`).join('')}<td class="px-2 py-1 text-right font-semibold">${v2(o.t)}</td><td class="px-2 py-1 text-right ${RDB.cor(RDB.r2(o.ec), RDB.r2(o.et))}" title="${esc(RDB.dica(RDB.r2(o.ec), RDB.r2(o.et)))}">${v2(o.ec)}</td><td class="px-2 py-1 text-right">${v2(o.et)}</td></tr>`).join('')}</tbody>
        <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-2 py-1.5">TOTAL (${FL.length})</td>${G.map(g => `<td class="px-2 py-1.5 text-right">${f(g.r.vn)}</td>`).join('')}<td class="px-2 py-1.5 text-right">${f(R.vn)}</td><td class="px-2 py-1.5 text-right ${RDB.cor(R.ec, R.et)}" title="${esc(RDB.dica(R.ec, R.et))}">${f(R.ec)}</td><td class="px-2 py-1.5 text-right">${f(R.et)}</td></tr></tfoot></table></div>${LEG}`
        : R.n && !R.nq ? '<p class="mt-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2" data-liq="quitado">✔ Tudo pago neste período: não há nada a pagar nem a transferir.</p>' : '';
    return `${nota}<div id="reidi-kpis" class="grid grid-cols-2 lg:grid-cols-5 gap-3">${kp('Sem REIDI', f(R.vo), '', 'valor original' + (pr ? ' da parte a pagar' : '') + ' · ' + R.nq + ' compra(s)')}${kp('Valor a pagar · ' + q.hor + ' dias', f(R.vn), '', 'com REIDI' + (pr ? ' · já pago ' + f(R.pago) : ''))}${kp('Economia REIDI real', f(R.ec), RDB.cor(R.ec, R.et), pr ? 'da parte a pagar' : '')}${kp('Economia REIDI teórica', f(R.et), '', pr ? 'da parte a pagar' : '')}${kp('Compras a pagar', R.nq, '', pr ? 'de ' + R.n + ' no período' + (R.qt ? ' · ' + R.qt + ' quitada' + (R.qt == 1 ? '' : 's') : '') : '')}</div>
  <div class="grid lg:grid-cols-5 gap-4">
    <div class="card lg:col-span-3 min-w-0"><h2 class="font-semibold mb-2">A pagar por quinzena</h2><div style="height:300px"><canvas id="rc1" role="img" aria-label="${esc(ALT('res'))}"></canvas></div>${apChips('res', G.map(g => ({ pg: g.pg, t: g.q + ' · ' + g.per })))}${mini}</div>
    <div class="card lg:col-span-2 flex flex-col min-w-0"><div id="reidi-tr" class="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4" style="container-type:inline-size">${CRT.titulo('Valor a transferir para a Belov Obras', 'envia', 'ind', true)}<div class="text-4xl font-extrabold text-indigo-600 dark:text-indigo-300 mt-3 tabular-nums">${f(T)}</div>
      <div class="text-xs text-slate-600 dark:text-slate-300 mt-1">${pr ? 'Compras ' + f(R.tt) + ' − já pago ' + f(R.pago) + ' = a pagar ' + f(R.vn) : 'Compras ' + f(R.vn)}${q.saldo ? ' − saldo ' + f(q.saldo) : ''} = ${f(R.liq)} → arredondado para cima em múltiplos de ${f(PASSO)}${R.folga > .005 ? ' (<b>+' + f(R.folga) + '</b>)' : ''}</div></div>
      <div class="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 mt-3" style="container-type:inline-size">${CRT.titulo('Saldo em C/C Belov Obras (Santander)', 'banco', 'azul', true)}<input id="reidi-sd" aria-label="Saldo em C/C Belov Obras (Santander)" class="inp w-full text-xl font-bold mt-3" inputmode="decimal" value="${esc(q.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" onchange="reidi.saldo(this.value)" onfocus="this.select()" ${adm() ? '' : 'readonly title="Só quem tem a permissão “Alterar os parâmetros” altera o saldo"'}></div>
      <div id="reidi-trl" class="mt-4">${lin || '<p class="text-sm text-slate-500">Nenhuma compra no horizonte.</p>'}</div></div></div>`
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
    /* gráfico principal: o que FALTA PAGAR (valor das compras − já pago) × economia REIDI dessa parte, por quinzena (o múltiplo de 5.000 fica só no cartão de transferência). Quinzena toda paga: coluna zerada e "✔ quitada" no rótulo */
    mk('rc1', { type: 'bar', data: { labels: C.G.map(g => g.r.nq ? [g.q, g.per] : [g.q, g.per, '✔ quitada']), datasets: [{ label: 'Valor a pagar', data: C.G.map(g => g.r.vn), backgroundColor: BL, maxBarThickness: 64, borderRadius: 5 }, { label: 'Economia REIDI', data: C.G.map(g => g.r.ec), backgroundColor: AQ, maxBarThickness: 64, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 13, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = C.G[it[0].dataIndex], r = g && g.r; return g ? ['Compras a pagar: ' + r.nq + ' de ' + r.n].concat(r.pago > 0 ? ['Já pago: ' + f(r.pago) + ' de ' + f(r.tt)] : [], ['Economia real: ' + f(r.ec) + (r.vo ? ' (' + p(r.ec / r.vo) + ')' : ''), 'Economia teórica: ' + f(r.et), 'Pagamento: ' + dmw(g.pg)]) : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } });
    clicavel('rc1', C.G.map(g => g.pg), 'res')
  }

  /* ---------- Análise Financeira: quanto ganhamos aplicando o REIDI ---------- */
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function fdados(C) {
    const it = ESC == 'all' ? C.L : C.I, q = C.q, S = a => ({ n: a.length, vo: sum(a, 'vo'), vn: sum(a, 'vn'), ec: sum(a, 'ec') }), m = {};
    it.forEach(x => { (m[x.pg] = m[x.pg] || []).push(x) });
    const GP = Object.keys(m).sort().map(k => ({ k, lb: [(+k.slice(8) <= q.d1 ? '1ª' : '2ª') + ' quinzena', MES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4)], ...S(m[k]), it: m[k] }));
    return { it, t: S(it), GP }
  }
  function fin() {
    const C = calc(), D = fdados(C), { t } = D, q = C.q,
      seg = (k, n) => `<button class="px-3 py-1 rounded-md text-sm ${ESC == k ? 'bg-white dark:bg-slate-700 shadow font-medium' : 'text-slate-500'}" onclick="reidi.e('${k}')">${n}</button>`,
      kp = (l, v, s, c) => kcard(l, v, s, c);
    if (!D.it.length) return `<div class="card py-10 text-center text-slate-500">Nenhuma compra no período. Use “Toda a base” ou ajuste o período (De/Até).</div>`;
    return `<div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">${seg('hor', 'Período · ' + q.hor + ' dias')}${seg('all', 'Toda a base')}</div><span class="text-xs text-slate-500">${ESC == 'all' ? 'Todas as ' + t.n + ' compras da planilha' : br(q.ref) + ' a ' + br(C.fim) + ' · ' + t.n + ' compras'}</span></div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${kp('Sem REIDI', f(t.vo), 'valor original')}${kp('Com REIDI', f(t.vn), 'após negociação')}${kp('Ganho com o REIDI', f(t.ec), p(t.vo ? t.ec / t.vo : 0) + ' do valor original')}</div>
  <div class="card"><h2 class="font-semibold mb-2">Sem REIDI × Com REIDI</h2><div class="overflow-x-auto"><div style="height:320px;min-width:${D.GP.length * 150}px"><canvas id="rf1" role="img" aria-label="${esc(ALT('fin'))}"></canvas></div></div>${apChips('fin', D.GP.map(g => ({ pg: g.k, t: g.lb[0] + ' · ' + g.lb[1] })))}</div>
  <div class="card space-y-3"><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold mr-auto">Compras · economia compra a compra</h2><input id="reidi-fq" class="inp w-full sm:w-80" placeholder="Pesquisar por nome (fornecedor, item ou pedido)…" value="${esc(FQF)}" oninput="reidi.fq(this.value)"><span id="reidi-fn" class="text-xs text-slate-500"></span></div><div id="reidi-ft"></div></div>`
  }
  /* tabela compra a compra (com pesquisa); atualiza só a tabela para não perder o foco do campo */
  function ftbl() {
    const el = document.getElementById('reidi-ft'); if (!el || !B) return; const D = fdados(calc()), q = N(FQF),
      r = D.it.filter(x => !q || N(x.f + ' ' + x.i + ' ' + x.ped + ' ' + x.cat).includes(q)).sort((a, b) => a.pg < b.pg ? -1 : a.pg > b.pg ? 1 : a.k - b.k), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec'), et: sum(r, 'et') },
      th = (l, rt) => `<th class="px-3 py-2 ${rt ? 'text-right' : 'text-left'}">${l}</th>`;
    el.innerHTML = `<div class="card p-0 overflow-auto" style="padding:0;max-height:60vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Nº')}${th('Fornecedor')}${th('Item / descrição')}${th('Categoria')}${th('Pagamento')}${th('Sem REIDI', 1)}${th('Com REIDI', 1)}${th('Economia R$', 1)}${th('%', 1)}</tr></thead>
    <tbody>${r.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${x.k + 1}</td><td class="px-3 py-1.5">${esc(x.f)}</td><td class="px-3 py-1.5">${esc(x.i)}</td><td class="px-3 py-1.5">${esc(x.cat)}</td><td class="px-3 py-1.5">${dm(x.pg)}/${x.pg.slice(2, 4)}</td><td class="px-3 py-1.5 text-right">${f(x.vo)}</td><td class="px-3 py-1.5 text-right">${f(x.vn)}</td><td class="px-3 py-1.5 text-right ${RDB.cor(x.ec, x.et)}" title="${esc(RDB.dica(x.ec, x.et))}">${f(x.ec)}</td><td class="px-3 py-1.5 text-right">${x.vo ? p(x.ec / x.vo) : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="px-3 py-6 text-center text-slate-500">Nenhuma compra encontrada.</td></tr>`}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="5">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right ${RDB.cor(t.ec, t.et)}" title="${esc(RDB.dica(t.ec, t.et))}">${f(t.ec)}</td><td class="px-3 py-2 text-right">${t.vo ? p(t.ec / t.vo) : ''}</td></tr></tfoot></table></div>${LEG}`;
    const n = document.getElementById('reidi-fn'); if (n) n.textContent = r.length + ' de ' + D.it.length + ' compras'
  }
  function gfin() {
    const C = calc(), D = fdados(C), { tx, BL, GR, dl, leg, lb } = tema(); Object.values(CH).forEach(c => c.destroy()); CH = {};
    const mk = (id, cfg) => { const e = document.getElementById(id); if (e) CH[id] = new Chart(e, cfg) };
    mk('rf1', { type: 'bar', data: { labels: D.GP.map(g => [g.lb[0], g.lb[1], 'ganho ' + K(g.ec)]), datasets: [{ label: 'Sem REIDI', data: D.GP.map(g => g.vo), backgroundColor: GR, maxBarThickness: 56, borderRadius: 5 }, { label: 'Com REIDI', data: D.GP.map(g => g.vn), backgroundColor: BL, maxBarThickness: 56, borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, plugins: { legend: leg(2), datalabels: dl({ anchor: 'end', align: 'end', font: { size: 12, weight: '700' } }),
        tooltip: { callbacks: { label: lb, afterBody: it => { const g = D.GP[it[0].dataIndex]; return g ? ['Compras: ' + g.n, 'Ganho REIDI: ' + f(g.ec) + ' (' + (g.vo ? p(g.ec / g.vo) : '') + ')'] : [] } } } },
        scales: { x: { grid: { display: false }, ticks: { color: tx, font: { size: 12 } } }, y: { display: false, beginAtZero: true, grace: '18%', grid: { display: false } } } } });
    clicavel('rf1', D.GP.map(g => g.k), 'fin')
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
    <p class="text-xs text-slate-500">Pagamento e transferência seguem o calendário (dia ${C.q.d1} e último dia do mês; transferência ${C.q.ant} dia(s) antes). Economia real = valor original − valor negociado com o fornecedor. % PIS/COFINS aplicado (cálculo reverso) = (1 − valor negociado ÷ valor original) ÷ 90%. Economia teórica = valor original × alíquota de referência × 90%, sendo a alíquota de referência a mais próxima do % aplicado entre 3,65% e 9,25%. Cores da economia real: <b class="text-emerald-600 dark:text-emerald-400">verde</b> = igual ou maior que a teórica · <b class="text-rose-600 dark:text-rose-400">vermelho</b> = menor que a teórica.</p>`
  }
  function tbl() {
    const el = document.getElementById('reidi-t'); if (!el || !B) return; const C = calc(), r = linhas(C), t = { vo: sum(r, 'vo'), vn: sum(r, 'vn'), ec: sum(r, 'ec'), et: sum(r, 'et') };
    el.innerHTML = `<div class="card p-0 overflow-auto" style="padding:0;max-height:66vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${COLS.map(c => `<th class="px-3 py-2 ${c[2] == 'r' ? 'text-right' : 'text-left'} cursor-pointer select-none" onclick="reidi.s('${c[0]}')">${c[1]}${SK == c[0] ? (SD > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${r.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 ${x.in ? '' : 'opacity-50'}">${COLS.map(c => `<td class="px-3 py-1.5 ${c[2] == 'r' ? 'text-right' : ''} ${c[0] == 'ec' || c[0] == 'ecp' ? RDB.cor(x.ec, x.et) : ''}"${c[0] == 'ec' || c[0] == 'ecp' ? ` title="${esc(RDB.dica(x.ec, x.et))}"` : ''}>${cel(x, c[0])}${c[0] == 'pg' && (x.pg && motivo(x.pg)) ? ' <span class="text-amber-600" title="' + esc(motivo(x.pg)) + '">⚠</span>' : ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="px-3 py-6 text-center text-slate-500">Nenhuma compra encontrada.</td></tr>`}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="10">TOTAL (${r.length})</td><td class="px-3 py-2 text-right">${f(t.vo)}</td><td class="px-3 py-2 text-right">${f(t.vn)}</td><td class="px-3 py-2 text-right ${RDB.cor(t.ec, t.et)}">${f(t.ec)}</td><td></td><td class="px-3 py-2 text-right">${f(t.et)}</td><td></td><td></td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-n'); if (n) n.textContent = r.length + ' de ' + B.c.length + ' compras · ' + (r.length && !HZ ? 'linhas esmaecidas = fora do horizonte' : '')
  }
  /* ---------- REIDI Realizado: o que foi PAGO de verdade (pagamentos parciais ou integrais) ----------
     Mostra as compras com pelo menos um pagamento registrado em "Projeção REIDI" (janela de Status = Pago: valor pago + data do pagamento), independentemente do horizonte.
     Por compra: TOTAL (valor negociado) · VALOR PAGO · SALDO (o que falta pagar). O filtro de mês olha a DATA DO PAGAMENTO.
     Valor sem REIDI e economia são rateados pela parte paga (pago ÷ negociado); a conta fica em centavos e fecha exata quando a compra é quitada (RDB.realizados). */
  const cc = n => RDB.c(n), c2 = n => RDB.r2(n), SM = (a, g) => a.reduce((t, x) => t + g(x), 0);
  const pagos = () => RDB.realizados(B.c);
  function rfiltro() {
    const q = N(RQ); return pagos().filter(x => (!RM || x.d.slice(0, 7) == RM) && (!q || N(x.c.f + ' ' + x.c.i + ' ' + x.c.ped + ' ' + x.c.rp + ' ' + x.c.cat).includes(q)))
      .sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.c.f < b.c.f ? -1 : a.c.f > b.c.f ? 1 : a.ce < b.ce ? -1 : 1)
  }
  /* agrupa os pagamentos filtrados por compra (somas em centavos) */
  function rcompras(ps) {
    const m = new Map(); ps.forEach(x => { let o = m.get(x.c.id); if (!o) { o = { c: x.c, ps: [], v: 0, vo: 0, ec: 0, et: 0 }; m.set(x.c.id, o) } o.ps.push(x); o.v += cc(x.v); o.vo += cc(x.vo); o.ec += cc(x.ec); o.et += cc(x.et) });
    return [...m.values()].sort((a, b) => { const u = a.ps[a.ps.length - 1].d, v = b.ps[b.ps.length - 1].d; return u < v ? -1 : u > v ? 1 : a.c.f < b.c.f ? -1 : a.c.f > b.c.f ? 1 : a.c.id < b.c.id ? -1 : 1 })
  }
  const mesLb = ym => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+ym.slice(5) - 1] + '/' + ym.slice(2, 4);
  function real() {
    const todos = pagos(), meses = [...new Set(todos.map(x => x.d.slice(0, 7)))].sort();
    if (!todos.length) return `<div class="card py-12 text-center"><div class="text-4xl mb-2">✅</div><p class="font-semibold">Nenhum pagamento registrado ainda</p><p class="text-sm text-slate-500 mt-1">Em <b>Projeção REIDI</b>, mude o Status da compra para “Pago”, informe o <b>valor pago</b> e a <b>data do pagamento</b> (pode ser só uma parte da compra): ele aparece aqui para todos, com o saldo que falta pagar.${RDB.PGok ? '' : ' <br><span class="text-amber-600">Antes, o administrador precisa rodar o SQL supabase/reidi-pagamentos.sql no Supabase.</span>'}</p></div>`;
    return `<div id="reidi-rk" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"></div>
    <div class="flex flex-wrap items-center gap-2"><select class="inp ${RM ? 'ring-2 ring-amber-500' : ''}" title="Filtra pela data do pagamento" onchange="reidi.rf('m',this.value)"><option value="">Todos os meses de pagamento</option>${meses.map(m => `<option value="${m}" ${m == RM ? 'selected' : ''}>${mesLb(m)}</option>`).join('')}</select>
    <input id="reidi-rq" class="inp w-64" placeholder="Buscar fornecedor, item, pedido…" value="${esc(RQ)}" oninput="reidi.rf('q',this.value)"><span id="reidi-rn" class="text-xs text-slate-500 ml-auto"></span></div><div id="reidi-rt"></div>
    <p class="text-xs text-slate-500">Mostra as compras com pelo menos um pagamento registrado em <b>Projeção REIDI</b>, independentemente do horizonte. <b>Total</b> = valor negociado da compra · <b>Valor pago</b> = pagamentos${RM ? ' do mês filtrado (o acumulado aparece embaixo)' : ''} · <b>Saldo</b> = total − tudo o que já foi pago, inclusive em outros meses. Valor sem REIDI e economia são proporcionais à parte paga (pago ÷ total). Cores da economia real nas tabelas: <b class="text-emerald-600 dark:text-emerald-400">verde</b> = igual ou maior que a teórica · <b class="text-rose-600 dark:text-rose-400">vermelho</b> = menor que a teórica.</p>`
  }
  /* cartões do REIDI Realizado: recalculados a cada filtro (por isso ficam num bloco à parte, atualizado junto com as tabelas) */
  function rcards(ps, G) {
    const tot = SM(G, g => cc(g.c.vn)), acum = SM(G, g => cc(g.c.pago)), sdo = SM(G, g => cc(g.c.sd)), pv = SM(ps, x => cc(x.v)), vo = SM(ps, x => cc(x.vo)), ec = SM(ps, x => cc(x.ec)), et = SM(ps, x => cc(x.et)),
      quit = G.filter(g => g.c.st == 'Pago').length, parc = G.filter(g => g.c.st == 'Parcial').length, kz = (t, v, sb, ic, tom, c) => CRT.kpi({ t, v, s: sb, c, ic, tom, mx: 1.15, tmx: '.9', cls: '!justify-start' }); /* justify-start + títulos de até 2 linhas: os 6 valores ficam na mesma altura */
    return kz('Compras com pagamento', G.length, quit + ' quitada(s) · ' + parc + ' parcial(is) · de ' + B.c.length + ' lançadas', 'lista', 'amb')
      + kz('Total das compras', f(c2(tot)), 'valor negociado · com REIDI', 'carrinho', 'ind')
      + kz(RM ? 'Valor pago · ' + mesLb(RM) : 'Valor pago', f(c2(pv)), RM ? 'pagamentos do mês · acumulado nas compras ' + f(c2(acum)) : (tot ? p(acum / tot) + ' do total das compras' : ''), 'envia', 'ver')
      + kz('Saldo a pagar', f(c2(sdo)), (tot ? p(sdo / tot) + ' do total · ' : '') + 'falta pagar', 'balanca', 'amb')
      + kz('Valor sem REIDI', f(c2(vo)), 'referente ao valor pago', 'recibo', 'azul')
      + kz('Economia REIDI', f(c2(ec)), 'realizada · ' + (vo ? p(ec / vo) + ' do valor sem REIDI · ' : '') + 'teórica ' + f(c2(et)), 'sobe', 'ver')
  }
  function rtbl() {
    const el = document.getElementById('reidi-rt'); if (!el || !B) return; const ps = rfiltro(), G = rcompras(ps), D = {};
    const kk = document.getElementById('reidi-rk'); if (kk) kk.innerHTML = rcards(ps, G);
    ps.forEach(x => { const g = D[x.d] = D[x.d] || { d: x.d, n: 0, v: 0, vo: 0, ec: 0, et: 0 }; g.n++; g.v += cc(x.v); g.vo += cc(x.vo); g.ec += cc(x.ec); g.et += cc(x.et) });
    const DL = Object.values(D).sort((a, b) => a.d < b.d ? -1 : 1), T = { n: ps.length, v: SM(ps, x => cc(x.v)), vo: SM(ps, x => cc(x.vo)), ec: SM(ps, x => cc(x.ec)), et: SM(ps, x => cc(x.et)) },
      TC = { tot: SM(G, g => cc(g.c.vn)), v: T.v, sd: SM(G, g => cc(g.c.sd)) }, th = (l, rt) => `<th class="px-3 py-2 ${rt ? 'text-right' : 'text-left'}">${l}</th>`, ecol = (a, b) => RDB.cor(c2(a), c2(b)), edica = (a, b) => esc(RDB.dica(c2(a), c2(b)));
    el.innerHTML = `<div class="card p-0 overflow-auto mb-3" style="padding:0"><table class="w-full text-sm whitespace-nowrap" data-tab="rdata"><thead class="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Data do pagamento')}${th('Nº pagamentos', 1)}${th('Sem REIDI', 1)}${th('Valor pago', 1)}${th('Economia R$', 1)}${th('%', 1)}</tr></thead>
    <tbody>${DL.map(g => `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5">${dmw(g.d)}</td><td class="px-3 py-1.5 text-right">${g.n}</td><td class="px-3 py-1.5 text-right">${f(c2(g.vo))}</td><td class="px-3 py-1.5 text-right font-medium">${f(c2(g.v))}</td><td class="px-3 py-1.5 text-right ${ecol(g.ec, g.et)}" title="${edica(g.ec, g.et)}">${f(c2(g.ec))}</td><td class="px-3 py-1.5 text-right">${g.vo ? p(g.ec / g.vo) : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">Nenhum pagamento com esse filtro.</td></tr>'}</tbody>
    ${DL.length > 1 ? `<tfoot class="bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2">TOTAL</td><td class="px-3 py-2 text-right">${T.n}</td><td class="px-3 py-2 text-right">${f(c2(T.vo))}</td><td class="px-3 py-2 text-right">${f(c2(T.v))}</td><td class="px-3 py-2 text-right ${ecol(T.ec, T.et)}" title="${edica(T.ec, T.et)}">${f(c2(T.ec))}</td><td class="px-3 py-2 text-right">${T.vo ? p(T.ec / T.vo) : ''}</td></tr></tfoot>` : ''}</table></div>
    <div class="card p-0 overflow-auto" style="padding:0;max-height:60vh"><table class="w-full text-sm whitespace-nowrap" data-tab="rcompra"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Nº')}${th('Fornecedor')}${th('Item / descrição')}${th('Pagamentos')}${th('Total', 1)}${th('Valor pago', 1)}${th('Saldo', 1)}${th('Situação')}${th('Sem REIDI', 1)}${th('Economia R$', 1)}${th('%', 1)}${th('Categoria')}${th('Nº pedido / NF')}${th('Data prevista')}${th('% PIS/COFINS aplicado', 1)}${th('Responsável')}</tr></thead>
    <tbody>${G.map((g, i) => { const x = g.c, out = x.pgs.length - g.ps.length, parcial = x.st != 'Pago'; return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-id="${x.id}"><td class="px-3 py-1.5">${i + 1}</td><td class="px-3 py-1.5">${esc(x.f)}</td><td class="px-3 py-1.5">${esc(x.i)}</td>
      <td class="px-3 py-1.5" data-c="pagtos">${g.ps.map(y => `<div>${dm(y.d)}/${y.d.slice(2, 4)} · ${f(y.v)}</div>`).join('')}${out > 0 ? `<div class="text-[11px] text-slate-500">+ ${out} em outro${out > 1 ? 's' : ''} mês${out > 1 ? 'es' : ''}</div>` : ''}</td>
      <td class="px-3 py-1.5 text-right" data-c="total">${f(x.vn)}</td><td class="px-3 py-1.5 text-right font-medium" data-c="pago">${f(c2(g.v))}${RM && cc(x.pago) != g.v ? `<div class="text-[11px] font-normal text-slate-500">acumulado ${f(x.pago)}</div>` : ''}</td><td class="px-3 py-1.5 text-right ${x.sd > 0 ? 'font-medium text-sky-700 dark:text-sky-300' : 'text-slate-400'}" data-c="saldo">${x.sd > 0 ? f(x.sd) : '—'}</td>
      <td class="px-3 py-1.5 text-xs font-semibold ${parcial ? 'text-sky-700 dark:text-sky-300' : 'text-emerald-600 dark:text-emerald-400'}" data-c="sit">${parcial ? 'Parcial · ' + p(x.pf) : 'Pago'}</td>
      <td class="px-3 py-1.5 text-right">${f(c2(g.vo))}</td><td class="px-3 py-1.5 text-right ${ecol(g.ec, g.et)}" title="${edica(g.ec, g.et)}">${f(c2(g.ec))}</td><td class="px-3 py-1.5 text-right ${ecol(g.ec, g.et)}" title="${edica(g.ec, g.et)}">${g.vo ? p(g.ec / g.vo) : ''}</td>
      <td class="px-3 py-1.5">${esc(x.cat)}</td><td class="px-3 py-1.5">${esc(x.ped) || '-'}</td><td class="px-3 py-1.5">${dm(x.dt)}/${x.dt.slice(2, 4)}</td>
      <td class="px-3 py-1.5 text-right" title="Cálculo reverso: (1 − valor negociado ÷ valor original) ÷ 90% · alíquota de referência ${p(x.pc)}">${x.vo ? p(x.pa) : '—'}</td><td class="px-3 py-1.5">${esc(x.rp)}</td></tr>` }).join('') || '<tr><td colspan="16" class="px-3 py-6 text-center text-slate-500">Nenhuma compra com pagamento encontrada.</td></tr>'}</tbody>
    <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-3 py-2" colspan="4">TOTAL (${G.length})</td><td class="px-3 py-2 text-right" data-t="total">${f(c2(TC.tot))}</td><td class="px-3 py-2 text-right" data-t="pago">${f(c2(TC.v))}</td><td class="px-3 py-2 text-right" data-t="saldo">${f(c2(TC.sd))}</td><td></td><td class="px-3 py-2 text-right">${f(c2(T.vo))}</td><td class="px-3 py-2 text-right ${ecol(T.ec, T.et)}" title="${edica(T.ec, T.et)}">${f(c2(T.ec))}</td><td class="px-3 py-2 text-right">${T.vo ? p(T.ec / T.vo) : ''}</td><td colspan="5"></td></tr></tfoot></table></div>`;
    const n = document.getElementById('reidi-rn'); if (n) n.textContent = G.length + ' de ' + new Set(pagos().map(x => x.c.id)).size + ' compras com pagamento · ' + ps.length + ' pagamento(s)'
  }
  /* ---------- Resumo "A pagar aos fornecedores" (clique numa coluna dos gráficos) ----------
     Clicar numa coluna do gráfico "A pagar por quinzena" (Resumo Executivo) ou "Sem REIDI × Com REIDI" (Análise Financeira) — ou num dos botões logo abaixo do gráfico, que fazem o mesmo para quem usa
     teclado ou leitor de tela — abre a janela com o que há a pagar aos fornecedores naquela quinzena (a data de pagamento do calendário). Por fornecedor: valor negociado (o mesmo valor da coluna),
     já pago e SALDO A PAGAR (= negociado − pagamentos registrados em Projeção REIDI); clicando no fornecedor aparecem as compras dele. Contas em centavos (RDB.c / RDB.r2).
     Só usa o que o relatório já carrega (compras e pagamentos): nada novo no banco, vale para quem vê o relatório. A janela se atualiza sozinha junto com o relatório (tempo real). */
  const ALT = s => (s == 'fin' ? 'Gráfico de colunas: valor sem REIDI e com REIDI por quinzena.' : 'Gráfico de colunas: valor a pagar (já descontados os pagamentos lançados) e economia REIDI por quinzena.') + ' Os botões logo abaixo do gráfico abrem o resumo do que há a pagar aos fornecedores em cada quinzena.',
    apChips = (src, gs) => gs.length ? `<div class="flex flex-wrap items-center gap-1.5 mt-2" data-ap="botoes"><span class="text-xs text-slate-500 mr-1">👆 Clique em uma coluna do gráfico (ou use os botões) para ver o que há a pagar a cada fornecedor:</span>${gs.map(g => `<button type="button" class="px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-500/30 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-500/20" data-pg="${g.pg}" title="Ver o que há a pagar aos fornecedores · ${esc(g.t)}" onclick="reidi.ap('${src}','${g.pg}')">${esc(g.t)}</button>`).join('')}</div>` : '';
  /* torna as colunas de um gráfico clicáveis: o clique (ou toque) em qualquer ponto da faixa de uma quinzena — as colunas, o espaço acima delas e o nome da quinzena embaixo — abre o resumo dela.
     A legenda e as margens não contam. chaves[i] = data de pagamento da quinzena da i-ésima posição do eixo. */
  function clicavel(id, chaves, src) {
    const cv = document.getElementById(id), ch = CH[id]; if (!cv || !ch) return;
    const qual = ev => {   /* posição da quinzena sob o ponteiro, ou -1 */
      const a = ch.chartArea, sx = ch.scales && ch.scales.x; if (!a || !sx || !chaves.length) return -1;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (!(x >= sx.left && x < sx.right && y >= a.top && y <= sx.bottom)) return -1;
      return Math.min(chaves.length - 1, Math.floor((x - sx.left) / ((sx.right - sx.left) / chaves.length)))
    };
    cv.addEventListener('click', ev => { const i = qual(ev); if (i >= 0) apAbre(src, chaves[i]) });
    cv.addEventListener('mousemove', ev => { cv.style.cursor = qual(ev) >= 0 ? 'pointer' : '' });
    cv.addEventListener('mouseleave', () => { cv.style.cursor = '' })
  }
  /* compras da quinzena aberta: src 'res' = Resumo Executivo (calc().G, só o período) · 'fin' = Análise Financeira (fdados().GP, período ou toda a base) */
  const apItens = () => { const C = calc(), D = AP.src == 'fin' ? fdados(C).GP.find(g => g.k == AP.key) : C.G.find(g => g.pg == AP.key); return D ? D.it : [] };
  /* agrupa por fornecedor (o nome como foi lançado, igual ao quadro de fornecedores do Resumo); tudo em centavos. Maior saldo a pagar primeiro. */
  function apAgrega(it) {
    const m = new Map(); it.forEach(x => { let o = m.get(x.f); if (!o) { o = { f: x.f, n: 0, vn: 0, pago: 0, sd: 0, it: [] }; m.set(x.f, o) } o.n++; o.vn += cc(x.vn); o.pago += cc(x.pago); o.sd += cc(x.sd); o.it.push(x) });
    const L = [...m.values()].sort((a, b) => b.sd - a.sd || b.vn - a.vn || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0)); L.forEach(o => o.it.sort((a, b) => a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.k - b.k));
    return { L, n: it.length, vn: SM(L, o => o.vn), pago: SM(L, o => o.pago), sd: SM(L, o => o.sd) }
  }
  function apHtml() {
    const C = calc(), q = C.q, key = AP.key, it = apItens(), A = apAgrega(it), d = +key.slice(8), mm = key.slice(5, 7), R = c => f(c2(c)), s = n => n == 1 ? '' : 's',
      quinz = (d <= q.d1 ? '1ª' : '2ª') + ' quinzena', per = d <= q.d1 ? `01/${mm} – ${pad(q.d1)}/${mm}` : `${pad(q.d1 + 1)}/${mm} – ${pad(eom(key))}/${mm}`, mp = motivo(key), sp = mp ? antDU(key) : '',
      fechar = '<button type="button" class="btn" onclick="reidi.apFecha()">Fechar</button>',
      cab = `<div id="rap" role="dialog" aria-modal="true" aria-labelledby="rap-t" data-src="${AP.src}" data-pg="${key}"><div class="flex items-start gap-3"><div class="mr-auto min-w-0"><h2 id="rap-t" class="text-lg font-bold leading-tight">A pagar aos fornecedores</h2>
        <p class="text-sm text-slate-500" data-ap="sub"><b class="text-slate-700 dark:text-slate-200">${quinz}</b> · ${per}/${key.slice(0, 4)} · pagamento em <b class="text-slate-700 dark:text-slate-200">${dmw(key)}</b>${mp ? ` · <span class="text-amber-600 dark:text-amber-400">⚠ cai em ${esc(mp)}: pagar em <b>${dmw(sp)}</b></span>` : ''}${AP.src == 'fin' && ESC == 'all' ? ' · <span data-ap="base">toda a base (inclui compras fora do período)</span>' : ''}</p></div>
        <button type="button" id="rap-x" class="btn2 !py-1 !px-2.5" aria-label="Fechar" onclick="reidi.apFecha()">✕</button></div>`;
    if (!A.n) return cab + `<p class="text-sm text-slate-500 py-8 text-center" data-ap="vazio">Nenhuma compra nesta quinzena (os dados mudaram desde que a janela foi aberta).</p><div class="flex justify-end">${fechar}</div></div>`;
    const ec = SM(it, x => cc(x.ec)), et = SM(it, x => cc(x.et)), todos = A.L.every(o => AP.ex.has(o.f)), TD = 'px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap', th = (l, r) => `<th class="px-2.5 py-1.5 ${r ? 'text-right' : 'text-left'}">${l}</th>`,
      tile = (k, t, v, sub, cls) => `<div data-k="${k}" class="rounded-lg px-3 py-2 min-w-0 ${k == 'apagar' ? 'bg-indigo-500/10 border border-indigo-500/40' : 'bg-slate-500/10'}"><div class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">${t}</div><div class="text-lg font-bold tabular-nums whitespace-nowrap ${cls || ''}">${v}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`,
      linha = o => {
        const ab = AP.ex.has(o.f), pc = A.sd > 0 ? o.sd / A.sd : 0,
          det = o.it.map(x => `<tr class="border-t border-slate-200/70 dark:border-slate-700/60" data-id="${esc(x.id)}"><td class="px-2 py-1 text-slate-500">${x.k + 1}</td><td class="px-2 py-1 max-w-[240px] truncate" title="${esc(x.i)}">${esc(x.i) || '—'}</td><td class="px-2 py-1">${esc(x.cat)}</td><td class="px-2 py-1">${esc(x.ped) || '-'}</td><td class="px-2 py-1">${dm(x.dt)}/${x.dt.slice(2, 4)}</td><td class="px-2 py-1 text-right tabular-nums">${f(x.vn)}</td><td class="px-2 py-1 text-right tabular-nums">${cc(x.pago) ? f(x.pago) : '—'}</td><td class="px-2 py-1 text-right tabular-nums font-medium">${cc(x.sd) ? f(x.sd) : '—'}</td><td class="px-2 py-1 ${x.st == 'Pago' ? 'text-emerald-600 dark:text-emerald-400' : x.st == 'Parcial' ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500'}">${x.st == 'Parcial' ? 'Parcial · ' + p(x.pf) : x.st}</td></tr>`).join('');
        return `<tr class="border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-500/5" data-f="${esc(o.f)}" onclick="reidi.apF(this)"><td class="px-2.5 py-1.5 max-w-[280px]"><button type="button" class="flex items-center gap-1.5 w-full text-left font-medium" aria-expanded="${ab}" onclick="event.stopPropagation();reidi.apF(this)"><span aria-hidden="true" class="text-slate-400 w-3 shrink-0">${ab ? '▾' : '▸'}</span><span class="truncate" title="${esc(o.f)}">${esc(o.f)}</span></button></td>
          <td class="${TD}" data-c="n">${o.n}</td><td class="${TD}" data-c="vn">${R(o.vn)}</td><td class="${TD}" data-c="pago">${o.pago ? R(o.pago) : '—'}</td><td class="${TD} font-semibold" data-c="sd">${o.sd ? R(o.sd) : '<span class="text-emerald-600 dark:text-emerald-400 font-medium">quitado</span>'}</td>
          <td class="${TD}" data-c="pct"><div class="flex items-center justify-end gap-2"><span>${A.sd > 0 ? p(pc) : '—'}</span><span class="hidden sm:block w-14 h-1.5 rounded bg-slate-500/20 overflow-hidden" aria-hidden="true"><span class="block h-full bg-indigo-500" style="width:${(pc * 100).toFixed(1)}%"></span></span></div></td></tr>
          <tr class="${ab ? '' : 'hidden'}" data-d="${esc(o.f)}"><td colspan="6" class="px-2.5 pb-2 bg-slate-500/5"><div class="overflow-x-auto"><table class="w-full text-xs whitespace-nowrap" data-tab="ap-det"><thead class="text-left uppercase text-slate-500"><tr><th class="px-2 py-1">Nº</th><th class="px-2 py-1">Item / descrição</th><th class="px-2 py-1">Categoria</th><th class="px-2 py-1">Pedido</th><th class="px-2 py-1">Data prevista</th><th class="px-2 py-1 text-right">Negociado</th><th class="px-2 py-1 text-right">Pago</th><th class="px-2 py-1 text-right">A pagar</th><th class="px-2 py-1">Situação</th></tr></thead><tbody>${det}</tbody></table></div></td></tr>`
      };
    return cab + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">${tile('apagar', 'A pagar', R(A.sd), A.sd ? p(A.vn ? A.sd / A.vn : 0) + ' do valor das compras' : 'tudo pago', 'text-indigo-600 dark:text-indigo-300')}${tile('total', 'Valor das compras', R(A.vn), 'com REIDI · valor negociado')}${tile('pago', 'Já pago', R(A.pago), p(A.vn ? A.pago / A.vn : 0) + ' do valor das compras')}${tile('forn', 'Fornecedores', A.L.length, A.n + ' compra' + s(A.n))}</div>
      <p class="text-xs text-slate-500 mt-2" data-ap="economia">Economia REIDI nesta quinzena: real <b class="${RDB.cor(c2(ec), c2(et))}" title="${esc(RDB.dica(c2(ec), c2(et)))}">${R(ec)}</b> · teórica <b>${R(et)}</b></p>
      <div class="flex items-center gap-2 mt-3 mb-1.5"><h3 class="text-sm font-semibold mr-auto">Por fornecedor <span class="font-normal text-slate-500">· maior valor a pagar primeiro</span></h3><button type="button" id="rap-todos" class="btn2 !py-1 !text-xs" onclick="reidi.apX()">${todos ? 'Recolher tudo' : 'Expandir tudo'}</button></div>
      <div id="rap-sc" class="overflow-auto rounded-lg border border-slate-200 dark:border-slate-800" style="max-height:44vh"><table class="w-full text-sm" data-tab="ap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${th('Fornecedor')}${th('Compras', 1)}${th('Valor negociado', 1)}${th('Pago', 1)}${th('A pagar', 1)}${th('% do a pagar', 1)}</tr></thead>
        <tbody>${A.L.map(linha).join('')}</tbody>
        <tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr><td class="px-2.5 py-1.5">TOTAL (${A.L.length} fornecedor${A.L.length == 1 ? '' : 'es'})</td><td class="${TD}">${A.n}</td><td class="${TD}">${R(A.vn)}</td><td class="${TD}">${A.pago ? R(A.pago) : '—'}</td><td class="${TD}">${R(A.sd)}</td><td class="${TD}">${A.sd > 0 ? p(1) : '—'}</td></tr></tfoot></table></div>
      <p class="text-xs text-slate-500 mt-2">A pagar = valor negociado (com REIDI) − pagamentos já registrados em Projeção REIDI. Clique no fornecedor para ver as compras dele.</p>
      <div class="flex flex-wrap justify-end gap-2 mt-3"><button type="button" class="btn2" onclick="reidi.apGo()">Abrir na Projeção de Compras</button>${fechar}</div></div>`
  }
  /* desenha a janela; ao atualizar (dados novos) mantém a posição da rolagem, o que estava aberto e o foco */
  function apDesenha(abrir) {
    if (!AP) return; if (!B) { apFecha(); return } const md = document.getElementById('md'), b = document.getElementById('mdb');
    if (!abrir && (!document.getElementById('rap') || md.classList.contains('hidden'))) { AP = null; return }   /* outra janela ocupou o lugar, ou esta foi fechada por outro caminho */
    const a = document.activeElement, dentro = !abrir && !!(a && a.closest && a.closest('#rap')), tr = dentro ? a.closest('tr[data-f]') : null, fid = dentro && a.id ? a.id : '', ff = tr ? tr.dataset.f : null,
      sc = document.getElementById('rap-sc'), t0 = b.scrollTop, s0 = sc ? sc.scrollTop : 0, h = apHtml();
    if (abrir) { mo(h); b.style.maxWidth = '64rem' } else { b.innerHTML = h; b.scrollTop = t0; const n = document.getElementById('rap-sc'); if (n) n.scrollTop = s0 }
    if (fid) { const e = document.getElementById(fid); if (e) e.focus() } else if (ff != null) { const r = [...b.querySelectorAll('tr[data-f]')].find(x => x.dataset.f == ff), bt = r && r.querySelector('button'); if (bt) bt.focus() }
  }
  function apAbre(src, key) {
    if (!B || !/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return;
    AP = { src: src == 'fin' ? 'fin' : 'res', key, ex: new Set(), volta: document.activeElement }; apDesenha(true); const x = document.getElementById('rap-x'); if (x) x.focus()
  }
  function apFecha() { const v = AP && AP.volta; AP = null; closeMd(); if (v && v !== document.body && document.contains(v) && v.focus) try { v.focus() } catch (e) { } }
  /* abre/fecha as compras de um fornecedor sem redesenhar (a rolagem fica onde está) */
  function apF(el) {
    const tr = el && el.closest && el.closest('tr[data-f]'); if (!tr || !AP) return; const k = tr.dataset.f, ab = !AP.ex.has(k), det = tr.nextElementSibling, bt = tr.querySelector('button[aria-expanded]');
    if (ab) AP.ex.add(k); else AP.ex.delete(k); if (det) det.classList.toggle('hidden', !ab); if (bt) { bt.setAttribute('aria-expanded', ab); if (bt.firstElementChild) bt.firstElementChild.textContent = ab ? '▾' : '▸' }
    const A = apAgrega(apItens()), t = document.getElementById('rap-todos'); if (t) t.textContent = A.L.every(o => AP.ex.has(o.f)) ? 'Recolher tudo' : 'Expandir tudo'
  }
  function apX() { if (!AP) return; const A = apAgrega(apItens()); AP.ex = A.L.every(o => AP.ex.has(o.f)) ? new Set() : new Set(A.L.map(o => o.f)); apDesenha() }
  /* leva para a Projeção de Compras já filtrada nesta quinzena (data de pagamento); na Análise Financeira com "Toda a base" inclui também as compras fora do período */
  function apGo() { if (!AP) return; const { src, key } = AP; AP = null; closeMd(); FCt = ''; FRp = ''; FQ = ''; FP = key; HZ = !(src == 'fin' && ESC == 'all'); tab = 'proj'; tela() }
  document.addEventListener('keydown', e => { const m = document.getElementById('md'); if (e.key == 'Escape' && AP && m && !m.classList.contains('hidden') && document.getElementById('rap')) { e.stopPropagation(); apFecha() } });

  function render() {
    Object.values(CH).forEach(c => c.destroy()); CH = {};
    VIEW.innerHTML = head() + (B ? tabs() + (tab == 'res' ? resumo() : tab == 'fin' ? fin() : tab == 'real' ? real() : proj()) : vazio());
    if (B) { if (tab == 'res') graficos(); else if (tab == 'fin') { gfin(); ftbl() } else if (tab == 'real') rtbl(); else tbl() }
    apDesenha()
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
      const E = XR, c = E.C, C = calc(), q = C.q, wb = XP.book({ titulo: 'REIDI · Projeção Mensal de Compras' }), sd = E.serial, PJ = 'Projeção por Período';
      const sub = 'Documento nº ' + B.doc + ' · Referência ' + br(q.ref) + ' · Horizonte de ' + q.hor + ' dias (até ' + br(C.fim) + ') · Gerado em ' + E.hoje(), rod = 'Consórcio Santa Dulce · REIDI · Projeção Mensal de Compras';
      const R0 = wb.sheet('Resumo Executivo', { tab: c.navy, grid: false, sel: true, rod, zoom: 90 });
      const G = C.G, lbq = g => g.q + ' · ' + MES[+g.pg.slice(5, 7) - 1] + '/' + g.pg.slice(2, 4);
      const PRM = n => `'${PJ}'!$F$${n}`, FAT = PRM(19), AA = PRM(20), AB = PRM(21), /* parâmetros: fator 90% e alíquotas de referência (linhas 19–21 da aba Projeção por Período) */
        paF = (r, i, L) => `IF(${L.vo}${r}=0,0,(${L.vo}${r}-${L.vn}${r})/(${L.vo}${r}*${FAT}))`, alF = (r, i, L) => `IF(${L.pa}${r}>=(${AA}+${AB})/2,${AB},${AA})`, etF = (r, i, L) => `${L.vo}${r}*${L.al}${r}*${FAT}`,
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

      /* ---- Projeção de Compras (a linha TOTAL traz só os valores em R$, sem percentuais) ---- */
      const LN = linhas(C);
      E.dados(wb, 'Projeção de Compras', { titulo: 'Projeção de compras · detalhamento', sub: LN.length + ' compra(s)' + (HZ ? ' dentro do horizonte' : '') + ' · ' + E.hoje(), rod, rows: LN, fz: 2,
        cols: [{ h: 'Nº', g: x => x.k + 1, nf: 'int', al: 'center', tot: 'TOTAL' }, { h: 'FORNECEDOR', g: x => x.f, w: 1, maxW: 38 }, { h: 'ITEM / DESCRIÇÃO', g: x => x.i, w: 1, maxW: 48 }, { h: 'CATEGORIA', g: x => x.cat, w: 1, maxW: 28 }, { h: 'Nº PEDIDO / PROCESSO / NF', g: x => x.ped, w: 1, maxW: 24 },
          { h: 'DATA PREVISTA', g: x => sd(x.dt), nf: 'data' }, { h: 'PAGAMENTO', g: x => sd(x.pg), nf: 'data' }, { h: '% PIS/COFINS APLICADO (REVERSO)', g: x => x.pa, nf: 'pct2', al: 'center', k: 'pa', f: paF }, { h: 'ALÍQUOTA DE REFERÊNCIA', g: x => x.pc, nf: 'pct2', al: 'center', k: 'al', f: alF }, { h: 'RESPONSÁVEL', g: x => x.rp, w: 1, maxW: 26 },
          { h: 'VALOR ORIGINAL', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'VALOR NEGOCIADO COM O FORNECEDOR', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA REAL R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA REAL %', g: x => x.ecp, nf: 'pct', k: 'ecp', f: pcF },
          { h: 'ECONOMIA TEÓRICA R$', g: x => x.et, nf: 'moeda', tot: 'sum', k: 'et', f: etF }, { h: 'ECONOMIA TEÓRICA %', g: x => x.etp, nf: 'pct', k: 'etp', f: (r, i, L) => `IF(${L.vo}${r}=0,0,${L.et}${r}/${L.vo}${r})` }, { h: 'DATA BASE ATUALIZAÇÃO', g: x => sd(x.ba), nf: 'data' }] });

      /* ================= RESUMO EXECUTIVO ================= */
      [24, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5].forEach((w, i) => R0.width(2 + i, w));
      let r = E.cab(R0, 9, { titulo: 'Resumo Executivo · REIDI', sub });
      const tr = P1.t, lv = (k, v) => tr.rt ? { f: `'${PJ}'!${tr.letter[k]}${tr.rt}`, v } : v; /* valor do cartão = fórmula que aponta ao TOTAL da aba Projeção por Período (sem compras não há linha de total: vale o número) */
      /* maiores fornecedores do período (mesmo agrupamento do quadro lá embaixo) */
      const fo = {}; C.I.forEach(x => { const k = short(x.f) || '—'; (fo[k] = fo[k] || { f: k, n: 0, vn: 0, ec: 0 }); const o = fo[k]; o.n++; o.vn += x.vn; o.ec += x.ec });
      const FL = Object.values(fo).sort((a, b) => b.vn - a.vn).slice(0, 5), T5 = FL.reduce((a, x) => a + x.vn, 0), top = FL[0];

      /* cartões, nesta ordem — 1ª linha: caixa (saldo em C/C e A TRANSFERIR, em destaque) · 2ª: compras e economia · 3ª: maior fornecedor */
      const H1 = [20, 20, 20, 17, 17],
        memo = !C.tot.n ? 'Nenhuma compra no horizonte.' : C.T == 0 ? `O saldo em C/C cobre todas as compras (${f(C.tot.vn)}): nenhuma transferência necessária.`
          : `Compras ${f(C.tot.vn)}${q.saldo ? ' − saldo ' + f(q.saldo) + ' = ' + f(C.liq) : ''} → arredondado para cima (múltiplos de ${f(PASSO).replace(',00', '')})`;
      E.kpi(R0, r, 2, { w: 2, rows: 5, hs: H1, label: 'SALDO EM C/C BELOV OBRAS', v: q.saldo, sub: 'Santander · abatido do valor a transferir', cor: c.line, vc: c.ink, sz: 20 });
      E.kpi(R0, r, 4, { w: 6, hero: 1, hs: H1, label: 'A TRANSFERIR PARA A BELOV OBRAS', v: lv('tf', C.T), sub: memo, sub2: 'OBS: se houver saldo em C/C, ele é subtraído do total das compras.' });
      r += 5; R0.height(r, 8); r++;
      E.kpi(R0, r, 2, { w: 2, label: 'SEM REIDI · VALOR ORIGINAL', v: C.tot.vo, sub: C.tot.n + ' compra(s) · valor original', cor: c.line, vc: c.ink });
      E.kpi(R0, r, 4, { w: 3, label: 'TOTAL DAS COMPRAS', v: lv('vn', C.tot.vn), sub: 'com REIDI · ' + br(q.ref) + ' a ' + br(C.fim), cor: c.blue });
      E.kpi(R0, r, 7, { w: 3, label: 'ECONOMIA REIDI REAL', v: lv('ec', C.tot.ec), sub: (C.tot.vo ? p(C.tot.ec / C.tot.vo) : '0%') + ' do valor original · teórica ' + f(C.tot.et), cor: c.grn });
      r += 4; R0.height(r, 8); r++;
      E.kpi(R0, r, 2, { w: 8, label: 'MAIOR FORNECEDOR NO PERÍODO', v: top ? top.f : '—', sub: top ? f(top.vn) + ' · ' + (C.tot.vn ? p(top.vn / C.tot.vn) : '0%') + ' do total das compras · ' + top.n + ' compra(s)' : '', cor: c.line, vc: c.ink, sz: 16, nf: 'int' });
      r += 4; R0.height(r, 10); r++;

      /* gráficos (os quadros que os alimentam estão logo abaixo) · na impressão: 1ª página = cartões · 2ª = gráficos + quinzenas · 3ª = categorias + fornecedores */
      R0.brk(r); r = E.sec(R0, r, 2, 9, 'Compras por quinzena e por categoria'); const gr = r; r += 16; R0.height(r, 10); r++;

      r = E.sec(R0, r, 2, 9, 'Quadro · compras por quinzena');
      const T1 = E.tabela(R0, r, 2, [{ h: 'QUINZENA', g: g => lbq(g), tot: 'TOTAL', b: 1 }, { h: 'PAGAMENTO EM', g: g => sd(g.pg), nf: 'data' }, { h: 'TRANSFERIR ATÉ', g: g => sd(g.tr), nf: 'data' }, { h: 'SEM REIDI', g: g => g.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'COM REIDI', g: g => g.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: g => g.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: g => g.vo ? g.ec / g.vo : 0, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(C.tot.vo, C.tot.ec) }, { h: 'A TRANSFERIR', g: g => g.tf, nf: 'moeda', tot: 'sum', k: 'tf' }], G, { hh: 30 });
      r = T1.end + 1;

      const cats = {}; C.I.forEach(x => { const k = x.cat || 'Sem categoria'; (cats[k] = cats[k] || { cat: k, n: 0, vo: 0, vn: 0, ec: 0 }); const o = cats[k]; o.n++; o.vo += x.vo; o.vn += x.vn; o.ec += x.ec });
      let CL = Object.values(cats).sort((a, b) => b.vn - a.vn); if (CL.length > 8) { const rest = CL.slice(7).reduce((a, x) => ({ cat: 'Demais categorias', n: a.n + x.n, vo: a.vo + x.vo, vn: a.vn + x.vn, ec: a.ec + x.ec }), { cat: 'Demais categorias', n: 0, vo: 0, vn: 0, ec: 0 }); CL = CL.slice(0, 7).concat([rest]) }
      R0.brk(r); r = E.sec(R0, r, 2, 9, 'Quadro · compras por categoria');
      const totVn = C.tot.vn;
      const T2 = E.tabela(R0, r, 2, [{ h: 'CATEGORIA', g: x => x.cat, tot: 'TOTAL', b: 1, w: 1 }, { h: 'Nº DE COMPRAS', g: x => x.n, nf: 'int', tot: 'sum' }, { h: 'SEM REIDI', g: x => x.vo, nf: 'moeda', tot: 'sum', k: 'vo' }, { h: 'COM REIDI', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' }, { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', k: 'ec', f: ecF, c: c.grn, b: 1 }, { h: 'ECONOMIA %', g: x => x.vo ? x.ec / x.vo : 0, nf: 'pct', k: 'ecp', f: pcF, tot: pcT(C.tot.vo, C.tot.ec) },
        { h: '% DO TOTAL', g: x => totVn ? x.vn / totVn : 0, nf: 'pct', k: 'sh', f: (rr, i, L) => `IF(SUM(${L.vn}$${r + 1}:${L.vn}$${r + CL.length})=0,0,${L.vn}${rr}/SUM(${L.vn}$${r + 1}:${L.vn}$${r + CL.length}))`, tot: { f: (rt, L, r1, r2) => `SUM(${L.sh}${r1}:${L.sh}${r2})`, v: totVn ? 1 : 0 } }], CL, { hh: 30 });
      if (CL.length) R0.dataBar(T2.r1, 8, T2.r2, 8, '5B9BD5');
      r = T2.end + 1;

      /* % = participação de cada fornecedor no total do próprio Top 5 (a coluna soma 100%); fórmula na planilha, valor em cache igual ao recalculado */
      r = E.sec(R0, r, 2, 9, 'Quadro · maiores fornecedores do período');
      const T3 = E.tabela(R0, r, 2, [{ h: 'FORNECEDOR', g: x => x.f, w: 1, b: 1, tot: 'TOTAL (TOP 5)' }, { h: 'Nº DE COMPRAS', g: x => x.n, nf: 'int', tot: 'sum' }, { h: 'VALOR COM REIDI', g: x => x.vn, nf: 'moeda', tot: 'sum', k: 'vn' },
        { h: '% DO TOP 5', g: x => T5 ? x.vn / T5 : 0, nf: 'pct', k: 'sh', f: (rr, i, L) => `IF(SUM(${L.vn}$${r + 1}:${L.vn}$${r + FL.length})=0,0,${L.vn}${rr}/SUM(${L.vn}$${r + 1}:${L.vn}$${r + FL.length}))`, tot: { f: (rt, L, r1, r2) => `SUM(${L.sh}${r1}:${L.sh}${r2})`, v: T5 ? 1 : 0 } },
        { h: 'ECONOMIA R$', g: x => x.ec, nf: 'moeda', tot: 'sum', c: c.grn, b: 1 }], FL, { hh: 30 });
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
    if (ROLE != 'admin' || !B) return; const R = B.resp || RESP0, d = R.d || RESP0.d, I = (id, l, v, t) => `<label class="block text-sm mb-1">${l}</label><input id="${id}" type="${t || 'text'}" class="inp w-full mb-3" value="${esc(v)}">`,
      C0 = calc(), /* o Termo é o documento do período INTEIRO (calc().tot / .T); com pagamentos lançados o Resumo mostra só o que falta pagar — o aviso evita confundir os dois valores */
      aviso = C0.R.pago > 0 ? `<p id="rt-completo" class="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-4">⚠ O termo usa a projeção <b>completa</b> do período (compras de ${f(C0.tot.vn)} · transferência de ${f(C0.T)}). O Resumo Executivo mostra só o que falta pagar (${f(C0.R.vn)} · transferência de ${f(C0.R.T)}), já descontados os ${f(C0.R.pago)} pagos.</p>` : '';
    mo(`<h2 class="text-lg font-bold mb-1">Termo para assinatura · REIDI</h2><p class="text-sm text-slate-500 mb-4">Resumo Executivo + Projeção de Compras</p>${aviso}${I('rt-n', 'Documento nº', B.doc || '')}
    <p class="text-xs font-semibold uppercase text-slate-500 mb-2">Responsáveis (aparecem só no PDF)</p>${I('rt-e', 'Elaboração', R.el || RESP0.el)}${I('rt-c', 'Conferência', R.cf || RESP0.cf)}${I('rt-1', 'Atesto da Diretoria (1)', d[0] || '')}${I('rt-2', 'Atesto da Diretoria (2)', d[1] || '')}${I('rt-3', 'Atesto da Diretoria (3)', d[2] || '')}
    <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="reidi.termoOk()">Gerar PDF</button></div>`)
  }
  /* grava os parâmetros compartilhados (quem tem "Alterar os parâmetros"); troca só o que veio em 'o' e mantém o que está publicado AGORA no banco: relê antes de gravar,
     para não desfazer o que outra pessoa publicou nos últimos segundos (a tela só confere a cada 30 s). Publicar um item não apaga o rascunho do outro:
     o período filtrado (De/Até) e o saldo digitado só saem quando são eles mesmos que se publicam. */
  async function cfgSalva(o) {
    if (!adm() || !B) return false;
    const rasc = {}; ['de', 'ate', 'saldo'].forEach(k => { if (P[k] != null) rasc[k] = P[k] });
    const volta = () => { montar(); Object.assign(P, rasc); if ('ref' in o || 'hor' in o) { delete P.de; delete P.ate } if ('saldo' in o) delete P.saldo; salva() }; /* remonta com o que acabou de ser publicado, devolve os rascunhos e tira só o que acabou de ser publicado (período ou saldo) */
    try {
      let ag = {}; try { const r = await BASE.ler(RDB.CFG); if (r && r.dados && typeof r.dados == 'object') ag = r.dados } catch (e) { } /* sem conseguir reler: segue com o que a tela já tinha */
      await RDB.gravarConfig({ doc: B.doc, ref: B.ref, hor: B.hor, saldo: B.saldo, resp: B.resp, ...ag, ...o }); volta();
      try { await RDB.carregar(); volta() } catch (e) { } /* confirma com o banco: uma leitura que já estava em andamento antes da gravação não pode devolver a tela ao valor antigo */
      return true
    } catch (e) { MSG = '⚠ Não salvei os parâmetros: ' + (e.message || e); ERR = true; tela(); return false }
  }
  /* publica o período filtrado (De/Até) como o padrão de TODOS: a data de referência vira o "De" e o horizonte, a contagem de dias até o "Até" (os mesmos campos do ⚙ Parâmetros) */
  async function pubPerOk(ref, hor) {
    if (PUBP || !adm() || !B) return; PUBP = true; MSG = 'Publicando o período para todos…'; ERR = false; tela();
    try {
      if (await cfgSalva({ ref, hor })) {
        const ate = addD(ref, hor); MSG = '✔ Período publicado: ' + br(ref) + ' a ' + br(ate) + ' (' + dd(hor) + '). Todos os usuários passam a ver este período (quem está com o REIDI aberto, em até 30 segundos).'; ERR = false;
        try { uLog('REIDI: publicou o período ' + br(ref) + ' a ' + br(ate) + ' (' + dd(hor) + ') para todos') } catch (e) { }
      }
    } finally { PUBP = false; tela() }
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
    /* "Publicar período para todos": confirma e grava o período filtrado como o padrão de todos os usuários (pubPerOk) */
    pubPer() {
      if (!adm() || !B || !perOn() || PUBP) return; MSG = ''; ERR = false;
      const q = par(), ate = addD(q.ref, q.hor), pub = B.ref, pubA = addD(B.ref, +B.hor || 30);
      if (q.ref == pub && ate == pubA) { tela(); return } /* já é o período publicado: nada a fazer */
      if (!(q.hor >= 1 && q.hor <= 365)) { MSG = '⚠ O período publicado pode ter de 1 a 365 dias; o escolhido (' + br(q.ref) + ' a ' + br(ate) + ') tem ' + dd(q.hor) + '. Ajuste as datas De/Até.'; ERR = true; tela(); return }
      const t = calc().tot;
      dlg('Publicar o período para todos?', `Todos os usuários passarão a abrir o REIDI no período <b>${br(q.ref)} a ${br(ate)}</b> (${dd(q.hor)}), no lugar de ${br(pub)} a ${br(pubA)}. Neste período: <b>${t.n} compra${t.n == 1 ? '' : 's'}</b> · ${f(t.vn)} com REIDI. Quem estiver com o REIDI aberto vê a mudança em até 30 segundos. Fica registrado na Auditoria.`, () => pubPerOk(q.ref, q.hor))
    },
    exp() { if (!soAdm() || !B) return; const q = par(); RDB.exportar(null, { ref: q.ref, hor: q.hor }).catch(e => { MSG = '⚠ Não consegui gerar a planilha: ' + (e.message || e); ERR = true; tela() }) },
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
    s(k) { if (SK == k) SD = -SD; else { SK = k; SD = 1 } tbl() }, xl, termo, termoOk, ap: apAbre, apF, apX, apGo, apFecha,
    calc: () => B ? calc() : null, montar, alertas: () => B ? alertas(calc()) : [], _set: b => { B = b }
  };
  render();
  /* abre sozinho quando a tela do REIDI fica visível (mesmo que o menu do site seja uma versão antiga e não chame reidi.show) */
  try { new MutationObserver(() => { if (VIEW.classList.contains('hidden')) { delete VIEW.dataset.ok } else if (!VIEW.dataset.ok) { window.reidi.show() } }).observe(VIEW, { attributes: true, attributeFilter: ['class'] }) } catch (e) { }
})();
