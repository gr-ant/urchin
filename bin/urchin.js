#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { render, encodeWav } from '../src/urchin.js';

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log('Usage: node bin/urchin.js input.json output.wav [sample-rate]\nDefault sample rate: 22050 Hz. Existing output files are never overwritten.');
} else if (args.length < 2 || args.length > 3) {
  console.error('Usage: node bin/urchin.js input.json output.wav [sample-rate]');
  process.exitCode = 1;
} else {
  try {
    const [input, output, rate = '22050'] = args;
    if (resolve(input) === resolve(output)) throw new Error('Input and output must be different files.');
    const audio = render(await readFile(input, 'utf8'), { sampleRate: Number(rate) });
    await writeFile(output, encodeWav(audio), { flag: 'wx' });
    console.log(`${output}: ${audio.duration.toFixed(2)}s, ${audio.sampleRate} Hz, mono PCM16`);
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Output already exists; choose a new filename.' : error.message);
    process.exitCode = 1;
  }
}
