import path from 'node:path';
import {
  postPrivateDashboardJson,
  withTransientPrivateDashboardRetry,
} from './private_dashboard_transport.mjs';
import { createPublicationAttemptLogger } from './publication_attempt_log.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

export function publicationAttemptLogPath(reportDate) {
  const compact = String(reportDate || '').replaceAll('-', '') || 'unknown-date';
  return path.join(projectRoot, 'report-automation', 'logs', `publication-attempts-${compact}.jsonl`);
}

export async function postPublicationJson({
  endpoint,
  payload,
  reportDate,
  cutoff,
  runId,
  component,
  action,
  curlBin = process.env.PRIVATE_DASHBOARD_CURL_BIN || 'curl',
  curlRunner,
  delaysMs,
  sleep,
  logAttempt,
}) {
  const logger = logAttempt || createPublicationAttemptLogger(publicationAttemptLogPath(reportDate));
  return withTransientPrivateDashboardRetry(
    () => postPrivateDashboardJson({ endpoint, payload, curlBin, ...(curlRunner ? { curlRunner } : {}) }),
    {
      ...(delaysMs ? { delaysMs } : {}),
      ...(sleep ? { sleep } : {}),
      logAttempt: logger,
      context: { reportDate, cutoff, runId, component, action, endpoint },
    },
  );
}
