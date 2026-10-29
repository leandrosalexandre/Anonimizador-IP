// Gera os ícones PNG do PWA a partir de public/favicon.svg usando o Chromium do Playwright.
// Os PNGs ficam versionados; rode `npm run icons` só se o SVG mudar.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  // Ícone "maskable": conteúdo dentro da zona segura (80% central), fundo sólido.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.12 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, padding } of targets) {
  const inner = Math.round(size * (1 - padding * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${padding ? '#1e3a8a' : 'transparent'}">` +
      `<img src="${dataUrl}" width="${inner}" height="${inner}"></body></html>`,
  );
  await page.screenshot({
    path: new URL(`../public/icons/${file}`, import.meta.url).pathname,
    omitBackground: !padding,
  });
  console.log(`gerado public/icons/${file}`);
}
await browser.close();
