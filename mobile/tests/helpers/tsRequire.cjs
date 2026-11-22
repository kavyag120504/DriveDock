// Lets plain `node --test` load the app's TypeScript source without a bundler or any extra test dependency.
// - `.ts` files are transpiled to CommonJS on the fly.
// - `mockModules` replaces named modules (react-native, API clients...) so store logic runs without a device.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React }
  });
  module._compile(outputText, filename);
};

const mocks = new Map();
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  // Match a mock by the request text, or by the resolved file name for relative imports
  if (mocks.has(request)) return mocks.get(request);
  if (request.startsWith('.') && parent && parent.filename) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    for (const [key, value] of mocks) {
      if (path.isAbsolute(key) && (resolved === key || resolved === key.replace(/\.ts$/, ''))) return value;
    }
  }
  return realLoad.apply(this, arguments);
};

/** `map` keys are package names ('react-native') or absolute source paths (path.resolve(__dirname, '../../src/api/endpoints')). */
const mockModules = (map) => { for (const [k, v] of Object.entries(map)) mocks.set(k, v); };
const clearMocks = () => mocks.clear();

const src = (...parts) => path.resolve(__dirname, '..', '..', 'src', ...parts);

module.exports = { mockModules, clearMocks, src };
