'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV, reconcile, exportCSV, MAX_ROWS } = require('./core.js');

const headers = ['id', 'updated', 'name', 'amount'];
function data(rows, columnOrder = headers) {
  return { headers: columnOrder.slice(), rows: rows.map(values => Object.fromEntries(columnOrder.map((header, i) => [header, values[i]]))) };
}
const options = { key: 'id', date: 'updated' };
function merge(master, incoming) { return reconcile(data(master), data(incoming), options); }
function throwsCode(fn, code) { assert.throws(fn, error => error.code === code); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function freezeDeep(value) {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freezeDeep(child); });
  return Object.freeze(value);
}

test('standalone browser script exposes API without CommonJS or dependencies', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./core.js'), 'utf8'), context);
  assert.equal(typeof context.ExportReconcile.parseCSV, 'function');
  assert.equal(typeof context.ExportReconcile.reconcile, 'function');
  assert.equal(typeof context.ExportReconcile.exportCSV, 'function');
  assert.equal(context.ExportReconcile.parseCSV('id,date\nA,2026-09-01').rows[0].id, 'A');
});

test('CSV parses BOM, CRLF, quoted commas, escaped quotes, multiline and Arabic exactly', () => {
  const source = '\uFEFFid,name,note\r\n001,"حازم، السالمي","He said ""hi""\r\nnext line"\r\n002,"a,b",last\r\n';
  const parsed = parseCSV(source);
  assert.deepEqual(plain(parsed), {
    headers: ['id', 'name', 'note'],
    rows: [{ id: '001', name: 'حازم، السالمي', note: 'He said "hi"\r\nnext line' }, { id: '002', name: 'a,b', note: 'last' }]
  });
});

test('CSV supports LF and CR separators, trailing empty cells, header-only input', () => {
  assert.equal(parseCSV('a,b\n1,').rows[0].b, '');
  assert.equal(parseCSV('a,b\r1,2\r').rows[0].b, '2');
  assert.equal(parseCSV('a,b\n').rows.length, 0);
  assert.equal(parseCSV('a,b').rows.length, 0);
});

test('CSV rejects unclosed quotes and quotes embedded in unquoted fields', () => {
  throwsCode(() => parseCSV('a\n"oops'), 'UNCLOSED_QUOTE');
  throwsCode(() => parseCSV('a\nno"pe'), 'UNEXPECTED_QUOTE');
  throwsCode(() => parseCSV('a\n"ok"bad'), 'AFTER_QUOTE');
  throwsCode(() => parseCSV('a\n"ok" '), 'AFTER_QUOTE');
});

test('CSV rejects duplicate/blank headers, short/wide rows and empty text', () => {
  throwsCode(() => parseCSV('a,a\n1,2'), 'DUPLICATE_HEADER');
  throwsCode(() => parseCSV('a, \n1,2'), 'EMPTY_HEADER');
  throwsCode(() => parseCSV('a,b\n1'), 'ROW_WIDTH');
  throwsCode(() => parseCSV('a,b\n1,2,3'), 'ROW_WIDTH');
  throwsCode(() => parseCSV(''), 'EMPTY_CSV');
  throwsCode(() => parseCSV('\uFEFF'), 'EMPTY_CSV');
  throwsCode(() => parseCSV(null), 'INVALID_TEXT');
});

test('CSV malicious-looking object property headers are plain data', () => {
  const parsed = parseCSV('__proto__,constructor,id,updated\nhello,world,A,2026-09-01');
  assert.equal(Object.getPrototypeOf(parsed.rows[0]), null);
  assert.equal(parsed.rows[0].__proto__, 'hello');
  assert.equal(parsed.rows[0].constructor, 'world');
  assert.equal({}.hello, undefined);
  assert.equal(parseCSV(exportCSV(parsed.headers, parsed.rows)).rows[0].__proto__, 'hello');
});

