// api/analytics.js - BULLETPROOF for 10k+ users
import { Redis } from '@upstash/redis';

const MAX_PAYLOAD_SIZE = 10000;
const LOG_SAMPLE_RATE = 0.01;

const ALLOWED_EVENTS = new Set([
  'game_complete',
  'page_view',
  'visit_tickr'
]);

const ALLOWED_DATA_FIELDS = new Set([
  'won',
  'cluesUsed',
  'time',
  'mode',
  'difficulty'
]);

const ALLOWED_MODES = new Set(['daily', 'unlimited']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

// Initialize Redis
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  } catch (e) {
    console.error('Redis init error:', e);
  }
}

function validatePayload(body) {
  const bodySize = JSON.stringify(body).length;
  if (bodySize > MAX_PAYLOAD_SIZE) {
    return { valid: false, error: 'Payload too large' };
  }

  if (!body.event || !ALLOWED_EVENTS.has(body.event)) {
    return { valid: false, error: 'Invalid event type' };
  }

  if (body.data && typeof body.data === 'object') {
    const dataKeys = Object.keys(body.data);
    const invalidFields = dataKeys.filter(k => !ALLOWED_DATA_FIELDS.has(k));
    if (invalidFields.length > 0) {
      return { valid: false, error: `Invalid data fields: ${invalidFields.join(', ')}` };
    }

    // Type validation
    if (body.data.won !== undefined && typeof body.data.won !== 'boolean') {
      return { valid: false, error: 'won must be boolean' };
    }
    if (body.data.cluesUsed !== undefined && typeof body.data.cluesUsed !== 'number') {
      return { valid: false, error: 'cluesUsed must be number' };
    }
    if (body.data.time !== undefined && typeof body.data.time !== 'number') {
      return { valid: false, error: 'time must be number' };
    }

    // FIX: Validate mode values
    if (body.data.mode !== undefined && !ALLOWED_MODES.has(body.data.mode)) {
      return { valid: false, error: 'mode must be daily or unlimited' };
    }

    // FIX: Validate difficulty values
    if (body.data.difficulty !== undefined && 
        body.data.difficulty !== null && 
        !ALLOWED_DIFFICULTIES.has(body.data.difficulty)) {
      return { valid: false, error: 'difficulty must be easy, medium, or hard' };
    }

    // FIX: Clamp values to reasonable ranges
    if (body.data.cluesUsed !== undefined) {
      body.data.cluesUsed = Math.max(1, Math.min(5, body.data.cluesUsed));
    }
    if (body.data.time !== undefined) {
      body.data.time = Math.max(0, Math.min(36000, body.data.time)); // 0-10 hours max
    }
  }

  return { valid: true };
}

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

    const validation = validatePayload(req.body);
    if (!validation.valid) {
      console.error('Analytics validation error:', validation.error, { event, userId });
      return res.status(400).json({ error: validation.error });
    }

    // Sample logging
    if (Math.random() < LOG_SAMPLE_RATE) {
      const logEntry = {
        event,
        data,
        userId: userId || 'anonymous',
        timestamp: Date.now(),
        userAgent: req.headers['user-agent']?.substring(0, 200)
      };
      console.log(JSON.stringify(logEntry));
    }

    // FIX: AWAIT Redis work instead of fire-and-forget
    // This ensures increments aren't dropped in serverless environments
    if (event === 'game_complete' && redis) {
      try {
        await updateRedisCounters(data);
      } catch (e) {
        console.error('Redis counter update error:', e.message);
      }
    }

    return res.status(204).end();

  } catch (error) {
    console.error('Analytics error:', error.message);
    return res.status(204).end();
  }
}

async function updateRedisCounters(data) {
  if (!redis) return;

  const today = new Date().toISOString().split('T')[0];
  const counterKey = `stats:${today}`;
  
  // FIX: Use proper Promise.all with await (don't fire-and-forget)
  await Promise.all([
    redis.hincrby(counterKey, 'total_games', 1),
    data?.won ? redis.hincrby(counterKey, 'total_wins', 1) : Promise.resolve(),
    redis.expire(counterKey, 86400 * 30)
  ]);
}
