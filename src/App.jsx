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
          Brain<span className="app__title-dim">Personal Dumping System v1.0</span>
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
