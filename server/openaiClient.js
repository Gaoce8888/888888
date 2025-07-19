const { OpenAI } = require('openai');

let openai;
const apiKey = process.env.OPENAI_API_KEY;

if (apiKey) {
  openai = new OpenAI({ apiKey });
}

module.exports = {
  isEnabled: !!openai,
  async chatCompletion({ systemPrompt, userPrompt, model = 'gpt-3.5-turbo' }) {
    if (!openai) {
      return 'AI 服务未启用';
    }
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return response.choices[0].message.content.trim();
  },
};