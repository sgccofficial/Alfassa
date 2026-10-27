import { useState } from "react";
import { useAuth } from "../../shared/providers/AuthProvider";
import { Button } from "../../shared/components/Button";
import { Brain, Message } from "iconoir-react";
import { Loading } from "loading-dev";

export function LoginScreen() {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setNotice(null);
    try {
      await signInWithGoogle();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setIsLoading(true);
    setNotice(null);
    try {
      await signInAsGuest();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-main px-4">
      <div className="w-full max-w-sm bg-bg-surface border border-border-color rounded-2xl shadow-sm p-7 text-center">
        <div className="mx-auto w-10 h-10 flex items-center justify-center text-text-primary mb-3">
          <Brain size={28} strokeWidth={1.75} />
        </div>
        
        <h1 className="text-xl font-bold tracking-tight text-text-primary mb-1">
          Welcome to Alfassa
        </h1>
        <p className="text-text-secondary mb-6 text-xs">
          Your personal knowledge workspace.
        </p>

        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-bg-subtle border border-border-color text-xs text-text-secondary text-left">
            {notice}
          </div>
        )}

        <div className="space-y-2.5">
          <Button 
            className="w-full h-10 flex items-center justify-center gap-2"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            {isLoading ? <Loading size={15}  /> : null}
            Continue with Google
          </Button>
          
          <Button 
            variant="outline"
            className="w-full h-10 flex items-center justify-center gap-2"
            onClick={() => setNotice("ChatGPT provider connection will be enabled in upcoming releases.")}
            disabled={isLoading}
          >
            <Message size={15} strokeWidth={1.75} className="opacity-70" />
            Continue with ChatGPT
          </Button>
          
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border-color" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-bg-surface px-2 text-text-muted">
                Or
              </span>
            </div>
          </div>

          <Button 
            variant="ghost"
            className="w-full h-10 flex items-center justify-center gap-2"
            onClick={handleGuestSignIn}
            disabled={isLoading}
          >
            {isLoading ? <Loading size={15}  /> : null}
            Continue as Guest
          </Button>
        </div>
      </div>
    </div>
  );
}

