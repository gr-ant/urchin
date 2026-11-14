import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compile, render, encodeWav, play, instruments } from '../src/urchin.js';

const song = (sequence = 'A1P1q', metadata = {}) => ({
  format: 'CSLT-1', version: '1.0',
  metadata: { tempo_bpm: 120, time_signature: '4/4', instruments: { P: 'sine' }, ...metadata },
  sequence
});
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('unmodified specification example compiles and renders deterministically', async () => {
  const input = await readFile(new URL('../examples/ambient.json', import.meta.url), 'utf8');
  const score = compile(input);
  assert.equal(score.events.length, 9);
  assert.equal(score.bars, 2);
  near(score.events[0].frequency, 329.6275569128699);
  near(score.events[7].start, 6 * 60 / 70);
  near(score.duration, 8 * 60 / 70);
  const audio = render(input);
  assert.deepEqual(audio, render(input));
  assert.ok(audio.samples.some(value => Math.abs(value) > 0.01));
  assert.ok(audio.samples.every(value => Number.isFinite(value) && Math.abs(value) <= 0.95));
});

test('meters, durations, chords, silence, and out-of-order tokens retain their timing', () => {
  const score = compile(song('B1P12w\n A6P3s A1P1e A1P5h', { time_signature: '6/8' }));
  assert.deepEqual(score.events.map(event => event.start), [0, 0, 1.25, 1.5]);
  assert.deepEqual(score.events.map(event => event.duration), [0.25, 1, 0.125, 2]);
  near(score.duration, 3.5); // Final whole note extends beyond its measure.
  near(compile(song('A12P1q', { time_signature: '12/8' })).events[0].start, 2.75);
  const audio = render(song('B1P1q'));
  assert.ok(audio.samples.subarray(0, audio.sampleRate * 2).every(value => value === 0));
});

test('pitch indices and transposition cover both ends of the octave', () => {
  const score = compile(song('A1P1q A2P12q'), { rootMidi: 48 });
  assert.deepEqual(score.events.map(event => event.midi), [48, 59]);
  near(score.events[0].frequency, 130.8127826502993);
});

test('version 1.1 explicitly represents every MIDI pitch without octave folding', () => {
  const tokens = Array.from({ length: 128 }, (_, midi) => `A1P${midi % 12 + 1}@${Math.floor(midi / 12) - 1}q`);
  const score = compile({ ...song(tokens.join(' ')), version: '1.1' });
  assert.deepEqual(score.events.map(event => event.midi), Array.from({ length: 128 }, (_, i) => i));
  near(score.events[0].frequency, 8.175798915643707);
  near(score.events[69].frequency, 440);
  near(score.events[127].frequency, 12543.853951415975);
});

test('legacy pitches retain their sound and root while explicit octaves are absolute', () => {
  const legacy = song('A1P1q A2P5q A3P8h');
  const upgraded = { ...legacy, version: '1.1' };
  const explicit = { ...legacy, version: '1.1', sequence: 'A1P1@4q A2P5@4q A3P8@4h' };
  assert.deepEqual(render(legacy), render(upgraded));
  assert.deepEqual(render(legacy), render(explicit));
  assert.deepEqual(render(explicit, { rootMidi: 36 }), render(explicit));
  const mixed = { ...song('A1P1q A1P1@2q A1P1@5q'), version: '1.1' };
  assert.deepEqual(compile(mixed, { rootMidi: 48 }).events.map(event => event.midi), [48, 36, 72]);
});

test('explicit pitches reject wrong versions, malformed octaves, and out-of-range MIDI', () => {
  assert.throws(() => compile(song('A1P1@4q')), /require version "1.1"/);
  for (const token of ['A1P1@-2q', 'A1P1@10q', 'A1P1@04q', 'A1P1@+4q', 'A1P1@4.5q', 'A1P1@q', 'A1P13@4q']) {
    assert.throws(() => compile({ ...song(token), version: '1.1' }), /invalid token/);
  }
  for (const token of ['A1P9@9q', 'A1P12@9q']) {
    assert.throws(() => compile({ ...song(token), version: '1.1' }), /exceeds MIDI 127/);
  }
});

