import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compile} from 'svelte/compiler';

test('the shared editor exports and compiles as a standalone Svelte 5 component', ()=>{
  const file='./PublicProfileEditor.svelte';
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(manifest.exports[file].svelte,'./src/PublicProfileEditor.svelte');
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  for(const generate of ['client','server']) {
    const {warnings}=compile(source,{filename:'PublicProfileEditor.svelte',generate});
    assert.deepEqual(warnings.map(w=>w.code),[]);
  }
});
