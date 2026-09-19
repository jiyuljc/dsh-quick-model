/**
 * dsh-quick-model — host half.
 *
 * Replaces the Settings → Models page's data path with a small JSON API the
 * browser half drives:
 *
 *   GET  /api/quick-model/state    current providers, provider directory, default model
 *   POST /api/quick-model/action   { action: 'discover' | 'save' | 'remove' | 'set-default' | 'probe' }
 *
 * Everything the panel needs is assembled here, on the host, from the same
 * seams the shipped Models page uses:
 *
 *   ctx.settings          reads and writes the `llm-pi-ai` settings namespace
 *                         (`llm-pi-ai.providers.<route>`), which is exactly what
 *                         settings.yaml holds and what the adapter hot-reloads.
 *   ctx.credentials       resolves and stores the API key behind the profile's
 *                         `apiKeyEnv` reference — the secret never reaches the
 *                         browser and never enters settings.yaml.
 *   ctx.llm               interrogates a draft endpoint (`discoverModels`) and
 *                         resolves one model's metadata (`resolveModelInfo`).
 *   ctx.agentDefaultModel the default model selection, saved as a complete
 *                         { provider, model, reasoningEffort } triple.
 *
 * The browser only ever exchanges JSON with these two routes; it holds no
 * credential and performs no write on its own.
 *
 * @module dsh-quick-model
 */

/** Plugin name used by the Cordis loader and by the client-module graph. */
const name = 'dsh-quick-model'

/**
 * Hard host dependencies. `webServer` carries the routes below; the other four
 * are the seams the panel reads and writes. A missing one is a composition
 * error this plugin cannot serve through, so it waits rather than degrading.
 */
const inject = ['settings', 'credentials', 'llm', 'agentDefaultModel', 'webServer']

/** Settings namespace owned by the pi-ai adapter; its `providers` dict is the route set. */
const SETTINGS_NS = 'llm-pi-ai'
/** Route prefix for every endpoint this plugin serves. */
const API_PREFIX = '/api/quick-model'
/** Upper bound on a request body; the panel sends small JSON only. */
const MAX_BODY_BYTES = 1024 * 1024
/** Route key grammar: lowercase, digits, hyphens, leading letter. */
const ROUTE_KEY = /^[a-z][a-z0-9-]*$/

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

/** Whether a value is a plain data object (not an array, null, or class instance). */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A trimmed non-empty string, or undefined. */
function text(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** A positive integer, or undefined. */
function positiveInt(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

/** A readable message from any thrown value. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }
  return String(error)
}

/** Write one JSON reply. */
function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * Read and parse a JSON request body, refusing one that outgrows the ceiling.
 * An empty body is `{}` so an action that needs no arguments stays callable.
 * @param req - the incoming request.
 * @returns the parsed body.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim().length === 0) return {}
  const parsed = JSON.parse(raw)
  return isObject(parsed) ? parsed : {}
}

/**
 * Materialize one profile's model entries into the shape the settings schema
 * accepts: `{ id }` plus the optional metadata the endpoint advertised. Field
 * order and omission matter — a non-positive capacity is left out rather than
 * written as a zero the adapter would have to reject.
 * @param entries - raw model rows from the panel.
 * @returns the sanitized entries.
 */
function sanitizeModels(entries) {
  const out = []
  if (!Array.isArray(entries)) return out
  for (const entry of entries) {
    if (!isObject(entry)) continue
    const id = text(entry.id)
    if (id === undefined) continue
    const row = { id }
    const displayName = text(entry.name)
    if (displayName !== undefined) row.name = displayName
    const contextWindow = positiveInt(entry.contextWindow)
    if (contextWindow !== undefined) row.contextWindow = contextWindow
    const maxTokens = positiveInt(entry.maxTokens)
    if (maxTokens !== undefined) row.maxTokens = maxTokens
    out.push(row)
  }
  return out
}

/** The current default model selection, or null when unavailable. */
function readCurrent(ctx) {
  try {
    const selection = ctx.agentDefaultModel.currentSelection()
    if (!isObject(selection)) return null
    const provider = text(selection.provider)
    const model = text(selection.model)
    if (provider === undefined || model === undefined) return null
    return {
      provider,
      model,
      reasoningEffort: text(selection.reasoningEffort) ?? '',
    }
  } catch {
    return null
  }
}

/**
 * Read the configured pi-ai provider profiles, joined with each one's
 * credential state. Only leaf fields are copied out: the settings value is
 * live, and the panel needs a small detached snapshot.
 * @param ctx - the plugin context.
 * @returns one row per configured route.
 */
