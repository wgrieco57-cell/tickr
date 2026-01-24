// api/quotes.js - Production-ready with single-flight locking and robust caching
import { Redis } from '@upstash/redis';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const CACHE_TTL = 300; // 5 minutes
const LOCK_TTL = 10; // 10 seconds for single-flight lock
const LAST_GOOD_TTL = 86400; // 24 hours for fallback

// Reduced to top 10 most liquid stocks for better performance
const TICKERS = [
  '^GSPC', '^DJI', '^IXIC',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'
];

const FALLBACK_QUOTES = [
  { symbol: 'AAPL', current: '150.00', change: '1.50' },
  { symbol: 'TSLA', current: '250.00', change: '-2.00' },
  { symbol: 'GOOGL', current: '140.00', change: '0.75' },
  { symbol: 'MSFT', current: '320.00', change: '3.20' },
  { symbol: '^GSPC', current: '4500.00', change: '25.00' },
  { symbol: 'NVDA', current: '120.00', change: '-1.50' },
  { symbol: 'AMZN', current: '100.00', change: '0.50' },
  { symbol: 'META', current: '300.00', change: '2.00' },
  { symbol: '^DJI', current: '35000.00', change: '100.00' },
  { symbol: '^IXIC', current: '15000.00', change: '50.00' }
];

// Initialize Redis with proper Upstash credentials
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
  // Fallback for standard Redis URL (for backward compatibility)
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
      { signal: AbortSignal.timeout(8000) } // Increased to 8s
    );
    
    if (!response.ok) throw new Error('API error');
    
    const data = await response.json();
    if (!data.c && !data.pc) return null;
    
    return {
      symbol,
      current: (data.c || data.pc).toFixed(2),
      change: data.c ? (data.c - data.pc).toFixed(2) : "0.00"
    };
  } catch (error) {
    // Only log errors, not every call
    if (Math.random() < 0.1) { // 10% sampling
      console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
  }
}

async function acquireLock(key, ttl) {
  if (!redis) return false;
  try {
    // SET NX (only if not exists) with expiration
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
    // Lock will auto-expire, so this is not critical
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Extended stale-while-revalidate window
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cacheKey = isMarketHours() ? 'quotes:live' : 'quotes:closing';
  const lockKey = `${cacheKey}:lock`;
  const lastGoodKey = 'quotes:last_good';

  try {
    // Step 1: Try cache first
    if (redis) {
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
    }

    // Step 2: Cache miss - try to acquire lock (single-flight)
    const lockAcquired = await acquireLock(lockKey, LOCK_TTL);

    if (!lockAcquired) {
      // Another request is already fetching - return stale or last_good
      if (redis) {
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
      }
      
      // Fall back to hardcoded quotes
      return res.status(200).json({
        quotes: FALLBACK_QUOTES,
        cached: false,
        fallback: true,
        timestamp: Date.now()
      });
    }

    // Step 3: Lock acquired - fetch fresh data
    try {
      // Use Promise.allSettled for partial success handling
      const results = await Promise.allSettled(
        TICKERS.map(ticker => fetchQuoteFromFinnhub(ticker))
      );

      const validQuotes = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      if (validQuotes.length > 0) {
        // Cache the fresh data
        if (redis) {
          try {
            await Promise.all([
              redis.set(cacheKey, JSON.stringify(validQuotes), { ex: CACHE_TTL }),
              redis.set(lastGoodKey, JSON.stringify(validQuotes), { ex: LAST_GOOD_TTL })
            ]);
          } catch (e) {
            console.error('Cache write error:', e);
          }
        }
        
        return res.status(200).json({
          quotes: validQuotes,
          cached: false,
          timestamp: Date.now()
        });
      }

      // No valid quotes - try last_good
      if (redis) {
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
      }

      // Ultimate fallback
      return res.status(200).json({
        quotes: FALLBACK_QUOTES,
        cached: false,
        fallback: true,
        timestamp: Date.now()
      });

    } finally {
      // Always release lock
      await releaseLock(lockKey);
    }

  } catch (error) {
    console.error('Quotes endpoint error:', error);
    
    // Try last_good even on error
    if (redis) {
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
