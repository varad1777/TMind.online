import 'dotenv/config'; // loads .env automatically
import fetch from 'node-fetch'; // if using Node 18+, you can skip this line

const GROQ_BASE = process.env.GROQ_BASE || 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.warn('WARNING: GROQ_API_KEY not set — requests will fail');
}

/**
 * Chat (chat completions) with Groq API
 * @param {string} prompt - user prompt
 * @param {string|null} systemPrompt - optional system instruction
 * @param {object} opts - optional settings: { model, temperature, max_tokens ... }
 * @returns {Promise<object>} - JSON response from Groq API
 */
async function chatWithGroq(prompt, systemPrompt = null, opts = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }
  const model = 'llama-3.1-8b-instant';
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    // you can also pass temperature, max_tokens etc via opts
    ...(opts.temperature ? { temperature: opts.temperature } : {}),
    ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {})
  };

  const res = await fetch(GROQ_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq chat error: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = await res.json();
  return data;
}



export default { chatWithGroq };
