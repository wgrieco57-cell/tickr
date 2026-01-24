// api/analytics.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, data, userId } = req.body;

    if (!event || typeof event !== 'string') {
      return res.status(400).json({ error: 'Invalid event' });
    }

    const logEntry = {
      event,
      data,
      userId: userId || 'anonymous',
      timestamp: Date.now(),
      userAgent: req.headers['user-agent']
    };

    if (event === 'game_complete') {
      const today = new Date().toISOString().split('T')[0];
      const counterKey = `stats:${today}`;
      
      await Promise.all([
        kv.hincrby(counterKey, 'total_games', 1),
        data.won ? kv.hincrby(counterKey, 'total_wins', 1) : Promise.resolve(),
        kv.expire(counterKey, 86400 * 30)
      ]);
    }

    console.log(JSON.stringify(logEntry));

    return res.status(204).end();

  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(204).end();
  }
}
