import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const META_STATUS = '__PRIVATE_DASHBOARD_HTTP_STATUS__';
const META_URL = '__PRIVATE_DASHBOARD_FINAL_URL__';
const META_CONTENT_TYPE = '__PRIVATE_DASHBOARD_CONTENT_TYPE__';

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

export async function postPrivateDashboardJson({ endpoint, payload, curlBin = 'curl', curlRunner = runCurl }) {
  const requestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'north12b-private-dashboard-'));
  const requestPath = path.join(requestDir, 'request.json');
  const responsePath = path.join(requestDir, 'response.json');
  try {
    await fs.writeFile(requestPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    const result = await curlRunner(curlBin, [
      '-sS', '-L', '--fail-with-body',
      '-H', 'Content-Type: application/json; charset=utf-8',
      '-H', 'Accept: application/json',
      '--data-binary', `@${requestPath}`,
      endpoint,
      '-o', responsePath,
      '-w', `${META_STATUS}%{http_code}\\n${META_URL}%{url_effective}\\n${META_CONTENT_TYPE}%{content_type}\\n`,
    ]);
    const body = await fs.readFile(responsePath, 'utf8').catch(() => '');
    const details = { ...parseMeta(result.stdout), responsePreview: responsePreview(body) };
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
      return JSON.parse(body);
    } catch {
      throw new PrivateDashboardTransportError('response body is not valid JSON', details);
    }
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
}
