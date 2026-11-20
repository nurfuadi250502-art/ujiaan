import React, { useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  FileCheck2,
  RotateCcw,
  Save,
  Upload,
  Download,
  Printer,
  Copy,
  AlertTriangle,
  Edit3,
  Check,
  X,
  FileText,
  SlidersHorizontal,
  ShieldCheck,
  Eye,
  ListChecks,
} from 'lucide-react';
import type {
  ExamIdentity,
  FormatConfig,
  ParsedQuestion,
  ParserWarning,
  QuestionType,
  SubjectConfig,
  TemplateDocument,
} from '../types/exam';
import { SAMPLE_ARABIC_RAW_QUESTIONS, SAMPLE_RAW_QUESTIONS } from '../data/defaults';
import { extractRawTextFromQuestionFile } from '../utils/docxEngine';
import { buildAccuracyReport, formatQuestionNumberLabel } from '../utils/accuracyValidator';
import { containsArabicText, formatOptionMarkerChar } from '../utils/ruleParser';
import { stripRichHtml } from '../utils/richText';
import { LiveDocumentPreview } from './LiveDocumentPreview';
import { ValidationComparisonView } from './ValidationComparisonView';

interface QuestionWorkspaceProps {
  documentTitle: string;
  onChangeDocumentTitle: (val: string) => void;
  rawText: string;
  onChangeRawText: (val: string) => void;
  parsedQuestions: ParsedQuestion[];
  onChangeParsedQuestions: (questions: ParsedQuestion[]) => void;
  warnings: ParserWarning[];
  detectedSubject?: string;
  parseEngine: 'gemini-ai' | 'rule-based';
  fallbackNotice?: string;
  isAnalyzing: boolean;
  onAnalyze: () => Promise<void>;
  onApplyToTemplate: () => Promise<void>;
  onLoadEnglishSample: () => void;
  onLoadArabicSample: () => void;
  onResetInput: () => void;
  onSaveDraft: () => Promise<void>;
  onDuplicateDocument: () => Promise<void>;
  onExportDocx: () => Promise<void>;
  onExportPdf: () => void | Promise<void>;
  subjects: SubjectConfig[];
  selectedSubjectCode: string;
  onSelectSubject: (code: string) => void;
  templates: TemplateDocument[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  identity: ExamIdentity;
  onChangeIdentity: (next: ExamIdentity) => void;
  formatConfig: FormatConfig;
  onChangeFormatConfig: (next: FormatConfig) => void;
  logoDataUrl?: string;
  isExportingDocx: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  pilihan_ganda: 'Pilihan Ganda',
  pilihan_ganda_kompleks: 'PG Kompleks',
  benar_salah: 'Benar / Salah',
  menjodohkan: 'Menjodohkan',
  isian_singkat: 'Isian Singkat',
  uraian: 'Uraian',
  esai: 'Esai',
};

export const QuestionWorkspace: React.FC<QuestionWorkspaceProps> = ({
  documentTitle,
  onChangeDocumentTitle,
  rawText,
  onChangeRawText,
  parsedQuestions,
  onChangeParsedQuestions,
  warnings,
  detectedSubject,
  parseEngine,
  fallbackNotice,
  isAnalyzing,
  onAnalyze,
  onApplyToTemplate,
  onLoadEnglishSample,
  onLoadArabicSample,
  onResetInput,
  onSaveDraft,
  onDuplicateDocument,
  onExportDocx,
  onExportPdf,
  subjects,
  selectedSubjectCode,
  onSelectSubject,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  identity,
  onChangeIdentity,
  formatConfig,
  onChangeFormatConfig,
  logoDataUrl,
  isExportingDocx,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const [leftTab, setLeftTab] = useState<'input' | 'identity' | 'format'>('input');
  const [rightTab, setRightTab] = useState<'preview' | 'structure' | 'validation'>('preview');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editDraftStem, setEditDraftStem] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || templates[0],
    [templates, selectedTemplateId]
  );

  const accuracyReport = useMemo(
    () =>
      buildAccuracyReport({
        rawText,
        detectedSubject,
        questions: parsedQuestions,
        warnings,
        identity,
        template: activeTemplate,
        numberFormat: formatConfig.numberFormat,
      }),
    [rawText, detectedSubject, parsedQuestions, warnings, identity, activeTemplate, formatConfig.numberFormat]
  );

