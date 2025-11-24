import React, { useState, useEffect, useRef } from "react";
import confetti from 'canvas-confetti'; // npm install canvas-confetti required
import { initializeApp } from "firebase/app";
import { getFirestore, doc, increment, getDoc, setDoc, updateDoc } from "firebase/firestore";
const FINNHUB_API_KEY = "d4g9o8pr01qm5b34j8l0d4g9o8pr01qm5b34j8lg"; // Hardcoded as requested (note: for local/dev only—expose risk in prod)
const QUOTRON_TICKERS = [
  '^GSPC','^DJI','^IXIC', // Major indexes
  'AAPL','MSFT','GOOGL','AMZN','META','TSLA','NVDA', // MAG7
  'BRK.B','JPM','JNJ','V','PG','DIS','MA','HD','UNH','BAC' // 10 more
];
// Fallback quotes for API errors
const FALLBACK_QUOTES = [
  { symbol: 'AAPL', current: '150.00', change: '+1.50' },
  { symbol: 'TSLA', current: '250.00', change: '-2.00' },
  { symbol: 'GOOGL', current: '140.00', change: '+0.75' },
  { symbol: 'MSFT', current: '320.00', change: '+3.20' },
  { symbol: '^GSPC', current: '4500.00', change: '+25.00' },
  { symbol: 'NVDA', current: '120.00', change: '-1.50' },
  { symbol: 'AMZN', current: '100.00', change: '+0.50' },
  { symbol: 'META', current: '300.00', change: '+2.00' },
  { symbol: '^DJI', current: '35000.00', change: '+100.00' },
  { symbol: '^IXIC', current: '15000.00', change: '+50.00' }
];
const firebaseConfig = {
  apiKey: "AIzaSyAdgvuwk-0gU7Tucj87ny2dmFn8qIJ0xsE",
  authDomain: "tickr-2b042.firebaseapp.com",
  projectId: "tickr-2b042",
  storageBucket: "tickr-2b042.firebasestorage.app",
  messagingSenderId: "866254338816",
  appId: "1:866254338816:web:85b7cf91fee6225ebe91e5",
  measurementId: "G-WF8Q9HBVJN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore();

 async function updateDailyStats({ won = false }) {
  const today = new Date().toISOString().split("T")[0];
  
  // Always produce a valid 2-segment path: analytics / daily_2025-11-24
  const docRef = doc(db, "analytics", `daily_${today}`);

  try {
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        gamesPlayed: increment(1),
        gamesWon: won ? increment(1) : increment(0),
      });
    } else {
      await setDoc(docRef, {
        date: today,
        gamesPlayed: 1,
        gamesWon: won ? 1 : 0,
      });
    }
  } catch (err) {
    console.error("Error updating daily stats:", err);
  }
}



