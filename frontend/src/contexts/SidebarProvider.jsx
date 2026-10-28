import { useCallback, useEffect, useState } from "react";
import { SidebarContext } from "./SidebarContext";
import useMediaQuery from "../hooks/useMediaQuery";

export default function SidebarProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isDrawer = useMediaQuery("(max-width: 1199px)");
  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);
  useEffect(() => { if (!isDrawer) closeMobileSidebar(); }, [isDrawer, closeMobileSidebar]);
  const toggleSidebar = () => setIsSidebarOpen((previous) => !previous);
  const toggleMobileSidebar = () => setIsMobileSidebarOpen((previous) => !previous);

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, isMobileSidebarOpen, isDrawer, closeMobileSidebar, toggleSidebar, toggleMobileSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}
