# Urchin

A tiny **CSLT-1 JSON → music** synthesizer. **Plain JavaScript; Node is not required for browser use.** Zero dependencies, no soundfonts, no build step. One ES module provides 20 synthesized instruments, the full MIDI pitch range, mono playback, and 16-bit WAV export in modern browsers or Node.js.

## Make music now

Use it directly in an HTML page served by any web server:

```html
<button id="play">Play</button>
<script type="module">
  import { play } from './src/urchin.js';
  const song = {
    format: 'CSLT-1', version: '1.1',
    metadata: { tempo_bpm: 120, time_signature: '4/4', instruments: { P: 'flute' } },
    sequence: 'A1P1@4q A2P5@4q A3P1@5h'
  };
  document.querySelector('#play').onclick = () => play(song);
</script>
```

The included browser player has a selector for all 20 instruments. To try it locally, serve the project with your existing web server or, if Python is installed:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000/examples/player.html**, choose an instrument and click Load instrument demo, then Play. You can also edit JSON and save WAV files entirely in the browser. Opening the HTML directly as a `file:` URL will not load ES modules reliably.

The optional command-line exporter uses Node.js 18 or later; no `npm install` needed:

```sh
node bin/urchin.js examples/ambient.json music.wav
# Optional output sample rate:
node bin/urchin.js examples/ambient.json music-hq.wav 44100
# Hear all 20 instruments in catalog order:
node bin/urchin.js examples/instruments.json instruments.wav
# Bass, piano, and flute across multiple octaves:
node bin/urchin.js examples/octaves.json octaves.wav 44100
```

The CLI refuses to overwrite existing files. The example is the exact reference payload from the supplied CSLT-1 specification.

## Input

```json
{
  "format": "CSLT-1",
  "version": "1.0",
  "metadata": {
    "title": "First melody",
    "tempo_bpm": 100,
    "time_signature": "4/4",
    "instruments": { "P": "Acoustic Piano" }
  },
  "sequence": "A1P1q A2P5q A3P8h B1P12q B2P8q B3P1h"
}
```

`A1P5q` means measure A, beat 1, instrument P, pitch 5 (E), quarter note. Tokens are separated by whitespace. Notes at the same position form a chord; gaps are rests. Input order does not matter.

| Field | Values |
| --- | --- |
| Measure | `A`–`Z` |
| Beat | Integer `1` through the time signature's numerator |
| Instrument | `A`–`Z`, declared in `metadata.instruments` |
| Pitch | `1`–`12`: C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯, B |
| Octave (version 1.1) | Optional `@-1` through `@9`, after pitch and before duration; resulting MIDI note must be 0–127 |
| Duration | `w` = 4, `h` = 2, `q` = 1, `e` = ½, `s` = ¼ quarter notes |

## Notes across octaves

Use **`"version": "1.1"`** and add `@octave` after the pitch index. This is Urchin's extension to the supplied CSLT-1 version 1.0 specification. The `format` identifier remains `"CSLT-1"`. Existing version 1.0 payloads play unchanged; old 1.0-only engines cannot play the new octave syntax.

```json
{
  "format": "CSLT-1",
  "version": "1.1",
  "metadata": {
    "title": "Bass and treble",
    "tempo_bpm": 120,
    "time_signature": "4/4",
    "instruments": { "P": "piano" }
  },
  "sequence": "A1P1@2w A1P1@4q A2P5@4q A3P8@4q A4P1@5q"
}
```

This holds C2 while playing C4, E4, G4, and C5. Each note has its own octave; no additional playback options are needed.

| Token | Note |
| --- | --- |
| `A1P1@-1q` | C−1, MIDI 0 |
| `A1P10@0q` | A0, lowest standard piano key |
| `A1P1@4q` | C4, middle C |
| `A1P10@4q` | A4, 440 Hz |
| `A1P1@8q` | C8, highest standard piano key |
| `A1P8@9q` | G9, MIDI 127 |

Explicit pitches use `midi = 12 * (octave + 1) + pitchIndex - 1`. C−1 through G9 are supported; G♯9–B9 are rejected. Octaves require one digit (or `-1`); no `+` sign or leading zeros.

Without `@octave`, both versions retain the original `rootMidi + pitchIndex - 1` behavior. Explicit octaves are absolute and **do not change with `rootMidi`**. Version 1.1 may mix both forms, but use explicit octaves for every note in sheet-music transcriptions so the JSON preserves register on its own.

## Instrument library

Use a preset ID or its display name in `metadata.instruments`, for example `"instruments": { "P": "electric_piano", "F": "Flute" }`. Instrument letters remain your choice. Matching ignores case and accepts spaces, underscores, or hyphens in preset IDs.

| Preset ID | Instrument |
| --- | --- |
| `piano` | Acoustic Piano |
| `electric_piano` | Electric Piano |
| `organ` | Tonewheel Organ |
| `harpsichord` | Harpsichord |
| `bell` | Music Box |
| `marimba` | Marimba |
| `vibraphone` | Vibraphone |
| `glockenspiel` | Glockenspiel |
| `guitar` | Nylon-String Guitar |
| `steel_guitar` | Steel-String Guitar |
| `bass` | Electric Bass |
| `harp` | Harp |
| `cello` | Solo Cello |
| `violin` | Solo Violin |
| `flute` | Flute |
| `clarinet` | Clarinet |
| `oboe` | Oboe |
| `trumpet` | Trumpet |
| `pad` | Ambient Synth Pad |
| `lead` | Synth Lead |

