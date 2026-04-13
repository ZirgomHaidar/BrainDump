import { useState, useEffect } from 'react';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const toDateStr = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const todayStr = () => {
  const n = new Date();
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate());
};

export default function JournalCalendar({ selectedDate, onSelectDate, entryDates = [] }) {
  const [view, setView] = useState(() => {
    const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Follow selectedDate's month when it changes externally
  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate + 'T00:00:00');
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedDate]);

  const { year, month } = view;
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Date(year, month).toLocaleString('default', { month: 'long' });
  const today = todayStr();
  const entrySet = new Set(entryDates);

  const goMonth = (delta) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="jcal">
      <div className="jcal__header">
        <button className="jcal__nav" onClick={() => goMonth(-1)}>‹</button>
        <span className="jcal__month">{monthLabel} {year}</span>
        <button className="jcal__nav" onClick={() => goMonth(1)}>›</button>
      </div>

      <div className="jcal__grid">
        {DOW.map((d, i) => (
          <div key={i} className="jcal__dow">{d}</div>
        ))}

        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`e${i}`} className="jcal__empty" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ds = toDateStr(year, month, day);
          const isToday = ds === today;
          const isSel = ds === selectedDate;
          const hasEntry = entrySet.has(ds);

          return (
            <button
              key={ds}
              className={[
                'jcal__day',
                isToday   && 'jcal__day--today',
                isSel     && 'jcal__day--selected',
                hasEntry  && 'jcal__day--has-entry',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate(ds)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
