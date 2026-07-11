import { useState } from 'react';
import { migrateGuestDataToFirestore, clearAllGuestStorage } from '../services/guestStorage';
import { addItem, addWeeklyItem, addReflection } from '../firebase';
import './MigrationModal.css';

export default function MigrationModal({ isOpen, onClose, onComplete }) {
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    setMigrating(true);
    setError(null);
    try {
      await migrateGuestDataToFirestore({ addItem, addWeeklyItem, addReflection });
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      console.error('Migration failed:', err);
      setError('Failed to import entries. Please try again.');
      setMigrating(false);
    }
  };

  const handleStartFresh = () => {
    clearAllGuestStorage();
    if (onComplete) onComplete();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={() => !migrating && onClose()}>
      <div className="migration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="migration-modal__header">
          <h2 className="migration-modal__title">Import Guest Entries?</h2>
          <span className="migration-modal__tag">LOCAL → CLOUD</span>
        </div>

        <p className="migration-modal__body">
          We found brain dump entries created during your guest session. Would you like to merge them into your Google account or discard them to start fresh?
        </p>

        {error && <div className="migration-modal__error">{error}</div>}

        <div className="migration-modal__actions">
          <button
            className="migration-modal__btn migration-modal__btn--secondary"
            onClick={handleStartFresh}
            disabled={migrating}
          >
            Start Fresh (Discard)
          </button>
          <button
            className="migration-modal__btn migration-modal__btn--primary"
            onClick={handleImport}
            disabled={migrating}
          >
            {migrating ? 'Importing...' : 'Import to My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