  const handleUploadRawFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const extracted = await extractRawTextFromQuestionFile(file);
      onChangeRawText(extracted);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal membaca file soal.');
    } finally {
      e.target.value = '';
    }
  };

  const handleStartEditQuestion = (q: ParsedQuestion) => {
    setEditingQuestionId(q.id);
    setEditDraftStem(q.stem);
  };

  const handleConfirmEditQuestion = (qId: string) => {
    onChangeParsedQuestions(
      parsedQuestions.map((q) =>
        q.id === qId
          ? {
              ...q,
              stem: editDraftStem,
              needsManualReview: false,
              reviewReason: undefined,
            }
          : q
      )
    );
    setEditingQuestionId(null);
  };

  const handlePrint = async () => {
    setRightTab('preview');
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
    setTimeout(() => {
      window.print();
    }, 180);
  };

  const handleWrapUnderlineSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const selected = rawText.slice(start, end);
    const wrapped = selected.startsWith('<u>') && selected.endsWith('</u>')
      ? selected.slice(3, -4)
      : `<u>${selected}</u>`;
    const next = `${rawText.slice(0, start)}${wrapped}${rawText.slice(end)}`;
    onChangeRawText(next);
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Context Bar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="min-w-[220px] flex-1 max-w-sm">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Judul Dokumen Ujian
            </label>
            <input
              type="text"
              value={documentTitle}
              onChange={(e) => onChangeDocumentTitle(e.target.value)}
              placeholder="Contoh: Naskah Soal PAS IPS Kelas VIII"
              className="w-full px-3 py-1.5 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
            />
          </div>

          <div className="min-w-[210px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Mata Pelajaran (Input Guru)
            </label>
            <input
              type="text"
              list="teacher-subjects-list"
              value={stripRichHtml(identity.subjectFormalName)}
              onChange={(e) => {
                const val = e.target.value;
                const matched = subjects.find(
                  (s) =>
                    s.code.toLowerCase() === val.toLowerCase() ||
                    s.shortName.toLowerCase() === val.toLowerCase() ||
                    s.formalName.toLowerCase() === val.toLowerCase()
                );
                if (matched) {
                  onSelectSubject(matched.code);
                } else {
                  onChangeIdentity({
                    ...identity,
                    subjectCode: val,
                    subjectFormalName: val,
                  });
                }
              }}
              placeholder="Ketik mata pelajaran (misal: ENGLISH LESSON)"
              className="w-full px-3 py-1.5 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
            />
            <datalist id="teacher-subjects-list">
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.formalName} />
              ))}
            </datalist>
          </div>

          <div className="min-w-[220px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Template Dokumen
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => onSelectTemplate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Export & Save Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSaveDraft}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            SIMPAN DRAFT
          </button>
          <button
            type="button"
            onClick={onDuplicateDocument}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplikasi
          </button>
          <button
            type="button"
            onClick={onExportDocx}
            disabled={isExportingDocx || parsedQuestions.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {isExportingDocx ? 'Menyiapkan DOCX...' : 'Download DOCX'}
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={parsedQuestions.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={parsedQuestions.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Langsung
          </button>
        </div>
      </div>

      {/* Main Split Workbench */}
      <div className="print-reset-layout grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT PANE: Editor + Identity + Format */}
        <div className="no-print xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          {/* Left Pane Segmented Tabs */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLeftTab('input')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                leftTab === 'input'
                  ? 'bg-white text-[#0F1E3D] shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Input Soal
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('identity')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                leftTab === 'identity'
                  ? 'bg-white text-[#0F1E3D] shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Identitas Ujian
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('format')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                leftTab === 'format'
                  ? 'bg-white text-[#0F1E3D] shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Format Soal
            </button>
          </div>

          {/* Left Tab 1: INPUT SOAL OTOMATIS */}
          {leftTab === 'input' && (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="raw-question-editor"
                  className="text-xs font-bold tracking-wide text-[#0F1E3D] uppercase"
                >
                  TEMPEL ATAU KETIK SOAL MENTAH DI SINI
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.txt"
                    onChange={handleUploadRawFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3 h-3" />
                    Unggah DOCX / TXT
                  </button>
                  <button
                    type="button"
                    onClick={handleWrapUnderlineSelection}
                    className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 underline"
                    title="Pilih teks di editor lalu klik untuk memberi garis bawah (<u>)"
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onClick={onLoadEnglishSample}
                    className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Contoh Inggris (KMI)
                  </button>
                  <button
                    type="button"
                    onClick={onLoadArabicSample}
                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Contoh Arab (KMI)
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {uploadError}
                </div>
              )}

              <textarea
                ref={textareaRef}
                id="raw-question-editor"
                dir={formatConfig.direction === 'rtl' || containsArabicText(rawText) ? 'rtl' : 'ltr'}
                value={rawText}
                onChange={(e) => onChangeRawText(e.target.value)}
                rows={16}
                style={{
                  fontFamily:
                    formatConfig.direction === 'rtl' || containsArabicText(rawText)
                      ? '"Amiri", "Noto Naskh Arabic", serif'
                      : undefined,
                }}
                placeholder={`Contoh:\nMata Pelajaran: IPS\n\n1. Apa yang dimaksud dengan kegiatan ekonomi?\nA. Kegiatan menghasilkan barang\n\nContoh Arab:\nالمادة: الحديث\nلالف ) أجب هذه الأسئلة الآتية...\n١. ماذا أراد الأمير ؟`}
                className={`w-full p-3.5 leading-relaxed text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white resize-y min-h-[340px] ${
                  formatConfig.direction === 'rtl' || containsArabicText(rawText)
                    ? 'text-base'
                    : 'text-sm font-mono'
                }`}
              />

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  <span className="tabular-nums">{rawText.split(/\r?\n/).filter((l) => l.trim()).length}</span> baris
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">{parsedQuestions.length}</span> soal terdeteksi
                </span>
                <span>
                  Mesin: {parseEngine === 'gemini-ai' ? 'AI Gemini + Verifikasi Aturan' : 'Parser Berbasis Aturan'}
                </span>
              </div>

              {fallbackNotice && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>{fallbackNotice}</span>
                </div>
              )}

              {/* Primary Workflow Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onAnalyze}
                  disabled={isAnalyzing || !rawText.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalyzing ? 'Menganalisis...' : 'ANALISIS SOAL'}
                </button>
                <button
                  type="button"
                  onClick={onApplyToTemplate}
                  disabled={isAnalyzing || !rawText.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileCheck2 className="w-4 h-4" />
                  MASUKKAN KE TEMPLATE
                </button>
                <button
                  type="button"
                  onClick={onResetInput}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  RESET INPUT
                </button>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  SIMPAN DRAFT
                </button>
              </div>
            </div>
          )}

          {/* Left Tab 2: IDENTITAS DOKUMEN OTOMATIS */}
          {leftTab === 'identity' && (
            <div className="p-4 space-y-3.5 max-h-[680px] overflow-y-auto">
              <div className="text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                Data identitas otomatis terisi ke kop dokumen dan placeholder template. Penggantian mata pelajaran di bagian atas otomatis memperbarui nama resmi mata pelajaran.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Sekolah</label>
                <input
                  type="text"
                  value={identity.schoolName}
                  onChange={(e) => onChangeIdentity({ ...identity, schoolName: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alamat / Keterangan Kop</label>
                <input
                  type="text"
                  value={identity.schoolAddress}
                  onChange={(e) => onChangeIdentity({ ...identity, schoolAddress: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Ujian</label>
                  <input
                    type="text"
                    value={identity.examType}
                    onChange={(e) => onChangeIdentity({ ...identity, examType: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mata Pelajaran (Dokumen)</label>
                  <input
                    type="text"
                    value={identity.subjectFormalName}
                    onChange={(e) => onChangeIdentity({ ...identity, subjectFormalName: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    value={identity.className}
                    onChange={(e) => onChangeIdentity({ ...identity, className: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
                  <select
                    value={identity.semester}
                    onChange={(e) => onChangeIdentity({ ...identity, semester: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                  <input
                    type="text"
                    value={identity.academicYear}
                    onChange={(e) => onChangeIdentity({ ...identity, academicYear: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Hari & Tanggal</label>
                  <input
                    type="text"
                    value={identity.examDate}
                    onChange={(e) => onChangeIdentity({ ...identity, examDate: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Alokasi Waktu</label>
                  <input
                    type="text"
                    value={identity.duration}
                    onChange={(e) => onChangeIdentity({ ...identity, duration: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah Soal (Otomatis)</label>
                  <input
                    type="text"
                    readOnly
                    value={`${parsedQuestions.length} Soal`}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-100 text-slate-700 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Guru Pengampu / المعلّم</label>
                <input
                  type="text"
                  value={identity.teacherName}
                  onChange={(e) => onChangeIdentity({ ...identity, teacherName: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-[#0F1E3D]">
                  Detail Tabel Ujian KMI ({formatConfig.direction === 'rtl' ? 'Bahasa Arab' : 'Inggris / Umum'})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {formatConfig.direction === 'rtl' ? 'Hari (اليوم)' : 'Hari (DAY)'}
                    </label>
                    <input
                      type="text"
                      dir={formatConfig.direction === 'rtl' ? 'rtl' : 'ltr'}
                      value={stripRichHtml(identity.examDay || '')}
                      onChange={(e) => onChangeIdentity({ ...identity, examDay: e.target.value })}
                      placeholder={formatConfig.direction === 'rtl' ? 'السبت' : 'WEDNESDAY'}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Tgl Hijriah</label>
                    <input
                      type="text"
                      dir={formatConfig.direction === 'rtl' ? 'rtl' : 'ltr'}
                      value={stripRichHtml(identity.hijriDate || '')}
                      onChange={(e) => onChangeIdentity({ ...identity, hijriDate: e.target.value })}
                      placeholder={formatConfig.direction === 'rtl' ? '١٩ محرم ١٤٤٨' : '23 MUHARRAM 1448'}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      {formatConfig.direction === 'rtl' ? 'Hishoh (الحصّة)' : 'Jam Ke (PERIOD)'}
                    </label>
                    <input
                      type="text"
                      dir={formatConfig.direction === 'rtl' ? 'rtl' : 'ltr'}
                      value={stripRichHtml(identity.sessionPeriod || '')}
                      onChange={(e) => onChangeIdentity({ ...identity, sessionPeriod: e.target.value })}
                      placeholder={formatConfig.direction === 'rtl' ? 'الثانية' : 'SECOND'}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Kalimat Penutup (Opsional)
                  </label>
                  <input
                    type="text"
                    dir={formatConfig.direction === 'rtl' ? 'rtl' : 'ltr'}
                    value={stripRichHtml(identity.closingText || '')}
                    onChange={(e) => onChangeIdentity({ ...identity, closingText: e.target.value })}
                    placeholder={formatConfig.direction === 'rtl' ? '--مع أطيب تمنياتنا بالتوفيق و النجاح--' : ''}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Petunjuk Pengerjaan (Opsional)</label>
                <textarea
                  rows={3}
                  value={identity.instructions}
                  onChange={(e) => onChangeIdentity({ ...identity, instructions: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={identity.includeStudentFields}
                  onChange={(e) =>
                    onChangeIdentity({ ...identity, includeStudentFields: e.target.checked })
                  }
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Sertakan kolom Nama Peserta & Nomor Peserta pada tabel identitas
              </label>
            </div>
          )}

          {/* Left Tab 3: PENGATURAN FORMAT SOAL */}
          {leftTab === 'format' && (
            <div className="p-4 space-y-4 max-h-[680px] overflow-y-auto">
              {/* Arabic & RTL Direction Controls */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-[#0F1E3D]">
                  Arah Penulisan & Tata Letak Bahasa (LTR / RTL Arab)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Arah Dokumen</label>
                    <select
                      value={formatConfig.direction}
                      onChange={(e) => {
                        const dir = e.target.value as FormatConfig['direction'];
                        onChangeFormatConfig({
                          ...formatConfig,
                          direction: dir,
                          arabicNumeralStyle: dir === 'rtl' ? 'eastern' : 'western',
                          optionLabelStyle: dir === 'rtl' ? 'arabic' : 'auto',
                          fontFamily:
                            dir === 'rtl' && !['Amiri', 'Noto Naskh Arabic', 'Traditional Arabic'].includes(formatConfig.fontFamily)
                              ? 'Amiri'
                              : dir === 'ltr' && ['Amiri', 'Noto Naskh Arabic', 'Traditional Arabic'].includes(formatConfig.fontFamily)
                              ? 'Times New Roman'
                              : formatConfig.fontFamily,
                          fontSize: dir === 'rtl' && formatConfig.fontSize < 12 ? 13 : formatConfig.fontSize,
                          lineSpacing: dir === 'rtl' && formatConfig.lineSpacing < 1.5 ? 1.6 : formatConfig.lineSpacing,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      <option value="ltr">Kiri ke Kanan (LTR)</option>
                      <option value="rtl">Kanan ke Kiri (RTL · Arab)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Angka Soal</label>
                    <select
                      value={formatConfig.arabicNumeralStyle}
                      onChange={(e) =>
                        onChangeFormatConfig({
                          ...formatConfig,
                          arabicNumeralStyle: e.target.value as FormatConfig['arabicNumeralStyle'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      <option value="western">Latin (1, 2, 3)</option>
                      <option value="eastern">Arab (١، ٢، ٣)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Huruf Opsi</label>
                    <select
                      value={formatConfig.optionLabelStyle}
                      onChange={(e) =>
                        onChangeFormatConfig({
                          ...formatConfig,
                          optionLabelStyle: e.target.value as FormatConfig['optionLabelStyle'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      <option value="auto">Otomatis</option>
                      <option value="latin">Latin (A, B, C, D)</option>
                      <option value="arabic">Arab (أ، ب، ج، د)</option>
                    </select>
                  </div>
                </div>
                {formatConfig.direction === 'rtl' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Gaya Tata Letak Naskah Arab
                    </label>
                    <select
                      value={formatConfig.arabicTemplateStyle ?? 'pesantren-kmi'}
                      onChange={(e) =>
                        onChangeFormatConfig({
                          ...formatConfig,
                          arabicTemplateStyle: e.target.value as FormatConfig['arabicTemplateStyle'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      <option value="pesantren-kmi">Format Ujian Pesantren / KMI (المادة · اليوم · الفصل · الحصّة · المعلّم)</option>
                      <option value="standard">Format Kop Sekolah Resmi + Logo</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ukuran Kertas</label>
                  <select
                    value={formatConfig.paperSize}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        paperSize: e.target.value as FormatConfig['paperSize'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="F4">F4 / Folio (215 × 330 mm)</option>
                    <option value="Letter">Letter (215.9 × 279.4 mm)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Font</label>
                  <select
                    value={formatConfig.fontFamily}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        fontFamily: e.target.value as FormatConfig['fontFamily'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="Amiri">Amiri (Naskh Arab)</option>
                    <option value="Noto Naskh Arabic">Noto Naskh Arabic</option>
                    <option value="Traditional Arabic">Traditional Arabic</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ukuran Font (pt)</label>
                  <input
                    type="number"
                    min={8}
                    max={18}
                    value={formatConfig.fontSize}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        fontSize: Math.max(8, Math.min(18, Number(e.target.value) || 11)),
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Spasi Baris</label>
                  <select
                    value={formatConfig.lineSpacing}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        lineSpacing: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  >
                    <option value={1.15}>1.15</option>
                    <option value={1.3}>1.30</option>
                    <option value={1.4}>1.40</option>
                    <option value={1.5}>1.50</option>
                    <option value={1.75}>1.75</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Perataan</label>
                  <select
                    value={formatConfig.alignment}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        alignment: e.target.value as FormatConfig['alignment'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="left">Rata Kiri</option>
                    <option value="center">Rata Tengah</option>
                    <option value="right">Rata Kanan</option>
                    <option value="justify">Rata Kiri-Kanan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jarak Antarsoal (px): <span className="font-mono tabular-nums">{formatConfig.questionSpacing}</span>
                  </label>
                  <input
                    type="range"
                    min={4}
                    max={28}
                    value={formatConfig.questionSpacing}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        questionSpacing: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#0F1E3D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jarak Antaropsi (px): <span className="font-mono tabular-nums">{formatConfig.optionSpacing}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={14}
                    value={formatConfig.optionSpacing}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        optionSpacing: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#0F1E3D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Margin Halaman (mm)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ['Atas', 'marginTop'],
                      ['Kanan', 'marginRight'],
                      ['Bawah', 'marginBottom'],
                      ['Kiri', 'marginLeft'],
                    ] as const
                  ).map(([label, key]) => (
                    <div key={key}>
                      <span className="block text-[11px] text-slate-500 mb-0.5">{label}</span>
                      <input
                        type="number"
                        min={8}
                        max={45}
                        value={formatConfig[key]}
                        onChange={(e) =>
                          onChangeFormatConfig({
                            ...formatConfig,
                            [key]: Math.max(8, Math.min(45, Number(e.target.value) || 20)),
                          })
                        }
                        className="w-full px-2 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Format Penomoran</label>
                  <select
                    value={formatConfig.numberFormat}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        numberFormat: e.target.value as FormatConfig['numberFormat'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="dot">1. 2. 3.</option>
                    <option value="paren">1) 2) 3)</option>
                    <option value="soal-dot">Soal 1. Soal 2.</option>
                    <option value="keep-original">Pertahankan Asli</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Posisi Nomor Soal</label>
                  <select
                    value={formatConfig.numberPosition}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        numberPosition: e.target.value as FormatConfig['numberPosition'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="left-hang">Menggantung Kiri (Hanging)</option>
                    <option value="inline">Sejajar Paragraf (Inline)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tata Letak Pilihan</label>
                  <select
                    value={formatConfig.optionColumns}
                    onChange={(e) =>
                      onChangeFormatConfig({
                        ...formatConfig,
                        optionColumns: Number(e.target.value) as 1 | 2,
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value={1}>1 Kolom (Vertikal)</option>
                    <option value={2}>2 Kolom (Berpasangan)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-1.5 pb-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formatConfig.stemBold}
                      onChange={(e) =>
                        onChangeFormatConfig({ ...formatConfig, stemBold: e.target.checked })
                      }
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Tebalkan Teks Soal (Bold)
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formatConfig.stemItalic}
                      onChange={(e) =>
                        onChangeFormatConfig({ ...formatConfig, stemItalic: e.target.checked })
                      }
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Miringkan Teks Soal (Italic)
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Direct Word-Like Editor & Live Preview + Detected Structure + Accuracy Comparison */}
        <div className="print-reset-layout xl:col-span-7 flex flex-col space-y-3">
          {/* Right Pane Tabs */}
          <div className="no-print bg-white border border-slate-200 rounded-xl p-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRightTab('preview')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                rightTab === 'preview'
                  ? 'bg-[#0F1E3D] text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Editor Dokumen (Word Style)
            </button>
            <button
              type="button"
              onClick={() => setRightTab('structure')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                rightTab === 'structure'
                  ? 'bg-[#0F1E3D] text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Struktur Soal ({parsedQuestions.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('validation')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                rightTab === 'validation'
                  ? 'bg-[#0F1E3D] text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Validasi & Perbandingan ({accuracyReport.preservationScore}%)
            </button>
          </div>

          {/* Right Pane Viewport */}
          <div className="print-reset-layout h-[820px]">
            {rightTab === 'preview' && (
              <LiveDocumentPreview
                template={activeTemplate}
                identity={identity}
                format={formatConfig}
                questions={parsedQuestions}
                logoDataUrl={logoDataUrl}
                onChangeIdentity={onChangeIdentity}
                onChangeFormatConfig={onChangeFormatConfig}
                onChangeQuestions={onChangeParsedQuestions}
                onUndo={onUndo}
                onRedo={onRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                onPrint={handlePrint}
                onExportDocx={onExportDocx}
                onExportPdf={onExportPdf}
                isExportingDocx={isExportingDocx}
              />
            )}

            {rightTab === 'structure' && (
              <div className="h-full overflow-y-auto bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                {warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Peringatan Struktur & Kelengkapan Soal ({warnings.length})
                    </div>
                    <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
                      {warnings.map((w) => (
                        <li key={w.id}>{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedQuestions.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Belum ada soal terstruktur. Masukkan teks soal di panel kiri lalu klik <strong>ANALISIS SOAL</strong>.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {parsedQuestions.map((q, idx) => {
                      const isRtlQ = formatConfig.direction === 'rtl' || containsArabicText(q.stem);
                      const label = formatQuestionNumberLabel(
                        q,
                        idx,
                        formatConfig.numberFormat,
                        formatConfig.arabicNumeralStyle,
                        isRtlQ
                      );
                      const isEditing = editingQuestionId === q.id;
                      return (
                        <div
                          key={q.id}
                          className={`border rounded-lg p-3.5 space-y-2 ${
                            q.needsManualReview
                              ? 'border-amber-300 bg-amber-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          {q.sectionTitle && (
                            <div
                              dir={isRtlQ ? 'rtl' : 'ltr'}
                              className="text-xs font-bold text-[#0F1E3D] bg-slate-100 px-2.5 py-1 rounded"
                            >
                              {stripRichHtml(q.sectionTitle)}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 text-slate-600">
                              <span className="font-mono font-bold text-[#0F1E3D] tabular-nums">
                                {label}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-slate-800">
                                {QUESTION_TYPE_LABELS[q.type]}
                              </span>
                              {q.hasFormula && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Mengandung Rumus</span>
                                </>
                              )}
                              {q.hasTable && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Tabel</span>
                                </>
                              )}
                              {q.hasImageRef && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Referensi Gambar</span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {q.needsManualReview && (
                                <span className="text-[11px] font-bold text-amber-800">
                                  PERLU PEMERIKSAAN MANUAL
                                </span>
                              )}
                              {!isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditQuestion(q)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Sunting Manual
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmEditQuestion(q.id)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white rounded text-xs"
                                  >
                                    <Check className="w-3 h-3" />
                                    Simpan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingQuestionId(null)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs"
                                  >
                                    <X className="w-3 h-3" />
                                    Batal
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {q.stimulus && (
                            <div
                              dir={isRtlQ ? 'rtl' : 'ltr'}
                              className={`text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 ${
                                isRtlQ ? '' : 'italic'
                              }`}
                            >
                              <span className="font-semibold not-italic text-slate-500 block mb-0.5" dir="ltr">
                                Bacaan / Stimulus:
                              </span>
                              {stripRichHtml(q.stimulus)}
                            </div>
                          )}

                          {isEditing ? (
                            <textarea
                              dir={isRtlQ ? 'rtl' : 'ltr'}
                              value={editDraftStem}
                              onChange={(e) => setEditDraftStem(e.target.value)}
                              rows={3}
                              className="w-full p-2 text-sm border border-sky-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          ) : (
                            <p
                              dir={isRtlQ ? 'rtl' : 'ltr'}
                              style={{ fontFamily: isRtlQ ? '"Amiri", "Noto Naskh Arabic", serif' : undefined }}
                              className={`text-slate-900 whitespace-pre-line ${isRtlQ ? 'text-base leading-loose' : 'text-sm'}`}
                            >
                              {stripRichHtml(q.stem)}
                            </p>
                          )}

                          {q.options.length > 0 && (
                            <div
                              dir={isRtlQ ? 'rtl' : 'ltr'}
                              style={{ fontFamily: isRtlQ ? '"Amiri", "Noto Naskh Arabic", serif' : undefined }}
                              className={`space-y-1 text-slate-700 ${isRtlQ ? 'pr-4 text-sm leading-relaxed' : 'pl-4 text-xs'}`}
                            >
                              {q.options.map((opt, oIdx) => {
                                const optChar = formatOptionMarkerChar(
                                  opt.label,
                                  oIdx,
                                  formatConfig.optionLabelStyle,
                                  isRtlQ
                                );
                                return (
                                  <div key={`${q.id}_struct_${opt.label}_${oIdx}`} className="flex gap-2">
                                    <span className="font-bold text-slate-900">{optChar}.</span>
                                    <span>{stripRichHtml(opt.text)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {q.reviewReason && (
                            <div className="text-xs text-amber-800 bg-amber-100/60 px-2.5 py-1.5 rounded">
                              Catatan: {q.reviewReason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {rightTab === 'validation' && (
              <div className="h-full overflow-y-auto pr-1">
                <ValidationComparisonView report={accuracyReport} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
