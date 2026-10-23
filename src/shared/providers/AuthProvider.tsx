import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as FirebaseUser, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from "firebase/auth";
import { auth } from "../../services/firebase";

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const GUEST_STORAGE_KEY = "alfassa_guest_user";
const GUEST_UID_KEY = "alfassa_guest_uid";

function createGuestUser(): FirebaseUser {
  let guestId = localStorage.getItem(GUEST_UID_KEY);
  if (!guestId) {
    guestId = "guest-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem(GUEST_UID_KEY, guestId);
  }
  return {
    uid: guestId,
    displayName: "Guest User",
    email: null,
    isAnonymous: true,
  } as FirebaseUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(() => {
    try {
      const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
      if (savedGuest) {
        const parsed = JSON.parse(savedGuest);
        if (parsed?.uid) return parsed as FirebaseUser;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } else {
        // If not logged in via Firebase, check if we have an active guest session
        const currentGuest = localStorage.getItem(GUEST_STORAGE_KEY);
        if (currentGuest) {
          try {
            const parsed = JSON.parse(currentGuest);
            if (parsed?.uid) {
              setUser(parsed as FirebaseUser);
            } else {
              setUser(null);
            }
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error?.code === "auth/popup-closed-by-user") {
        console.log("Sign-in popup closed by user.");
      } else {
        console.error("Error signing in with Google:", error);
      }
    }
  };

  const signInAsGuest = async () => {
    try {
      const cred = await signInAnonymously(auth);
      if (cred?.user) {
        setUser(cred.user);
        return;
      }
    } catch (error: any) {
      // When anonymous auth is disabled or network fails in sandboxed iframe,
      // gracefully fall back to local guest user
      console.info("Firebase anonymous sign-in skipped, using guest workspace session:", error?.code || error?.message);
    }

    // Seamless fallback to persistent local guest user
    const guestUser = createGuestUser();
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestUser));
    } catch {
      // ignore local storage error
    }
    setUser(guestUser);
  };

  const logout = async () => {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // ignore
    }
    setUser(null);
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      console.warn("Sign-out warning:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInAsGuest, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

