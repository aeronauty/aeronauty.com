#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOCUMENT_ID = '1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs';
const DEFAULT_TAB_ID = 't.0';

const documentId = process.env.COMPUTATIONAL_EXPERIMENTATION_DOC_ID || DEFAULT_DOCUMENT_ID;
const tabId = process.env.COMPUTATIONAL_EXPERIMENTATION_TAB_ID || DEFAULT_TAB_ID;
const sourcePath = join(ROOT, 'article-source.md');
const metadataPath = join(ROOT, 'source-metadata.json');

function paragraphText(paragraph) {
  return (paragraph?.elements || [])
    .map((element) => element.textRun?.content || '')
    .join('')
    .replace(/\n$/, '');
}

function extractParagraphs(document) {
  const tab = document.tabs?.find((candidate) => candidate.tabProperties?.tabId === tabId);
  const body = tab?.documentTab?.body || document.body;
  if (!body?.content) {
    throw new Error(`Could not find body content for tab ${tabId}`);
  }

  return body.content
    .map((item) => (item.paragraph ? paragraphText(item.paragraph) : ''))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  });
  const docs = google.docs({ version: 'v1', auth });
  const response = await docs.documents.get({
    documentId,
    includeTabsContent: true,
  });

  const paragraphs = extractParagraphs(response.data);
  if (paragraphs.length < 2 || paragraphs[0] !== 'Computational Experimentation') {
    throw new Error('Google Doc export did not look like the expected essay; refusing to overwrite the snapshot.');
  }

  const source = `${paragraphs.join('\n\n')}\n`;
  const sourceSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  const metadata = {
    googleDocId: documentId,
    googleDocUrl: `https://docs.google.com/document/d/${documentId}/edit?tab=${tabId}`,
    tabId,
    title: response.data.title,
    revisionId: response.data.revisionId,
    syncedAt: new Date().toISOString(),
    sourceSha256,
    note: 'Generated snapshot. The Google Doc is authoritative; do not edit article-source.md by hand.',
  };

  await writeFile(sourcePath, source, 'utf8');
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`Synced Google Doc revision ${metadata.revisionId}`);
  console.log('The runtime article reads article-source.md directly; no prose build step is required.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
