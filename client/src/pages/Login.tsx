import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    avatar: "👤",
  });

  const avatars = ["👤", "🧑", "👨", "👩", "🧔", "👴", "👵", "🧑‍🦱", "👨‍🦱", "👩‍🦱"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const payload = isSignup
        ? { username: formData.username, password: formData.password, name: formData.name, avatar: formData.avatar }
        : { username: formData.username, password: formData.password };

      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("mafia_userId", data.userId);
        localStorage.setItem("mafia_username", data.username);
        localStorage.setItem("mafia_name", data.name);
        localStorage.setItem("mafia_avatar", data.avatar);
        toast({
          title: isSignup ? "Account created!" : "Logged in!",
          description: `Welcome, ${data.name}!`,
        });
        setLocation("/");
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignup ? "Create Account" : "Login"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            {isSignup && (
              <>
                <Input
                  type="text"
                  placeholder="Display Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <div className="grid grid-cols-5 gap-2">
                  {avatars.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => setFormData({ ...formData, avatar })}
                      className={`text-2xl p-2 rounded border ${
                        formData.avatar === avatar
                          ? "border-blue-500 bg-blue-100 dark:bg-blue-950"
                          : "border-gray-300 dark:border-gray-700"
                      }`}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Loading..." : isSignup ? "Create Account" : "Login"}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="w-full text-sm text-blue-500 hover:underline"
            >
              {isSignup ? "Already have an account? Login" : "Don't have an account? Sign up"}
            </button>
            <Button
              type="button"
              onClick={() => setLocation("/")}
              variant="outline"
              className="w-full"
            >
              Continue as Guest
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
