const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const ip = request.socket.remoteAddress;
  console.log(`Connected: ${ip} (total: ${wss.clients.size})`);

  socket.on('message', (data) => {
    let incoming;
    try {
      incoming = JSON.parse(data.toString());
    } catch (error) {
      console.log(`Ignored non-JSON message from ${ip}`);
      return;
    }

    const name = String(incoming.name || 'Anonymous').trim().slice(0, 20);
    const text = String(incoming.text || '').trim().slice(0, 200);

    if(!text) {
      console.log(`Ignored empty message from ${ip}`);
      return;
    }

    console.log(`Message from ${ip}: ${text}`);

    const outgoing = JSON.stringify({ name, text });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(outgoing);
      }
    }
  });

  socket.on('close', () => {
    console.log(`Disconnected: ${ip} (total: ${wss.clients.size})`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});