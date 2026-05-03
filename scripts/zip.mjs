import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, unlinkSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outZip = join(root, 'quickreply-templates.zip');
const tmp = join(root, '_zip_tmp');

if (existsSync(outZip)) unlinkSync(outZip);

const include = [
  'manifest.json',
  'background.js',
  'content.js',
  'ExtPay.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

// 一時フォルダにディレクトリ構造ごとコピー
if (existsSync(tmp)) execSync(`cmd /c "rmdir /s /q ${tmp}"`, { stdio: 'ignore' });
for (const file of include) {
  const src = join(root, file);
  const dest = join(tmp, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// 一時フォルダの中身をZIP化
execSync(
  `powershell -Command "Compress-Archive -Path '${join(tmp, '*')}' -DestinationPath '${outZip}' -Force"`,
  { stdio: 'inherit' }
);

// 一時フォルダ削除
execSync(`cmd /c "rmdir /s /q ${tmp}"`, { stdio: 'ignore' });

console.log(`\nCreated: ${outZip}`);
