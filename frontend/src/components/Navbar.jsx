import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarContext } from '../contexts/SidebarContext';
import { Button, Avatar, BasicDropdown } from '@idds/react';
import { Menu, Bell, LogIn, LogOut, Settings } from 'lucide-react';

export default function Navbar() {
  const { toggleMobileSidebar } = useContext(SidebarContext);
  const navigate = useNavigate();

  const userString = localStorage.getItem('kms_user');
  const user = userString ? JSON.parse(userString) : null;

  const getInitials = (name) => {
    if (!name) return 'US';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogout = () => {
    localStorage.removeItem('kms_token');
    localStorage.removeItem('kms_user');
    navigate('/login');
  };

  return (
    <nav className="flex flex-row items-center justify-between bg-white border-b border-neutral-200 px-4 h-16 w-full z-40 sticky top-0">
      
      {/* Bagian Kiri: Hanya Tombol Mobile (Logo dihapus dari Navbar) */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobileSidebar}
          className="p-2 -ml-2 rounded-md md:hidden text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Bagian Kanan: Aksi & Profil */}
      <div className="flex items-center gap-1 justify-center h-fit">
        
        {user ? (
          <>
            {/* Notifikasi */}
            <Button hierarchy="tertiary" size="md" className="text-neutral-500 hidden sm:flex">
              <Bell size={20} />
            </Button>

            <div className="h-6 w-px bg-neutral-200 mx-1 hidden sm:block"></div>

            {/* Dropdown Profil menggunakan BasicDropdown IDDS */}
            <div className="pl-2">
              <BasicDropdown
                trigger={
                  <button className="flex items-center gap-3 hover:bg-neutral-50 p-1.5 rounded-lg transition-colors cursor-pointer outline-none">
                    <div className="hidden md:flex flex-col items-end">
                      <span className="text-sm font-semibold text-neutral-900">{user.full_name}</span>
                      <span className="text-xs text-neutral-500 capitalize">{user.role}</span>
                    </div>
                    <Avatar size="sm" initials={getInitials(user.full_name)} />
                  </button>
                }
                className="w-56 mt-2"
                content={
                  <div className="flex flex-col bg-white rounded-lg shadow-md border border-neutral-200 py-1 overflow-hidden">
                    
                    <button 
                      onClick={() => navigate('/admin/profile')}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 w-full text-left transition-colors"
                    >
                      <Settings size={18} className="text-neutral-500" />
                      Pengaturan Profil
                    </button>
                    
                    <div className="h-px bg-neutral-100 my-1 w-full"></div>
                    
                    <button 
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
                    >
                      <LogOut size={18} className="text-red-500" />
                      Logout
                    </button>
                    
                  </div>
                }
              />
            </div>
          </>
        ) : (
          <Button hierarchy="primary" size="md" onClick={() => navigate('/login')}>
            <LogIn size={16} className="mr-2" />
            Login
          </Button>
        )}
        
      </div>
    </nav>
  );
}