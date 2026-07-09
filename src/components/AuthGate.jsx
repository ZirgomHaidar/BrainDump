import { useState, useEffect } from 'react';
import {
  onAuthChange,
  signInWithGoogle,
  checkRedirectResult,
} from '../firebase';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkRedirectResult()
      .then((res) => {
        if (res && res.user) setUser(res.user);
      })
      .catch((e) => {
        console.warn('Redirect auth result error:', e);
      });
    return onAuthChange(setUser);
  }, []);

  const handleSignIn = () => {
    setError(null);
    signInWithGoogle().catch((e) => {
      if (e.code === 'auth/popup-blocked') {
        setError('POPUP_BLOCKED');
      } else {
        setError(e.message);
      }
    });
  };

  if (user === undefined) return (
    <div className="auth">
      <div className="auth__card">
        <svg className="auth__logo" viewBox="0 0 32 32" fill="none" strokeWidth="1.5" stroke="currentColor">
          <path d="M16 6C11.5817 6 8 9.58172 8 14C8 18.4183 11.5817 22 16 22V6Z" />
          <path d="M16 6C20.4183 6 24 9.58172 24 14C24 18.4183 20.4183 22 16 22V6Z" />
          <path d="M12 22C12 24.2091 13.7909 26 16 26C18.2091 26 20 24.2091 20 22" />
          <path d="M12 14H20" />
          <path d="M16 10V18" />
        </svg>
        <h1 className="auth__title">BRAINDUMP</h1>
        <p className="auth__subtitle">Personal Dumping System</p>
        <p className="auth__loading">Authenticating...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="auth">
      <div className="auth__card">
        <svg className="auth__logo" viewBox="0 0 32 32" fill="none" strokeWidth="1.5" stroke="currentColor">
          <path d="M16 6C11.5817 6 8 9.58172 8 14C8 18.4183 11.5817 22 16 22V6Z" />
          <path d="M16 6C20.4183 6 24 9.58172 24 14C24 18.4183 20.4183 22 16 22V6Z" />
          <path d="M12 22C12 24.2091 13.7909 26 16 26C18.2091 26 20 24.2091 20 22" />
          <path d="M12 14H20" />
          <path d="M16 10V18" />
        </svg>
        <h1 className="auth__title">BRAINDUMP</h1>
        <p className="auth__subtitle">Personal Dumping System</p>

        {error === 'POPUP_BLOCKED' ? (
          <div className="auth__error" style={{ maxWidth: '300px', textAlign: 'left', lineHeight: 1.5 }}>
            <strong style={{ display: 'block', marginBottom: '4px', textAlign: 'center' }}>
              Pop-up was blocked!
            </strong>
            1. Click the site icon <strong>(=-)</strong> on the far left of the address bar.<br />
            2. Set <strong>Pop-ups and redirects</strong> to <strong>Allow</strong>.<br />
            3. Click the button below to sign in.
          </div>
        ) : (
          error && <p className="auth__error">{error}</p>
        )}

        <button className="auth__btn" onClick={handleSignIn}>
          Sign in with Google
        </button>
      </div>
    </div>
  );

  return children;
}
