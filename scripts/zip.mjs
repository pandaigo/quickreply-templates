import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outZip = join(root, 'quickreply-templates.zip');

if (existsSync(outZip)) {
  unlinkSync(outZip);
}

const include = [
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

const fileList = include.join('" "');
execSync(
  `powershell -Command "Compress-Archive -Path '${include.join("','")}' -DestinationPath '${outZip}' -Force"`,
  { cwd: root, stdio: 'inherit' }
);

console.log(`\nCreated: ${outZip}`);
