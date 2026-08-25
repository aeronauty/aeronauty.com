#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DOC_ID = '1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs';
const TAB_ID = 't.0';
const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit?tab=${TAB_ID}`;
const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLE_ROOT = path.join(
  SITE_ROOT,
  'content',
  'private',
  'topology-instinct',
  'computational-experimentation',
);
const SOURCE_PATH = path.join(ARTICLE_ROOT, 'article-source.md');
const METADATA_PATH = path.join(ARTICLE_ROOT, 'source-metadata.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceHeader() {
  return `<!-- GENERATED FROM GOOGLE DOC ${DOC_ID}. DO NOT EDIT PROSE HERE. Run npm run sync:computational-experimentation. -->`;
}

function normaliseExport(markdown) {
  let source = String(markdown).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  source = source.replace(/^<!-- GENERATED FROM GOOGLE DOC[^\n]*-->\s*/m, '');
  if (!source.startsWith('# Computational Experimentation')) {
    throw new Error('The exported Doc no longer starts with # Computational Experimentation.');
  }
  const dividers = source.match(/^— — —$/gm)?.length ?? 0;
  if (dividers !== 5) {
    throw new Error(`Expected five section dividers; found ${dividers}.`);
  }
  for (const marker of ['single vortex element', 'same widget', 'spanwise change', 'sinusoidal loading', 'Theodorsen']) {
    if (!source.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`Required article instruction is missing: ${marker}`);
    }
  }
  return `${sourceHeader()}\n\n${source}\n`;
}

async function googleRequest(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return response;
}

async function exportFromGoogle(token) {
  const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${DOC_ID}`);
  metadataUrl.searchParams.set('fields', 'id,name,modifiedTime,version');
  metadataUrl.searchParams.set('supportsAllDrives', 'true');
  const metadata = await (await googleRequest(metadataUrl, token)).json();

  const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${DOC_ID}/export`);
  exportUrl.searchParams.set('mimeType', 'text/markdown');
  const markdown = await (await googleRequest(exportUrl, token)).text();
  return {
    markdown,
    sourceName: metadata.name,
    sourceModifiedTime: metadata.modifiedTime,
    sourceRevisionId: String(metadata.version ?? ''),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let exported;

  if (args.input) {
    const inputPath = path.resolve(String(args.input));
    exported = {
      markdown: await readFile(inputPath, 'utf8'),
      sourceName: path.basename(inputPath),
      sourceModifiedTime: args.modified ?? null,
      sourceRevisionId: args.revision ?? null,
    };
  } else {
    const token = process.env.GOOGLE_DOCS_ACCESS_TOKEN;
    if (!token) {
      throw new Error('Set GOOGLE_DOCS_ACCESS_TOKEN, or pass --input /path/to/google-doc-export.md.');
    }
    exported = await exportFromGoogle(token);
  }

  const source = normaliseExport(exported.markdown);
  const generatedAt = args['generated-at'] ?? new Date().toISOString();
  const metadata = {
    googleDocId: DOC_ID,
    googleDocUrl: DOC_URL,
    sourceName: exported.sourceName,
    sourceRevisionId: exported.sourceRevisionId,
    generatedAt,
    sourceSha256: sha256(source),
    sourceModifiedTime: exported.sourceModifiedTime,
  };

  await writeFile(SOURCE_PATH, source, 'utf8');
  await writeFile(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  console.log(`Synced Google Doc prose -> ${path.relative(SITE_ROOT, SOURCE_PATH)}`);
  console.log(`Source SHA-256: ${metadata.sourceSha256}`);
  console.log('The private article renders this snapshot directly; CSS, callouts and widgets remain repository-owned.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
