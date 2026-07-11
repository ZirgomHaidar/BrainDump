import { useState, useEffect } from 'react';
import {
  onAuthChange,
  signInWithGoogle as firebaseSignIn,
  signOutUser as firebaseSignOut,
  checkRedirectResult,
} from '../firebase';
import { isGuestMode, setGuestMode, hasGuestData } from '../services/guestStorage';
import { AuthContext } from './authContextDef';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [isGuest, setIsGuest] = useState(() => isGuestMode());
  const [showMigration, setShowMigration] = useState(false);

  useEffect(() => {
    checkRedirectResult()
      .then((res) => {
        if (res && res.user) setUser(res.user);
      })
      .catch((e) => {
        console.warn('Redirect auth result error:', e);
      });

    return onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (hasGuestData()) {
          setShowMigration(true);
        }
        setIsGuest(false);
        setGuestMode(false);
      }
    });
  }, []);

  const enterGuest = () => {
    setGuestMode(true);
    setIsGuest(true);
  };

  const exitGuest = () => {
    setGuestMode(false);
    setIsGuest(false);
  };

  const signIn = () => firebaseSignIn();
  const signOut = () => firebaseSignOut();

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        showMigration,
        setShowMigration,
        signIn,
        signOut,
        enterGuest,
        exitGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
