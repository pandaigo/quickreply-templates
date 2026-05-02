import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'icons');
mkdirSync(outDir, { recursive: true });

// 吹き出し + 稲妻アイコン（プロフェッショナルなブルー）
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A90D9"/>
      <stop offset="100%" style="stop-color:#357ABD"/>
    </linearGradient>
  </defs>
  <!-- 角丸背景 -->
  <rect x="4" y="4" width="120" height="120" rx="24" fill="url(#bg)"/>
  <!-- 吹き出し -->
  <path d="M28 32 h72 a8 8 0 0 1 8 8 v44 a8 8 0 0 1 -8 8 h-48 l-16 16 v-16 h-8 a8 8 0 0 1 -8 -8 v-44 a8 8 0 0 1 8 -8z" fill="white" opacity="0.95"/>
  <!-- 稲妻マーク -->
  <path d="M68 42 L56 66 h12 L54 94 L78 62 h-12 L78 42z" fill="#4A90D9" stroke="#357ABD" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

for (const size of [16, 48, 128]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
  console.log(`Generated icon${size}.png`);
}
