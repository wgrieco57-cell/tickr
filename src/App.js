import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import confetti from "canvas-confetti";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";

// REMOVED: QUOTRON_TICKERS - now handled by backend

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
const analytics = getAnalytics(app);

// REMOVED: Firestore imports and functions
// REMOVED: const db = getFirestore();
// REMOVED: fetchStocksFromFirestore function

// Simplified stats tracking (no Firestore writes)
async function updateDailyStats({ won = false }) {
  // Analytics now handled by backend API
  console.log('Game completed:', { won, date: new Date().toISOString() });
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(initialSeed) {
  let seed = hashCode(initialSeed.toString());
  return function() {
    seed = (seed * 16807) % 2147483647;
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
  const [startTime, setStartTime] = useState(null);
  const [shake, setShake] = useState(false);
  const [activeModeTab, setActiveModeTab] = useState('daily');
  const [isMobile, setIsMobile] = useState(false);
  const [todayStats, setTodayStats] = useState(null); // NEW: Social proof stats
  const [stats, setStats] = useState({
    dailyGamesPlayed: 0,
    dailyGamesWon: 0,
    dailyCurrentStreak: 0,
    dailyMaxStreak: 0,
    dailyGuessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 },
    dailyPlayHistory: {},
    dailyTotalTime: 0,
    unlimitedCompletions: 0,
    unlimitedGuessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 },
    unlimitedTotalTime: 0,
    overallFastestTime: null,
    overallTotalTime: 0,
    achievements: [],
  });

  const [gameMode, setGameMode] = useState('daily');
  const [difficulty, setDifficulty] = useState('medium');
  const [puzzleSeed, setPuzzleSeed] = useState(0);

  const inputRef = useRef(null);

  const theme = useMemo(() => {
    const bgColor = 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)';
    const textColor = '#e2e8f0';
    const mutedColor = '#94a3b8';
    const cardBg = 'rgba(15,23,42,0.7)';
    const borderColor = 'rgba(255,255,255,0.1)';
    return { bgColor, textColor, mutedColor, cardBg, borderColor };
  }, []);

  // Load stats + dark mode once
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tickrDailyStats');
      if (saved) {
        const parsed = JSON.parse(saved);
        setStats(parsed);
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
      localStorage.removeItem('tickrDailyStats');
    }

    if (!localStorage.getItem('tickrDailyVisited')) {
      setShowHowToPlay(true);
      localStorage.setItem('tickrDailyVisited', 'true');
    }

    // Generate user ID if doesn't exist
    if (!localStorage.getItem('userId')) {
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', userId);
    }
  }, []);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-save stats
  useEffect(() => {
    try {
      localStorage.setItem('tickrDailyStats', JSON.stringify(stats));
    } catch (e) {
      console.error('Failed to save stats:', e);
    }
  }, [stats]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !gameOver && input.trim()) handleSubmit();
      if (e.key.toLowerCase() === 'n' && gameOver && gameMode === 'unlimited') nextPuzzle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, gameOver, gameMode]);

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

  useEffect(() => {
    const auth = getAuth();
    signInAnonymously(auth)
      .then(() => {
        console.log("Signed in anonymously");
      })
      .catch((error) => {
        console.error("Anonymous sign-in error:", error);
      });
  }, []);

  // Select daily ticker and questions
  useEffect(() => {
    if (!data || data.length === 0) return;

    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setGameOver(false);
    setInput("");
    setAvailableOptions([]);
    setStartTime(null);

    const today = new Date().toDateString();
    let selectedTicker;
    let pickedQuestions = [];

    const sortedData = [...data].sort((a, b) => a.ticker.localeCompare(b.ticker));

    let filteredData = sortedData;
    if (gameMode === 'unlimited') {
      filteredData = sortedData.filter(t => (t.difficulty || 'medium') === difficulty);
    }

    if (gameMode === 'daily') {
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

      localStorage.setItem('dailyDate', today);
    } else {
      const randomIndex = Math.floor(Math.random() * filteredData.length);
      selectedTicker = filteredData[randomIndex];

      for (let i = 1; i <= 5; i++) {
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
    }

    setDailyTicker(selectedTicker);
    setQuestions(pickedQuestions);

    if (gameMode === 'daily') {
      try {
        const progressStr = localStorage.getItem('dailyProgress');
        if (progressStr) {
          const progress = JSON.parse(progressStr);
          if (progress.startTime) {
            const progressDate = new Date(progress.startTime).toDateString();
            if (progressDate === today) {
              setCurrentLevel(progress.currentLevel);
              setSubmittedAnswers(progress.submittedAnswers);
              setGameOver(progress.gameOver);

              const updatedQuestions = [...pickedQuestions];
              progress.submittedAnswers.forEach(answer => {
                const level = answer.level;
                if (updatedQuestions[level - 1]) {
                  updatedQuestions[level - 1].answers.push({
                    guess: answer.guess,
                    isCorrect: answer.isCorrect
                  });
                }
              });
              setQuestions(updatedQuestions);
              setStartTime(progress.startTime);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Error loading progress:', e);
        localStorage.removeItem('dailyProgress');
      }
    }

    setStartTime(Date.now());
  }, [data, gameMode, difficulty, puzzleSeed]);

  // Update available options
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
      .sort((a, b) => {
        if (a.symbol.toLowerCase() === input.toLowerCase()) return -1;
        if (b.symbol.toLowerCase() === input.toLowerCase()) return 1;
        if (a.symbol.toLowerCase().startsWith(input.toLowerCase())) return -1;
        if (b.symbol.toLowerCase().startsWith(input.toLowerCase())) return 1;
        return 0;
      })
      .slice(0, 8);

    setAvailableOptions(filtered);
  }, [input, allTickers, submittedAnswers]);

  // Auto-save progress
  useEffect(() => {
    if (gameMode !== 'daily' || !dailyTicker || !startTime) return;

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
  }, [currentLevel, submittedAnswers, gameOver, startTime, dailyTicker, gameMode]);

  // Shake animation
  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shake]);

  // UPDATED: Load quotes from backend API with visibility API and jitter
  useEffect(() => {
    let interval = null;
    let abortController = null;

    const loadQuotes = async () => {
      // Don't fetch if tab is hidden (saves API calls)
      if (document.visibilityState === 'hidden') {
        return;
      }

      // Abort previous request if still running
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      try {
        // Only fetch if online
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return;
        }

        const response = await fetch('/api/quotes', {
          signal: abortController.signal
        });
        
        if (!response.ok) throw new Error('API error');
        
        const data = await response.json();
        
        if (data.quotes && data.quotes.length > 0) {
          setQuotes(window.innerWidth <= 768 ? data.quotes.slice(0, 10) : data.quotes);
        } else {
          setQuotes(FALLBACK_QUOTES);
        }
        
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load quotes:', error);
        setQuotes(FALLBACK_QUOTES);
      }
    };

    // Load immediately
    loadQuotes();

    // Add random jitter to prevent stampede (5min ± 15sec)
    const baseInterval = 300000;
    const jitter = Math.random() * 15000;
    const intervalWithJitter = baseInterval + jitter;

    interval = setInterval(loadQuotes, intervalWithJitter);

    // Pause polling when tab is hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadQuotes();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      if (abortController) abortController.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // NEW: Fetch today's stats for social proof
  useEffect(() => {
    fetch('/api/stats-daily')
      .then(res => res.json())
      .then(data => {
        if (data.total_games > 0) {
          setTodayStats(data);
        }
      })
      .catch(() => {
        // Silent fail - stats are nice-to-have
      });
  }, []);

  // Focus input
  useEffect(() => {
    if (!gameOver && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  }, [currentLevel, gameOver]);

  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if (gameOver || !input.trim()) return;

    let tickerToCheck = input.trim().toLowerCase();

    const matchedTicker = allTickers.find(t => t.symbol.toLowerCase() === tickerToCheck);
    if (matchedTicker) {
      setInput(matchedTicker.formatted);
      const formattedGuess = matchedTicker.formatted;
      const lowerCheck = matchedTicker.symbol.toLowerCase();

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
      updatedQuestions[currentLevel].answers.push({
        guess: formattedGuess,
        isCorrect
      });

      setQuestions(updatedQuestions);
      setSubmittedAnswers(prev => [...prev, {
        level: currentLevel + 1,
        guess: formattedGuess,
        isCorrect
      }]);

      setInput("");
      setAvailableOptions([]);

      if (isCorrect || currentLevel === questions.length - 1) {
        setGameOver(true);
        if (isCorrect) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
        updateStats(isCorrect, currentLevel + 1);
        return;
      }

      setCurrentLevel(currentLevel + 1);
      return;
    }

    const parenIndex = input.indexOf('(');
    if (parenIndex > 0) {
      tickerToCheck = input.substring(0, parenIndex).trim().toLowerCase();
    } else {
      tickerToCheck = input.trim().toLowerCase();
    }

    const lowerCheck = tickerToCheck;
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
    updatedQuestions[currentLevel].answers.push({
      guess: input.trim(),
      isCorrect
    });

    setQuestions(updatedQuestions);
    setSubmittedAnswers(prev => [...prev, {
      level: currentLevel + 1,
      guess: input.trim(),
      isCorrect
    }]);

    setInput("");
    setAvailableOptions([]);

    if (isCorrect || currentLevel === questions.length - 1) {
      setGameOver(true);
      if (isCorrect) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
      updateStats(isCorrect, currentLevel + 1);
      return;
    }

    setCurrentLevel(currentLevel + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, input, allTickers, questions, currentLevel, submittedAnswers, startTime]);

  const handleOptionClick = useCallback((option) => {
    setInput(option.formatted);
    setAvailableOptions([]);
  }, []);

  const nextPuzzle = useCallback(() => {
    setGameOver(false);
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setInput("");
    setAvailableOptions([]);
    setPuzzleSeed(prev => prev + 1);
  }, []);

  // UPDATED: Share results with new /api/share endpoint
  const shareResults = useCallback(() => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const timeElapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const now = new Date();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    
    const shareUrl = window.location.origin; // Clean homepage link
    const text = `TickrDaily ${dateStr} ${cluesUsed}/${questions.length}\n\n${emoji}\n\n${shareUrl}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'TickrDaily',
        text: `I solved TickrDaily in ${cluesUsed}/${questions.length} clues!`,
        url: shareUrl
      }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('Share link copied to clipboard!');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Share link copied to clipboard!');
    }
  }, [submittedAnswers, questions, startTime]);

  // UPDATED: Share to Twitter with clean homepage link
  const shareToTwitter = useCallback(() => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const timeElapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const now = new Date();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    
    const shareUrl = window.location.origin; // Clean homepage link
    const text = `TickrDaily ${dateStr} ${cluesUsed}/${questions.length}\n\n${emoji}`;
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank');
  }, [submittedAnswers, questions, startTime]);

  useEffect(() => {
    const track = async () => {
      try {
        logEvent(analytics, 'page_view', { page_path: window.location.pathname });
        logEvent(analytics, 'visit_tickr', { mode: gameMode });
      } catch (e) {
        console.log("Analytics offline (normal in dev)", e);
      }
    };
    track();
  }, [gameMode]);

  // UPDATED: Stats function with online check
  const updateStats = useCallback((won, cluesUsed, timeElapsed = null) => {
    if (gameMode === 'daily') {
      const saved = localStorage.getItem('dailyProgress');
      if (saved && JSON.parse(saved).gameOver) return;
    }

    const time = timeElapsed ?? (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
    const today = new Date().toISOString().split('T')[0];

    setStats(prev => {
      const dailyDist = { ...prev.dailyGuessDistribution };
      const unlimitedDist = { ...prev.unlimitedGuessDistribution };

      if (gameMode === 'daily') {
        won ? dailyDist[cluesUsed]++ : dailyDist.fail++;
      } else {
        won ? unlimitedDist[cluesUsed]++ : unlimitedDist.fail++;
      }

      const newStreak = gameMode === 'daily'
        ? (won ? prev.dailyCurrentStreak + 1 : 0)
        : prev.dailyCurrentStreak;

      return {
        ...prev,
        dailyGamesPlayed: gameMode === 'daily' ? prev.dailyGamesPlayed + 1 : prev.dailyGamesPlayed,
        dailyGamesWon: gameMode === 'daily' && won ? prev.dailyGamesWon + 1 : prev.dailyGamesWon,
        dailyCurrentStreak: newStreak,
        dailyMaxStreak: Math.max(prev.dailyMaxStreak, newStreak),
        dailyGuessDistribution: gameMode === 'daily' ? dailyDist : prev.dailyGuessDistribution,
        dailyPlayHistory: gameMode === 'daily'
          ? { ...prev.dailyPlayHistory, [today]: { won, clues: cluesUsed, time } }
          : prev.dailyPlayHistory,
        dailyTotalTime: gameMode === 'daily' ? prev.dailyTotalTime + time : prev.dailyTotalTime,
        unlimitedCompletions: gameMode === 'unlimited' ? prev.unlimitedCompletions + 1 : prev.unlimitedCompletions,
        unlimitedGuessDistribution: gameMode === 'unlimited' ? unlimitedDist : prev.unlimitedGuessDistribution,
        unlimitedTotalTime: gameMode === 'unlimited' ? prev.unlimitedTotalTime + time : prev.unlimitedTotalTime,
        overallTotalTime: prev.overallTotalTime + time,
        overallFastestTime: won && (!prev.overallFastestTime || time < prev.overallFastestTime)
          ? time
          : prev.overallFastestTime,
      };
    });

    if (gameMode === 'daily') {
      updateDailyStats({ won }).catch(() => {});
    }

    // UPDATED: Only log analytics if online
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'game_complete',
          data: {
            won,
            cluesUsed,
            time,
            mode: gameMode,
            difficulty: gameMode === 'unlimited' ? difficulty : null
          },
          userId: localStorage.getItem('userId') || 'anonymous'
        })
      }).catch(() => {});
    }

  }, [gameMode, startTime, difficulty]);

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, []);

  const getAchievements = useCallback(() => {
    const achievements = [];
    const unlimitedDist = stats.unlimitedGuessDistribution;

    if (stats.dailyCurrentStreak >= 5) achievements.push({ icon: '🔥', name: 'Daily 5 Streak', desc: 'Win 5 daily puzzles in a row' });
    if (stats.dailyCurrentStreak >= 10) achievements.push({ icon: '⚡', name: 'Daily 10 Streak', desc: 'Win 10 daily in a row' });
    if (stats.dailyGamesWon >= 10) achievements.push({ icon: '🏆', name: 'Daily Veteran', desc: 'Win 10 daily games' });
    if (stats.unlimitedCompletions >= 50) achievements.push({ icon: '♾️', name: 'Unlimited Marathoner', desc: 'Complete 50 unlimited puzzles' });
    if (unlimitedDist[1] >= 10) achievements.push({ icon: '🎯', name: 'Unlimited First-Try Pro', desc: 'Win 10 unlimited on first clue' });
    if (stats.dailyGamesWon + (stats.unlimitedCompletions - stats.unlimitedGuessDistribution.fail) >= 50) achievements.push({ icon: '👑', name: 'Master Guesser', desc: '50 total wins across modes' });
    if (stats.overallFastestTime && stats.overallFastestTime < 30) achievements.push({ icon: '⚡', name: 'Speed Demon', desc: 'Fastest win under 30s (any mode)' });

    return achievements;
  }, [stats]);

  const GuessDistChart = useCallback(({ dist, maxClues }) => (
    <>
      {Array.from({ length: maxClues }, (_, i) => {
        const clue = i + 1;
        const count = dist[clue];
        const maxCount = Math.max(...Object.values(dist));
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return (
          <div key={clue} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: '80px', color: theme.mutedColor, fontSize: '0.875rem' }}>
              {clue} clue{clue > 1 ? 's' : ''}
            </div>
            <div style={{ flex: 1, background: theme.borderColor, borderRadius: '0.5rem', height: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>
                <span style={{ color: 'white', fontWeight: '700', fontSize: '0.875rem' }}>{count}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <div style={{ width: '80px', color: theme.mutedColor, fontSize: '0.875rem' }}>Failed</div>
        <div style={{ flex: 1, background: theme.borderColor, borderRadius: '0.5rem', height: '2rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(...Object.values(dist)) > 0 ? (dist.fail / Math.max(...Object.values(dist))) * 100 : 0}%`, height: '100%', background: 'linear-gradient(135deg, #ef4444, #dc2626)', transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '0.875rem' }}>{dist.fail}</span>
          </div>
        </div>
      </div>
    </>
  ), [theme]);

  const ModeSelector = useCallback(() => (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.5rem' : '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: isMobile ? '0.75rem' : '1.5rem' }}>
      <button
        onClick={() => setGameMode('daily')}
        style={{
          padding: '0.75rem 1.5rem',
          background: gameMode === 'daily' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : theme.cardBg,
          color: gameMode === 'daily' ? 'white' : theme.textColor,
          border: `1px solid ${theme.borderColor}`,
          borderRadius: '1rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          width: isMobile ? '100%' : 'auto',
          maxWidth: isMobile ? '280px' : 'none'
        }}
        aria-label="Switch to Daily Mode"
      >
        🗓️ Daily Mode
      </button>
      <button
        onClick={() => setGameMode('unlimited')}
        style={{
          padding: '0.75rem 1.5rem',
          background: gameMode === 'unlimited' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : theme.cardBg,
          color: gameMode === 'unlimited' ? 'white' : theme.textColor,
          border: `1px solid ${theme.borderColor}`,
          borderRadius: '1rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          width: isMobile ? '100%' : 'auto',
          maxWidth: isMobile ? '280px' : 'none'
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
            background: theme.cardBg,
            color: theme.textColor,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto',
            maxWidth: isMobile ? '280px' : 'none'
          }}
          aria-label="Select Difficulty Level"
        >
          <option value="easy">😊 Easy Stocks</option>
          <option value="medium">⚖️ Medium Stocks</option>
          <option value="hard">🔥 Hard Stocks</option>
        </select>
      )}
    </div>
  ), [gameMode, difficulty, theme, isMobile]);

  if (loading || !dailyTicker || !questions.length) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.bgColor, color: theme.textColor, fontSize: '1.5rem', fontWeight: '600' }}>Loading Market Data...</div>;
  }

  const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const isWinner = submittedAnswers.some(a => a.isCorrect);
  const numClues = questions.length;

  return (
    <div style={{ minHeight: '100vh', background: theme.bgColor, color: theme.textColor, fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'all 0.3s ease' }}>
      {/* Quotron */}
      <div style={{ background: theme.bgColor, borderBottom: `1px solid ${theme.borderColor}`, padding: '0.75rem 0', overflow: 'hidden' }}>
        {quotes.length > 0 ? (
          <div style={{ display: 'flex', animation: 'scroll 30s linear infinite', gap: '2rem', whiteSpace: 'nowrap' }}>
            {[...quotes, ...quotes].map((q, i) => (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: '700', color: theme.textColor }}>{q.symbol}</span>
                <span style={{ color: theme.textColor }}>{q.current}</span>
                <span style={{ color: q.change >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700', fontFamily: 'monospace' }}>
                  {q.change >= 0 ? `+${q.change}` : q.change}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: theme.mutedColor }}>Loading market data...</div>
        )}
      </div>

      {/* Header */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <h1 style={{ fontSize: isMobile ? '2rem' : '3rem', fontWeight: '800', margin: '0', background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>TickrDaily</h1>
            <p style={{ color: theme.mutedColor, margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>{todayDate}</p>
            
            {/* Social Proof Stats - Below Date */}
            {todayStats && (
              <div style={{ 
                display: 'inline-block',
                color: theme.mutedColor, 
                fontSize: '0.875rem', 
                margin: '0.5rem 0',
                padding: '0.5rem 1rem',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '0.5rem',
                border: `1px solid rgba(34, 197, 94, 0.2)`
              }}>
                🎯 {todayStats.total_games.toLocaleString()} players today • {todayStats.win_rate}% win rate
                {todayStats.avg_time_win && ` • ${Math.floor(todayStats.avg_time_win)}s avg`}
              </div>
            )}
            
            <p style={{ color: theme.mutedColor, margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              {gameMode === 'daily' ? 'Guess the stock from 5 clues' : `Guess the stock from 5 clues (${difficulty} stocks)`}
            </p>
          </div>
        </div>

        {gameOver && gameMode === 'daily' && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: `1px solid rgba(59, 130, 246, 0.3)`, borderRadius: '1rem', padding: '1rem', marginBottom: '1.5rem', textAlign: 'center', color: theme.textColor }}>
            You already completed today's puzzle! Come back tomorrow for a new one. 🎯
          </div>
        )}

        {/* Progress Bar - Wordle Style (Hidden on Mobile) */}
        {!isMobile && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {questions.map((q, i) => {
                let barColor = theme.borderColor; // Gray = not attempted
                
                // Check if this question has been answered
                const hasAnswer = q.answers && q.answers.length > 0;
                
                if (hasAnswer) {
                  // Check if any answer was correct
                  const isCorrect = q.answers.some(a => a.isCorrect);
                  barColor = isCorrect ? '#22c55e' : '#ef4444'; // Green if correct, Red if wrong
                } else if (i === currentLevel && !gameOver) {
                  barColor = '#3b82f6'; // Blue = current question
                }
                
                return (
                  <div 
                    key={i} 
                    style={{ 
                      flex: 1, 
                      height: '0.5rem', 
                      background: barColor, 
                      borderRadius: '0.25rem', 
                      transition: 'all 0.3s ease' 
                    }}
                  ></div>
                );
              })}
            </div>
          </div>
        )}

        <ModeSelector />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1rem', marginBottom: isMobile ? '1.5rem' : '2rem', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row', width: '100%' }}>
          <button
            onClick={() => setShowStats(!showStats)}
            style={{
              padding: '0.75rem 1.75rem',
              background: theme.cardBg,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: '1rem',
              color: theme.textColor,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: isMobile ? '100%' : 'auto',
              maxWidth: isMobile ? '280px' : 'none'
            }}
            aria-label="View Statistics"
          >
            📊 Statistics
          </button>
          <button
            onClick={() => setShowHowToPlay(true)}
            style={{
              padding: '0.75rem 1.75rem',
              background: theme.cardBg,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: '1rem',
              color: theme.textColor,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: isMobile ? '100%' : 'auto',
              maxWidth: isMobile ? '280px' : 'none'
            }}
            aria-label="How to Play"
          >
            ❓ How to Play
          </button>
        </div>

        {/* Stats Modal */}
        {showStats && (
          <div onClick={() => setShowStats(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: '1.5rem', padding: '2rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', border: `1px solid ${theme.borderColor}`, paddingTop: '3rem' }}>
              <button
                onClick={() => setShowStats(false)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.2s',
                  zIndex: 999
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                aria-label="Close Statistics"
              >
                ×
              </button>

              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: '700', margin: '0' }}>📊 Your Statistics</h2>
              </div>

              {/* Mode Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setActiveModeTab('daily')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: activeModeTab === 'daily' ? '#22c55e' : theme.cardBg,
                    color: activeModeTab === 'daily' ? 'white' : theme.textColor,
                    border: `1px solid ${theme.borderColor}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  🗓️ Daily
                </button>
                <button
                  onClick={() => setActiveModeTab('unlimited')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: activeModeTab === 'unlimited' ? '#22c55e' : theme.cardBg,
                    color: activeModeTab === 'unlimited' ? 'white' : theme.textColor,
                    border: `1px solid ${theme.borderColor}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  ♾️ Unlimited
                </button>
                <button
                  onClick={() => setActiveModeTab('overall')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: activeModeTab === 'overall' ? '#22c55e' : theme.cardBg,
                    color: activeModeTab === 'overall' ? 'white' : theme.textColor,
                    border: `1px solid ${theme.borderColor}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  📊 Overall
                </button>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {activeModeTab === 'daily' && (
                  <>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyGamesPlayed}</div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Daily Played</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.dailyGamesPlayed > 0 ? Math.round((stats.dailyGamesWon / stats.dailyGamesPlayed) * 100) : 0}%
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Daily Win Rate</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyCurrentStreak}🔥</div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Daily Streak</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyMaxStreak}</div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Daily Max Streak</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.dailyGamesPlayed > 0 ? formatTime(Math.floor(stats.dailyTotalTime / stats.dailyGamesPlayed)) : '--'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Daily Avg Time</div>
                    </div>
                  </>
                )}
                {activeModeTab === 'unlimited' && (
                  <>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.unlimitedCompletions}</div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Unlimited Completed</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.unlimitedCompletions > 0 ? Math.round(((stats.unlimitedCompletions - stats.unlimitedGuessDistribution.fail) / stats.unlimitedCompletions) * 100) : 0}%
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Unlimited Win Rate</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.unlimitedCompletions > 0 ? formatTime(Math.floor(stats.unlimitedTotalTime / stats.unlimitedCompletions)) : '--'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Unlimited Avg Time</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}></div>
                  </>
                )}
                {activeModeTab === 'overall' && (
                  <>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyGamesPlayed + stats.unlimitedCompletions}</div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Total Played</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.overallFastestTime ? formatTime(stats.overallFastestTime) : '--'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Overall Fastest</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                        {stats.dailyGamesPlayed + stats.unlimitedCompletions > 0 ? formatTime(Math.floor(stats.overallTotalTime / (stats.dailyGamesPlayed + stats.unlimitedCompletions))) : '--'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>Overall Avg Time</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}></div>
                  </>
                )}
              </div>

              {/* Achievements */}
              {getAchievements().length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>🏆 Achievements (All Modes)</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {getAchievements().map((ach, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: theme.borderColor, borderRadius: '1rem' }}>
                        <div style={{ fontSize: '2rem' }}>{ach.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '700', color: theme.textColor }}>{ach.name}</div>
                          <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>{ach.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guess Distribution */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>
                  📊 Guess Distribution ({activeModeTab === 'daily' ? 'Daily' : activeModeTab === 'unlimited' ? 'Unlimited' : 'Combined'})
                </h3>
                {activeModeTab === 'daily' ? (
                  <GuessDistChart dist={stats.dailyGuessDistribution} maxClues={5} />
                ) : activeModeTab === 'unlimited' ? (
                  <GuessDistChart dist={stats.unlimitedGuessDistribution} maxClues={5} />
                ) : (
                  <GuessDistChart
                    dist={{
                      1: stats.dailyGuessDistribution[1] + stats.unlimitedGuessDistribution[1],
                      2: stats.dailyGuessDistribution[2] + stats.unlimitedGuessDistribution[2],
                      3: stats.dailyGuessDistribution[3] + stats.unlimitedGuessDistribution[3],
                      4: stats.dailyGuessDistribution[4] + stats.unlimitedGuessDistribution[4],
                      5: stats.dailyGuessDistribution[5] + stats.unlimitedGuessDistribution[5],
                      fail: stats.dailyGuessDistribution.fail + stats.unlimitedGuessDistribution.fail
                    }}
                    maxClues={5}
                  />
                )}
              </div>

              {/* Play History */}
              {activeModeTab === 'daily' && stats.dailyPlayHistory && Object.keys(stats.dailyPlayHistory).length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>📅 Daily History (Last 30 Days)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))', gap: '0.25rem' }}>
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() - (29 - i));
                      const dateStr = date.toISOString().split('T')[0];
                      const dayData = stats.dailyPlayHistory[dateStr];
                      return (
                        <div
                          key={i}
                          title={dayData ? `${dateStr}: ${dayData.won ? 'Won' : 'Lost'} in ${dayData.clues} clues` : dateStr}
                          style={{
                            aspectRatio: '1',
                            background: dayData ? (dayData.won ? '#22c55e' : '#ef4444') : theme.borderColor,
                            borderRadius: '0.25rem',
                            opacity: dayData ? 1 : 0.3
                          }}
                        ></div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: theme.mutedColor }}>
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* How to Play Modal */}
        {showHowToPlay && (
          <div onClick={() => setShowHowToPlay(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} role="dialog" aria-modal="true" aria-labelledby="how-to-play-title">
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f172a', borderRadius: '1.5rem', padding: isMobile ? '1.5rem' : '2rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', border: '1px solid rgba(255,255,255,0.1)', paddingTop: isMobile ? '3rem' : '2rem' }}>
              <button
                onClick={() => setShowHowToPlay(false)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.2s',
                  zIndex: 999
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                aria-label="Close How to Play"
              >
                ×
              </button>

              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 id="how-to-play-title" style={{ fontSize: '2rem', fontWeight: '700', margin: '0', color: '#e2e8f0' }}>❓ How to Play</h2>
              </div>

              <div style={{ color: '#e2e8f0', lineHeight: '1.6' }}>
                <p style={{ fontSize: '1.125rem', textAlign: 'center', marginBottom: '1.5rem', color: '#22c55e', fontWeight: '600' }}>
                  Guess the stock ticker in {numClues} clues or less!
                </p>

                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderLeft: '4px solid #22c55e', borderRadius: '0.5rem' }}>
                  <p style={{ margin: '0.5rem 0' }}><strong>🎯 Objective:</strong> Identify the mystery stock from progressively specific clues.</p>
                  <p style={{ margin: '0.5rem 0' }}><strong>📝 Clues:</strong> Each clue gets more specific, from broad industry hints to precise company details.</p>
                  <p style={{ margin: '0.5rem 0' }}><strong>⏱️ Strategy:</strong> The fewer clues you need, the better your score!</p>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem' }}>Example:</h3>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                    <p style={{ margin: '0.5rem 0' }}>1️⃣ "I'm a technology company..."</p>
                    <p style={{ margin: '0.5rem 0' }}>2️⃣ "I make electric vehicles..."</p>
                    <p style={{ margin: '0.5rem 0' }}>3️⃣ "My CEO is very active on social media..."</p>
                    <p style={{ margin: '0.5rem 0' }}>4️⃣ "I launched the Cybertruck in 2023..."</p>
                    <p style={{ margin: '0.5rem 0' }}>5️⃣ "I'm named after a famous inventor..."</p>
                    <p style={{ margin: '0.5rem 0', color: '#22c55e', fontWeight: '700' }}>Answer: TSLA (Tesla)</p>
                  </div>
                </div>

                <p style={{ textAlign: 'center', fontSize: '1.125rem', color: '#22c55e', fontWeight: '600' }}>
                  {gameMode === 'daily' ? 'New puzzle daily at midnight EST!' : 'Endless challenges await!'} 🌅
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Questions */}
        {questions.map((q, idx) => {
          if (idx > currentLevel) return null;
          return (
            <div key={idx} style={{ background: theme.cardBg, borderRadius: '1.5rem', padding: isMobile ? '1.5rem' : '2rem', marginBottom: '1.5rem', border: `1px solid ${theme.borderColor}`, backdropFilter: 'blur(10px)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem', color: theme.textColor }}>
                Question {q.level}: {q.question}
              </h3>

              {q.answers.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: a.isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${a.isCorrect ? '#22c55e' : '#ef4444'}`, borderRadius: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{a.isCorrect ? "✓" : "✗"}</span>
                  <span style={{ color: theme.textColor, fontWeight: '500' }}>{a.guess}</span>
                </div>
              ))}

              {currentLevel === idx && !gameOver && (
                <form onSubmit={handleSubmit} style={{ position: 'relative', marginTop: '1rem' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ex: NVDA (NVIDIA)"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    title="Press Enter to submit"
                    aria-label="Enter your stock guess"
                    style={{
                      width: '100%',
                      padding: '1rem 1.25rem',
                      borderRadius: '1rem',
                      border: '2px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      outline: 'none',
                      fontWeight: '500',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                  />

                  {availableOptions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.5rem', background: theme.cardBg, border: `1px solid ${theme.borderColor}`, borderRadius: '1rem', overflow: 'hidden', zIndex: 100, maxHeight: '300px', overflowY: 'auto' }}>
                      {availableOptions.map((opt, i) => (
                        <div
                          key={i}
                          onClick={() => handleOptionClick(opt)}
                          style={{
                            padding: '1rem 1.25rem',
                            cursor: 'pointer',
                            borderBottom: i < availableOptions.length - 1 ? `1px solid ${theme.borderColor}` : 'none',
                            background: 'transparent',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: '700', color: theme.textColor }}>{opt.symbol}</div>
                          <div style={{ fontSize: '0.875rem', color: theme.mutedColor }}>{opt.company}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!input.trim()}
                    style={{
                      width: '100%',
                      marginTop: '1rem',
                      padding: '1rem 2rem',
                      background: input.trim() ? 'linear-gradient(135deg, #22c55e, #16a34a)' : theme.borderColor,
                      color: 'white',
                      border: 'none',
                      borderRadius: '1rem',
                      fontSize: '1.125rem',
                      fontWeight: '700',
                      cursor: input.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.3s ease',
                      boxShadow: input.trim() ? '0 10px 25px -5px rgba(34, 197, 94, 0.4)' : 'none',
                      transform: shake ? 'translateX(-10px)' : 'translateY(0)',
                      animation: shake ? 'shake 0.5s' : 'none'
                    }}
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
          );
        })}

        {/* Game Over */}
        {gameOver && (
          <div style={{ background: theme.cardBg, borderRadius: '1.5rem', padding: '2rem', marginBottom: '2rem', border: `1px solid ${theme.borderColor}`, textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{isWinner ? '🎉' : '😔'}</div>
            <h2 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '1rem', color: theme.textColor }}>
              {isWinner ? 'Congratulations!' : 'Game Over'}
            </h2>
            <p style={{ fontSize: '1.125rem', color: theme.mutedColor, marginBottom: '1.5rem' }}>The Answer Was</p>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#22c55e', marginBottom: '0.5rem' }}>{dailyTicker.ticker}</div>
            <div style={{ fontSize: '1.25rem', color: theme.mutedColor, marginBottom: '2rem' }}>{dailyTicker.company}</div>
            <p style={{ fontSize: '1rem', color: theme.mutedColor, marginBottom: '2rem' }}>
              {gameMode === 'daily' ? 'Come back tomorrow for a new challenge!' : 'Keep going!'}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={shareResults}
                style={{
                  padding: '1rem 2rem',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '1rem',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)'
                }}
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
                  padding: '1rem 2rem',
                  background: 'linear-gradient(135deg, #1da1f2, #0d8bd9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '1rem',
                  fontSize: '1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 10px 25px -5px rgba(29, 161, 242, 0.4)'
                }}
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
                    padding: '1rem 2rem',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '1rem',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)'
                  }}
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
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        
        /* Hide scrollbar but keep functionality */
        *::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        *::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.3);
          border-radius: 10px;
        }
        *::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 10px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
        
        /* Firefox scrollbar */
        * {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.3) rgba(15, 23, 42, 0.3);
        }
      `}</style>
    </div>
  );
}

export default App;