// Helper functions for deterministic daily selection
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
function createSeededRandom(initialSeed) {
  let seed = hashCode(initialSeed.toString());
  return function() {
    seed = (seed * 16807) % 2147483647; // Linear Congruential Generator
    return seed / 2147483647;
  };
}
function App() {
  const [data, setData] = useState([]);
  const [allTickers, setAllTickers] = useState([]);
  const [dailyTicker, setDailyTicker] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [input, setInput] = useState("");
  const [submittedAnswers, setSubmittedAnswers] = useState([]);
  const [availableOptions, setAvailableOptions] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [shake, setShake] = useState(false);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 },
    playHistory: {},
    fastestTime: null,
    totalTime: 0,
    totalPuzzles: 0, // New: Tracks all puzzles (daily + unlimited)
  });
  
  // New states for modes
  const [gameMode, setGameMode] = useState('daily'); // 'daily' | 'unlimited'
  const [difficulty, setDifficulty] = useState('medium'); // 'easy' | 'medium' | 'hard'
  const [puzzleSeed, setPuzzleSeed] = useState(0);
  const inputRef = useRef(null);
  // Check for test mode via URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'true') {
      setTestMode(true);
    }
  }, []);
  // Keyboard shortcut to toggle test mode (Ctrl+Shift+T)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        setTestMode(prev => !prev);
        console.log('Test mode:', !testMode);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [testMode]);
  // New: Keyboard shortcuts for submit/next
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !gameOver && input.trim()) handleSubmit();
      if (e.key.toLowerCase() === 'n' && gameOver && gameMode === 'unlimited') nextPuzzle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, gameOver, gameMode]);
  // Load stats from localStorage (updated for totalPuzzles)
  useEffect(() => {
    try {
      const savedStats = localStorage.getItem('tickrDailyStats');
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        setStats({
          ...parsed,
          totalPuzzles: parsed.totalPuzzles || 0 // Backward compat
        });
      }
      const savedDarkMode = localStorage.getItem('tickrDailyDarkMode');
      if (savedDarkMode !== null) {
        setDarkMode(JSON.parse(savedDarkMode));
      }
      const hasVisited = localStorage.getItem('tickrDailyVisited');
      if (!hasVisited) {
        setShowHowToPlay(true);
        localStorage.setItem('tickrDailyVisited', 'true');
      }
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  }, []);
  // Load local JSON data
  useEffect(() => {
    Promise.all([
      fetch('/data.json').then(res => res.json()),
      fetch('/tickers.json').then(res => res.json())
    ])
    .then(([dataFile, tickersFile]) => {
      const tickersData = dataFile.tickers || dataFile;
      const tickersFormatted = tickersFile.map(t => ({
        symbol: t.symbol,
        company: t.company,
        formatted: `${t.symbol} (${t.company})`
      }));
      setData(tickersData);
      setAllTickers(tickersFormatted);
      setLoading(false);
    })
    .catch(error => {
      console.error('Error loading data:', error);
      setLoading(false);
    });
  }, []);
  // Select daily ticker and pick questions (deterministic for non-test mode)
  useEffect(() => {
    if (!data || data.length === 0) return;
    // Reset game state for new puzzle/mode
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setGameOver(false);
    setInput("");
    setAvailableOptions([]);
    setStartTime(null);
    const today = new Date().toDateString();
    let selectedTicker;
    let pickedQuestions = [];
    // Sort data by ticker to ensure consistent order across loads/refreshes
    const sortedData = [...data].sort((a, b) => a.ticker.localeCompare(b.ticker));
    // Filter data based on mode/difficulty (for now, no per-ticker difficulty tag, so use all)
    let filteredData = sortedData;
    // (Future: filteredData = sortedData.filter(t => (t.difficulty || 'medium') === difficulty);)
    if (gameMode === 'daily' && !testMode) {
      // Deterministic: same ticker and questions for everyone on the same day
      const seed = hashCode(today);
      const rnd = createSeededRandom(seed);
      const randomIndex = Math.floor(rnd() * filteredData.length);
      selectedTicker = filteredData[randomIndex];
      for (let i = 1; i <= 5; i++) {
        const levelQuestions = selectedTicker.questions[`level_${i}`];
        if (levelQuestions) {
          const qIndex = Math.floor(rnd() * levelQuestions.length);
          const question = levelQuestions[qIndex];
          pickedQuestions.push({
            level: i,
            question,
            correct: selectedTicker.ticker,
            answers: []
          });
        }
      }
      // Set the date flag to enable progress saving for today
      localStorage.setItem('dailyDate', today);
    } else {
      // Unlimited or test: Random pick, infer difficulty by max levels
      const randomIndex = Math.floor(Math.random() * filteredData.length);
      selectedTicker = filteredData[randomIndex];
      let maxLevels = difficulty === 'hard' ? 3 : difficulty === 'medium' ? 5 : 6;
      for (let i = 1; i <= maxLevels; i++) {
        const levelQuestions = selectedTicker.questions[`level_${i}`];
        if (levelQuestions) {
          const qIndex = Math.floor(Math.random() * levelQuestions.length);
          const question = levelQuestions[qIndex];
          pickedQuestions.push({
            level: i,
            question,
            correct: selectedTicker.ticker,
            answers: []
          });
        }
      }
      // For easy (6 clues): Add a bonus question (reuse from level_5)
      if (difficulty === 'easy' && pickedQuestions.length >= 5 && selectedTicker.questions.level_5) {
        const bonusQ = selectedTicker.questions.level_5[Math.floor(Math.random() * selectedTicker.questions.level_5.length)];
        pickedQuestions.push({
          level: 6,
          question: bonusQ,
          correct: selectedTicker.ticker,
          answers: []
        });
      }
    }
    setDailyTicker(selectedTicker);
    setQuestions(pickedQuestions);
    // Load progress if same day (only for daily)
    if (gameMode === 'daily' && !testMode) {
      try {
        const progressStr = localStorage.getItem('dailyProgress');
        if (progressStr) {
          const progress = JSON.parse(progressStr);
          // Only load if matches today (via startTime date check)
          if (progress.startTime) {
            const progressDate = new Date(progress.startTime).toDateString();
            if (progressDate === today) {
              setCurrentLevel(progress.currentLevel);
              setSubmittedAnswers(progress.submittedAnswers);
              setGameOver(progress.gameOver);
              // Update questions with loaded answers
              const updatedQuestions = [...pickedQuestions];
              progress.submittedAnswers.forEach(answer => {
                const level = answer.level;
                if (updatedQuestions[level - 1]) {
                  updatedQuestions[level - 1].answers.push({ guess: answer.guess, isCorrect: answer.isCorrect });
                }
              });
              setQuestions(updatedQuestions);
              // Restore startTime
              setStartTime(progress.startTime);
              return; // Skip setting startTime
            }
          }
        }
      } catch (e) {
        console.error('Error loading progress:', e);
        localStorage.removeItem('dailyProgress');
      }
    }
    setStartTime(Date.now()); // Only if new game
  }, [data, testMode, gameMode, difficulty, puzzleSeed]);
  // Update available options for autocomplete
  useEffect(() => {
    if (!input) {
      setAvailableOptions([]);
      return;
    }
    const alreadyGuessed = submittedAnswers.map(a => {
      const parenIndex = a.guess.indexOf('(');
      if (parenIndex > 0) {
        return a.guess.substring(0, parenIndex).trim().toLowerCase();
      }
      return a.guess.toLowerCase();
    });
    const filtered = allTickers
      .filter(t => {
        const matchesSearch = t.symbol.toLowerCase().includes(input.toLowerCase()) ||
                             t.company.toLowerCase().includes(input.toLowerCase());
        const notGuessed = !alreadyGuessed.includes(t.symbol.toLowerCase());
        return matchesSearch && notGuessed;
      })
      .sort((a,b) => {
        if (a.symbol.toLowerCase() === input.toLowerCase()) return -1;
        if (b.symbol.toLowerCase() === input.toLowerCase()) return 1;
        if (a.symbol.toLowerCase().startsWith(input.toLowerCase())) return -1;
        if (b.symbol.toLowerCase().startsWith(input.toLowerCase())) return 1;
        return 0;
      })
      .slice(0,8);
    setAvailableOptions(filtered);
  }, [input, allTickers, submittedAnswers]);
  // Auto-save progress after changes (only for daily)
  useEffect(() => {
    if (gameMode !== 'daily' || testMode || !dailyTicker || !startTime) return;
    const today = new Date(startTime).toDateString();
    const storedDate = localStorage.getItem('dailyDate');
    if (storedDate === today) {
      const progressToSave = {
        currentLevel,
        submittedAnswers,
        gameOver,
        startTime
      };
      localStorage.setItem('dailyProgress', JSON.stringify(progressToSave));
    }
  }, [currentLevel, submittedAnswers, gameOver, startTime, dailyTicker, testMode, gameMode]);
  // Shake animation clear
  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shake]);
  // Fetch Quotron quotes (with error handling)
  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const fetchedQuotes = await Promise.all(QUOTRON_TICKERS.map(async symbol => {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
          const json = await res.json();
          if (!json.c) return null;
          return {
            symbol,
            current: json.c.toFixed(2),
            change: (json.c - json.pc).toFixed(2)
          };
        }));
        const validQuotes = fetchedQuotes.filter(q => q);
        setQuotes(validQuotes.length > 0 ? validQuotes : FALLBACK_QUOTES);
      } catch (e) {
        console.error("Error fetching quotes:", e);
        setQuotes(FALLBACK_QUOTES);
      }
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, []);
  // Focus input after submit
  useEffect(() => {
    if (!gameOver && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  }, [currentLevel, gameOver]);
  // Handle submit (with confetti on win)
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (gameOver || !input.trim()) return;
    let tickerToCheck = input.trim().toLowerCase();
    // Auto-complete if exact symbol match
    const matchedTicker = allTickers.find(t => t.symbol.toLowerCase() === tickerToCheck);
    if (matchedTicker) {
      setInput(matchedTicker.formatted);
      // Submit the formatted version
      const formattedGuess = matchedTicker.formatted;
      const lowerCheck = matchedTicker.symbol.toLowerCase();
      // Check for duplicate
      const alreadyGuessedSymbols = submittedAnswers.map(a => {
        const paren = a.guess.indexOf('(');
        return paren > 0 ? a.guess.substring(0, paren).trim().toLowerCase() : a.guess.toLowerCase();
      });
      if (alreadyGuessedSymbols.includes(lowerCheck)) {
        setShake(true);
        setInput("");
        setAvailableOptions([]);
        return;
      }
      const correctTicker = questions[currentLevel].correct;
      const isCorrect = matchedTicker.symbol.toUpperCase() === correctTicker.toUpperCase();
      const updatedQuestions = [...questions];
      updatedQuestions[currentLevel].answers.push({ guess: formattedGuess, isCorrect });
      setQuestions(updatedQuestions);
      setSubmittedAnswers(prev => [...prev, { level: currentLevel + 1, guess: formattedGuess, isCorrect }]);
      setInput("");
      setAvailableOptions([]);
      if (isCorrect || currentLevel === questions.length -1) {
        setGameOver(true);
        // Confetti on win
        if (isCorrect) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
        // Defer stats update to avoid double-save (only for daily)
        if (gameMode === 'daily') {
          setTimeout(() => updateStats(isCorrect, currentLevel + 1), 100);
        }
        // Always increment totalPuzzles
        setStats(prev => ({ ...prev, totalPuzzles: prev.totalPuzzles + 1 }));
        localStorage.setItem('tickrDailyStats', JSON.stringify({ ...stats, totalPuzzles: stats.totalPuzzles + 1 }));
        return;
      }
      setCurrentLevel(currentLevel+1);
      return;
    }
    // If no exact match, check if it's a partial or company name, but for now, treat as is
    const parenIndex = input.indexOf('(');
    if (parenIndex > 0) {
      tickerToCheck = input.substring(0, parenIndex).trim().toLowerCase();
    } else {
      tickerToCheck = input.trim().toLowerCase();
    }
    const lowerCheck = tickerToCheck;
    // Check for duplicate guess
    const alreadyGuessedSymbols = submittedAnswers.map(a => {
      const paren = a.guess.indexOf('(');
      return paren > 0 ? a.guess.substring(0, paren).trim().toLowerCase() : a.guess.toLowerCase();
    });
    if (alreadyGuessedSymbols.includes(lowerCheck)) {
      setShake(true);
      setInput("");
      setAvailableOptions([]);
      return;
    }
    const correctTicker = questions[currentLevel].correct;
    const isCorrect = tickerToCheck.toUpperCase() === correctTicker.toUpperCase();
    const updatedQuestions = [...questions];
    updatedQuestions[currentLevel].answers.push({ guess: input.trim(), isCorrect });
    setQuestions(updatedQuestions);
    setSubmittedAnswers(prev => [...prev, { level: currentLevel + 1, guess: input.trim(), isCorrect }]);
    setInput("");
    setAvailableOptions([]);
    if (isCorrect || currentLevel === questions.length -1) {
      setGameOver(true);
      // Confetti on win
      if (isCorrect) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
      // Defer stats update to avoid double-save (only for daily)
      if (gameMode === 'daily') {
        setTimeout(() => updateStats(isCorrect, currentLevel + 1), 100);
      }
      // Always increment totalPuzzles
      setStats(prev => ({ ...prev, totalPuzzles: prev.totalPuzzles + 1 }));
      localStorage.setItem('tickrDailyStats', JSON.stringify({ ...stats, totalPuzzles: stats.totalPuzzles + 1 }));
      return;
    }
    setCurrentLevel(currentLevel+1);
  };
  // Track real plays (runs once per visit)
  useEffect(() => {
    if (testMode) return;

   const track = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyRef = doc(db, 'analytics', `daily_${today}`); // ✅ fixed
    const globalRef = doc(db, 'analytics', 'global');

    await setDoc(dailyRef, { plays: increment(1) }, { merge: true });
    await updateDoc(globalRef, { totalPlays: increment(1) });

    if (!localStorage.getItem('td_visited')) {
      localStorage.setItem('td_visited', 'true');
      await updateDoc(globalRef, { uniqueUsers: increment(1) });
    }
  } catch (e) {
    console.log("Analytics offline (normal in dev)", e);
  }
};
track();

  }, [testMode]);
  
