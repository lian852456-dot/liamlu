const SOURCE_DATE_RANGE = /^(\d{4})\/(\d{2})\/(\d{2})\s*(?:~|～)\s*(?:(\d{4})\/(\d{2})\/(\d{2})|(\d{2})\/(\d{2}))$/;

function blocked(message) {
  throw new Error(`source_date_range blocked: ${message}`);
}

function parseDate(year, month, day, label) {
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== iso) {
    blocked(`${label} is invalid: ${iso}`);
  }
  return iso;
}

function parseReportRunDate(reportRunDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(reportRunDate || '').trim());
  if (!match) blocked(`report run date is invalid: ${String(reportRunDate || '')}`);
  return parseDate(match[1], match[2], match[3], 'report run date');
}

export function dataCutoffDateFromSourceRange(sourceDateRange, reportRunDate) {
  const raw = String(sourceDateRange || '').trim();
  const match = SOURCE_DATE_RANGE.exec(raw);
  if (!match) blocked(`format is unsupported: ${raw}`);

  const startDate = parseDate(match[1], match[2], match[3], 'start date');
  const endDate = match[4]
    ? parseDate(match[4], match[5], match[6], 'end date')
    : parseDate(match[1], match[7], match[8], 'end date');
  if (endDate < startDate) blocked(`end date precedes start date: ${raw}`);

  const runDate = parseReportRunDate(reportRunDate);
  if (endDate > runDate) blocked(`end date is after report run date: ${endDate}`);
  return endDate;
}

export function extractSourceDateRange(sheetValues, reportRunDate) {
  for (const row of sheetValues) {
    for (const value of row) {
      if (typeof value !== 'string') continue;
      const raw = value.trim();
      try {
        dataCutoffDateFromSourceRange(raw, reportRunDate);
        return raw;
      } catch {
        // Keep scanning: non-range strings and invalid ranges are not source metadata.
      }
    }
  }
  return '';
}
