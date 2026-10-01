// Use Node's HTTP server so Express and WebSocket traffic share one port.
const http = require('http');
// Serve the browser client and provide the HTTP application framework.
const express = require('express');
// Accept WebSocket clients and check whether sockets can receive broadcasts.
const { WebSocketServer, WebSocket } = require('ws');

// Create the Express app that will serve the static chat interface.
const app = express();
// Keep the chat server on a predictable port for clients to connect to.
const PORT = 3000;
// Listen on every network interface so other devices on the LAN can connect.
const HOST = '0.0.0.0';

// Expose the public directory over HTTP so browsers can load the chat UI.
app.use(express.static('public'));

// Create the HTTP server that both web pages and WebSocket connections use.
const server = http.createServer(app);
// Attach WebSocket support to the same HTTP server and port.
const wss = new WebSocketServer({ server });

// Handle each new chat connection and retain its socket and request details.
wss.on('connection', (socket, request) => {
  // Record the peer address so connection and message activity can be traced.
  const ip = request.socket.remoteAddress;
  // Log joins and the current connected-client count for server visibility.
  console.log(`Connected: ${ip} (total: ${wss.clients.size})`);

  // Process every message sent by this connected client.
  socket.on('message', (data) => {
    // Hold the parsed payload so malformed input can be rejected safely.
    let incoming;
    // Parse the wire data as JSON because clients send structured messages.
    try {
      incoming = JSON.parse(data.toString());
    } catch (error) {
      // Ignore invalid payloads rather than interrupting the server handler.
      console.log(`Ignored non-JSON message from ${ip}`);
      return;
    }

    // Normalize the sender name and cap its length to keep messages manageable.
    const name = String(incoming.name || 'Anonymous').trim().slice(0, 20);
    // Normalize message text and cap its length to limit oversized chat posts.
    const text = String(incoming.text || '').trim().slice(0, 200);

    // Reject blank messages so they do not clutter logs or reach other clients.
    if(!text) {
      console.log(`Ignored empty message from ${ip}`);
      return;
    }

    // Log accepted messages to make server-side activity observable.
    console.log(`Message from ${ip}: ${text}`);

    // Serialize the normalized fields into the format all clients receive.
    const outgoing = JSON.stringify({ name, text });

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

// Start listening on the selected port and address so clients can reach chat.
server.listen(PORT, HOST, () => {
  // Confirm the server's listening address in the console for easy discovery.
  console.log(`Server running at http://${HOST}:${PORT}`);
});