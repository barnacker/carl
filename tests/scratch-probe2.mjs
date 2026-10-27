// STEP 1 (b): POST /dash on a SEPARATE connection with the session tag as it
// currently is. Prints: attach phase (5s of frames), POST response code+body,
// then which frames arrive on the SSE after the POST (5s window).
import { setTimeout as sleep } from 'node:timers/promises';
const H = { 'Host': '127.0.0.1', 'accept': 'text/event-stream' };
const T0 = Date.now();
const t = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';

const frames = []; let tag = '';
const c = new AbortController();
const r = await fetch('http://127.0.0.1:3000/dash', { headers: H, signal: c.signal });
const reader = r.body.getReader();
const dec = new TextDecoder(); let buf = '';
const pump = (async () => {
  while (true) {
    const { value, done } = await reader.read().catch(() => ({ done: true }));
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const msg = buf.slice(0, sep); buf = buf.slice(sep + 2);
      for (const line of msg.split('\n')) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const p = s.slice(5).trim();
        if (!p) continue;
        let j; try { j = JSON.parse(p); } catch { continue; }
        j._rcv = Date.now(); frames.push(j);
        if (j.t === 'sseinit' && tag === '') tag = j.tag;
      }
    }
  }
})();

await sleep(5000);
console.log('ATTACH 5s: frames=' + frames.length, 'tag=' + tag.slice(0, 8),
  'types=[' + [...new Set(frames.map((f) => f.t))].join(',') + ']');

// THE POST — separate connection, tag via header AND body (as the live client does)
const post = await fetch('http://127.0.0.1:3000/dash', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-dash-session': tag, 'Host': '127.0.0.1' },
  body: JSON.stringify({ msg: 'step1-send', session: tag }),
});
const postBody = await post.text();
console.log('POST ->', post.status, postBody.slice(0, 150));

const postT = Date.now();
await sleep(5000);
const after = frames.filter((f) => f._rcv > postT);
console.log('AFTER POST 5s: ' + after.length + ' frames: ' +
  after.map((f) => f.t + (f.m ? ':' + f.m + '=' + f.s : '') + (f.status ? '(' + f.status + ')' : '')).join(' '));
c.abort();
process.exit(0);
