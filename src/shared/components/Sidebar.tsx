import { NavLink } from "react-router-dom";
import { cn } from "../utils/cn";
import { Home, Search, Folder, ViewColumns2, Suitcase, NetworkRight, Brain, Compass, Activity, Star, Settings, SidebarCollapse, SidebarExpand, CheckSquare, BookStack, SunLight, HalfMoon, EditPencil } from "iconoir-react";
import { useState } from "react";
import { useTheme } from "../providers/ThemeProvider";

const navItems = [
  { name: "Home", path: "/", icon: Home },
  { name: "Canvas", path: "/canvas", icon: EditPencil },
  { name: "Concepts", path: "/concepts", icon: BookStack },
  { name: "Search", path: "/search", icon: Search },
  { name: "Folders", path: "/folders", icon: Folder },
  { name: "Collections", path: "/collections", icon: ViewColumns2 },
  { name: "Projects", path: "/projects", icon: Suitcase },
  { name: "Knowledge Graph", path: "/graph", icon: NetworkRight },
  { name: "Revision", path: "/revision", icon: Brain },
  { name: "Explore", path: "/explore", icon: Compass },
  { name: "Activity", path: "/activity", icon: Activity },
  { name: "Favorites", path: "/favorites", icon: Star },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(true);
  const { theme, setTheme } = useTheme();

  return (
    <aside className={cn(
      "h-screen border-r border-border-color bg-bg-surface flex flex-col transition-all duration-200 z-10 select-none",
      expanded ? "w-60" : "w-16"
    )}>
      {/* Header (Sprint 6 Requirement 1: Alfassa in top-left as brand/navigation identity) */}
      <div className="h-14 flex items-center justify-between px-3.5 border-b border-border-color">
        <NavLink
          to="/"
          className="flex items-center gap-2 pl-1 overflow-hidden font-bold text-sm tracking-tight text-text-primary hover:opacity-80 transition-opacity"
          title="Alfassa - Home"
        >
          <span className="animate-text-sweep">Alfassa</span>
        </NavLink>
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="p-1.5 hover:bg-bg-subtle rounded-lg text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? <SidebarCollapse size={17} strokeWidth={1.75} /> : <SidebarExpand size={17} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center rounded-lg px-2.5 py-2 text-xs font-medium transition-all group cursor-pointer",
              isActive 
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-2xs" 
                : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
            )}
            title={!expanded ? item.name : undefined}
          >
            <item.icon size={18} strokeWidth={1.75} className="shrink-0" />
            {expanded && <span className="ml-3 truncate">{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border-color space-y-1">
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center rounded-lg px-2.5 py-2 text-xs font-medium text-text-secondary hover:bg-bg-subtle hover:text-text-primary transition-colors cursor-pointer"
          title={!expanded ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : undefined}
        >
          {theme === 'dark' ? (
            <SunLight size={18} strokeWidth={1.75} className="shrink-0 text-amber-400" />
          ) : (
            <HalfMoon size={18} strokeWidth={1.75} className="shrink-0 text-slate-600" />
          )}
          {expanded && (
            <span className="ml-3 truncate">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex items-center rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer",
            isActive 
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-2xs" 
              : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          )}
          title={!expanded ? "Settings" : undefined}
        >
          <Settings size={18} strokeWidth={1.75} className="shrink-0" />
          {expanded && <span className="ml-3 truncate">Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
}
