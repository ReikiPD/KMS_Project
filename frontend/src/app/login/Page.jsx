import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, User, ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { Button, TextField, Alert } from '@idds/react';

const LoginPage = () => {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState('publik'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3000/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan saat login');
      }

      localStorage.setItem('kms_token', data.token);
      localStorage.setItem('kms_user', JSON.stringify(data.user));

      if (data.user.role === 'pegawai') {
        navigate('/admin/dashboard');
      } else {
        navigate('/'); 
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 w-full max-w-md">
        
        <Link to="/" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-6 transition">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Kembali ke Beranda
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-content-primary">
            Masuk ke KMS Kemenhub
          </h1>
          <p className="text-sm text-content-secondary mt-2">
            Silakan pilih metode masuk yang sesuai dengan peran Anda.
          </p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-lg mb-8">
          <button
            type="button"
            onClick={() => setLoginType('publik')}
            className={`flex-1 flex justify-center items-center py-2 text-sm font-medium rounded-md transition ${
              loginType === 'publik' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <User className="w-4 h-4 mr-2" />
            Pengguna Publik
          </button>
          <button
            type="button"
            onClick={() => setLoginType('pegawai')}
            className={`flex-1 flex justify-center items-center py-2 text-sm font-medium rounded-md transition ${
              loginType === 'pegawai' ? 'bg-blue-900 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Login Pegawai
          </button>
        </div>

        {error && (
          <div className="mb-6">
            <Alert variant="danger" message={error} />
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Bungkus dengan div relatif untuk ikon manual */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10 pt-6">
              <Mail className="h-5 w-5 text-slate-400" />
            </div>
            <div className="pl-10">
               {/* 
                  Ubah cara penanganan event onChange. 
                  Jika IDDS mengirimkan event (e), kita ambil e.target.value
                  Jika IDDS langsung mengirimkan string, kita jadikan itu value-nya
               */}
               <TextField 
                 label={loginType === 'pegawai' ? 'Email Kedinasan' : 'Alamat Email'}
                 placeholder={loginType === 'pegawai' ? 'nama@dephub.go.id' : 'nama@email.com'}
                 type="email"
                 value={email}
                 onChange={(e) => setEmail(typeof e === 'string' ? e : e?.target?.value || '')}
                 required
               />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10 pt-6">
              <KeyRound className="h-5 w-5 text-slate-400" />
            </div>
            <div className="pl-10">
               <TextField 
                 label="Password"
                 placeholder="••••••••"
                 type="password"
                 value={password}
                 onChange={(e) => setPassword(typeof e === 'string' ? e : e?.target?.value || '')}
                 required
               />
            </div>
          </div>

          {/* Mengganti isFullWidth dengan className Tailwind */}
          <div className="pt-4">
            <Button 
              type="submit" 
              variant="primary" 
              size="large"
              className="w-full justify-center flex"
              disabled={loading}
            >
              {loading ? 'Memproses...' : 'Masuk Sekarang'}
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default LoginPage;