import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthReconsentRequiredError,
  MacOSKeychainStore,
  acquireOneDriveGraphAccessToken,
  acquireRenewableGraphAccessToken,
  createMsalKeychainCachePlugin,
} from './onedrive_graph_auth.mjs';

const config = {
  clientId: '11111111-1111-4111-8111-111111111111',
  authority: 'https://login.microsoftonline.com/consumers',
  scopes: ['Files.Read'],
  cacheService: 'test-cache',
};

function fakePublicClient({ accounts = [{ homeAccountId: 'liam' }], result, error } = {}) {
  return class FakePublicClient {
    constructor(msalConfig) { this.msalConfig = msalConfig; }
    getTokenCache() { return { async getAllAccounts() { return accounts; } }; }
    async acquireTokenSilent(request) {
      assert.deepEqual(request.scopes, ['Files.Read']);
      if (error) throw error;
      return result || { accessToken: 'memory-only-access-token' };
    }
  };
}

test('production default is renewable OAuth and ignores an available direct token', async () => {
  const token = await acquireOneDriveGraphAccessToken({
    env: { USER: 'liam', ONEDRIVE_GRAPH_ACCESS_TOKEN: 'emergency-token' },
    config,
    cacheStore: { async get() { return null; }, async set() {} },
    PublicClient: fakePublicClient(),
  });
  assert.equal(token, 'memory-only-access-token');
});

test('direct token remains available only in explicit direct-token mode', async () => {
  const token = await acquireOneDriveGraphAccessToken({
    mode: 'direct-token',
    env: { USER: 'liam', ONEDRIVE_GRAPH_ACCESS_TOKEN: 'emergency-token' },
  });
  assert.equal(token, 'emergency-token');
});

test('no cached account is the precise AUTH_RECONSENT_REQUIRED state', async () => {
  await assert.rejects(
    acquireRenewableGraphAccessToken({
      config,
      cacheStore: { async get() { return null; }, async set() {} },
      PublicClient: fakePublicClient({ accounts: [] }),
    }),
    error => error instanceof AuthReconsentRequiredError && error.code === 'AUTH_RECONSENT_REQUIRED',
  );
});

test('MSAL interaction-required is mapped to AUTH_RECONSENT_REQUIRED', async () => {
  await assert.rejects(
    acquireRenewableGraphAccessToken({
      config,
      cacheStore: { async get() { return null; }, async set() {} },
      PublicClient: fakePublicClient({ error: { name: 'InteractionRequiredAuthError' } }),
    }),
    error => error.code === 'AUTH_RECONSENT_REQUIRED',
  );
});

test('network and refresh failures remain GRAPH_AUTH_FAILED, not reconsent', async () => {
  await assert.rejects(
    acquireRenewableGraphAccessToken({
      config,
      cacheStore: { async get() { return null; }, async set() {} },
      PublicClient: fakePublicClient({ error: new Error('network unavailable') }),
    }),
    error => error.code === 'GRAPH_AUTH_FAILED' && !String(error.message).includes('network unavailable'),
  );
});

test('MSAL cache plugin reads and writes only through the injected Keychain store', async () => {
  const calls = [];
  const plugin = createMsalKeychainCachePlugin({
    async get() { calls.push(['get']); return '{"cache":"secret"}'; },
    async set(value) { calls.push(['set', value]); },
  });
  const tokenCache = {
    deserialize(value) { calls.push(['deserialize', value]); },
    serialize() { calls.push(['serialize']); return '{"updated":"secret"}'; },
  };
  await plugin.beforeCacheAccess({ tokenCache });
  await plugin.afterCacheAccess({ tokenCache, cacheHasChanged: true });
  assert.deepEqual(calls, [
    ['get'],
    ['deserialize', '{"cache":"secret"}'],
    ['serialize'],
    ['set', '{"updated":"secret"}'],
  ]);
});

test('Keychain writes serialized cache through stdin, never argv', async () => {
  const calls = [];
  const store = new MacOSKeychainStore({
    service: 'test-service',
    account: 'test-account',
    async securityRunner(args, options) {
      calls.push({ args, options });
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  await store.set('serialized-refresh-credential');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes('serialized-refresh-credential'), false);
  assert.equal(calls[0].args.at(-1), '-w');
  assert.equal(calls[0].options.stdin, 'serialized-refresh-credential');
});