// Update stats when game ends (updated for totalPuzzles)
  const updateStats = (won, cluesUsed) => {
    if (testMode || gameMode === 'unlimited') return;
    // Only update if not already completed today
    const progressStr = localStorage.getItem('dailyProgress');
    if (progressStr) {
      try {
        const progress = JSON.parse(progressStr);
        if (progress.gameOver) {
          console.log('Game already completed today—no stats update');
          return;
        }
      } catch (e) {
        // Ignore, proceed
      }
    }
    const timeElapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const today = new Date().toISOString().split('T')[0];

    setStats(prev => {
      const newGuessDistribution = { ...prev.guessDistribution };
      if (won) {
        newGuessDistribution[cluesUsed] = (newGuessDistribution[cluesUsed] || 0) + 1;
      } else {
        newGuessDistribution.fail = (newGuessDistribution.fail || 0) + 1;
      }

      const newPlayHistory = { ...prev.playHistory, [today]: { won, clues: cluesUsed, time: timeElapsed } };
      const newCurrentStreak = won ? prev.currentStreak + 1 : 0;

      const updated = {
        ...prev,
        gamesPlayed: prev.gamesPlayed + 1,
        totalPuzzles: prev.totalPuzzles + 1,
        totalTime: prev.totalTime + timeElapsed,
        gamesWon: won ? prev.gamesWon + 1 : prev.gamesWon,
        currentStreak: newCurrentStreak,
        maxStreak: Math.max(prev.maxStreak, newCurrentStreak),
        fastestTime: won && (!prev.fastestTime || timeElapsed < prev.fastestTime) ? timeElapsed : prev.fastestTime,
        guessDistribution: newGuessDistribution,
        playHistory: newPlayHistory
      };

      // Save to localStorage immediately
      localStorage.setItem('tickrDailyStats', JSON.stringify(updated));

      return updated;
    });
  };
  // Share results
  const shareResults = () => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const modeText = gameMode === 'daily' ? 'Daily' : `${difficulty} Unlimited`;
    const text = `TickrDaily ${modeText} ${new Date().toLocaleDateString()}\n${emoji} (${cluesUsed}/${questions.length})\n🎯 ${dailyTicker.ticker}\n\nPlay: ${window.location.href}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('Results copied to clipboard!');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Results copied to clipboard!');
    }
  };
  const shareToTwitter = () => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const modeText = gameMode === 'daily' ? 'Daily' : `${difficulty} Unlimited`;
    const text = `TickrDaily ${modeText} ${new Date().toLocaleDateString()}\n${emoji} (${cluesUsed}/${questions.length})\n🎯 ${dailyTicker.ticker}\n\nPlay: ${window.location.href}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank');
  };
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('tickrDailyDarkMode', JSON.stringify(newMode));
  };
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };
  const getAchievements = () => {
    const achievements = [];
    if (stats.currentStreak >= 5) achievements.push({ icon: '🔥', name: '5 Day Streak', desc: 'Win 5 days in a row' });
    if (stats.currentStreak >= 10) achievements.push({ icon: '⚡', name: '10 Day Streak', desc: 'Win 10 days in a row' });
    if (stats.gamesWon >= 10) achievements.push({ icon: '🏆', name: 'Veteran', desc: 'Win 10 games' });
    if (stats.gamesWon >= 50) achievements.push({ icon: '👑', name: 'Master', desc: 'Win 50 games' });
    if (stats.guessDistribution[1] >= 5) achievements.push({ icon: '🎯', name: 'First Try Hero', desc: 'Win on first clue 5 times' });
    if (stats.fastestTime && stats.fastestTime < 30) achievements.push({ icon: '⚡', name: 'Speed Demon', desc: 'Win in under 30 seconds' });
    return achievements;
  };
  const handleOptionClick = (option) => {
    setInput(option.formatted);
    setAvailableOptions([]);
  };
  const resetGame = () => {
    localStorage.removeItem('dailyProgress');
    window.location.reload();
  };
  // Test mode: Skip to next random ticker
  const skipToNextTicker = () => {
    if (!data || data.length === 0) return;
    setGameOver(false);
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setInput("");
    setAvailableOptions([]);
    let newTicker;
    do {
      const randomIndex = Math.floor(Math.random() * data.length);
      newTicker = data[randomIndex];
    } while (data.length > 1 && newTicker.ticker === dailyTicker?.ticker);
    setDailyTicker(newTicker);
    const pickedQuestions = [];
    let maxLevels = difficulty === 'hard' ? 3 : difficulty === 'medium' ? 5 : 6;
    for (let i = 1; i <= maxLevels; i++) {
      const levelQuestions = newTicker.questions[`level_${i}`];
      if (levelQuestions) {
        const question = levelQuestions[Math.floor(Math.random() * levelQuestions.length)];
        pickedQuestions.push({
          level: i,
          question,
          correct: newTicker.ticker,
          answers: []
        });
      }
    }
    if (difficulty === 'easy' && pickedQuestions.length >= 5 && newTicker.questions.level_5) {
      const bonusQ = newTicker.questions.level_5[Math.floor(Math.random() * newTicker.questions.level_5.length)];
      pickedQuestions.push({ level: 6, question: bonusQ, correct: newTicker.ticker, answers: [] });
    }
    setQuestions(pickedQuestions);
    setStartTime(Date.now());
    // Increment totalPuzzles
    setStats(prev => ({ ...prev, totalPuzzles: prev.totalPuzzles + 1 }));
    localStorage.setItem('tickrDailyStats', JSON.stringify({ ...stats, totalPuzzles: stats.totalPuzzles + 1 }));
  };
  // Next puzzle for unlimited
  const nextPuzzle = () => {
    setGameOver(false);
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setInput("");
    setAvailableOptions([]);
    // Trigger re-selection via dep
    setPuzzleSeed(prev => prev + 1);
    // Increment totalPuzzles
    setStats(prev => ({ ...prev, totalPuzzles: prev.totalPuzzles + 1 }));
    localStorage.setItem('tickrDailyStats', JSON.stringify({ ...stats, totalPuzzles: stats.totalPuzzles + 1 }));
  };
  // Mode Selector Component
  const ModeSelector = () => (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => setGameMode('daily')}
        style={{
          padding: '0.75rem 1.5rem',
          background: gameMode === 'daily' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : cardBg,
          color: gameMode === 'daily' ? 'white' : textColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '1rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        aria-label="Switch to Daily Mode"
      >
        🗓️ Daily Mode
      </button>
      <button
        onClick={() => setGameMode('unlimited')}
        style={{
          padding: '0.75rem 1.5rem',
          background: gameMode === 'unlimited' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : cardBg,
          color: gameMode === 'unlimited' ? 'white' : textColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '1rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        aria-label="Switch to Unlimited Mode"
      >
        ♾️ Unlimited Mode
      </button>
      {gameMode === 'unlimited' && (
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            background: cardBg,
            color: textColor,
            border: `1px solid ${borderColor}`,
            borderRadius: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
          aria-label="Select Difficulty Level"
        >
          <option value="easy">😊 Easy (6 Clues)</option>
          <option value="medium">⚖️ Medium (5 Clues)</option>
          <option value="hard">🔥 Hard (3 Clues)</option>
        </select>
      )}
    </div>
  );
  if(loading || !dailyTicker || !questions.length){
    return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)' }}>
      <div style={{ textAlign:'center', color:'#94a3b8'}}>Loading Market Data...</div>
    </div>;
  }
  const todayDate = new Date().toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const isWinner = submittedAnswers.some(a=>a.isCorrect);
  const numClues = questions.length;
  const bgColor = darkMode ? 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)' : 'linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%)';
  const textColor = darkMode ? '#e2e8f0' : '#1e293b';
  const mutedColor = darkMode ? '#94a3b8' : '#64748b';
  const cardBg = darkMode ? 'rgba(15,23,42,0.7)' : 'rgba(255,255,255,0.8)';
  const borderColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  return (
    <div style={{ minHeight:'100vh', background: bgColor, display:'flex', flexDirection:'column', alignItems:'center', padding:'2rem 1rem' }}>
      {/* Quotron */}
      <div className="quotron" style={{ width:'100%', overflow:'hidden', whiteSpace:'nowrap', marginBottom:'2rem', border:`1px solid ${borderColor}`, padding:'0.5rem 0', borderRadius:'1rem', background:darkMode ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.8)', display: 'flex', flexDirection: 'row' }}>
        <div style={{ display:'inline-block', animation:'scroll 120s linear infinite' }}>
          {[...quotes, ...quotes].map((q,i)=>(
            <span key={i} style={{ display:'inline-block', marginRight:'3rem', color: q.change>=0 ? '#22c55e' : '#ef4444', fontWeight:'700', fontFamily:'monospace' }}>
              {q.symbol} {q.current} {q.change>=0?`+${q.change}`:q.change}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        @media (max-width: 768px) {
  .quotron {
    height: 38px !important;
    flex-direction: row !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    padding: 0 !important;
  }
  .quotron div {
    animation: scroll 80s linear infinite !important;
    line-height: 38px !important;
  }
}

        @keyframes scroll-vertical {
          0% { transform: translateY(100%); }
          100% { transform: translateY(-100%); }
        }
      `}</style>
      <div style={{ width:'100%', maxWidth:'900px', display:'flex', flexDirection:'column', alignItems:'center' }}>
        {/* Header with Dark Mode Toggle and Test Mode Indicator */}
        <div style={{ textAlign:'center', marginBottom:'1rem', position:'relative', width:'100%' }}>
          <button
            onClick={toggleDarkMode}
            style={{
              position:'absolute',
              right:0,
              top:0,
              padding:'0.75rem',
              background:cardBg,
              border:`1px solid ${borderColor}`,
              borderRadius:'0.75rem',
              color:textColor,
              cursor:'pointer',
              transition:'all 0.3s ease'
            }}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          {testMode && (
            <div style={{
              position:'absolute',
              left:0,
              top:0,
              padding:'0.75rem 1rem',
              background:'linear-gradient(135deg, #f59e0b, #d97706)',
              border:`1px solid ${borderColor}`,
              borderRadius:'0.75rem',
              color:'white',
              fontWeight:'700',
              fontSize:'0.75rem',
              display:'flex',
              alignItems:'center',
              gap:'0.5rem'
            }}>
              🧪 TEST MODE
            </div>
          )}
          <h1 style={{ fontSize:'4rem', fontWeight:'800', background:'linear-gradient(135deg,#22c55e 0%,#3b82f6 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'0.5rem', letterSpacing:'-0.02em' }}>TickrDaily</h1>
          <p style={{ color:mutedColor, fontSize:'1rem', fontWeight:'500', letterSpacing:'0.05em' }}>{todayDate}</p>
          <p style={{ color:mutedColor, fontSize:'0.875rem', marginTop:'0.5rem' }}>
            {gameMode === 'daily' ? 'Guess the stock from 5 clues' : `Guess the stock from ${difficulty === 'easy' ? 6 : difficulty === 'hard' ? 3 : 5} clues (${difficulty})`}
          </p>
          {gameOver && gameMode === 'daily' && !testMode && (
            <p style={{ color: '#22c55e', fontSize: '1rem', fontWeight: '600', marginTop: '1rem' }}>
              You already completed today's puzzle! Come back tomorrow for a new one. 🎯
            </p>
          )}
          {/* New: Progress Bar */}
          <div style={{ width: '100%', height: '4px', background: borderColor, borderRadius: '2px', margin: '1rem 0', overflow: 'hidden' }}>
            <div style={{ 
              width: `${((currentLevel + 1) / questions.length) * 100}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #22c55e, #3b82f6)', 
              transition: 'width 0.3s ease' 
            }} />
          </div>
        </div>
        {/* Mode Selector */}
        <ModeSelector />
        {/* Stats and How to Play Buttons */}
        <div style={{ display:'flex', gap:'1rem', marginBottom:'2rem' }}>
          <button
            onClick={() => setShowStats(!showStats)}
            style={{
              padding:'0.75rem 1.75rem',
              background:cardBg,
              border:`1px solid ${borderColor}`,
              borderRadius:'1rem',
              color:textColor,
              cursor:'pointer',
              fontWeight:'600',
              fontSize:'0.875rem',
              transition:'all 0.3s ease',
              display:'flex',
              alignItems:'center',
              gap:'0.5rem'
            }}
            aria-label="View Statistics"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            <span>Statistics</span>
          </button>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{
              padding:'0.75rem 1.75rem',
              background:cardBg,
              border:`1px solid ${borderColor}`,
              borderRadius:'1rem',
              color:textColor,
              cursor:'pointer',
              fontWeight:'600',
              fontSize:'0.875rem',
              transition:'all 0.3s ease',
              display:'flex',
              alignItems:'center',
              gap:'0.5rem'
            }}
            aria-label="How to Play"
          >
            <span>❓</span>
            <span>How to Play</span>
          </button>
        </div>
        {/* Stats Modal (updated with totalPuzzles card) */}
        {showStats && (
          <div
            style={{
              position:'fixed',
              top:0,
              left:0,
              right:0,
              bottom:0,
              background:'rgba(0,0,0,0.8)',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              zIndex:100,
              padding:'1rem',
              overflowY:'auto'
            }}
            onClick={() => setShowStats(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Statistics Modal"
          >
            <div
              style={{
                background: darkMode ? 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))' : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
                backdropFilter:'blur(20px)',
                borderRadius:'2rem',
                padding:'2.5rem',
                maxWidth:'700px',
                width:'100%',
                border:`1px solid ${borderColor}`,
                position:'relative',
                maxHeight:'90vh',
                overflowY:'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowStats(false)}
                style={{
                  position:'absolute',
                  top:'1rem',
                  right:'1rem',
                  background:cardBg,
                  border:'none',
                  color:textColor,
                  fontSize:'1.5rem',
                  cursor:'pointer',
                  width:'40px',
                  height:'40px',
                  borderRadius:'50%',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center'
                }}
                aria-label="Close Statistics Modal"
              >
                ×
              </button>
              <h2 style={{ fontSize:'2rem', fontWeight:'800', color:textColor, marginBottom:'2rem', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.75rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                Your Statistics
              </h2>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'1rem', marginBottom:'2rem' }}>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#22c55e' }}>{stats.gamesPlayed}</div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Played</div>
                </div>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#3b82f6' }}>
                    {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%
                  </div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Win Rate</div>
                </div>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#f59e0b' }}>{stats.currentStreak}🔥</div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Current Streak</div>
                </div>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#a855f7' }}>{stats.maxStreak}</div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Max Streak</div>
                </div>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#ec4899' }}>
                    {stats.fastestTime ? formatTime(stats.fastestTime) : '--'}
                  </div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Fastest Time</div>
                </div>
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#14b8a6' }}>
                    {stats.gamesPlayed > 0 ? formatTime(Math.floor(stats.totalTime / stats.gamesPlayed)) : '--'}
                  </div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Avg Time</div>
                </div>
                {/* New: Total Puzzles Card */}
                <div style={{ textAlign:'center', background:cardBg, padding:'1.5rem 1rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <div style={{ fontSize:'2rem', fontWeight:'700', color:'#8b5cf6' }}>{stats.totalPuzzles}</div>
                  <div style={{ fontSize:'0.75rem', color:mutedColor, marginTop:'0.25rem' }}>Total Puzzles</div>
                </div>
              </div>
              {getAchievements().length > 0 && (
                <div style={{ marginBottom:'2rem' }}>
                  <h3 style={{ fontSize:'1.25rem', fontWeight:'700', color:textColor, marginBottom:'1rem' }}>
                    🏆 Achievements
                  </h3>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'0.75rem' }}>
                    {getAchievements().map((ach, i) => (
                      <div key={i} style={{ background:cardBg, padding:'1rem', borderRadius:'0.75rem', border:`1px solid ${borderColor}`, display:'flex', alignItems:'center', gap:'0.75rem' }}>
                        <span style={{ fontSize:'1.5rem' }}>{ach.icon}</span>
                        <div>
                          <div style={{ fontSize:'0.875rem', fontWeight:'600', color:textColor }}>{ach.name}</div>
                          <div style={{ fontSize:'0.75rem', color:mutedColor }}>{ach.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom:'1.5rem' }}>
                <h3 style={{ fontSize:'1.25rem', fontWeight:'700', color:textColor, marginBottom:'1rem' }}>
                  Guess Distribution
                </h3>
                {[1,2,3,4,5,'fail'].map((clue) => {
                  const count = stats.guessDistribution[clue];
                  const maxCount = Math.max(...Object.values(stats.guessDistribution));
                  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={clue} style={{ display:'flex', alignItems:'center', marginBottom:'0.5rem' }}>
                      <div style={{ width:'60px', color:mutedColor, fontSize:'0.875rem', fontWeight:'600' }}>
                        {clue === 'fail' ? 'Failed' : `${clue} clue${clue > 1 ? 's' : ''}`}
                      </div>
                      <div style={{ flex:1, background:cardBg, height:'32px', borderRadius:'0.5rem', overflow:'hidden', position:'relative', border:`1px solid ${borderColor}` }}>
                        <div style={{
                          width:`${Math.max(percentage, 5)}%`,
                          height:'100%',
                          background: clue === 'fail' ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #22c55e, #16a34a)',
                          transition:'width 0.5s ease',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'flex-end',
                          paddingRight:'0.5rem'
                        }}>
                          <span style={{ color:'white', fontWeight:'700', fontSize:'0.875rem' }}>{count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {stats.playHistory && Object.keys(stats.playHistory).length > 0 && (
                <div>
                  <h3 style={{ fontSize:'1.25rem', fontWeight:'700', color:textColor, marginBottom:'1rem' }}>
                    📅 Play History (Last 30 Days)
                  </h3>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'0.25rem' }}>
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() - (29 - i));
                      const dateStr = date.toISOString().split('T')[0];
                      const dayData = stats.playHistory[dateStr];
                      return (
                        <div
                          key={i}
                          title={dateStr + (dayData ? ` - ${dayData.won ? 'Won' : 'Lost'} in ${dayData.clues} clues` : '')}
                          style={{
                            aspectRatio:'1',
                            borderRadius:'0.25rem',
                            background: dayData
                              ? dayData.won
                                ? '#22c55e'
                                : '#ef4444'
                              : cardBg,
                            border:`1px solid ${borderColor}`,
                            cursor:'pointer'
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.5rem', fontSize:'0.75rem', color:mutedColor }}>
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* How to Play Modal (with ARIA) */}
        {showHowToPlay && (
          <div
            style={{
              position:'fixed',
              top:0,
              left:0,
              right:0,
              bottom:0,
              background:'rgba(0,0,0,0.8)',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              zIndex:100,
              padding:'1rem'
            }}
            onClick={() => setShowHowToPlay(false)}
            role="dialog"
            aria-modal="true"
            aria-label="How to Play Modal"
          >
            <div
              style={{
                background: darkMode ? 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))' : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
                backdropFilter:'blur(20px)',
                borderRadius:'2rem',
                padding:'2.5rem',
                maxWidth:'600px',
                width:'100%',
                border:`1px solid ${borderColor}`,
                position:'relative'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowHowToPlay(false)}
                style={{
                  position:'absolute',
                  top:'1rem',
                  right:'1rem',
                  background:cardBg,
                  border:'none',
                  color:textColor,
                  fontSize:'1.5rem',
                  cursor:'pointer',
                  width:'40px',
                  height:'40px',
                  borderRadius:'50%',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center'
                }}
                aria-label="Close How to Play Modal"
              >
                ×
              </button>
              <h2 style={{ fontSize:'2rem', fontWeight:'800', color:textColor, marginBottom:'1.5rem', textAlign:'center' }}>
                ❓ How to Play
              </h2>
              <div style={{ color:textColor, lineHeight:'1.8', fontSize:'1rem' }}>
                <p style={{ marginBottom:'1rem', fontWeight:'600', fontSize:'1.125rem' }}>
                  Guess the stock ticker in {numClues} clues or less!
                </p>
                <div style={{ background:cardBg, padding:'1.5rem', borderRadius:'1rem', marginBottom:'1rem', border:`1px solid ${borderColor}` }}>
                  <p style={{ marginBottom:'0.75rem' }}>
                    <strong style={{ color:'#22c55e' }}>🎯 Objective:</strong> Identify the mystery stock from progressively specific clues.
                  </p>
                  <p style={{ marginBottom:'0.75rem' }}>
                    <strong style={{ color:'#3b82f6' }}>📝 Clues:</strong> Each clue gets more specific, from broad industry hints to precise company details.
                  </p>
                  <p>
                    <strong style={{ color:'#f59e0b' }}>⏱️ Strategy:</strong> The fewer clues you need, the better your score!
                  </p>
                </div>
                <div style={{ background:cardBg, padding:'1.5rem', borderRadius:'1rem', border:`1px solid ${borderColor}` }}>
                  <h3 style={{ fontSize:'1.125rem', fontWeight:'700', marginBottom:'0.75rem' }}>Example:</h3>
                  <div style={{ fontSize:'0.875rem', color:mutedColor, lineHeight:'1.6' }}>
                    <p>1️⃣ "I'm a technology company..."</p>
                    <p>2️⃣ "I make electric vehicles..."</p>
                    <p>3️⃣ "My CEO is very active on social media..."</p>
                    <p>4️⃣ "I launched the Cybertruck in 2023..."</p>
                    <p>5️⃣ "I'm named after a famous inventor..."</p>
                    <p style={{ marginTop:'0.75rem', color:'#22c55e', fontWeight:'600' }}>Answer: TSLA (Tesla)</p>
                  </div>
                </div>
                <p style={{ marginTop:'1.5rem', textAlign:'center', fontSize:'0.875rem', color:mutedColor }}>
                  {gameMode === 'daily' ? 'New puzzle daily at midnight EST!' : 'Endless challenges await!'} 🌅
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Questions (input with title for shortcut hint) */}
        {questions.map((q, idx) => {
          if(idx>currentLevel) return null;
          return (
            <div key={idx} style={{ marginBottom:'2rem', width:'100%' }}>
              <div style={{ background:'rgba(15,23,42,0.7)', backdropFilter:'blur(20px)', borderRadius:'1.5rem', padding:'2rem', border:'1px solid rgba(255,255,255,0.1)', width:'100%' }}>
                <p style={{ fontWeight:'700', fontSize:'1.25rem', marginBottom:'1rem', color:'#f1f5f9' }}>Question {q.level}: {q.question}</p>
                {q.answers.map((a,i)=>(
                  <div key={i} style={{ padding:'0.75rem 1.25rem', marginBottom:'0.5rem', borderRadius:'0.75rem', background:a.isCorrect?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)", color:a.isCorrect?"#22c55e":"#ef4444", fontWeight:'600', fontFamily:'monospace', fontSize:'1rem' }}>
                    {a.isCorrect?"✓":"✗"} {a.guess}
                  </div>
                ))}
                {currentLevel===idx && !gameOver && (
                  <form
                    style={{ position:'relative', marginTop:'1rem', width:'100%', display:'flex', flexDirection:'column', alignItems:'center' }}
                    onSubmit={handleSubmit}
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Ex: NVDA (NVIDIA)"
                      autoFocus
                      title="Press Enter to submit"
                      aria-label="Enter your stock guess"
                      style={{
                        width:'100%',
                        padding:'1rem 1.25rem',
                        borderRadius:'1rem',
                        border:'2px solid rgba(255,255,255,0.2)',
                        background:'rgba(255,255,255,0.1)',
                        color:'white',
                        outline:'none',
                        fontWeight:'500',
                        fontSize:'1rem',
                        boxSizing:'border-box'
                      }}
                    />
                    {availableOptions.length>0 && (
                      <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:'0.5rem', background:'rgba(15,23,42,0.95)', borderRadius:'1rem', overflow:'auto', maxHeight:'400px', zIndex:50, border:'1px solid rgba(255,255,255,0.2)' }}>
                        {availableOptions.map((opt,i)=>(
                          <div
                            key={i}
                            onClick={()=>handleOptionClick(opt)}
                            style={{
                              padding:'1rem 1.25rem',
                              cursor:'pointer',
                              borderBottom:i<availableOptions.length-1?"1px solid rgba(255,255,255,0.1)":"none",
                              transition:'background 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontWeight:'700', color:'#22c55e', fontFamily:'monospace', fontSize:'1rem' }}>{opt.symbol}</div>
                            <div style={{ fontSize:'0.875rem', color:'#94a3b8', marginTop:'0.25rem' }}>{opt.company}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="submit"
                      style={{
                        marginTop:'1rem',
                        padding:'0.75rem 1.5rem',
                        background:'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)',
                        borderRadius:'0.75rem',
                        border:'none',
                        fontWeight:'700',
                        fontSize:'0.875rem',
                        color:'white',
                        cursor:'pointer',
                        transition:'all 0.3s ease',
                        boxShadow:'0 10px 25px -5px rgba(34, 197, 94, 0.4)',
                        ...(shake && { animation: 'shake 0.5s ease-in-out' })
                      }}
                      aria-label="Submit your answer"
                      onMouseEnter={(e) => {
                        if (!shake) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(34, 197, 94, 0.5)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!shake) {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 197, 94, 0.4)';
                        }
                      }}
                    >
                      Submit Answer
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {/* Game Over */}
        {gameOver && (
          <div style={{ textAlign:'center', marginTop:'2rem', background:'rgba(15,23,42,0.7)', backdropFilter:'blur(20px)', padding:'3rem', borderRadius:'2rem', border:'1px solid rgba(255,255,255,0.1)', width:'100%' }}>
            <div style={{ fontSize:'5rem', marginBottom:'1.5rem' }}>{isWinner ? '🎉' : '😔'}</div>
            <h2 style={{ fontSize:'2.5rem', fontWeight:'800', background:isWinner?'linear-gradient(135deg,#22c55e 0%,#3b82f6 100%)':'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'1.5rem' }}>
              {isWinner?'Congratulations!':'Game Over'}
            </h2>
            <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:'1rem', padding:'2rem', marginBottom:'2rem' }}>
              <p style={{ color:'#94a3b8', fontSize:'0.875rem', marginBottom:'0.5rem', textTransform:'uppercase' }}>The Answer Was</p>
              <p style={{ fontSize:'2.5rem', fontWeight:'800', color:'#22c55e', fontFamily:'monospace', marginBottom:'0.5rem' }}>{dailyTicker.ticker}</p>
              <p style={{ fontSize:'1.125rem', color:'#e2e8f0' }}>{dailyTicker.company}</p>
              <p style={{ color: '#94a3b8', fontSize: '1.125rem', marginTop: '1rem', textAlign: 'center' }}>
                {gameMode === 'daily' ? 'Come back tomorrow for a new challenge!' : 'Keep going!'}
              </p>
            </div>
            <div style={{ marginTop:'1.5rem', display:'flex', gap:'0.75rem', justifyContent:'center', flexWrap:'wrap' }}>
              <button
                onClick={shareResults}
                style={{
                  padding:'1rem 2rem',
                  borderRadius:'1rem',
                  fontWeight:'700',
                  fontSize:'1rem',
                  color:'white',
                  border:'none',
                  background:'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  cursor:'pointer',
                  transition:'all 0.3s ease',
                  boxShadow:'0 10px 25px -5px rgba(59, 130, 246, 0.4)'
                }}
                aria-label="Share your results"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(59, 130, 246, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(59, 130, 246, 0.4)';
                }}
              >
                📤 Share Results
              </button>
              <button
                onClick={shareToTwitter}
                style={{
                  padding:'1rem 2rem',
                  borderRadius:'1rem',
                  fontWeight:'700',
                  fontSize:'1rem',
                  color:'white',
                  border:'none',
                  background:'linear-gradient(135deg, #1DA1F2 0%, #0c85d0 100%)',
                  cursor:'pointer',
                  transition:'all 0.3s ease',
                  boxShadow:'0 10px 25px -5px rgba(29, 161, 242, 0.4)'
                }}
                aria-label="Share on X (Twitter)"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(29, 161, 242, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(29, 161, 242, 0.4)';
                }}
              >
                🐦 Share on X
              </button>
              {gameMode === 'unlimited' && (
                <button
                  onClick={nextPuzzle}
                  style={{
                    padding:'1rem 2rem',
                    borderRadius:'1rem',
                    fontWeight:'700',
                    fontSize:'1rem',
                    color:'white',
                    border:'none',
                    background:'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)',
                    cursor:'pointer',
                    transition:'all 0.3s ease',
                    boxShadow:'0 10px 25px -5px rgba(34, 197, 94, 0.4)'
                  }}
                  aria-label="Load Next Puzzle"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(34, 197, 94, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 197, 94, 0.4)';
                  }}
                >
                  🔄 Next Puzzle
                </button>
              )}
              {testMode && (
                <>
                  <button
                    onClick={resetGame}
                    style={{
                      padding:'1rem 2rem',
                      borderRadius:'1rem',
                      fontWeight:'700',
                      fontSize:'1rem',
                      color:'white',
                      border:'none',
                      background:'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)',
                      cursor:'pointer',
                      transition:'all 0.3s ease',
                      boxShadow:'0 10px 25px -5px rgba(34, 197, 94, 0.4)'
                    }}
                    aria-label="Start New Game"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(34, 197, 94, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    🔄 New Game
                  </button>
                  <button
                    onClick={skipToNextTicker}
                    style={{
                      padding:'1rem 2rem',
                      borderRadius:'1rem',
                      fontWeight:'700',
                      fontSize:'1rem',
                      color:'white',
                      border:'none',
                      background:'linear-gradient(135deg, #f59e0b, #d97706)',
                      cursor:'pointer',
                      transition:'all 0.3s ease',
                      boxShadow:'0 10px 25px -5px rgba(245, 158, 11, 0.4)'
                    }}
                    aria-label="Skip to Next Ticker (Test Mode)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(245, 158, 11, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(245, 158, 11, 0.4)';
                    }}
                  >
                    🧪 Skip to Next Ticker
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
