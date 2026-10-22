// Turns the single-file preview build into a page body for the claude.ai
// artifact preview (the host supplies its own <html>/<head>/<body> skeleton).
import { readFileSync, writeFileSync } from 'node:fs';

const src = 'dist-artifact/index.html';
let html = readFileSync(src, 'utf8');

const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] || '<title>OPAQUE</title>';
const fit = '<meta name="claude:viewport-fit-sides" content="cover">';

html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>|<\/html>/gi, '')
  .replace(/<head>|<\/head>/gi, '')
  .replace(/<body[^>]*>|<\/body>/gi, '')
  .replace(/<meta charset="[^"]*">/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(title, '')
  .replace(fit, '');

writeFileSync('dist-artifact/opaque.html', `${title}\n${fit}\n${html.trim()}\n`);
console.log('wrote dist-artifact/opaque.html');
