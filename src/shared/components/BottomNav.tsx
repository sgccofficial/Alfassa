import { NavLink } from "react-router-dom";
import { Home, PenTool, Search, FolderTree, Network, Settings } from "lucide-react";
import { cn } from "../utils/cn";

const mobileNavItems = [
  { name: "Home", path: "/", icon: Home },
  { name: "Canvas", path: "/canvas", icon: PenTool },
  { name: "Search", path: "/search", icon: Search },
  { name: "Folders", path: "/folders", icon: FolderTree },
  { name: "Settings", path: "/settings", icon: Settings },
];

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-bg-surface/95 backdrop-blur-md border-t border-border-color flex items-center justify-around px-2 z-20 pb-safe select-none">
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors cursor-pointer",
            isActive 
              ? "text-slate-900 dark:text-slate-50 font-semibold" 
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {({ isActive }) => (
            <>
              <item.icon 
                size={18} 
                strokeWidth={isActive ? 2 : 1.75} 
                className="shrink-0 mb-0.5" 
              />
              <span className="text-[10px] tracking-tight leading-none">
                {item.name}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
