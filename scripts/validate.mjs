/**
 * Post-install smoke test for dsh-quick-model.
 *
 * Run from the profile directory:
 *   node <this file> <profileDir> <packageSpecifier>
 *
 * It checks the three contracts the loader and the client-module scanner
 * actually enforce, so a packaging mistake surfaces here instead of at DSH
 * boot:
 *
 *   1. the package resolves from the profile and declares dsh.bundle.patch
 *      (otherwise `dsh plugin add` would not have added it to the bundle stack);
 *   2. the declared patch file parses as a loader patch whose insert rows carry
 *      the row id and the package name the client scanner needs;
 *   3. the host half imports and exports { name, inject, apply };
 *   4. the client half is a `window.__ModuleLoader__.load` bundle that
 *      registers into settings.section with the shipped `models` id.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const profileDir = resolve(process.argv[2] ?? '.');
const specifier = process.argv[3] ?? 'dsh-quick-model';

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

console.log(`profile: ${profileDir}`);
console.log(`package: ${specifier}`);

const require = createRequire(pathToFileURL(join(profileDir, 'package.json')));

// ---- 1. resolution + manifest ------------------------------------------
// Resolution goes through the profile's node_modules first: that is what the
// DSH loader does, and it is the thing that actually has to work. A checkout
// that is not installed yet (a CI run, or the pre-publish self-check) falls
// back to the directory itself so the remaining contract checks still run.
let pkgPath;
check('package resolves from the profile', () => {
  try {
    pkgPath = require.resolve(`${specifier}/package.json`);
    return pkgPath;
  } catch (error) {
    const self = join(profileDir, 'package.json');
    if (!existsSync(self)) throw error;
    if (JSON.parse(readFileSync(self, 'utf8')).name !== specifier) throw error;
    pkgPath = self;
    return `${self} (self-check — not installed under the profile)`;
  }
});

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

check('manifest declares dsh.bundle.patch', () => {
  const rel = pkg.dsh?.bundle?.patch;
  if (typeof rel !== 'string') throw new Error('dsh.bundle.patch missing');
  readFileSync(join(dirname(pkgPath), rel), 'utf8');
  return rel;
});

check('manifest declares dsh.client for web', () => {
  if (pkg.dsh?.client?.platform !== 'web') throw new Error('dsh.client.platform is not "web"');
  return JSON.stringify(pkg.dsh.client);
});

check('manifest exports ./client', () => {
  const rel = pkg.exports?.['./client']?.default;
  if (typeof rel !== 'string') throw new Error('exports["./client"].default missing');
  readFileSync(join(dirname(pkgPath), rel), 'utf8');
  return rel;
});

// ---- 2. loader patch ----------------------------------------------------
const patchPath = join(dirname(pkgPath), pkg.dsh.bundle.patch);

/**
 * Read one top-level patch entry's body by line, without regex line matching.
 * A `.*`-based capture silently truncates on CRLF checkouts — `.` does not
 * match `\r` — so a Windows working tree would report a spurious failure on a
 * patch that is in fact fine. Splitting first makes the reader EOL-agnostic.
 * @param yaml - the whole patch document.
 * @param header - a matcher for the entry's first line (e.g. /^- insert:/).
 * @returns the body lines joined, or null when no line matches.
 */
function patchEntryBody(yaml, header) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break; // the next top-level entry begins
    body.push(lines[i]);
  }
  return body.join('\n');
}

check('patch inserts one row naming the package', () => {
  const body = patchEntryBody(readFileSync(patchPath, 'utf8'), /^-\s*insert:\s*$/);
  if (body === null) throw new Error('no top-level `- insert:` entry');
  if (!new RegExp(`name:\\s*['"]?${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]?`).test(body)) {
    throw new Error(`the insert row does not name "${specifier}"`);
  }
  const id = /id:\s*([A-Za-z0-9._-]+)/.exec(body);
  if (id === null) throw new Error('the insert row carries no id');
  return `id=${id[1]}`;
});

check('patch disables the shipped Models page', () => {
  const body = patchEntryBody(readFileSync(patchPath, 'utf8'), /^-\s*id:\s*ui-settings-models\s*$/);
  if (body === null) throw new Error('no id-targeted entry for "ui-settings-models"');
  if (!/^\s*disabled:\s*true\s*$/.test(body.trim().split(/\r?\n/).pop() ?? '')) {
    throw new Error('that entry does not set "disabled: true"');
  }
  return 'ui-settings-models disabled: true';
});

// ---- 3. host half -------------------------------------------------------
const bundleDir = dirname(pkgPath);
const hostEntry = join(bundleDir, pkg.exports?.['.']?.default ?? pkg.main);
const mod = await import(pathToFileURL(hostEntry).href);

check('host half exports { name, inject, apply }', () => {
  if (typeof mod.apply !== 'function') throw new Error('apply is not a function');
  if (mod.name !== specifier) throw new Error(`name is "${mod.name}", expected "${specifier}"`);
  if (!Array.isArray(mod.inject)) throw new Error('inject is not an array');
  return `name=${mod.name} inject=[${mod.inject.join(', ')}]`;
});

// ---- 4. client half, executed in a stub browser -------------------------
const clientEntry = join(bundleDir, pkg.exports['./client'].default);
const clientSource = readFileSync(clientEntry, 'utf8');

check('client half is a __ModuleLoader__ bundle', () => {
  if (!clientSource.includes('window.__ModuleLoader__.load(')) throw new Error('no __ModuleLoader__.load call');
  return `${clientSource.length} bytes`;
});

check('client half loads and registers the models section', () => {
  let captured = null;
  const styleTags = [];
  globalThis.window = { __ModuleLoader__: { load: (config) => { captured = config; } } };
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (tag) => styleTags.push(tag) },
  };
  try {
    const stubReact = {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState: (v) => [v, () => {}],
      useEffect: () => {},
    };
    // eslint-disable-next-line no-new-func -- evaluating the browser bundle is the test
    new Function('window', 'document', 'require', clientSource)(
      globalThis.window,
      globalThis.document,
      (id) => {
        if (id === 'react') return stubReact;
        throw new Error(`unexpected require(${id})`);
      },
    );
    if (captured === null) throw new Error('the bundle never called __ModuleLoader__.load');
    if (captured.id !== specifier) throw new Error(`bundle id is "${captured.id}", expected "${specifier}"`);
    const mod2 = captured.factory((id) => {
      if (id === 'react') return stubReact;
      throw new Error(`unexpected require(${id})`);
    });
    if (typeof mod2.apply !== 'function') throw new Error('client apply is not a function');

    const registrations = [];
    let injectedKey = null;
    mod2.apply({
      slots: {
        inject: (key, cb) => { injectedKey = key; cb(); },
        register: (options) => { registrations.push(options); return () => {}; },
      },
    });
    if (injectedKey !== 'settings.section') throw new Error(`injected "${injectedKey}", expected settings.section`);
    const options = registrations[0];
    if (options === undefined) throw new Error('registered nothing');
    if (options.id !== 'models') throw new Error(`registered id "${options.id}", expected the shipped "models" cell`);
    return `slot=${injectedKey} id=${options.id} styles=${styleTags.length}`;
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
