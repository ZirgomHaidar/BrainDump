import { useState, useRef, useEffect, useCallback } from 'react';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const handleCollapse = useCallback(() => {
    if (isCollapsing || !isExpanded) return;
    setIsCollapsing(true);
    setTimeout(() => {
      setIsExpanded(false);
      setIsCollapsing(false);
    }, 200);
  }, [isCollapsing, isExpanded]);

  // Keyboard shortcut: '/' expands & focuses the input
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement === document.body) {
        e.preventDefault();
        setIsExpanded(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-focus input when expanded
  useEffect(() => {
    if (isExpanded && !isCollapsing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isExpanded, isCollapsing]);

  // Click outside listener to collapse back into circle
  useEffect(() => {
    if (!isExpanded || isCollapsing) return;

    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleCollapse();
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [isExpanded, isCollapsing, handleCollapse]);

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

    // Keep expanded and re-focus input for next entry
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setValue('');
      setError('');
      handleCollapse();
    }
  }

  function handleChange(e) {
    setValue(e.target.value);
    if (error) setError('');
  }

  function handleSelectQuadrant(key) {
    setSelectedQuadrant(key);
    if (parsed) {
      setValue(parsed.text);
    }
    setError('');
    inputRef.current?.focus();
  }

  const isOpen = isExpanded || isCollapsing;

  return (
    <div
      ref={containerRef}
      className={`floating-input${isOpen ? ' floating-input--expanded' : ' floating-input--collapsed'}`}
      style={{ '--q-color': currentQuadrant.color }}
    >
      {flash && <div className="floating-input__flash">Added to {flash}</div>}
      {error && <div className="floating-input__error">{error}</div>}

      {!isOpen ? (
        <button
          type="button"
          className="floating-input__fab"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          onMouseEnter={() => setIsExpanded(true)}
          title={`Add item (${currentQuadrant.label}) — press /`}
          aria-label="Add new item"
        >
          <svg
            className="floating-input__fab-icon"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="9" y1="3" x2="9" y2="15" />
            <line x1="3" y1="9" x2="15" y2="9" />
          </svg>
        </button>
      ) : (
        <div
          className={`floating-input__card${isCollapsing ? ' floating-input__card--collapsing' : ' floating-input__card--expanding'}`}
          onClick={(e) => e.stopPropagation()}
        >
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="7" y1="1" x2="7" y2="13" />
                <line x1="1" y1="7" x2="13" y2="7" />
              </svg>
            </button>
            <button
              type="button"
              className="floating-input__collapse-btn"
              onClick={handleCollapse}
              title="Collapse (ESC)"
              aria-label="Collapse input bar"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
