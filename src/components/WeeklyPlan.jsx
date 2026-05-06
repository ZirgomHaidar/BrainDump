import { useEffect, useMemo, useRef, useState } from 'react';
import { addWeeklyItem, deleteWeeklyItem, subscribeToWeeklyItems, toggleWeeklyItem } from '../firebase';
import './WeeklyPlan.css';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toLocalDateStr(new Date());
}

function getWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toWeekStr(monday) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateStr(d);
  });
}

function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

export default function WeeklyPlan() {
  const [weekMonday, setWeekMonday] = useState(() => getWeekMonday(new Date()));
  const [items, setItems] = useState([]);
  const [addingDay, setAddingDay] = useState(null);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef(null);

  const weekStr = useMemo(() => toWeekStr(weekMonday), [weekMonday]);
  const weekDays = useMemo(() => getWeekDays(weekMonday), [weekMonday]);
  const today = todayStr();

  useEffect(() => subscribeToWeeklyItems(weekStr, setItems), [weekStr]);

  useEffect(() => {
    if (addingDay !== null) inputRef.current?.focus();
  }, [addingDay]);

  function prevWeek() {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() - 7);
    setWeekMonday(d);
  }

  function nextWeek() {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + 7);
    setWeekMonday(d);
  }

  function handleAdd(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || addingDay === null) return;
    addWeeklyItem(weekStr, addingDay, text);
    setInputText('');
    setAddingDay(null);
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Escape') {
      setAddingDay(null);
      setInputText('');
    }
  }

  const weekLabel = `${formatShortDate(weekDays[0])} – ${formatShortDate(weekDays[6])}`;

  return (
    <div className="weekly">
      <div className="weekly__nav">
        <button className="weekly__nav-btn" onClick={prevWeek}>‹ Prev</button>
        <span className="weekly__week-label">{weekStr} · {weekLabel}</span>
        <button className="weekly__nav-btn" onClick={nextWeek}>Next ›</button>
      </div>

      <div className="weekly__grid">
        {weekDays.map((dateStr, dayIndex) => {
          const isPast = dateStr < today;
          const isToday = dateStr === today;
          const dayItems = items.filter((i) => i.dayIndex === dayIndex);

          return (
            <div
              key={dateStr}
              className={`weekly__day${isToday ? ' weekly__day--today' : ''}${isPast ? ' weekly__day--past' : ''}`}
            >
              <div className="weekly__day-header">
                <span className="weekly__day-name">{DAY_NAMES[dayIndex]}</span>
                <span className="weekly__day-date">{formatShortDate(dateStr)}</span>
                {!isPast && (
                  <button
                    className="weekly__add-btn"
                    onClick={() => { setAddingDay(dayIndex); setInputText(''); }}
                    aria-label={`Add task for ${DAY_NAMES[dayIndex]}`}
                  >
                    +
                  </button>
                )}
              </div>

              <ul className="weekly__task-list">
                {dayItems.map((item) => (
                  <li key={item.id} className={`weekly__task${item.done ? ' weekly__task--done' : ''}`}>
                    <button
                      className={`weekly__task-check${item.done ? ' weekly__task-check--done' : ''}`}
                      onClick={() => !isPast && toggleWeeklyItem(item.id, !item.done)}
                      disabled={isPast}
                      aria-label="Toggle task"
                    >
                      {item.done ? '■' : '□'}
                    </button>
                    <span className="weekly__task-text">{item.text}</span>
                    {!isPast && (
                      <button
                        className="weekly__task-delete"
                        onClick={() => deleteWeeklyItem(item.id)}
                        aria-label="Delete task"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {addingDay === dayIndex && (
                <form className="weekly__inline-add" onSubmit={handleAdd}>
                  <input
                    ref={inputRef}
                    className="weekly__inline-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Task..."
                  />
                  <button className="weekly__inline-submit" type="submit">Add</button>
                  <button
                    className="weekly__inline-cancel"
                    type="button"
                    onClick={() => { setAddingDay(null); setInputText(''); }}
                  >
                    ×
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
