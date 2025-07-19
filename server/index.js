const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// AI integration endpoint (stub)
app.post('/api/ai', async (req, res) => {
  // TODO: integrate with your AI model/service
  const { prompt } = req.body;
  // Echo for now
  res.json({ reply: `AI echo: ${prompt}` });
});

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    // Broadcast to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(data.toString());
      }
    });
  });

  ws.on('error', (err) => console.error('WS Error', err));
});

const PORT = process.env.PORT || 6006;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});