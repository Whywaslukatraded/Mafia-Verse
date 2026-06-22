import { SignIn } from "@clerk/clerk-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10 flex flex-col items-center gap-6"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-4 bg-card border-2 border-border rounded-full mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black font-serif uppercase tracking-tight text-foreground">Mafia Verse</h1>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1">Sign in to continue</p>
        </div>

        <SignIn
          routing="hash"
          forceRedirectUrl="/"
          signUpUrl="/signup"
          appearance={{
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "#0d0d14",
              colorText: "#f4f4f5",
              colorTextSecondary: "#a1a1aa",
              colorInputBackground: "#18181f",
              colorInputText: "#f4f4f5",
              borderRadius: "0.75rem",
            },
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-home"
        >
          ← Back to Home
        </Button>
      </motion.div>
    </div>
  );
}
