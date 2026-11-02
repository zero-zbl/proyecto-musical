// Genera los íconos PNG a partir de icons/icon.svg usando Chromium (Playwright).
import { loadPlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#0e1116;display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace('<svg', '<svg width="100%" height="100%"').replace('rx="112"', 'rx="0"')}</div></div>`
    : svg.replace('<svg', `<svg width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.screenshot({ path: path.join(root, 'icons', file), omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { maskable: true });
// iOS no admite transparencia: fondo sólido sin esquinas redondeadas.
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<html><body style="margin:0;background:#0e1116">${svg.replace('<svg', '<svg width="180" height="180"').replace('rx="112"', 'rx="0"')}</body></html>`);
await page.screenshot({ path: path.join(root, 'icons/apple-touch-icon.png'), clip: { x: 0, y: 0, width: 180, height: 180 } });
await browser.close();
console.log('Íconos generados');
