import { useEffect, useRef, useState } from 'react';
import { addItem, deleteItem, updateItem, subscribeToItems, subscribeToActiveDates } from './services/storageAdapter';
import { useAuth } from './hooks/useAuth';
import { isBannerDismissed } from './services/guestStorage';
import Section from './components/Section';
import DateStrip from './components/DateStrip';
import FloatingInput from './components/FloatingInput';
import WeeklyPlan from './components/WeeklyPlan';
import Motivation from './components/Motivation';
import NotificationSettings from './components/NotificationSettings';
import GuestBanner from './components/GuestBanner';
import MigrationModal from './components/MigrationModal';
import DashboardHUD from './components/DashboardHUD';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import { getNotificationSettings } from './services/notificationService';
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
  const { isGuest, showMigration, setShowMigration, signIn, signOut, exitGuest } = useAuth();
  const [activeTab, setActiveTab] = useState('weekly');
  const [items, setItems]   = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError]   = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [activeDates, setActiveDates] = useState(() => [todayStr()]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => getNotificationSettings().enabled);
  const [bannerDismissed, setBannerDismissed] = useState(() => isBannerDismissed());
  const topBarRef = useRef(null);

  useNotificationScheduler(activeDates);

  useEffect(() => {
    if (!topBarRef.current) return;
    const updateHeight = () => {
      if (topBarRef.current) {
        document.documentElement.style.setProperty(
          '--app-top-height',
          `${topBarRef.current.offsetHeight}px`
        );
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(topBarRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const up   = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const isToday = selectedDate === todayStr();

  const handleDateChange = (date) => {
    if (date !== selectedDate) {
      if (!isGuest) setSyncing(true);
      setSelectedDate(date);
    }
  };

  useEffect(() => {
    const today = todayStr();
    return subscribeToActiveDates((dates) => {
      const merged = Array.from(new Set([...dates, today])).sort();
      setActiveDates(merged);
    }, isGuest);
  }, [isGuest]);

  useEffect(() => {
    const unsubscribe = subscribeToItems(selectedDate, (allItems) => {
      setItems(allItems);
      setSyncing(false);
    }, isGuest);
    return unsubscribe;
  }, [selectedDate, isGuest]);

  const handleAdd    = (section, text) => addItem(section, text, selectedDate, isGuest).catch(e => setError(e.message));
  const handleDelete = (id)            => deleteItem(id, isGuest).catch(e => setError(e.message));
  const handleToggle = (id, field, v)  => updateItem(id, { [field]: v }, isGuest).catch(e => setError(e.message));
  const handleEdit   = (id, text)      => updateItem(id, { text }, isGuest).catch(e => setError(e.message));

  const itemsBySection = key => items.filter(i => i.section === key);

  return (
    <div className="app">
      <div className="app__top" ref={topBarRef}>
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
              BRAINDUMP
              <span className="app__title-dim">Personal Dumping System v1.0</span>
            </div>
          </h1>
          <div className="app__header-right">
            <button
              className={`app__hud-btn${isDashboardOpen ? ' app__hud-btn--active' : ''}`}
              onClick={() => setIsDashboardOpen(prev => !prev)}
              title="Dashboard Overview"
              aria-label="Dashboard Overview"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
            </button>

            <button
              className={`app__notif-btn${notifEnabled ? ' app__notif-btn--active' : ''}`}
              onClick={() => setIsNotifOpen(true)}
              title="Notification Settings"
              aria-label="Notification Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            {isGuest ? (
              <>
                <div className="app__guest-indicator" title="Operating offline — saved locally in browser">
                  <span className="app__guest-dot" />
                  <span className="app__guest-label">Guest</span>
                </div>
                <div className="app__guest-actions">
                  <button className="app__signin-btn" onClick={signIn} title="Sign in with Google to cloud sync">
                    Sign In
                  </button>
                  <button className="app__exit-guest" onClick={exitGuest} title="Exit Guest Mode">
                    Exit
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="app__sync-indicator">
                  <span
                    className={`app__sync-dot${syncing ? ' app__sync-dot--loading' : ' app__sync-dot--live'}`}
                    title={syncing ? 'Connecting...' : 'Live sync active'}
                  />
                  <span className="app__sync-label">{syncing ? 'Connecting...' : 'Live'}</span>
                </div>
                <button className="app__signout" onClick={signOut} title="Sign out">
                  Sign out
                </button>
              </>
            )}
          </div>
        </header>

        <nav className="app__tabs">
          <button
            className={`app__tab${activeTab === 'brain' ? ' app__tab--active' : ''}`}
            onClick={() => setActiveTab('brain')}
          >
            Brain Dump
          </button>
          <button
            className={`app__tab${activeTab === 'weekly' ? ' app__tab--active' : ''}`}
            onClick={() => setActiveTab('weekly')}
          >
            Weekly
          </button>
          <button
            className={`app__tab${activeTab === 'motivation' ? ' app__tab--active' : ''}`}
            onClick={() => setActiveTab('motivation')}
          >
            Motivation
          </button>
        </nav>

        {activeTab === 'brain' && (
          <DateStrip selectedDate={selectedDate} onChange={handleDateChange} activeDates={activeDates} />
        )}
      </div>

      {isGuest && !bannerDismissed && (
        <GuestBanner
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {!isOnline && (
        <div className="app__offline-banner">
          Offline — changes will sync when connection returns
        </div>
      )}

      {error && (
        <div className="app__error">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {activeTab === 'brain' && (
        <>
          <main className="app__grid">
            {SECTIONS.map(({ key, title, subtitle }) => (
              <Section
                key={key}
                sectionKey={key}
                title={title}
                subtitle={subtitle}
                items={itemsBySection(key)}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onEdit={handleEdit}
                readOnly={!isToday}
              />
            ))}
          </main>
          {isToday && <FloatingInput onAdd={handleAdd} />}
        </>
      )}

      {activeTab === 'weekly'     && <WeeklyPlan />}
      {activeTab === 'motivation' && <Motivation />}

      <NotificationSettings
        isOpen={isNotifOpen}
        onClose={() => {
          setIsNotifOpen(false);
          setNotifEnabled(getNotificationSettings().enabled);
        }}
        items={items}
        isGuest={isGuest}
      />

      <DashboardHUD
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        isGuest={isGuest}
        activeDates={activeDates}
        syncing={syncing}
      />

      <MigrationModal
        isOpen={showMigration}
        onClose={() => setShowMigration(false)}
        onComplete={() => setShowMigration(false)}
      />
    </div>
  );
}
