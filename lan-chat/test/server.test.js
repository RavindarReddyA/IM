const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocket } = require('ws');

const {
  loadHistory,
  saveHistory,
  normalizeMessage,
  addToHistory,
  createChatServer,
} = require('../server');

// Silence server logging so test output stays readable.
console.log = () => {};
console.error = () => {};

// Each test gets its own temp directory so the real history.json is never touched.
let tmpDir;
let historyFile;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-chat-test-'));
  historyFile = path.join(tmpDir, 'history.json');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('normalizeMessage', () => {
  test('returns name and trimmed text for a valid message', () => {
    const msg = normalizeMessage(Buffer.from(JSON.stringify({ name: ' Ravi ', text: '  hello  ' })));
    assert.deepEqual(msg, { name: 'Ravi', text: 'hello' });
  });

  test('defaults a missing name to Anonymous', () => {
    assert.deepEqual(normalizeMessage(JSON.stringify({ text: 'hi' })), { name: 'Anonymous', text: 'hi' });
  });

  test('caps name at 20 characters and text at 200', () => {
    const msg = normalizeMessage(JSON.stringify({ name: 'n'.repeat(50), text: 't'.repeat(500) }));
    assert.equal(msg.name.length, 20);
    assert.equal(msg.text.length, 200);
  });

  test('rejects non-JSON input', () => {
    assert.equal(normalizeMessage('not json'), null);
  });

  test('rejects JSON that is not an object', () => {
    assert.equal(normalizeMessage('null'), null);
    assert.equal(normalizeMessage('42'), null);
  });

  test('rejects empty or whitespace-only text', () => {
    assert.equal(normalizeMessage(JSON.stringify({ name: 'a', text: '' })), null);
    assert.equal(normalizeMessage(JSON.stringify({ name: 'a', text: '   ' })), null);
    assert.equal(normalizeMessage(JSON.stringify({ name: 'a' })), null);
  });
});

describe('addToHistory', () => {
  test('appends messages', () => {
    const history = [];
    addToHistory(history, { name: 'a', text: '1' }, 3);
    assert.deepEqual(history, [{ name: 'a', text: '1' }]);
  });

  test('drops the oldest message when over the limit', () => {
    const history = [];
    for (let i = 1; i <= 4; i++) addToHistory(history, { name: 'a', text: String(i) }, 3);
    assert.deepEqual(history.map((m) => m.text), ['2', '3', '4']);
  });
});

describe('loadHistory / saveHistory', () => {
  test('returns an empty array when the file does not exist', () => {
    assert.deepEqual(loadHistory(historyFile), []);
  });

  test('returns an empty array for corrupt JSON', () => {
    fs.writeFileSync(historyFile, '{oops');
    assert.deepEqual(loadHistory(historyFile), []);
  });

  test('returns an empty array when the file is not an array', () => {
    fs.writeFileSync(historyFile, JSON.stringify({ name: 'a', text: 'b' }));
    assert.deepEqual(loadHistory(historyFile), []);
  });

  test('round-trips saved messages', () => {
    const messages = [{ name: 'a', text: 'one' }, { name: 'b', text: 'two' }];
    saveHistory(messages, historyFile);
    assert.deepEqual(loadHistory(historyFile), messages);
  });

  test('keeps only the most recent messages up to the limit', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ name: 'a', text: String(i) }));
    saveHistory(messages, historyFile);
    assert.deepEqual(loadHistory(historyFile, 3).map((m) => m.text), ['7', '8', '9']);
  });
});

describe('chat server (integration)', () => {
  let chat;
  let url;
  const clients = [];

  // Start a server on a random free port using the temp history file.
  async function start(options = {}) {
    chat = createChatServer({ historyFile, ...options });
    await new Promise((resolve) => chat.server.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${chat.server.address().port}`;
  }

  // Connect a client and resolve with it plus its initial history payload.
  function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      clients.push(ws);
      ws.once('message', (data) => resolve({ ws, first: JSON.parse(data) }));
      ws.once('error', reject);
    });
  }

  function nextMessage(ws) {
    return new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data))));
  }

  afterEach(async () => {
    for (const ws of clients.splice(0)) ws.terminate();
    chat.wss.close();
    await new Promise((resolve) => chat.server.close(resolve));
  });

  test('sends saved history to a new client', async () => {
    saveHistory([{ name: 'old', text: 'earlier' }], historyFile);
    await start();
    const { first } = await connect();
    assert.deepEqual(first, { type: 'history', messages: [{ name: 'old', text: 'earlier' }] });
  });

  test('broadcasts a message to every connected client', async () => {
    await start();
    const a = await connect();
    const b = await connect();
    const gotA = nextMessage(a.ws);
    const gotB = nextMessage(b.ws);
    a.ws.send(JSON.stringify({ name: 'Ravi', text: 'hello' }));
    const expected = { type: 'message', name: 'Ravi', text: 'hello' };
    assert.deepEqual(await gotA, expected);
    assert.deepEqual(await gotB, expected);
  });

  test('persists messages to the history file', async () => {
    await start();
    const { ws } = await connect();
    const got = nextMessage(ws);
    ws.send(JSON.stringify({ name: 'Ravi', text: 'saved?' }));
    await got;
    assert.deepEqual(JSON.parse(fs.readFileSync(historyFile, 'utf8')), [{ name: 'Ravi', text: 'saved?' }]);
  });

  test('ignores invalid messages and does not broadcast them', async () => {
    await start();
    const { ws } = await connect();
    const got = nextMessage(ws);
    ws.send('not json');
    ws.send(JSON.stringify({ name: 'Ravi', text: '   ' }));
    ws.send(JSON.stringify({ name: 'Ravi', text: 'valid' }));
    // The first thing received must be the valid message, proving the others were dropped.
    assert.deepEqual(await got, { type: 'message', name: 'Ravi', text: 'valid' });
    assert.equal(chat.history.length, 1);
  });

  test('a later client receives history including new messages, capped at the limit', async () => {
    await start({ historyLimit: 2 });
    const { ws } = await connect();
    for (const text of ['1', '2', '3']) {
      const got = nextMessage(ws);
      ws.send(JSON.stringify({ name: 'a', text }));
      await got;
    }
    const { first } = await connect();
    assert.deepEqual(first.messages.map((m) => m.text), ['2', '3']);
  });

  test('serves the chat page over HTTP', async () => {
    await start();
    const res = await fetch(url.replace('ws://', 'http://') + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<html/i);
  });
});
