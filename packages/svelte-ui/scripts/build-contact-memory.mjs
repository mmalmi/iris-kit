import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of ['contactMemory', 'contactMemoryStore']) {
  const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  writeFileSync(new URL(`../dist/${name}.js`, import.meta.url), outputText.replaceAll("'./contactMemory.ts'", "'./contactMemory.js'"));
}
