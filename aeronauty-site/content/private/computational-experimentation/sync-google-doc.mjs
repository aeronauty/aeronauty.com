/** Refresh the generated prose snapshot from the canonical Google Doc. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const metaPath = path.join(ROOT,'source.json');
const snapshotPath = path.join(ROOT,'source-snapshot.txt');

function findTab(tabs = [], wanted) {
  for (const tab of tabs) {
    if (tab.tabProperties?.tabId === wanted) return tab;
    const nested = findTab(tab.childTabs ?? [], wanted);
    if (nested) return nested;
  }
  return null;
}
function paragraphs(content = []) {
  return content.flatMap((item) => {
    if (!item.paragraph) return [];
    const text = (item.paragraph.elements ?? []).map((element) => element.textRun?.content ?? '').join('').replace(/\n$/,'');
    return text.trim() ? [text.trimEnd()] : [];
  });
}
async function main() {
  const meta = JSON.parse(await fs.readFile(metaPath,'utf8'));
  let auth;
  if (process.env.GOOGLE_DOCS_ACCESS_TOKEN) {
    auth = new google.auth.OAuth2();
    auth.setCredentials({access_token:process.env.GOOGLE_DOCS_ACCESS_TOKEN});
  } else {
    auth = new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/documents.readonly']});
  }
  const docs = google.docs({version:'v1',auth});
  const {data:document} = await docs.documents.get({documentId:meta.documentId,includeTabsContent:true});
  const tab = findTab(document.tabs ?? [],meta.tabId);
  const content = tab?.documentTab?.body?.content ?? document.body?.content;
  if (!content) throw new Error(`Could not find tab ${meta.tabId}`);
  const text = paragraphs(content);
  if (text[0] !== 'Computational Experimentation') throw new Error('Unexpected source title');
  await fs.writeFile(snapshotPath,`${text.join('\n\n')}\n`);
  await fs.writeFile(metaPath,`${JSON.stringify({...meta,revisionId:document.revisionId,syncedAt:new Date().toISOString()},null,2)}\n`);
  console.log(`synced ${text.length} paragraphs from ${document.revisionId}`);
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
