import { useState, useEffect, useMemo, useCallback } from 'react';
import './DashboardHUD.css';
import { subscribeToItems, subscribeToRecentItems } from '../services/storageAdapter';
import { todayStr } from '../services/guestStorage';
import {
  getLastNDays,
  calculateStreak,
  calculateMindClearance,
  calculateQuadrantStats,
  calculate7DayActivity,
} from '../services/dashboardService';

export default function DashboardHUD({ isOpen, onClose, isGuest, activeDates, syncing }) {
  const [isClosing, setIsClosing] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [todayItems, setTodayItems] = useState([]);
  const [weekItems, setWeekItems] = useState([]);

  // Adjust state during render when isOpen prop changes (React recommended pattern)
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen && !isClosing) {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => {
        setIsClosing(false);
      }, 240);
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 240);
  }, [isClosing, onClose]);

  const today = todayStr();
  const last7Days = useMemo(() => getLastNDays(7), []);
  const last7DateStrs = useMemo(() => last7Days.map((d) => d.dateStr), [last7Days]);

  // Subscribe to today's items
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToItems(today, (items) => {
      setTodayItems(items);
    }, isGuest);
    return unsub;
  }, [isOpen, today, isGuest]);

  // Subscribe to past 7 days' items for the activity chart
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToRecentItems(last7DateStrs, (items) => {
      setWeekItems(items);
    }, isGuest);
    return unsub;
  }, [isOpen, last7DateStrs, isGuest]);

  // ESC key to close & body scroll lock
  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, isClosing, handleClose]);

  // Calculations
  const streak = useMemo(() => calculateStreak(activeDates), [activeDates]);
  const clearance = useMemo(() => calculateMindClearance(todayItems), [todayItems]);
  const quadrantStats = useMemo(() => calculateQuadrantStats(todayItems), [todayItems]);
  const activity7Day = useMemo(() => calculate7DayActivity(weekItems, last7Days), [weekItems, last7Days]);

  // Circular gauge SVG calculations
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clearance.percentage / 100) * circumference;

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`dashboard-hud${isClosing ? ' dashboard-hud--closing' : ''}`} role="dialog" aria-modal="true" aria-label="HUD Dashboard">
      {/* Backdrop */}
      <div className="dashboard-hud__backdrop" onClick={handleClose} />

      {/* Slide-out Panel */}
      <aside className="dashboard-hud__panel">
        {/* Panel Header */}
        <div className="dashboard-hud__header">
          <div className="dashboard-hud__header-title">
            <span className="dashboard-hud__dashboard-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
            </span>
            <h2>BRAINDUMP // HUD</h2>
            <span className="dashboard-hud__badge">COMMAND CENTER</span>
          </div>
          <button
            className="dashboard-hud__close-btn"
            onClick={handleClose}
            title="Close (ESC)"
            aria-label="Close Dashboard"
          >
            ✕
          </button>
        </div>

        {/* Top Status Ticker Strip */}
        <div className="dashboard-hud__ticker">
          <div className="dashboard-hud__ticker-item">
            <span className="dashboard-hud__ticker-label">STATUS</span>
            <span className="dashboard-hud__ticker-val">
              <span className={`dashboard-hud__status-dot${isGuest ? ' dashboard-hud__status-dot--guest' : syncing ? ' dashboard-hud__status-dot--syncing' : ' dashboard-hud__status-dot--live'}`} />
              {isGuest ? 'GUEST (OFFLINE)' : syncing ? 'SYNCING...' : 'LIVE CLOUD'}
            </span>
          </div>
          <div className="dashboard-hud__ticker-divider">/</div>
          <div className="dashboard-hud__ticker-item">
            <span className="dashboard-hud__ticker-label">DATE</span>
            <span className="dashboard-hud__ticker-val">{today}</span>
          </div>
          <div className="dashboard-hud__ticker-divider">/</div>
          <div className="dashboard-hud__ticker-item">
            <span className="dashboard-hud__ticker-label">STREAK</span>
            <span className="dashboard-hud__ticker-val highlight">{streak} {streak === 1 ? 'DAY' : 'DAYS'}</span>
          </div>
          <div className="dashboard-hud__ticker-divider">/</div>
          <div className="dashboard-hud__ticker-item">
            <span className="dashboard-hud__ticker-label">ACTIVE DAYS</span>
            <span className="dashboard-hud__ticker-val">{activeDates ? activeDates.length : 1}</span>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="dashboard-hud__bento">
          {/* Bento Card 1: Today's Focus & Stats */}
          <div className="dashboard-hud__card dashboard-hud__card--focus">
            <div className="dashboard-hud__card-header">
              <span className="dashboard-hud__card-tag">TODAY&apos;S FOCUS</span>
              <span className="dashboard-hud__card-meta">{clearance.cleared}/{clearance.total}</span>
            </div>
            <div className="dashboard-hud__metric-display">
              <div className="dashboard-hud__metric-number">{clearance.cleared}</div>
              <div className="dashboard-hud__metric-denom">/ {clearance.total}</div>
            </div>
            <div className="dashboard-hud__progress-track">
              <div
                className="dashboard-hud__progress-fill"
                style={{ width: `${clearance.total > 0 ? clearance.percentage : 0}%` }}
              />
            </div>
            <div className="dashboard-hud__substats">
              <div className="dashboard-hud__substat">
                <span className="dashboard-hud__substat-lbl">CLEARANCE</span>
                <span className="dashboard-hud__substat-val">{clearance.percentage}%</span>
              </div>
              <div className="dashboard-hud__substat">
                <span className="dashboard-hud__substat-lbl">REMAINING</span>
                <span className="dashboard-hud__substat-val">{clearance.pending}</span>
              </div>
            </div>
          </div>

          {/* Bento Card 2: Mind Clearance Circular Gauge */}
          <div className="dashboard-hud__card dashboard-hud__card--gauge">
            <div className="dashboard-hud__card-header">
              <span className="dashboard-hud__card-tag">MIND CLEARANCE</span>
              <span className="dashboard-hud__card-meta">RADIAL</span>
            </div>
            <div className="dashboard-hud__gauge-wrapper">
              <svg className="dashboard-hud__gauge-svg" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  className="dashboard-hud__gauge-bg"
                  cx="50"
                  cy="50"
                  r={radius}
                />
                {/* Value Ring */}
                <circle
                  className="dashboard-hud__gauge-val"
                  cx="50"
                  cy="50"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="dashboard-hud__gauge-content">
                <div className="dashboard-hud__gauge-pct">{clearance.percentage}<span>%</span></div>
                <div className="dashboard-hud__gauge-label">
                  {clearance.percentage === 100 ? 'PEAK CLARITY' : clearance.percentage >= 60 ? 'BALANCED' : 'IN PROGRESS'}
                </div>
              </div>
            </div>
          </div>

          {/* Bento Card 3: 7-Day Activity Bar Chart */}
          <div className="dashboard-hud__card dashboard-hud__card--activity">
            <div className="dashboard-hud__card-header">
              <span className="dashboard-hud__card-tag">7-DAY ACTIVITY VOLUME</span>
              <span className="dashboard-hud__card-meta">WEEK TOTAL: {activity7Day.weekTotal}</span>
            </div>
            <div className="dashboard-hud__barchart">
              {activity7Day.dailyData.map((d) => (
                <div
                  key={d.dateStr}
                  className={`dashboard-hud__bar-col${d.isToday ? ' dashboard-hud__bar-col--today' : ''}`}
                  title={`${d.dateStr}: ${d.cleared}/${d.total} items completed`}
                >
                  <div className="dashboard-hud__bar-track">
                    <div
                      className="dashboard-hud__bar-fill"
                      style={{ height: `${d.heightPct}%` }}
                    >
                      {d.total > 0 && <span className="dashboard-hud__bar-val">{d.total}</span>}
                    </div>
                  </div>
                  <div className="dashboard-hud__bar-label">{d.dayShort}</div>
                  <div className="dashboard-hud__bar-sub">{d.dayNum}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bento Card 4: 4-Quadrant Breakdown */}
          <div className="dashboard-hud__card dashboard-hud__card--quadrants">
            <div className="dashboard-hud__card-header">
              <span className="dashboard-hud__card-tag">QUADRANT DISTRIBUTION</span>
              <span className="dashboard-hud__card-meta">TODAY</span>
            </div>
            <div className="dashboard-hud__quadrant-list">
              {quadrantStats.map((q) => (
                <div key={q.key} className="dashboard-hud__quadrant-row">
                  <div className="dashboard-hud__quadrant-info">
                    <span className="dashboard-hud__quadrant-dot" style={{ background: q.color }} />
                    <span className="dashboard-hud__quadrant-title">{q.label}</span>
                    <span className="dashboard-hud__quadrant-count">{q.cleared}/{q.total}</span>
                  </div>
                  <div className="dashboard-hud__quadrant-bar-track">
                    <div
                      className="dashboard-hud__quadrant-bar-fill"
                      style={{
                        width: `${q.total > 0 ? q.rate : 0}%`,
                        background: q.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
