import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderArticleBody } from './article-renderer.mjs';

test('Google Doc snapshot resolves every article instruction', async () => {
  const source = await readFile(new URL('./article-source.md', import.meta.url), 'utf8');
  const html = renderArticleBody(source);
  assert.equal((html.match(/class="ce-lab"/g) ?? []).length, 5);
  assert.ok(!html.includes('ce-unresolved'));
  assert.ok(html.includes('stopped representing the bit of physics'));
  assert.ok(html.includes('The diagnostic'));
  assert.ok(html.includes('OBI-WAN NAIROBI'));
});
