import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const required = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

let ok = true;
for (const file of required) {
  const full = join(root, file);
  if (!existsSync(full)) {
    console.error(`MISSING: ${file}`);
    ok = false;
  } else {
    console.log(`  OK: ${file}`);
  }
}

if (!ok) {
  console.error('\nBuild failed: missing files.');
  process.exit(1);
}

console.log('\nBuild OK — load the project root as an unpacked extension in Chrome.');
