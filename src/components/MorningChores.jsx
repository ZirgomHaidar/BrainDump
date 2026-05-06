import { useEffect, useMemo, useState } from 'react';
import { addChore, deleteChore, subscribeToChoreLog, subscribeToChores, toggleChoreLog } from '../firebase';
import './MorningChores.css';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTodayLabel() {
  return new Date().toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function MorningChores() {
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const [chores, setChores] = useState([]);
  const [choreLog, setChoreLog] = useState({});
  const [isManaging, setIsManaging] = useState(false);
  const [newChoreText, setNewChoreText] = useState('');

  useEffect(() => subscribeToChores(setChores), []);
  useEffect(() => subscribeToChoreLog(todayStr, setChoreLog), [todayStr]);

  function handleToggle(choreId) {
    const completed = !choreLog[choreId];
    toggleChoreLog(todayStr, choreId, completed);
  }

  function handleAddChore(e) {
    e.preventDefault();
    const text = newChoreText.trim();
    if (!text) return;
    addChore(text, chores.length);
    setNewChoreText('');
  }

  const doneCount = chores.filter((c) => choreLog[c.id]).length;
  const total = chores.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="chores">
      <div className="chores__header">
        <span className="chores__date-label">{formatTodayLabel()}</span>
        <button className="chores__manage-btn" onClick={() => setIsManaging((v) => !v)}>
          {isManaging ? 'Done' : 'Manage List'}
        </button>
      </div>

      <div className="chores__progress">
        <div className="chores__progress-bar-track">
          <div className="chores__progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="chores__progress-label">{doneCount}/{total} complete</span>
      </div>

      {chores.length === 0 && !isManaging && (
        <div className="chores__empty">
          No chores yet. Click "Manage List" to add your morning routine.
        </div>
      )}

      <ul className="chores__list">
        {chores.map((chore) => (
          <li key={chore.id} className="chores__item">
            {!isManaging && (
              <button
                className={`chores__check${choreLog[chore.id] ? ' chores__check--done' : ''}`}
                onClick={() => handleToggle(chore.id)}
                aria-label={`Toggle ${chore.text}`}
              >
                {choreLog[chore.id] ? '■' : '□'}
              </button>
            )}
            <span className={`chores__label${choreLog[chore.id] ? ' chores__label--done' : ''}`}>
              {chore.text}
            </span>
            {isManaging && (
              <button
                className="chores__remove"
                onClick={() => deleteChore(chore.id)}
                aria-label={`Remove ${chore.text}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {isManaging && (
        <form className="chores__add-row" onSubmit={handleAddChore}>
          <input
            className="chores__add-input"
            placeholder="New chore..."
            value={newChoreText}
            onChange={(e) => setNewChoreText(e.target.value)}
          />
          <button className="chores__add-submit" type="submit">Add</button>
        </form>
      )}
    </div>
  );
}
