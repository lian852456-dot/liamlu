import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const META_STATUS = '__PRIVATE_DASHBOARD_HTTP_STATUS__';
const META_URL = '__PRIVATE_DASHBOARD_FINAL_URL__';
const META_CONTENT_TYPE = '__PRIVATE_DASHBOARD_CONTENT_TYPE__';
export const TRANSIENT_HTTP_STATUSES = new Set([404, 429, 500, 502, 503, 504]);
export const DEFAULT_RETRY_DELAYS_MS = [2000, 5000];

export class PrivateDashboardTransportError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'PrivateDashboardTransportError';
    this.details = details;
  }
}

function runCurl(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

function parseMeta(output) {
  const statusMatch = output.match(new RegExp(`${META_STATUS}(\\d+)`));
  const urlMatch = output.match(new RegExp(`${META_URL}([^\\n]*)`));
  const contentTypeMatch = output.match(new RegExp(`${META_CONTENT_TYPE}([^\\n]*)`));
  return {
    status: Number(statusMatch && statusMatch[1]),
    finalUrl: (urlMatch && urlMatch[1]) || '',
    contentType: (contentTypeMatch && contentTypeMatch[1]) || '',
  };
}

function responsePreview(text) {
  return text.slice(0, 300).replace(/\s+/g, ' ').trim();
}

export function sanitizedResponseUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isTransientPrivateDashboardError(error) {
  if (!(error instanceof PrivateDashboardTransportError)) return false;
  const status = Number(error.details?.status || 0);
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true;
  return ['NetworkError', 'TimeoutError'].includes(String(error.details?.exceptionType || ''));
}

function retryRecord(error, context, attempt, retrying, retrySucceeded = false) {
  const details = error instanceof PrivateDashboardTransportError ? (error.details || {}) : {};
  return {
    timestamp: new Date().toISOString(),
    report_date: String(context.reportDate || ''),
    cutoff: String(context.cutoff || ''),
    run_id: String(context.runId || ''),
    component: String(context.component || ''),
    action: String(context.action || ''),
    attempt,
    http_status: Number(details.status || 0) || null,
    response_url: sanitizedResponseUrl(details.finalUrl || context.endpoint || ''),
    redirected: Boolean(details.redirected),
    content_type: String(details.contentType || ''),
    exception_type: String(details.exceptionType || error?.name || 'Error'),
    retrying,
    retry_succeeded: retrySucceeded,
  };
}

export async function withTransientPrivateDashboardRetry(operation, {
  delaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  context = {},
  logAttempt = () => {},
} = {}) {
  let lastRetryRecord = null;
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt += 1) {
    try {
      const result = await operation(attempt);
      if (attempt > 1 && lastRetryRecord) {
        await logAttempt({ ...lastRetryRecord, timestamp: new Date().toISOString(), retrying: false, retry_succeeded: true });
      }
      return result;
    } catch (error) {
      const retrying = isTransientPrivateDashboardError(error) && attempt <= delaysMs.length;
      const record = retryRecord(error, context, attempt, retrying, false);
      await logAttempt(record);
      lastRetryRecord = record;
      if (!retrying) throw error;
      await sleep(delaysMs[attempt - 1]);
    }
  }
  throw new Error('unreachable retry state');
}

export async function postPrivateDashboardJson({ endpoint, payload, curlBin = 'curl', curlRunner = runCurl }) {
  const requestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'north12b-private-dashboard-'));
  const requestPath = path.join(requestDir, 'request.json');
  const responsePath = path.join(requestDir, 'response.json');
  try {
    await fs.writeFile(requestPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    let result;
    try {
      result = await curlRunner(curlBin, [
        '-sS',
        '-L',
        '--connect-timeout', '10',
        '--max-time', '30',
        '--fail-with-body',
        '-H', 'Content-Type: application/json; charset=utf-8',
        '-H', 'Accept: application/json',
        '--data-binary', `@${requestPath}`,
        endpoint,
        '-o', responsePath,
        '-w', `${META_STATUS}%{http_code}\\n${META_URL}%{url_effective}\\n${META_CONTENT_TYPE}%{content_type}\\n`,
      ]);
    } catch (error) {
      throw new PrivateDashboardTransportError('network request could not start', {
        status: null,
        finalUrl: sanitizedResponseUrl(endpoint),
        contentType: '',
        redirected: false,
        exceptionType: error?.name === 'AbortError' ? 'TimeoutError' : 'NetworkError',
      });
    }
    const text = await fs.readFile(responsePath, 'utf8').catch(() => '');
    const parsed = parseMeta(result.stdout);
    const endpointUrl = sanitizedResponseUrl(endpoint);
    const finalUrl = sanitizedResponseUrl(parsed.finalUrl || endpoint);
    const details = {
      ...parsed,
      finalUrl,
      redirected: Boolean(endpointUrl && finalUrl && endpointUrl !== finalUrl),
      exceptionType: result.code === 28 ? 'TimeoutError' : (result.code !== 0 ? 'NetworkError' : ''),
      responsePreview: responsePreview(text),
    };
    if (result.code !== 0) {
      throw new PrivateDashboardTransportError(`curl failed with exit ${result.code}`, { ...details, stderr: result.stderr.trim() });
    }
    if (!details.status || details.status < 200 || details.status >= 300) {
      throw new PrivateDashboardTransportError(`unexpected HTTP status ${details.status || 'unknown'}`, details);
    }
    if (!/^application\/json(?:;|$)/i.test(details.contentType)) {
      throw new PrivateDashboardTransportError('response Content-Type is not application/json', details);
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new PrivateDashboardTransportError('response body is not valid JSON', details);
    }
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
}
