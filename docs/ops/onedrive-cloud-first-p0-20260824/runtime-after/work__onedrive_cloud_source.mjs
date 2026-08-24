import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const ONEDRIVE_PROVIDER = 'onedrive-cloud';
export const CANONICAL_AWARDS_BASENAMES = Object.freeze({
  store: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
  person: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
});

function blocked(message) {
  throw new Error(`OneDrive cloud source blocked: ${message}`);
}

function requiredString(value, label) {
  const text = String(value || '').trim();
  if (!text) blocked(`${label} is missing`);
  return text;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeSegment(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
}

function encodeGraphPath(folderPath) {
  return String(folderPath || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export function kpiBasenameForRunDate(reportRunDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportRunDate || ''))) {
    blocked('report run date is invalid');
  }
  return `${reportRunDate.slice(5).replace('-', '')}.xlsx`;
}

function canonicalItem(item, expectedName, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    blocked(`${label} item is missing`);
  }
  if (String(item.name || '') !== expectedName) {
    blocked(`${label} canonical name mismatch: expected ${expectedName}, got ${String(item.name || '')}`);
  }
  if (!item.file || item.folder) blocked(`${label} is not a file`);
  const id = requiredString(item.id, `${label} driveItemId`);
  const lastModifiedDateTime = requiredString(item.lastModifiedDateTime, `${label} lastModifiedDateTime`);
  if (Number.isNaN(Date.parse(lastModifiedDateTime))) blocked(`${label} lastModifiedDateTime is invalid`);
  const eTag = requiredString(item.eTag, `${label} eTag`);
  const size = Number(item.size);
  if (!Number.isSafeInteger(size) || size <= 0) blocked(`${label} size is invalid`);
  return {
    provider: ONEDRIVE_PROVIDER,
    driveItemId: id,
    name: expectedName,
    canonical_basename: expectedName,
    lastModifiedDateTime,
    eTag,
    size,
  };
}

export function selectCanonicalCloudItems(items, reportRunDate, requiredKinds = ['kpi', 'store', 'person']) {
  if (!Array.isArray(items)) blocked('folder listing is missing');
  const expected = {
    kpi: kpiBasenameForRunDate(reportRunDate),
    ...CANONICAL_AWARDS_BASENAMES,
  };
  const selected = {};
  for (const kind of requiredKinds) {
    const basename = expected[kind];
    if (!basename) blocked(`unknown source kind: ${kind}`);
    const matches = items.filter(item => String(item && item.name || '') === basename);
    if (matches.length !== 1) {
      blocked(`${kind} canonical item count must be 1 for ${basename}; got ${matches.length}`);
    }
    selected[kind] = canonicalItem(matches[0], basename, kind);
  }
  return selected;
}

export function cloudVersionChanged(current, previous) {
  if (!current || !previous) return true;
  return String(current.driveItemId || '') !== String(previous.driveItemId || '')
    || String(current.eTag || '') !== String(previous.eTag || '')
    || String(current.lastModifiedDateTime || '') !== String(previous.lastModifiedDateTime || '');
}

export function validateAwardsCloudFreshness(current, previous) {
  if (!current || !current.store || !current.person) blocked('awards cloud source pair is incomplete');
  for (const kind of ['store', 'person']) {
    if (current[kind].provider !== ONEDRIVE_PROVIDER) blocked(`${kind} provider is not ${ONEDRIVE_PROVIDER}`);
  }
  if (!previous || !previous.store || !previous.person
      || previous.store.provider !== ONEDRIVE_PROVIDER
      || previous.person.provider !== ONEDRIVE_PROVIDER) {
    return { status: 'fresh-cloud-baseline', changed: { store: true, person: true } };
  }
  const changed = {
    store: cloudVersionChanged(current.store, previous.store),
    person: cloudVersionChanged(current.person, previous.person),
  };
  if (!changed.store && !changed.person) {
    blocked('store/person cloud item ID, eTag and lastModifiedDateTime are unchanged');
  }
  if (!changed.store || !changed.person) {
    blocked(`awards cloud pair is partially updated: store=${changed.store}, person=${changed.person}`);
  }
  return { status: 'fresh', changed };
}

export class OneDriveGraphClient {
  constructor({ accessToken, fetchImpl = globalThis.fetch, graphBaseUrl = 'https://graph.microsoft.com/v1.0' } = {}) {
    this.accessToken = requiredString(accessToken, 'Graph access token');
    if (typeof fetchImpl !== 'function') blocked('fetch implementation is missing');
    this.fetchImpl = fetchImpl;
    this.graphBaseUrl = String(graphBaseUrl || '').replace(/\/$/, '');
  }

