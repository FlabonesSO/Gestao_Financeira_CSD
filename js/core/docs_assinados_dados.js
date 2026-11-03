/* Dados do relatório "Doc Assinados" no Supabase — usado por js/modulos/docs_assinados.js.
   • public.docs_assinados → um registro por arquivo anexado: categoria (REIDI, Fundo de Reserva ou Fluxo de Caixa), referência (texto livre, opcional), nome, tipo,
     tamanho, quem anexou e quando (autor e data são carimbados pelo banco; cada anexo e cada exclusão vai para a Auditoria por gatilho).
   • Storage · bucket PRIVADO "docs-assinados" → os arquivos (PDF, PNG, JPG ou WEBP, até 10 MB). O arquivo anexado NUNCA é sobrescrito nem alterado:
     para trocar, exclui-se e anexa-se de novo.
   • Os documentos que já tinham sido anexados pelo botão "Doc. Assinados" do REIDI (RDOC · tabela reidi_docs_assinados) continuam onde estão e entram na lista
     da categoria REIDI (marcados como `legado`; abrir e excluir passam pelo RDOC). Se aquela tabela não existir, a lista segue só com os novos.
   Quem pode: SÓ o administrador (regras do banco: RLS na tabela e no armazenamento). Instalação: supabase/doc-assinados.sql.
   Depende de supabase.js (sb_), app.js (saveAs) e reidi_docs_dados.js (RDOC: regras de arquivo, nomes e o acervo antigo do REIDI). */