async function readProviders(ctx) {
  let value
  try {
    value = ctx.settings.get(SETTINGS_NS)
  } catch {
    return []
  }
  if (!isObject(value) || !isObject(value.providers)) return []
  const rows = []
  for (const route of Object.keys(value.providers)) {
    const profile = isObject(value.providers[route]) ? value.providers[route] : {}
    const apiKeyEnv = text(profile.apiKeyEnv)
    let key = { configured: false, writable: false, source: '' }
    if (apiKeyEnv !== undefined) {
      try {
        const info = await ctx.credentials.describe(apiKeyEnv)
        key = {
          configured: info.configured === true,
          writable: info.writable === true,
          source: text(info.source) ?? '',
        }
      } catch {
        // A reference the credential seam cannot describe is reported as
        // unconfigured, which is what the operator needs to see.
      }
    }
    const models = []
    if (Array.isArray(profile.models)) {
      for (const entry of profile.models) {
        const id = isObject(entry) ? text(entry.id) : undefined
        if (id !== undefined) models.push(id)
      }
    }
    rows.push({
      route,
      displayName: text(profile.displayName) ?? route,
      baseURL: text(profile.baseURL) ?? '',
      api: text(profile.api) ?? '',
      apiKeyEnv: apiKeyEnv ?? '',
      key,
      models,
      modelsReplaced: Array.isArray(profile.models),
    })
  }
  return rows
}

/**
 * List every provider route the pi-ai adapter declares for its own settings
 * namespace: the installed catalog joined with the routes settings already
 * defines. A route the catalog does not ship carries `declared: true`, which is
 * what tells the panel it must supply baseURL, protocol, and a model list.
 * @param ctx - the plugin context.
 * @returns the directory rows in declaration order.
 */
function readDirectory(ctx) {
  const out = []
  try {
    for (const entry of ctx.llm.listConfigurableProviders()) {
      if (!isObject(entry) || entry.settingsNs !== SETTINGS_NS) continue
      const provider = text(entry.provider)
      if (provider === undefined) continue
      out.push({
        provider,
        displayName: text(entry.displayName) ?? provider,
        declared: entry.declared === true,
      })
    }
  } catch {
    // A directory that cannot be read leaves the panel with the catalog tab
    // empty and the preset tab fully usable.
  }
  return out
}

/**
 * Interrogate one draft provider endpoint for the models it advertises.
 * Nothing here is stored: the request describes a profile the operator is still
 * editing, and the reply is candidate metadata the panel offers for adoption.
 * @param ctx - the plugin context.
 * @param body - `{ provider?, baseURL?, api?, apiKey?, apiKeyEnv? }`.
 * @returns `{ models }` on success, `{ error }` otherwise.
 */
async function actionDiscover(ctx, body) {
  const request = {}
  const provider = text(body.provider)
  if (provider !== undefined) request.provider = provider
  const baseURL = text(body.baseURL)
  if (baseURL !== undefined) request.baseURL = baseURL.replace(/\/+$/, '')
  const api = text(body.api)
  if (api !== undefined) request.api = api
  let apiKey = text(body.apiKey)
  if (apiKey === undefined) {
    // A key already stored behind the profile's reference lets the panel probe
    // an existing route without the operator re-typing the secret.
    const ref = text(body.apiKeyEnv)
    if (ref !== undefined) {
      try {
        const resolved = await ctx.credentials.resolve(ref)
        if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value.length > 0) {
          apiKey = resolved.value
        }
      } catch {
        // Discovery reports the unusable credential itself.
      }
    }
  }
  if (apiKey !== undefined) request.apiKey = apiKey

  const models = await ctx.llm.discoverModels(SETTINGS_NS, request)
  const list = []
  for (const entry of models) {
    if (!isObject(entry)) continue
    const id = text(entry.id)
    if (id === undefined) continue
    const row = { id }
    const displayName = text(entry.name)
    if (displayName !== undefined) row.name = displayName
    const contextWindow = positiveInt(entry.contextWindow)
    if (contextWindow !== undefined) row.contextWindow = contextWindow
    const maxTokens = positiveInt(entry.maxTokens)
    if (maxTokens !== undefined) row.maxTokens = maxTokens
    list.push(row)
  }
  return { models: list }
}

/**
 * Save one provider profile, writing its credential first.
 *
 * Ordering is deliberate: the key is stored before the profile that references
 * it, so a failure leaves an unused credential rather than a configured route
 * that cannot authenticate. A reference supplied by the environment or a `.env`
 * file shadows the managed store and is left untouched, reported in `keyNote`.
 *
 * `models` replaces a route's catalog wholesale, so it is written only when the
 * operator actually narrowed the list — a catalog route keeping every model
 * omits the field and stays live to future catalog updates.
 * @param ctx - the plugin context.
 * @param body - the profile draft.
 * @returns `{ route, apiKeyEnv, keyNote }` on success, `{ error }` otherwise.
 */
