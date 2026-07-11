import { useState, useRef, useEffect } from 'react';

const QUADRANTS = [
  { key: 'todos',     label: 'TODO',      color: '#a8bbdc' },
  { key: 'decisions', label: 'Decisions', color: '#c4abca' },
  { key: 'ideas',     label: 'Ideas',     color: '#b1e57e' },
  { key: 'letgo',     label: 'Let Go',    color: '#fbc9a9' },
];

const ALIASES = { t: 'todos', d: 'decisions', i: 'ideas', l: 'letgo' };
const VALID_SECTIONS = ['todos', 'decisions', 'ideas', 'letgo'];

const HINTS = {
  todos:     'TO-DO',
  decisions: 'DECISIONS',
  ideas:     'IDEAS',
  letgo:     'LET GO',
};

function parse(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const raw = spaceIdx === -1 ? trimmed.slice(1).toLowerCase() : trimmed.slice(1, spaceIdx).toLowerCase();
  const section = ALIASES[raw] ?? raw;
  const text = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  return { section, text };
}

export default function FloatingInput({ onAdd }) {
  const [selectedQuadrant, setSelectedQuadrant] = useState('todos');
  const [value, setValue]   = useState('');
  const [error, setError]   = useState('');
  const [flash, setFlash]   = useState('');
  const inputRef = useRef(null);

  // Keyboard shortcut: '/' focuses the input when nothing else is focused
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement === document.body) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Derive inline section tag from typed command or fallback to active selected quadrant
  const parsed = parse(value);
  const activeSection = (parsed && VALID_SECTIONS.includes(parsed.section))
    ? parsed.section
    : selectedQuadrant;

  const currentQuadrant = QUADRANTS.find((q) => q.key === activeSection) || QUADRANTS[0];

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;

    let targetSection = selectedQuadrant;
    let textToAdd = trimmed;

    if (parsed) {
      if (!VALID_SECTIONS.includes(parsed.section)) {
        setError('Unknown section. Use: /t · /d · /i · /l');
        return;
      }
      if (!parsed.text) {
        setError('Add some text after the section command.');
        return;
      }
      targetSection = parsed.section;
      textToAdd = parsed.text;
    }

    onAdd(targetSection, textToAdd);
    setValue('');
    setError('');
    setFlash(HINTS[targetSection]);
    setTimeout(() => setFlash(''), 1500);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setValue('');
      setError('');
      inputRef.current?.blur();
    }
  }

  function handleChange(e) {
    setValue(e.target.value);
    if (error) setError('');
  }

  function handleSelectQuadrant(key) {
    setSelectedQuadrant(key);
    // If input had another slash command, extract and keep the text
    if (parsed) {
      setValue(parsed.text);
    }
    setError('');
    inputRef.current?.focus();
  }

  return (
    <div className="floating-input">
      {flash && <div className="floating-input__flash">Added to {flash}</div>}
      {error && <div className="floating-input__error">{error}</div>}

      <div className="floating-input__card">
        {/* Four Quadrant Toggle Buttons */}
        <div className="floating-input__quadrants" role="tablist" aria-label="Select Quadrant">
          {QUADRANTS.map((q) => {
            const isSelected = activeSection === q.key;
            return (
              <button
                key={q.key}
                type="button"
                className={`floating-input__quadrant-btn${isSelected ? ' floating-input__quadrant-btn--active' : ''}`}
                style={{
                  '--q-color': q.color,
                }}
                onClick={() => handleSelectQuadrant(q.key)}
                aria-selected={isSelected}
                title={`Switch to ${q.label} (or /${q.key[0]})`}
              >
                <span className="floating-input__quadrant-dot" />
                <span className="floating-input__quadrant-label">{q.label}</span>
              </button>
            );
          })}
        </div>

        {/* Input Bar */}
        <div className="floating-input__bar">
          <span
            className="floating-input__tag"
            style={{
              backgroundColor: currentQuadrant.color,
              borderColor: currentQuadrant.color,
              color: '#050505',
            }}
          >
            {HINTS[activeSection]}
          </span>
          <input
            ref={inputRef}
            className="floating-input__input"
            type="text"
            placeholder={`Add to ${HINTS[activeSection]}...`}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="floating-input__submit"
            onClick={handleSubmit}
            aria-label={`Add item to ${HINTS[activeSection]}`}
            style={{
              '--submit-color': currentQuadrant.color,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="7" y1="1" x2="7" y2="13" />
              <line x1="1" y1="7" x2="13" y2="7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
