/* Permissões por usuário — espelho no navegador de supabase/permissoes.sql.
   • Cada usuário tem uma LISTA de permissões (public.perfis.permissoes), marcada pelo administrador em "Usuários". O perfil só define o ponto de partida (PADRAO).
   • ESTE ARQUIVO SÓ MOSTRA/ESCONDE e guia a navegação. Quem BLOQUEIA DE VERDADE é o banco (RLS): sem a permissão, os dados nem chegam ao navegador,
     mesmo que alguém abra o endereço direto ou mexa no console. Por isso as chaves e as dependências abaixo precisam bater com o permissoes.sql.
   • Para criar uma permissão nova: acrescente aqui (GRUPOS) e em supabase/permissoes.sql (permissoes_validas + regras), e use PERM.tem('chave') no módulo
     (ou data-perm="chave" no HTML: o elemento some sozinho para quem não tem a permissão).
   Carregado logo depois de app.js; usado por main.js, usuarios.js e por todos os módulos. */
const PERM = (() => {
  'use strict';
  /* catálogo, na ordem do menu · g = relatório/módulo · p[0] é sempre o "ver" do grupo (as demais ações dependem dele)
     Exceção: "dash.fornecedores" NÃO depende do "ver": é uma alternativa MAIS RESTRITA a ele (só a aba Saída · Fornecedores). Quem tem o "ver" já enxerga essa aba (ver SUB abaixo) */
  const GRUPOS = [
    { g: 'fundo', t: 'Fundo de Reserva', s: 'Fundo', ic: '💰', p: [
      { k: 'fundo.ver', t: 'Visualizar o relatório', d: 'Abrir o relatório e exportar Excel/PDF' },
      { k: 'fundo.publicar', t: 'Atualizar a base', d: 'Fazer o upload da planilha e publicar para todos' }] },
    { g: 'fat', t: 'Faturas Emitidas', s: 'Faturas', ic: '🧾', p: [
      { k: 'fat.ver', t: 'Visualizar o relatório', d: 'Ver as NFs, visualizar e baixar os arquivos (inclusive no Fundo de Reserva e no Contas a Receber)' },
      { k: 'fat.anexar', t: 'Anexar e corrigir NF', d: 'Anexar, editar e refaturar (corrigir) NF' },
      { k: 'fat.excluir', t: 'Excluir NF', d: 'Apaga a NF, o histórico e os arquivos' }] },
    { g: 'receber', t: 'Contas a Receber', s: 'Receber', ic: '💵', p: [
      { k: 'receber.ver', t: 'Visualizar o relatório', d: 'Ver o faturado, o recebido e o saldo a receber' },
      { k: 'receber.lancar', t: 'Registrar e editar recebimentos', d: 'Lançar o que o cliente pagou' },
      { k: 'receber.excluir', t: 'Excluir recebimentos', d: 'Apaga um recebimento lançado' }] },
    { g: 'reidi', t: 'REIDI', s: 'REIDI', ic: '🏗️', p: [
      { k: 'reidi.ver', t: 'Visualizar o relatório', d: 'Abrir o relatório e exportar' },
      { k: 'reidi.parametros', t: 'Alterar os parâmetros', d: 'Documento, data de referência, horizonte, saldo e responsável' }] },
    { g: 'lanc', t: 'Projeção REIDI', s: 'Projeção', ic: '📝', p: [
      { k: 'lanc.lancar', t: 'Acessar e lançar compras', d: 'Inclui compras; edita e exclui só as que ele mesmo lançou' }] },
    { g: 'fluxo', t: 'Programação Financeira Quadrimestral', s: 'Fluxo', ic: '📊', p: [
      { k: 'fluxo.ver', t: 'Visualizar o relatório', d: 'Abrir o relatório e exportar' },
      { k: 'fluxo.publicar', t: 'Atualizar a base e os parâmetros', d: 'Upload da planilha, saldos, entradas e aporte' }] },
    { g: 'dash', t: 'Dashboard Financeiro', s: 'Dashboard', ic: '📈', p: [
      { k: 'dash.ver', t: 'Visualizar o relatório', d: 'Abrir o dashboard (todas as abas) e exportar' },
      { k: 'dash.fornecedores', t: 'Somente a aba Saída · Fornecedores', d: 'Abre o dashboard só com a aba Saída · Fornecedores (sem entradas, saldos e investimentos). É uma alternativa a “Visualizar o relatório”', s: 'Dashboard · Fornec.' },
      { k: 'dash.publicar', t: 'Atualizar a base', d: 'Upload da planilha e publicação para todos' }] },
    { g: 'seg', t: 'Seguros', s: 'Seguros', ic: '🛡️', p: [
      { k: 'seg.ver', t: 'Visualizar o relatório', d: 'Ver as empresas, os tipos de seguro e os pagamentos; visualizar e baixar os comprovantes; exportar Excel' },
      { k: 'seg.lancar', t: 'Cadastrar e registrar', d: 'Cadastrar e editar empresas e tipos de seguro; registrar e editar pagamentos e anexar o comprovante' },
      { k: 'seg.excluir', t: 'Excluir', d: 'Excluir empresas (sem pagamentos) e pagamentos, com os comprovantes, e tipos de seguro da lista' }] }
  ];
  const TODAS = GRUPOS.flatMap(g => g.p.map(x => x.k)),
    /* quem recebe uma ação recebe junto o "ver" do mesmo relatório (igual a public.perm_fechamento) */
    DEP = { 'fundo.publicar': 'fundo.ver', 'fat.anexar': 'fat.ver', 'fat.excluir': 'fat.ver', 'receber.lancar': 'receber.ver', 'receber.excluir': 'receber.ver', 'reidi.parametros': 'reidi.ver', 'fluxo.publicar': 'fluxo.ver', 'dash.publicar': 'dash.ver', 'seg.lancar': 'seg.ver', 'seg.excluir': 'seg.ver' },
    /* permissões iniciais de cada perfil = o acesso que cada perfil sempre teve (igual a public.perm_padrao) */
    /* alternativa restrita → o "ver" que a substitui (igual a public.perm_fechamento): quem tem o "ver" (ou uma ação que o exige) não guarda a restrita */
    SUB = { 'dash.fornecedores': 'dash.ver' },
    /* o que se exclui na tela de Usuários (marcar um desmarca o outro): a restrita × o "ver" e as ações que dependem dele */
    EXC = (() => { const e = {}; Object.entries(SUB).forEach(([a, b]) => { const grupo = [b, ...Object.keys(DEP).filter(k => DEP[k] == b)]; e[a] = grupo.slice(); grupo.forEach(k => { (e[k] = e[k] || []).push(a) }) }); return e })(),
    MARCAR_TUDO = TODAS.filter(k => !SUB[k]),   /* "Marcar tudo" = acesso completo (sem a alternativa restrita) */
    PADRAO = {
      admin: TODAS,
      viewer: ['dash.ver', 'fat.ver', 'fluxo.ver', 'fundo.ver', 'reidi.ver'],
      lancador: ['lanc.lancar', 'reidi.ver'],
      faturamento: ['fat.anexar', 'fat.ver']
    },
    ROT = {}; GRUPOS.forEach(g => g.p.forEach(x => { ROT[x.k] = { t: x.t, g: g.t, ic: g.ic } }));
  let SET = new Set(), LEG = true, ADM = false;

  const conhecidas = l => (Array.isArray(l) ? l : []).filter(k => TODAS.includes(k)),
    ordem = s => TODAS.filter(k => s.has(k)),
    semSub = s => { Object.keys(SUB).forEach(a => { if (s.has(SUB[a])) s.delete(a) }); return s },   /* quem tem o "ver" não precisa da alternativa restrita (registro gravado fora do site) */
    /* acrescenta o "ver" de cada ação marcada; remove repetidas e fora do catálogo; devolve na ordem do catálogo */
    fecha = l => { const s = new Set(conhecidas(l)); s.forEach(k => { if (DEP[k]) s.add(DEP[k]) }); return ordem(semSub(s)) },
    padrao = papel => (PADRAO[papel] || []).slice(),
    /* o que a linha de public.perfis dá a esse usuário. Igual ao banco: administrador tem tudo; lista nula (usuário anterior ao permissoes.sql) = padrão do perfil */
    efetivas = u => !u ? [] : u.papel == 'admin' ? TODAS.slice() : Array.isArray(u.permissoes) ? ordem(semSub(new Set(conhecidas(u.permissoes)))) : padrao(u.papel),
    igual = (a, b) => { const x = ordem(new Set(conhecidas(a))), y = ordem(new Set(conhecidas(b))); return x.length == y.length && x.every((k, i) => k == y[i]) };

  /* carrega as permissões do usuário que acabou de entrar (linha de public.perfis). legado = o banco ainda não tem a coluna (permissoes.sql não rodou) */
  function carregar(perfil) {
    ADM = !!perfil && perfil.papel == 'admin'; LEG = !perfil || perfil.permissoes === undefined; SET = new Set(efetivas(perfil)); aplicar()
  }
  /* some com tudo que tem data-perm="chave" para quem não tem a chave (vale para o HTML fixo e para o gerado depois) */
  function aplicar() {
    let st = document.getElementById('perm-css');
    if (!st) { st = document.createElement('style'); st.id = 'perm-css'; document.head.appendChild(st) }
    st.textContent = TODAS.filter(k => !tem(k)).map(k => `[data-perm="${k}"]{display:none!important}`).join('')
  }
  const tem = k => ADM || SET.has(k),
    algum = (...ks) => ks.some(tem);
  /* grupos que a lista libera (tabela de Usuários): conta o grupo que tem o "ver" ou a alternativa restrita dele; s = rótulo curto (o da restrita quando é o único acesso do grupo) */
  const chips = e => GRUPOS.map(g => { const k0 = g.p[0].k; if (e.includes(k0)) return { s: g.s, t: g.t }; const alt = g.p.find(x => SUB[x.k] == k0 && e.includes(x.k)); return alt ? { s: alt.s || g.s, t: g.t + ' · ' + alt.t } : null }).filter(Boolean);
  /* erros de permissão do banco / da Edge Function em português */
  function erro(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), c = String((e && (e.code || e.status)) || '');
    if (/PGRST202|42883|could not find the function/i.test(m + ' ' + c)) return 'As permissões individuais ainda não foram ativadas no banco: execute supabase/permissoes.sql no Supabase (veja o COMO_ATUALIZAR.txt).';
    if (/row-level security|permission denied|not authorized|unauthorized/i.test(m)) return 'Você não tem permissão para esta ação. Se o administrador acabou de liberar o acesso, saia e entre de novo.';
    if (/Permiss[aã]o desconhecida/i.test(m) && /dash\.fornecedores/.test(m)) return 'O banco ainda não conhece a permissão “Somente a aba Saída · Fornecedores”: execute supabase/dashboard-fornecedores.sql no Supabase (veja o COMO_ATUALIZAR.txt).';
    if (/Permiss[aã]o desconhecida/i.test(m) && /seg\./.test(m)) return 'O banco ainda não conhece as permissões de Seguros: execute supabase/seguros.sql no Supabase (veja o COMO_ATUALIZAR.txt).';
    if (c == '42501' || /Sem permiss/i.test(m)) return m || 'Sem permissão.'; /* mensagens da função definir_permissoes já vêm em português */
    return m || 'Falha inesperada.'
  }
  return {
    GRUPOS, TODAS, DEP, SUB, EXC, MARCAR_TUDO, PADRAO, ROT, chips,
    tem, algum, carregar, aplicar, fecha, padrao, efetivas, igual, erro, rotulo: k => (ROT[k] || {}).t || k,
    get legado() { return LEG }, get admin() { return ADM }, get lista() { return ordem(SET) }
  }
})();
