import React, { useState } from 'react';
import { Plus, Trash2, Save, Check } from 'lucide-react';
import type { SubjectConfig, TemplateDocument } from '../types/exam';

interface SubjectSettingsViewProps {
  subjects: SubjectConfig[];
  templates: TemplateDocument[];
  onSaveSubject: (subject: SubjectConfig) => Promise<void>;
  onDeleteSubject: (subjectId: string) => Promise<void>;
}

export const SubjectSettingsView: React.FC<SubjectSettingsViewProps> = ({
  subjects,
  templates,
  onSaveSubject,
  onDeleteSubject,
}) => {
  const [newShortName, setNewShortName] = useState('');
  const [newFormalName, setNewFormalName] = useState('');
  const [newDuration, setNewDuration] = useState('90 minutes');
  const [newTemplateId, setNewTemplateId] = useState(templates[0]?.id || 'tpl_kmi_latin');
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortName.trim()) return;
    const code = newShortName.trim();
    const formal = (newFormalName.trim() || code).toUpperCase();
    const created: SubjectConfig = {
      id: `sub_custom_${Date.now()}`,
      code,
      shortName: code,
      formalName: formal,
      defaultTemplateId: newTemplateId,
      defaultDuration: newDuration.trim() || '90 Menit',
      defaultInstructions:
        '1. Bacalah setiap soal dengan cermat sebelum memilih jawaban.\n2. Periksa kembali seluruh jawaban sebelum dikumpulkan.',
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };
    await onSaveSubject(created);
    setNewShortName('');
    setNewFormalName('');
  };

  const handleUpdateField = async (
    sub: SubjectConfig,
    patch: Partial<SubjectConfig>
  ) => {
    await onSaveSubject({
      ...sub,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    setSavedId(sub.id);
    setTimeout(() => setSavedId(null), 1200);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-bold text-slate-900">Pengaturan Mata Pelajaran Otomatis</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Atur nama resmi dokumen (misal IPS menjadi ILMU PENGETAHUAN SOSIAL), template bawaan per mata pelajaran, durasi standar, dan petunjuk khusus. Mengganti mata pelajaran pada editor otomatis memperbarui seluruh identitas dan preview tanpa mengubah isi soal.
        </p>

        {/* Form Tambah Mata Pelajaran Baru */}
        <form onSubmit={handleAddSubject} className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Singkat / Dropdown
            </label>
            <input
              type="text"
              value={newShortName}
              onChange={(e) => setNewShortName(e.target.value)}
              placeholder="Contoh: Ekonomi"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Resmi pada Dokumen
            </label>
            <input
              type="text"
              value={newFormalName}
              onChange={(e) => setNewFormalName(e.target.value)}
              placeholder="Contoh: EKONOMI DAN AKUNTANSI"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Durasi Default</label>
            <input
              type="text"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <select
              value={newTemplateId}
              onChange={(e) => setNewTemplateId(e.target.value)}
              className="flex-1 px-2.5 py-2 text-xs border border-slate-200 rounded-lg min-w-0"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newShortName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F1E3D] hover:bg-[#172B4D] disabled:opacity-50 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Tambah
            </button>
          </div>
        </form>
      </div>

      {/* Subject List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Daftar Konfigurasi Mata Pelajaran ({subjects.length})
        </div>
        <div className="divide-y divide-slate-200">
          {subjects.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              Data mata pelajaran otomatis sengaja dikosongkan agar guru bebas menginput nama mata pelajaran secara langsung pada dokumen atau kolom editor. Anda juga dapat menambahkan preset mata pelajaran sendiri melalui form di atas bila diperlukan.
            </div>
          )}
          {subjects.map((sub) => (
            <div key={sub.id} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-3">
                <div className="text-sm font-bold text-[#0F1E3D]">{sub.shortName}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Kode: {sub.code} · {sub.isCustom ? 'Kustom' : 'Bawaan'}
                </div>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">
                  Judul Resmi Dokumen
                </label>
                <input
                  type="text"
                  value={sub.formalName}
                  onChange={(e) => handleUpdateField(sub, { formalName: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-md"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Template Bawaan</label>
                <select
                  value={sub.defaultTemplateId}
                  onChange={(e) => handleUpdateField(sub, { defaultTemplateId: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Alokasi Waktu</label>
                <input
                  type="text"
                  value={sub.defaultDuration}
                  onChange={(e) => handleUpdateField(sub, { defaultDuration: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div className="lg:col-span-1 flex items-center justify-end gap-2 pt-5">
                {savedId === sub.id ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Save className="w-4 h-4 text-slate-300" />
                )}
                {sub.isCustom && (
                  <button
                    type="button"
                    onClick={() => onDeleteSubject(sub.id)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title="Hapus Mata Pelajaran"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="lg:col-span-12">
                <label className="block text-[11px] text-slate-500 mb-1">
                  Petunjuk Pengerjaan Khusus ({sub.shortName})
                </label>
                <textarea
                  rows={2}
                  value={sub.defaultInstructions}
                  onChange={(e) => handleUpdateField(sub, { defaultInstructions: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