test('merge updates newer keys, adds new keys, and retains absent master rows in order', () => {
  const result = merge([
    ['A', '2026-09-01', 'Old', '10'], ['B', '2026-09-10', 'Retained', '20']
  ], [
    ['A', '2026-09-02', 'New', '12'], ['C', '2026-09-02', 'Added', '30']
  ]);
  assert.deepEqual(result.rows.map(row => [row.id, row.name]), [['A', 'New'], ['B', 'Retained'], ['C', 'Added']]);
  assert.deepEqual(result.changes.map(change => change.type), ['updated', 'added']);
  assert.deepEqual(result.changes[0].changedColumns, ['updated', 'name', 'amount']);
  assert.equal(result.changes[0].before.name, 'Old');
  assert.equal(result.changes[0].after.name, 'New');
  assert.equal(result.changes[1].before, null);
  assert.equal(result.changes[0].masterRow, 2);
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.updated, 1);
  assert.equal(result.stats.unchanged, 1);
  assert.equal(result.stats.outputRows, 3);
});

test('header names are exact sets but incoming order may differ', () => {
  const master = data([['A', '2026-09-01', 'Old', '10']]);
  const incoming = data([['11', 'A', 'New', '2026-09-02']], ['amount', 'id', 'name', 'updated']);
  const result = reconcile(master, incoming, options);
  assert.deepEqual(result.headers, headers);
  assert.equal(result.rows[0].name, 'New');
  throwsCode(() => reconcile(master, data([], ['id', 'updated', 'Name', 'amount']), options), 'HEADER_MISMATCH');
});

test('duplicate master key is a hard error, including rows with invalid dates', () => {
  throwsCode(() => merge([['A', 'bad', 'one', '1'], ['A', '2026-09-01', 'two', '2']], []), 'DUPLICATE_MASTER_KEY');
});

test('incoming duplicate keys choose greatest valid timestamp, not file order', () => {
  const incoming = [
    ['A', '2026-09-04', 'Latest', '4'], ['A', '2026-09-02', 'Old', '2'], ['A', 'not-date', 'Invalid', '99']
  ];
  const result = merge([['A', '2026-09-01', 'Master', '1']], incoming);
  assert.equal(result.rows[0].name, 'Latest');
  assert.equal(result.stats.duplicateIncomingRows, 2);
  assert.equal(result.stats.invalidIncomingRows, 1);
  assert.equal(result.stats.updated, 1);
  assert.equal(merge([['A', '2026-09-01', 'Master', '1']], incoming.slice().reverse()).rows[0].name, 'Latest');
});

test('equal latest timestamps with different incoming content conflict and retain master', () => {
  const result = merge([['A', '2026-09-01', 'Master', '1']], [
    ['A', '2026-09-02', 'Left', '2'], ['A', '2026-09-02', 'Right', '3']
  ]);
  assert.equal(result.rows[0].name, 'Master');
  assert.equal(result.changes.length, 0);
  assert.equal(result.stats.conflictKeys, 1);
  assert.equal(result.issues[0].code, 'INCOMING_TIMESTAMP_CONFLICT');
  assert.equal(result.issues[0].details.candidates.length, 2);
});

test('conflicting incoming new keys are not inserted arbitrarily', () => {
  const result = merge([], [['X', '2026-09-01', 'A', '1'], ['X', '2026-09-01', 'B', '1']]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.added, 0);
  assert.equal(result.stats.conflictKeys, 1);
});

test('conflict preview includes different rows even after many identical duplicates', () => {
  const incoming = Array.from({ length: 8 }, () => ['A', '2026-09-01', 'Same', '1']);
  incoming.push(['A', '2026-09-01', 'Different', '2']);
  const result = merge([], incoming);
  assert.equal(result.issues[0].details.totalCandidates, 9);
  assert.deepEqual(result.issues[0].details.candidates.map(entry => entry.data.name), ['Same', 'Different']);
});

test('identical duplicate latest rows are safe; older conflicting duplicates do not beat newer rows', () => {
  const result = merge([], [
    ['A', '2026-09-01', 'Old A', '1'], ['A', '2026-09-01', 'Old B', '2'],
    ['A', '2026-09-02', 'Same', '3'], ['A', '2026-09-02', 'Same', '3']
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].name, 'Same');
  assert.equal(result.stats.conflictKeys, 0);
  assert.equal(result.stats.duplicateIncomingRows, 3);
});

