import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, BookUser, CalendarPlus, Settings, LogOut, LayoutTemplate, HelpCircle, ClipboardList } from "lucide-react";
import { canReadOps } from "@/lib/operations";
import { GLOBAL_ROLE_INFO, primaryRole } from "@/lib/access";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Events", url: "/dashboard", icon: LayoutDashboard, needsCreate: false },
  { title: "My work", url: "/my-work", icon: ListChecks, needsCreate: false },
  { title: "Contacts & suppliers", url: "/contacts", icon: BookUser, needsCreate: false, needsStaff: true },
  { title: "Operations plans", url: "/operations", icon: ClipboardList, needsCreate: false, needsStaff: true },
  { title: "User Guide", url: "/help", icon: HelpCircle, needsCreate: false },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, isAdmin, roles, signOut } = useAuth();
  const canCreate = isAdmin || roles.includes("lead") || roles.includes("member");
  const top = primaryRole(roles);
  const roleLabel = top ? GLOBAL_ROLE_INFO[top].label : "No role";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const initials = (user?.email ?? "?")[0]?.toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-2">
          <img src="/apple-touch-icon.png?v=2" alt="" aria-hidden className="size-8 rounded-lg shrink-0 object-contain" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display font-semibold text-sm">Out There</span>
              <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wider">Event Planner</span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.filter((i) => (!i.needsCreate || canCreate) && (!("needsStaff" in i) || canReadOps(roles))).map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin/templates")}>
                    <Link to="/admin/templates">
                      <LayoutTemplate />
                      <span>Template builder</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin/users")}>
                    <Link to="/admin/users">
                      <Settings />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.email}</p>
              <p className="text-[10px] text-sidebar-foreground/60">{roleLabel}</p>
            </div>
          )}
          {!collapsed && (
            <Button size="icon" variant="ghost" onClick={signOut} aria-label="Sign out" className="h-7 w-7 text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <LogOut className="size-3.5" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}