import { useEffect, useMemo, useRef, useState } from 'react';
import { logPomodoroSession, subscribeToPomodoroSessions } from '../firebase';
import './Pomodoro.css';

const WORK_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatCompletedAt(ts) {
  return ts?.toDate?.()?.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }) ?? '';
}

export default function Pomodoro() {
  const today = useMemo(() => toLocalDateStr(new Date()), []);
  const [mode, setMode] = useState('work');
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(WORK_SECS);
  const [title, setTitle] = useState('');
  const [sessions, setSessions] = useState([]);

  const intervalRef = useRef(null);
  const titleRef = useRef('');

  useEffect(() => subscribeToPomodoroSessions(today, setSessions), [today]);
  useEffect(() => () => clearInterval(intervalRef.current), []);

  function handleComplete() {
    clearInterval(intervalRef.current);
    logPomodoroSession(titleRef.current, today);
    setRunning(false);
    setMode('break');
    setTimeLeft(BREAK_SECS);
  }

  function toggleRunning() {
    if (running) {
      clearInterval(intervalRef.current);
      setRunning(false);
    } else {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setRunning(true);
    }
  }

  function switchMode(newMode) {
    clearInterval(intervalRef.current);
    setRunning(false);
    setMode(newMode);
    setTimeLeft(newMode === 'work' ? WORK_SECS : BREAK_SECS);
  }

  function reset() {
    clearInterval(intervalRef.current);
    setRunning(false);
    setTimeLeft(mode === 'work' ? WORK_SECS : BREAK_SECS);
  }

  function handleTitleChange(e) {
    titleRef.current = e.target.value;
    setTitle(e.target.value);
  }

  return (
    <div className="pomodoro">
      <div className="pomodoro__mode-bar">
        <button
          className={`pomodoro__mode-btn${mode === 'work' ? ' pomodoro__mode-btn--active' : ''}`}
          onClick={() => switchMode('work')}
        >
          Work · 25m
        </button>
        <button
          className={`pomodoro__mode-btn${mode === 'break' ? ' pomodoro__mode-btn--active' : ''}`}
          onClick={() => switchMode('break')}
        >
          Break · 5m
        </button>
      </div>

      <div className="pomodoro__display">
        <div className="pomodoro__time">{formatTime(timeLeft)}</div>
        <div className="pomodoro__mode-label">{mode === 'work' ? 'Focus' : 'Rest'}</div>
      </div>

      <div className="pomodoro__title-row">
        <input
          className="pomodoro__title-input"
          placeholder="What are you working on?"
          value={title}
          onChange={handleTitleChange}
          disabled={running}
        />
      </div>

      <div className="pomodoro__controls">
        <button className="pomodoro__btn pomodoro__btn--primary" onClick={toggleRunning}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button className="pomodoro__btn" onClick={reset}>Reset</button>
      </div>

      <div className="pomodoro__sessions">
        <div className="pomodoro__sessions-header">
          Today — {sessions.length} session{sessions.length !== 1 ? 's' : ''} completed
        </div>
        {sessions.length === 0 ? (
          <div className="pomodoro__sessions-empty">No sessions yet. Start your first focus block.</div>
        ) : (
          <ul className="pomodoro__session-list">
            {sessions.map((s) => (
              <li key={s.id} className="pomodoro__session-item">
                <span className="pomodoro__session-title">{s.title || 'Untitled'}</span>
                <span className="pomodoro__session-time">{formatCompletedAt(s.completedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
