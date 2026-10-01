import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = mkdtempSync(join(tmpdir(), 'iris-contact-memory-package-'));
try {
  execFileSync('pnpm', ['build'], {stdio: 'inherit'});
  const packed = JSON.parse(execFileSync('pnpm', ['pack', '--json', '--pack-destination', fixture], {encoding: 'utf8'}));
  const target = join(fixture, 'node_modules/@iris/svelte-ui');
  mkdirSync(target, {recursive: true});
  execFileSync('tar', ['-xzf', packed.filename, '--strip-components=1', '-C', target]);
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { emptyContactMemory, observeContactName } from '@iris/svelte-ui/contactMemory';
    import { createContactMemoryStore } from '@iris/svelte-ui/contactMemoryStore';
    assert.equal(observeContactName(emptyContactMemory(), 'Alice').accepted_name, 'Alice');
    const data = new Map();
    const store = createContactMemoryStore({getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v)});
    store.remember('a'.repeat(64), 'b'.repeat(64), 'Bob');
    assert.equal(store.get('a'.repeat(64), 'b'.repeat(64)).accepted_name, 'Bob');
    console.log('Packed contact-memory imports pass in Node');
  `], {cwd: fixture, stdio: 'inherit'});
} finally {
  rmSync(fixture, {recursive: true, force: true});
}
