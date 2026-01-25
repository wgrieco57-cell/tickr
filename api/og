// api/og.js - Open Graph image generation for social sharing
import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

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

function formatDisplayDate(dateISO) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatTime(seconds) {
  if (!seconds || seconds === 0) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Parse and validate query params
    const dateParam = searchParams.get('date');
    const date = dateParam || getETDateISO();
    
    const cluesParam = searchParams.get('clues');
    const clues = cluesParam ? Math.max(1, Math.min(5, parseInt(cluesParam))) : null;
    
    const timeParam = searchParams.get('time');
    const time = timeParam ? Math.max(0, Math.min(36000, parseInt(timeParam))) : null;
    
    const streakParam = searchParams.get('streak');
    const streak = streakParam ? Math.max(0, Math.min(999, parseInt(streakParam))) : 0;
    
    const gridParam = searchParams.get('grid');
    const grid = gridParam ? decodeURIComponent(gridParam).substring(0, 50) : '';
    
    const modeParam = searchParams.get('mode');
    const mode = modeParam === 'unlimited' ? 'unlimited' : 'daily';
    
    const pctParam = searchParams.get('pct');
    const pct = pctParam ? Math.max(0, Math.min(100, parseInt(pctParam))) : null;

    const displayDate = formatDisplayDate(date);
    const displayTime = time ? formatTime(time) : '--';
    const displayClues = clues ? `${clues}/5` : '--';
    
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                fontSize: '72px',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
                backgroundClip: 'text',
                color: 'transparent',
                marginBottom: '12px',
              }}
            >
              TickrDaily
            </div>
            <div
              style={{
                fontSize: '28px',
                color: '#94a3b8',
              }}
            >
              {displayDate}
            </div>
          </div>

          {/* Result Card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '48px 64px',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '48px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#22c55e',
                  }}
                >
                  {displayClues}
                </div>
                <div
                  style={{
                    fontSize: '24px',
                    color: '#94a3b8',
                  }}
                >
                  Clues Used
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#3b82f6',
                  }}
                >
                  {displayTime}
                </div>
                <div
                  style={{
                    fontSize: '24px',
                    color: '#94a3b8',
                  }}
                >
                  Time
                </div>
              </div>
            </div>

            {/* Emoji Grid */}
            {grid && (
              <div
                style={{
                  fontSize: '36px',
                  letterSpacing: '8px',
                  marginTop: '16px',
                }}
              >
                {grid}
              </div>
            )}
          </div>

          {/* Streak Badge */}
          {streak > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                right: '48px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '2px solid #ef4444',
                borderRadius: '16px',
                padding: '16px 24px',
              }}
            >
              <span style={{ fontSize: '36px' }}>🔥</span>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#ef4444',
                  }}
                >
                  {streak}
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    color: '#94a3b8',
                  }}
                >
                  streak
                </div>
              </div>
            </div>
          )}

          {/* Percentile Badge */}
          {pct !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '24px',
                color: '#94a3b8',
                marginTop: '16px',
              }}
            >
              Beat {pct}% of players today 🎯
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              position: 'absolute',
              bottom: '32px',
              fontSize: '20px',
              color: '#64748b',
            }}
          >
            tickrdaily.com
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
        },
      },
    );
  } catch (e) {
    console.error('OG image generation error:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
