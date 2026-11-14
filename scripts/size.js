import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const source = readFileSync(new URL('../src/urchin.js', import.meta.url));
console.log(`Core: ${source.length.toLocaleString()} bytes source / ${gzipSync(source).length.toLocaleString()} bytes gzip (without minification). Runtime dependencies: 0.`);
