const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function JournalEntry({ date, text, onChange, saving }) {
  return (
    <div className="jentry">
      <div className="jentry__prompt">
        <span className="jentry__prompt-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
        </span>
        <div className="jentry__prompt-info">
          <div className="jentry__prompt-title">How was your day?</div>
          <div className="jentry__prompt-date">{formatDate(date)}</div>
        </div>
        {saving && <span className="jentry__saving">saving…</span>}
      </div>

      <textarea
        className="jentry__textarea"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write about your day, thoughts, feelings, or anything you want to remember..."
      />
    </div>
  );
}
