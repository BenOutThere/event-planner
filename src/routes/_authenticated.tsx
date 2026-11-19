import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { CONTROL_CENTRE_URL, goToControlCentreLogin } from "@/lib/control-centre";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, noAccess, roles, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) goToControlCentreLogin();
  }, [loading, session]);

  if (loading || !session) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  if (noAccess || roles.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">
            {noAccess ? "You don't have access to Event Planner" : "You don't have an Event Planner role yet"}
          </h1>
          <p className="text-muted-foreground">
            {noAccess
              ? "Ask a Control Centre admin to give you the Event Planner tile, then open it again."
              : "Ask an Event Planner admin to set your role on the Admin page. Once they have, refresh this page."}
          </p>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          <div className="flex justify-center gap-2">
            <Button asChild><a href={CONTROL_CENTRE_URL}>Back to the Control Centre</a></Button>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={sidebarWasOpen()}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-card px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex-1" />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/** R16: open the main menu the way the person last left it (saved by the menu itself). */
function sidebarWasOpen(): boolean {
  if (typeof document === "undefined") return true;
  const m = /(?:^|;\s*)sidebar_state=(true|false)/.exec(document.cookie);
  return m ? m[1] === "true" : true;
}
