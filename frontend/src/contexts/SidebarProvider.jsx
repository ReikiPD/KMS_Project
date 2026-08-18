import { useState } from "react";
import { SidebarContext } from "./SidebarContext";

export default function SidebarProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen((previous) => !previous);
  const toggleMobileSidebar = () => setIsMobileSidebarOpen((previous) => !previous);

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, isMobileSidebarOpen, toggleSidebar, toggleMobileSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}
