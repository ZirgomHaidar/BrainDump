import { useState, useEffect, useRef } from 'react';
import JournalCalendar from './JournalCalendar';
import JournalEntry from './JournalEntry';
import { saveJournalEntry, subscribeToJournalEntry, subscribeToJournalDates } from '../firebase';
import './Journal.css';

const todayStr = () => {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function Journal() {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [entryDates, setEntryDates] = useState([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const userEditingRef = useRef(false);
  const saveTimerRef   = useRef(null);
  const textRef        = useRef('');   // mirrors text state for use inside closures
  const prevDateRef    = useRef(selectedDate);
  const isMountedRef   = useRef(true);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  useEffect(() => subscribeToJournalDates(setEntryDates), []);

  useEffect(() => {
    const prevDate = prevDateRef.current;
    prevDateRef.current = selectedDate;

    // #2 — flush pending save to the previous date before switching
    if (userEditingRef.current && prevDate !== selectedDate) {
      clearTimeout(saveTimerRef.current);
      saveJournalEntry(prevDate, textRef.current).catch(console.error);
      userEditingRef.current = false;
    }

    setText('');
    return subscribeToJournalEntry(selectedDate, (t) => {
      if (!userEditingRef.current) setText(t);
    });
  }, [selectedDate]);

  const handleChange = (val) => {
    textRef.current = val;
    setText(val);
    userEditingRef.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // #3 — guard against calling setState on unmounted component
      if (!isMountedRef.current) return;
      setSaving(true);
      await saveJournalEntry(selectedDate, val).catch(console.error);
      if (!isMountedRef.current) return;
      setSaving(false);
      userEditingRef.current = false;
    }, 1000);
  };

  // flush pending save on unmount
  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    if (userEditingRef.current) {
      saveJournalEntry(prevDateRef.current, textRef.current).catch(console.error);
    }
  }, []);

  return (
    <div className="journal">
      <div className="journal__cal-pane">
        <JournalCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          entryDates={entryDates}
        />
      </div>
      <div className="journal__entry-pane">
        <JournalEntry
          date={selectedDate}
          text={text}
          onChange={handleChange}
          saving={saving}
        />
      </div>
    </div>
  );
}
