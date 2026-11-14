// Optional integration check: requires Chrome/Chromium, no npm packages.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'urchin-chrome-'));
const browser = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let sequence = 0;
let pendingText = '';
const pending = new Map();
const closed = new Promise(resolve => browser.once('close', resolve));
function rejectPending(error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}
browser.on('error', rejectPending);
browser.stdio[3].on('error', rejectPending);
browser.stdio[4].on('error', rejectPending);
browser.on('exit', () => rejectPending(new Error('Chrome exited before completing the check')));
browser.stdio[4].on('data', chunk => {
  pendingText += chunk.toString();
  let end;
  while ((end = pendingText.indexOf('\0')) !== -1) {
    const message = JSON.parse(pendingText.slice(0, end));
    pendingText = pendingText.slice(end + 1);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}
const timeout = setTimeout(() => {
  for (const request of pending.values()) request.reject(new Error('Browser check timed out'));
  browser.kill();
}, 15000);
try {
  const { targetId } = await send('Target.createTarget', {
    url: new URL('../test/browser.html?auto', import.meta.url).href
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  let outcome;
  for (let i = 0; i < 100; i++) {
    const { result } = await send('Runtime.evaluate', {
      expression: '({ state: document.documentElement.dataset.result, text: document.querySelector("#result")?.textContent })',
      returnByValue: true
    }, sessionId);
    outcome = result.value;
    if (outcome?.state) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (outcome?.state !== 'pass') throw new Error(outcome?.text || 'Browser did not complete checks');
  console.log(outcome.text);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  browser.kill();
  await closed;
  await rm(profile, { recursive: true, force: true });
}
