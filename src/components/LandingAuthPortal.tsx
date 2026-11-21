import React, { useState } from 'react';
import {
  ShieldCheck,
  GraduationCap,
  Mail,
  Lock,
  User as UserIcon,
  BookOpen,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UserProfile, UserRole } from '../types/exam';
import { PRIMARY_ADMIN_EMAIL } from '../services/storageService';

interface LandingAuthPortalProps {
  schoolName: string;
  user: User | null;
  userProfile: UserProfile | null;
  selectedRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  onSignInGoogle: (role: UserRole) => Promise<void>;
  onSignInEmailPassword: (
    role: UserRole,
    email: string,
    password: string
  ) => Promise<void>;
  onRegisterGuruEmail: (
    email: string,
    password: string,
    displayName: string,
    subjectSpecialty: string
  ) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onReloadVerification: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onEnterWorkspace: () => void;
  authError: string | null;
  authNotice: string | null;
  isBusy: boolean;
}

export const LandingAuthPortal: React.FC<LandingAuthPortalProps> = ({
  schoolName,
  user,
  userProfile,
  selectedRole,
  onSelectRole,
  onSignInGoogle,
  onSignInEmailPassword,
  onRegisterGuruEmail,
  onResetPassword,
  onResendVerification,
  onReloadVerification,
  onSignOut,
  onEnterWorkspace,
  authError,
  authNotice,
  isBusy,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [subjectSpecialty, setSubjectSpecialty] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRoleSwitch = (role: UserRole) => {
    onSelectRole(role);
    if (role === 'admin' && authMode === 'register') {
      setAuthMode('login');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'reset') {
      await onResetPassword(email.trim());
      return;
    }
    if (authMode === 'register' && selectedRole === 'guru') {
      await onRegisterGuruEmail(
        email.trim(),
        password,
        displayName.trim(),
        subjectSpecialty.trim()
      );
      return;
    }
    await onSignInEmailPassword(selectedRole, email.trim(), password);
  };

  const isUnverifiedUser = Boolean(user && !user.emailVerified);
  const isVerifiedUser = Boolean(user && user.emailVerified);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Institutional Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0F1E3D] text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-sky-300" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-[#0F1E3D] truncate">
                SMART QUESTION & GRADE PORTAL
              </div>
              <div className="text-[11px] font-medium text-slate-500 truncate">
                {schoolName || 'Sistem Naskah Ujian & Rekap Nilai Terpadu'}
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#alur-sistem" className="hover:text-[#0F1E3D] transition-colors">
              Alur Sistem
            </a>
            <a href="#peran-akses" className="hover:text-[#0F1E3D] transition-colors">
              Hak Akses
            </a>
            <a href="#portal-login" className="hover:text-[#0F1E3D] transition-colors">
              Masuk Portal
            </a>
          </nav>

          <div className="shrink-0">
            {isVerifiedUser ? (
              <button
                type="button"
                onClick={onEnterWorkspace}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-lg transition-colors"
              >
                Buka Ruang Kerja
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <a
                href="#portal-login"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-lg transition-colors"
              >
                Masuk dengan Email
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero & Interactive Role Login Portal */}
      <main className="flex-1">
        <section
          id="portal-login"
          className="relative bg-gradient-to-b from-[#0F1E3D] via-[#13294E] to-[#1A3563] text-white py-12 lg:py-16"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left Value Proposition */}
            <div className="lg:col-span-7 space-y-6 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/10 border border-white/15 text-xs font-medium text-sky-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-300" />
                Sinkronisasi Otomatis Guru &amp; Admin Berbasis Cloud
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold leading-tight tracking-tight text-white">
                Platform Penyusunan Soal Ujian &amp; Rekap Nilai Otomatis
              </h1>

              <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-2xl">
                Dirancang khusus untuk kebutuhan administrasi akademik pondok dan sekolah.
                Ustadz/Guru login menggunakan email untuk menyusun soal format Latin maupun Arab KMI
                dan menginput nilai santri/siswa — setiap data langsung tersimpan di akun guru dan
                terekap otomatis di sistem Admin untuk dikonversi ke Excel.
              </p>

              {/* Key Capabilities Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-white/10 border border-white/15 rounded-xl p-4">
                  <Layers className="w-5 h-5 text-sky-300 mb-2.5" />
                  <h2 className="text-sm font-bold text-white">Canvas Soal KMI</h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Format resmi Latin &amp; Arab RTL dengan penomoran otomatis per bab serta ekspor Word &amp; PDF.
                  </p>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-4">
                  <ShieldCheck className="w-5 h-5 text-sky-300 mb-2.5" />
                  <h2 className="text-sm font-bold text-white">Auto-Sync Guru &amp; Admin</h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Naskah soal dan nilai yang diinput guru langsung tersimpan di akun guru dan panel Admin.
                  </p>
                </div>
                <div className="bg-white/10 border border-white/15 rounded-xl p-4">
                  <FileSpreadsheet className="w-5 h-5 text-sky-300 mb-2.5" />
                  <h2 className="text-sm font-bold text-white">Konversi ke Excel (.xlsx)</h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Semua nilai langsung terekap lengkap dengan rata-rata, predikat, dan ringkasan per mapel.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Login Card */}
            <div className="lg:col-span-5">
              <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                {/* Verified Session State */}
                {isVerifiedUser ? (
                  <div className="p-6 sm:p-7 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                          Sesi Aktif ({userProfile?.role === 'admin' ? 'Admin Sistem' : 'Ustadz / Guru'})
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 truncate mt-0.5">
                          {userProfile?.displayName || user?.displayName || user?.email}
                        </h2>
                        <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
                      <div className="font-semibold text-slate-800">Status Sinkronisasi:</div>
                      <p>
                        Data soal dan nilai siswa Anda terhubung otomatis ke penyimpanan cloud
                        Guru &amp; Pusat Rekap Admin.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={onEnterWorkspace}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-xl transition-colors"
                      >
                        Masuk ke Ruang Kerja
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
                        disabled={isBusy}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Keluar / Ganti Akun Email
                      </button>
                    </div>
                  </div>
                ) : isUnverifiedUser ? (
                  /* Email Verification Required State */
                  <div className="p-6 sm:p-7 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <Mail className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Verifikasi Email Diperlukan
                        </h2>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          Tautan verifikasi telah dikirim ke{' '}
                          <span className="font-semibold text-slate-900">{user?.email}</span>.
                          Buka kotak masuk atau folder spam Anda, klik tautan verifikasi, lalu klik
                          tombol cek ulang di bawah.
                        </p>
                      </div>
                    </div>

                    {authError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <span>{authError}</span>
                      </div>
                    )}
                    {authNotice && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
                        <span>{authNotice}</span>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={onReloadVerification}
                        disabled={isBusy}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-xl transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        Saya Sudah Verifikasi — Masuk Sekarang
                      </button>
                      <button
                        type="button"
                        onClick={onResendVerification}
                        disabled={isBusy}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors disabled:opacity-60"
                      >
                        Kirim Ulang Email Verifikasi
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
                        disabled={isBusy}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        Gunakan Email Lain
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Login Role Selector + Email Auth Forms */
                  <div>
                    {/* Role Tabs */}
                    <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => handleRoleSwitch('guru')}
                        className={`flex items-center justify-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-colors ${
                          selectedRole === 'guru'
                            ? 'bg-white text-[#0F1E3D] border-sky-600'
                            : 'text-slate-500 border-transparent hover:text-slate-800'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4" />
                        Login Ustadz / Guru
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRoleSwitch('admin')}
                        className={`flex items-center justify-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-colors ${
                          selectedRole === 'admin'
                            ? 'bg-white text-[#0F1E3D] border-sky-600'
                            : 'text-slate-500 border-transparent hover:text-slate-800'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Login Admin
                      </button>
                    </div>

                    <div className="p-6 sm:p-7 space-y-5">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          {selectedRole === 'admin'
                            ? 'Masuk Sebagai Admin Sistem'
                            : authMode === 'register'
                            ? 'Daftar Akun Email Ustadz / Guru'
                            : authMode === 'reset'
                            ? 'Reset Kata Sandi Akun'
                            : 'Masuk Sebagai Ustadz / Guru'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          {selectedRole === 'admin'
                            ? `Gunakan email admin terdaftar (${PRIMARY_ADMIN_EMAIL}) untuk mengelola naskah masuk, rekap semua nilai, dan ekspor Excel.`
                            : 'Login wajib menggunakan email agar soal & nilai otomatis tersimpan di akun Anda dan sistem Admin.'}
                        </p>
                      </div>

                      {authError && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <span>{authError}</span>
                        </div>
                      )}

                      {authNotice && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                          <span>{authNotice}</span>
                        </div>
                      )}

                      {/* 1-Click Email Google Button */}
                      <button
                        type="button"
                        onClick={() => onSignInGoogle(selectedRole)}
                        disabled={isBusy}
                        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl shadow-xs transition-colors disabled:opacity-60"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                          />
                        </svg>
                        {selectedRole === 'admin'
                          ? 'Masuk Admin dengan Email Google'
                          : 'Masuk Ustadz / Guru dengan Email Google'}
                      </button>

                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-slate-200" />
                        <span className="shrink mx-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                          atau gunakan email &amp; sandi
                        </span>
                        <div className="flex-grow border-t border-slate-200" />
                      </div>

                      {/* Email & Password Form */}
                      <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                        {authMode === 'register' && selectedRole === 'guru' && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Nama Lengkap Ustadz / Guru
                              </label>
                              <div className="relative">
                                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  required
                                  value={displayName}
                                  onChange={(e) => setDisplayName(e.target.value)}
                                  placeholder="Contoh: Ust. Ahmad Fauzan, S.Pd.I"
                                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Mata Pelajaran Diampu (Opsional)
                              </label>
                              <div className="relative">
                                <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={subjectSpecialty}
                                  onChange={(e) => setSubjectSpecialty(e.target.value)}
                                  placeholder="Contoh: Nahwu / Bahasa Inggris"
                                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Alamat Email
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder={
                                selectedRole === 'admin'
                                  ? PRIMARY_ADMIN_EMAIL
                                  : 'ustadz.guru@sekolah.sch.id'
                              }
                              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>
                        </div>

                        {authMode !== 'reset' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Kata Sandi
                            </label>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Minimal 6 karakter"
                                className="w-full pl-9 pr-9 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                aria-label="Tampilkan sandi"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isBusy}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-xl transition-colors disabled:opacity-60"
                        >
                          {isBusy
                            ? 'Memproses...'
                            : authMode === 'register'
                            ? 'Daftar & Kirim Verifikasi Email'
                            : authMode === 'reset'
                            ? 'Kirim Tautan Reset Sandi'
                            : selectedRole === 'admin'
                            ? 'Masuk Admin dengan Email'
                            : 'Masuk Ustadz / Guru dengan Email'}
                        </button>
                      </form>

                      {/* Mode Switcher Links */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                        {selectedRole === 'guru' ? (
                          authMode === 'login' ? (
                            <button
                              type="button"
                              onClick={() => setAuthMode('register')}
                              className="font-semibold text-sky-700 hover:text-sky-900"
                            >
                              Belum punya akun guru? Daftar di sini
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAuthMode('login')}
                              className="font-semibold text-sky-700 hover:text-sky-900"
                            >
                              Sudah punya akun? Kembali ke Masuk
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Akses Admin dikhususkan pengelola sistem
                          </span>
                        )}

                        {authMode !== 'reset' ? (
                          <button
                            type="button"
                            onClick={() => setAuthMode('reset')}
                            className="text-slate-500 hover:text-slate-800"
                          >
                            Lupa sandi?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAuthMode('login')}
                            className="text-slate-500 hover:text-slate-800"
                          >
                            Batal
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* System Workflow & Role Explanation */}
        <section id="alur-sistem" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
          <div id="peran-akses" className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Portal Ustadz / Guru</h3>
                  <div className="text-xs text-slate-500">Penyusunan Soal &amp; Input Nilai Kelas</div>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 pt-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span>Menulis atau menempel naskah soal format Latin maupun Arab KMI di Document Canvas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span>Setiap soal yang disimpan atau diekspor otomatis tersimpan di riwayat guru &amp; panel Admin.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span>Memasukkan nilai siswa (satuan atau tempel daftar massal) &amp; langsung terekap menjadi file Excel (.xlsx).</span>
                </li>
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0F1E3D] flex items-center justify-center text-sky-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Portal Admin Akademik</h3>
                  <div className="text-xs text-slate-500">Monitoring Naskah &amp; Rekap Nilai Lintas Guru</div>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 pt-1">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0F1E3D] shrink-0 mt-0.5" />
                  <span>Melihat seluruh naskah soal yang sudah diinput oleh setiap Ustadz/Guru secara real-time.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0F1E3D] shrink-0 mt-0.5" />
                  <span>Membuka langsung naskah soal guru di editor atau mengunduh versi Word (.docx) dan PDF siap cetak.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0F1E3D] shrink-0 mt-0.5" />
                  <span>Melihat rekap semua nilai dari seluruh guru &amp; mengonversinya menjadi laporan Excel (.xlsx) multi-sheet.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>{schoolName || 'Smart Question & Grade Portal'}</span>
          <span>Data tersinkronisasi aman melalui Google Cloud &amp; Firebase</span>
        </div>
      </footer>
    </div>
  );
};
