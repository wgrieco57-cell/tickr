import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, increment, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";

const FINNHUB_API_KEY = "d4g9o8pr01qm5b34j8l0d4g9o8pr01qm5b34j8lg";
const QUOTRON_TICKERS = [
  "^GSPC", "^DJI", "^IXIC",
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA",
  "BRK.B", "JPM", "JNJ", "V", "PG", "DIS", "MA", "HD", "UNH", "BAC"
];
const FALLBACK_QUOTES = [
  { symbol: "AAPL", current: "150.00", change: "1.50" },
  { symbol: "TSLA", current: "250.00", change: "-2.00" },
  { symbol: "GOOGL", current: "140.00", change: "0.75" },
  { symbol: "MSFT", current: "320.00", change: "3.20" },
  { symbol: "^GSPC", current: "4500.00", change: "25.00" },
  { symbol: "NVDA", current: "120.00", change: "-1.50" },
  { symbol: "AMZN", current: "100.00", change: "0.50" },
  { symbol: "META", current: "300.00", change: "2.00" },
  { symbol: "^DJI", current: "35000.00", change: "100.00" },
  { symbol: "^IXIC", current: "15000.00", change: "50.00" }
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
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

async function updateDailyStats({ won = false }) {
  const today = new Date().toISOString().split("T")[0];
  const docRef = doc(db, "analytics", `daily_${today}`);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, {
        gamesPlayed: increment(1),
        gamesWon: won ? increment(1) : increment(0),
      });
    } else {
      await setDoc(docRef, { date: today, gamesPlayed: 1, gamesWon: won ? 1 : 0 });
    }
  } catch (err) {
    console.error("Error updating daily stats:", err);
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let s = hashCode(seed.toString());
  return function () {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
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
  const [activeModeTab, setActiveModeTab] = useState("daily");
  const [stats, setStats] = useState({
    dailyGamesPlayed: 0,
    dailyGamesWon: 0,
    dailyCurrentStreak: 0,
    dailyMaxStreak: 0,
    dailyGuessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 },
    dailyPlayHistory: {},
    dailyTotalTime: 0,
    unlimitedCompletions: 0,
    unlimitedGuessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 },
    unlimitedTotalTime: 0,
    overallFastestTime: null,
    overallTotalTime: 0,
    achievements: []
  });
  const [gameMode, setGameMode] = useState("daily");
  const [difficulty, setDifficulty] = useState("medium");
  const [puzzleSeed, setPuzzleSeed] = useState(0);
  const inputRef = useRef(null);

  const bgColor = darkMode
    ? "linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)"
    : "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%)";
  const textColor = darkMode ? "#e2e8f0" : "#1e293b";
  const mutedColor = darkMode ? "#94a3b8" : "#64748b";
  const cardBg = darkMode ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.8)";
  const borderColor = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  useEffect(() => {
    const saved = localStorage.getItem("tickrDailyStats");
    if (saved) {
      try { setStats(JSON.parse(saved)); } catch (e) { localStorage.removeItem("tickrDailyStats"); }
    }
    const savedDark = localStorage.getItem("tickrDailyDarkMode");
    if (savedDark !== null) setDarkMode(JSON.parse(savedDark));
    if (!localStorage.getItem("tickrDailyVisited")) {
      setShowHowToPlay(true);
      localStorage.setItem("tickrDailyVisited", "true");
    }
    signInAnonymously(auth);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test") === "true") setTestMode(true);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "T") setTestMode(prev => !prev);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!testMode) localStorage.setItem("tickrDailyStats", JSON.stringify(stats));
  }, [stats, testMode]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter" && !gameOver && input.trim()) handleSubmit();
      if (e.key.toLowerCase() === "n" && gameOver && gameMode === "unlimited") nextPuzzle();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [input, gameOver, gameMode]);

  useEffect(() => {
    Promise.all([
      fetch("/data.json").then(r => r.json()),
      fetch("/tickers.json").then(r => r.json())
    ])
      .then(([dataFile, tickersFile]) => {
        const tickersData = dataFile.tickers || dataFile;
        const formatted = tickersFile.map(t => ({
          symbol: t.symbol,
          company: t.company,
          formatted: `${t.symbol} (${t.company})`
        }));
        setData(tickersData);
        setAllTickers(formatted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data.length) return;

    const today = new Date().toDateString();
    let selected, pickedQuestions = [];

    const sortedData = [...data].sort((a, b) => a.ticker.localeCompare(b.ticker));

    if (gameMode === "daily" && !testMode) {
      const rnd = createSeededRandom(today);
      const idx = Math.floor(rnd() * sortedData.length);
      selected = sortedData[idx];
      for (let i = 1; i <= 5; i++) {
        const qs = selected.questions?.[`level_${i}`];
        if (qs?.length) {
          pickedQuestions.push({
            level: i,
            question: qs[Math.floor(rnd() * qs.length)],
            correct: selected.ticker,
            answers: []
          });
        }
      }
      localStorage.setItem("dailyDate", today);
    } else {
      const idx = Math.floor(Math.random() * sortedData.length);
      selected = sortedData[idx];
      const max = difficulty === "hard" ? 3 : difficulty === "medium" ? 5 : 6;
      for (let i = 1; i <= max; i++) {
        const qs = selected.questions?.[`level_${i}`];
        if (qs?.length) {
          pickedQuestions.push({
            level: i,
            question: qs[Math.floor(Math.random() * qs.length)],
            correct: selected.ticker,
            answers: []
          });
        }
      }
      if (difficulty-close === "easy" && pickedQuestions.length >= 5 && selected.questions.level_5) {
        const bonus = selected.questions.level_5[Math.floor(Math.random() * selected.questions.level_5.length)];
        pickedQuestions.push({ level: 6, question: bonus, correct: selected.ticker, answers: [] });
      }
    }

    setDailyTicker(selected);
    setQuestions(pickedQuestions);

    if (gameMode === "daily" && !testMode) {
      const saved = localStorage.getItem("dailyProgress");
      if (saved) {
        const progress = JSON.parse(saved);
        const savedDate = new Date(progress.startTime).toDateString();
        if (savedDate === today) {
          setCurrentLevel(progress.currentLevel);
          setSubmittedAnswers(progress.submittedAnswers);
          setGameOver(progress.gameOver);
          setStartTime(progress.startTime);
          const qCopy = [...pickedQuestions];
          progress.submittedAnswers.forEach(a => {
            if (qCopy[a.level - 1]) qCopy[a.level - 1].answers.push({ guess: a.guess, isCorrect: a.isCorrect });
          });
          setQuestions(qCopy);
          return;
        }
      }
    }
    setStartTime(Date.now());
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setGameOver(false);
    setInput("");
  }, [data, gameMode, difficulty, puzzleSeed, testMode]);

  useEffect(() => {
    if (!input) {
      setAvailableOptions([]);
      return;
    }
    const guessed = submittedAnswers.map(a => a.guess.split(" (")[0].toLowerCase());
    const filtered = allTickers
      .filter(t => {
        const matches = t.symbol.toLowerCase().includes(input.toLowerCase()) ||
                        t.company.toLowerCase().includes(input.toLowerCase());
        return matches && !guessed.includes(t.symbol.toLowerCase());
      })
      .sort((a, b) => {
        if (a.symbol.toLowerCase() === input.toLowerCase()) return -1;
        if (b.symbol.toLowerCase() === input.toLowerCase()) return 1;
        return 0;
      })
      .slice(0, 8);
    setAvailableOptions(filtered);
  }, [input, allTickers, submittedAnswers]);

  useEffect(() => {
    if (gameMode !== "daily" || testMode || !startTime) return;
    const today = new Date(startTime).toDateString();
    const savedDate = localStorage.getItem("dailyDate");
    if (savedDate === today) {
      localStorage.setItem("dailyProgress", JSON.stringify({
        currentLevel, submittedAnswers, gameOver, startTime
      }));
    }
  }, [currentLevel, submittedAnswers, gameOver, startTime, gameMode, testMode]);

  useEffect(() => {
    if (shake) setTimeout(() => setShake(false), 600);
  }, [shake]);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const results = await Promise.all(
          QUOTRON_TICKERS.map(async (s) => {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_API_KEY}`);
            const j = await r.json();
            if (j?.c) return { symbol: s, current: j.c.toFixed(2), change: (j.c - j.pc).toFixed(2) };
          })
        );
        setQuotes(results.filter(Boolean).length ? results.filter(Boolean) : FALLBACK_QUOTES);
      } catch {
        setQuotes(FALLBACK_QUOTES);
      }
    };
    fetchQuotes();
    const i = setInterval(fetchQuotes, 60000);
    return () => clearInterval(i);
  }, []);

  const handleSubmit = () => {
    if (gameOver || !input.trim()) return;

    const guess = input.trim().toUpperCase();
    const matched = allTickers.find(t => t.symbol === guess.split(" ")[0]);
    const displayGuess = matched ? matched.formatted : guess;

    const alreadyGuessed = submittedAnswers.some(a => a.guess.split(" (")[0] === (matched?.symbol || guess.split(" ")[0]));
    if (alreadyGuessed) {
      setShake(true);
      setInput("");
      setAvailableOptions([]);
      return;
    }

    const isCorrect = matched?.symbol === questions[currentLevel].correct;

    const updatedQuestions = [...questions];
    updatedQuestions[currentLevel].answers.push({ guess: displayGuess, isCorrect });
    setQuestions(updatedQuestions);

    setSubmittedAnswers(prev => [...prev, { level: currentLevel + 1, guess: displayGuess, isCorrect }]);
    setInput("");
    setAvailableOptions([]);

    if (isCorrect || currentLevel === questions.length - 1) {
      setGameOver(true);
      const time = Math.floor((Date.now() - startTime) / 1000);
      if (isCorrect) confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
      updateStats(isCorrect, currentLevel + 1, time);
      if (gameMode === "daily") updateDailyStats({ won: isCorrect });
    } else {
      setCurrentLevel(prev => prev + 1);
    }
  };

  const updateStats = (won, cluesUsed, time) => {
    if (testMode) return;
    setStats(prev => {
      const distKey = gameMode === "daily" ? "dailyGuessDistribution" : "unlimitedGuessDistribution";
      const dist = { ...prev[distKey] };
      won ? dist[cluesUsed]++ : dist.fail++;

      const newStreak = gameMode === "daily" && won ? prev.dailyCurrentStreak + 1 : gameMode === "daily" ? 0 : prev.dailyCurrentStreak;

      return {
        ...prev,
        dailyGamesPlayed: gameMode === "daily" ? prev.dailyGamesPlayed + 1 : prev.dailyGamesPlayed,
        dailyGamesWon: gameMode === "daily" && won ? prev.dailyGamesWon + 1 : prev.dailyGamesWon,
        dailyCurrentStreak: newStreak,
        dailyMaxStreak: Math.max(prev.dailyMaxStreak, newStreak),
        [distKey]: dist,
        dailyTotalTime: gameMode === "daily" ? prev.dailyTotalTime + time : prev.dailyTotalTime,
        unlimitedCompletions: gameMode === "unlimited" && won ? prev.unlimitedCompletions + 1 : prev.unlimitedCompletions,
        unlimitedTotalTime: gameMode === "unlimited" ? prev.unlimitedTotalTime + time : prev.unlimitedTotalTime,
        overallFastestTime: won && (!prev.overallFastestTime || time < prev.overallFastestTime) ? time : prev.overallFastestTime,
        overallTotalTime: prev.overallTotalTime + time
      };
    });
  };

  const nextPuzzle = () => {
    setPuzzleSeed(prev => prev + 1);
    setGameOver(false);
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setInput("");
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? "0" : ""}${s}s`;
  };

  const shareResults = () => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? "Correct" : "Incorrect").join("");
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.findIndex(a => a.isCorrect) + 1 : questions.length;
    const text = `TickrDaily ${new Date().toLocaleDateString()}\n${emoji} (${cluesUsed}/${questions.length})\nPlay: ${window.location.origin}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => navigator.clipboard.writeText(text));
    } else {
      navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    }
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem("tickrDailyDarkMode", JSON.stringify(newMode));
  };

  if (loading || !dailyTicker || !questions.length) {
    return (
      <div style={{ minHeight: "100dvh", background: bgColor, color: textColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading Market Data...
      </div>
    );
  }

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const wonGame = submittedAnswers.some(a => a.isCorrect);

  return (
    <div style={{ minHeight: "100dvh", background: bgColor, color: textColor, padding: "max(2rem, env(safe-area-inset-top)) 1rem max(2.5rem, env(safe-area-inset-bottom)) 1rem", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Quotron Ticker */}
      <div style={{ width: "100%", overflow: "hidden", whiteSpace: "nowrap", marginBottom: "1.5rem", background: "rgba(0,0,0,0.3)", borderRadius: "1rem", padding: "0.6rem 0" }}>
        <div style={{ display: "inline-block", animation: "scroll 120s linear infinite" }}>
          {[...quotes, ...quotes].map((q, i) => (
            <span key={i} style={{ marginRight: "3rem", color: q.change >= 0 ? "#22c55e" : "#ef4444", fontWeight: "700", fontFamily: "monospace" }}>
              {q.symbol} {q.current} {q.change >= 0 ? `+${q.change}` : q.change}
            </span>
          ))}
        </div>
      </div>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem", position: "relative" }}>
        <button onClick={toggleDarkMode} style={{ position: "absolute", right: 0, top: 0, background: cardBg, border: `1px solid ${borderColor}`, borderRadius: "1rem", padding: "0.5rem", color: textColor }}>
          {darkMode ? "Light Mode" : "Dark Mode"}
        </button>
        {testMode && <div style={{ position: "absolute", left: 0, top: 0, background: "#f59e0b", color: "white", padding: "0.5rem 1rem", borderRadius: "1rem", fontWeight: 700 }}>TEST MODE</div>}
        <h1 style={{ fontSize: "4rem", fontWeight: 800, background: "linear-gradient(135deg,#22c55e,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 0.5rem" }}>
          TickrDaily
        </h1>
        <p style={{ color: mutedColor, margin: "0 0 0.5rem" }}>{todayStr}</p>
        <p style={{ color: mutedColor }}>
          {gameMode === "daily" ? "5 clues" : `${difficulty} • ${questions.length} clues`}
        </p>
      </div>

      {/* Mode Selector */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
        <button onClick={() => setGameMode("daily")} style={{ padding: "0.75rem 1.5rem", background: gameMode === "daily" ? "#22c55e" : cardBg, color: "white", borderRadius: "1rem", fontWeight: 600 }}>Daily Mode</button>
        <button onClick={() => setGameMode("unlimited")} style={{ padding: "0.75rem 1.5rem", background: gameMode === "unlimited" ? "#22c55e" : cardBg, color: "white", borderRadius: "1rem", fontWeight: 600 }}>Unlimited Mode</button>
        {gameMode === "unlimited" && (
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={{ padding: "0.75rem", background: cardBg, color: textColor, borderRadius: "1rem" }}>
            <option value="easy">Easy (6)</option>
            <option value="medium">Medium (5)</option>
            <option value="hard">Hard (3)</option>
          </select>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "2rem" }}>
        <button onClick={() => setShowStats(true)} style={{ padding: "0.9rem 1.8rem", background: cardBg, border: `1px solid ${borderColor}`, borderRadius: "1rem", color: textColor, fontWeight: 600 }}>Statistics</button>
        <button onClick={() => setShowHowToPlay(true)} style={{ padding: "0.9rem 1.8rem", background: cardBg, border: `1px solid ${borderColor}`, borderRadius: "1rem", color: textColor, fontWeight: 600 }}>How to Play</button>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1rem" }} onClick={() => setShowStats(false)}>
          <div style={{ background: "linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))", borderRadius: "2rem", padding: "2.5rem", maxWidth: "700px", width: "100%", position: "relative", maxHeight: "90dvh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowStats(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#94a3b8", fontSize: "3rem", fontWeight: "300", cursor: "pointer" }}>×</button>
            <h2 style={{ fontSize: "2.2rem", fontWeight: 800, textAlign: "center", margin: "0 0 2rem" }}>Your Statistics</h2>
            {/* Tabs, Grid, Distribution — same as your final version */}
            {/* ... (your full stats modal content here - already perfect) */}
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "1rem" }} onClick={() => setShowHowToPlay(false)}>
          <div style={{ background: "linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))", borderRadius: "2rem", padding: "2.5rem", maxWidth: "600px", width: "100%", position: "relative", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowHowToPlay(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#94a3b8", fontSize: "3rem", fontWeight: "300", cursor: "pointer" }}>×</button>
            <h2 style={{ fontSize: "2.2rem", fontWeight: 800, textAlign: "center", margin: "0 0 1.5rem" }}>How to Play</h2>
            <div style={{ lineHeight: "1.7", fontSize: "1.1rem" }}>
              <p>Guess the mystery stock using as few clues as possible.</p>
              <p>Each clue gets more revealing. You get up to 5 guesses (6 in unlimited mode).</p>
              <p style={{ margin: "1.5rem 0" }}>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>Green</span> = Correct stock<br/>
                <span style={{ color: "#ef4444", fontWeight: 700 }}>Red</span> = Wrong
              </p>
              <p>New puzzle every day at midnight. Share your score when you win!</p>
            </div>
          </div>
        </div>
      )}

      {/* Game Content */}
      <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%" }}>
        {questions.map((q, i) => i <= currentLevel && (
          <div key={i} style={{ marginBottom: "2rem" }}>
            <div style={{ background: cardBg, borderRadius: "1.5rem", padding: "2rem", border: `1px solid ${borderColor}` }}>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>Clue {q.level}: {q.question}</p>
              {q.answers.map((a, j) => (
                <div key={j} style={{ padding: "0.75rem", margin: "0.5rem 0", background: a.isCorrect ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", borderRadius: "0.75rem", color: a.isCorrect ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {a.guess}
                </div>
              ))}
              {i === currentLevel && !gameOver && (
                <div style={{ marginTop: "1rem" }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    placeholder="Type ticker or company name..."
                    style={{ width: "100%", padding: "1rem", borderRadius: "1rem", border: "2px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "white", fontSize: "1.1rem" }}
                  />
                  {availableOptions.length > 0 && (
                    <div style={{ marginTop: "0.5rem", background: cardBg, borderRadius: "1rem", overflow: "hidden" }}>
                      {availableOptions.map(opt => (
                        <div key={opt.symbol} onClick={() => { setInput(opt.formatted); setAvailableOptions([]); }} style={{ padding: "0.75rem 1rem", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                          {opt.formatted}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {gameOver && (
          <div style={{ textAlign: "center", padding: "3rem", background: cardBg, borderRadius: "2rem", border: `1px solid ${borderColor}` }}>
            <h2 style={{ fontSize: "3rem" }}>{wonGame ? "Correct!" : "Incorrect"}</h2>
            <p style={{ fontSize: "2rem", fontWeight: 800, color: "#22c55e" }}>{dailyTicker.ticker} ({dailyTicker.company})</p>
            <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button onClick={shareResults} style={{ padding: "1rem 2rem", background: "#3b82f6", color: "white", borderRadius: "1rem", fontWeight: 700 }}>Share</button>
              {gameMode === "unlimited" && <button onClick={nextPuzzle} style={{ padding: "1rem 2rem", background: "#22c55e", color: "white", borderRadius: "1rem", fontWeight: 700 }}>Next →</button>}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

export default App;
