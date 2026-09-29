// Local metadata checks only. This module never reads design-file contents or uses a network.
export const LIMITS = Object.freeze({ maxExpected: 50, maxFiles: 50, maxFileBytes: 50 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024, maxMetadataBytes: 1024 * 1024, maxZipBytes: 101 * 1024 * 1024 });
const EXTENSIONS = new Set('png jpg jpeg webp pdf svg psd ai eps indd tif tiff'.split(' '));
const LANGUAGES = new Set(['AR', 'EN', 'BI']);
const STATUSES = new Set(['draft', 'final', 'user-confirmed']);
const encoder = new TextEncoder();
const fold = value => String(value ?? '').normalize('NFKC').toLowerCase();
const keyOf = item => `${item.id}|${item.language}|${item.extension}`;
const alias = { asset: 'id', id: 'id', 'الأصل': 'id', language: 'language', 'اللغة': 'language', format: 'extension', 'الصيغة': 'extension' };

function slug(value) {
  const s = String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, '-').toLowerCase();
  return s && Array.from(s).length <= 60 && /^[\p{L}\p{N}_-]+$/u.test(s) && /[\p{L}\p{N}]/u.test(s) ? s : null;
}

function safeProject(value) {
  const s = String(value ?? '').normalize('NFKC').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s && /[\p{L}\p{N}]/u.test(s) ? s : 'project';
}

function validFlatName(value) {
  const s = String(value ?? '');
  return Boolean(s && s !== '.' && s !== '..' && s.length <= 240 && !/[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(s) && !/[. ]$/u.test(s) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s));
}

function splitTable(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  let delimiter = ',', quoted = false;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '"') { if (quoted && input[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && input[i] === '\t') { delimiter = '\t'; break; }
    else if (!quoted && (input[i] === '\r' || input[i] === '\n')) break;
  }
  const rows = [], errors = [];
  let row = [], cell = '', inQuote = false, afterQuote = false;
  const pushCell = () => { row.push(cell); cell = ''; afterQuote = false; };
  const pushRow = () => { pushCell(); if (row.length > 1 || row.some(c => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { inQuote = false; afterQuote = true; }
      } else cell += ch;
    } else if (ch === delimiter) pushCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && input[i + 1] === '\n') i++; pushRow(); }
    else if (ch === '"') {
      if (cell.trim() === '' && !afterQuote) { cell = ''; inQuote = true; }
      else { errors.push('Unexpected quote in a field.'); cell += ch; }
    } else if (afterQuote && !/\s/u.test(ch)) { errors.push('Unexpected text after a quoted field.'); cell += ch; }
    else if (!afterQuote) cell += ch;
  }
  if (inQuote) errors.push('Unclosed quoted field.');
  if (cell || row.length || afterQuote) pushRow();
  return { rows, errors };
}

export function parseExpected(text) {
  const { rows, errors } = splitTable(text);
  const items = [], seen = new Set();
  if (!rows.length) return { items, errors: [...errors, 'Provide an asset, language, format header and at least one expected row.'] };
  const headers = rows[0].map(v => { const h = fold(v.trim()); return Object.hasOwn(alias, h) ? alias[h] : undefined; });
  if (headers.length !== 3 || new Set(headers).size !== 3 || headers.some(v => !v)) {
    return { items, errors: [...errors, 'Header must contain asset/id, language, format (Arabic aliases also accepted).'] };
  }
  if (rows.length - 1 > LIMITS.maxExpected) errors.push(`Maximum ${LIMITS.maxExpected} expected rows.`);
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length !== 3) { errors.push(`Row ${r + 1}: expected exactly three columns.`); continue; }
    const obj = Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()]));
    const id = slug(obj.id), language = obj.language.toUpperCase(), extension = obj.extension.toLowerCase().replace(/^\./, '');
    if (!id) { errors.push(`Row ${r + 1}: asset needs 1–60 letters, digits, spaces, underscores or hyphens; no paths.`); continue; }
    if (!LANGUAGES.has(language)) { errors.push(`Row ${r + 1}: language must be AR, EN or BI.`); continue; }
    if (!EXTENSIONS.has(extension)) { errors.push(`Row ${r + 1}: unsupported format.`); continue; }
    const item = { id, language, extension };
    item.key = keyOf(item);
    if (seen.has(item.key)) { errors.push(`Row ${r + 1}: duplicate expected asset ${item.key}.`); continue; }
    seen.add(item.key); items.push(item);
  }
  if (!items.length) errors.push('At least one valid expected asset is required.');
  return { items: items.slice(0, LIMITS.maxExpected), errors };
}

