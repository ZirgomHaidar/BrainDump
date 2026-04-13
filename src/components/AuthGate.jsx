import { useState, useEffect } from 'react';
import { onAuthChange, signInWithGoogle } from '../firebase';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=signed out

  useEffect(() => onAuthChange(setUser), []);

  if (user === undefined) return null; // brief flash while Firebase resolves session

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
        <h1 className="auth__title">BRAIN</h1>
        <p className="auth__subtitle">Personal Dumping System</p>
        <button className="auth__btn" onClick={signInWithGoogle}>
          Sign in with Google
        </button>
      </div>
    </div>
  );

  return children;
}
