import React, { useState } from 'react';
import axios from 'axios';

interface AuthViewProps {
  onLoginSuccess: (token: string, user: any) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://turk-hub.onrender.com';

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('Azerbaijan');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Müxtəlif endpoint prefikslərini sırayla yoxlamaq üçün köməkçi funksiya
  const tryEndpoints = async (paths: string[], data: any, isJson = false) => {
    let lastError = null;
    for (const path of paths) {
      try {
        const config = isJson ? {} : { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
        const res = await axios.post(`${API_URL}${path}`, data, config);
        return { res, path };
      } catch (err: any) {
        lastError = err;
        if (err.response && err.response.status !== 404) {
          throw err; // Əgər 404 deyilsə (məsələn 401 şifrə xətasıdırsa), başqa endpoint axtarma
        }
      }
    }
    throw lastError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const params = new URLSearchParams();
        params.append('username', email);
        params.append('password', password);

        // Render-də köhnə /api/auth/login və ya /login routlarını sırayla dənəyir
        const { res } = await tryEndpoints(['/api/auth/login', '/login', '/auth/login'], params);
        
        const token = res.data.access_token;
        localStorage.setItem('token', token);

        // User məlumatını alırıq
        let userData = res.data.user;
        if (!userData) {
          try {
            const meRes = await axios.get(`${API_URL}/me`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            userData = meRes.data;
          } catch {
            const meRes = await axios.get(`${API_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            userData = meRes.data;
          }
        }

        localStorage.setItem('user', JSON.stringify(userData));
        onLoginSuccess(token, userData);
      } else {
        const regData = { full_name: fullName, email, password, country };
        await tryEndpoints(['/api/auth/register', '/register', '/auth/register'], regData, true);

        // Otomatik login
        const params = new URLSearchParams();
        params.append('username', email);
        params.append('password', password);

        const { res } = await tryEndpoints(['/api/auth/login', '/login', '/auth/login'], params);
        const token = res.data.access_token;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(res.data.user || { full_name: fullName, email, country }));
        onLoginSuccess(token, res.data.user || { full_name: fullName, email, country });
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('E-poçt və ya şifrə yanlışdır.');
      } else if (err.response?.status === 404) {
        setError('Backend rout tapılmadı. Zəhmət olmasa backend-in işlədiyindən əmin olun.');
      } else {
        setError(err.response?.data?.detail || 'Giriş zamanı xəta baş verdi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-darkBg text-white flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-sm bg-cardBg/80 backdrop-blur-md border border-slate-700/60 rounded-3xl p-6 shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-wider bg-gradient-to-r from-skyBlue via-cyan-300 to-skyBlue-hover bg-clip-text text-transparent">
            TURK HUB
          </h1>
          <p className="text-xs text-slate-400 mt-1">Türk Gənclərinin İnnovasiya Şəbəkəsi</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <>
              <div>
                <input
                  type="text"
                  placeholder="Ad Soyad"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-skyBlue transition-all text-white placeholder-slate-500"
                />
              </div>
              <div>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-skyBlue transition-all text-white"
                >
                  <option value="Azerbaijan">🇦🇿 Azərbaycan</option>
                  <option value="Türkiye">🇹🇷 Türkiye</option>
                  <option value="Kazakhstan">🇰🇿 Kazakhstan</option>
                  <option value="Uzbekistan">🇺🇿 Uzbekistan</option>
                  <option value="Kyrgyzstan">🇰🇬 Kyrgyzstan</option>
                  <option value="Turkmenistan">🇹🇲 Turkmenistan</option>
                </select>
              </div>
            </>
          )}

          <div>
            <input
              type="email"
              placeholder="E-poçt ünvanı"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-skyBlue transition-all text-white placeholder-slate-500"
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="Şifrə"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-skyBlue transition-all text-white placeholder-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-skyBlue hover:bg-skyBlue-hover font-semibold text-darkBg rounded-xl text-sm transition-all duration-200 shadow-lg shadow-skyBlue/20 active:scale-95"
          >
            {loading ? 'Yüklənir...' : isLogin ? 'Daxil Ol' : 'Qeydiyyatdan Keç'}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-400">
            {isLogin ? 'Hesabınız yoxdur?' : 'Artıq hesabınız var?'}{' '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-skyBlue font-semibold hover:underline ml-1"
            >
              {isLogin ? 'Qeydiyyat' : 'Daxil ol'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
