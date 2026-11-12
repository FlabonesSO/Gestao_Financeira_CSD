/* Dados do "Seguros" no Supabase — usado pelo módulo js/modulos/seguros.js.
   • public.seguros_empresas   → cadastro: código, razão social completa, CNPJ (14 caracteres, numérico ou alfanumérico, único) e os TIPOS DE SEGURO sob responsabilidade da empresa.
     A empresa é cadastrada UMA vez; cada tipo de seguro dela vira uma LINHA na tela (empresa × tipo) e novos tipos são acrescentados à empresa já cadastrada
     (acrescentarTipos / retirarTipo). Um tipo que já tem pagamentos não pode ser retirado.
     "Inativa" = a empresa sai da lista de novos pagamentos, mas o histórico fica. Empresa com pagamentos não pode ser excluída.
     A OBSERVAÇÃO da empresa é POR TIPO DE SEGURO: cada linha (empresa × tipo) tem a sua, guardada em obs_tipos ({tipo: texto}); a de um tipo não aparece nos outros. A empresa SEM
     tipo guarda a dela em obs (a linha "nenhum tipo cadastrado"). Opcional: sem o supabase/seguros-obs-tipo.sql no banco vale a observação única por empresa de antes (obsOk = false).
     O VALOR TOTAL DO CONTRATO também é POR TIPO DE SEGURO: guardado em valor_contrato_tipos ({tipo: reais}). A tela mostra, em cada linha, o valor do contrato, o TOTAL PAGO (soma dos pagamentos
     realizados daquele tipo, lançados pelo financeiro em "Pagamentos realizados") e o SALDO A PAGAR (contrato − pago; negativo = pago a maior). Opcional: sem o supabase/seguros-valor-contrato.sql
     no banco a tela mostra só o total pago, com um aviso (vcOk = false).
   • public.seguros_pagamentos → pagamentos realizados: empresa (escolhida na lista do cadastro), tipo de seguro (opcional, um dos tipos da empresa), data, valor pago,
     número da parcela, observação e o COMPROVANTE (PDF ou imagem, até 10 MB). Quem lançou/alterou e quando é carimbado pelo banco; cada inclusão/alteração/exclusão vai
     para a Auditoria (gatilho no banco).
   • public.seguros_tipos      → a LISTA de tipos de seguro oferecida nas janelas de cadastro (a mesma para todos os usuários). Cada tipo que nenhuma empresa usa pode ser excluído
     da lista (🗑); um tipo em uso por alguma empresa não sai. Opcional: sem esta tabela (supabase/seguros-tipos.sql ainda não rodado) a lista é a antiga — os tipos em uso
     + as 8 sugestões fixas (SUG) — e não há exclusão.
   • Storage · bucket PRIVADO "seguros-comprovantes" → os arquivos. O arquivo enviado NUNCA é sobrescrito: ao substituir o comprovante, o anterior continua guardado
     (coluna comprovantes_anteriores, preenchida pelo banco) e pode ser visualizado/baixado.
   Quem pode (permissões por usuário, aplicadas no banco por RLS): seg.ver vê, visualiza e baixa · seg.lancar cadastra/edita empresas e registra/edita pagamentos e comprovantes
   (e acrescenta tipos à lista) · seg.excluir exclui empresas (sem pagamentos), pagamentos e tipos da lista. Instalação: supabase/seguros.sql (+ seguros-linhas.sql, seguros-tipos.sql,
   seguros-obs-tipo.sql e seguros-valor-contrato.sql).
   Depende de supabase.js (sb_) e app.js (saveAs). */