function tokenPresent(stem, token) {
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(stem);
}

export function inferAssignment(filename, items) {
  const name = String(filename ?? '').normalize('NFKC');
  const match = name.match(/^(.*)\.([^.]+)$/u);
  const stem = match ? match[1] : name;
  const extension = match ? match[2].toLowerCase() : '';
  const versions = [...stem.matchAll(/(?:^|[^\p{L}\p{N}])v(\d+)(?=$|[^\p{L}\p{N}])/giu)].map(m => Number(m[1]));
  const version = versions.length === 1 && versions[0] >= 1 && versions[0] <= 999 ? versions[0] : null;
  const explicitStatuses = [...STATUSES].filter(s => tokenPresent(stem, s));
  // A filename's "final" token is declared metadata, never evidence of client approval.
  const status = explicitStatuses.length === 1 ? explicitStatuses[0] : 'draft';
  const found = validFlatName(name) ? (Array.isArray(items) ? items : []).filter(item => item.extension?.toLowerCase() === extension && tokenPresent(stem, item.id) && tokenPresent(stem, item.language)) : [];
  return { key: found.length === 1 ? keyOf(found[0]) : '', version, status };
}

export function inspectPackage(items, files, { project } = {}) {
  const expected = Array.isArray(items) ? items : [];
  const source = Array.isArray(files) ? files : [];
  const issues = [], expectedMap = new Map(), groups = new Map(), outputNames = new Set();
  const issue = (severity, code, message, rest = {}) => issues.push({ severity, code, message, ...rest });
  if (!expected.length || expected.length > LIMITS.maxExpected) issue('error', 'expected-count', `Expected assets must number 1–${LIMITS.maxExpected}.`);
  for (const item of expected) {
    if (!item || slug(item.id) !== item.id || !LANGUAGES.has(item.language) || !EXTENSIONS.has(item.extension)) { issue('error', 'invalid-expected', 'Expected asset metadata is invalid.'); continue; }
    const key = keyOf(item);
    if (expectedMap.has(key)) issue('error', 'duplicate-expected', `Duplicate expected key: ${key}.`, { key });
    expectedMap.set(key, item);
  }
  const included = source.filter(f => f?.included !== false);
  if (included.length > LIMITS.maxFiles) issue('error', 'file-count', `Maximum ${LIMITS.maxFiles} included files.`);
  let totalBytes = 0;
  const rows = source.map((file, index) => {
    file = file ?? {};
    const row = { ...file, index, originalName: String(file.name ?? ''), outputName: '', included: file.included !== false, errors: [], warnings: [] };
    const add = (code, message) => { row.errors.push(message); issue('error', code, message, { fileIndex: index, key: file.key || '' }); };
    if (!row.included) {
      row.warnings.push('Excluded from package.');
      issue('warning', 'excluded-file', `Excluded file: ${row.originalName || '(unnamed)'}.`, { fileIndex: index });
      return row;
    }
    if (!validFlatName(row.originalName)) add('unsafe-input-name', 'Original file name is invalid or contains a path.');
    if (!Number.isSafeInteger(file.size) || file.size < 0) add('invalid-size', 'File size must be a non-negative integer.');
    else { totalBytes += file.size; if (file.size > LIMITS.maxFileBytes) add('file-size', 'File exceeds 50 MiB.'); }
    const item = expectedMap.get(file.key);
    if (!item) add('unmapped-file', 'Included file must be assigned to an expected asset.');
    const extension = row.originalName.includes('.') ? row.originalName.split('.').pop().toLowerCase() : '';
    if (!EXTENSIONS.has(extension)) add('unsupported-extension', 'Unsupported file extension.');
    if (item && extension !== item.extension) add('extension-mismatch', 'File extension does not match assigned expected format.');
    if (!Number.isInteger(file.version) || file.version < 1 || file.version > 999) add('invalid-version', 'Explicit version must be an integer from 1 to 999.');
    if (!STATUSES.has(file.status)) add('invalid-status', 'Status must be draft, final or user-confirmed.');
    else if (file.status === 'draft') add('draft-file', 'Draft requires explicit final or user-confirmed status before export.');
    if (item) {
      const list = groups.get(file.key) || [];
      list.push(index); groups.set(file.key, list);
      row.outputName = `${safeProject(project)}_${item.id}_${item.language}_v${file.version}_${file.status}.${item.extension}`;
      if (!validFlatName(row.outputName)) add('unsafe-output-name', 'Packaged file name is invalid.');
      const outputFold = fold(row.outputName);
      if (outputNames.has(outputFold)) add('output-collision', 'Packaged file names collide.');
      outputNames.add(outputFold);
    }
    return row;
  });
  if (totalBytes > LIMITS.maxTotalBytes) issue('error', 'total-size', 'Included files exceed 100 MiB total.');
  const missing = [...expectedMap.keys()].filter(key => !groups.has(key));
  for (const key of missing) issue('error', 'missing-file', `Missing expected file: ${key}.`, { key });
  const duplicates = [...groups].filter(([, indexes]) => indexes.length !== 1).map(([key, fileIndexes]) => ({ key, fileIndexes }));
  for (const duplicate of duplicates) issue('error', 'duplicate-file', `Choose exactly one included file for ${duplicate.key}.`, { key: duplicate.key });
  const unmapped = rows.filter(row => row.included && !expectedMap.has(row.key));
  return { rows, missing, duplicates, unmapped, issues, totalBytes, project: safeProject(project), canExport: !issues.some(x => x.severity === 'error') };
}