The original five voices retain their sound. Common aliases such as Rhodes, fiddle, vibes, and celesta also work. Unknown names use a simple sine voice; `sine` is also explicitly available outside the 20-instrument catalog. All voices support the full pitch range. Specify `@2` or `@3` for bass-register notes; instrument names do not automatically transpose notes.

The frozen catalog is available directly in browser JavaScript:

```js
import { instruments } from './src/urchin.js';
console.log(instruments); // { piano: 'Acoustic Piano', electric_piano: 'Electric Piano', ... }
```

## JavaScript API

```js
import { compile, render, encodeWav, play } from './src/urchin.js';

// All three accept a payload object or its JSON string.
const score = compile(song);       // Validated, sorted events with timings/frequencies
const audio = render(song);        // { samples: Float32Array, sampleRate, duration }
const wav = encodeWav(audio);      // Uint8Array; write to disk or make an audio/wav Blob

// Browser: invoke inside a click/tap handler to permit audio.
const player = await play(song);
player.stop();                    // Safe to call repeatedly
await player.ended;                // Resolves on completion or stop
```

For a complete Node integration:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { render, encodeWav } from './src/urchin.js';

const song = await readFile('examples/ambient.json', 'utf8');
await writeFile('output.wav', encodeWav(render(song)), { flag: 'wx' });
```

`compile(song, { rootMidi: 60 })` sets the root for notes **without explicit octaves**. For those notes, `48` moves pitches down an octave and `62` makes index 1 D4. Notes with `@octave` are unaffected.

`render(song, options)` and `play(song, options)` accept:

| Option | Default | Meaning |
| --- | --- | --- |
| `sampleRate` | `22050` | Integer Hz, 8000–96000; 44100 gives brighter high partials |
| `rootMidi` | `60` | Integer 0–116; base pitch for notes without `@octave`, default C4–B4 |
| `volume` | `0.7` | Master gain 0–1, applied after peak limiting |
| `context` | New AudioContext | `play` only: reuse a caller-owned browser context |

Playback closes contexts it creates, including on errors. Caller-owned contexts stay open. Each `play` call is independent; call the previous player's `stop()` before replacing it.

## Interpretation of CSLT-1

The supplied spec has a few underspecified details. This implementation makes these choices explicit:

- BPM counts quarter notes. A beat position counts denominator units: in 6/8 at 120 BPM, beats are 0.25 seconds apart, and a `q` note still lasts 0.5 seconds. The field table and reference regex take precedence over the EBNF's 1–4 beat restriction.
- Version 1.0 has no octave field; unqualified pitch indices default to C4–B4. Version 1.1 adds explicit `@octave` pitches. There is no key-signature metadata: encode the actual sounding accidentals in pitch indices.
- Instrument **names or preset IDs** select the timbre; letters are arbitrary identifiers. Specific names (electric piano, steel-string guitar, synth lead) take precedence over broad aliases (piano, string, synth). Other names use a sine voice.
- Empty sequences produce zero samples and a valid empty WAV. Nonempty scores include whole measures through the final event, notes extending past a bar, and any audible release tails.
- Versions `1.0` and `1.1` are supported. Octave tokens in a version 1.0 payload are rejected. Invalid tokens, out-of-bar beats, missing mappings, or malformed metadata raise descriptive errors. Extra JSON properties are ignored.
- CSLT-1 supports integer beat starts only. Offbeat starts can use an equivalent finer grid, such as 8/8 for eighth-note starts in a written 4/4 bar, without changing quarter-note BPM or duration codes. Dotted/tuplet durations, velocity, automation, and loops still require a future extension. See [agent.md](agent.md) for sheet-music conversion instructions.

## Size and sound

Run `npm run size` for exact source and gzip sizes. The core is under **5 KB gzipped**, including all 20 instruments, validation, DSP, WAV encoding, and playback. There are no runtime dependencies, external samples, or network calls in the core.

Voices use a few additive partials, exponential decays, and attack/release envelopes. Recurrence oscillators avoid per-sample trigonometry. Partials at or above Nyquist are omitted; a note entirely above Nyquist is silent. Use 44,100 Hz or higher to hear the entire MIDI range: at the 22,050 Hz default, MIDI 125–127 exceed Nyquist. Very low notes may be inaudible on small speakers. A global downward-only peak adjustment prevents clipping. These are compact synthesized approximations of instruments, not sampled acoustic reproductions.

Rendering is synchronous and holds the whole track in memory: roughly `4 × sampleRate × seconds` bytes for PCM, plus WAV/export or browser buffer copies. Long tracks can briefly block the UI; use `render` in your own worker if needed. Limits are 10,000 events, 600 seconds including tails, and 30 million samples per render. There is no streaming, reverb, or sequencer dependency.

## Checks

```sh
npm test
npm run size
# Optional, requires Google Chrome (or set CHROME_BIN to a Chromium executable):
npm run test:browser
```

Tests cover the reference payload, time signatures, chords, pitch measured from generated audio, all 20 distinct instruments at three sample rates, alias selection, clipping, malformed input, WAV headers/sample encoding, and the CLI.

The optional browser check exercises real Web Audio playback, stop, natural completion, empty input, errors, and context ownership. You can also open `/test/browser.html` on the local server and run it manually.
