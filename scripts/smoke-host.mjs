/**
 * Host-half smoke test for dsh-quick-model.
 *
 * Mounts the plugin's `apply` against stub host services and drives the two
 * registered routes for real, so the handler logic — the settings write shape,
 * the credential ordering, the action dispatch — is exercised without booting
 * DSH. Stubs record what they received; the assertions read those records.
 *
 * Run:  node scripts/smoke-host.mjs <path to lib/index.js>
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const entry = resolve(process.argv[2] ?? 'lib/index.js');
const { apply, name, inject } = await import(pathToFileURL(entry).href);

let failures = 0;
function check(label, fn) {
  try {
    const detail = fn();
    console.log(`  PASS  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${label} — ${error.message}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ---- stub host services ------------------------------------------------
const routes = new Map();
const calls = { mutations: [], credentialWrites: [], selectionSaves: [], discoveries: [] };
const credentialStore = new Map();

const settingsValue = {
  providers: {
    moonshot: {
      apiKeyEnv: 'MOONSHOT_API_KEY',
      baseURL: 'https://api.moonshot.cn/v1',
      api: 'openai-completions',
      models: [{ id: 'kimi-k2.7-code' }, { id: 'kimi-k3' }],
    },
    'zai-coding-cn': { apiKeyEnv: 'ZAI_CODING_CN_API_KEY' },
  },
};

const ctx = {
  effect: (cb) => {
    cb();
    return () => {};
  },
  settings: {
    writable: true,
    get: () => settingsValue,
    mutate: async (ns, ops) => {
      calls.mutations.push({ ns, ops });
    },
  },
  credentials: {
    describe: async (ref) => ({ configured: credentialStore.has(ref), writable: true, source: 'store' }),
    resolve: async (ref) => (credentialStore.has(ref) ? { value: credentialStore.get(ref), source: 'store' } : undefined),
    set: async (ref, value) => {
      calls.credentialWrites.push({ ref, value });
      credentialStore.set(ref, value);
    },
  },
  llm: {
    listConfigurableProviders: () => [
      { provider: 'moonshot', displayName: 'Moonshot', settingsNs: 'llm-pi-ai', declared: false },
      { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai' },
      { provider: 'other-ns', displayName: 'Other', settingsNs: 'something-else' },
    ],
    discoverModels: async (ns, request) => {
      calls.discoveries.push({ ns, request });
      return [
        { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1048576, maxTokens: 32768 },
        { id: 'kimi-k2.6', contextWindow: 262144 },
        { notAnId: true },
      ];
    },
    resolveModelInfo: async () => ({
      id: 'kimi-k3',
      name: 'Kimi K3',
      context: { contextWindow: 1048576 },
      defaultMaxTokens: 32768,
      reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] },
    }),
  },
  agentDefaultModel: {
    currentSelection: () => ({ provider: 'moonshot', model: 'kimi-k2.7-code', reasoningEffort: 'high' }),
    saveSelection: async (next) => {
      calls.selectionSaves.push(next);
    },
  },
  webServer: {
    register: (route) => {
      routes.set(route.path, route);
      return () => {};
    },
  },
};

// ---- request/response doubles -----------------------------------------
function makeRes() {
  return {
    status: 0,
    body: undefined,
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
}
function makeReq(body) {
  if (body === undefined) return { async *[Symbol.asyncIterator]() {} };
  const chunk = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    async *[Symbol.asyncIterator]() {
      yield chunk;
    },
  };
}
const stateRoute = () => routes.get('/api/quick-model/state');
const actionRoute = () => routes.get('/api/quick-model/action');
async function getState() {
  const res = makeRes();
  await stateRoute().handler(makeReq(), res);
  return res;
}
async function act(body) {
  const res = makeRes();
  await actionRoute().handler(makeReq(body), res);
  return res;
}

// ---- run ---------------------------------------------------------------
console.log(`mounting ${name} (inject: ${inject.join(', ')})`);
apply(ctx);

console.log('\nroutes');
check('registers exactly the two panel routes', () => {
  assert(routes.size === 2, `registered ${routes.size} routes: ${[...routes.keys()].join(', ')}`);
  return [...routes.keys()].join('  ');
});

console.log('\nGET /state');
{
  const res = await getState();
  check('answers 200 with the settings namespace', () => {
    assert(res.status === 200, `status ${res.status}`);
    assert(res.body.ok === true, `ok=${res.body.ok}`);
    assert(res.body.settingsNs === 'llm-pi-ai', `settingsNs=${res.body.settingsNs}`);
    return `writable=${res.body.writable}`;
  });
  check('reports each configured provider with its credential state', () => {
    const routesOut = res.body.providers;
    assert(Array.isArray(routesOut) && routesOut.length === 2, `got ${routesOut?.length} providers`);
    const moonshot = routesOut.find((p) => p.route === 'moonshot');
    assert(moonshot.displayName === 'moonshot', 'displayName should fall back to the route key');
    assert(moonshot.models.length === 2, 'should list both narrowing models');
    assert(moonshot.modelsReplaced === true, 'an explicit models list should be flagged');
    const zai = routesOut.find((p) => p.route === 'zai-coding-cn');
    assert(zai.modelsReplaced === false, 'a provider with no models list should not be flagged');
    assert(zai.key.configured === false, 'zai has no stored key yet');
    return `moonshot(${moonshot.models.length} models), zai-coding-cn`;
  });
  check('filters the directory to the pi-ai namespace', () => {
    const names = res.body.directory.map((d) => d.provider);
    assert(names.length === 2, `got ${names.length}: ${names.join(', ')}`);
    assert(!names.includes('other-ns'), 'a foreign settings namespace leaked into the directory');
    return names.join(', ');
  });
  check('reports the current default selection', () => {
    assert(res.body.current.provider === 'moonshot', 'wrong provider');
    assert(res.body.current.model === 'kimi-k2.7-code', 'wrong model');
    return `${res.body.current.provider}/${res.body.current.model}@${res.body.current.reasoningEffort}`;
  });
}

console.log('\nPOST action=discover');
{
  const res = await act({ action: 'discover', provider: 'openai', baseURL: 'https://api.openai.com/v1/', apiKeyEnv: 'OPENAI_API_KEY' });
  check('answers with sanitized candidate models', () => {
    assert(res.body.ok === true, `error: ${res.body.error}`);
    assert(res.body.models.length === 2, `got ${res.body.models.length} models (the id-less row should be dropped)`);
    assert(res.body.models[0].contextWindow === 1048576, 'contextWindow lost');
    const passed = calls.discoveries.at(-1);
    assert(passed.ns === 'llm-pi-ai', `namespace ${passed.ns}`);
    assert(passed.request.baseURL === 'https://api.openai.com/v1', `trailing slash not normalized: ${passed.request.baseURL}`);
    return `${res.body.models.length} models, baseURL normalized`;
  });
}

console.log('\nPOST action=save');
{
  credentialStore.set('OPENAI_API_KEY', 'sk-existing');
  const res = await act({
    action: 'save',
    route: 'my-gateway',
    baseURL: 'https://gw.example/v1/',
    api: 'openai-completions',
    displayName: '我的中转',
    apiKey: 'sk-new',
    catalog: false,
    replaceModels: true,
    models: [{ id: 'a', contextWindow: 1000 }, { id: 'b', contextWindow: 0 }, { id: '' }],
  });
  check('accepts the profile and writes it to llm-pi-ai', () => {
    assert(res.body.ok === true, `error: ${res.body.error}`);
    const { ns, ops } = calls.mutations.at(-1);
    assert(ns === 'llm-pi-ai', `namespace ${ns}`);
    assert(ops.length === 1 && ops[0].op === 'set', 'expected one set op');
    assert(ops[0].path.join('.') === 'providers.my-gateway', `path ${ops[0].path.join('.')}`);
    const value = ops[0].value;
    assert(value.apiKeyEnv === 'MY_GATEWAY_API_KEY', `derived ref ${value.apiKeyEnv}`);
    assert(value.baseURL === 'https://gw.example/v1', `baseURL not normalized: ${value.baseURL}`);
    assert(value.displayName === '我的中转', 'displayName lost');
    assert(value.models.length === 2, `expected 2 usable models, got ${value.models.length}`);
    assert(value.models[1].contextWindow === undefined, 'a non-positive capacity should be omitted');
    return `providers.my-gateway, ${value.models.length} models`;
  });
  check('writes the credential before the profile that references it', () => {
    const write = calls.credentialWrites.at(-1);
    assert(write !== undefined, 'no credential write recorded');
    assert(write.ref === 'MY_GATEWAY_API_KEY' && write.value === 'sk-new', 'wrong credential write');
    return `${write.ref} then profile`;
  });
  check('derives an uppercase underscored ref from a hyphenated route', () => (res.body.apiKeyEnv));

  const bad = await act({ action: 'save', route: 'My Gateway', catalog: false, models: [{ id: 'x' }], baseURL: 'https://x' });
  check('refuses a route key that breaks the grammar', () => {
    assert(bad.body.ok === false, 'should have been refused');
    return bad.body.error;
  });
  const bare = await act({ action: 'save', route: 'bare', catalog: false, models: [{ id: 'x' }] });
  check('refuses a custom provider with no baseURL', () => {
    assert(bare.body.ok === false, 'should have been refused');
    return bare.body.error;
  });
  const empty = await act({ action: 'save', route: 'moonshot', catalog: true, replaceModels: true, models: [] });
  check('refuses a catalog route narrowed to zero models', () => {
    assert(empty.body.ok === false, 'should have been refused');
    return empty.body.error;
  });
  const keepAll = await act({ action: 'save', route: 'moonshot', catalog: true, replaceModels: false, models: [] });
  check('omits `models` when a catalog route keeps its whole catalog', () => {
    assert(keepAll.body.ok === true, `error: ${keepAll.body.error}`);
    const value = calls.mutations.at(-1).ops[0].value;
    assert(!('models' in value), 'models should be omitted so the route keeps following the catalog');
    assert(value.apiKeyEnv === 'MOONSHOT_API_KEY', `ref ${value.apiKeyEnv}`);
    return 'models omitted';
  });
}

console.log('\nPOST action=remove / set-default / probe');
{
  const res = await act({ action: 'remove', route: 'zai-coding-cn' });
  check('removes one provider by path', () => {
    assert(res.body.ok === true, `error: ${res.body.error}`);
    const op = calls.mutations.at(-1).ops[0];
    assert(op.op === 'unset' && op.path.join('.') === 'providers.zai-coding-cn', 'wrong unset op');
    return 'providers.zai-coding-cn unset';
  });

  const def = await act({ action: 'set-default', provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' });
  check('saves the complete default selection', () => {
    assert(def.body.ok === true, `error: ${def.body.error}`);
    const saved = calls.selectionSaves.at(-1);
    assert(saved.provider === 'moonshot' && saved.model === 'kimi-k3' && saved.reasoningEffort === 'high', 'wrong selection');
    return `${saved.provider}/${saved.model}@${saved.reasoningEffort}`;
  });
  const cleared = await act({ action: 'set-default', provider: 'moonshot', model: 'kimi-k3' });
  check('omits the effort when none was chosen, clearing an inherited one', () => {
    assert(cleared.body.ok === true, `error: ${cleared.body.error}`);
    const saved = calls.selectionSaves.at(-1);
    assert(!('reasoningEffort' in saved), 'reasoningEffort should be absent');
    return 'no effort';
  });

  const probe = await act({ action: 'probe', provider: 'moonshot', model: 'kimi-k3' });
  check('resolves model metadata', () => {
    assert(probe.body.ok === true, `error: ${probe.body.error}`);
    assert(probe.body.contextWindow === 1048576, 'contextWindow lost');
    assert(probe.body.efforts.join(',') === 'low,high', 'efforts lost');
    return `${probe.body.contextWindow} ctx, efforts ${probe.body.efforts.join('/')}`;
  });

  const unknown = await act({ action: 'nope' });
  check('reports an unknown action as data, not a crash', () => {
    assert(unknown.status === 200, `status ${unknown.status}`);
    assert(unknown.body.ok === false, 'should report failure');
    return unknown.body.error;
  });

  const badBody = makeRes();
  await actionRoute().handler(
    { async *[Symbol.asyncIterator]() { yield Buffer.from('{not json', 'utf8'); } },
    badBody,
  );
  check('rejects a malformed body with 400', () => {
    assert(badBody.status === 400, `status ${badBody.status}`);
    assert(badBody.body.ok === false, 'should report failure');
    return badBody.body.error;
  });

  const noCred = { ...ctx, credentials: { ...ctx.credentials, describe: async () => ({ configured: false, writable: false }) } };
  const fresh = new Map();
  const noCredCtx = { ...noCred, webServer: { register: (route) => { fresh.set(route.path, route); return () => {}; } } };
  apply(noCredCtx);
  const shadowed = makeRes();
  await fresh.get('/api/quick-model/action').handler(
    makeReq({ action: 'save', route: 'shadowed', baseURL: 'https://x/v1', api: 'openai-completions', apiKey: 'sk-x', catalog: false, replaceModels: true, models: [{ id: 'm' }] }),
    shadowed,
  );
  check('reports a read-only credential source instead of pretending the key was stored', () => {
    assert(shadowed.body.ok === true, `error: ${shadowed.body.error}`);
    assert(shadowed.body.keyNote.includes('未写入凭据库'), `keyNote: ${shadowed.body.keyNote}`);
    return shadowed.body.keyNote;
  });
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
