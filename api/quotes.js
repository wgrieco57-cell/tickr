// api/quotes.js
import { Redis } from '@upstash/redis';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const CACHE_TTL = 300; // 5 minutes

const TICKERS = [
  '^GSPC', '^DJI', '^IXIC',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA',
  'BRK.B', 'JPM', 'JNJ', 'V', 'PG', 'DIS', 'MA', 'HD', 'UNH', 'BAC'
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
      { signal: AbortSignal.timeout(5000) }
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
    console.error(`Error fetching ${symbol}:`, error);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cacheKey = isMarketHours() ? 'quotes:live' : 'quotes:closing';
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return res.status(200).json({
        quotes: cached,
        cached: true,
        timestamp: Date.now()
      });
    }

    const quotes = await Promise.all(
      TICKERS.map(ticker => fetchQuoteFromFinnhub(ticker))
    );

    const validQuotes = quotes.filter(Boolean);

    if (validQuotes.length > 0) {
      await kv.set(cacheKey, validQuotes, { ex: CACHE_TTL });
      
      return res.status(200).json({
        quotes: validQuotes,
        cached: false,
        timestamp: Date.now()
      });
    }

    return res.status(200).json({
      quotes: FALLBACK_QUOTES,
      cached: false,
      fallback: true,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Quotes endpoint error:', error);
    
    return res.status(200).json({
      quotes: FALLBACK_QUOTES,
      cached: false,
      fallback: true,
      error: 'Service temporarily unavailable',
      timestamp: Date.now()
    });
  }
}
