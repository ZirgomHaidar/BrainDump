import { useEffect, useState } from 'react';
import { addReflection, deleteReflection, subscribeToReflections } from '../services/storageAdapter';
import { useAuth } from '../hooks/useAuth';
import './Motivation.css';

const CATEGORIES = ['lesson', 'experience', 'motivation', 'principle'];

function formatDate(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Motivation() {
  const { isGuest } = useAuth();
  const [reflections, setReflections] = useState([]);
  const [inputText, setInputText] = useState('');
  const [inputCategory, setInputCategory] = useState('');

  useEffect(() => subscribeToReflections(setReflections, isGuest), [isGuest]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    addReflection(text, inputCategory || null, isGuest);
    setInputText('');
    setInputCategory('');
  }

  return (
    <div className="motivation">
      <form className="motivation__add-bar" onSubmit={handleSubmit}>
        <select
          className="motivation__category-select"
          value={inputCategory}
          onChange={(e) => setInputCategory(e.target.value)}
        >
          <option value="">No tag</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          className="motivation__input"
          placeholder="Add a thought, lesson, or principle..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button className="motivation__submit" type="submit">Add</button>
      </form>

      {reflections.length === 0 ? (
        <div className="motivation__empty">
          Nothing here yet. Start capturing what you learn.
        </div>
      ) : (
        <ul className="motivation__list">
          {reflections.map((r) => (
            <li key={r.id} className="motivation__item">
              <div className="motivation__item-top">
                {r.category && (
                  <span className={`motivation__tag motivation__tag--${r.category}`}>{r.category}</span>
                )}
                <span className="motivation__meta">{formatDate(r.createdAt)}</span>
                <button
                  className="motivation__delete"
                  onClick={() => deleteReflection(r.id, isGuest)}
                  aria-label="Delete reflection"
                >
                  Delete
                </button>
              </div>
              <p className="motivation__text">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
