// Supabase Edge Function: admin-usuarios
// Ações: create | update | reset | toggle | delete
// A service_role key é usada somente no servidor e nunca deve ir para o frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': corsOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })

const fail = (message: string, status = 400): never => {
  throw new HttpError(message, status)
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const LOGIN_RE = /^[a-z0-9._-]{3,30}$/
const VALID_ROLES = new Set(['admin', 'viewer', 'lancador'])
const passwordIsValid = (value: unknown) =>
  typeof value === 'string' && value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value)

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Secret/configuração ausente: ${name}`)
  return value
}

const domain = Deno.env.get('EMAIL_DOMAIN')?.trim()
if (!domain) console.warn('EMAIL_DOMAIN não definido; configure-o antes de criar usuários.')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const url = getRequiredEnv('SUPABASE_URL')
    const publicKey =
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() ||
      Deno.env.get('SUPABASE_ANON_KEY')?.trim()
    if (!publicKey) throw new Error('Secret/configuração ausente: SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY')
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401)

    // Mantém o JWT do chamador para que getUser() valide a sessão recebida.
    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await caller.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Não autenticado.' }, 401)

    // Esta chave só pode existir nos secrets da Edge Function.
    const db = createClient(url, serviceRoleKey)
    const { data: me, error: meError } = await db
      .from('perfis')
      .select('login,papel,ativo')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (meError) throw new Error(`Falha ao consultar o perfil: ${meError.message}`)
    if (!me || me.papel !== 'admin' || !me.ativo) return json({ error: 'Acesso negado.' }, 403)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'JSON inválido.' }, 400)
    }

    const action = String(body.a ?? '')
    if (!['create', 'update', 'reset', 'toggle', 'delete'].includes(action)) {
      return json({ error: 'Ação inválida.' }, 400)
    }

    const audit = async (event: string) => {
      const { error } = await db.from('auditoria').insert({ usuario: me.login, evento: event })
      if (error) console.error('Falha ao registrar auditoria:', error.message)
    }

    if (action === 'create') {
      const login = String(body.l ?? '').trim().toLowerCase()
      const name = String(body.n ?? '').trim()
      const role = String(body.r ?? '')
      const password = body.pw

      if (!LOGIN_RE.test(login)) return json({ error: 'Login inválido.' }, 400)
      if (!name) return json({ error: 'Informe o nome.' }, 400)
      if (!VALID_ROLES.has(role)) return json({ error: 'Perfil inválido.' }, 400)
      if (!passwordIsValid(password)) {
        return json({ error: 'A senha deve ter ao menos 8 caracteres, com letras e números.' }, 400)
      }
      if (!domain) return json({ error: 'EMAIL_DOMAIN não está configurado.' }, 500)

      const { data: existing, error: existingError } = await db
        .from('perfis')
        .select('id')
        .eq('login', login)
        .maybeSingle()
      if (existingError) throw new Error(`Falha ao consultar login: ${existingError.message}`)
      if (existing) return json({ error: 'Esse usuário já existe.' }, 400)

      const { data: created, error: createError } = await db.auth.admin.createUser({
        email: `${login}@${domain}`,
        password: password as string,
        email_confirm: true,
      })
      if (createError || !created.user) {
        return json({ error: 'Não foi possível criar o usuário: ' + (createError?.message ?? '') }, 400)
      }

      const { error: profileError } = await db.from('perfis').insert({
        id: created.user.id,
        login,
        nome: name,
        papel: role,
        mc: Boolean(body.mc),
      })
      if (profileError) {
        await db.auth.admin.deleteUser(created.user.id)
        return json({ error: 'Falha ao gravar o perfil: ' + profileError.message }, 400)
      }

      await audit('criou ' + login)
      return json({ ok: true })
    }

    const targetId = String(body.id ?? '').trim()
    if (!targetId) return json({ error: 'Informe o id do usuário.' }, 400)

    const getTarget = async () => {
      const { data, error } = await db
        .from('perfis')
        .select('id,login,papel,ativo')
        .eq('id', targetId)
        .maybeSingle()
      if (error) throw new Error(`Falha ao consultar usuário: ${error.message}`)
      if (!data) fail('Usuário não encontrado.', 404)
      return data
    }

    const target = await getTarget()
    const hasAnotherActiveAdmin = async (id: string) => {
      const { count, error } = await db
        .from('perfis')
        .select('id', { count: 'exact', head: true })
        .eq('papel', 'admin')
        .eq('ativo', true)
        .neq('id', id)
      if (error) throw new Error(`Falha ao verificar administradores: ${error.message}`)
      return (count ?? 0) > 0
    }
    const isActiveAdmin = target.papel === 'admin' && target.ativo
    const keepOneAdmin = 'É preciso manter ao menos um administrador ativo.'

    if (action === 'update') {
      const name = String(body.n ?? '').trim()
      const role = String(body.r ?? '')
      if (!name) return json({ error: 'Informe o nome.' }, 400)
      if (!VALID_ROLES.has(role)) return json({ error: 'Perfil inválido.' }, 400)
      if (target.id === authData.user.id && role !== target.papel) {
        return json({ error: 'Você não pode alterar o próprio perfil.' }, 400)
      }
      if (isActiveAdmin && role !== 'admin' && !(await hasAnotherActiveAdmin(target.id))) {
        return json({ error: keepOneAdmin }, 400)
      }

      const { error } = await db.from('perfis').update({ nome: name, papel: role }).eq('id', target.id)
      if (error) return json({ error: 'Falha ao atualizar o perfil: ' + error.message }, 400)
      await audit('editou ' + target.login)
      return json({ ok: true })
    }

    if (action === 'reset') {
      if (!passwordIsValid(body.pw)) {
        return json({ error: 'A senha deve ter ao menos 8 caracteres, com letras e números.' }, 400)
      }
      const { error } = await db.auth.admin.updateUserById(target.id, { password: body.pw as string })
      if (error) return json({ error: 'Não foi possível redefinir: ' + error.message }, 400)

      const { error: profileError } = await db
        .from('perfis')
        .update({ mc: Boolean(body.mc) && target.id !== authData.user.id })
        .eq('id', target.id)
      if (profileError) return json({ error: 'Falha ao atualizar o perfil: ' + profileError.message }, 400)
      await audit('redefiniu senha de ' + target.login)
      return json({ ok: true })
    }

    if (action === 'toggle') {
      if (target.id === authData.user.id) return json({ error: 'Você não pode desativar o próprio usuário.' }, 400)
      if (isActiveAdmin && !(await hasAnotherActiveAdmin(target.id))) {
        return json({ error: keepOneAdmin }, 400)
      }

      const active = !target.ativo
      const { error: authUpdateError } = await db.auth.admin.updateUserById(target.id, {
        ban_duration: active ? 'none' : '876000h',
      })
      if (authUpdateError) return json({ error: authUpdateError.message }, 400)

      const { error: profileError } = await db.from('perfis').update({ ativo: active }).eq('id', target.id)
      if (profileError) return json({ error: 'Falha ao atualizar o status: ' + profileError.message }, 400)
      await audit((active ? 'ativou ' : 'desativou ') + target.login)
      return json({ ok: true })
    }

    if (target.id === authData.user.id) return json({ error: 'Você não pode excluir o próprio usuário.' }, 400)
    if (isActiveAdmin && !(await hasAnotherActiveAdmin(target.id))) {
      return json({ error: keepOneAdmin }, 400)
    }

    const { error: deleteError } = await db.auth.admin.deleteUser(target.id)
    if (deleteError) return json({ error: deleteError.message }, 400)
    await audit('excluiu ' + target.login)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    console.error(error)
    return json({ error: 'Erro interno na Edge Function.' }, 500)
  }
})
