const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { WebSocketServer } = require('ws');
const tesseract = require('tesseract.js');
const { chatCompletion } = require('./openaiClient');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// AI chat completion
app.post('/api/ai', async (req, res) => {
  const { prompt, systemPrompt = 'You are a helpful assistant.' } = req.body;
  try {
    const reply = await chatCompletion({ systemPrompt, userPrompt: prompt });
    res.json({ reply });
  } catch (err) {
    console.error('AI error', err);
    res.status(500).json({ error: 'AI service failed', detail: String(err) });
  }
});

// Intent recognition endpoint
app.post('/api/intent', async (req, res) => {
  const { text } = req.body;
  const systemPrompt =
    'You are an intent classification engine. For the given text, respond with ONLY one of the intents: "greeting", "question", "complaint", "farewell", "other".';
  try {
    const intent = await chatCompletion({ systemPrompt, userPrompt: text });
    res.json({ intent: intent.toLowerCase() });
  } catch (err) {
    console.error('Intent error', err);
    res.status(500).json({ error: 'Intent service failed', detail: String(err) });
  }
});

// OCR endpoint (base64 image -> text)
app.post('/api/ocr', async (req, res) => {
  const { image } = req.body; // base64 data URL
  if (!image?.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid image data' });
  }
  try {
    const { data: { text } } = await tesseract.recognize(image, 'eng');
    res.json({ text });
  } catch (err) {
    console.error('OCR error', err);
    res.status(500).json({ error: 'OCR failed', detail: String(err) });
  }
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