/* Dados do "Seguros" no Supabase — usado pelo módulo js/modulos/seguros.js.
   • public.seguros_empresas   → cadastro: código, razão social completa, CNPJ (14 caracteres, numérico ou alfanumérico, único) e os TIPOS DE SEGURO sob responsabilidade da empresa.
     "Inativa" = a empresa sai da lista de novos pagamentos, mas o histórico fica. Empresa com pagamentos não pode ser excluída.
   • public.seguros_pagamentos → pagamentos realizados: empresa (escolhida na lista do cadastro), tipo de seguro (opcional, um dos tipos da empresa), data, valor pago,
     número da parcela, observação e o COMPROVANTE (PDF ou imagem, até 10 MB). Quem lançou/alterou e quando é carimbado pelo banco; cada inclusão/alteração/exclusão vai
     para a Auditoria (gatilho no banco).
   • Storage · bucket PRIVADO "seguros-comprovantes" → os arquivos. O arquivo enviado NUNCA é sobrescrito: ao substituir o comprovante, o anterior continua guardado
     (coluna comprovantes_anteriores, preenchida pelo banco) e pode ser visualizado/baixado.
   Quem pode (permissões por usuário, aplicadas no banco por RLS): seg.ver vê, visualiza e baixa · seg.lancar cadastra/edita empresas e registra/edita pagamentos e comprovantes ·
   seg.excluir exclui empresas (sem pagamentos) e pagamentos. Instalação: supabase/seguros.sql.
   Depende de supabase.js (sb_) e app.js (saveAs). */
const SEG = {
  TE: 'seguros_empresas', TP: 'seguros_pagamentos', BK: 'seguros-comprovantes', MAXB: 10 * 1024 * 1024,
  EXT: { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' },
  /* sugestões da lista de tipos (o cadastro aceita qualquer outro tipo digitado; os já usados por alguma empresa entram na lista sozinhos) */
  SUG: ['Riscos de Engenharia', 'Responsabilidade Civil', 'Garantia (Performance Bond)', 'Vida em Grupo', 'Patrimonial', 'Frota / Automóvel', 'Equipamentos', 'Transporte de Cargas'],
  E: [], P: [], ok: false, erro: '', ouv: [], _ch: null, _busy: false, _again: false,
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
  tiposNorm(l) {
    const vistos = new Set(), out = [];
    (Array.isArray(l) ? l : []).forEach(x => { const t = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(), k = t.toLowerCase(); if (t && !vistos.has(k)) { vistos.add(k); out.push(t) } });
    return out
  },
  /* todos os tipos conhecidos: as sugestões + os já usados por alguma empresa (+ os extras informados), sem repetir */
  tiposLista(extra) {
    const usados = this.tiposNorm([].concat(...this.E.map(e => e.tipos))).filter(t => !this.SUG.some(s => s.toLowerCase() == t.toLowerCase())).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return this.tiposNorm([...this.SUG, ...usados, ...(extra || [])])
  },
  /* mensagens do banco / armazenamento em português */
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), cd = String((e && (e.code || e.statusCode)) || ''), t = m + ' ' + cd;
    if (/PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(t)) return 'O módulo Seguros ainda não foi instalado no banco: execute supabase/seguros.sql no Supabase.';
    if (/bucket not found/i.test(m)) return 'O armazenamento dos comprovantes ainda não foi criado. Execute supabase/seguros.sql no Supabase.';
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
    if (/est[aá] inativa|n[aã]o pode ser futura|n[aã]o est[aá] entre os tipos|Empresa n[aã]o encontrada/i.test(m)) return m;   /* o banco já responde em português */
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
  deE(r) {
    return { id: r.id, cod: String(r.codigo == null ? '' : r.codigo).trim(), razao: String(r.razao_social == null ? '' : r.razao_social).trim(), cnpj: this.cnpjNorm(r.cnpj), tipos: this.tiposNorm(r.tipos), ativo: r.ativo !== false, obs: r.obs || '',
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
      const [a, b] = await Promise.all([c.from(this.TE).select('*').order('codigo', { ascending: true }), c.from(this.TP).select('*').order('data_pagamento', { ascending: false }).order('criado_em', { ascending: false })]);
      if (a.error || b.error) { this.ok = false; this.erro = this.msg(a.error || b.error); this.avisa(); throw new Error(this.erro) }
      this.E = (a.data || []).map(r => this.deE(r)).sort((x, y) => x.cod.localeCompare(y.cod, 'pt-BR', { numeric: true, sensitivity: 'base' }));
      this.P = (b.data || []).map(r => this.deP(r)); this.ok = true; this.erro = ''; this.iniciar(); this.avisa()
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  on(fn) { this.ouv.push({ fn }) },
  /* atualização em tempo real: outro usuário cadastrou/alterou/excluiu empresa ou pagamento → recarrega (o RLS decide o que chega) */
  iniciar() {
    if (this._ch) return; const c = this.cli(); if (!c) return; const f = () => this.carregar().catch(() => { });
    try { this._ch = c.channel('seguros').on('postgres_changes', { event: '*', schema: 'public', table: this.TE }, f).on('postgres_changes', { event: '*', schema: 'public', table: this.TP }, f).subscribe() } catch (e) { }
  },
  empresa(id) { return this.E.find(e => e.id == id) || null },
  /* por empresa: nº de pagamentos, total pago (reais), último pagamento e quantos estão sem comprovante (L = lista de pagamentos; sem ela, todos) */
  agrega(L) {
    const o = {}; (L || this.P).forEach(p => { const a = o[p.emp] = o[p.emp] || { n: 0, c: 0, ult: '', sem: 0 }; a.n++; a.c += this.c(p.v); if (p.dp > a.ult) a.ult = p.dp; if (!p.path) a.sem++ });
    Object.values(o).forEach(a => { a.tot = a.c / 100 }); return o
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
    const d1 = this.E.find(e => e.id != id && e.cod.toLowerCase() == cod.toLowerCase()); if (d1) return 'O código "' + cod + '" já está cadastrado para ' + d1.razao + '.';
    const d2 = this.E.find(e => e.id != id && e.cnpj == cnpj); if (d2) return 'Este CNPJ já está cadastrado para ' + d2.cod + ' · ' + d2.razao + '.';
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
  camposE(x) { return { codigo: String(x.cod).trim(), razao_social: String(x.razao).replace(/\s+/g, ' ').trim(), cnpj: this.cnpjNorm(x.cnpj), tipos: this.tiposNorm(x.tipos), ativo: x.ativo !== false, obs: String(x.obs || '').trim() } },
  async salvarEmpresa(id, x) {
    const er = this.validaEmpresa(x, id); if (er) throw new Error(er);
    const c = this.cli(), campos = this.camposE(x);
    if (!id) { const r = await c.from(this.TE).insert(campos).select().single(); if (r.error) throw new Error(this.msg(r.error)); await this.carregar(); return this.deE(r.data) }
    const r = await c.from(this.TE).update(campos).eq('id', id).select();
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não alterei: a empresa foi excluída por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.carregar(); return this.deE(r.data[0])
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
