import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

async function component(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const { js, warnings } = compile(source, {filename: file, generate: 'server'});
  assert.deepEqual(warnings, []);
  const code = js.code.replace(/['"]svelte\/internal\/server['"]/g, JSON.stringify(import.meta.resolve('svelte/internal/server')));
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}

test('shared badge keeps personal mute and direct-follow priority over network warning', async () => {
  const Badge = await component('SocialDistanceBadge.svelte');
  const html = props => render(Badge, {props}).body;
  assert.match(html({distance: 2, overmuted: true}), /More mutes than follows/);
  assert.match(html({distance: 1, overmuted: true}), /title="Following"/);
  assert.match(html({distance: 0, overmuted: true}), /title="You"/);
  assert.match(html({distance: 1, overmuted: true, muted: true}), /title="Muted"/);
  assert.doesNotMatch(html({distance: -1}), /social-distance-badge/);
  assert.doesNotMatch(html({distance: null}), /social-distance-badge/);
});

test('favorite star is independent of social trust', async () => {
  const Star = await component('FavoriteStar.svelte');
  assert.match(render(Star, {props: {favorite: true}}).body, /Only you can see this/);
  assert.doesNotMatch(render(Star, {props: {favorite: false}}).body, /★/);
});
