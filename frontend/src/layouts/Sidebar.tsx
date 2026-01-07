import { NavLink } from "react-router-dom";
import { SIDEBAR_ITEMS } from "../sidebar/sidebarItems";
import { ROLE_SIDEBAR_ACCESS } from "../sidebar/roleSidebarConfig";
import { useAuth } from "@/context/AuthContext";
import WmindLogo from "../assets/Wmind.png";

interface SidebarProps {
  onCloseSidebar?: () => void;
}

export default function Sidebar({ onCloseSidebar }: SidebarProps) {
  const { user } = useAuth();
  const role = user?.role ?? "Viewer";

  const allowedKeys = ROLE_SIDEBAR_ACCESS[role] ?? [];

  const visibleItems = SIDEBAR_ITEMS.filter(item =>
    allowedKeys.includes(item.key)
  );

  return (
    <aside id="sidebar" className="sticky top-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col  px-4  rounded-sm">
      <div className="h-16 flex items-center justify-center border-b border-sidebar-border px-4 mb-6">
          <div className="w-32 h-12 bg-sidebar rounded flex items-center justify-center">
            <img
              src={WmindLogo}
              alt="WMind"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>

       <nav className="space-y-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.key}
              to={item.path}
              id={`sidebar-${item.key}`}
              onClick={() => {
              if (window.innerWidth < 1024) {
                onCloseSidebar?.();
              }
            }}
              className={({ isActive }) =>
                `flex items-center gap-3 p-2 rounded-lg transition ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                }`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
