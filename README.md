# Urchin

<img src="urchin.png" alt="Urchin logo: a spiny sea urchin with a pair of beamed notes inside" width="175">

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

Open **http://localhost:8000/examples/player.html**, choose an instrument and click Load instrument demo, then Play. You can also edit JSON and save WAV files entirely in the browser. The Samples menu lists every `.urchin` file (a CSLT-1 JSON payload) in the `samples/` folder, read from the server's directory listing; drop a file in and reload. Tick Loop to repeat a song. Opening the HTML directly as a `file:` URL will not load ES modules reliably.

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

## Technical specification

The input format, octave syntax, JavaScript API and options, how underspecified parts of CSLT-1 are interpreted, and size, sound and limits are in [SPEC.md](SPEC.md). Sheet-music conversion instructions are in [agent.md](agent.md).

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

## Checks

```sh
npm test
npm run size
# Optional, requires Google Chrome (or set CHROME_BIN to a Chromium executable):
npm run test:browser
```

Tests cover the reference payload, time signatures, chords, pitch measured from generated audio, all 20 distinct instruments at three sample rates, alias selection, clipping, malformed input, WAV headers/sample encoding, and the CLI.

The optional browser check exercises real Web Audio playback, stop, natural completion, empty input, errors, and context ownership. You can also open `/test/browser.html` on the local server and run it manually.
