import React, { useState } from 'react';
import { Save, Check, LogIn, LogOut, Download } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UserSettings } from '../types/exam';

interface WebsiteSettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (next: UserSettings) => Promise<void>;
  user: User | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onExportBackupJson: () => void;
}

export const WebsiteSettingsView: React.FC<WebsiteSettingsViewProps> = ({
  settings,
  onSaveSettings,
  user,
  onSignInGoogle,
  onSignOut,
  onExportBackupJson,
}) => {
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({ ...draft, updatedAt: new Date().toISOString() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Cloud Sync & Auth */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Akun & Sinkronisasi Cloud Firestore</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {user
              ? `Terhubung sebagai ${user.displayName || user.email} (${user.email}). Pengaturan, template, mata pelajaran, dan riwayat dokumen tersinkronisasi aman ke Cloud Firestore.`
              : 'Saat ini data tersimpan secara lokal di browser. Masuk dengan Google untuk menyinkronkan riwayat dan template lintas perangkat.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onExportBackupJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh Cadangan JSON
          </button>
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar Akun
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] rounded-lg whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              Masuk dengan Google
            </button>
          )}
        </div>
      </div>

      {/* Default School Identity & Site Preferences */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Identitas Sekolah & Preferensi Bawaan
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nilai bawaan ini otomatis terisi setiap kali Anda membuat dokumen soal baru.
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg whitespace-nowrap"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Pengaturan Tersimpan' : 'Simpan Pengaturan'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Sekolah Default</label>
            <input
              type="text"
              value={draft.schoolName}
              onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Sekolah Default</label>
            <input
              type="text"
              value={draft.schoolAddress}
              onChange={(e) => setDraft({ ...draft, schoolAddress: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Ujian Default</label>
            <input
              type="text"
              value={draft.examType}
              onChange={(e) => setDraft({ ...draft, examType: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Guru Default</label>
            <input
              type="text"
              value={draft.teacherName}
              onChange={(e) => setDraft({ ...draft, teacherName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Ajaran Default</label>
            <input
              type="text"
              value={draft.academicYear}
              onChange={(e) => setDraft({ ...draft, academicYear: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Semester Default</label>
            <select
              value={draft.semester}
              onChange={(e) => setDraft({ ...draft, semester: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Ukuran Kertas Default</label>
            <select
              value={draft.paperSize}
              onChange={(e) =>
                setDraft({ ...draft, paperSize: e.target.value as UserSettings['paperSize'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            >
              <option value="A4">A4</option>
              <option value="F4">F4 / Folio</option>
              <option value="Letter">Letter</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Font Dokumen Default</label>
            <select
              value={draft.fontFamily}
              onChange={(e) =>
                setDraft({ ...draft, fontFamily: e.target.value as UserSettings['fontFamily'] })
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            >
              <option value="Times New Roman">Times New Roman</option>
              <option value="Calibri">Calibri</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
              <option value="Amiri">Amiri (Naskh Arab)</option>
              <option value="Noto Naskh Arabic">Noto Naskh Arabic</option>
              <option value="Traditional Arabic">Traditional Arabic</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 space-y-2.5">
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.preserveContentStrict}
              onChange={(e) => setDraft({ ...draft, preserveContentStrict: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Aktifkan mode ketat PRESERVE ORIGINAL CONTENT (AI & Parser dilarang mengubah substansi atau mengarang opsi yang hilang)
          </label>
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.autoAnalyzeOnPaste}
              onChange={(e) => setDraft({ ...draft, autoAnalyzeOnPaste: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Otomatis jalankan parser aturan secara langsung saat mengetik atau menempelkan soal
          </label>
        </div>
      </form>
    </div>
  );
};
