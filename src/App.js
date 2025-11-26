import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { debounce } from 'lodash'; // npm install lodash
import confetti from 'canvas-confetti'; // npm install canvas-confetti required
import { initializeApp } from "firebase/app";
import { getFirestore, doc, increment, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";
const FINNHUB_API_KEY = "d4g9o8pr01qm5b34j8l0d4g9o8pr01qm5b34j8lg"; // Hardcoded as requested (note: for local/dev only—expose risk in prod)
const QUOTRON_TICKERS = [
  '^GSPC','^DJI','^IXIC', // Major indexes
  'AAPL','MSFT','GOOGL','AMZN','META','TSLA','NVDA', // MAG7
  'BRK.B','JPM','JNJ','V','PG','DIS','MA','HD','UNH','BAC' // 10 more
];
// Fallback quotes for API errors
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
const db = getFirestore();
const analytics = getAnalytics(app);
// Extracted helper functions
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
async function updateDailyStats({ won = false }) {
  const today = new Date().toISOString().split("T")[0];
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
// CSS Styles (extracted)
const styles = {
  app: { minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem' },
  header: { textAlign: 'center', marginBottom: '1rem', position: 'relative', width: '100%' },
  title: { fontSize: '4rem', fontWeight: '800', background: 'linear-gradient(135deg,#22c55e 0%,#3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem', letterSpacing: '-0.02em' },
  date: { color: '#94a3b8', fontSize: '1rem', fontWeight: '500', letterSpacing: '0.05em' },
  description: { color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' },
  progressBar: { width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', margin: '1rem 0', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #22c55e, #3b82f6)', transition: 'width 0.3s ease' },
  card: { background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(20px)', borderRadius: '1.5rem', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)', width: '100%', marginBottom: '2rem' },
  question: { fontWeight: '700', fontSize: '1.25rem', marginBottom: '1rem', color: '#f1f5f9' },
  answer: { padding: '0.75rem 1.25rem', marginBottom: '0.5rem', borderRadius: '0.75rem', fontWeight: '600', fontFamily: 'monospace', fontSize: '1rem' },
  correctAnswer: { background: 'rgba(34,197,94,0.2)', color: '#22c55e' },
  incorrectAnswer: { background: 'rgba(239,68,68,0.2)', color: '#ef4444' },
  input: { width: '100%', padding: '1rem 1.25rem', borderRadius: '1rem', border: '2px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none', fontWeight: '500', fontSize: '1rem', boxSizing: 'border-box' },
  submitBtn: { marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', borderRadius: '0.75rem', border: 'none', fontWeight: '700', fontSize: '0.875rem', color: 'white', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)' },
  shake: { animation: 'shake 0.5s ease-in-out' },
  gameOver: { textAlign: 'center', marginTop: '2rem', background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(20px)', padding: '3rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)', width: '100%' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', overflowY: 'auto' },
  modalContent: { background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))', backdropFilter: 'blur(20px)', borderRadius: '2rem', padding: '2.5rem', maxWidth: '700px', width: '100%', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' },
  closeButton: { position: 'fixed', top: '1rem', right: '1rem', background: 'rgba(15,23,42,0.7)', border: 'none', color: '#e2e8f0', fontSize: '1.5rem', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 101, transition: 'all 0.3s ease' },
  modeSelector: { display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center', flexWrap: 'wrap' },
  statsButtons: { display: 'flex', gap: '1rem', marginBottom: '2rem' },
  button: { padding: '0.75rem 1.75rem', background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#e2e8f0', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  shareButton: { padding: '1rem 2rem', borderRadius: '1rem', fontWeight: '700', fontSize: '1rem', color: 'white', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)' },
  quotron: { width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem 0', borderRadius: '1rem', background: 'rgba(15,23,42,0.8)', display: 'flex', flexDirection: 'row', willChange: 'transform' },
  option: { padding: '1rem 1.25rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.1)', transition: 'background 0.2s ease' },
  // Add more as needed...
};
// Inlined StatsModal component
const StatsModal = ({ stats, activeModeTab, setActiveModeTab, themeStyles, formatTime, achievements, onClose, winRate, unlimitedWinRate }) => {
  const maxCount = useMemo(() => Math.max(...Object.values(stats.dailyGuessDistribution).filter(v => typeof v === 'number')), [stats.dailyGuessDistribution]);
  const GuessDistChart = ({ dist, maxClues }) => (
    <>
      {Array.from({ length: maxClues }, (_, i) => {
        const clue = i + 1;
        const count = dist[clue] || 0;
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return (
          <div key={clue} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ width: '60px', color: themeStyles.mutedColor, fontSize: '0.875rem', fontWeight: '600' }}>
              {clue} clue{clue > 1 ? 's' : ''}
            </div>
            <div style={{ flex: 1, background: themeStyles.cardBg, height: '32px', borderRadius: '0.5rem', overflow: 'hidden', position: 'relative', border: `1px solid ${themeStyles.borderColor}` }}>
              <div style={{
                width: `${Math.max(percentage, 5)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                transition: 'width 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '0.5rem'
              }}>
                <span style={{ color: 'white', fontWeight: '700', fontSize: '0.875rem' }}>{count}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ width: '60px', color: themeStyles.mutedColor, fontSize: '0.875rem', fontWeight: '600' }}>Failed</div>
        <div style={{ flex: 1, background: themeStyles.cardBg, height: '32px', borderRadius: '0.5rem', overflow: 'hidden', position: 'relative', border: `1px solid ${themeStyles.borderColor}` }}>
          <div style={{
            width: `${Math.max((dist.fail / maxCount) * 100, 5)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ef4444, #dc2626)',
            transition: 'width 0.5s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '0.5rem'
          }}>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '0.875rem' }}>{dist.fail}</span>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div style={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Statistics Modal">
      <button onClick={onClose} style={styles.closeButton} aria-label="Close Statistics Modal">×</button>
      <div style={{ ...styles.modalContent, background: themeStyles.textColor === '#e2e8f0' ? 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))' : styles.modalContent.background }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '2rem', fontWeight: '800', color: themeStyles.textColor, marginBottom: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Your Statistics
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
          <button onClick={() => setActiveModeTab('daily')} style={{ padding: '0.5rem 1rem', background: activeModeTab === 'daily' ? '#22c55e' : themeStyles.cardBg, color: activeModeTab === 'daily' ? 'white' : themeStyles.textColor, border: `1px solid ${themeStyles.borderColor}`, borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>🗓️ Daily</button>
          <button onClick={() => setActiveModeTab('unlimited')} style={{ padding: '0.5rem 1rem', background: activeModeTab === 'unlimited' ? '#22c55e' : themeStyles.cardBg, color: activeModeTab === 'unlimited' ? 'white' : themeStyles.textColor, border: `1px solid ${themeStyles.borderColor}`, borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>♾️ Unlimited</button>
          <button onClick={() => setActiveModeTab('overall')} style={{ padding: '0.5rem 1rem', background: activeModeTab === 'overall' ? '#22c55e' : themeStyles.cardBg, color: activeModeTab === 'overall' ? 'white' : themeStyles.textColor, border: `1px solid ${themeStyles.borderColor}`, borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>📊 Overall</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {activeModeTab === 'daily' && (
            <>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyGamesPlayed}</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Daily Played</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>{winRate}%</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Daily Win Rate</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>{stats.dailyCurrentStreak}🔥</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Daily Streak</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#a855f7' }}>{stats.dailyMaxStreak}</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Daily Max Streak</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ec4899' }}>
                  {stats.dailyGamesPlayed > 0 ? formatTime(Math.floor(stats.dailyTotalTime / stats.dailyGamesPlayed)) : '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Daily Avg Time</div>
              </div>
            </>
          )}
          {activeModeTab === 'unlimited' && (
            <>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.unlimitedCompletions}</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Unlimited Completed</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>{unlimitedWinRate}%</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Unlimited Win Rate</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ec4899' }}>
                  {stats.unlimitedCompletions > 0 ? formatTime(Math.floor(stats.unlimitedTotalTime / stats.unlimitedCompletions)) : '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Unlimited Avg Time</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }} />
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }} />
            </>
          )}
          {activeModeTab === 'overall' && (
            <>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>{stats.dailyGamesPlayed + stats.unlimitedCompletions}</div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Total Played</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6' }}>
                  {stats.overallFastestTime ? formatTime(stats.overallFastestTime) : '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Overall Fastest</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b' }}>
                  {stats.dailyGamesPlayed + stats.unlimitedCompletions > 0 ? formatTime(Math.floor(stats.overallTotalTime / (stats.dailyGamesPlayed + stats.unlimitedCompletions))) : '--'}
                </div>
                <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor, marginTop: '0.25rem' }}>Overall Avg Time</div>
              </div>
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }} />
              <div style={{ textAlign: 'center', background: themeStyles.cardBg, padding: '1.5rem 1rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }} />
            </>
          )}
        </div>
        {achievements.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: themeStyles.textColor, marginBottom: '1rem' }}>🏆 Achievements (All Modes)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {achievements.map((ach, i) => (
                <div key={i} style={{ background: themeStyles.cardBg, padding: '1rem', borderRadius: '0.75rem', border: `1px solid ${themeStyles.borderColor}`, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{ach.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: themeStyles.textColor }}>{ach.name}</div>
                    <div style={{ fontSize: '0.75rem', color: themeStyles.mutedColor }}>{ach.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: themeStyles.textColor, marginBottom: '1rem' }}>
            Guess Distribution ({activeModeTab === 'daily' ? 'Daily' : activeModeTab === 'unlimited' ? 'Unlimited' : 'Combined'})
          </h3>
          {activeModeTab === 'daily' ? (
            <GuessDistChart dist={stats.dailyGuessDistribution} maxClues={5} />
          ) : activeModeTab === 'unlimited' ? (
            <GuessDistChart dist={stats.unlimitedGuessDistribution} maxClues={6} />
          ) : (
            <GuessDistChart dist={{ ...stats.dailyGuessDistribution, ...stats.unlimitedGuessDistribution, 6: (stats.unlimitedGuessDistribution[6] || 0) }} maxClues={6} />
          )}
        </div>
        {activeModeTab === 'daily' && stats.dailyPlayHistory && Object.keys(stats.dailyPlayHistory).length > 0 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: themeStyles.textColor, marginBottom: '1rem' }}>📅 Daily History (Last 30 Days)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
              {Array.from({ length: 30 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (29 - i));
                const dateStr = date.toISOString().split('T')[0];
                const dayData = stats.dailyPlayHistory[dateStr];
                return (
                  <div
                    key={i}
                    title={dateStr + (dayData ? ` - ${dayData.won ? 'Won' : 'Lost'} in ${dayData.clues} clues` : '')}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '0.25rem',
                      background: dayData ? (dayData.won ? '#22c55e' : '#ef4444') : themeStyles.cardBg,
                      border: `1px solid ${themeStyles.borderColor}`,
                      cursor: 'pointer'
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: themeStyles.mutedColor }}>
              <span>30 days ago</span>
              <span>Today</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
// Inlined HowToPlayModal component
const HowToPlayModal = ({ numClues, gameMode, themeStyles, onClose }) => (
  <div style={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="How to Play Modal">
    <button onClick={onClose} style={styles.closeButton} aria-label="Close How to Play Modal">×</button>
    <div style={{ ...styles.modalContent, background: themeStyles.textColor === '#e2e8f0' ? 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))' : styles.modalContent.background }} onClick={(e) => e.stopPropagation()}>
      <h2 style={{ fontSize: '2rem', fontWeight: '800', color: themeStyles.textColor, marginBottom: '1.5rem', textAlign: 'center' }}>❓ How to Play</h2>
      <div style={{ color: themeStyles.textColor, lineHeight: '1.8', fontSize: '1rem' }}>
        <p style={{ marginBottom: '1rem', fontWeight: '600', fontSize: '1.125rem' }}>Guess the stock ticker in {numClues} clues or less!</p>
        <div style={{ background: themeStyles.cardBg, padding: '1.5rem', borderRadius: '1rem', marginBottom: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
          <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: '#22c55e' }}>🎯 Objective:</strong> Identify the mystery stock from progressively specific clues.</p>
          <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: '#3b82f6' }}>📝 Clues:</strong> Each clue gets more specific, from broad industry hints to precise company details.</p>
          <p><strong style={{ color: '#f59e0b' }}>⏱️ Strategy:</strong> The fewer clues you need, the better your score!</p>
        </div>
        <div style={{ background: themeStyles.cardBg, padding: '1.5rem', borderRadius: '1rem', border: `1px solid ${themeStyles.borderColor}` }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.75rem' }}>Example:</h3>
          <div style={{ fontSize: '0.875rem', color: themeStyles.mutedColor, lineHeight: '1.6' }}>
            <p>1️⃣ "I'm a technology company..."</p>
            <p>2️⃣ "I make electric vehicles..."</p>
            <p>3️⃣ "My CEO is very active on social media..."</p>
            <p>4️⃣ "I launched the Cybertruck in 2023..."</p>
            <p>5️⃣ "I'm named after a famous inventor..."</p>
            <p style={{ marginTop: '0.75rem', color: '#22c55e', fontWeight: '600' }}>Answer: TSLA (Tesla)</p>
          </div>
        </div>
        <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: themeStyles.mutedColor }}>
          {gameMode === 'daily' ? 'New puzzle daily at midnight EST!' : 'Endless challenges await!'} 🌅
        </p>
      </div>
    </div>
  </div>
);
function App() {
  const [data, setData] = useState([]);
  const [allTickers, setAllTickers] = useState([]);
  const [dailyTicker, setDailyTicker] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [input, setInput] = useState("");
  const [debouncedInput, setDebouncedInput] = useState("");
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
  const [activeModeTab, setActiveModeTab] = useState('daily');
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
    achievements: [],
  });
  const [gameMode, setGameMode] = useState('daily');
  const [difficulty, setDifficulty] = useState('medium');
  const [puzzleSeed, setPuzzleSeed] = useState(0);
  const inputRef = useRef(null);
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, []);
  const getAchievements = useCallback((stats) => {
    const achievements = [];
    const dailyDist = stats.dailyGuessDistribution;
    const unlimitedDist = stats.unlimitedGuessDistribution;
    if (stats.dailyCurrentStreak >= 5) achievements.push({ icon: '🔥', name: 'Daily 5 Streak', desc: 'Win 5 daily puzzles in a row' });
    if (stats.dailyCurrentStreak >= 10) achievements.push({ icon: '⚡', name: 'Daily 10 Streak', desc: 'Win 10 daily in a row' });
    if (stats.dailyGamesWon >= 10) achievements.push({ icon: '🏆', name: 'Daily Veteran', desc: 'Win 10 daily games' });
    if (stats.unlimitedCompletions >= 50) achievements.push({ icon: '♾️', name: 'Unlimited Marathoner', desc: 'Complete 50 unlimited puzzles' });
    if (unlimitedDist[1] >= 10) achievements.push({ icon: '🎯', name: 'Unlimited First-Try Pro', desc: 'Win 10 unlimited on first clue' });
    if (stats.dailyGamesWon + (stats.unlimitedCompletions - stats.unlimitedGuessDistribution.fail) >= 50) achievements.push({ icon: '👑', name: 'Master Guesser', desc: '50 total wins across modes' });
    if (stats.overallFastestTime && stats.overallFastestTime < 30) achievements.push({ icon: '⚡', name: 'Speed Demon', desc: 'Fastest win under 30s (any mode)' });
    return achievements;
  }, []);
  const isWinner = useMemo(() => submittedAnswers.some(a => a.isCorrect), [submittedAnswers]);
  const numClues = useMemo(() => questions.length, [questions]);
  const todayDate = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), []);
  const winRate = useMemo(() =>
    stats.dailyGamesPlayed > 0 ? Math.round((stats.dailyGamesWon / stats.dailyGamesPlayed) * 100) : 0
  , [stats.dailyGamesPlayed, stats.dailyGamesWon]);
  const unlimitedWinRate = useMemo(() =>
    stats.unlimitedCompletions > 0 ? Math.round(((stats.unlimitedCompletions - stats.unlimitedGuessDistribution.fail) / stats.unlimitedCompletions) * 100) : 0
  , [stats.unlimitedCompletions, stats.unlimitedGuessDistribution.fail]);
  const achievements = useMemo(() => getAchievements(stats), [stats]);
  const themeStyles = useMemo(() => ({
    bgColor: darkMode ? 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)' : 'linear-gradient(135deg,#f8fafc 0%,#e2e8f0 50%,#cbd5e1 100%)',
    textColor: darkMode ? '#e2e8f0' : '#1e293b',
    mutedColor: darkMode ? '#94a3b8' : '#64748b',
    cardBg: darkMode ? 'rgba(15,23,42,0.7)' : 'rgba(255,255,255,0.8)',
    borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  }), [darkMode]);
  const sortedData = useMemo(() => data ? [...data].sort((a, b) => a.ticker.localeCompare(b.ticker)) : [], [data]);
  // Test mode URL param
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'true') {
      setTestMode(true);
    }
  }, []);
  // Keyboard shortcuts
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
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !gameOver && input.trim()) handleSubmit(e);
      if (e.key.toLowerCase() === 'n' && gameOver && gameMode === 'unlimited') nextPuzzle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, gameOver, gameMode]);
  // Load stats from localStorage
  useEffect(() => {
    try {
      const savedStats = localStorage.getItem('tickrDailyStats');
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        setStats({
          dailyGamesPlayed: parsed.dailyGamesPlayed || parsed.gamesPlayed || 0,
          dailyGamesWon: parsed.dailyGamesWon || parsed.gamesWon || 0,
          dailyCurrentStreak: parsed.dailyCurrentStreak || parsed.currentStreak || 0,
          dailyMaxStreak: parsed.dailyMaxStreak || parsed.maxStreak || 0,
          dailyGuessDistribution: parsed.dailyGuessDistribution || parsed.guessDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 },
          dailyPlayHistory: parsed.dailyPlayHistory || parsed.playHistory || {},
          dailyTotalTime: parsed.dailyTotalTime || parsed.totalTime || 0,
          unlimitedCompletions: parsed.unlimitedCompletions || parsed.totalPuzzles || 0,
          unlimitedGuessDistribution: parsed.unlimitedGuessDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 },
          unlimitedTotalTime: parsed.unlimitedTotalTime || 0,
          overallFastestTime: parsed.overallFastestTime || parsed.fastestTime || null,
          overallTotalTime: parsed.overallTotalTime || parsed.totalTime || 0,
          achievements: [],
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
  // Debounced input
  useEffect(() => {
    const handler = debounce((value) => setDebouncedInput(value), 200);
    handler(input);
    return () => handler.cancel();
  }, [input]);
  // Memoized availableOptions
  const availableOptionsMemo = useMemo(() => {
    if (!debouncedInput) return [];
    const alreadyGuessed = submittedAnswers.map(a => {
      const parenIndex = a.guess.indexOf('(');
      if (parenIndex > 0) {
        return a.guess.substring(0, parenIndex).trim().toLowerCase();
      }
      return a.guess.toLowerCase();
    });
    return allTickers
      .filter(t => {
        const matchesSearch = t.symbol.toLowerCase().includes(debouncedInput.toLowerCase()) ||
                           t.company.toLowerCase().includes(debouncedInput.toLowerCase());
        const notGuessed = !alreadyGuessed.includes(t.symbol.toLowerCase());
        return matchesSearch && notGuessed;
      })
      .sort((a, b) => {
        if (a.symbol.toLowerCase() === debouncedInput.toLowerCase()) return -1;
        if (b.symbol.toLowerCase() === debouncedInput.toLowerCase()) return 1;
        if (a.symbol.toLowerCase().startsWith(debouncedInput.toLowerCase())) return -1;
        if (b.symbol.toLowerCase().startsWith(debouncedInput.toLowerCase())) return 1;
        return 0;
      })
      .slice(0, 8);
  }, [debouncedInput, allTickers, submittedAnswers]);
  useEffect(() => setAvailableOptions(availableOptionsMemo), [availableOptionsMemo]);
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
  const auth = getAuth();
  useEffect(() => {
    signInAnonymously(auth)
      .then(() => {
        console.log("Signed in anonymously");
      })
      .catch((error) => {
        console.error("Anonymous sign-in error:", error);
      });
  }, []);
  // Select daily ticker
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
    let filteredData = sortedData;
    if (gameMode === 'daily' && !testMode) {
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
    if (gameMode === 'daily' && !testMode) {
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
                  updatedQuestions[level - 1].answers.push({ guess: answer.guess, isCorrect: answer.isCorrect });
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
  }, [data, gameMode, difficulty, puzzleSeed, testMode, sortedData]);
  // Throttled progress save
  const debouncedSaveProgress = useCallback(
    debounce((progressToSave) => {
      if (gameMode !== 'daily' || testMode || !dailyTicker || !startTime) return;
      const today = new Date(startTime).toDateString();
      const storedDate = localStorage.getItem('dailyDate');
      if (storedDate === today) {
        localStorage.setItem('dailyProgress', JSON.stringify(progressToSave));
      }
    }, 500),
    [gameMode, testMode, dailyTicker, startTime]
  );
  useEffect(() => {
    if (gameMode !== 'daily' || testMode || !dailyTicker || !startTime) return;
    const progressToSave = {
      currentLevel,
      submittedAnswers,
      gameOver,
      startTime
    };
    debouncedSaveProgress(progressToSave);
  }, [currentLevel, submittedAnswers, gameOver, startTime, dailyTicker, testMode, gameMode, debouncedSaveProgress]);
  // Shake animation
  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shake]);
  // Cached quotes fetch
  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const cached = localStorage.getItem('quotesCache');
        if (cached) {
          const { data: cachedData, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 300000) { // 5 min
            setQuotes(cachedData);
            return;
          }
        }
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
        const quotesToSet = validQuotes.length > 0 ? validQuotes : FALLBACK_QUOTES;
        setQuotes(quotesToSet);
        localStorage.setItem('quotesCache', JSON.stringify({ data: quotesToSet, timestamp: Date.now() }));
      } catch (e) {
        console.error("Error fetching quotes:", e);
        setQuotes(FALLBACK_QUOTES);
      }
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, []);
  // Focus input
  useEffect(() => {
    if (!gameOver && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
    }
  }, [currentLevel, gameOver]);
  const getAlreadyGuessedSymbols = useCallback((submittedAnswers) =>
    submittedAnswers.map(a => {
      const paren = a.guess.indexOf('(');
      return paren > 0 ? a.guess.substring(0, paren).trim().toLowerCase() : a.guess.toLowerCase();
    }), []);
  const validateGuess = useCallback((guess, correctTicker, allTickers) => {
    let tickerToCheck = guess.trim().toLowerCase();
    const matchedTicker = allTickers.find(t => t.symbol.toLowerCase() === tickerToCheck);
    if (matchedTicker) {
      tickerToCheck = matchedTicker.symbol.toLowerCase();
      const formattedGuess = matchedTicker.formatted;
      const isCorrect = matchedTicker.symbol.toUpperCase() === correctTicker.toUpperCase();
      return { formattedGuess, tickerToCheck, isCorrect, matched: true };
    }
    const parenIndex = guess.indexOf('(');
    if (parenIndex > 0) {
      tickerToCheck = guess.substring(0, parenIndex).trim().toLowerCase();
    }
    const isCorrect = tickerToCheck.toUpperCase() === correctTicker.toUpperCase();
    return { formattedGuess: guess.trim(), tickerToCheck, isCorrect, matched: false };
  }, []);
  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if (gameOver || !input.trim()) return;
    const alreadyGuessed = getAlreadyGuessedSymbols(submittedAnswers);
    const { formattedGuess, tickerToCheck, isCorrect } = validateGuess(input, questions[currentLevel]?.correct || '', allTickers);
    if (alreadyGuessed.includes(tickerToCheck)) {
      setShake(true);
      setInput("");
      setAvailableOptions([]);
      return;
    }
    const updatedQuestions = [...questions];
    updatedQuestions[currentLevel].answers.push({ guess: formattedGuess, isCorrect });
    setQuestions(updatedQuestions);
    setSubmittedAnswers(prev => [...prev, { level: currentLevel + 1, guess: formattedGuess, isCorrect }]);
    setInput("");
    setAvailableOptions([]);
    if (isCorrect || currentLevel === questions.length - 1) {
      setGameOver(true);
      const timeElapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      if (isCorrect) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      updateStats(isCorrect, currentLevel + 1, timeElapsed);
      return;
    }
    setCurrentLevel(currentLevel + 1);
  }, [gameOver, input, currentLevel, questions, submittedAnswers, startTime, allTickers, getAlreadyGuessedSymbols, validateGuess]);
  // Analytics
  useEffect(() => {
    if (testMode) return;
    const track = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyRef = doc(db, 'analytics', `daily_${today}`);
        const globalRef = doc(db, 'analytics', 'global');
        const batch = writeBatch(db);
        batch.set(dailyRef, { plays: increment(1) }, { merge: true });
        try {
          batch.update(globalRef, { totalPlays: increment(1) });
        } catch {
          batch.set(globalRef, { totalPlays: 1, uniqueUsers: 0 });
        }
        if (!localStorage.getItem('td_visited')) {
          localStorage.setItem('td_visited', 'true');
          batch.update(globalRef, { uniqueUsers: increment(1) });
        }
        await batch.commit();
        logEvent(analytics, 'page_view', { page_path: window.location.pathname });
        logEvent(analytics, 'visit_tickr', { mode: gameMode });
      } catch (e) {
        console.log("Analytics offline (normal in dev)", e);
      }
    };
    track();
  }, [gameMode, testMode]);
  const updateStats = useCallback(async (won = false, cluesUsed = 0, timeElapsed = null) => {
    if (testMode) return;
    if (gameMode === 'daily') {
      const progressStr = localStorage.getItem('dailyProgress');
      if (progressStr) {
        try {
          const progress = JSON.parse(progressStr);
          if (progress.gameOver) {
            console.log('Game already completed today—no stats update');
            return;
          }
        } catch (e) {}
      }
    }
    if (timeElapsed === null) {
      timeElapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    }
    const today = new Date().toISOString().split('T')[0];
    setStats(prev => {
      const newDailyGuessDist = { ...prev.dailyGuessDistribution };
      const newUnlimitedGuessDist = { ...prev.unlimitedGuessDistribution };
      const newDailyHistory = { ...prev.dailyPlayHistory };
      if (gameMode === 'daily') {
        if (won) {
          newDailyGuessDist[cluesUsed] = (newDailyGuessDist[cluesUsed] || 0) + 1;
        } else {
          newDailyGuessDist.fail = (newDailyGuessDist.fail || 0) + 1;
        }
        newDailyHistory[today] = { won, clues: cluesUsed, time: timeElapsed };
      } else {
        if (won) {
          newUnlimitedGuessDist[cluesUsed] = (newUnlimitedGuessDist[cluesUsed] || 0) + 1;
        } else {
          newUnlimitedGuessDist.fail = (newUnlimitedGuessDist.fail || 0) + 1;
        }
      }
      const newDailyCurrentStreak = gameMode === 'daily' ? (won ? prev.dailyCurrentStreak + 1 : 0) : prev.dailyCurrentStreak;
      const newDailyMaxStreak = Math.max(prev.dailyMaxStreak, newDailyCurrentStreak);
      const updated = {
        ...prev,
        dailyGamesPlayed: gameMode === 'daily' ? prev.dailyGamesPlayed + 1 : prev.dailyGamesPlayed,
        dailyGamesWon: gameMode === 'daily' && won ? prev.dailyGamesWon + 1 : prev.dailyGamesWon,
        dailyCurrentStreak: newDailyCurrentStreak,
        dailyMaxStreak: newDailyMaxStreak,
        dailyGuessDistribution: gameMode === 'daily' ? newDailyGuessDist : prev.dailyGuessDistribution,
        dailyPlayHistory: gameMode === 'daily' ? newDailyHistory : prev.dailyPlayHistory,
        dailyTotalTime: gameMode === 'daily' ? prev.dailyTotalTime + timeElapsed : prev.dailyTotalTime,
        unlimitedCompletions: gameMode === 'unlimited' ? prev.unlimitedCompletions + 1 : prev.unlimitedCompletions,
        unlimitedGuessDistribution: gameMode === 'unlimited' ? newUnlimitedGuessDist : prev.unlimitedGuessDistribution,
        unlimitedTotalTime: gameMode === 'unlimited' ? prev.unlimitedTotalTime + timeElapsed : prev.unlimitedTotalTime,
        overallTotalTime: prev.overallTotalTime + timeElapsed,
        overallFastestTime: won && (!prev.overallFastestTime || timeElapsed < prev.overallFastestTime) ? timeElapsed : prev.overallFastestTime,
      };
      localStorage.setItem('tickrDailyStats', JSON.stringify(updated));
      return updated;
    });
    if (gameMode === 'daily') {
      try {
        await updateDailyStats({ won });
      } catch (err) {
        console.error('Error updating daily Firebase stats:', err);
      }
    }
  }, [gameMode, testMode, startTime]);
  const toggleDarkMode = useCallback(() => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('tickrDailyDarkMode', JSON.stringify(newMode));
  }, [darkMode]);
  const handleOptionClick = useCallback((option) => {
    setInput(option.formatted);
    setAvailableOptions([]);
  }, []);
  const resetGame = useCallback(() => {
    localStorage.removeItem('dailyProgress');
    window.location.reload();
  }, []);
  const skipToNextTicker = useCallback(() => {
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
  }, [data, dailyTicker, difficulty]);
  const nextPuzzle = useCallback(() => {
    setGameOver(false);
    setCurrentLevel(0);
    setSubmittedAnswers([]);
    setInput("");
    setAvailableOptions([]);
    setPuzzleSeed(prev => prev + 1);
  }, []);
  const shareResults = useCallback(() => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const text = `TickrDaily ${new Date().toLocaleDateString()}\n${emoji} (${cluesUsed}/${questions.length})\n\nPlay: ${window.location.href}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('Results copied to clipboard!');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Results copied to clipboard!');
    }
  }, [submittedAnswers, questions]);
  const shareToTwitter = useCallback(() => {
    const emoji = submittedAnswers.map(a => a.isCorrect ? '🟩' : '🟥').join('');
    const won = submittedAnswers.some(a => a.isCorrect);
    const cluesUsed = won ? submittedAnswers.length : questions.length;
    const text = `TickrDaily ${new Date().toLocaleDateString()}\n${emoji} (${cluesUsed}/${questions.length})\n\nPlay: ${window.location.href}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank');
  }, [submittedAnswers, questions]);
  if (loading || !dailyTicker || !questions.length) {
    return (
      <div style={{ ...styles.app, background: themeStyles.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: themeStyles.mutedColor }}>Loading Market Data...</div>
      </div>
    );
  }
  const QuotronComponent = (
    <div className="quotron" style={styles.quotron}>
      <div style={{ display: 'inline-block', animation: 'scroll 120s linear infinite' }}>
        {[...quotes, ...quotes].map((q, i) => (
          <span key={i} style={{ display: 'inline-block', marginRight: '3rem', color: q.change >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700', fontFamily: 'monospace' }}>
            {q.symbol} {q.current} {q.change >= 0 ? `+${q.change}` : q.change}
          </span>
        ))}
      </div>
    </div>
  );
  const HeaderComponent = (
    <div style={styles.header}>
      <button
        onClick={toggleDarkMode}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          padding: '0.75rem',
          background: themeStyles.cardBg,
          border: `1px solid ${themeStyles.borderColor}`,
          borderRadius: '0.75rem',
          color: themeStyles.textColor,
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>
      {testMode && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          padding: '0.75rem 1rem',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          border: `1px solid ${themeStyles.borderColor}`,
          borderRadius: '0.75rem',
          color: 'white',
          fontWeight: '700',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          🧪 TEST MODE
        </div>
      )}
      <h1 style={styles.title}>TickrDaily</h1>
      <p style={{ ...styles.date, color: themeStyles.mutedColor }}>{todayDate}</p>
      <p style={{ ...styles.description, color: themeStyles.mutedColor }}>
        {gameMode === 'daily' ? 'Guess the stock from 5 clues' : `Guess the stock from ${difficulty === 'easy' ? 6 : difficulty === 'hard' ? 3 : 5} clues (${difficulty})`}
      </p>
      {gameOver && gameMode === 'daily' && !testMode && (
        <p style={{ color: '#22c55e', fontSize: '1rem', fontWeight: '600', marginTop: '1rem' }}>
          You already completed today's puzzle! Come back tomorrow for a new one. 🎯
        </p>
      )}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${((currentLevel + 1) / questions.length) * 100}%` }} />
      </div>
    </div>
  );
  const ModeSelectorComponent = (
    <div style={styles.modeSelector}>
      <button
        onClick={() => setGameMode('daily')}
        style={{
          padding: '0.75rem 1.5rem',
          background: gameMode === 'daily' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : themeStyles.cardBg,
          color: gameMode === 'daily' ? 'white' : themeStyles.textColor,
          border: `1px solid ${themeStyles.borderColor}`,
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
          background: gameMode === 'unlimited' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : themeStyles.cardBg,
          color: gameMode === 'unlimited' ? 'white' : themeStyles.textColor,
          border: `1px solid ${themeStyles.borderColor}`,
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
            background: themeStyles.cardBg,
            color: themeStyles.textColor,
            border: `1px solid ${themeStyles.borderColor}`,
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
  const StatsButtonsComponent = (
    <div style={styles.statsButtons}>
      <button
        onClick={() => setShowStats(!showStats)}
        style={{ ...styles.button, background: themeStyles.cardBg, border: `1px solid ${themeStyles.borderColor}`, color: themeStyles.textColor }}
        aria-label="View Statistics"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        Statistics
      </button>
      <button
        onClick={() => setShowHowToPlay(true)}
        style={{ ...styles.button, background: themeStyles.cardBg, border: `1px solid ${themeStyles.borderColor}`, color: themeStyles.textColor }}
        aria-label="How to Play"
      >
        ❓ How to Play
      </button>
    </div>
  );
  const QuestionsComponent = questions.map((q, idx) => {
    if (idx > currentLevel) return null;
    return (
      <div key={idx} style={{ marginBottom: '2rem', width: '100%' }}>
        <div style={{ ...styles.card, background: themeStyles.cardBg, border: `1px solid ${themeStyles.borderColor}` }}>
          <p style={styles.question}>Question {q.level}: {q.question}</p>
          {q.answers.map((a, i) => (
            <div key={i} style={{
              ...styles.answer,
              ...(a.isCorrect ? styles.correctAnswer : styles.incorrectAnswer)
            }}>
              {a.isCorrect ? "✓" : "✗"} {a.guess}
            </div>
          ))}
          {currentLevel === idx && !gameOver && (
            <form
              style={{ position: 'relative', marginTop: '1rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
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
                style={styles.input}
              />
              {availableOptions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.5rem',
                  background: 'rgba(15,23,42,0.95)',
                  borderRadius: '1rem',
                  overflow: 'auto',
                  maxHeight: '400px',
                  zIndex: 50,
                  border: '1px solid rgba(255,255,255,0.2)'
                }}>
                  {availableOptions.map((opt, i) => (
                    <div
                      key={i}
                      onClick={() => handleOptionClick(opt)}
                      style={styles.option}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: '700', color: '#22c55e', fontFamily: 'monospace', fontSize: '1rem' }}>{opt.symbol}</div>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>{opt.company}</div>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="submit"
                style={{ ...styles.submitBtn, ...(shake && styles.shake) }}
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
  });
  const GameOverComponent = gameOver && (
    <div style={{ ...styles.gameOver, background: themeStyles.cardBg, border: `1px solid ${themeStyles.borderColor}` }}>
      <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>{isWinner ? '🎉' : '😔'}</div>
      <h2 style={{
        fontSize: '2.5rem',
        fontWeight: '800',
        background: isWinner ? 'linear-gradient(135deg,#22c55e 0%,#3b82f6 100%)' : 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '1.5rem'
      }}>
        {isWinner ? 'Congratulations!' : 'Game Over'}
      </h2>
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '2rem', marginBottom: '2rem' }}>
        <p style={{ color: themeStyles.mutedColor, fontSize: '0.875rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>The Answer Was</p>
        <p style={{ fontSize: '2.5rem', fontWeight: '800', color: '#22c55e', fontFamily: 'monospace', marginBottom: '0.5rem' }}>{dailyTicker.ticker}</p>
        <p style={{ fontSize: '1.125rem', color: themeStyles.textColor }}>{dailyTicker.company}</p>
        <p style={{ color: themeStyles.mutedColor, fontSize: '1.125rem', marginTop: '1rem', textAlign: 'center' }}>
          {gameMode === 'daily' ? 'Come back tomorrow for a new challenge!' : 'Keep going!'}
        </p>
      </div>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={shareResults}
          style={{ ...styles.shareButton, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)' }}
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
          style={{ ...styles.shareButton, background: 'linear-gradient(135deg, #1DA1F2 0%, #0c85d0 100%)', boxShadow: '0 10px 25px -5px rgba(29, 161, 242, 0.4)' }}
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
            style={{ ...styles.shareButton, background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)' }}
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
              style={{ ...styles.shareButton, background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)' }}
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
              style={{ ...styles.shareButton, background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.4)' }}
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
  );
  return (
    <div style={{ ...styles.app, background: themeStyles.bgColor }}>
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
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
      {QuotronComponent}
      <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {HeaderComponent}
        {ModeSelectorComponent}
        {StatsButtonsComponent}
        {QuestionsComponent}
        {GameOverComponent}
      </div>
      {showStats && (
        <StatsModal
          stats={stats}
          activeModeTab={activeModeTab}
          setActiveModeTab={setActiveModeTab}
          themeStyles={themeStyles}
          formatTime={formatTime}
          achievements={achievements}
          onClose={() => setShowStats(false)}
          winRate={winRate}
          unlimitedWinRate={unlimitedWinRate}
        />
      )}
      {showHowToPlay && (
        <HowToPlayModal
          numClues={numClues}
          gameMode={gameMode}
          themeStyles={themeStyles}
          onClose={() => setShowHowToPlay(false)}
        />
      )}
    </div>
  );
}
export default App;
