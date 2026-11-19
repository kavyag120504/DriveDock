const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleExports = {};
const input = fs.readFileSync(require.resolve('../src/theme/responsiveLayout.ts'), 'utf8');
const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('exports', compiled)(moduleExports);
const { getResponsiveLayout: layout } = moduleExports;

test('small and short phones get compact spacing and enough room for a scan frame', () => {
  for (const [width, height] of [[320, 568], [360, 640], [393, 660]]) {
    const result = layout({ width, height });
    assert.equal(result.compact, true);
    assert.ok(result.pagePadding <= 16);
    assert.ok(result.scanFrameSize < width - 2 * result.pagePadding);
    assert.ok(result.cameraHeight < height);
  }
});
test('large text switches cards and date fields to a single column', () => {
  for (const fontScale of [1.3, 1.6, 2]) {
    const result = layout({ width: 393, height: 851, fontScale });
    assert.equal(result.compact, true);
    assert.equal(result.stack, true);
    assert.equal(result.stackFields, true);
  }
});
test('narrow controls stack even with normal text size', () => {
  assert.equal(layout({ width: 320, height: 568 }).stack, true);
  assert.equal(layout({ width: 360, height: 640 }).stackFields, true);
});
test('larger displays retain horizontal space without shrinking content text', () => {
  const result = layout({ width: 768, height: 1024, fontScale: 1 });
  assert.equal(result.stack, false);
  assert.equal(result.stackFields, false);
  assert.equal(result.pagePadding, 20);
});
test('orientation and font changes produce fresh layout choices', () => {
  assert.equal(layout({ width: 320, height: 568 }).stack, true);
  assert.equal(layout({ width: 568, height: 320 }).stack, false);
  assert.equal(layout({ width: 393, height: 851, fontScale: 1 }).stack, false);
  assert.equal(layout({ width: 393, height: 851, fontScale: 1.6 }).stack, true);
});
