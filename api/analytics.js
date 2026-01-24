// api/analytics.js - Production-ready with validation and sampled logging
import { Redis } from '@upstash/redis';

const MAX_PAYLOAD_SIZE = 10000; // 10KB limit
const LOG_SAMPLE_RATE = 0.01; // Log 1% of events (adjust as needed)

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
} else if (process.env.REDIS_URL) {
  try {
    const url = new URL(process.env.REDIS_URL);
    redis = new Redis({
      url: process.env.REDIS_URL,
      token: url.password || ''
    });
  } catch (e) {
    console.error('Redis init error (fallback):', e);
  }
}

function validatePayload(body) {
  // Check size
  const bodySize = JSON.stringify(body).length;
  if (bodySize > MAX_PAYLOAD_SIZE) {
    return { valid: false, error: 'Payload too large' };
  }

  // Check event type
  if (!body.event || !ALLOWED_EVENTS.has(body.event)) {
    return { valid: false, error: 'Invalid event type' };
  }

  // Validate data fields if present
  if (body.data && typeof body.data === 'object') {
    const dataKeys = Object.keys(body.data);
    const invalidFields = dataKeys.filter(k => !ALLOWED_DATA_FIELDS.has(k));
    if (invalidFields.length > 0) {
      return { valid: false, error: `Invalid data fields: ${invalidFields.join(', ')}` };
    }

    // Validate data types
    if (body.data.won !== undefined && typeof body.data.won !== 'boolean') {
      return { valid: false, error: 'won must be boolean' };
    }
    if (body.data.cluesUsed !== undefined && typeof body.data.cluesUsed !== 'number') {
      return { valid: false, error: 'cluesUsed must be number' };
    }
    if (body.data.time !== undefined && typeof body.data.time !== 'number') {
      return { valid: false, error: 'time must be number' };
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

    // Validate payload
    const validation = validatePayload(req.body);
    if (!validation.valid) {
      // Log validation errors (always log errors)
      console.error('Analytics validation error:', validation.error, { event, userId });
      return res.status(400).json({ error: validation.error });
    }

    // Sample logging (only log 1% to reduce costs)
    if (Math.random() < LOG_SAMPLE_RATE) {
      const logEntry = {
        event,
        data,
        userId: userId || 'anonymous',
        timestamp: Date.now(),
        userAgent: req.headers['user-agent']?.substring(0, 200) // Truncate
      };
      console.log(JSON.stringify(logEntry));
    }

    // Update Redis counters (non-blocking)
    if (event === 'game_complete' && redis) {
      // Fire and forget - don't await
      updateRedisCounters(data).catch(e => {
        // Only log errors
        console.error('Redis counter update error:', e.message);
      });
    }

    return res.status(204).end();

  } catch (error) {
    // Always log errors
    console.error('Analytics error:', error.message);
    // Don't fail the user's request
    return res.status(204).end();
  }
}

async function updateRedisCounters(data) {
  if (!redis) return;

  const today = new Date().toISOString().split('T')[0];
  const counterKey = `stats:${today}`;
  
  const pipeline = [
    redis.hincrby(counterKey, 'total_games', 1)
  ];

  if (data?.won) {
    pipeline.push(redis.hincrby(counterKey, 'total_wins', 1));
  }

  // Set expiration
  pipeline.push(redis.expire(counterKey, 86400 * 30)); // 30 days

  await Promise.all(pipeline);
}
