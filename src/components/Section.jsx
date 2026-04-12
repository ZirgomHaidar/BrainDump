import { useState, useRef, useEffect, useCallback } from 'react';

const ACTION_CONFIG = {
  todos:     { field: 'done',        progressLabel: 'done' },
  decisions: { field: 'done',        progressLabel: 'decided' },
  ideas:     { field: 'highlighted', progressLabel: 'starred' },
  letgo:     { field: 'crossedOut',  progressLabel: 'released' },
};

const EMPTY_PROMPTS = {
  todos:     'Write down small tasks and urgent things to get done.\nPick 1–3 to tackle today.',
  decisions: 'List unresolved choices weighing on your mind.\nChoose one to focus on this week.',
  ideas:     'Capture creative thoughts or projects worth exploring.\nHighlight one to develop further.',
  letgo:     "Write anything worrying you that's out of your control.\nCross it out — it doesn't belong in your head.",
};

const TOGGLE_ICONS = {
  todos:     { inactive: '□', active: '■' },
  decisions: { inactive: '○', active: '●' },
  ideas:     { inactive: '◇', active: '◆' },
  letgo:     { inactive: '×', active: '✦' },
};

// Swipe threshold in px before triggering delete
const SWIPE_THRESHOLD = 75;

export default function Section({ title, subtitle, sectionKey, items, onDelete, onToggle, onEdit, readOnly }) {
  const [editingId, setEditingId]     = useState(null);
  const [editingText, setEditingText] = useState('');
  const [exitingIds, setExitingIds]   = useState(new Set());

  const editInputRef = useRef(null);
  const lastTapRef   = useRef({ id: null, time: 0 });

  // Swipe state: { [itemId]: { startX, startY, translateX, isHorizontal } }
  const swipeState = useRef({});
  // DOM refs for each item
  const itemRefs   = useRef({});

  const config = ACTION_CONFIG[sectionKey];
  const icons  = TOGGLE_ICONS[sectionKey];

  const total = items.length;
  const done  = items.filter(i => i[config.field]).length;
  const progressPct = total > 0 ? (done / total) * 100 : 0;

  // Auto-focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // ── Delete (with exit animation) ─────────────────────
  const triggerDelete = useCallback((id) => {
    setExitingIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      onDelete(id);
      setExitingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 200);
  }, [onDelete]);

  // ── Inline editing ────────────────────────────────────
  function startEdit(item) {
    setEditingId(item.id);
    setEditingText(item.text);
  }

  function commitEdit() {
    if (!editingId) return;
    const text = editingText.trim();
    if (text && text !== items.find(i => i.id === editingId)?.text) {
      onEdit(editingId, text);
    }
    setEditingId(null);
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditingId(null); }
  }

  // Double-click (desktop)
  function handleTextDoubleClick(item) {
    if (!item[config.field]) startEdit(item); // don't edit completed items
  }

  // Double-tap (mobile)
  function handleTouchEndText(e, item) {
    if (item[config.field]) return;
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.id === item.id && now - last.time < 350) {
      e.preventDefault();
      startEdit(item);
      lastTapRef.current = { id: null, time: 0 };
    } else {
      lastTapRef.current = { id: item.id, time: now };
    }
  }

  // ── Swipe-to-delete ───────────────────────────────────
  function handleTouchStart(e, id) {
    const touch = e.touches[0];
    swipeState.current[id] = {
      startX: touch.clientX,
      startY: touch.clientY,
      translateX: 0,
      isHorizontal: null,
    };
  }

  function handleTouchMove(e, id) {
    const state = swipeState.current[id];
    if (!state) return;
    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    // Determine gesture direction on first meaningful move
    if (state.isHorizontal === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      state.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }

    if (!state.isHorizontal) return; // let vertical scroll through

    e.preventDefault(); // block scroll when swiping horizontally
    const translate = Math.min(0, dx); // only allow leftward swipe
    state.translateX = translate;

    const el = itemRefs.current[id];
    if (el) {
      el.style.transform = `translateX(${translate}px)`;
      el.style.transition = 'none';
    }
  }

  function handleTouchEnd(e, id) {
    const state = swipeState.current[id];
    if (!state || !state.isHorizontal) return;

    const el = itemRefs.current[id];
    if (state.translateX < -SWIPE_THRESHOLD) {
      // Commit delete
      if (el) {
        el.style.transition = 'transform 0.18s ease';
        el.style.transform = 'translateX(-100%)';
      }
      setTimeout(() => triggerDelete(id), 160);
    } else {
      // Snap back
      if (el) {
        el.style.transition = 'transform 0.25s ease';
        el.style.transform = 'translateX(0)';
      }
    }
    delete swipeState.current[id];
  }

  return (
    <div className={`section section--${sectionKey}`}>

      {/* Header */}
      <div className="section__header">
        <div className="section__header-row">
          <h2 className="section__title">{title}</h2>
          {total > 0 && (
            <span className="section__progress-text">
              {done}/{total} {config.progressLabel}
            </span>
          )}
        </div>
        {subtitle && <p className="section__subtitle">{subtitle}</p>}
        {readOnly && <span className="section__readonly-badge">Past day — read only</span>}
        {total > 0 && (
          <div className="section__progress-bar-track">
            <div
              className="section__progress-bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Item list */}
      <ul className="section__list">
        {total === 0 && (
          <li className="section__empty">{EMPTY_PROMPTS[sectionKey]}</li>
        )}

        {items.map((item) => {
          const isActive  = item[config.field];
          const isExiting = exitingIds.has(item.id);
          const isEditing = editingId === item.id;

          return (
            <li key={item.id} className="section__item-wrapper">
              {/* Item row */}
              <div
                ref={el => { itemRefs.current[item.id] = el; }}
                className={`section__item${isActive ? ' section__item--active' : ''}${isExiting ? ' section__item--exiting' : ''}`}
                onTouchStart={!readOnly ? e => handleTouchStart(e, item.id) : undefined}
                onTouchMove={!readOnly ? e => handleTouchMove(e, item.id) : undefined}
                onTouchEnd={!readOnly ? e => handleTouchEnd(e, item.id) : undefined}
              >
                {/* Toggle */}
                <button
                  className={`section__toggle${isActive ? ' section__toggle--active' : ''}`}
                  onClick={() => onToggle(item.id, config.field, !isActive)}
                  aria-label={isActive ? 'Mark incomplete' : 'Mark complete'}
                >
                  <span className="section__toggle-inner">
                    {isActive ? icons.active : icons.inactive}
                  </span>
                </button>

                {/* Text / Edit input */}
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    className="section__text-input"
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                  />
                ) : (
                  <span
                    className={`section__text${!isActive ? ' section__text--editable' : ''}`}
                    onDoubleClick={!readOnly ? () => handleTextDoubleClick(item) : undefined}
                    onTouchEnd={!readOnly ? e => handleTouchEndText(e, item) : undefined}
                    title={!isActive ? 'Double-click to edit' : undefined}
                  >
                    {item.text}
                  </span>
                )}

              </div>

              {/* Delete zone — flex sibling to the right, revealed on swipe or click */}
              {!readOnly && (
                <div className="section__swipe-delete" onClick={() => triggerDelete(item.id)} role="button" aria-label="Delete item">Delete</div>
              )}
            </li>
          );
        })}
      </ul>

    </div>
  );
}