const DOCA = {
  T: 'docs_assinados', BK: 'docs-assinados', REFMAX: 120,
  /* as três categorias, na ordem das abas */
  CATS: [{ id: 'reidi', nome: 'REIDI' }, { id: 'fundo_reserva', nome: 'Fundo de Reserva' }, { id: 'fluxo_caixa', nome: 'Fluxo de Caixa' }],
  rotCat(id) { const c = this.CATS.find(x => x.id == id); return c ? c.nome : '' },
  /* L = todos os documentos (novos + antigos do REIDI), mais recente primeiro · ok = a última leitura deu certo · falta = a tabela nova não existe (SQL não rodado)
     erro = texto do último erro de leitura · avisoLegado = texto quando não deu para ler o acervo antigo do REIDI ('' = tudo certo) */
  L: [], ok: false, falta: false, erro: '', avisoLegado: '',
  cli() { return RDOC.cli() },
  /* referência como o banco a guarda: sem quebras de linha/tabulações (viram espaço) e sem espaços nas pontas */
  ref(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() },
  /* mensagens do banco / armazenamento em português */
  msg(e) {
    const tx = v => (typeof v == 'string' ? v : ''),
      m = typeof e == 'string' ? e : (e ? tx(e.message) || tx(e.error_description) || tx(e.error) : '');
    if (RDOC.faltaTabela(e)) return 'O Doc Assinados ainda não foi instalado no banco: execute supabase/doc-assinados.sql no Supabase.';
    if (/bucket not found/i.test(m)) return 'O armazenamento dos documentos assinados ainda não foi criado. Execute supabase/doc-assinados.sql no Supabase.';
    if (/docs_assinados_categoria_check/i.test(m)) return 'Escolha a categoria: REIDI, Fundo de Reserva ou Fluxo de Caixa.';
    if (/docs_assinados_referencia_check/i.test(m)) return 'A referência deve ter no máximo ' + this.REFMAX + ' caracteres.';
    if (/docs_assinados_nome_check/i.test(m)) return 'O nome do arquivo deve ter de 1 a 200 caracteres.';
    if (/docs_assinados_tipo_check|mime type|not supported|invalid_mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (/docs_assinados_bytes_check|maximum allowed size|too large|payload/i.test(m)) return 'O arquivo passa do limite de 10 MB.';
    return RDOC.msg(e)
  },
  /* confere categoria, referência e arquivo ANTES de enviar → texto do problema ou '' */
  validar(file, cat, ref) {
    if (!this.CATS.some(c => c.id == cat)) return 'Escolha a categoria: REIDI, Fundo de Reserva ou Fluxo de Caixa.';
    if (this.ref(ref).length > this.REFMAX) return 'A referência deve ter no máximo ' + this.REFMAX + ' caracteres.';
    return RDOC.validar(file)
  },
  /* linha do banco → formato usado pela tela (key é única entre as duas tabelas) */
  de(r) { return { key: 'n:' + r.id, id: r.id, cat: r.categoria || '', ref: r.referencia || '', nome: r.nome || 'documento', path: r.path || '', tipo: r.tipo || '', bytes: +r.bytes || 0, por: r.criado_por_nome || '', em: r.criado_em || '', legado: false } },
  /* documento do acervo antigo do REIDI (RDOC) → mesmo formato, sempre na categoria REIDI e sem referência */
  deLegado(d) { return { key: 'l:' + d.id, id: d.id, cat: 'reidi', ref: '', nome: d.nome, path: d.path, tipo: d.tipo, bytes: d.bytes, por: d.por, em: d.em, legado: true } },
  ordena() { this.L.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0) || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0) || (a.key < b.key ? -1 : 1)) },
  /* lê as duas listas (o RLS só entrega para administrador). A tabela nova é obrigatória; o acervo antigo do REIDI é complemento. */
  async carregar() {
    const c = this.cli(); if (!c) { this.ok = false; this.erro = 'Supabase não configurado'; throw new Error(this.erro) }
    const r = await RDOC.via(() => c.from(this.T).select('id,categoria,referencia,nome,path,tipo,bytes,criado_por_nome,criado_em').order('criado_em', { ascending: false }));
    if (r.error) { this.ok = false; this.falta = RDOC.faltaTabela(r.error); this.erro = this.msg(r.error); throw new Error(this.erro) }
    let leg = [], aviso = '';
    try { leg = (await RDOC.carregar()).map(d => this.deLegado(d)) } catch (e) { if (!RDOC.falta) aviso = 'Não consegui ler os documentos do REIDI anexados antes: ' + ((e && e.message) || String(e)) }
    this.L = (r.data || []).map(x => this.de(x)).concat(leg); this.ordena(); this.ok = true; this.falta = false; this.erro = ''; this.avisoLegado = aviso; return this.L
  },
  /* contagem por categoria (a aba "Todos" é o total) */
  conta() { const o = { todos: this.L.length }; this.CATS.forEach(c => { o[c.id] = this.L.filter(d => d.cat == c.id).length }); return o },
  async limpar(path) { if (path) { try { await this.cli().storage.from(this.BK).remove([path]) } catch (e) { } } },
  /* sobe o arquivo e grava o registro; se o registro falhar, desfaz o upload. Devolve o documento (formato da tela). Não relê a lista: quem anexa vários chama carregar() no fim */
  async anexar(file, cat, ref) {
    const er = this.validar(file, cat, ref); if (er) throw new Error(er);
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const e = RDOC.ext(file.name), path = RDOC.uid() + '.' + e, tipo = RDOC.EXT[e], rf = this.ref(ref);
    const u = await RDOC.via(() => c.storage.from(this.BK).upload(path, file, { contentType: tipo, cacheControl: '3600', upsert: false }));
    if (u.error) throw new Error(this.msg(u.error));
    const r = await RDOC.via(() => c.from(this.T).insert({ categoria: cat, referencia: rf || null, nome: RDOC.nome(file.name), path, tipo, bytes: file.size }).select().single());
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    const d = this.de(r.data); this.L = this.L.filter(x => x.key != d.key).concat(d); this.ordena(); return d
  },
  /* exclui o registro e, depois, o arquivo (este em melhor esforço). O acervo antigo do REIDI é excluído pelo RDOC. */
  async excluir(key) {
    const a = this.L.find(x => x.key == key); if (!a) throw new Error('Documento não encontrado. Atualize a lista.');
    if (a.legado) { await RDOC.excluir(a.id); this.L = this.L.filter(x => x.key != key); return }
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await RDOC.via(() => c.from(this.T).delete().eq('id', a.id).select());
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o documento já tinha sido excluído ou você não tem permissão para excluir.') }
    await this.limpar(a.path);
    this.L = this.L.filter(x => x.key != key)
  },
  /* ---------- abrir / baixar (só o administrador recebe o arquivo: regra do armazenamento) ---------- */
  async blob(d) {
    if (d.legado) return RDOC.blob(d.path);
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await RDOC.via(() => c.storage.from(this.BK).download(d.path)); if (r.error) throw new Error(this.msg(r.error)); return r.data
  },
  async baixar(d) { await saveAs(d.nome || 'documento', await this.blob(d)) }
};
