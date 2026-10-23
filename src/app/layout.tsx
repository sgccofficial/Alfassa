import { Outlet, useLocation, NavLink } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "../shared/components/Sidebar";
import { BottomNav } from "../shared/components/BottomNav";

export function AppLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const isCanvasPage = location.pathname.startsWith("/canvas") || location.pathname.endsWith("/canvas");

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.search]);

  if (isCanvasPage) {
    return (
      <div className="flex h-screen w-screen bg-bg-main overflow-hidden text-text-primary">
        <main ref={mainRef} className="flex-1 h-full w-full overflow-hidden relative">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-bg-main overflow-hidden text-text-primary selection:bg-primary-200 dark:selection:bg-primary-900">
      <div className="hidden md:flex shrink-0 h-full">
        <Sidebar />
      </div>
      
      <main ref={mainRef} className="flex-1 h-full overflow-y-auto relative pb-16 md:pb-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 min-h-full">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