  async request(url, options = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        redirect: 'follow',
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
    } catch (error) {
      blocked(`Graph request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      const requestId = response.headers?.get?.('request-id') || response.headers?.get?.('client-request-id') || '';
      blocked(`Graph request returned HTTP ${response.status}${requestId ? ` (request-id ${requestId})` : ''}`);
    }
    return response;
  }

  async listFolderChildren(folderPath = 'TWM每日戰報') {
    const encodedPath = encodeGraphPath(folderPath);
    let url = `${this.graphBaseUrl}/me/drive/root:/${encodedPath}:/children?$select=id,name,eTag,lastModifiedDateTime,size,file,folder,parentReference`;
    const items = [];
    while (url) {
      const response = await this.request(url);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.value)) blocked('Graph folder listing response is invalid');
      items.push(...payload.value);
      const next = String(payload['@odata.nextLink'] || '');
      if (next && !next.startsWith(`${this.graphBaseUrl}/`)) blocked('Graph pagination URL is outside the configured Graph endpoint');
      url = next;
    }
    return items;
  }

  async downloadItem(driveItemId) {
    const id = requiredString(driveItemId, 'driveItemId');
    const response = await this.request(`${this.graphBaseUrl}/me/drive/items/${encodeURIComponent(id)}/content`, {
      headers: { Accept: 'application/octet-stream' },
    });
    return Buffer.from(await response.arrayBuffer());
  }
}

async function stageOne({ kind, identity, bytes, stagingDir, runId }) {
  if (bytes.length !== identity.size) {
    blocked(`${kind} cloud download size mismatch: expected ${identity.size}, got ${bytes.length}`);
  }
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    blocked(`${kind} cloud download is not an xlsx zip`);
  }
  const digest = sha256(bytes);
  const itemSegment = safeSegment(identity.driveItemId, 'item');
  const runSegment = safeSegment(runId, 'run');
  const filename = `${kind}--${runSegment}--${itemSegment}--${digest.slice(0, 16)}--${identity.canonical_basename}`;
  const stagedPath = path.join(stagingDir, filename);
  await fs.writeFile(stagedPath, bytes, { flag: 'wx' });
  const stagedBytes = await fs.readFile(stagedPath);
  const stagedSha256 = sha256(stagedBytes);
  if (stagedSha256 !== digest) blocked(`${kind} staged SHA-256 mismatch`);
  return {
    ...identity,
    sha256: digest,
    run_id: runId,
    staged_path: stagedPath,
    staged_sha256: stagedSha256,
  };
}

export async function resolveOneDriveCloudSourceSet({
  graphClient,
  reportRunDate,
  runId = `cloud-${String(reportRunDate || '').replaceAll('-', '')}-${Date.now()}-${randomBytes(4).toString('hex')}`,
  stagingRoot,
  folderPath = 'TWM每日戰報',
  previousAwardsIdentity = null,
  requiredKinds = ['kpi', 'store', 'person'],
  localFallbackEnabled = false,
  localResolver = null,
} = {}) {
  if (!graphClient || typeof graphClient.listFolderChildren !== 'function' || typeof graphClient.downloadItem !== 'function') {
    blocked('Graph client is missing');
  }
  if (localFallbackEnabled || localResolver) {
    blocked('production resolver does not permit local fallback; use the separate local-emergency mode');
  }
  const root = requiredString(stagingRoot, 'staging root');
  const stagingDir = path.join(root, safeSegment(runId, 'run'));
  await fs.mkdir(stagingDir, { recursive: false });
  let items;
  try {
    items = await graphClient.listFolderChildren(folderPath);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const selected = selectCanonicalCloudItems(items, reportRunDate, requiredKinds);
  const downloaded = {};
  for (const kind of requiredKinds) {
    const bytes = await graphClient.downloadItem(selected[kind].driveItemId);
    downloaded[kind] = await stageOne({ kind, identity: selected[kind], bytes, stagingDir, runId });
  }
  const freshness = requiredKinds.includes('store') && requiredKinds.includes('person')
    ? validateAwardsCloudFreshness(
      { store: downloaded.store, person: downloaded.person },
      previousAwardsIdentity,
    )
    : { status: 'not-applicable', changed: {} };
  return {
    schema_version: 'north12b-onedrive-cloud-source/v1',
    provider: ONEDRIVE_PROVIDER,
    report_run_date: reportRunDate,
    run_id: runId,
    folder_path: folderPath,
    staging_dir: stagingDir,
    sources: downloaded,
    awards_freshness: freshness,
  };
}
