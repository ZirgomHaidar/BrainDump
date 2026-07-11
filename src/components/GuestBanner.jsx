import { useState } from 'react';
import { clearGuestSampleData, setBannerDismissed } from '../services/guestStorage';
import './GuestBanner.css';

const TAB_INFO = {
  brain: {
    title: 'Brain Dump',
    badge: '4 Daily Buckets',
    desc: (
      <>
        Zero-guilt daily decluttering. Sort thoughts into 4 buckets: <strong>TO-DOs</strong> (urgent daily tasks), <strong>DECISIONS</strong> (unresolved choices to highlight priority), <strong>IDEAS</strong> (creative sparks to refine), and <strong>LET GO</strong> (worries outside your control to cross out). Use the bottom floating bar to quickly add entries.
      </>
    ),
  },
  weekly: {
    title: 'Weekly Plan',
    badge: '7-Day Horizon',
    desc: (
      <>
        Distribute your commitments across Monday–Sunday. Click <strong>+</strong> on any day to schedule items, click <strong>[□ / ■]</strong> to check them off, and navigate weeks with <strong>‹ Prev / Next ›</strong> (or keyboard shortcuts <strong>Ctrl + ,</strong> / <strong>Ctrl + .</strong>).
      </>
    ),
  },
  motivation: {
    title: 'Motivation',
    badge: 'Mindset & Wisdom',
    desc: (
      <>
        Your personal reservoir for lasting wisdom and mental clarity. Capture lessons, experiences, and principles with category tags (<code>lesson</code>, <code>experience</code>, <code>motivation</code>, <code>principle</code>) to keep core truths accessible.
      </>
    ),
  },
};

export default function GuestBanner({ activeTab = 'brain', onSelectTab, onDismiss }) {
  const [cleared, setCleared] = useState(false);

  const handleClearSample = () => {
    clearGuestSampleData();
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  const handleDismiss = () => {
    setBannerDismissed(true);
    if (onDismiss) onDismiss();
  };

  const currentTabInfo = TAB_INFO[activeTab] || TAB_INFO.brain;

  return (
    <div className="guest-banner">
      <div className="guest-banner__top">
        <div className="guest-banner__header">
          <span className="guest-banner__tag">GUEST MODE</span>
          <span className="guest-banner__sub">Offline Sandbox · Local Storage</span>
        </div>

        <div className="guest-banner__actions">
          <button
            className="guest-banner__btn guest-banner__btn--clear"
            onClick={handleClearSample}
            title="Remove initial guide sample cards across all tabs"
          >
            {cleared ? 'Cleared!' : 'Clear Sample Cards'}
          </button>
          <button
            className="guest-banner__btn guest-banner__btn--dismiss"
            onClick={handleDismiss}
            title="Dismiss guide banner"
            aria-label="Dismiss guide banner"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="guest-banner__tabs-nav">
        {Object.entries(TAB_INFO).map(([key, tab]) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              className={`guest-banner__tab-chip${isActive ? ' guest-banner__tab-chip--active' : ''}`}
              onClick={() => onSelectTab && onSelectTab(key)}
            >
              <span className="guest-banner__tab-dot" />
              <span className="guest-banner__tab-name">{tab.title}</span>
              <span className="guest-banner__tab-badge">{tab.badge}</span>
            </button>
          );
        })}
      </div>

      <p className="guest-banner__text">
        {currentTabInfo.desc}
      </p>
    </div>
  );
}
