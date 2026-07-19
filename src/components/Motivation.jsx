import { useEffect, useState, useRef, useMemo } from 'react';
import {
  addReflection,
  deleteReflection,
  subscribeToReflections,
  enqueueMotivationImport,
  subscribeToImportQueue,
  dismissImportQueueItem,
} from '../services/storageAdapter';
import { useAuth } from '../hooks/useAuth';
import './Motivation.css';

const CATEGORIES = ['lesson', 'experience', 'motivation', 'principle'];

function isMediaUrl(text) {
  const t = text.trim();
  return (
    /instagram\.com\/(?:share\/)?(?:reels?|p|tv)\/[A-Za-z0-9_-]+/i.test(t) ||
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/i.test(t)
  );
}

function formatDate(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

function QueueItemTimer({ item }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const isCompleted = item.status === 'completed';
  const isFailed = item.status === 'failed';
  const isFinished = isCompleted || isFailed;

  const startMs =
    item.createdAt?.toDate?.()?.getTime() ||
    (typeof item.createdAt === 'number' ? item.createdAt : null) ||
    (item.createdAt ? new Date(item.createdAt).getTime() : null) ||
    item.startedAt?.toDate?.()?.getTime() ||
    (typeof item.startedAt === 'number' ? item.startedAt : null) ||
    (item.startedAt ? new Date(item.startedAt).getTime() : null);

  useEffect(() => {
    if (!startMs) return;

    const calc = () => {
      const endMs =
        isFinished && item.completedAt
          ? item.completedAt?.toDate?.()?.getTime() ||
            (typeof item.completedAt === 'number' ? item.completedAt : new Date(item.completedAt).getTime())
          : Date.now();
      setElapsedSec(Math.max(0, Math.floor((endMs - startMs) / 1000)));
    };

    calc();
    if (isFinished) return;

    const timer = setInterval(calc, 500);
    return () => clearInterval(timer);
  }, [startMs, isFinished, item.completedAt]);

  const finalDuration = item.totalDurationFormatted || item.durationFormatted;

  if (isCompleted && finalDuration) {
    return (
      <span className="motivation__queue-timer motivation__queue-timer--completed">
        {finalDuration}
      </span>
    );
  }

  if (!startMs && !finalDuration) return null;

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <span
      className={`motivation__queue-timer${
        isCompleted ? ' motivation__queue-timer--completed' : ''
      }`}
    >
      {timeStr}
    </span>
  );
}

function useColumnCount() {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const w = window.innerWidth;
    if (w >= 1400) return 4;
    if (w >= 1024) return 3;
    if (w >= 680) return 2;
    return 1;
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      let next = 1;
      if (w >= 1400) next = 4;
      else if (w >= 1024) next = 3;
      else if (w >= 680) next = 2;
      setCols((prev) => (prev !== next ? next : prev));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return cols;
}

function estimateCardHeight(reflection) {
  const text = (reflection.text || '').replace(/^[•\-*]\s*/gm, '');
  const lines = text.split('\n');
  let lineCount = 0;
  for (const line of lines) {
    if (line.trim().length === 0) {
      lineCount += 0.75;
    } else {
      lineCount += Math.max(1, Math.ceil(line.length / 34));
    }
  }
  const textHeight = Math.max(70, lineCount * 24);
  return 124 + textHeight;
}