test('wide-register synthesis retains bass and treble frequencies and finite range endpoints', () => {
  const wide = { ...song('A1P1@2h A1P1@5h'), version: '1.1' };
  const { samples, sampleRate } = render(wide, { sampleRate: 44100 });
  const magnitude = frequency => {
    let real = 0, imaginary = 0;
    for (let i = 4410; i < 35000; i++) {
      const phase = 2 * Math.PI * frequency * i / sampleRate;
      real += samples[i] * Math.cos(phase);
      imaginary += samples[i] * Math.sin(phase);
    }
    return Math.hypot(real, imaginary);
  };
  const c2 = magnitude(65.40639132514966);
  const c5 = magnitude(523.2511306011972);
  const c4 = magnitude(261.6255653005986);
  assert.ok(c2 > 1000 && c5 > 1000);
  assert.ok(c2 > c4 * 20 && c5 > c4 * 20, 'Registers must not collapse to C4');
  for (const sequence of ['A1P1@-1h', 'A1P8@9h']) {
    const audio = render({ ...song(sequence), version: '1.1' }, { sampleRate: 44100 });
    assert.ok(audio.samples.every(value => Number.isFinite(value) && Math.abs(value) <= 0.95));
    assert.ok(audio.samples.some(value => Math.abs(value) > 0.01));
  }
});

test('octave example spans bass and treble without external playback options', async () => {
  const input = await readFile(new URL('../examples/octaves.json', import.meta.url), 'utf8');
  const score = compile(input);
  assert.equal(Math.min(...score.events.map(event => event.midi)), 36);
  assert.equal(Math.max(...score.events.map(event => event.midi)), 74);
  assert.ok(render(input).samples.some(value => value !== 0));
});

test('invalid metadata and tokens fail with useful errors', () => {
  const cases = [
    [null, /format/], ['{', /valid JSON/], [{ ...song(), version: '2.0' }, /version/],
    [song('', { tempo_bpm: 0 }), /tempo_bpm/],
    [song('', { time_signature: '4/0' }), /positive/],
    [song('', { time_signature: 44 }), /time_signature/],
    [song('', { instruments: [] }), /instruments/],
    [song('', { instruments: { PP: 'piano' } }), /uppercase/],
    [song('A1P13q'), /invalid token #1/], [song('A0P1q'), /invalid token/],
    [song('A5P1q'), /beat exceeds/], [song('A1X1q'), /unmapped instrument X/],
    [song('A1P1q broken'), /invalid token #2/],
    [song('A1.5P1q'), /invalid token/], [song('a1P1q'), /invalid token/]
  ];
  for (const [input, error] of cases) assert.throws(() => compile(input), error);
  assert.throws(() => render(song(), { sampleRate: 0 }), /sampleRate/);
  assert.throws(() => render(song(), { rootMidi: NaN }), /rootMidi/);
  assert.throws(() => render(song(), { volume: Infinity }), /volume/);
  assert.throws(() => render(song('Z1P1q', { time_signature: '99/4', tempo_bpm: 20 })), /render exceeds/);
});

test('rendered oscillator has the requested frequency and silent edges', () => {
  const { samples, sampleRate } = render(song('A1P10h'), { sampleRate: 44100 });
  const crossings = [];
  for (let i = 4410; i < 35000; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) crossings.push(i);
  }
  const measured = (crossings.length - 1) * sampleRate / (crossings.at(-1) - crossings[0]);
  near(measured, 440, 0.03);
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 0);
  assert.ok(render(song(), { volume: 0 }).samples.every(value => value === 0));
});

