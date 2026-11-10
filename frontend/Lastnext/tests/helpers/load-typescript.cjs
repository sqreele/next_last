const { readFileSync } = require('node:fs');
const { dirname } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

module.exports = function loadTypeScript(filename) {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(dirname(filename));
  compiled._compile(outputText, filename);
  return compiled.exports;
};
