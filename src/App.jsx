import { useEffect, useState } from 'react';
import { addItem, deleteItem, updateItem, subscribeToItems } from './firebase';
import Section from './components/Section';
import DateStrip from './components/DateStrip';
import './App.css';

const SECTIONS = [
  { key: 'todos',     title: 'TO-DOs',    subtitle: 'Small tasks and urgent things to get done.' },
  { key: 'decisions', title: 'DECISIONS', subtitle: 'Unresolved choices weighing on your mind.' },
  { key: 'ideas',     title: 'IDEAS',     subtitle: 'Creative thoughts or projects worth exploring.' },
  { key: 'letgo',     title: 'LET GO',    subtitle: 'Things worrying you that are out of your control.' },
];

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayStr = () => toLocalDateStr(new Date());

export default function App() {
  const [items, setItems]   = useState([]);
  const [syncing, setSyncing] = useState(true);
  const [error, setError]   = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const isToday = selectedDate === todayStr();

  useEffect(() => {
    setSyncing(true);
    const unsubscribe = subscribeToItems(selectedDate, (allItems) => {
      setItems(allItems);
      setSyncing(false);
    });
    return unsubscribe;
  }, [selectedDate]);

  const handleAdd    = (section, text) => addItem(section, text, selectedDate).catch(e => setError(e.message));
  const handleDelete = (id)            => deleteItem(id).catch(e => setError(e.message));
  const handleToggle = (id, field, v)  => updateItem(id, { [field]: v }).catch(e => setError(e.message));
  const handleEdit   = (id, text)      => updateItem(id, { text }).catch(e => setError(e.message));

  const itemsBySection = key => items.filter(i => i.section === key);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <svg className="app__logo" viewBox="0 0 32 32" fill="none" strokeWidth="1.5">
            <path d="M16 6C11.5817 6 8 9.58172 8 14C8 18.4183 11.5817 22 16 22V6Z" />
            <path d="M16 6C20.4183 6 24 9.58172 24 14C24 18.4183 20.4183 22 16 22V6Z" />
            <path d="M12 22C12 24.2091 13.7909 26 16 26C18.2091 26 20 24.2091 20 22" />
            <path d="M12 14H20" />
            <path d="M16 10V18" />
          </svg>
          <div className="app__title-info">
            BRAIN
            <span className="app__title-dim">Personal Dumping System v1.0</span>
          </div>
        </h1>
        <div className="app__sync-indicator">
          <span
            className={`app__sync-dot${syncing ? ' app__sync-dot--loading' : ' app__sync-dot--live'}`}
            title={syncing ? 'Connecting...' : 'Live sync active'}
          />
          <span className="app__sync-label">{syncing ? 'Connecting...' : 'Live'}</span>
        </div>
      </header>

      {error && (
        <div className="app__error">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <DateStrip selectedDate={selectedDate} onChange={setSelectedDate} />

      <main className="app__grid">
        {SECTIONS.map(({ key, title, subtitle }) => (
          <Section
            key={key}
            sectionKey={key}
            title={title}
            subtitle={subtitle}
            items={itemsBySection(key)}
            onAdd={text => handleAdd(key, text)}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onEdit={handleEdit}
            readOnly={!isToday}
          />
        ))}
      </main>
    </div>
  );
}
