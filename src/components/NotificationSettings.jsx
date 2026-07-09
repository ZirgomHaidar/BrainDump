import { useState, useEffect } from 'react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  getNotificationSettings,
  saveNotificationSettings,
  triggerPendingTasksNotification,
  triggerGentleReminderNotification,
  triggerInactivityNotification,
  triggerWeeklyDigestNotification,
  calculatePendingTasks,
  calculateWeeklySummary,
} from '../services/notificationService';
import {
  subscribeToPush,
  unsubscribeFromPush,
  getExistingPushSubscription,
} from '../services/pushSubscriptionService';
import './NotificationSettings.css';

export default function NotificationSettings({ isOpen, onClose, items = [] }) {
  const [permission, setPermission] = useState(getNotificationPermission);
  const [settings, setSettings] = useState(getNotificationSettings);
  const [feedback, setFeedback] = useState('');
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isPushActive, setIsPushActive] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);

  const showFeedback = (msg) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback((current) => (current === msg ? '' : current));
    }, 4000);
  };

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setPermission(getNotificationPermission());
      setSettings(getNotificationSettings());
    }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      getExistingPushSubscription().then((sub) => {
        setIsPushActive(!!sub);
      });
    }
  }, [isOpen]);

  const updateSetting = (key, val) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    saveNotificationSettings(updated);
    if (isPushActive) {
      subscribeToPush(updated).catch(console.warn);
    }
  };

  const handleToggleServerPush = async (e) => {
    const enable = e.target.checked;
    setIsPushLoading(true);
    try {
      if (enable) {
        await subscribeToPush(settings);
        setIsPushActive(true);
        updateSetting('enabled', true);
        showFeedback('Server Push active! Device registered with cloud cron.');
      } else {
        await unsubscribeFromPush();
        setIsPushActive(false);
        showFeedback('Server Push disabled for this device.');
      }
    } catch (err) {
      console.error('Push registration error:', err);
      showFeedback(`Error: ${err.message}`);
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      updateSetting('enabled', true);
      showFeedback('Notifications enabled & permission granted');
    } else {
      showFeedback(`Permission ${res}`);
    }
  };

  const ensurePermissionAndSend = async (sendFn) => {
    let currentPerm = getNotificationPermission();
    if (currentPerm === 'unsupported') {
      showFeedback('Notifications are not supported in this browser.');
      return;
    }
    if (currentPerm === 'default') {
      currentPerm = await requestNotificationPermission();
      setPermission(currentPerm);
    }
    if (currentPerm !== 'granted') {
      showFeedback(
        currentPerm === 'denied'
          ? 'Notifications blocked! Allow notifications in your browser address bar settings.'
          : 'Permission not granted.'
      );
      return;
    }
    setPermission('granted');
    const success = await sendFn();
    if (success) {
      showFeedback('Notification sent! Check your system banner.');
    } else {
      showFeedback('Failed to display notification. Check system settings.');
    }
  };

  // ── Test Triggers ───────────────────────────────────────
  const testPendingTasks = () => ensurePermissionAndSend(() => {
    const count = calculatePendingTasks(items, []);
    const testCount = count > 0 ? count : 3;
    return triggerPendingTasksNotification('morning', testCount);
  });

  const testGentleReminder = () => ensurePermissionAndSend(() => {
    return triggerGentleReminderNotification('noon');
  });

  const testInactivity = () => ensurePermissionAndSend(() => {
    return triggerInactivityNotification();
  });

  const testWeeklyDigest = () => ensurePermissionAndSend(() => {
    const stats = calculateWeeklySummary(items, []);
    const testStats = stats.dumped > 0 ? stats : { dumped: 12, completed: 8, letGo: 3 };
    return triggerWeeklyDigestNotification(testStats);
  });

  const isGranted = permission === 'granted';
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );

  if (!isOpen) return null;

  return (
    <div className="notif-modal__overlay" onClick={onClose}>
      <div className="notif-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notif-modal__header">
          <div className="notif-modal__title-group">
            <h2 className="notif-modal__title">NOTIFICATIONS</h2>
            <span className="notif-modal__subtitle">Skeletal Alert System</span>
          </div>
          <button className="notif-modal__close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {feedback && <div className="notif-modal__feedback">{feedback}</div>}

        {/* Permission Banner */}
        <div className="notif-modal__status-box">
          <div className="notif-modal__status-info">
            <span className="notif-modal__status-label">Browser Permission:</span>
            <span
              className={`notif-modal__badge notif-modal__badge--${
                isGranted ? 'granted' : permission === 'denied' ? 'denied' : 'default'
              }`}
            >
              {permission.toUpperCase()}
            </span>
          </div>
          {!isGranted && (
            <button className="notif-modal__btn notif-modal__btn--primary" onClick={handleRequestPermission}>
              Enable in Browser
            </button>
          )}
        </div>

        {/* Master Toggle */}
        <div className="notif-modal__row notif-modal__row--master">
          <div>
            <div className="notif-modal__row-label">Scheduled Notifications</div>
            <div className="notif-modal__row-desc">Enable background interval scheduler</div>
          </div>
          <label className="notif-modal__switch">
            <input
              type="checkbox"
              checked={settings.enabled && isGranted}
              disabled={!isGranted}
              onChange={(e) => updateSetting('enabled', e.target.checked)}
            />
            <span className="notif-modal__slider" />
          </label>
        </div>

        {/* Server-Side Push (Closed Browser) */}
        <div className="notif-modal__row notif-modal__row--server">
          <div className="notif-modal__row-info">
            <div className="notif-modal__row-label-group">
              <span className="notif-modal__row-label">Cloud Push (Closed Browser)</span>
              <span className={`notif-modal__badge notif-modal__badge--${isPushActive ? 'granted' : 'default'}`}>
                {isPushLoading ? 'SYNCING...' : isPushActive ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="notif-modal__row-desc">
              Receive alerts via GitHub Actions even when browser or tab is closed.
            </div>
          </div>
          <label className="notif-modal__switch">
            <input
              type="checkbox"
              checked={isPushActive}
              disabled={!isGranted || isPushLoading}
              onChange={handleToggleServerPush}
            />
            <span className="notif-modal__slider" />
          </label>
        </div>

        {/* Notification Categories */}
        <div className="notif-modal__section-title">CHANNELS & SCHEDULES</div>

        <div className="notif-modal__list">
          {/* Rule 1: Pending Tasks */}
          <div className="notif-modal__item">
            <div className="notif-modal__item-info">
              <div className="notif-modal__item-title">1. Pending Tasks Count</div>
              <div className="notif-modal__item-desc">
                Daily summaries at <strong>08:00</strong>, <strong>12:30</strong>, and <strong>17:00</strong> with uncompleted tasks.
              </div>
            </div>
            <div className="notif-modal__item-actions">
              <button
                className="notif-modal__test-btn"
                onClick={testPendingTasks}
                title="Send test notification now"
              >
                Test
              </button>
              <label className="notif-modal__switch">
                <input
                  type="checkbox"
                  checked={settings.pendingTasks}
                  disabled={!isGranted || !settings.enabled}
                  onChange={(e) => updateSetting('pendingTasks', e.target.checked)}
                />
                <span className="notif-modal__slider" />
              </label>
            </div>
          </div>

          {/* Rule 2: Gentle Reminders */}
          <div className="notif-modal__item">
            <div className="notif-modal__item-info">
              <div className="notif-modal__item-title">2. Gentle Mind Reminders</div>
              <div className="notif-modal__item-desc">
                "Brain heavy? Dump here. No guilt if ignore." at <strong>12:00</strong> & <strong>18:00</strong>.
              </div>
            </div>
            <div className="notif-modal__item-actions">
              <button
                className="notif-modal__test-btn"
                onClick={testGentleReminder}
                title="Send test notification now"
              >
                Test
              </button>
              <label className="notif-modal__switch">
                <input
                  type="checkbox"
                  checked={settings.gentleReminders}
                  disabled={!isGranted || !settings.enabled}
                  onChange={(e) => updateSetting('gentleReminders', e.target.checked)}
                />
                <span className="notif-modal__slider" />
              </label>
            </div>
          </div>

          {/* Rule 3: Inactivity Check */}
          <div className="notif-modal__item">
            <div className="notif-modal__item-info">
              <div className="notif-modal__item-title">3. 5-Day Inactivity Check</div>
              <div className="notif-modal__item-desc">
                "Still care about this, or throw in fire?" prompt when no dump for 5+ days.
              </div>
            </div>
            <div className="notif-modal__item-actions">
              <button
                className="notif-modal__test-btn"
                onClick={testInactivity}
                title="Send test notification now"
              >
                Test
              </button>
              <label className="notif-modal__switch">
                <input
                  type="checkbox"
                  checked={settings.inactivity}
                  disabled={!isGranted || !settings.enabled}
                  onChange={(e) => updateSetting('inactivity', e.target.checked)}
                />
                <span className="notif-modal__slider" />
              </label>
            </div>
          </div>

          {/* Rule 4: Sunday Digest */}
          <div className="notif-modal__item">
            <div className="notif-modal__item-info">
              <div className="notif-modal__item-title">4. Sunday Weekly Digest</div>
              <div className="notif-modal__item-desc">
                Sunday morning (<strong>09:00</strong>) breakdown of items dumped, completed, or let go.
              </div>
            </div>
            <div className="notif-modal__item-actions">
              <button
                className="notif-modal__test-btn"
                onClick={testWeeklyDigest}
                title="Send test notification now"
              >
                Test
              </button>
              <label className="notif-modal__switch">
                <input
                  type="checkbox"
                  checked={settings.weeklyDigest}
                  disabled={!isGranted || !settings.enabled}
                  onChange={(e) => updateSetting('weeklyDigest', e.target.checked)}
                />
                <span className="notif-modal__slider" />
              </label>
            </div>
          </div>
        </div>

        {/* iOS Notice if opened in regular Safari */}
        {isIOS && !isStandalone && (
          <div className="notif-modal__ios-note">
            <strong>iOS Setup:</strong> Apple requires adding BrainDump to your Home Screen (tap <strong>Share ➔ Add to Home Screen</strong>) to receive notifications.
          </div>
        )}

        {/* Footer info */}
        <div className="notif-modal__footer">
          Notifications fire automatically via the PWA service worker while the app or browser is active.
        </div>
      </div>
    </div>
  );
}
