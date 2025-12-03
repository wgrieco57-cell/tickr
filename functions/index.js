const { setGlobalOptions } = require("firebase-functions/v2/options");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https"); // ADD THIS
const admin = require("firebase-admin");
const axios = require("axios");

setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

// Stock symbols to fetch
const STOCK_SYMBOLS = [
  '^GSPC', '^DJI', '^IXIC',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA',
  'BRK.B', 'JPM', 'JNJ', 'V', 'PG', 'DIS', 'MA', 'HD', 'UNH', 'BAC'
];

// Finnhub API key
const FINNHUB_KEY = "d4g9o8pr01qm5b34j8l0d4g9o8pr01qm5b34j8lg";

// Check if current time is during market hours
function isMarketHours() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  const day = etTime.getDay();
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const isWeekday = day >= 1 && day <= 5;
  
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  
  const isDuringMarketHours = totalMinutes >= marketOpen && totalMinutes < marketClose;
  
  return isWeekday && isDuringMarketHours;
}

// Logic to fetch and write prices
async function fetchStockPricesLogic() {
  const prices = {};
  const errors = [];
  const db = admin.firestore();
  
  try {
    for (const symbol of STOCK_SYMBOLS) {
      try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
        const response = await axios.get(url, { timeout: 5000 });
        
        if (response.data.c && !isNaN(response.data.c)) {
          prices[symbol] = {
            currentPrice: Number(response.data.c),
            change: Number(response.data.d || 0),
            changePercent: Number(response.data.dp || 0),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          };
        } else {
          errors.push({ symbol, error: 'Invalid price data' });
        }
      } catch (symbolError) {
        errors.push({ symbol, error: symbolError.message });
        console.error(`Failed to fetch ${symbol}:`, symbolError.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (Object.keys(prices).length > 0) {
      const batch = db.batch();
      const ref = db.collection("stocks");
      
      for (const [symbol, data] of Object.entries(prices)) {
        batch.set(ref.doc(symbol), data, { merge: true });
      }
      
      await batch.commit();
      console.log(`Updated ${Object.keys(prices).length} stocks.`);
    }
    
    if (errors.length > 0) {
      console.warn(`Failed to fetch ${errors.length} stocks:`, errors);
    }
    
  } catch (err) {
    console.error("Error fetching stock data:", err);
  }
}

// Scheduled function: runs every 5 minutes during market hours
exports.fetchStockPrices = onSchedule("*/5 * * * *", async () => {
  if (isMarketHours()) {
    await fetchStockPricesLogic();
  } else {
    console.log("Outside market hours. Skipping scheduled fetch.");
  }
});

// Manual HTTP trigger: populate stocks anytime
exports.populateStocks = onRequest(async (req, res) => {
  console.log("Manual trigger: populating stock data");
  try {
    await fetchStockPricesLogic();
    res.json({ success: true, message: "Stock prices populated successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});