const SEG = {
  TE: 'seguros_empresas', TP: 'seguros_pagamentos', TT: 'seguros_tipos', BK: 'seguros-comprovantes', MAXB: 10 * 1024 * 1024,
  EXT: { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' },
  /* sugestões da lista de tipos QUANDO O BANCO AINDA NÃO TEM A LISTA (seguros-tipos.sql): são as mesmas 8 que a carga inicial do banco grava (o cadastro aceita qualquer outro tipo digitado) */
  SUG: ['Riscos de Engenharia', 'Responsabilidade Civil', 'Garantia (Performance Bond)', 'Vida em Grupo', 'Patrimonial', 'Frota / Automóvel', 'Equipamentos', 'Transporte de Cargas'],
  /* CAT = a lista do banco [{id, nome}] · catOk = a tabela existe e foi lida · catFalta = ela não existe (SQL não rodado) */
  E: [], P: [], CAT: [], catOk: false, catFalta: false, obsOk: false, vcOk: false, ok: false, erro: '', ouv: [], _ch: null, _ch2: null, _busy: false, _again: false,
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  ext(n) { const m = String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : '' },
  uid() { const a = new Uint8Array(16); (self.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('') },
  nomeSeguro(n) { return String(n || 'comprovante').replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(-150) || 'comprovante' },
  tam(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB' },
  c(n) { return Math.round((+n || 0) * 100) },
  hoje() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) },
  /* ---------- CNPJ: numérico e alfanumérico (12 primeiras posições com letras e números; cada caractere vale o código ASCII − 48; módulo 11) ---------- */
  cnpjNorm(t) { return String(t == null ? '' : t).toUpperCase().replace(/[^0-9A-Z]/g, '') },
  cnpjOk(t) {
    const c = this.cnpjNorm(t); if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
    const dv = (b, p) => { let s = 0; for (let i = 0; i < p.length; i++) s += (b.charCodeAt(i) - 48) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r },
      d1 = dv(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), d2 = dv(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return c.slice(12) == '' + d1 + d2
  },
  /* máscara enquanto digita: 00.000.000/0000-00 (os 2 últimos caracteres só aceitam número) */
  cnpjMasc(t) {
    let c = this.cnpjNorm(t).slice(0, 14); c = c.slice(0, 12) + c.slice(12).replace(/[^0-9]/g, '');
    let s = c.slice(0, 2); if (c.length > 2) s += '.' + c.slice(2, 5); if (c.length > 5) s += '.' + c.slice(5, 8); if (c.length > 8) s += '/' + c.slice(8, 12); if (c.length > 12) s += '-' + c.slice(12, 14); return s
  },
  cnpjFmt(t) { const c = this.cnpjNorm(t); return c.length == 14 ? this.cnpjMasc(c) : String(t == null ? '' : t) },
  /* ---------- tipos de seguro: sem espaços sobrando, sem vazios e sem repetidos (maiúsculas/minúsculas não contam; fica a primeira grafia) ---------- */
  /* chave de comparação de um tipo: sem espaços sobrando e sem diferenciar maiúsculas/minúsculas (a mesma regra do banco) */
  chave(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().toLowerCase() },
  tiposNorm(l) {
    const vistos = new Set(), out = [];
    (Array.isArray(l) ? l : []).forEach(x => { const t = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(), k = this.chave(t); if (t && !vistos.has(k)) { vistos.add(k); out.push(t) } });
    return out
  },
  /* todos os tipos que as janelas oferecem, sem repetir: primeiro os JÁ USADOS por alguma empresa (em ordem alfabética), depois os da LISTA DO BANCO que ainda ninguém usa (também em ordem
     alfabética) e, no fim, os extras informados (digitados na janela, ainda não gravados). Sem a tabela da lista no banco, vale a lista antiga: usados + as 8 sugestões fixas (SUG) */
  tiposLista(extra) {
    const ord = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }), usados = this.tiposNorm([].concat(...this.E.map(e => e.tipos))).sort(ord);
    if (!this.catOk) return this.tiposNorm([...usados, ...this.SUG, ...(extra || [])]);
    return this.tiposNorm([...usados, ...this.tiposNorm(this.CAT.map(r => r.nome)).sort(ord), ...(extra || [])])
  },
  /* quantas empresas têm o tipo (é o que decide se ele pode ser excluído da lista: só sai o que nenhuma empresa usa) e a linha dele na lista do banco (null se não estiver nela) */
  tipoUso(t) { const k = this.chave(t); return k ? this.E.filter(e => e.tipos.some(x => this.chave(x) == k)).length : 0 },
  tipoCat(t) { const k = this.chave(t); return k ? this.CAT.find(r => this.chave(r.nome) == k) || null : null },
  /* a coluna obs_tipos não existe (seguros-obs-tipo.sql ainda não rodado) */
  faltaColuna(e) { return /42703|PGRST204|column .* does not exist|could not find the .* column/i.test(String((e && (e.message || e.error_description || e.error)) || e || '') + ' ' + String((e && (e.code || e.statusCode)) || '')) },
  faltaTabela(e) { return /PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(String((e && (e.message || e.error_description || e.error)) || e || '') + ' ' + String((e && (e.code || e.statusCode)) || '')) },
  /* mensagens do banco / armazenamento em português */
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), cd = String((e && (e.code || e.statusCode)) || ''), t = m + ' ' + cd;
    if (/obs_tipos/i.test(m) && this.faltaColuna(e)) return 'O banco ainda não guarda a observação por tipo de seguro: execute supabase/seguros-obs-tipo.sql no Supabase.';
    if (/seguros_empresas_obs_tipos_check/i.test(m)) return 'Cada observação por tipo de seguro pode ter no máximo 300 caracteres.';
    if (/valor_contrato_tipos/i.test(m) && this.faltaColuna(e)) return 'O banco ainda não guarda o valor do contrato por tipo de seguro: execute supabase/seguros-valor-contrato.sql no Supabase.';
    if (/seguros_empresas_valor_contrato_tipos_check/i.test(m)) return 'O valor do contrato de cada tipo de seguro deve ser em reais, maior que zero e com no máximo 2 casas decimais.';
    if (/PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(t)) return 'O módulo Seguros ainda não foi instalado no banco: execute supabase/seguros.sql no Supabase.';
    if (/bucket not found/i.test(m)) return 'O armazenamento dos comprovantes ainda não foi criado. Execute supabase/seguros.sql no Supabase.';
    if (/seguros_tipos_nome_uq/i.test(m)) return 'Este tipo de seguro já está na lista.';
    if (/seguros_tipos_nome_check/i.test(m)) return 'O tipo de seguro deve ter de 1 a 60 caracteres.';
    if (/seguros_empresas_cnpj_uq/i.test(m)) return 'Já existe uma empresa cadastrada com este CNPJ.';
    if (/seguros_empresas_codigo_uq/i.test(m)) return 'Já existe uma empresa com este código.';
    if (/seguros_empresas_cnpj_check/i.test(m)) return 'CNPJ inválido: confira os números (os dígitos verificadores não conferem).';
    if (/seguros_empresas_codigo_check/i.test(m)) return 'O código deve ter de 1 a 20 caracteres.';
    if (/seguros_empresas_razao_social_check/i.test(m)) return 'A razão social deve ter de 3 a 200 caracteres.';
    if (/seguros_empresas_tipos_check/i.test(m)) return 'Tipos de seguro: no máximo 20 por empresa, cada um com até 60 caracteres.';
    if (/obs_check/i.test(m)) return 'A observação passa de 300 caracteres.';
    if (/seguros_pagamentos_valor_check/i.test(m)) return 'O valor pago precisa ser maior que zero.';
    if (/seguros_pagamentos_parcela_check/i.test(m)) return 'O número da parcela deve estar entre 1 e 999.';
    if (/seguros_pagamentos_data_pagamento_check/i.test(m)) return 'Data do pagamento inválida.';
    if (/seguros_pagamentos_empresa_id_fkey/i.test(m)) return 'Esta empresa tem pagamentos registrados e não pode ser excluída. Marque-a como Inativa para tirá-la da lista de novos pagamentos.';
    if (/est[aá] inativa|n[aã]o pode ser futura|n[aã]o est[aá] entre os tipos|Empresa n[aã]o encontrada|tem pagamentos registrados e n[aã]o pode ser retirado/i.test(m)) return m;   /* o banco já responde em português */
    if (/Permiss[aã]o desconhecida/i.test(m) && /seg\./.test(m)) return 'O banco ainda não conhece as permissões de Seguros: execute supabase/seguros.sql no Supabase.';
    if (/row-level security|42501|permission denied|not authorized|unauthorized|Sem permiss/i.test(t)) return 'Sem permissão para esta operação.';
    if (/mime type|not supported|invalid_mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (/maximum allowed size|too large|payload/i.test(m)) return 'O arquivo passa do limite de 10 MB.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    return m || 'Falha inesperada.'
  },
  validar(file) {
    if (!file) return 'Selecione o arquivo do comprovante.';
    if (!this.EXT[this.ext(file.name)]) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (!file.size) return 'O arquivo está vazio.';
    if (file.size > this.MAXB) return 'O arquivo tem ' + this.tam(file.size) + ' e passa do limite de 10 MB.';
    return ''
  },
  /* ---------- linha do banco → formato usado pelo módulo ---------- */
  /* obs_tipos do banco ({tipo: texto}) → { chave do tipo: texto } (só textos não vazios) */
  obsLer(j) {
    const o = {}; if (j && typeof j == 'object' && !Array.isArray(j)) Object.keys(j).forEach(k => { const v = typeof j[k] == 'string' ? j[k].trim() : '', c = this.chave(k); if (v && c) o[c] = o[c] ? o[c] + ' · ' + v : v });
    return o
  },
  /* valor_contrato_tipos do banco ({tipo: reais}) → { chave do tipo: reais } (só números maiores que zero) */
  vcLer(j) {
    const o = {}; if (j && typeof j == 'object' && !Array.isArray(j)) Object.keys(j).forEach(k => { const v = j[k], c = this.chave(k); if (typeof v == 'number' && isFinite(v) && v > 0 && c && !(c in o)) o[c] = v });
    return o
  },
  /* o valor do contrato do tipo t da empresa e (reais), ou null se o tipo não tem valor informado */
  vcDe(e, t) { const v = e && e.vcT ? e.vcT[this.chave(t)] : undefined; return typeof v == 'number' ? v : null },
  /* { tipo: reais } só com os tipos dados (na grafia deles) que têm valor > 0, arredondado a centavos · m = { tipo ou chave do tipo: número } */
  vcMap(m, tipos) {
    const ix = {}; if (m && typeof m == 'object') Object.keys(m).forEach(k => { ix[this.chave(k)] = m[k] });
    const o = {}; (tipos || []).forEach(t => { const v = ix[this.chave(t)]; if (typeof v == 'number' && isFinite(v) && v > 0) o[t] = Math.round(v * 100) / 100 }); return o
  },
  /* confere os valores de contrato dados (m = { tipo ou chave do tipo: número | NaN | null }) para os tipos informados → texto do erro ou '' (null/undefined = tipo sem valor: vale) */
  vcErro(m, tipos) {
    if (!m || typeof m != 'object') return '';
    const ix = {}; Object.keys(m).forEach(k => { ix[this.chave(k)] = m[k] });
    for (const t of tipos || []) {
      const v = ix[this.chave(t)]; if (v == null) continue;
      if (typeof v != 'number' || !isFinite(v)) return 'O valor do contrato do tipo "' + t + '" é inválido: informe um valor em reais (ex.: 1.250.000,00).';
      if (v <= 0) return 'O valor do contrato do tipo "' + t + '" deve ser maior que zero (ou deixe o campo em branco).';
      if (v >= 1e13) return 'O valor do contrato do tipo "' + t + '" é grande demais.'
    }
    return ''
  },
  /* junta dois textos de observação: o segundo vai depois do primeiro (' · '), sem repetir o que já estiver no primeiro */
  junta(a, b) { a = String(a == null ? '' : a).trim(); b = String(b == null ? '' : b).trim(); return !a ? b : !b || a.includes(b) ? a : a + ' · ' + b },
  /* a observação do tipo t da empresa e ('' se não tem) */
  obsDe(e, t) { return (e && e.obsT && e.obsT[this.chave(t)]) || '' },
  /* { tipo: texto } só com os tipos dados (na grafia deles) e textos não vazios · m = { tipo ou chave do tipo: texto } */
  obsMap(m, tipos) {
    const ix = {}; if (m && typeof m == 'object') Object.keys(m).forEach(k => { ix[this.chave(k)] = m[k] });
    const o = {}; (tipos || []).forEach(t => { const v = String(ix[this.chave(t)] == null ? '' : ix[this.chave(t)]).trim(); if (v) o[t] = v }); return o
  },
  /* o que vai para o banco: { obs, om } — empresa COM tipo não tem observação solta (a que vier passa para o primeiro tipo, como o banco faz); sem tipo, vale a observação da empresa */
  obsFinal(x, tipos) {
    const om = this.obsMap(x.obsT, tipos), solta = String(x.obs || '').trim();
    if (tipos.length && solta) om[tipos[0]] = this.junta(om[tipos[0]], solta);
    return { obs: tipos.length ? '' : solta, om }
  },
  deE(r) {
    const tipos = this.tiposNorm(r.tipos); let obs = r.obs || '';
    const obsT = this.obsOk ? this.obsLer(r.obs_tipos) : {}, vcT = this.vcOk ? this.vcLer(r.valor_contrato_tipos) : {};
    /* nada fica escondido: observação solta numa empresa que já tem tipo (dado ainda não migrado) aparece no primeiro tipo */
    if (this.obsOk && tipos.length && obs.trim()) { const k = this.chave(tipos[0]); obsT[k] = this.junta(obsT[k], obs); obs = '' }
    return { id: r.id, cod: String(r.codigo == null ? '' : r.codigo).trim(), razao: String(r.razao_social == null ? '' : r.razao_social).trim(), cnpj: this.cnpjNorm(r.cnpj), tipos, ativo: r.ativo !== false, obs, obsT, vcT,
      cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' }
  },
  deP(r) {
    const h = Array.isArray(r.comprovantes_anteriores) ? r.comprovantes_anteriores : [];
    return { id: r.id, emp: r.empresa_id, tipo: r.tipo || '', dp: String(r.data_pagamento).slice(0, 10), v: +r.valor || 0, parc: +r.parcela || 0, obs: r.obs || '',
      path: r.comprovante_path || '', nome: r.comprovante_nome || '', ctipo: r.comprovante_tipo || '', bytes: +r.comprovante_bytes || 0, cem: r.comprovante_em || '', cpor: r.comprovante_por_nome || '',
      ant: h.filter(x => x && x.path).map(x => ({ path: x.path, nome: x.nome || 'comprovante', tipo: x.tipo || '', bytes: +x.bytes || 0, em: x.anexado_em || '', por: x.anexado_por || '', sub: x.substituido_por || '', sem: x.substituido_em || '' })),
      cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' }
  },
  /* ---------- carregar ---------- */
  async carregar() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const [a, b, t] = await Promise.all([c.from(this.TE).select('*').order('codigo', { ascending: true }), c.from(this.TP).select('*').order('data_pagamento', { ascending: false }).order('criado_em', { ascending: false }),
        c.from(this.TT).select('id,nome').order('nome', { ascending: true })]);
      if (a.error || b.error) { this.ok = false; this.erro = this.msg(a.error || b.error); this.avisa(); throw new Error(this.erro) }
      await this.detectaObs(c, a.data || []); await this.detectaVc(c, a.data || []);
      this.E = (a.data || []).map(r => this.deE(r)).sort((x, y) => x.cod.localeCompare(y.cod, 'pt-BR', { numeric: true, sensitivity: 'base' }));
      this.P = (b.data || []).map(r => this.deP(r)); this.ok = true; this.erro = '';
      /* a lista de tipos é opcional (seguros-tipos.sql): sem a tabela o módulo funciona como antes. Um erro passageiro, com a lista já carregada, mantém a que a tela já tinha */
      if (!t.error) { this.catOk = true; this.catFalta = false; this.CAT = (t.data || []).map(r => ({ id: r.id, nome: String(r.nome == null ? '' : r.nome).replace(/\s+/g, ' ').trim() })).filter(r => r.nome) }
      else if (this.faltaTabela(t.error) || !this.catOk) { this.catOk = false; this.catFalta = this.faltaTabela(t.error); this.CAT = [] }
      this.iniciar(); this.avisa()
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  /* a observação por tipo é opcional (seguros-obs-tipo.sql): com empresas na tela basta ver se a linha traz a coluna; sem nenhuma, pergunta ao banco. Um erro passageiro mantém o que já se sabia */
  async detectaObs(c, rows) {
    if (rows.length) this.obsOk = 'obs_tipos' in rows[0];
    else { try { const p = await c.from(this.TE).select('id,obs_tipos').limit(1); if (!p.error) this.obsOk = true; else if (this.faltaColuna(p.error)) this.obsOk = false } catch (e) { } }
  },
  /* o valor do contrato por tipo também é opcional (seguros-valor-contrato.sql): mesma regra da observação por tipo */
  async detectaVc(c, rows) {
    if (rows.length) this.vcOk = 'valor_contrato_tipos' in rows[0];
    else { try { const p = await c.from(this.TE).select('id,valor_contrato_tipos').limit(1); if (!p.error) this.vcOk = true; else if (this.faltaColuna(p.error)) this.vcOk = false } catch (e) { } }
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  on(fn) { this.ouv.push({ fn }) },
  /* atualização em tempo real: outro usuário cadastrou/alterou/excluiu empresa ou pagamento → recarrega (o RLS decide o que chega) */
  iniciar() {
    const c = this.cli(); if (!c) return; const f = () => this.carregar().catch(() => { });
    if (!this._ch) { try { this._ch = c.channel('seguros').on('postgres_changes', { event: '*', schema: 'public', table: this.TE }, f).on('postgres_changes', { event: '*', schema: 'public', table: this.TP }, f).subscribe() } catch (e) { } }
    /* a lista de tipos tem o PRÓPRIO canal: se a tabela ainda não estiver no tempo real do banco, só ela fica de fora (empresas e pagamentos não são afetados) */
    if (this.catOk && !this._ch2) { try { this._ch2 = c.channel('seguros_tipos').on('postgres_changes', { event: '*', schema: 'public', table: this.TT }, f).subscribe() } catch (e) { } }
  },
  empresa(id) { return this.E.find(e => e.id == id) || null },
  /* por empresa: nº de pagamentos, total pago (reais), último pagamento e quantos estão sem comprovante (L = lista de pagamentos; sem ela, todos) */
  agrega(L) {
    const o = {}; (L || this.P).forEach(p => { const a = o[p.emp] = o[p.emp] || { n: 0, c: 0, ult: '', sem: 0 }; a.n++; a.c += this.c(p.v); if (p.dp > a.ult) a.ult = p.dp; if (!p.path) a.sem++ });
    Object.values(o).forEach(a => { a.tot = a.c / 100 }); return o
  },
  /* ---------- LINHAS da tela: uma por tipo de seguro de cada empresa (empresa × tipo) ----------
     linhas(e, pags) → as linhas de UMA empresa (pags = os pagamentos DELA). Cada linha: { kind, tipo, pags, n, c (centavos), tot (reais), ult, sem, obs, vc, vcC, saldo, saldoC }
       'tipo'  → um tipo cadastrado na empresa (inclusive sem nenhum pagamento ainda)
       'vazio' → a empresa não tem nenhum tipo cadastrado (carrega os pagamentos sem tipo, se houver)
       'sem'   → pagamentos sem tipo informado, quando a empresa tem tipos cadastrados (só aparece se houver)
       'velho' → pagamentos de um tipo que já não consta no cadastro da empresa (acontecia antes da trava do banco; só aparece se houver)
     Todo pagamento cai em exatamente UMA linha da própria empresa: a soma das linhas é sempre igual ao total da empresa.
     Cada linha traz a SUA observação (obs): a do tipo ('tipo') ou a da empresa sem tipo ('vazio'); as linhas 'sem' e 'velho' não têm.
     Só a linha 'tipo' pode ter VALOR DO CONTRATO (vc, em reais; vcC em centavos) — null quando o tipo não tem valor informado; o SALDO A PAGAR (saldo / saldoC) é contrato − total pago
     (null sem contrato; negativo = pago a maior). O total pago de uma linha é a soma dos pagamentos dela: pagamento SEM tipo não abate o contrato de nenhum tipo. */
  linhas(e, pags) {
    const por = new Map(); (pags || []).forEach(p => { const k = this.chave(p.tipo); if (!por.has(k)) por.set(k, []); por.get(k).push(p) });
    const mk = (kind, tipo, L, obs, vc) => {
      let c = 0, ult = '', sem = 0; L.forEach(p => { c += this.c(p.v); if (p.dp > ult) ult = p.dp; if (!p.path) sem++ });
      const vcC = typeof vc == 'number' ? this.c(vc) : null, saldoC = vcC == null ? null : vcC - c;
      return { kind, tipo, pags: L, n: L.length, c, tot: c / 100, ult, sem, obs: obs || '', vc: vcC == null ? null : vcC / 100, vcC, saldo: saldoC == null ? null : saldoC / 100, saldoC }
    };
    const out = [], uso = new Set(), semTipo = por.get('') || [];
    e.tipos.forEach(t => { const k = this.chave(t); uso.add(k); out.push(mk('tipo', t, por.get(k) || [], this.obsDe(e, t), this.vcDe(e, t))) });
    if (!e.tipos.length) out.push(mk('vazio', '', semTipo, e.obs)); else if (semTipo.length) out.push(mk('sem', '', semTipo));
    por.forEach((L, k) => { if (k && !uso.has(k)) out.push(mk('velho', L[0].tipo, L)) });
    return out
  },
  /* todas as linhas (na ordem das empresas); L = lista de pagamentos considerada (sem ela, todos). Cada linha traz a empresa em .e */
  linhasTodas(L) {
    const pm = new Map(); (L || this.P).forEach(p => { if (!pm.has(p.emp)) pm.set(p.emp, []); pm.get(p.emp).push(p) });
    return [].concat(...this.E.map(e => this.linhas(e, pm.get(e.id) || []).map(l => ({ ...l, e }))))
  },
  /* totais de um conjunto de linhas (as da tela): contrato, total pago e saldo a pagar (centavos). O saldo e o "pago dos que têm contrato" só contam as linhas COM valor de contrato; o total pago
     (pagoC) conta TODAS as linhas — pagamento de tipo sem valor de contrato, sem tipo ou de tipo antigo também é dinheiro pago.
     { ctrC, pagoC, pagoCtrC, saldoC (= ctrC − pagoCtrC, soma dos saldos com sinal), pendC (soma só dos saldos positivos = o que ainda falta pagar), dentroC (pago até o limite de cada contrato),
       nCtr (linhas com contrato), nSem (tipos SEM valor), nMais (pagos a maior), nQuit (quitados), nTipos (linhas de tipo) } */
  resumo(L) {
    const r = { ctrC: 0, pagoC: 0, pagoCtrC: 0, saldoC: 0, pendC: 0, dentroC: 0, nCtr: 0, nSem: 0, nMais: 0, nQuit: 0, nTipos: 0 };
    (L || []).forEach(l => {
      r.pagoC += l.c; if (l.kind == 'tipo') r.nTipos++;
      if (l.vcC == null) { if (l.kind == 'tipo') r.nSem++; return }
      r.nCtr++; r.ctrC += l.vcC; r.pagoCtrC += l.c; r.saldoC += l.saldoC; r.dentroC += Math.min(l.c, l.vcC);
      if (l.saldoC < 0) r.nMais++; else if (l.saldoC == 0) r.nQuit++; else r.pendC += l.saldoC
    });
    return r
  },
  /* ---------- validação (o banco confere de novo: nada aqui é a única barreira) ---------- */
  validaEmpresa(x, id) {
    const cod = String(x.cod || '').trim(), razao = String(x.razao || '').replace(/\s+/g, ' ').trim(), cnpj = this.cnpjNorm(x.cnpj), tipos = this.tiposNorm(x.tipos);
    if (!cod) return 'Informe o código da empresa.';
    if (cod.length > 20) return 'O código pode ter no máximo 20 caracteres.';
    if (!razao) return 'Informe a razão social completa.';
    if (razao.length < 3) return 'A razão social deve ter ao menos 3 caracteres.';
    if (razao.length > 200) return 'A razão social passa de 200 caracteres.';
    if (!cnpj) return 'Informe o CNPJ.';
    if (!this.cnpjOk(cnpj)) return 'CNPJ inválido: confira os números (os dígitos verificadores não conferem).';
    if (tipos.length > 20) return 'No máximo 20 tipos de seguro por empresa.';
    if (tipos.some(t => t.length > 60)) return 'Cada tipo de seguro pode ter no máximo 60 caracteres.';
    if (String(x.obs || '').length > 300) return 'A observação passa de 300 caracteres.';
    if (this.obsOk) { const f = this.obsFinal(x, tipos); for (const t of tipos) if ((f.om[t] || '').length > 300) return 'A observação do tipo "' + t + '" passa de 300 caracteres.' }
    if (this.vcOk) { const ev = this.vcErro(x.vcT, tipos); if (ev) return ev }
    /* ao CADASTRAR uma empresa que já existe, a saída é acrescentar o tipo de seguro à que já está cadastrada (cada tipo vira uma linha) */
    const dica = id ? '' : ' Para incluir outro tipo de seguro dessa empresa, use “＋ Tipo de seguro”.';
    const d1 = this.E.find(e => e.id != id && e.cod.toLowerCase() == cod.toLowerCase()); if (d1) return 'O código "' + cod + '" já está cadastrado para ' + d1.razao + '.' + dica;
    const d2 = this.E.find(e => e.id != id && e.cnpj == cnpj); if (d2) return 'Este CNPJ já está cadastrado para ' + d2.cod + ' · ' + d2.razao + '.' + dica;
    const ret = this.tipoRetirado(id, tipos); if (ret) return ret;
    return ''
  },
  /* na edição de uma empresa: algum tipo que ela JÁ TEM com pagamentos ficou de fora da nova lista? (o banco também recusa; aqui o aviso vem antes, na própria janela) */
  tipoRetirado(id, tipos) {
    const e = id ? this.empresa(id) : null; if (!e) return '';
    const fica = new Set(this.tiposNorm(tipos).map(t => this.chave(t)));
    for (const t of e.tipos) {
      if (fica.has(this.chave(t))) continue;
      const n = this.P.filter(p => p.emp == id && this.chave(p.tipo) == this.chave(t)).length;
      if (n) return 'O tipo de seguro "' + t + '" tem ' + n + (n == 1 ? ' pagamento registrado' : ' pagamentos registrados') + ' e não pode ser retirado da empresa ' + e.cod + '. Altere ou exclua esses pagamentos antes.'
    }
    return ''
  },
  validaPagamento(x, id) {
    const e = this.empresa(x.emp), a = id ? this.P.find(r => r.id == id) : null;
    if (!e) return 'Escolha a empresa na lista (ela traz as empresas cadastradas).';
    if (!e.ativo && !(a && a.emp == e.id)) return 'A empresa ' + e.cod + ' está inativa: reative-a no cadastro antes de registrar pagamentos.';
    const tipo = String(x.tipo || '').trim();
    if (tipo && !(a && a.emp == e.id && a.tipo == tipo) && !e.tipos.some(t => t.toLowerCase() == tipo.toLowerCase())) return 'O tipo de seguro "' + tipo + '" não está entre os tipos da empresa ' + e.cod + '.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dp || '') || isNaN(new Date(x.dp + 'T12:00:00Z')) || x.dp < '2000-01-01') return 'Informe a data do pagamento.';
    if (x.dp > this.hoje()) return 'A data do pagamento não pode ser futura.';
    if (typeof x.v != 'number' || !isFinite(x.v) || x.v <= 0 || x.v >= 1e13) return 'Informe o valor pago (maior que zero).';
    if (!Number.isInteger(x.parc) || x.parc < 1 || x.parc > 999) return 'Informe o número da parcela (de 1 a 999).';
    if (String(x.obs || '').length > 300) return 'A observação passa de 300 caracteres.';
    if (x.file) { const v = this.validar(x.file); if (v) return v }
    return ''
  },
  /* ---------- empresas ---------- */
  /* x.obsT = { tipo ou chave do tipo: observação } (uma por tipo) · x.obs = observação da empresa SEM tipo. Sem o seguros-obs-tipo.sql no banco só existe a observação única (obs)
     x.vcT = { tipo ou chave do tipo: valor do contrato em reais } (um por tipo; sem valor = tipo sem contrato informado). Sem o seguros-valor-contrato.sql no banco o valor não é enviado */
  camposE(x) {
    const tipos = this.tiposNorm(x.tipos), c = { codigo: String(x.cod).trim(), razao_social: String(x.razao).replace(/\s+/g, ' ').trim(), cnpj: this.cnpjNorm(x.cnpj), tipos, ativo: x.ativo !== false, obs: String(x.obs || '').trim() };
    if (this.obsOk) { const f = this.obsFinal(x, tipos); c.obs = f.obs; c.obs_tipos = f.om }
    if (this.vcOk) c.valor_contrato_tipos = this.vcMap(x.vcT, tipos);
    return c
  },
  async salvarEmpresa(id, x) {
    const er = this.validaEmpresa(x, id); if (er) throw new Error(er);
    const c = this.cli(), campos = this.camposE(x);
    if (!id) { const r = await c.from(this.TE).insert(campos).select().single(); if (r.error) throw new Error(this.msg(r.error)); await this.registrarTipos(campos.tipos); await this.carregar(); return this.deE(r.data) }
    const r = await c.from(this.TE).update(campos).eq('id', id).select();
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não alterei: a empresa foi excluída por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.registrarTipos(campos.tipos); await this.carregar(); return this.deE(r.data[0])
  },
  /* ---------- a LISTA de tipos de seguro (public.seguros_tipos) ----------
     registrarTipos: depois de salvar uma empresa, os tipos que ela passou a ter e que ainda não estão na lista (digitados em "Outro tipo") entram nela, para as próximas empresas.
       Melhor esforço: se falhar, o tipo continua valendo na empresa e aparece nas listas enquanto alguma empresa o usar. Repetido (outra pessoa acabou de incluir) não é erro.
     excluirTipoLista: tira da lista um tipo que NENHUMA empresa usa (a tela só oferece o 🗑 nesses; o banco registra na Auditoria). Não mexe em empresa nem em pagamento. */
  async registrarTipos(nomes) {
    if (!this.catOk) return false; const c = this.cli(); if (!c) return false;
    const tem = new Set(this.CAT.map(r => this.chave(r.nome))), novos = this.tiposNorm(nomes).filter(t => t.length <= 60 && !tem.has(this.chave(t)));
    let gravou = false;
    for (const t of novos) { try { const r = await c.from(this.TT).insert({ nome: t }); if (!r.error) gravou = true } catch (e) { } }
    return gravou
  },
  async excluirTipoLista(nome) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (!this.catOk) throw new Error(this.catFalta ? 'A lista de tipos ainda não foi instalada no banco: execute supabase/seguros-tipos.sql no Supabase.' : 'Não consegui ler a lista de tipos agora. Atualize a tela e tente de novo.');
    const n = this.tipoUso(nome);
    if (n) throw new Error('O tipo "' + nome + '" está em uso por ' + (n == 1 ? '1 empresa' : n + ' empresas') + ' e não pode ser excluído da lista. Retire-o dessas empresas antes.');
    const lin = this.tipoCat(nome); if (!lin) { await this.carregar().catch(() => { }); return false }   /* já tinha saído da lista */
    const r = await c.from(this.TT).delete().eq('id', lin.id).select();
    if (r.error) throw new Error(this.faltaTabela(r.error) ? 'A lista de tipos não foi encontrada no banco: execute supabase/seguros-tipos.sql no Supabase.' : this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o tipo já tinha sido excluído da lista por outra pessoa ou você não tem permissão para excluir. A tela foi atualizada.') }
    await this.carregar(); return true
  },
  /* ---------- tipos de seguro de uma empresa JÁ cadastrada: acrescentar (cada tipo novo vira uma linha na tela) e retirar ----------
     Só a coluna "tipos" (e, quando entram observações ou valores de contrato dos tipos novos, "obs_tipos" / "valor_contrato_tipos") é gravada, a partir de uma leitura NOVA da empresa no banco (não da cópia da tela): assim não se apaga o que outra pessoa acrescentou há pouco.
     A gravação só vale se a empresa não mudou nesse intervalo (compara "atualizado_em"); se mudou, lê de novo e refaz (até 3 vezes). */
  async _tipos(id, fn) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    for (let k = 0; k < 3; k++) {
      const a = await c.from(this.TE).select('*').eq('id', id).maybeSingle();
      if (a.error) throw new Error(this.msg(a.error));
      if (!a.data) { await this.carregar().catch(() => { }); throw new Error('A empresa não foi encontrada: ela foi excluída por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
      const antes = this.deE(a.data); let res;
      try { res = fn(antes) } catch (e) { await this.carregar().catch(() => { }); throw e }   /* fn confere o pedido contra a empresa como ela está AGORA e devolve a nova lista de tipos — ou { tipos, obsT, vcT } quando também entram observações / valores de contrato — (ou lança o motivo); a tela é atualizada */
      const tipos = Array.isArray(res) ? res : res.tipos, campos = { tipos };
      if (!Array.isArray(res) && res.obsT && this.obsOk) campos.obs_tipos = this.obsMap(res.obsT, tipos);
      if (!Array.isArray(res) && res.vcT && this.vcOk) campos.valor_contrato_tipos = this.vcMap(res.vcT, tipos);
      const r = await c.from(this.TE).update(campos).eq('id', id).eq('atualizado_em', a.data.atualizado_em).select();
      if (r.error) throw new Error(this.msg(r.error));
      if (r.data && r.data.length) { await this.carregar(); return { antes, depois: this.deE(r.data[0]) } }
      /* nenhuma linha gravada: sem permissão (a linha não mudou) ou outra pessoa alterou a empresa no meio do caminho (a próxima volta lê a versão nova) */
      const b = await c.from(this.TE).select('atualizado_em').eq('id', id).maybeSingle();
      if (b.data && b.data.atualizado_em == a.data.atualizado_em) throw new Error('Sem permissão para alterar os tipos de seguro desta empresa.')
    }
    await this.carregar().catch(() => { });
    throw new Error('Não consegui gravar: a empresa foi alterada por outra pessoa ao mesmo tempo. A tela foi atualizada — confira e tente de novo.')
  },
  /* acrescenta tipos à empresa → { antes, depois, novos } (novos = os que de fato entraram; os que a empresa já tinha são ignorados)
     notas = { tipo ou chave do tipo: observação } e valores = { tipo ou chave do tipo: valor do contrato (reais) } dos tipos novos (opcionais): cada tipo novo já nasce com a sua observação e o seu valor */
  async acrescentarTipos(id, tipos, notas, valores) {
    const add = this.tiposNorm(tipos); if (!add.length) throw new Error('Informe ao menos um tipo de seguro.');
    if (add.some(t => t.length > 60)) throw new Error('Cada tipo de seguro pode ter no máximo 60 caracteres.');
    const nm = this.obsOk ? this.obsMap(notas, add) : {}, longa = add.find(t => (nm[t] || '').length > 300);
    if (longa) throw new Error('A observação do tipo "' + longa + '" passa de 300 caracteres.');
    const ev = this.vcOk ? this.vcErro(valores, add) : ''; if (ev) throw new Error(ev);
    const vm = this.vcOk ? this.vcMap(valores, add) : {};
    let novos = [];
    const r = await this._tipos(id, e => {
      const tem = new Set(e.tipos.map(t => this.chave(t)));
      novos = add.filter(t => !tem.has(this.chave(t)));
      if (!novos.length) throw new Error(add.length == 1 ? 'A empresa ' + e.cod + ' já tem o tipo de seguro "' + add[0] + '".' : 'A empresa ' + e.cod + ' já tem todos esses tipos de seguro.');
      if (e.tipos.length + novos.length > 20) throw new Error('No máximo 20 tipos de seguro por empresa (' + e.cod + ' já tem ' + e.tipos.length + ').');
      const lista = [...e.tipos, ...novos], com = novos.filter(t => nm[t]), comV = novos.filter(t => vm[t] != null);
      if (!com.length && !comV.length) return lista;
      const res = { tipos: lista };
      if (com.length) { res.obsT = { ...e.obsT }; com.forEach(t => { res.obsT[this.chave(t)] = nm[t] }) }
      if (comV.length) { res.vcT = { ...e.vcT }; comV.forEach(t => { res.vcT[this.chave(t)] = vm[t] }) }
      return res
    });
    if (await this.registrarTipos(novos)) await this.carregar().catch(() => { });   /* os tipos digitados entram na lista para as próximas empresas */
    return { ...r, novos }
  },
  /* retira um tipo da empresa (o banco recusa se ele já tem pagamentos) → { antes, depois } */
  async retirarTipo(id, tipo) {
    const k = this.chave(tipo); if (!k) throw new Error('Informe o tipo de seguro.');
    return this._tipos(id, e => {
      if (!e.tipos.some(t => this.chave(t) == k)) throw new Error('A empresa ' + e.cod + ' já não tem o tipo de seguro "' + tipo + '". A tela foi atualizada.');
      return e.tipos.filter(t => this.chave(t) != k)
    })
  },
  async excluirEmpresa(id) {
    if (this.P.some(p => p.emp == id)) throw new Error(this.msg({ message: 'seguros_pagamentos_empresa_id_fkey' }));
    const r = await this.cli().from(this.TE).delete().eq('id', id).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: a empresa já tinha sido excluída ou você não tem permissão para excluir.') }
    await this.carregar()
  },
  /* ---------- pagamentos e comprovantes ---------- */
  camposP(x) { return { empresa_id: x.emp, tipo: String(x.tipo || '').trim() || null, data_pagamento: x.dp, valor: Math.round(x.v * 100) / 100, parcela: x.parc, obs: String(x.obs || '').trim() } },
  campoArq(file, path) { return { comprovante_path: path, comprovante_nome: this.nomeSeguro(file.name), comprovante_tipo: this.EXT[this.ext(file.name)], comprovante_bytes: file.size } },
  async subir(emp, file) {
    const e = this.ext(file.name), path = emp + '/' + this.uid() + '.' + e;
    const r = await this.cli().storage.from(this.BK).upload(path, file, { contentType: this.EXT[e], cacheControl: '3600', upsert: false });
    if (r.error) throw new Error(this.msg(r.error)); return path
  },
  async limpar(path) { if (path) { try { await this.cli().storage.from(this.BK).remove([path]) } catch (e) { } } },
  /* x = { emp, tipo, dp, v, parc, obs, file? }: sobe o arquivo (se houver) e grava a linha; se a linha falhar, tenta desfazer o upload */
  async registrar(x) {
    const er = this.validaPagamento(x, null); if (er) throw new Error(er);
    const c = this.cli(); let path = null;
    if (x.file) path = await this.subir(x.emp, x.file);
    const r = await c.from(this.TP).insert(x.file ? { ...this.camposP(x), ...this.campoArq(x.file, path) } : this.camposP(x)).select().single();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    await this.carregar(); return this.deP(r.data)
  },
  /* x = { emp, tipo, dp, v, parc, obs, file?, remover? } · file = comprovante novo (o atual vai para o histórico) · remover = tirar o comprovante (também vai para o histórico) */
  async alterar(id, x) {
    const a = this.P.find(r => r.id == id); if (!a) throw new Error('Pagamento não encontrado. Atualize a tela.');
    const er = this.validaPagamento(x, id); if (er) throw new Error(er);
    const c = this.cli(); let path = null, campos = this.camposP(x);
    if (x.file) { path = await this.subir(x.emp, x.file); campos = { ...campos, ...this.campoArq(x.file, path) } }
    else if (x.remover && a.path) campos = { ...campos, comprovante_path: null };
    const r = await c.from(this.TP).update(campos).eq('id', id).select();
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    if (!r.data || !r.data.length) { await this.limpar(path); await this.carregar().catch(() => { }); throw new Error('Não alterei: o pagamento foi excluído por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.carregar()
  },
  async excluir(id) {
    const a = this.P.find(r => r.id == id), c = this.cli(), r = await c.from(this.TP).delete().eq('id', id).select();
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o pagamento já tinha sido excluído ou você não tem permissão para excluir.') }
    if (a) { const L = [a.path, ...a.ant.map(h => h.path)].filter(Boolean); if (L.length) { try { await c.storage.from(this.BK).remove(L) } catch (e) { } } }   /* arquivos: melhor esforço */
    await this.carregar()
  },
  /* ---------- baixar / visualizar (só quem tem seg.ver recebe o arquivo: regra do armazenamento) ---------- */
  async blob(path) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await c.storage.from(this.BK).download(path); if (r.error) throw new Error(this.msg(r.error)); return r.data
  },
  async baixar(path, nome) { await saveAs(nome || 'comprovante', await this.blob(path)) },
  /* o comprovante vigente (i ausente) ou o anterior de índice i, em formato único para o visualizador/baixar */
  arq(id, i) {
    const p = this.P.find(r => r.id == id); if (!p) throw new Error('Pagamento não encontrado. Atualize a tela.');
    const h = i == null ? null : p.ant[i]; if (i != null && !h) throw new Error('Comprovante anterior não encontrado.');
    const a = h || p; if (!a.path) throw new Error('Este pagamento não tem comprovante.');
    return { p, nome: a.nome || 'comprovante', path: a.path, tipo: this.EXT[this.ext(a.nome)] || a.ctipo || a.tipo || '', bytes: a.bytes, vigente: !h, em: h ? h.em : p.cem, por: h ? h.por : p.cpor }
  }
};
