import { useEffect, useState } from "react";
import { User, Menu, Bell } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import StartTourButton from "./StartTourButton";
// import TourInfoPopup from "@/components/TourInfoPopup";

interface TopbarProps {
  onToggleSidebar?: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { logout, user, loading } = useAuth();
  const { unreadCount } = useNotifications();

  if (loading) return null; // or skeleton

  const isUser = user?.role === "User";

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      navigate("/");
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleLogin = () => {
    navigate("/");
  };
  const handleNotificationClick = () => {
  if (location.pathname === "/notifications") {
      navigate(-1);   // Go back
    } else {
      navigate("/notifications"); // Open notification page
    }
  };
  
  return (
    <header className="sticky top-0 z-40 h-16  flex items-center justify-between px-4 sm:px-6 bg-sidebar backdrop-blur-md border-b border-border shadow-sm transition-colors rounded-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onToggleSidebar}
        >
          <Menu className="h-6 w-6 text-foreground" />
        </Button>

        <h1 className="text-lg font-semibold text-foreground tracking-tight">
          <span className="lg:hidden">Wmind</span>
          <span className="hidden lg:inline">
            Wonderbiz Manufacturing Intelligence and Network Devices
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-3">

        {/* Theme toggle */}
        <ThemeToggle />
        <StartTourButton/>
      {isUser ? null : (
        <Button
          variant="ghost"
          onClick={handleNotificationClick}
          title="Notifications"
          className="relative"
        >
          <Bell className="w-6 h-6 text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>)}

      {/* <NotificationDrawer open={open} onOpenChange={setOpen}/> */}

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="topbar-user"   // <-- ID FOR TOUR
                variant="ghost"
                className="flex items-center gap-2 rounded-full px-2 py-1.5 hover:bg-accent/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground hidden sm:inline">
                  {user?.username || "User"}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48 bg-card border border-border">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive font-medium"
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button onClick={handleLogin} variant="outline">
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
