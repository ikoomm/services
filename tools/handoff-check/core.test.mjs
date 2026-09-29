import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpected, inferAssignment, inspectPackage, makeManifest, makeZip, exportSafeCsv, validateZipSizes, LIMITS } from './core.mjs';

const expected = () => parseExpected('asset,language,format\nlogo,AR,png\nlogo,EN,pdf').items;
const file = (overrides = {}) => ({ name: 'logo_AR_v2_final.png', size: 20, key: 'logo|AR|png', version: 2, status: 'final', included: true, ...overrides });
const completeFiles = () => [file(), file({ name: 'logo_EN_v1_final.pdf', key: 'logo|EN|pdf', version: 1 })];
const enc = new TextEncoder();

test('BOM, CRLF, reordered Arabic headers and TSV parse', () => {
  const r = parseExpected('\uFEFFالصيغة\tالأصل\tاللغة\r\n.PNG\tشعار المتجر\tar\r\n');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.items, [{ id: 'شعار-المتجر', language: 'AR', extension: 'png', key: 'شعار-المتجر|AR|png' }]);
});
test('Quoted CSV and embedded newlines parsed, invalid slug characters rejected', () => {
  assert.equal(parseExpected('asset,language,format\n"store\nlogo",EN,pdf').items[0].id, 'store-logo');
  assert.match(parseExpected('asset,language,format\n"store,logo",EN,pdf').errors.join(' '), /asset/);
  assert.match(parseExpected('asset,language,format\n"sto""re",EN,pdf').errors.join(' '), /asset/);
});
test('Malformed quotes, extra fields and missing headers rejected', () => {
  for (const text of ['asset,language,format\n"logo,EN,pdf', 'asset,language,format\n"logo"bad,EN,pdf', 'asset,language,format\nlogo,EN,pdf,extra', 'logo,EN,pdf', 'asset,constructor,format\nlogo,AR,png']) assert.ok(parseExpected(text).errors.length);
});
test('Duplicate normalized expected keys, empty values, invalid languages and formats rejected', () => {
  for (const tail of ['logo,AR,png\nLogo,ar,.PNG', ',AR,png', ',,', 'logo,,png', 'logo,FR,png', 'logo,AR,exe']) assert.ok(parseExpected('asset,language,format\n' + tail).errors.length);
});
test('Expected identifiers reject paths and oversized slugs; 50-row ceiling', () => {
  for (const id of ['../logo', 'dir\\logo', 'a/b', '..', 'x'.repeat(61)]) assert.ok(parseExpected(`asset,language,format\n${id},AR,png`).errors.length);
  const r = parseExpected('asset,language,format\n' + Array.from({ length: 51 }, (_, i) => `asset${i},AR,png`).join('\n'));
  assert.equal(r.items.length, 50); assert.match(r.errors.join(' '), /Maximum 50/);
});
test('Inference case insensitive, explicit metadata only, Unicode safe', () => {
  assert.deepEqual(inferAssignment('CLIENT_LOGO_ar_v12_FINAL.PNG', expected()), { key: 'logo|AR|png', version: 12, status: 'final' });
  assert.deepEqual(inferAssignment('logo_AR.png', expected()), { key: 'logo|AR|png', version: null, status: 'draft' });
  const items = parseExpected('asset,language,format\nشعار,BI,pdf').items;
  assert.equal(inferAssignment('مشروع_شعار_BI_v1_user-confirmed.pdf', items).key, 'شعار|BI|pdf');
  assert.equal(inferAssignment('مشروع_شعار_BI_v1_user-confirmed.pdf', items).status, 'user-confirmed');
});
test('Inference cannot match substrings, ambiguous IDs/languages or path names', () => {
  assert.equal(inferAssignment('logotype_AR_v1_final.png', expected()).key, '');
  assert.equal(inferAssignment('logo_ARE_v1_final.png', expected()).key, '');
  assert.equal(inferAssignment('../logo_AR_v1_final.png', expected()).key, '');
  const ids = parseExpected('asset,language,format\nlogo,AR,png\nbrand-logo,AR,png').items;
  assert.equal(inferAssignment('brand-logo_AR_v1_final.png', ids).key, '');
  const langs = parseExpected('asset,language,format\nlogo,AR,png\nlogo,EN,png').items;
  assert.equal(inferAssignment('logo_AR_EN_v1_final.png', langs).key, '');
});
test('Inference never selects latest or approves conflicting statuses', () => {
  for (const suffix of ['v0', 'v1000', 'v1_v2', 'v9999']) assert.equal(inferAssignment(`logo_AR_${suffix}_final.png`, expected()).version, null);
  assert.equal(inferAssignment('logo_AR_v1_draft_final.png', expected()).status, 'draft');
  assert.equal(inferAssignment('logo_AR_v1_finalized.png', expected()).status, 'draft');
});
test('Complete valid package produces deterministic Unicode safe names', () => {
  const r = inspectPackage(expected(), completeFiles(), { project: 'مشروع العميل' });
  assert.equal(r.canExport, true); assert.equal(r.totalBytes, 40);
  assert.equal(r.rows[0].outputName, 'مشروع-العميل_logo_AR_v2_final.png');
  assert.equal(inspectPackage(expected(), completeFiles(), { project: '../../' }).project, 'project');
});
test('Missing files, no expected list, bad expected metadata fatal', () => {
  assert.deepEqual(inspectPackage(expected(), [file()]).missing, ['logo|EN|pdf']);
  assert.equal(inspectPackage([], []).canExport, false);
  assert.equal(inspectPackage([{ id: '../x', language: 'AR', extension: 'png' }], [file()]).canExport, false);
  assert.equal(inspectPackage([...expected(), expected()[0]], completeFiles()).canExport, false);
});
test('Two versions of same key are fatal; explicit exclusion resolves without selecting latest', () => {
  const many = [...completeFiles(), file({ name: 'logo_AR_v3_final.png', version: 3 })];
  const r = inspectPackage(expected(), many);
  assert.equal(r.canExport, false); assert.equal(r.duplicates.length, 1);
  assert.deepEqual(r.duplicates[0].fileIndexes, [0, 2]);
  many[2].included = false;
  const fixed = inspectPackage(expected(), many);
  assert.equal(fixed.canExport, true); assert.ok(fixed.issues.some(i => i.code === 'excluded-file'));
});
test('Unmapped included file fatal but excluded unknown file only warning', () => {
  const unknown = file({ name: 'notes.txt', key: '' });
  assert.equal(inspectPackage(expected(), [...completeFiles(), unknown]).unmapped.length, 1);
  assert.equal(inspectPackage(expected(), [...completeFiles(), unknown]).canExport, false);
  unknown.included = false;
  assert.equal(inspectPackage(expected(), [...completeFiles(), unknown]).canExport, true);
});
test('Unsupported extension, mismatch, paths, non-numeric version and draft block export', () => {
  for (const bad of [{ name: 'logo.jpg' }, { name: 'logo.exe' }, { name: '../logo.png' }, { name: 'nul.png' }, { name: 'logo.png ' }, { version: '1' }, { version: 0 }, { version: 1000 }, { version: 1.1 }, { status: 'approved' }, { status: 'draft' }]) {
    assert.equal(inspectPackage(expected(), [file(bad), completeFiles()[1]]).canExport, false, JSON.stringify(bad));
  }
});
test('Size validation, per-file ceiling, combined ceiling and count ceiling', () => {
  for (const size of [NaN, -1, 1.5, Infinity, LIMITS.maxFileBytes + 1]) assert.equal(inspectPackage(expected(), [file({ size }), completeFiles()[1]]).canExport, false);
  const items = parseExpected('asset,language,format\na,AR,png\nb,AR,png\nc,AR,png').items;
  const files = items.map(i => file({ name: i.id + '.png', key: i.key, size: LIMITS.maxFileBytes }));
  assert.ok(inspectPackage(items, files).issues.some(i => i.code === 'total-size'));
  assert.ok(inspectPackage(expected(), Array.from({ length: 51 }, () => file())).issues.some(i => i.code === 'file-count'));
});
test('Output collisions flagged even when same key/version repeats', () => {
  assert.ok(inspectPackage(expected(), [...completeFiles(), file()]).issues.some(i => i.code === 'output-collision'));
});
test('Manifest contains declared metadata, mappings, exclusion and no content verification claim', () => {
  const r = inspectPackage(expected(), [...completeFiles(), file({ name: 'unused.jpg', included: false })], { project: 'Alpha' });
  const m = makeManifest(expected(), r, { createdAt: '2026-09-29T08:00:00Z' });
  assert.equal(m.project, 'Alpha'); assert.equal(m.files.length, 2); assert.equal(m.excluded.length, 1);
  assert.equal(m.files[0].packagedName, 'Alpha_logo_AR_v2_final.png');
  assert.equal(m.files[0].declaredStatus, 'final'); assert.match(m.disclaimer, /have not been verified/);
  assert.doesNotThrow(() => JSON.stringify(m));
});
test('CSV quotes and prevents spreadsheet formula injection including whitespace prefix', () => {
  const csv = exportSafeCsv([{ name: '=HYPERLINK("bad")', outputName: '@bad', key: 'x|AR|png', version: 1, status: 'final' }, { name: '  +cmd', outputName: 'normal', key: '', included: false }]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(csv.includes('"\'@bad"')); assert.ok(csv.includes('"\'  +cmd"'));
  assert.ok(csv.endsWith('\r\n')); assert.ok(csv.includes('"no"'));
  const uiCsv = exportSafeCsv([{ original: 'source.png', packaged: 'ready.png', version: 2, status: 'final' }]);
  assert.ok(uiCsv.includes('"source.png","ready.png"'));
});
test('ZIP local and central metadata, known CRC32 vector and UTF-8 names round trip', async () => {
  const entries = [{ name: 'شعار_AR_v1_final.png', bytes: enc.encode('123456789') }, { name: 'manifest.json', bytes: enc.encode('{}') }];
  const zip = await makeZip(entries), dv = new DataView(zip.buffer), dec = new TextDecoder();
  assert.equal(dv.getUint32(0, true), 0x04034b50); assert.equal(dv.getUint16(6, true), 0x800); assert.equal(dv.getUint16(8, true), 0);
  assert.equal(dv.getUint32(14, true), 0xCBF43926);
  let offset = 0;
  for (const e of entries) {
    const nameLen = dv.getUint16(offset + 26, true), size = dv.getUint32(offset + 22, true);
    assert.equal(dec.decode(zip.slice(offset + 30, offset + 30 + nameLen)), e.name);
    assert.deepEqual(zip.slice(offset + 30 + nameLen, offset + 30 + nameLen + size), e.bytes);
    offset += 30 + nameLen + size;
  }
  assert.equal(dv.getUint32(offset, true), 0x02014b50);
  const end = zip.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50); assert.equal(dv.getUint16(end + 10, true), 2); assert.equal(dv.getUint32(end + 16, true), offset);
});
test('ZIP rejects traversal, slash, unsafe device names and case/Unicode collisions', async () => {
  for (const name of ['../x.png', 'dir/file.png', 'dir\\file.png', 'C:x.png', 'nul.txt', 'bad\u0000.png', 'trailing.']) await assert.rejects(makeZip([{ name, bytes: new Uint8Array() }]), /Unsafe/);
  for (const names of [['A.png', 'a.png'], ['é.png', 'e\u0301.png']]) await assert.rejects(makeZip(names.map(name => ({ name, bytes: new Uint8Array() }))), /Duplicate/);
});
test('ZIP validates byte type and entry ceiling', async () => {
  await assert.rejects(makeZip([{ name: 'a.png', bytes: [1] }]), /Uint8Array/);
  await assert.rejects(makeZip([]), /requires/);
  await assert.rejects(makeZip(Array.from({ length: 54 }, (_, i) => ({ name: `${i}.png`, bytes: new Uint8Array() }))), /requires/);
  await assert.rejects(makeZip(Array.from({ length: 51 }, (_, i) => ({ name: `${i}.png`, bytes: new Uint8Array() }))), /50 asset/);
  const fifty = Array.from({ length: 50 }, (_, i) => ({ name: `${i}.png`, bytes: new Uint8Array() }));
  const metadata = ['manifest.json', 'file-map.csv', 'README.txt'].map(name => ({ name, bytes: enc.encode('ok') }));
  const zip = await makeZip([...fifty, ...metadata]);
  assert.equal(new DataView(zip.buffer).getUint16(zip.length - 12, true), 53);
});
test('100 MiB asset boundary allows separate small metadata, without large allocation', () => {
  const items = parseExpected('asset,language,format\na,AR,png\nb,AR,png').items;
  const files = items.map(i => file({ name: `${i.id}.png`, key: i.key, size: LIMITS.maxFileBytes }));
  assert.equal(inspectPackage(items, files).canExport, true);
  const sizes = validateZipSizes([{ name: 'a.png', size: LIMITS.maxFileBytes }, { name: 'b.png', size: LIMITS.maxFileBytes }, { name: 'manifest.json', size: 1024 }, { name: 'file-map.csv', size: 1024 }, { name: 'README.txt', size: 1024 }]);
  assert.equal(sizes.assetBytes, LIMITS.maxTotalBytes); assert.equal(sizes.metadataBytes, 3072);
  assert.ok(sizes.archiveBytes > LIMITS.maxTotalBytes && sizes.archiveBytes < LIMITS.maxZipBytes);
});
test('ZIP enforces independent asset, metadata and actual archive caps', async () => {
  const full = [{ name: 'a.png', size: LIMITS.maxFileBytes }, { name: 'b.png', size: LIMITS.maxFileBytes }];
  assert.throws(() => validateZipSizes([...full, { name: 'c.png', size: 1 }]), /assets exceed 100/);
  assert.throws(() => validateZipSizes([{ name: 'a.png', size: LIMITS.maxFileBytes + 1 }]), /asset exceeds 50/);
  assert.throws(() => validateZipSizes([{ name: 'manifest.json', size: LIMITS.maxMetadataBytes }, { name: 'file-map.csv', size: 1 }]), /metadata exceeds 1/);
  assert.throws(() => validateZipSizes([...full, { name: 'manifest.json', size: LIMITS.maxMetadataBytes }]), /archive exceeds 101/);
  assert.throws(() => validateZipSizes([...full, { name: 'Manifest.json', size: 1 }]), /assets exceed 100/);
  assert.throws(() => validateZipSizes([{ name: 'a.png', size: -1 }]), /non-negative/);
  await assert.rejects(makeZip([{ name: 'manifest.json', bytes: new Uint8Array(LIMITS.maxMetadataBytes + 1) }]), /metadata exceeds 1/);
});
