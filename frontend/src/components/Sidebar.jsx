import { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SidebarContext } from '../contexts/SidebarContext';
import { Button } from '@idds/react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Tags, 
  Building2, 
  PanelLeftClose,
  PanelLeft,
  BookOpen
} from 'lucide-react';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar, isMobileSidebarOpen, toggleMobileSidebar } = useContext(SidebarContext);
  const location = useLocation();
  const navigate = useNavigate();

  const userString = localStorage.getItem('kms_user');
  const user = userString ? JSON.parse(userString) : null;

  const collapsed = !isSidebarOpen;

  const textCollapseClass = `
    overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out
    ${collapsed ? 'max-w-0 opacity-0 hidden md:block' : 'max-w-[200px] opacity-100'}
  `;

  const navItemClass = (path) => `
    flex items-center w-full px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer
    ${location.pathname === path 
      ? 'bg-blue-50 text-blue-700 font-semibold' 
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
    ${collapsed ? 'justify-center' : 'justify-start'}
  `;

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobileSidebarOpen) toggleMobileSidebar();
  };

  return (
    <>
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
          onClick={toggleMobileSidebar}
        />
      )}

      <aside
        className={`
          fixed md:static top-0 left-0 z-50
          flex flex-col h-screen bg-white
          border-r border-slate-200
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-20' : 'w-64'}
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* 1. HEADER (Logo tetap di sini) */}
        <header className="flex-none p-4 border-b border-slate-200 h-16">
          <div className={`flex items-center h-full ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <div 
                className="flex items-center gap-2 text-slate-800 cursor-pointer overflow-hidden whitespace-nowrap" 
                onClick={() => navigate('/')}
              >
                <BookOpen size={24} className="text-yellow-500 shrink-0" />
                <span className="font-bold text-lg tracking-tight">KMS Kemenhub</span>
              </div>
            )}
            
            <div className="hidden md:flex shrink-0">
              <Button hierarchy="tertiary" size="small" onClick={toggleSidebar}>
                {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
              </Button>
            </div>
          </div>
        </header>

        {/* 2. AREA NAVIGASI UTAMA (Menu Profil dihapus dari sini) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col justify-between">
          <nav className="flex flex-col gap-1.5">
            {user?.role === 'pegawai' && (
              <>
                <button type="button" onClick={() => handleNavigation('/admin/dashboard')} className={navItemClass('/admin/dashboard')}>
                  <LayoutDashboard size={20} className="shrink-0" />
                  {!collapsed && <span className={`ml-3 ${textCollapseClass}`}>Dasbor</span>}
                </button>
                
                <button type="button" onClick={() => handleNavigation('/admin/assets')} className={navItemClass('/admin/assets')}>
                  <FolderKanban size={20} className="shrink-0" />
                  {!collapsed && <span className={`ml-3 ${textCollapseClass}`}>Aset Pengetahuan</span>}
                </button>
                
                <button type="button" onClick={() => handleNavigation('/admin/categories')} className={navItemClass('/admin/categories')}>
                  <Tags size={20} className="shrink-0" />
                  {!collapsed && <span className={`ml-3 ${textCollapseClass}`}>Kategori Topik</span>}
                </button>
                
                <button type="button" onClick={() => handleNavigation('/admin/work-units')} className={navItemClass('/admin/work-units')}>
                  <Building2 size={20} className="shrink-0" />
                  {!collapsed && <span className={`ml-3 ${textCollapseClass}`}>Unit Kerja</span>}
                </button>
              </>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}