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
    const text = data.toString();
    console.log(`Message from ${ip}: ${text}`);

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
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