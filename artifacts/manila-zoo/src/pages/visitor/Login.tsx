import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useAppCtx } from "@/contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { customFetch } from "@workspace/api-client-react";
import { errorMessage, isStaffRole } from "@/lib/adminApi";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/contexts/AuthContext";

/** Sign-in for zoo staff (also works for visitors). Not linked from visitor pages; staff open /login directly. */
export default function Login() {
  const { language } = useAppCtx();
  const { sessionExpired } = useAuth();
  const fil = language === "fil";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Sign in through the API so the attempt is recorded in the audit log (and repeated failures
    // are slowed down), then keep the returned Supabase session in the browser as usual
    try {
      const session = await customFetch<{ access_token: string; refresh_token: string; role: string; must_change_credentials?: boolean }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      if (error) throw error;
      setNeedsConfirmation(false);
      const isStaff = isStaffRole(session.role);
      toast({
        title: fil ? "Maligayang pagbabalik!" : "Welcome back!",
        description: session.must_change_credentials
          ? "Set your own username and password to continue."
          : isStaff ? (fil ? `Naka-sign in bilang ${session.role}.` : `Signed in as ${session.role}.`) : (fil ? "Matagumpay na naka-sign in." : "Successfully logged in."),
      });
      // Staff land on the dashboard (a new administrator first sets their credentials there); visitors on the home page
      setLocation(isStaff ? "/admin" : "/");
    } catch (err) {
      setNeedsConfirmation((err as { data?: { code?: string } }).data?.code === "email_not_confirmed");
      toast({
        title: fil ? "Hindi nakapag-sign in" : "Login Failed",
        description: errorMessage(err),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    toast({
      title: error ? (fil ? "Hindi maipadala muli ang email" : "Could not resend email") : (fil ? "Naipadala ang confirmation email" : "Confirmation email sent"),
      description: error?.message ?? (fil ? "Tingnan ang inbox at spam folder para sa confirmation link." : "Check your inbox and spam folder for the confirmation link."),
      variant: error ? "destructive" : "default",
    });
    setResending(false);
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-3 w-full max-w-md"><BackButton /></div>
      <Card className="w-full max-w-md bg-card/80 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{fil ? "Mag-sign in" : "Sign in"}</CardTitle>
          <CardDescription className="text-center">
            {fil ? "Ilagay ang iyong email (o admin username) at password para makapasok sa iyong account" : "Enter your email (or admin username) and password to access your account"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {sessionExpired && (
              <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {fil ? "Natapos na ang iyong session. Mag-sign in muli." : "Your session has ended. Please sign in again."}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{fil ? "Email o username" : "Email or username"}</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={fil ? "m@example.com o username ng admin" : "m@example.com or admin username"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (fil ? "Mag-sign in" : "Sign in")}
            </Button>
            {needsConfirmation && (
              <Button type="button" variant="outline" className="w-full" onClick={resendConfirmation} disabled={resending}>
                {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (fil ? "Ipadala muli ang confirmation email" : "Resend confirmation email")}
              </Button>
            )}
            <div className="text-sm text-center text-muted-foreground">
              {fil ? "Wala pang account?" : "Don't have an account?"}{" "}
              {/* The complete visitor registration form (account + visit details) */}
              <Link href="/visitor-registration?view=signup" className="text-primary hover:underline font-medium">
                {fil ? "Mag-sign up" : "Sign up"}
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
