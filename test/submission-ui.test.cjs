const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');

async function check(origin, backend, returning = false) {
  const ids = ['ladder-login','ladder-logout','submit-form','submit-status','submit-button','submit-source-choice','submit-endpoint','submit-file','submit-source-field','submit-mcp-field'];
  const elements = Object.fromEntries(ids.map(id => [id, {}]));
  elements['submit-form'].elements = {namedItem: () => ({value: 'mcp'})};
  elements['submit-form'].querySelectorAll = () => [];
  const items = new Map(returning ? [['qiling-login-return','ladder']] : []);
  const storage = {getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key)};
  let callback, loginOptions, tabOpened = false;
  const auth = {
    getSession: async () => ({data: {session: null}, error: null}),
    onAuthStateChange: cb => { callback = cb; },
    signInWithOAuth: async options => { loginOptions = options; return {error: null}; },
    signOut: async () => { callback('SIGNED_OUT', null); return {error: null}; }
  };
  const window = {SANDGOD_GAME_SERVER: backend, supabase: {createClient: () => ({auth})}};
  const location = new URL(origin);
  const document = {getElementById: id => elements[id], querySelector: () => ({click: () => { tabOpened = true; }})};
  const source = readFileSync('public/submission.js', 'utf8').replace(/^import .*\n/, "const publishableKey = 'test';\n");
  vm.runInNewContext(source, {window, document, location, sessionStorage: storage, URL, setTimeout});
  await Promise.resolve();
  return {elements, callback, storage, auth, getLoginOptions: () => loginOptions, tabOpened};
}

(async () => {
  const local = await check('http://localhost:3000/', '', true);
  assert.equal(local.tabOpened, true);
  assert.equal(local.elements['ladder-login'].disabled, false);
  local.elements['ladder-login'].onclick();
  await Promise.resolve();
  assert.equal(local.getLoginOptions().provider, 'github');
  assert.equal(local.getLoginOptions().options.redirectTo, 'http://localhost:3000/');
  local.callback('SIGNED_IN', {access_token: 'test'});
  assert.equal(local.elements['ladder-login'].hidden, true);
  assert.equal(local.elements['ladder-logout'].hidden, false);
  assert.equal(local.elements['submit-form'].hidden, true);
  local.elements['ladder-logout'].onclick();
  await Promise.resolve();
  assert.equal(local.elements['ladder-login'].hidden, false);
  const publicSite = await check('https://irade-tqy.github.io/sandGod/', 'https://arena.example');
  publicSite.callback('SIGNED_IN', {access_token: 'test'});
  assert.equal(publicSite.elements['submit-form'].hidden, false);
  const other = await check('http://192.168.1.2:3000/', '');
  assert.equal(other.elements['ladder-login'].disabled, true);
  console.log('GitHub login UI checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
