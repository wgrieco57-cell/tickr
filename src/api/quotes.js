// api/quotes.js
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY; // Set this in Vercel dashboard

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).json({ error: 'Missing symbols' });
  }

  try {
    const quotePromises = symbols.split(',').map(async (symbol) => {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
      if (!response.ok) return null;
      const json = await response.json();
      if (!json.c) return null;
      return {
        symbol,
        current: json.c.toFixed(2),
        change: (json.c - json.pc).toFixed(2)
      };
    });

    const quotes = (await Promise.all(quotePromises)).filter(q => q);
    res.status(200).json(quotes);
  } catch (error) {
    console.error('Finnhub fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
}