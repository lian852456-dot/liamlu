import fs from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_KEYS = [
  'timestamp', 'report_date', 'cutoff', 'run_id', 'component', 'action', 'attempt',
  'http_status', 'response_url', 'redirected', 'content_type', 'exception_type',
  'retrying', 'retry_succeeded',
];

export function safePublicationAttemptRecord(value = {}) {
  return Object.fromEntries(ALLOWED_KEYS.map(key => [key, value[key] ?? null]));
}

export function createPublicationAttemptLogger(file) {
  return async record => {
    const absolute = path.resolve(file);
    await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await fs.appendFile(absolute, `${JSON.stringify(safePublicationAttemptRecord(record))}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(absolute, 0o600);
  };
}
