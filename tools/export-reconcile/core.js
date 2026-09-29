(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExportReconcile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ROWS = 50000;
  // One input row may generate multiple log records (for example, key + date).
  const MAX_EXPORT_ROWS = 150000;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  class ReconcileError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'ReconcileError';
      this.code = code;
      this.details = details || {};
    }
  }

  function fail(code, message, details) {
    throw new ReconcileError(code, message, details);
  }

  function validateHeaders(headers) {
    if (!Array.isArray(headers) || !headers.length) {
      fail('EMPTY_HEADERS', 'CSV needs at least one named column.');
    }
    const seen = new Set();
    headers.forEach((header, index) => {
      if (typeof header !== 'string' || !header.trim()) {
        fail('EMPTY_HEADER', `Column ${index + 1} has no header.`, { column: index + 1 });
      }
      if (seen.has(header)) {
        fail('DUPLICATE_HEADER', `Header "${header}" appears more than once.`, { header });
      }
      seen.add(header);
    });
  }

  // Record numbers include the header. Quoted multiline cells remain one record.
  function parseCSV(text) {
    if (typeof text !== 'string') fail('INVALID_TEXT', 'CSV input must be text.');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (!text.length) fail('EMPTY_CSV', 'CSV is empty.');
    const records = [];
    let record = [];
    let field = '';
    let inQuotes = false;
    let afterQuote = false;
    let started = false;

    function finishField() {
      record.push(field);
      field = '';
      afterQuote = false;
      started = false;
    }
    function finishRecord() {
      finishField();
      records.push(record);
      record = [];
      if (records.length > MAX_ROWS + 1) {
        fail('ROW_LIMIT', `A CSV may contain at most ${MAX_ROWS.toLocaleString('en-US')} data rows.`);
      }
    }

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
            afterQuote = true;
          }
        } else {
          field += char;
        }
        continue;
      }
      if (afterQuote && char !== ',' && char !== '\r' && char !== '\n') {
        fail('AFTER_QUOTE', `Unexpected character after a closing quote in record ${records.length + 1}.`, {
          row: records.length + 1, column: record.length + 1
        });
      }
      if (char === '"') {
        if (started || field.length) {
          fail('UNEXPECTED_QUOTE', `Quote inside an unquoted field in record ${records.length + 1}.`, {
            row: records.length + 1, column: record.length + 1
          });
        }
        inQuotes = true;
        started = true;
      } else if (char === ',') {
        finishField();
      } else if (char === '\r' || char === '\n') {
        finishRecord();
        if (char === '\r' && text[i + 1] === '\n') i += 1;
      } else {
        field += char;
        started = true;
      }
    }
    if (inQuotes) fail('UNCLOSED_QUOTE', 'CSV ends inside a quoted field.', { row: records.length + 1 });
    if (started || afterQuote || record.length) finishRecord();
    const headers = records.shift();
    validateHeaders(headers);
    const rows = records.map((values, index) => {
      if (values.length !== headers.length) {
        fail('ROW_WIDTH', `Record ${index + 2} has ${values.length} cells; expected ${headers.length}.`, {
          row: index + 2, expected: headers.length, actual: values.length
        });
      }
      const row = Object.create(null);
      headers.forEach((header, column) => { row[header] = values[column]; });
      return row;
    });
    return { headers, rows };
  }

  function validateParsed(parsed, label, rowLimit = MAX_ROWS) {
    if (!parsed || !Array.isArray(parsed.rows)) fail('INVALID_PARSED', `${label} must contain headers and rows.`);
    validateHeaders(parsed.headers);
    if (parsed.rows.length > rowLimit) fail('ROW_LIMIT', `${label} exceeds ${rowLimit} data rows.`);
    const headers = parsed.headers;
    parsed.rows.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) ||
          Object.keys(row).length !== headers.length ||
          headers.some(header => !own(row, header) || typeof row[header] !== 'string')) {
        fail('INVALID_ROW', `${label} record ${index + 2} must contain exactly the named columns as text.`, {
          source: label, row: index + 2
        });
      }
    });
  }

  function cloneRow(headers, row) {
    const result = Object.create(null);
    headers.forEach(header => { result[header] = row[header]; });
    return result;
  }

  function sameRow(headers, a, b) {
    return headers.every(header => a[header] === b[header]);
  }

  // Accepted: YYYY-MM-DD (UTC midnight), or YYYY-MM-DDTHH:mm[:ss[.SSS]]Z/±HH:mm.
  // Validate calendar parts before conversion; Date.parse can normalize impossible dates.
  function isoTimestamp(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const millisecond = Number((match[7] || '').padEnd(3, '0'));
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
        hour > 23 || minute > 59 || second > 59) return null;
    let offset = 0;
    const zone = match[8];
    if (zone && zone !== 'Z') {
      const offsetHours = Number(zone.slice(1, 3));
      const offsetMinutes = Number(zone.slice(4, 6));
      if (offsetHours > 23 || offsetMinutes > 59) return null;
      offset = (offsetHours * 60 + offsetMinutes) * (zone[0] === '+' ? 1 : -1);
    }
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    return date.getTime() - offset * 60000;
  }

  function reconcile(masterParsed, incomingParsed, options) {
    validateParsed(masterParsed, 'master');
    validateParsed(incomingParsed, 'incoming');
    const headers = masterParsed.headers.slice();
    if (headers.length !== incomingParsed.headers.length ||
        headers.some(header => !incomingParsed.headers.includes(header))) {
      fail('HEADER_MISMATCH', 'Both files must have the same exact header names; column order may differ.');
    }
    const keyColumn = options && options.key;
    const dateColumn = options && options.date;
    if (!headers.includes(keyColumn) || !headers.includes(dateColumn)) {
      fail('INVALID_COLUMNS', 'Select an existing key column and an existing date column.');
    }
    const rows = masterParsed.rows.map(row => cloneRow(headers, row));
    const issues = [];
    const changes = [];
    const masterIndex = new Map();
    const incomingGroups = new Map();
    const invalidMasterRows = new Set();
    const invalidIncomingRows = new Set();
    const stats = {
      masterRows: masterParsed.rows.length,
      incomingRows: incomingParsed.rows.length,
      outputRows: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      conflictKeys: 0,
      invalidMasterRows: 0,
      invalidIncomingRows: 0,
      duplicateIncomingRows: 0,
      olderIncomingKeys: 0,
      unchangedIncomingKeys: 0,
      invalidMasterBlockedKeys: 0,
      issueCount: 0
    };

    function issue(code, source, row, key, message, details) {
      const item = { code, severity: 'warning', source, row, key, message };
      if (details) item.details = details;
      issues.push(item);
    }

    masterParsed.rows.forEach((row, index) => {
      const key = row[keyColumn];
      const time = isoTimestamp(row[dateColumn]);
      if (!key.trim()) {
        invalidMasterRows.add(index);
        issue('MISSING_KEY', 'master', index + 2, key, 'Master row has a blank key; retained without matching.');
      } else {
        if (masterIndex.has(key)) {
          fail('DUPLICATE_MASTER_KEY', `Master key "${key}" appears more than once; resolve it before merging.`, {
            key, rows: [masterIndex.get(key).index + 2, index + 2]
          });
        }
        masterIndex.set(key, { row, index, time });
      }
      if (time === null) {
        invalidMasterRows.add(index);
        issue('INVALID_DATE', 'master', index + 2, key, 'Master date is not a supported valid ISO date; row retained.', {
          value: row[dateColumn]
        });
      }
    });

    incomingParsed.rows.forEach((row, index) => {
      const key = row[keyColumn];
      const time = isoTimestamp(row[dateColumn]);
      if (!key.trim()) {
        invalidIncomingRows.add(index);
        issue('MISSING_KEY', 'incoming', index + 2, key, 'Incoming row has a blank key; not applied.');
      } else {
        if (!incomingGroups.has(key)) incomingGroups.set(key, []);
        else stats.duplicateIncomingRows += 1;
        incomingGroups.get(key).push({ row, index, time });
      }
      if (time === null) {
        invalidIncomingRows.add(index);
        issue('INVALID_DATE', 'incoming', index + 2, key, 'Incoming date is not a supported valid ISO date; not applied.', {
          value: row[dateColumn]
        });
      }
    });

    for (const [key, entries] of incomingGroups) {
      const valid = entries.filter(entry => entry.time !== null);
      if (!valid.length) continue;
      let maxTime = valid[0].time;
      valid.forEach(entry => { if (entry.time > maxTime) maxTime = entry.time; });
      const latest = valid.filter(entry => entry.time === maxTime);
      const candidate = latest[0];
      const master = masterIndex.get(key);
      const conflicting = latest.find(entry => !sameRow(headers, candidate.row, entry.row));
      if (conflicting) {
        stats.conflictKeys += 1;
        issue('INCOMING_TIMESTAMP_CONFLICT', 'incoming', candidate.index + 2, key,
          'Different incoming rows share the latest timestamp; key not applied and any master row retained.', {
            before: master ? cloneRow(headers, master.row) : null,
            totalCandidates: latest.length,
            // Always show two genuinely different rows, even when many identical
            // duplicates precede the conflicting record in the source file.
            candidates: [candidate, conflicting].map(entry => ({ row: entry.index + 2, data: cloneRow(headers, entry.row) }))
          });
        continue;
      }
      if (master && master.time === null) {
        stats.invalidMasterBlockedKeys += 1;
        issue('MASTER_DATE_BLOCKS_UPDATE', 'reconcile', master.index + 2, key,
          'Cannot safely compare with the invalid master date; master row retained.', {
            before: cloneRow(headers, master.row), after: cloneRow(headers, candidate.row), incomingRow: candidate.index + 2
          });
        continue;
      }
      if (master && candidate.time < master.time) {
        stats.olderIncomingKeys += 1;
        issue('OLDER_INCOMING', 'incoming', candidate.index + 2, key, 'Latest valid incoming row is older than master; not applied.');
        continue;
      }
      if (master && candidate.time === master.time) {
        if (sameRow(headers, master.row, candidate.row)) {
          stats.unchangedIncomingKeys += 1;
        } else {
          stats.conflictKeys += 1;
          issue('MASTER_TIMESTAMP_CONFLICT', 'reconcile', master.index + 2, key,
            'Master and incoming timestamps match but text differs; master row retained.', {
              before: cloneRow(headers, master.row), after: cloneRow(headers, candidate.row), incomingRow: candidate.index + 2
            });
        }
        continue;
      }
      const after = cloneRow(headers, candidate.row);
      const before = master ? cloneRow(headers, master.row) : null;
      const changedColumns = master ? headers.filter(header => master.row[header] !== candidate.row[header]) : headers.slice();
      changes.push({
        type: master ? 'updated' : 'added', key, before, after: cloneRow(headers, after), changedColumns,
        masterRow: master ? master.index + 2 : null, incomingRow: candidate.index + 2
      });
      if (master) {
        rows[master.index] = after;
        stats.updated += 1;
      } else {
        if (rows.length >= MAX_ROWS) fail('OUTPUT_ROW_LIMIT', `Merged output exceeds ${MAX_ROWS} rows; split the input into smaller batches.`);
        rows.push(after);
        stats.added += 1;
      }
    }
    stats.outputRows = rows.length;
    stats.unchanged = stats.masterRows - stats.updated;
    stats.invalidMasterRows = invalidMasterRows.size;
    stats.invalidIncomingRows = invalidIncomingRows.size;
    stats.issueCount = issues.length;
    return { headers, rows, changes, issues, stats };
  }

  // Conservative spreadsheet protection changes dangerous-looking text, including
  // ordinary negative numbers, by adding an apostrophe before any leading padding.
  // It is export-only; parsed and reconciled in-memory values are never modified.
  function exportCSV(headers, rows) {
    validateParsed({ headers, rows }, 'export', MAX_EXPORT_ROWS);
    function cell(value) {
      if (/^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(value)) value = "'" + value;
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return '\uFEFF' + [headers.map(cell).join(',')]
      .concat(rows.map(row => headers.map(header => cell(row[header])).join(',')))
      .join('\r\n') + '\r\n';
  }

  return Object.freeze({ parseCSV, reconcile, exportCSV, ReconcileError, MAX_ROWS, MAX_EXPORT_ROWS });
});
