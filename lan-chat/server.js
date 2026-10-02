// Use Node's HTTP server so Express and WebSocket traffic share one port.
const http = require('http');
// Serve the browser client and provide the HTTP application framework.
const express = require('express');
// Accept WebSocket clients and check whether sockets can receive broadcasts.
const { WebSocketServer, WebSocket } = require('ws');
// Use Node's filesystem and path modules to locate the public directory.
const fs = require('fs');
// Use Node's path module to locate the public directory in a cross-platform way.
const path = require('path');

// Keep the chat server on a predictable port for clients to connect to.
const PORT = 3000;
// Listen on every network interface so other devices on the LAN can connect.
const HOST = '0.0.0.0';

// Limit the number of messages retained so memory use does not grow unbounded.
// Persist the retained messages to disk so the server can be restarted without losing them.
const HISTORY_LIMIT = 50;
// Use a JSON file in the same directory as this server script to store the history.
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Load the retained messages from disk so they can be sent to new clients.
function loadHistory(file = HISTORY_FILE, limit = HISTORY_LIMIT) {
  try {
    // synchronously read the JSON file and parse it into an array of messages.
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Return only the most recent messages up to the configured limit.
    return Array.isArray(saved) ? saved.slice(-limit) : [];
  } catch {
    return [];
  }
}

// Save the retained messages to disk so they survive server restarts.
function saveHistory(history, file = HISTORY_FILE) {
  try {
    // Write the retained messages as a formatted JSON string to the history file.
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error(`Could not save history: ${err.message}`);
  }
}

// Turn raw wire data into a clean { name, text } message, or null if it should be ignored.
function normalizeMessage(data) {
  // Hold the parsed payload so malformed input can be rejected safely.
  let incoming;
  // Parse the wire data as JSON because clients send structured messages.
  try {
    incoming = JSON.parse(data.toString());
  } catch {
    return null;
  }
  // Reject JSON values like null or numbers that cannot carry message fields.
  if (!incoming || typeof incoming !== 'object') return null;

  // Normalize the sender name and cap its length to keep messages manageable.
  const name = String(incoming.name || 'Anonymous').trim().slice(0, 20);
  // Normalize message text and cap its length to limit oversized chat posts.
  const text = String(incoming.text || '').trim().slice(0, 200);

  // Reject blank messages so they do not clutter logs or reach other clients.
  if (!text) return null;

  return { name, text };
}

// Append a message and trim the retained history to the limit so memory use is bounded.
function addToHistory(history, msg, limit = HISTORY_LIMIT) {
  history.push(msg);
  while (history.length > limit) {
    history.shift();
  }
  return history;
}

// Build the HTTP + WebSocket chat server; options let tests use a temporary history file.
function createChatServer({ historyFile = HISTORY_FILE, historyLimit = HISTORY_LIMIT } = {}) {
  // Create the Express app that will serve the static chat interface.
  const app = express();
  // Expose the public directory over HTTP so browsers can load the chat UI.
  app.use(express.static(path.join(__dirname, 'public')));

  // Create the HTTP server that both web pages and WebSocket connections use.
  const server = http.createServer(app);
  // Attach WebSocket support to the same HTTP server and port.
  const wss = new WebSocketServer({ server });

  // Load the retained messages from disk so they can be sent to new clients.
  const history = loadHistory(historyFile, historyLimit);
  console.log(`Loaded ${history.length} saved messages`);

  // Handle each new chat connection and retain its socket and request details.
  wss.on('connection', (socket, request) => {
    // Send the retained message history to the newly connected client.
    socket.send(JSON.stringify({ type: 'history', messages: history }));
    // Record the peer address so connection and message activity can be traced.
    const ip = request.socket.remoteAddress;
    // Log joins and the current connected-client count for server visibility.
    console.log(`Connected: ${ip} (total: ${wss.clients.size})`);

    // Process every message sent by this connected client.
    socket.on('message', (data) => {
      // Validate and clean up the payload; invalid or empty messages are dropped.
      const msg = normalizeMessage(data);
      if (!msg) {
        console.log(`Ignored invalid or empty message from ${ip}`);
        return;
      }

      // Log accepted messages to make server-side activity observable.
      console.log(`Message from ${ip}: ${msg.text}`);

      // Retain the message in history so new clients can catch up on the conversation.
      addToHistory(history, msg, historyLimit);
      saveHistory(history, historyFile);

      // Serialize the normalized fields into the format all clients receive.
      const outgoing = JSON.stringify({ type: 'message', ...msg });

      // Visit every connected socket so each participant receives the message.
      for (const client of wss.clients) {
        // Send only to open sockets because other states cannot accept data.
        if (client.readyState === WebSocket.OPEN) {
          client.send(outgoing);
        }
      }
    });

    // Report departures so the server log reflects connection changes.
    socket.on('close', () => {
      console.log(`Disconnected: ${ip} (total: ${wss.clients.size})`);
    });
  });

  return { app, server, wss, history };
}

// Start listening only when run directly (node server.js), not when imported by tests.
if (require.main === module) {
  const { server } = createChatServer();
  // Start listening on the selected port and address so clients can reach chat.
  server.listen(PORT, HOST, () => {
    // Confirm the server's listening address in the console for easy discovery.
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  loadHistory,
  saveHistory,
  normalizeMessage,
  addToHistory,
  createChatServer,
  HISTORY_LIMIT,
};