test('same master/incoming timestamp and exact row is unchanged', () => {
  const row = ['A', '2026-09-01', 'Same', '1'];
  const result = merge([row], [row]);
  assert.equal(result.changes.length, 0);
  assert.equal(result.issues.length, 0);
  assert.equal(result.stats.unchangedIncomingKeys, 1);
  assert.equal(result.stats.unchanged, 1);
});

test('same master/incoming timestamp but different content preserves master as conflict', () => {
  const result = merge([['A', '2026-09-01', 'Master', '1']], [['A', '2026-09-01', 'New', '1']]);
  assert.equal(result.rows[0].name, 'Master');
  assert.equal(result.stats.conflictKeys, 1);
  assert.equal(result.issues[0].code, 'MASTER_TIMESTAMP_CONFLICT');
});

test('older incoming rows never overwrite newer master rows', () => {
  const result = merge([['A', '2026-09-03', 'Keep', '1']], [['A', '2026-09-02', 'Reject', '2']]);
  assert.equal(result.rows[0].name, 'Keep');
  assert.equal(result.stats.olderIncomingKeys, 1);
  assert.equal(result.stats.updated, 0);
});

test('invalid calendar dates, times and missing timezone are rejected without normalization', () => {
  const invalid = ['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-09-01T24:00:00Z', '2026-09-01T12:60Z', '2026-09-01T12:00:60Z',
    '2026-09-01T12:00:00', '2026-09-01T12:00:00+24:00', '2026-09-01T12:00:00+03:60',
    '09/01/2026', ' 2026-09-01', '2026-09-01T12:00:00.1234Z', '1900-02-29'];
  const result = merge([], invalid.map((date, i) => [String(i), date, 'Bad', '0']));
  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.invalidIncomingRows, invalid.length);
  assert.equal(result.issues.length, invalid.length);
});

test('valid leap dates, early years, fractions and explicit offsets compare correctly', () => {
  const result = merge([
    ['A', '2026-09-01T10:00:00Z', 'Old', '1'], ['B', '0099-01-01', 'Old', '2']
  ], [
    ['A', '2026-09-01T13:00:00.001+03:00', 'New', '1'], ['B', '0100-01-01', 'New', '2'],
    ['C', '2000-02-29', 'Leap', '3'], ['D', '2024-02-29T12:01-05:30', 'Leap', '4']
  ]);
  assert.equal(result.stats.updated, 2);
  assert.equal(result.stats.added, 2);
  assert.equal(result.issues.length, 0);
});

test('equal instants written differently conflict because row text comparison is exact', () => {
  const result = merge([['A', '2026-09-01T00:00:00Z', 'Same', '1']], [['A', '2026-09-01T03:00:00+03:00', 'Same', '1']]);
  assert.equal(result.stats.conflictKeys, 1);
  assert.equal(result.rows[0].updated, '2026-09-01T00:00:00Z');
});

test('invalid master date blocks update and invalid/missing master records remain', () => {
  const result = merge([['A', 'invalid', 'Keep', '1'], ['', '2026-09-01', 'No key', '2']], [
    ['A', '2026-09-02', 'Cannot decide', '3'], ['', 'bad', 'Reject', '4'], ['B', '2026-09-03', 'New', '5']
  ]);
  assert.equal(result.rows[0].name, 'Keep');
  assert.equal(result.rows[1].name, 'No key');
  assert.equal(result.rows[2].id, 'B');
  assert.equal(result.stats.invalidMasterRows, 2);
  assert.equal(result.stats.invalidIncomingRows, 1); // two issues on one row, counted once
  assert.equal(result.stats.invalidMasterBlockedKeys, 1);
  assert.equal(result.stats.outputRows, 3);
});

test('keys are case-sensitive exact text, no trimming or numeric conversion', () => {
  const result = merge([['001', '2026-09-01', 'Master', '1']], [
    ['1', '2026-09-02', 'Numeric-looking new', '1'], [' 001', '2026-09-02', 'Space new', '1'],
    ['A', '2026-09-02', 'Upper', '1'], ['a', '2026-09-02', 'Lower', '1']
  ]);
  assert.equal(result.stats.added, 4);
  assert.equal(result.rows[0].id, '001');
});

