import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goToControlCentreLogin } from "@/lib/control-centre";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [ssoState, setSsoState] = useState<"idle" | "exchanging" | "done" | "failed">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stripHash = () => {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    const hash = window.location.hash;
    if (!hash.includes("sso=")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const payload = params.get("sso");
    if (!payload) {
      stripHash();
      setSsoState("failed");
      toast.error("Sign-in handoff was missing. Please open Events again from Control Centre.");
      return;
    }
    const separator = payload.indexOf(".~.");
    const access_token = separator >= 0 ? payload.slice(0, separator) : "";
    const refresh_token = separator >= 0 ? payload.slice(separator + 3) : "";
    if (!access_token || !refresh_token) {
      stripHash();
      setSsoState("failed");
      toast.error("Sign-in handoff was invalid. Please open Events again from Control Centre.");
      return;
    }
    setSsoState("exchanging");
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(async ({ error }) => {
        if (error) {
          console.error("[sso] setSession failed", error);
          toast.error("Sign-in handoff expired — please sign in.");
          setSsoState("failed");
          return;
        }
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) {
          console.error("[sso] getUser failed", userError);
          toast.error("Sign-in handoff could not be verified. Please try again.");
          setSsoState("failed");
          return;
        }
        setSsoState("done");
        navigate({ to: "/dashboard", replace: true });
      })
      .catch((error) => {
        console.error("[sso] handoff failed", error);
        toast.error("Sign-in handoff failed. Please open Events again from Control Centre.");
        setSsoState("failed");
      })
      .finally(() => {
        stripHash();
      });
  }, [navigate]);

  if (loading || ssoState === "exchanging")
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (ssoState === "failed" || !session) return <SignInRedirect />;
  return <Navigate to="/dashboard" />;
}

function SignInRedirect() {
  useEffect(() => {
    goToControlCentreLogin();
  }, []);
  return <div className="min-h-screen grid place-items-center text-muted-foreground">Taking you to the Control Centre sign-in…</div>;
}
