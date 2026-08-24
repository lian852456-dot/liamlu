#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-node';

export const ONEDRIVE_GRAPH_SCOPES = Object.freeze(['Files.Read']);
export const DEFAULT_AUTH_MODE = 'renewable-oauth';
export const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/consumers';
export const DEFAULT_MSAL_CACHE_SERVICE = 'North12BOneDriveGraphMsalCache';
export const DEFAULT_DIRECT_TOKEN_SERVICE = 'North12BOneDriveGraphAccessToken';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const defaultConfigPath = path.join(projectRoot, 'report-automation', 'config', 'onedrive-graph-oauth.json');

function authError(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

export class AuthReconsentRequiredError extends Error {
  constructor(message = 'Microsoft interactive sign-in is required') {
    super(`AUTH_RECONSENT_REQUIRED: ${message}`);
    this.name = 'AuthReconsentRequiredError';
    this.code = 'AUTH_RECONSENT_REQUIRED';
  }
}

function accountName(env = process.env) {
  return String(env.ONEDRIVE_GRAPH_KEYCHAIN_ACCOUNT || env.USER || '').trim();
}

function runSecurity(args, { stdin = null, maxOutputBytes = 64 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let overflow = false;
    const collect = target => chunk => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    child.once('close', code => {
      if (overflow) {
        reject(authError('GRAPH_AUTH_KEYCHAIN_FAILED', 'macOS Keychain response exceeded the safety limit'));
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    if (stdin === null) child.stdin.end();
    else child.stdin.end(stdin);
  });
}

export class MacOSKeychainStore {
  constructor({ service, account, securityRunner = runSecurity } = {}) {
    this.service = String(service || DEFAULT_MSAL_CACHE_SERVICE).trim();
    this.account = String(account || accountName()).trim();
    this.securityRunner = securityRunner;
    if (!this.service) throw authError('GRAPH_AUTH_CONFIG_MISSING', 'Keychain service is missing');
    if (!this.account) throw authError('GRAPH_AUTH_CONFIG_MISSING', 'Keychain account is missing');
  }

  async get() {
    const result = await this.securityRunner([
      'find-generic-password', '-a', this.account, '-s', this.service, '-w',
    ]);
    if (result.code === 44) return null;
    if (result.code !== 0) {
      throw authError('GRAPH_AUTH_KEYCHAIN_FAILED', `unable to read Keychain service ${this.service}`);
    }
    return String(result.stdout || '');
  }

  async set(value) {
    if (typeof value !== 'string' || value.length === 0) {
      throw authError('GRAPH_AUTH_KEYCHAIN_FAILED', 'refusing to store an empty MSAL cache');
    }
    // Keep the serialized MSAL cache out of argv, logs and stdout. With -w as
    // the final option, macOS security reads the password value from stdin.
    const result = await this.securityRunner([
      'add-generic-password', '-a', this.account, '-s', this.service, '-U', '-w',
    ], { stdin: value });
    if (result.code !== 0) {
      throw authError('GRAPH_AUTH_KEYCHAIN_FAILED', `unable to update Keychain service ${this.service}`);
    }
  }
}

export function createMsalKeychainCachePlugin(store) {
  return {
    async beforeCacheAccess(cacheContext) {
      const serialized = await store.get();
      if (serialized) cacheContext.tokenCache.deserialize(serialized);
    },
    async afterCacheAccess(cacheContext) {
      if (cacheContext.cacheHasChanged) {
        await store.set(cacheContext.tokenCache.serialize());
      }
    },
  };
}

function validateClientId(value) {
  const clientId = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    throw authError('GRAPH_AUTH_CONFIG_MISSING', 'a valid Microsoft application clientId is required');
  }
  return clientId;
}

export async function loadOAuthConfig({ env = process.env, configPath } = {}) {
  const explicitClientId = String(env.ONEDRIVE_GRAPH_CLIENT_ID || '').trim();
  const resolvedPath = path.resolve(
    String(configPath || env.ONEDRIVE_GRAPH_OAUTH_CONFIG || defaultConfigPath).trim(),
  );
  let fileConfig = {};
  if (!explicitClientId) {
    try {
      fileConfig = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw authError('GRAPH_AUTH_CONFIG_INVALID', `unable to read OAuth config ${resolvedPath}`, error);
      }
    }
  }
  const clientId = validateClientId(explicitClientId || fileConfig.clientId);
  const authority = String(env.ONEDRIVE_GRAPH_AUTHORITY || fileConfig.authority || DEFAULT_AUTHORITY).trim();
  if (!/^https:\/\/login\.microsoftonline\.com\/(consumers|common)\/?$/i.test(authority)) {
    throw authError('GRAPH_AUTH_CONFIG_INVALID', 'authority must target Microsoft consumers or common');
  }
  return {
    clientId,
    authority: authority.replace(/\/$/, ''),
    scopes: [...ONEDRIVE_GRAPH_SCOPES],
    cacheService: String(
      env.ONEDRIVE_GRAPH_MSAL_CACHE_SERVICE
      || fileConfig.cacheService
      || DEFAULT_MSAL_CACHE_SERVICE,
    ).trim(),
  };
}

function createPublicClient({ config, cachePlugin, PublicClient = PublicClientApplication }) {
  return new PublicClient({
    auth: { clientId: config.clientId, authority: config.authority },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        loggerCallback() {},
        piiLoggingEnabled: false,
      },
    },
  });
}

function interactionRequired(error) {
  return error instanceof InteractionRequiredAuthError
    || error?.name === 'InteractionRequiredAuthError'
    || error?.errorCode === 'interaction_required'
    || error?.errorCode === 'consent_required'
    || error?.errorCode === 'login_required';
}

