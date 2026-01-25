// api/stats/daily.js - Public stats endpoint for social proof
import { Redis } from '@upstash/redis';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse date parameter or default to today (ET)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const dateParam = url.searchParams.get('date');
    const date = dateParam || getETDateISO();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    if (!redis) {
      return res.status(503).json({ 
        error: 'Stats service unavailable',
        date 
      });
    }

    const statsKey = `stats:${date}`;
    const cluesKey = `stats:${date}:clues`;

    // Read from Redis (parallel)
    const [statsData, cluesData] = await Promise.all([
      redis.hgetall(statsKey),
      redis.hgetall(cluesKey)
    ]);

    // Parse stats
    const totalGames = parseInt(statsData?.total_games || '0');
    const totalWins = parseInt(statsData?.total_wins || '0');
    const totalTimeWins = parseInt(statsData?.total_time_wins || '0');
    const totalWinCompletions = parseInt(statsData?.total_win_completions || '0');

    // Compute derived metrics
    const winRate = totalGames > 0 ? (totalWins / totalGames) : 0;
    const avgTimeWin = totalWinCompletions > 0 ? (totalTimeWins / totalWinCompletions) : null;

    // Parse clue distribution
    const clueDist = {
      '1': parseInt(cluesData?.['1'] || '0'),
      '2': parseInt(cluesData?.['2'] || '0'),
      '3': parseInt(cluesData?.['3'] || '0'),
      '4': parseInt(cluesData?.['4'] || '0'),
      '5': parseInt(cluesData?.['5'] || '0'),
      'fail': parseInt(cluesData?.fail || '0')
    };

    return res.status(200).json({
      date,
      total_games: totalGames,
      total_wins: totalWins,
      win_rate: Math.round(winRate * 10000) / 100, // Percentage with 2 decimals
      avg_time_win: avgTimeWin ? Math.round(avgTimeWin) : null,
      clue_dist: clueDist,
      updatedAt: Date.now()
    });

  } catch (error) {
    console.error('Stats endpoint error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch stats',
      message: error.message 
    });
  }
}
