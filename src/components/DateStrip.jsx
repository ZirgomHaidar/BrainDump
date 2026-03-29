import { useRef, useEffect } from 'react';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i)); // oldest → newest, today last
    const isToday = i === 6;
    return {
      date: toLocalDateStr(d),
      dayLabel: isToday ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }),
      dayNum: d.getDate(),
    };
  });
}

export default function DateStrip({ selectedDate, onChange }) {
  const days = getLast7Days();
  const stripRef = useRef(null);

  useEffect(() => {
    stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: 'instant' });
  }, []);

  return (
    <div className="date-strip" ref={stripRef}>
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
  );
}
