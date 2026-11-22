const { test } = require('node:test');
const assert = require('node:assert/strict');
const { src } = require('./helpers/tsRequire.cjs');

const reg = require(src('utils/regNumber.ts'));
const pw = require(src('utils/passwordRules.ts'));
const { timeAgo } = require(src('utils/timeAgo.ts'));
const { REGISTRY_LABELS } = require(src('utils/registryLabels.ts'));
const { imageFilePart } = require(src('utils/imageUpload.ts'));
const paperwork = require(src('features/twin/paperwork/validators.ts'));

test('registration numbers: standard and Bharat series are accepted, junk is not', () => {
  for (const ok of ['MH01AB1234', 'dl3cab1234', 'MH 01 AB 1234', '22BH1234AB']) assert.equal(reg.isValidRegNumber(ok), true, ok);
  for (const bad of ['', 'ZZ01AB1234', 'MH01AB123', 'HELLO', '1234']) assert.equal(reg.isValidRegNumber(bad), false, bad);
  assert.equal(reg.normalizeRegNumber('mh-01 ab.1234'), 'MH01AB1234');
});

test('registration number feedback while typing: incomplete is not an error, a bad state code is', () => {
  assert.equal(reg.checkRegNumber('').state, 'empty');
  assert.equal(reg.checkRegNumber('MH01AB1234').state, 'valid');
  assert.equal(reg.checkRegNumber('MH0').state, 'incomplete');
  assert.equal(reg.checkRegNumber('ZZ01').state, 'invalid');
  assert.equal(reg.checkRegNumber('MH01AB12#4').state, 'invalid');
});

test('password rules match the server: 8+ characters with a letter and a number', () => {
  assert.equal(pw.passwordProblem('short1'), 'Use at least 8 characters.');
  assert.match(pw.passwordProblem('onlyletters'), /letter and one number/);
  assert.match(pw.passwordProblem('12345678'), /letter and one number/);
  assert.equal(pw.passwordProblem('goodpass123'), null);
});

test('reset identifier: emails are lower-cased, mobile numbers lose +91 and spaces, anything else is refused', () => {
  assert.deepEqual(pw.parseResetIdentifier('  Me@Example.com '), { kind: 'email', value: 'me@example.com' });
  assert.deepEqual(pw.parseResetIdentifier('+91 98765 43210'), { kind: 'phone', value: '9876543210' });
  assert.deepEqual(pw.parseResetIdentifier('9876543210'), { kind: 'phone', value: '9876543210' });
  for (const bad of ['', 'not-an-email@', '12345', '5876543210', 'abc']) assert.equal(pw.parseResetIdentifier(bad), null, bad);
});

test('timeAgo reads naturally and survives bad input', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(10_000), now), 'just now');
  assert.equal(timeAgo(ago(5 * 60_000), now), '5 min ago');
  assert.equal(timeAgo(ago(3 * 3_600_000), now), '3 h ago');
  assert.equal(timeAgo(ago(2 * 86_400_000), now), '2 d ago');
  assert.match(timeAgo(ago(30 * 86_400_000), now), /2026/);
  assert.equal(timeAgo('not a date', now), '');
  assert.equal(timeAgo(ago(-60_000), now), 'just now'); // a clock a little ahead of the server
});

test('registry labels name every provider the server can use', () => {
  for (const id of ['arya', 'apiexpress', 'cashfree', 'idfy', 'stampmitra']) assert.ok(REGISTRY_LABELS[id], id);
});

test('image upload parts always carry a name and a content type the server accepts', () => {
  assert.deepEqual(imageFilePart({ uri: 'file:///cache/IMG_001.JPG' }), { uri: 'file:///cache/IMG_001.JPG', name: 'photo.jpg', type: 'image/jpeg' });
  const png = imageFilePart({ uri: 'file:///cache/shot.png' }, 'rc');
  assert.equal(png.type, 'image/png');
  assert.match(png.name, /^rc\.png$/);
});

test('transfer paperwork: dates convert both ways and an impossible date is refused', () => {
  assert.equal(paperwork.dmyToIso('05/03/2026'), '2026-03-05');
  assert.equal(paperwork.isoToDmy('2026-03-05'), '05/03/2026');
  assert.equal(paperwork.dmyToIso('31/02/2026'), null);
  assert.equal(paperwork.dmyToIso('garbage'), null);
});

test('transfer paperwork: a party form needs real values, and a full ID number is never accepted', () => {
  const empty = paperwork.validateParty(paperwork.emptyParty(), { requireId: true });
  assert.ok(Object.keys(empty).length > 3);

  const form = {
    ...paperwork.emptyParty(), fullName: 'Asha Verma', relation: 'D/o', guardianName: 'Raj Verma', line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001',
    mobile: '9876543210', idType: 'aadhaar', idLast4: '1234'
  };
  assert.deepEqual(paperwork.validateParty(form, { requireId: true }), {});
  assert.ok(paperwork.validateParty({ ...form, idLast4: '123456789012' }, { requireId: true }).idLast4);
  assert.ok(paperwork.validateParty({ ...form, mobile: '12345' }, { requireId: true }).mobile);
  assert.ok(paperwork.validateParty({ ...form, pincode: '41' }, { requireId: true }).pincode);
});
