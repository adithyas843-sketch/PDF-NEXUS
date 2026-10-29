import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const outputDir = resolve('public');
mkdirSync(outputDir, { recursive: true });
copyFileSync(source, resolve(outputDir, 'pdf.worker.min.mjs'));
