import React, { useRef, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  XCircle,
  Trash2,
  ImagePlus,
  FileSpreadsheet,
  Save,
  Check,
} from 'lucide-react';
import type { TemplateDocument } from '../types/exam';
import { PLACEHOLDER_CATALOG } from '../data/defaults';
import { inspectUploadedTemplate } from '../utils/docxEngine';

interface TemplateManagerViewProps {
  templates: TemplateDocument[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onSaveTemplate: (tpl: TemplateDocument) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  schoolLogoDataUrl?: string;
  onUpdateSchoolLogo: (dataUrl: string | undefined) => Promise<void>;
}

const STRUCTURE_LABELS: { key: keyof TemplateDocument['structure']; label: string }[] = [
  { key: 'hasKopSekolah', label: 'Kop Sekolah' },
  { key: 'hasLogo', label: 'Logo Sekolah' },
  { key: 'hasSchoolName', label: 'Nama Sekolah' },
  { key: 'hasExamIdentity', label: 'Identitas Ujian' },
  { key: 'hasSubject', label: 'Mata Pelajaran' },
  { key: 'hasClass', label: 'Kelas' },
  { key: 'hasSemester', label: 'Semester' },
  { key: 'hasAcademicYear', label: 'Tahun Ajaran' },
  { key: 'hasDate', label: 'Hari & Tanggal' },
  { key: 'hasDuration', label: 'Alokasi Waktu' },
  { key: 'hasParticipantFields', label: 'Nama & No. Peserta' },
  { key: 'hasInstructions', label: 'Petunjuk Pengerjaan' },
  { key: 'hasQuestionArea', label: 'Area Soal' },
  { key: 'hasPageNumbers', label: 'Nomor Halaman' },
];

export const TemplateManagerView: React.FC<TemplateManagerViewProps> = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  schoolLogoDataUrl,
  onUpdateSchoolLogo,
}) => {
  const [activeId, setActiveId] = useState<string>(selectedTemplateId || templates[0]?.id);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const activeTemplate = templates.find((t) => t.id === activeId) || templates[0];

  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const inspected = await inspectUploadedTemplate(file);
      const id = `tpl_${Date.now()}`;
      const newTpl: TemplateDocument = {
        id,
        name: inspected.name || file.name,
        description: inspected.description || 'Template sekolah diunggah',
        sourceType: inspected.sourceType || 'docx',
        paperSize: inspected.paperSize || 'A4',
        headerTitle: inspected.headerTitle || 'KOP SEKOLAH',
        headerSubtitle: inspected.headerSubtitle || '',
        kopLines: inspected.kopLines || [],
        placeholdersDetected: inspected.placeholdersDetected || [],
        placeholderMappings: inspected.placeholderMappings || {},
        docxBase64: inspected.docxBase64,
        pdfDataUrl: inspected.pdfDataUrl,
        extractedPreviewText: inspected.extractedPreviewText,
        extractedHtmlPreview: inspected.extractedHtmlPreview,
        structure: inspected.structure || {
          hasKopSekolah: true,
          hasLogo: false,
          hasSchoolName: true,
          hasExamIdentity: true,
          hasSubject: true,
          hasClass: true,
          hasSemester: true,
          hasAcademicYear: true,
          hasDate: true,
          hasDuration: true,
          hasParticipantFields: true,
          hasInstructions: true,
          hasQuestionArea: true,
          hasPageNumbers: true,
        },
        margins: inspected.margins,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSaveTemplate(newTpl);
      setActiveId(id);
      onSelectTemplate(id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal membaca file template.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await onUpdateSchoolLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMappingChange = async (placeholderKey: string, targetText: string) => {
    if (!activeTemplate) return;
    const updated: TemplateDocument = {
      ...activeTemplate,
      placeholderMappings: {
        ...(activeTemplate.placeholderMappings || {}),
        [placeholderKey]: targetText,
      },
      updatedAt: new Date().toISOString(),
    };
    await onSaveTemplate(updated);
  };

  const handleHeaderFieldChange = async (
    field: 'name' | 'headerTitle' | 'headerSubtitle' | 'paperSize' | 'direction',
    value: string
  ) => {
    if (!activeTemplate) return;
    const updated: TemplateDocument = {
      ...activeTemplate,
      [field]: value,
      updatedAt: new Date().toISOString(),
    };
    await onSaveTemplate(updated);
  };

  const handleConfirmSave = async () => {
    if (!activeTemplate) return;
    await onSaveTemplate({ ...activeTemplate, updatedAt: new Date().toISOString() });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header & Upload Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Template Manager Dinamis</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Unggah template DOCX/DOC sekolah atau referensi PDF. Desain asli, kop surat, logo, tabel, margin, dan header/footer akan dipertahankan saat ekspor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-4 h-4 text-[#0F1E3D]" />
            {schoolLogoDataUrl ? 'Ganti Logo Sekolah' : 'Unggah Logo Sekolah'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc,.pdf"
            onChange={handleUploadTemplate}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Memindai Template...' : 'Unggah Template (DOCX / DOC / PDF)'}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
          {uploadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Template List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Daftar Template ({templates.length})
            </h3>
            {schoolLogoDataUrl && (
              <button
                type="button"
                onClick={() => onUpdateSchoolLogo(undefined)}
                className="text-[11px] text-rose-600 hover:text-rose-800"
              >
                Hapus Logo
              </button>
            )}
          </div>

          {schoolLogoDataUrl && (
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
              <img
                src={schoolLogoDataUrl}
                alt="Logo Sekolah Aktif"
                referrerPolicy="no-referrer"
                className="w-10 h-10 object-contain border border-slate-200 rounded bg-white p-0.5"
              />
              <div className="text-xs">
                <div className="font-semibold text-slate-800">Logo Kop Sekolah Aktif</div>
                <div className="text-slate-500">Otomatis disisipkan pada dokumen ekspor</div>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {templates.map((tpl) => {
              const isSelectedForWork = tpl.id === selectedTemplateId;
              const isViewing = tpl.id === activeTemplate?.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setActiveId(tpl.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isViewing ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {tpl.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {tpl.sourceType.toUpperCase()} · {tpl.paperSize} · {tpl.direction === 'rtl' ? 'RTL Arab' : 'LTR'}
                        {isSelectedForWork ? ' · Aktif di Editor' : ''}
                      </div>
                    </div>
                    {tpl.sourceType !== 'builtin' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(tpl.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Hapus Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 line-clamp-2">{tpl.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTemplate(tpl.id);
                        setActiveId(tpl.id);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        isSelectedForWork
                          ? 'bg-[#0F1E3D] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {isSelectedForWork ? 'Sedang Digunakan' : 'Gunakan Template Ini'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Template Inspector, Structure Scanner & Placeholder Mapper */}
        {activeTemplate && (
          <div className="lg:col-span-8 space-y-5">
            {/* Template Metadata & Kop Settings */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Konfigurasi & Pemindai Struktur Template
                </h3>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  {savedFeedback ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {savedFeedback ? 'Tersimpan' : 'Simpan Perubahan'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Template</label>
                  <input
                    type="text"
                    value={activeTemplate.name}
                    onChange={(e) => handleHeaderFieldChange('name', e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kertas Default</label>
                  <select
                    value={activeTemplate.paperSize}
                    onChange={(e) => handleHeaderFieldChange('paperSize', e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="A4">A4</option>
                    <option value="F4">F4 / Folio</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Arah Teks</label>
                  <select
                    value={activeTemplate.direction || 'ltr'}
                    onChange={(e) => handleHeaderFieldChange('direction', e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="ltr">LTR (Umum)</option>
                    <option value="rtl">RTL (Bahasa Arab)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Baris Atas Kop Sekolah
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.headerTitle}
                    onChange={(e) => handleHeaderFieldChange('headerTitle', e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sub-judul Dokumen
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.headerSubtitle}
                    onChange={(e) => handleHeaderFieldChange('headerSubtitle', e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* 14-Point Structure Detection */}
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Elemen Struktur Terdeteksi pada Template
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {STRUCTURE_LABELS.map(({ key, label }) => {
                    const ok = activeTemplate.structure[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50"
                      >
                        {ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className={ok ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Placeholder Mapping */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Pemetaan Placeholder Otomatis
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jika dokumen Word Anda memakai teks khusus (misal <code className="font-mono">[NAMA SEKOLAH]</code> atau <code className="font-mono">ISIAN_MAPEL</code>), ketik teks targetnya di kolom kanan agar sistem menggantinya otomatis tanpa merusak gaya asli.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {PLACEHOLDER_CATALOG.map((item) => {
                  const currentVal = activeTemplate.placeholderMappings?.[item.key] ?? item.key;
                  const detectedInFile = activeTemplate.placeholdersDetected.includes(item.key);
                  return (
                    <div
                      key={item.key}
                      className="px-5 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs"
                    >
                      <div className="md:col-span-5">
                        <div className="font-mono font-semibold text-[#0F1E3D]">{item.key}</div>
                        <div className="text-slate-500">{item.label}</div>
                      </div>
                      <div className="md:col-span-5">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) => handleMappingChange(item.key, e.target.value)}
                          placeholder={item.key}
                          className="w-full px-2.5 py-1.5 font-mono text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div className="md:col-span-2 text-right">
                        <span
                          className={`font-medium ${
                            detectedInFile ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {detectedInFile ? 'Terdeteksi' : 'Pemetaan'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Extracted Template Preview (DOCX HTML / PDF / Text) */}
            {(activeTemplate.extractedHtmlPreview ||
              activeTemplate.pdfDataUrl ||
              activeTemplate.extractedPreviewText) && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <FileSpreadsheet className="w-4 h-4 text-[#0F1E3D]" />
                  Pratinjau Struktur File Asli ({activeTemplate.sourceType.toUpperCase()})
                </div>
                {activeTemplate.pdfDataUrl ? (
                  <iframe
                    src={activeTemplate.pdfDataUrl}
                    title="Referensi Template PDF"
                    className="w-full h-[420px] border-0"
                  />
                ) : activeTemplate.extractedHtmlPreview ? (
                  <div
                    className="p-5 max-h-[380px] overflow-auto text-sm prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: activeTemplate.extractedHtmlPreview }}
                  />
                ) : (
                  <pre className="p-4 max-h-[320px] overflow-auto text-xs font-mono text-slate-700 whitespace-pre-wrap">
                    {activeTemplate.extractedPreviewText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
