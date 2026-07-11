import { createContext } from 'react';

export const AuthContext = createContext({
  user: undefined,
  isGuest: false,
  showMigration: false,
  setShowMigration: () => {},
  signIn: () => {},
  signOut: () => {},
  enterGuest: () => {},
  exitGuest: () => {},
});