export async function acquireRenewableGraphAccessToken({
  env = process.env,
  config,
  configPath,
  cacheStore,
  PublicClient,
} = {}) {
  const oauth = config || await loadOAuthConfig({ env, configPath });
  const store = cacheStore || new MacOSKeychainStore({
    service: oauth.cacheService,
    account: accountName(env),
  });
  const client = createPublicClient({
    config: oauth,
    cachePlugin: createMsalKeychainCachePlugin(store),
    PublicClient,
  });
  let accounts;
  try {
    accounts = await client.getTokenCache().getAllAccounts();
  } catch (error) {
    throw authError('GRAPH_AUTH_KEYCHAIN_FAILED', 'unable to load the MSAL account cache', error);
  }
  if (accounts.length === 0) throw new AuthReconsentRequiredError('no cached Microsoft account');
  if (accounts.length !== 1) {
    throw authError('GRAPH_AUTH_ACCOUNT_AMBIGUOUS', 'MSAL cache contains more than one Microsoft account');
  }
  try {
    const result = await client.acquireTokenSilent({
      account: accounts[0],
      scopes: oauth.scopes,
    });
    if (!result?.accessToken) {
      throw authError('GRAPH_AUTH_FAILED', 'MSAL returned no access token');
    }
    return result.accessToken;
  } catch (error) {
    if (interactionRequired(error)) throw new AuthReconsentRequiredError();
    if (error?.code === 'GRAPH_AUTH_FAILED') throw error;
    throw authError('GRAPH_AUTH_FAILED', 'MSAL silent acquire/refresh failed', error);
  }
}

export async function loadDirectGraphAccessToken({ env = process.env, securityRunner = runSecurity } = {}) {
  const direct = String(env.ONEDRIVE_GRAPH_ACCESS_TOKEN || '').trim();
  if (direct) return direct;
  const tokenFile = String(env.ONEDRIVE_GRAPH_ACCESS_TOKEN_FILE || '').trim();
  if (tokenFile) {
    const value = String(await fs.readFile(path.resolve(tokenFile), 'utf8')).trim();
    if (value) return value;
  }
  const service = String(env.ONEDRIVE_GRAPH_KEYCHAIN_SERVICE || DEFAULT_DIRECT_TOKEN_SERVICE).trim();
  const account = accountName(env);
  if (!account) throw authError('GRAPH_AUTH_CONFIG_MISSING', 'direct-token Keychain account is missing');
  const result = await securityRunner([
    'find-generic-password', '-a', account, '-s', service, '-w',
  ]);
  if (result.code === 0 && String(result.stdout || '').trim()) return String(result.stdout).trim();
  throw authError(
    'GRAPH_AUTH_DIRECT_TOKEN_UNAVAILABLE',
    `direct-token credential is unavailable (Keychain service ${service}); local fallback is OFF`,
  );
}

export async function acquireOneDriveGraphAccessToken({
  env = process.env,
  mode = env.ONEDRIVE_GRAPH_AUTH_MODE || DEFAULT_AUTH_MODE,
  ...options
} = {}) {
  const normalized = String(mode).trim().toLowerCase();
  if (normalized === 'renewable-oauth') {
    return acquireRenewableGraphAccessToken({ env, ...options });
  }
  if (normalized === 'direct-token') {
    return loadDirectGraphAccessToken({ env, ...options });
  }
  throw authError(
    'GRAPH_AUTH_MODE_INVALID',
    'ONEDRIVE_GRAPH_AUTH_MODE must be renewable-oauth or direct-token',
  );
}

function openSystemBrowser(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/open', [url], { stdio: ['ignore', 'ignore', 'ignore'] });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(authError('GRAPH_AUTH_BROWSER_FAILED', 'unable to open the Microsoft sign-in page'));
    });
  });
}

export async function interactiveLogin({
  env = process.env,
  config,
  configPath,
  cacheStore,
  PublicClient,
  openBrowser = openSystemBrowser,
} = {}) {
  const oauth = config || await loadOAuthConfig({ env, configPath });
  const store = cacheStore || new MacOSKeychainStore({
    service: oauth.cacheService,
    account: accountName(env),
  });
  const client = createPublicClient({
    config: oauth,
    cachePlugin: createMsalKeychainCachePlugin(store),
    PublicClient,
  });
  const result = await client.acquireTokenInteractive({
    scopes: oauth.scopes,
    openBrowser,
    prompt: 'select_account',
    successTemplate: '<h1>North12B OneDrive authorization complete</h1><p>You may close this tab.</p>',
    errorTemplate: '<h1>North12B OneDrive authorization failed</h1><p>Return to Codex for the fail-closed status.</p>',
  });
  if (!result?.accessToken || !result?.account) {
    throw authError('GRAPH_AUTH_FAILED', 'interactive sign-in returned no usable account');
  }
  return {
    status: 'authenticated',
    provider: 'microsoft-graph-delegated-oauth',
    scopes: [...oauth.scopes],
    offline_access: 'msal-default-scope-and-keychain-cache',
    expiresOn: result.expiresOn?.toISOString?.() || null,
  };
}

async function main() {
  const command = String(process.argv[2] || 'status').trim();
  if (command === 'login') {
    const result = await interactiveLogin();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'status') {
    await acquireRenewableGraphAccessToken();
    console.log(JSON.stringify({
      status: 'authenticated',
      provider: 'microsoft-graph-delegated-oauth',
      scopes: [...ONEDRIVE_GRAPH_SCOPES],
      credential: 'msal-keychain-cache',
    }, null, 2));
    return;
  }
  throw authError('GRAPH_AUTH_COMMAND_INVALID', 'usage: onedrive_graph_auth.mjs [status|login]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
