// api/quotes.js - BULLETPROOF for 10k+ users
import { Redis } from '@upstash/redis';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const CACHE_TTL = 300; // 5 minutes
const LOCK_TTL = 25; // 25 seconds (increased from 10s to handle slow networks)
const LAST_GOOD_TTL = 86400; // 24 hours

// Using ETFs instead of indexes for more reliable Finnhub support
const TICKERS = [
  'SPY', 'QQQ', 'DIA', // ETFs for market indexes (more reliable than ^GSPC, ^DJI, ^IXIC)
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'
];

const FALLBACK_QUOTES = [
  { symbol: 'AAPL', current: '150.00', change: '1.50' },
  { symbol: 'TSLA', current: '250.00', change: '-2.00' },
  { symbol: 'GOOGL', current: '140.00', change: '0.75' },
  { symbol: 'MSFT', current: '320.00', change: '3.20' },
  { symbol: 'SPY', current: '450.00', change: '2.50' },
  { symbol: 'NVDA', current: '120.00', change: '-1.50' },
  { symbol: 'AMZN', current: '100.00', change: '0.50' },
  { symbol: 'META', current: '300.00', change: '2.00' },
  { symbol: 'DIA', current: '350.00', change: '1.00' },
  { symbol: 'QQQ', current: '380.00', change: '5.00' }
];

// In-memory cache fallback (per Lambda instance) - CRITICAL for when Redis is down
let memCache = { value: null, exp: 0 };
let inFlight = null;

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

function isMarketHours() {
  const now = new Date();
  const etDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const day = etDate.getDay();
  if (day === 0 || day === 6) return false;

  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const currentMins = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  
  return currentMins >= marketOpen && currentMins < marketClose;
}

async function fetchQuoteFromFinnhub(symbol) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    
    if (!response.ok) throw new Error('API error');
    
    const data = await response.json();
    
    // FIX: Use null check instead of falsy check (0 is valid price)
    if (data.c == null && data.pc == null) return null;
    
    // FIX: Proper current/change calculation
    const current = data.c ?? data.pc;
    const change = (data.c != null && data.pc != null) ? (data.c - data.pc) : 0;
    
    return {
      symbol,
      current: Number(current).toFixed(2),
      change: Number(change).toFixed(2)
    };
  } catch (error) {
    if (Math.random() < 0.1) {
      console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
  }
}

async function acquireLock(key, ttl) {
  if (!redis) return false;
  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttl });
    return result === 'OK';
  } catch (e) {
    console.error('Lock acquire error:', e);
    return false;
  }
}

async function releaseLock(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (e) {
    // Lock will auto-expire
  }
}

// FIX: In-memory cache fallback for when Redis is down (prevents stampede)
async function getQuotesNoRedis() {
  const now = Date.now();
  
  // Check in-memory cache first
  if (memCache.value && now < memCache.exp) {
    return { quotes: memCache.value, cached: true, source: 'memory' };
  }

  // Single-flight pattern for in-memory
  if (!inFlight) {
    inFlight = (async () => {
      const results = await Promise.allSettled(
        TICKERS.map(ticker => fetchQuoteFromFinnhub(ticker))
      );
      
      const valid = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
      
      if (valid.length > 0) {
        memCache = { 
          value: valid, 
          exp: now + (CACHE_TTL * 1000) 
        };
        return { quotes: valid, cached: false, source: 'finnhub' };
      }
      
      return { 
        quotes: FALLBACK_QUOTES, 
        fallback: true, 
        cached: false,
        source: 'hardcoded'
      };
    })().finally(() => { 
      inFlight = null; 
    });
  }

  return inFlight;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FIX: Short-circuit if API key missing
  if (!FINNHUB_API_KEY) {
    console.error('FINNHUB_API_KEY missing');
    return res.status(200).json({
      quotes: FALLBACK_QUOTES,
      cached: false,
      fallback: true,
      error: 'API key not configured',
      timestamp: Date.now()
    });
  }

  const cacheKey = isMarketHours() ? 'quotes:live' : 'quotes:closing';
  const lockKey = `${cacheKey}:lock`;
  const lastGoodKey = 'quotes:last_good';

  // FIX: If Redis is down, use in-memory cache (prevents stampede)
  if (!redis) {
    const result = await getQuotesNoRedis();
    return res.status(200).json({
      ...result,
      timestamp: Date.now()
    });
  }

  try {
    // Step 1: Try cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const quotes = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return res.status(200).json({
          quotes,
          cached: true,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }

    // Step 2: Cache miss - try to acquire lock
    const lockAcquired = await acquireLock(lockKey, LOCK_TTL);

    if (!lockAcquired) {
      // Another request is fetching - return stale
      try {
        const lastGood = await redis.get(lastGoodKey);
        if (lastGood) {
          const quotes = typeof lastGood === 'string' ? JSON.parse(lastGood) : lastGood;
          return res.status(200).json({
            quotes,
            cached: true,
            stale: true,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.error('Last good read error:', e);
      }
      
      return res.status(200).json({
        quotes: FALLBACK_QUOTES,
        cached: false,
        fallback: true,
        timestamp: Date.now()
      });
    }

    // Step 3: Lock acquired - fetch fresh data
    try {
      const results = await Promise.allSettled(
        TICKERS.map(ticker => fetchQuoteFromFinnhub(ticker))
      );

      const validQuotes = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      if (validQuotes.length > 0) {
        try {
          await Promise.all([
            redis.set(cacheKey, JSON.stringify(validQuotes), { ex: CACHE_TTL }),
            redis.set(lastGoodKey, JSON.stringify(validQuotes), { ex: LAST_GOOD_TTL })
          ]);
        } catch (e) {
          console.error('Cache write error:', e);
        }
        
        return res.status(200).json({
          quotes: validQuotes,
          cached: false,
          timestamp: Date.now()
        });
      }

      // No valid quotes - try last_good
      try {
        const lastGood = await redis.get(lastGoodKey);
        if (lastGood) {
          const quotes = typeof lastGood === 'string' ? JSON.parse(lastGood) : lastGood;
          return res.status(200).json({
            quotes,
            cached: true,
            from_last_good: true,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.error('Last good fallback error:', e);
      }

      return res.status(200).json({
        quotes: FALLBACK_QUOTES,
        cached: false,
        fallback: true,
        timestamp: Date.now()
      });

    } finally {
      await releaseLock(lockKey);
    }

  } catch (error) {
    console.error('Quotes endpoint error:', error);
    
    try {
      const lastGood = await redis.get(lastGoodKey);
      if (lastGood) {
        const quotes = typeof lastGood === 'string' ? JSON.parse(lastGood) : lastGood;
        return res.status(200).json({
          quotes,
          cached: true,
          from_last_good: true,
          error_recovery: true,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      // Silent fail
    }
    
    return res.status(200).json({
      quotes: FALLBACK_QUOTES,
      cached: false,
      fallback: true,
      error: 'Service temporarily unavailable',
      timestamp: Date.now()
    });
  }
}
