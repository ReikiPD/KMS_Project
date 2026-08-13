import { createContext, useState } from 'react';

export const NavbarContext = createContext();

export const NavbarProvider = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  return (
    <NavbarContext.Provider value={{ isMobileMenuOpen, toggleMobileMenu }}>
      {children}
    </NavbarContext.Provider>
  );
};