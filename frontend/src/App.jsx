import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NavbarProvider } from "./contexts/NavbarContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Page from "./app/Page";
import LoginPage from "./app/login/Page";
import DashboardPage from "./app/admin/dashboard/Page";
import CreateAssetPage from "./app/admin/assets/create/Page";
import CategoryPage from "./app/admin/categories/Page";
import WorkUnitPage from "./app/admin/work-units/Page";
import AssetsPage from "./app/admin/assets/Page";

function App() {
  return (
    <NavbarProvider>
      <SidebarProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Rute Utama dengan Layout yang Diperbarui */}
            <Route
              path="/*"
              element={
                // 1. Ubah container paling luar menjadi flex-row (menyamping)
                <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
                  {/* 2. Sidebar di sebelah kiri (Full Height) */}
                  <Sidebar />

                  {/* 3. Container Kanan untuk Navbar dan Konten */}
                  <div className="flex flex-col flex-1 overflow-hidden w-full">
                    {/* Navbar sekarang ada di dalam container kanan, di atas konten */}
                    <Navbar />

                    <main className="flex-1 overflow-y-auto">
                      <Routes>
                        {/* Rute Beranda Publik */}
                        <Route path="/" element={<Page />} />
                        {/* Rute Dasbor Pegawai */}
                        <Route
                          path="/admin/dashboard"
                          element={<DashboardPage />}
                        />
                        <Route
                          path="/admin/assets/create"
                          element={<CreateAssetPage />}
                        />
                        <Route
                          path="/admin/categories"
                          element={<CategoryPage />}
                        />
                        <Route
                          path="/admin/work-units"
                          element={<WorkUnitPage />}
                        />
                        <Route path="/admin/assets" element={<AssetsPage />} />
                      </Routes>
                    </main>
                  </div>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </NavbarProvider>
  );
}

export default App;