export default function Motivation() {
  const { isGuest } = useAuth();
  const [reflections, setReflections] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [inputText, setInputText] = useState('');
  const [inputCategory, setInputCategory] = useState('');
  const [dismissedCompleted, setDismissedCompleted] = useState(() => new Set());
  const columnCount = useColumnCount();

  useEffect(() => subscribeToReflections(setReflections, isGuest), [isGuest]);
  useEffect(() => subscribeToImportQueue(setQueueItems, isGuest), [isGuest]);

  const isUrl = isMediaUrl(inputText);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    if (isUrl) {
      await enqueueMotivationImport(text, isGuest);
      setInputText('');
    } else {
      addReflection(text, inputCategory || null, isGuest);
      setInputText('');
      setInputCategory('');
    }
  }

  const observedActiveIds = useRef(new Set());
  const [recentlyCompleted, setRecentlyCompleted] = useState(() => new Map());

  useEffect(() => {
    queueItems.forEach((q) => {
      if (q.status === 'pending' || q.status === 'processing') {
        observedActiveIds.current.add(q.id);
      } else if (q.status === 'completed') {
        if (observedActiveIds.current.has(q.id)) {
          observedActiveIds.current.delete(q.id);
          setRecentlyCompleted((prev) => {
            const next = new Map(prev);
            next.set(q.id, q);
            return next;
          });
          setTimeout(() => {
            setRecentlyCompleted((prev) => {
              if (!prev.has(q.id)) return prev;
              const next = new Map(prev);
              next.delete(q.id);
              return next;
            });
          }, 8000);
        } else {
          // If already in recentlyCompleted, update item in case fields updated
          setRecentlyCompleted((prev) => {
            if (!prev.has(q.id)) return prev;
            const next = new Map(prev);
            next.set(q.id, q);
            return next;
          });
        }
      }
    });
  }, [queueItems]);

  // Active queue includes pending/processing/failed/guest_notice items,
  // plus only items that completed during this session (shown for 8s)
  const activeQueue = [
    ...queueItems.filter(
      (q) =>
        (q.status === 'pending' ||
          q.status === 'processing' ||
          q.status === 'failed' ||
          q.status === 'guest_notice') &&
        !dismissedCompleted.has(q.id)
    ),
    ...Array.from(recentlyCompleted.values()).filter((q) => !dismissedCompleted.has(q.id)),
  ];

  // Dynamic shortest-column packing (Pinterest masonry algorithm)
  // Iterates through reflections in order and assigns each card to whichever column
  // currently has the shortest total height. This ensures columns stay balanced
  // so a tall card doesn't push later cards down into an isolated trailing column.
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => []);
    const colHeights = new Array(columnCount).fill(0);

    reflections.forEach((reflection) => {
      let minColIdx = 0;
      let minHeight = colHeights[0];
      for (let c = 1; c < columnCount; c++) {
        if (colHeights[c] < minHeight) {
          minHeight = colHeights[c];
          minColIdx = c;
        }
      }

      cols[minColIdx].push(reflection);
      colHeights[minColIdx] += estimateCardHeight(reflection) + 20; // 20px is gap
    });

    return cols;
  }, [reflections, columnCount]);

  return (
    <div className="motivation">
      <form className={`motivation__add-bar${isUrl ? ' motivation__add-bar--url-detected' : ''}`} onSubmit={handleSubmit}>
        {!isUrl ? (
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
        ) : (
          <span className="motivation__url-badge">URL</span>
        )}
        <input
          className="motivation__input"
          placeholder={isUrl ? 'Press Enter or click Import to process with local LLaMA...' : 'Add a thought, or paste an Instagram / YouTube link...'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button
          className={`motivation__submit${isUrl ? ' motivation__submit--import' : ''}`}
          type="submit"
        >
          {isUrl ? '⚡ Import' : 'Add'}
        </button>
      </form>

      {/* Active Import Queue Cards */}
      {activeQueue.length > 0 && (
        <div className="motivation__queue-list">
          {activeQueue.map((item) => {
            const isPending = item.status === 'pending';
            const isProcessing = item.status === 'processing';
            const isCompleted = item.status === 'completed';
            const isFailed = item.status === 'failed';
            const isGuestNotice = item.status === 'guest_notice';

            return (
              <div
                key={item.id}
                className={`motivation__queue-card motivation__queue-card--${item.status}`}
              >
                <div className="motivation__queue-header">
                  <div className="motivation__queue-status-line">
                    <span className="motivation__queue-spinner" />
                    <span className="motivation__queue-status-tag">
                      {isProcessing ? 'PROCESSING' : isCompleted ? 'COMPLETED' : isFailed ? 'FAILED' : isGuestNotice ? 'GUEST MODE' : 'QUEUED'}
                    </span>
                    <QueueItemTimer item={item} />
                    <span className="motivation__queue-url" title={item.url}>
                      {item.url}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="motivation__queue-dismiss"
                    onClick={() => {
                      setDismissedCompleted((prev) => new Set(prev).add(item.id));
                      setRecentlyCompleted((prev) => {
                        if (!prev.has(item.id)) return prev;
                        const next = new Map(prev);
                        next.delete(item.id);
                        return next;
                      });
                      dismissImportQueueItem(item.id, isGuest);
                    }}
                    title="Dismiss"
                    aria-label="Dismiss queue item"
                  >
                    ✕
                  </button>
                </div>

                <div className="motivation__queue-step">
                  {item.step || 'Processing on local GPU...'}
                </div>

                {isPending && (
                  <div className="motivation__queue-tip">
                    Ensure your local worker is active: <code>./scripts/start-llama-router.sh --listen</code>
                  </div>
                )}
                {isFailed && item.error && (
                  <div className="motivation__queue-error">{item.error}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reflections.length === 0 ? (
        <div className="motivation__empty">
          Nothing here yet. Start capturing what you learn.
        </div>
      ) : (
        <div className="motivation__masonry">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="motivation__masonry-col">
              {col.map((r) => {
                const category = r.category || 'motivation';
                return (
                  <div key={r.id} className="motivation__card">
                    {/* Upper Message Area matching Image 3 sketch 'Message here' */}
                    <div className="motivation__card-body">
                      <div className="motivation__card-header">
                        <span className="motivation__card-date">
                          {formatDate(r.createdAt)}
                          {r.tokenUsage?.duration_formatted && (
                            <span
                              className="motivation__card-duration"
                              title={
                                r.tokenUsage?.breakdown
                                  ? `Whole duration: ${r.tokenUsage.duration_formatted} (Download: ${r.tokenUsage.breakdown.download_seconds}s${r.tokenUsage.breakdown.audio_seconds ? `, Audio: ${r.tokenUsage.breakdown.audio_seconds}s` : ''}, Vision: ${r.tokenUsage.breakdown.stage1_seconds || 0}s, Distill: ${r.tokenUsage.breakdown.stage2_seconds || 0}s)`
                                  : `Whole duration: ${r.tokenUsage.duration_formatted}`
                              }
                            >
                              •
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="motivation__card-duration-icon"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {r.tokenUsage.duration_formatted}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          className="motivation__card-delete"
                          onClick={() => deleteReflection(r.id, isGuest)}
                          title="Delete reflection"
                          aria-label="Delete reflection"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <line x1="2" y1="2" x2="10" y2="10" strokeLinecap="round" />
                            <line x1="10" y1="2" x2="2" y2="10" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <p className="motivation__card-text">
                        {r.text ? r.text.replace(/^[•\-*]\s*/gm, '') : ''}
                      </p>
                    </div>

                    {/* Bottom Badges matching Image 3 sketch [MOTIVA] [imported from] */}
                    <div className="motivation__card-footer">
                      <span className={`motivation__pill motivation__pill--${category}`}>
                        <span className="motivation__pill-dot" />
                        <span>{category.toUpperCase()}</span>
                      </span>

                      {r.sourceUrl ? (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="motivation__pill motivation__pill--source"
                          title={r.sourceUrl}
                        >
                          <svg
                            className="motivation__pill-icon"
                            width="9"
                            height="9"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M1 9L9 1M9 1H3M9 1V7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>
                            {r.author ? `@${r.author}` : (r.sourcePlatform || 'Source')}
                          </span>
                        </a>
                      ) : (
                        <span className="motivation__pill motivation__pill--manual">
                          PERSONAL
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