async function actionSave(ctx, body) {
  if (ctx.settings.writable !== true) throw new Error('当前设置文档不可写')

  const route = text(body.route)
  if (route === undefined || !ROUTE_KEY.test(route)) {
    throw new Error('服务商标识只能是小写字母、数字和连字符，且以字母开头')
  }
  const isCatalogRoute = body.catalog === true
  const baseURL = text(body.baseURL)
  const api = text(body.api)
  const displayName = text(body.displayName)
  const models = sanitizeModels(body.models)

  if (!isCatalogRoute) {
    if (baseURL === undefined) throw new Error('自定义服务商必须填写接口地址 baseURL')
    if (models.length === 0) throw new Error('自定义服务商至少需要勾选一个模型')
  }
  if (isCatalogRoute && body.replaceModels === true && models.length === 0) {
    throw new Error('请至少勾选一个模型，或者保留该服务商的全部模型')
  }

  const apiKeyEnv = text(body.apiKeyEnv) ?? `${route.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
  const apiKey = text(body.apiKey)
  let keyNote = ''
  if (apiKey !== undefined) {
    const info = await ctx.credentials.describe(apiKeyEnv)
    if (info.writable !== true) {
      keyNote = '密钥由环境变量或 .env 提供，未写入凭据库'
    } else {
      await ctx.credentials.set(apiKeyEnv, apiKey)
      keyNote = `密钥已写入 ${apiKeyEnv}`
    }
  }

  const profile = { apiKeyEnv }
  if (displayName !== undefined) profile.displayName = displayName
  if (baseURL !== undefined) profile.baseURL = baseURL.replace(/\/+$/, '')
  if (api !== undefined) profile.api = api
  if (!isCatalogRoute || body.replaceModels === true) profile.models = models

  await ctx.settings.mutate(SETTINGS_NS, [
    { op: 'set', path: ['providers', route], value: profile },
  ])
  return { route, apiKeyEnv, keyNote }
}

/**
 * Delete one provider route from the user settings layer.
 * @param ctx - the plugin context.
 * @param body - `{ route }`.
 */
async function actionRemove(ctx, body) {
  if (ctx.settings.writable !== true) throw new Error('当前设置文档不可写')
  const route = text(body.route)
  if (route === undefined) throw new Error('缺少服务商标识')
  await ctx.settings.mutate(SETTINGS_NS, [
    { op: 'unset', path: ['providers', route] },
  ])
  return {}
}

/**
 * Save the default model selection. An absent effort clears any inherited one,
 * restoring the model's own provider/default behavior.
 * @param ctx - the plugin context.
 * @param body - `{ provider, model, reasoningEffort? }`.
 */
async function actionSetDefault(ctx, body) {
  const provider = text(body.provider)
  const model = text(body.model)
  if (provider === undefined || model === undefined) throw new Error('缺少服务商或模型')
  const next = { provider, model }
  const effort = text(body.reasoningEffort)
  if (effort !== undefined) next.reasoningEffort = effort
  await ctx.agentDefaultModel.saveSelection(next)
  return {}
}

/**
 * Resolve one model's metadata from the adapter that owns its route. This is a
 * light confirmation that the route exists and reports the capabilities the
 * adapter knows; it does not spend a completion.
 * @param ctx - the plugin context.
 * @param body - `{ provider, model }`.
 */
async function actionProbe(ctx, body) {
  const provider = text(body.provider)
  const model = text(body.model)
  if (provider === undefined || model === undefined) throw new Error('缺少服务商或模型')
  const info = await ctx.llm.resolveModelInfo(provider, model)
  const result = { id: text(info.id) ?? model, name: text(info.name) ?? model }
  if (isObject(info.context)) {
    const contextWindow = positiveInt(info.context.contextWindow)
    if (contextWindow !== undefined) result.contextWindow = contextWindow
  }
  const maxTokens = positiveInt(info.defaultMaxTokens)
  if (maxTokens !== undefined) result.maxTokens = maxTokens
  if (isObject(info.reasoning) && Array.isArray(info.reasoning.efforts)) {
    const efforts = []
    for (const entry of info.reasoning.efforts) {
      const id = isObject(entry) ? text(entry.id) : undefined
      if (id !== undefined) efforts.push(id)
    }
    result.efforts = efforts
  }
  return result
}

/** Dispatch one panel action. */
async function dispatch(ctx, body) {
  switch (text(body.action)) {
    case 'discover':
      return actionDiscover(ctx, body)
    case 'save':
      return actionSave(ctx, body)
    case 'remove':
      return actionRemove(ctx, body)
    case 'set-default':
      return actionSetDefault(ctx, body)
    case 'probe':
      return actionProbe(ctx, body)
    default:
      throw new Error(`未知的操作：${String(body.action)}`)
  }
}

/**
 * Mount the panel's two routes. Both are effects of this plugin's fiber, so
 * stopping or updating the row withdraws them with it.
 * @param ctx - the plugin context.
 */
function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/state`,
    handler: async (req, res) => {
      try {
        sendJson(res, 200, {
          ok: true,
          settingsNs: SETTINGS_NS,
          writable: ctx.settings.writable === true,
          providers: await readProviders(ctx),
          directory: readDirectory(ctx),
          current: readCurrent(ctx),
        })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: messageOf(error) })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${API_PREFIX}/action`,
    handler: async (req, res) => {
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 400, { ok: false, error: `无法解析请求：${messageOf(error)}` })
        return
      }
      try {
        const value = await dispatch(ctx, body)
        sendJson(res, 200, { ok: true, ...value })
      } catch (error) {
        // Every refusal — a rejected profile, a bad key, an unknown route — is
        // reported to the panel as data, so the operator reads it in the form
        // instead of hunting the host log.
        sendJson(res, 200, { ok: false, error: messageOf(error) })
      }
    },
  }))
}

export { name, inject, apply }
