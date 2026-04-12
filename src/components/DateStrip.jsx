import { useState, useEffect } from 'react';

const WINDOW_SIZE = 5;

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const todayStr = () => toLocalDateStr(new Date());

function formatDay(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return {
    date: dateStr,
    dayLabel: dateStr === todayStr() ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }),
    dayNum: day,
  };
}

export default function DateStrip({ selectedDate, onChange, activeDates = [] }) {
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    if (!activeDates.length) return;
    const idx = activeDates.indexOf(selectedDate);
    const target = idx === -1 ? activeDates.length - 1 : idx;
    const newStart = Math.max(0, Math.min(target - WINDOW_SIZE + 1, activeDates.length - WINDOW_SIZE));
    setWindowStart(newStart);
  }, [selectedDate, activeDates]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey || !activeDates.length) return;
      const idx = activeDates.indexOf(selectedDate);
      if (e.key === '.' && idx < activeDates.length - 1) {
        e.preventDefault();
        onChange(activeDates[idx + 1]);
      } else if (e.key === ',' && idx > 0) {
        e.preventDefault();
        onChange(activeDates[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDate, activeDates, onChange]);

  const needsArrows = activeDates.length > WINDOW_SIZE;
  const canGoLeft   = windowStart > 0;
  const canGoRight  = windowStart + WINDOW_SIZE < activeDates.length;
  const days = activeDates.slice(windowStart, windowStart + WINDOW_SIZE).map(formatDay);

  return (
    <div className="date-strip">
      {needsArrows && (
        <button
          className="date-strip__arrow date-strip__arrow--left"
          onClick={() => setWindowStart(s => Math.max(0, s - 1))}
          disabled={!canGoLeft}
          aria-label="Earlier dates"
        >‹</button>
      )}

      <div className="date-strip__days">
        {days.map(day => (
          <button
            key={day.date}
            className={`date-strip__day${day.date === selectedDate ? ' date-strip__day--active' : ''}`}
            onClick={() => onChange(day.date)}
          >
            <span className="date-strip__label">{day.dayLabel}</span>
            <span className="date-strip__num">{day.dayNum}</span>
          </button>
        ))}
      </div>

      {needsArrows && (
        <button
          className="date-strip__arrow date-strip__arrow--right"
          onClick={() => setWindowStart(s => Math.min(activeDates.length - WINDOW_SIZE, s + 1))}
          disabled={!canGoRight}
          aria-label="Later dates"
        >›</button>
      )}
    </div>
  );
}
