// Carga Playwright desde node_modules local o, si no está, desde la instalación global.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    const require = createRequire(path.join(globalRoot, 'noop.js'));
    return require('playwright');
  }
}
