// api/analytics.js - ENHANCED with social proof counters
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

// Get current ET date
function getETDateISO(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(dateObj);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  return `${year}-${month}-${day}`;
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

    // Value validation
    if (body.data.mode !== undefined && !ALLOWED_MODES.has(body.data.mode)) {
      return { valid: false, error: 'mode must be daily or unlimited' };
    }

    if (body.data.difficulty !== undefined && 
        body.data.difficulty !== null && 
        !ALLOWED_DIFFICULTIES.has(body.data.difficulty)) {
      return { valid: false, error: 'difficulty must be easy, medium, or hard' };
    }

    // Clamp values
    if (body.data.cluesUsed !== undefined) {
      body.data.cluesUsed = Math.max(1, Math.min(5, Math.floor(body.data.cluesUsed)));
    }
    if (body.data.time !== undefined) {
      body.data.time = Math.max(0, Math.min(36000, Math.floor(body.data.time)));
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

    // Sample logging (1%)
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

    // ENHANCED: Update Redis counters with new fields
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

  // CRITICAL: Use ET date, not UTC
  const today = getETDateISO();
  const statsKey = `stats:${today}`;
  const cluesKey = `stats:${today}:clues`;
  
  const promises = [];

  // Basic counters
  promises.push(redis.hincrby(statsKey, 'total_games', 1));
  
  if (data?.won) {
    promises.push(redis.hincrby(statsKey, 'total_wins', 1));
    
    // NEW: Track total time for wins (for avg calculation)
    if (data.time != null && data.time > 0) {
      promises.push(redis.hincrby(statsKey, 'total_time_wins', data.time));
      promises.push(redis.hincrby(statsKey, 'total_win_completions', 1));
    }
  }

  // NEW: Clue distribution tracking
  if (data?.cluesUsed != null) {
    if (data.won) {
      // Track which clue number led to win
      promises.push(redis.hincrby(cluesKey, data.cluesUsed.toString(), 1));
    } else {
      // Track failure
      promises.push(redis.hincrby(cluesKey, 'fail', 1));
    }
  } else if (!data?.won) {
    // No cluesUsed but failed = still count as fail
    promises.push(redis.hincrby(cluesKey, 'fail', 1));
  }

  // Set TTL (30 days) for both keys
  promises.push(redis.expire(statsKey, 86400 * 30));
  promises.push(redis.expire(cluesKey, 86400 * 30));

  // CRITICAL: Await all writes (serverless requirement)
  await Promise.all(promises);
}