export function makeManifest(items, inspection, { project, createdAt } = {}) {
  return {
    schema: 'handoff-check/1',
    project: safeProject(project ?? inspection.project),
    createdAt: createdAt || new Date().toISOString(),
    disclaimer: 'Metadata and package-completeness checks only. File contents, visual quality, resolution, colour, fonts, editability and client approval have not been verified.',
    limits: { ...LIMITS },
    expected: items.map(item => ({ id: item.id, language: item.language, extension: item.extension, key: keyOf(item) })),
    files: inspection.rows.filter(r => r.included).map(row => ({ originalName: row.originalName, packagedName: row.outputName, key: row.key, size: row.size, declaredVersion: row.version, declaredStatus: row.status })),
    excluded: inspection.rows.filter(r => !r.included).map(row => ({ originalName: row.originalName })),
    checks: { canExport: inspection.canExport, missing: inspection.missing, duplicates: inspection.duplicates, issues: inspection.issues, totalBytes: inspection.totalBytes }
  };
}

export function exportSafeCsv(rows) {
  const headers = ['original_name', 'packaged_name', 'asset', 'language', 'format', 'version', 'declared_status', 'included'];
  const escape = value => {
    let s = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows.map(row => {
    const [id = '', language = '', extension = ''] = String(row.key || '').split('|');
    return [row.originalName ?? row.name ?? row.original, row.outputName ?? row.packaged, id, language, extension, row.version, row.status, row.included !== false ? 'yes' : 'no'];
  })].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1; return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Validate descriptors separately so exact size boundaries need no large test buffers.
export function validateZipSizes(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > LIMITS.maxFiles + 3) throw new Error('ZIP requires 1–53 flat entries (50 assets plus manifest.json, file-map.csv and README.txt).');
  const metadataNames = new Set(['manifest.json', 'file-map.csv', 'README.txt']);
  if (entries.filter(entry => !metadataNames.has(entry?.name)).length > LIMITS.maxFiles) throw new Error('ZIP exceeds 50 asset files.');
  const seen = new Set();
  let assetBytes = 0, metadataBytes = 0, archiveBytes = 22;
  for (const entry of entries) {
    if (!validFlatName(entry?.name)) throw new Error('Unsafe ZIP entry name.');
    const normalized = fold(entry.name);
    if (seen.has(normalized)) throw new Error('Duplicate ZIP entry name.');
    seen.add(normalized);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('ZIP entry size must be a non-negative integer.');
    const nameBytes = encoder.encode(entry.name).length;
    if (nameBytes > 65535) throw new Error('ZIP name too long.');
    if (metadataNames.has(entry.name)) metadataBytes += entry.size;
    else {
      if (entry.size > LIMITS.maxFileBytes) throw new Error('ZIP asset exceeds 50 MiB.');
      assetBytes += entry.size;
    }
    archiveBytes += 76 + 2 * nameBytes + entry.size;
  }
  if (assetBytes > LIMITS.maxTotalBytes) throw new Error('ZIP assets exceed 100 MiB.');
  if (metadataBytes > LIMITS.maxMetadataBytes) throw new Error('ZIP metadata exceeds 1 MiB combined.');
  if (archiveBytes > LIMITS.maxZipBytes) throw new Error('ZIP archive exceeds 101 MiB including headers.');
  return { assetBytes, metadataBytes, archiveBytes };
}