test('reconciliation never mutates inputs and result/change/issue rows are independent copies', () => {
  const master = freezeDeep(data([['A', '2026-09-01', 'Before', '1']]));
  const incoming = freezeDeep(data([['A', '2026-09-02', 'After', '2']]));
  const before = JSON.stringify({ master, incoming });
  const result = reconcile(master, incoming, options);
  assert.equal(JSON.stringify({ master, incoming }), before);
  result.rows[0].name = 'Mutated output';
  assert.equal(result.changes[0].after.name, 'After');
  result.changes[0].before.name = 'Mutated preview';
  assert.equal(master.rows[0].name, 'Before');
});

test('export is BOM CSV, preserves multiline and Arabic, and quotes cells correctly', () => {
  const source = parseCSV('id,name,note\n001,مرحبا,"hello, ""world""\nline two"');
  const exported = exportCSV(source.headers, source.rows);
  assert.equal(exported.charCodeAt(0), 0xFEFF);
  assert.ok(exported.endsWith('\r\n'));
  assert.deepEqual(plain(parseCSV(exported)), plain(source));
});

test('export conservatively neutralizes formula prefixes including control/whitespace and negatives', () => {
  const unsafe = ['=1+1', '+SUM(A1)', '-12.50', '@SUM(A1)', ' \t=1+1', '\u0000=1+1', '\u200B=1+1', '\u202E=1+1'];
  const safe = ['normal', '12.5', "'=already guarded", '001', 'حازم'];
  const source = { headers: ['=dangerous-header', 'value'], rows: unsafe.concat(safe).map(value => ({ '=dangerous-header': 'x', value })) };
  const before = JSON.stringify(source);
  const exported = parseCSV(exportCSV(source.headers, source.rows));
  assert.equal(exported.headers[0], "'=dangerous-header");
  unsafe.forEach((value, index) => assert.equal(exported.rows[index].value, "'" + value));
  safe.forEach((value, index) => assert.equal(exported.rows[index + unsafe.length].value, value));
  assert.equal(JSON.stringify(source), before);
});

test('manual malformed parsed objects and absent options fail clearly', () => {
  throwsCode(() => reconcile(data([]), data([]), {}), 'INVALID_COLUMNS');
  throwsCode(() => reconcile(data([]), { headers, rows: [{ id: 'A' }] }, options), 'INVALID_ROW');
  throwsCode(() => exportCSV(['a'], [{ a: 3 }]), 'INVALID_ROW');
});

test('bounded 50k input enforced and row count statistics remain consistent', () => {
  throwsCode(() => parseCSV('a\n' + 'x\n'.repeat(MAX_ROWS + 1)), 'ROW_LIMIT');
  const result = merge([['A', '2026-09-01', 'A', '1'], ['B', '2026-09-01', 'B', '2']], [
    ['A', '2026-09-02', 'New A', '3'], ['C', '2026-09-02', 'C', '4']
  ]);
  assert.equal(result.stats.outputRows, result.stats.masterRows + result.stats.added);
  assert.equal(result.stats.masterRows, result.stats.updated + result.stats.unchanged);
  assert.equal(result.changes.length, result.stats.added + result.stats.updated);
  assert.equal(result.stats.issueCount, result.issues.length);
});

test('expanded issue log exports even when valid-sized input creates over 50k issues', () => {
  const incoming = data(Array.from({ length: 25001 }, () => ['', 'bad-date', 'Invalid row', '0']));
  const result = reconcile(data([]), incoming, options);
  assert.equal(result.stats.incomingRows, 25001);
  assert.equal(result.stats.invalidIncomingRows, 25001);
  assert.equal(result.issues.length, 50002);
  const logHeaders = ['code', 'source', 'row', 'message'];
  const logRows = result.issues.map(issue => Object.fromEntries(logHeaders.map(header => [header, String(issue[header])])));
  const exported = exportCSV(logHeaders, logRows);
  assert.equal(exported.split('\r\n').length - 2, 50002);
  assert.ok(exported.includes('"MISSING_KEY","incoming","2"'));
  assert.ok(exported.includes('"INVALID_DATE","incoming","25002"'));
});
