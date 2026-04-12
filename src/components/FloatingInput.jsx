import { useState, useRef, useEffect } from 'react';

const ALIASES = { t: 'todos', d: 'decisions', i: 'ideas', l: 'letgo' };
const VALID_SECTIONS = ['todos', 'decisions', 'ideas', 'letgo'];

const HINTS = {
  todos:     'TO-DOs',
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

  function handleSubmit() {
    const parsed = parse(value);

    if (!parsed) {
      setError('Start with /t · /d · /i · /l — e.g. /t Buy milk');
      return;
    }
    if (!VALID_SECTIONS.includes(parsed.section)) {
      setError('Unknown section. Use: /t · /d · /i · /l');
      return;
    }
    if (!parsed.text) {
      setError('Add some text after the section command.');
      return;
    }

    onAdd(parsed.section, parsed.text);
    setValue('');
    setError('');
    setFlash(HINTS[parsed.section]);
    setTimeout(() => setFlash(''), 1500);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') { setValue(''); setError(''); inputRef.current?.blur(); }
  }

  function handleChange(e) {
    setValue(e.target.value);
    if (error) setError('');
  }

  // Derive inline section tag from typed command
  const parsed = parse(value);
  const activeSection = parsed && VALID_SECTIONS.includes(parsed.section) ? parsed.section : null;

  return (
    <div className="floating-input">
      {flash && <div className="floating-input__flash">Added to {flash}</div>}
      {error && <div className="floating-input__error">{error}</div>}

      <div className={`floating-input__bar${activeSection ? ` floating-input__bar--${activeSection}` : ''}`}>
        {activeSection && (
          <span className="floating-input__tag">{HINTS[activeSection]}</span>
        )}
        <input
          ref={inputRef}
          className="floating-input__input"
          type="text"
          placeholder="/t · /d · /i · /l"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="floating-input__submit" onClick={handleSubmit} aria-label="Add item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="7" y1="1" x2="7" y2="13" />
            <line x1="1" y1="7" x2="13" y2="7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