test('all presets produce bounded sound; dense chords do not clip', () => {
  const instruments = { P: 'Acoustic Piano', M: 'Music Box', G: 'Nylon-String Guitar', C: 'Solo Cello', S: 'Ambient Synth Pad', X: 'Unknown' };
  for (const code of Object.keys(instruments)) {
    const audio = render(song(`A1${code}1q`, { instruments }));
    assert.ok(audio.samples.some(value => Math.abs(value) > 0.01), code);
  }
  const dense = render(song(Array(80).fill('A1P1q').join(' ')), { volume: 1 });
  let peak = 0;
  for (const value of dense.samples) peak = Math.max(peak, Math.abs(value));
  near(peak, 0.95, 1e-6);
  const high = render(song('A1P12q'), { rootMidi: 116, sampleRate: 8000 });
  assert.ok(high.samples.every(value => value === 0)); // Above-Nyquist partials omitted.
});

test('20 named instruments resolve by ID and display name and produce distinct audio', () => {
  assert.equal(Object.keys(instruments).length, 20);
  const fingerprints = new Set();
  for (const [id, name] of Object.entries(instruments)) {
    for (const input of [id, name, id.toUpperCase().replaceAll('_', '-')]) {
      assert.equal(compile(song('A1P1q', { instruments: { P: input } })).events[0].voice, id, input);
    }
    for (const sampleRate of [8000, 22050, 44100]) {
      const audio = render(song('A1P1q A1P5q A1P8q', { instruments: { P: id } }), { sampleRate });
      assert.ok(audio.samples.some(value => Math.abs(value) > 0.01), name);
      assert.ok(audio.samples.every(value => Number.isFinite(value) && Math.abs(value) <= 0.95), name);
      assert.equal(audio.samples[0], 0);
      assert.equal(audio.samples.at(-1), 0);
      if (sampleRate === 22050) fingerprints.add(createHash('sha256').update(new Uint8Array(audio.samples.buffer)).digest('hex'));
    }
  }
  assert.equal(fingerprints.size, 20, 'Each preset should have its own sound');
});

test('specific instrument aliases take priority over broad instrument families', () => {
  for (const [name, expected] of [
    ['Rhodes keys', 'electric_piano'], ['steel string guitar', 'steel_guitar'],
    ['harpsichord', 'harpsichord'], ['synth lead', 'lead'],
    ['solo violin strings', 'violin'], ['bass clarinet', 'clarinet'],
    ['unrecognized', 'sine'], ['celesta', 'bell'], ['bowed strings', 'cello']
  ]) {
    assert.equal(compile(song('A1P1q', { instruments: { P: name } })).events[0].voice, expected, name);
  }
});

test('instrument showcase includes every preset in catalog order', async () => {
  const input = await readFile(new URL('../examples/instruments.json', import.meta.url), 'utf8');
  const score = compile(input);
  assert.deepEqual([...new Set(score.events.map(event => event.voice))], Object.keys(instruments));
  assert.equal(score.bars, 20);
});

test('WAV headers, signed samples, clipping, and empty songs are valid', () => {
  const bytes = encodeWav({ samples: new Float32Array([-2, -1, 0, 1, 2, NaN]), sampleRate: 22050 });
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(bytes.subarray(8, 16)), 'WAVEfmt ');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint32(28, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + 2 * i, true)), [-32768, -32768, 0, 32767, 32767, 0]);
  assert.equal(encodeWav(render(song('  '))).byteLength, 44);
});

test('CLI writes WAV and refuses to overwrite existing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'urchin-test-'));
  const output = join(dir, 'music.wav');
  try {
    const cli = new URL('../bin/urchin.js', import.meta.url).pathname;
    const input = new URL('../examples/ambient.json', import.meta.url).pathname;
    const args = [cli, input, output, '16000'];
    const stdout = execFileSync(process.execPath, args, { encoding: 'utf8' });
    assert.match(stdout, /16000 Hz/);
    const before = await readFile(output);
    assert.equal(before.readUInt32LE(24), 16000);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /Output already exists/);
    assert.deepEqual(await readFile(output), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Node playback reports that Web Audio is required', async () => {
  await assert.rejects(play(song()), /Web Audio/);
});
