import { createContext, useState } from 'react';

export const SidebarContext = createContext();

export const SidebarProvider = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleMobileSidebar = () => setIsMobileSidebarOpen(!isMobileSidebarOpen);

  return (
    <SidebarContext.Provider value={{ 
      isSidebarOpen, 
      isMobileSidebarOpen, 
      toggleSidebar, 
      toggleMobileSidebar 
    }}>
      {children}
    </SidebarContext.Provider>
  );
};