export async function makeZip(entries) {
  if (!Array.isArray(entries)) throw new Error('ZIP entries must be an array.');
  const descriptors = entries.map(entry => {
    if (!(entry?.bytes instanceof Uint8Array)) throw new Error('ZIP entries require Uint8Array bytes.');
    return { name: entry.name, size: entry.bytes.length };
  });
  validateZipSizes(descriptors);
  let offset = 0;
  const prepared = entries.map(entry => {
    if (!(entry.bytes instanceof Uint8Array)) throw new Error('ZIP entries require Uint8Array bytes.');
    const name = encoder.encode(entry.name), bytes = entry.bytes, crc = crc32(bytes);
    const result = { name, bytes, crc, offset };
    offset += 30 + name.length + bytes.length;
    return result;
  });
  const centralOffset = offset;
  const centralSize = prepared.reduce((n, e) => n + 46 + e.name.length, 0);
  const output = new Uint8Array(centralOffset + centralSize + 22);
  const view = new DataView(output.buffer);
  const u16 = (at, n) => view.setUint16(at, n, true), u32 = (at, n) => view.setUint32(at, n, true);
  for (const e of prepared) {
    const p = e.offset;
    u32(p, 0x04034b50); u16(p + 4, 20); u16(p + 6, 0x0800); u16(p + 8, 0); u16(p + 10, 0); u16(p + 12, 33);
    u32(p + 14, e.crc); u32(p + 18, e.bytes.length); u32(p + 22, e.bytes.length); u16(p + 26, e.name.length); u16(p + 28, 0);
    output.set(e.name, p + 30); output.set(e.bytes, p + 30 + e.name.length);
    const c = offset;
    u32(c, 0x02014b50); u16(c + 4, 20); u16(c + 6, 20); u16(c + 8, 0x0800); u16(c + 10, 0); u16(c + 12, 0); u16(c + 14, 33);
    u32(c + 16, e.crc); u32(c + 20, e.bytes.length); u32(c + 24, e.bytes.length); u16(c + 28, e.name.length); u16(c + 30, 0); u16(c + 32, 0);
    u16(c + 34, 0); u16(c + 36, 0); u32(c + 38, 0); u32(c + 42, e.offset); output.set(e.name, c + 46);
    offset += 46 + e.name.length;
  }
  u32(offset, 0x06054b50); u16(offset + 4, 0); u16(offset + 6, 0); u16(offset + 8, prepared.length); u16(offset + 10, prepared.length);
  u32(offset + 12, centralSize); u32(offset + 16, centralOffset); u16(offset + 20, 0);
  return output;
}
