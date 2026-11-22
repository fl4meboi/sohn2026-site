import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSite } from './lib/site-generator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export async function runBuild({ quiet = false } = {}) {
  const config = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'config.json'), 'utf-8'));
  const data = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'data', 'blog-data.json'), 'utf-8'));

  const result = await generateSite({ rootDir: ROOT_DIR, data, config });
  if (!quiet) {
    console.log(
      `[build] Generated ${result.pagesGenerated} HTML pages into ${path.relative(ROOT_DIR, result.distDir)}/`
    );
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBuild().catch((err) => {
    console.error('[build] Error:', err.message);
    process.exitCode = 1;
  });
}
