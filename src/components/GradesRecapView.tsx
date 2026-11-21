import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Users,
  Award,
  TrendingUp,
  ListChecks,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import type { ExamDocument, StudentScoreEntry, UserProfile, UserRole } from '../types/exam';
import { computePredicate, exportGradesToExcel } from '../utils/excelExporter';
import { stripRichHtml } from '../utils/richText';

interface GradesRecapViewProps {
  role: UserRole;
  currentUserEmail: string;
  currentUserUid: string;
  currentUserName: string;
  schoolName: string;
  defaultSemester: string;
  defaultAcademicYear: string;
  documents: ExamDocument[];
  scores: StudentScoreEntry[];
  userProfiles: UserProfile[];
  onSaveScore: (entry: StudentScoreEntry) => Promise<void>;
  onSaveScoresBatch: (entries: StudentScoreEntry[]) => Promise<void>;
  onDeleteScore: (scoreId: string) => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  drivePanel?: React.ReactNode;
}

interface ParsedBulkRow {
  studentName: string;
  studentNis: string;
  score: number;
  notes: string;
}

function parseBulkLines(raw: string): ParsedBulkRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: ParsedBulkRow[] = [];
  for (const line of lines) {
    // Support Tab, Semicolon, Pipe, or Comma separation:
    // Format A: Nama, NIS, Nilai [, Catatan]
    // Format B: Nama, Nilai
    const parts = line
      .split(/\t|;|,|\|/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length === 2) {
      const scoreVal = Number(parts[1].replace(',', '.'));
      if (!Number.isNaN(scoreVal) && scoreVal >= 0 && scoreVal <= 100) {
        parsed.push({
          studentName: parts[0],
          studentNis: '',
          score: scoreVal,
          notes: '',
        });
        continue;
      }
    }

    if (parts.length >= 3) {
      const scoreVal = Number(parts[2].replace(',', '.'));
      if (!Number.isNaN(scoreVal) && scoreVal >= 0 && scoreVal <= 100) {
        parsed.push({
          studentName: parts[0],
          studentNis: parts[1],
          score: scoreVal,
          notes: parts.slice(3).join(' '),
        });
        continue;
      }
      const altScore = Number(parts[1].replace(',', '.'));
      if (!Number.isNaN(altScore) && altScore >= 0 && altScore <= 100) {
        parsed.push({
          studentName: parts[0],
          studentNis: '',
          score: altScore,
          notes: parts.slice(2).join(' '),
        });
        continue;
      }
    }

    // Fallback regex: "Nama Siswa - 85" or "Nama Siswa 85"
    const m = line.match(/^(.+?)[\s\-:]+(\d{1,3}(?:[.,]\d{1,2})?)$/);
    if (m) {
      const val = Number(m[2].replace(',', '.'));
      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
        parsed.push({
          studentName: m[1].trim(),
          studentNis: '',
          score: val,
          notes: '',
        });
      }
    }
  }
  return parsed;
}

export const GradesRecapView: React.FC<GradesRecapViewProps> = ({
  role,
  currentUserEmail,
  currentUserUid,
  currentUserName,
  schoolName,
  defaultSemester,
  defaultAcademicYear,
  documents,
  scores,
  onSaveScore,
  onSaveScoresBatch,
  onDeleteScore,
  onToast,
  drivePanel,
}) => {
  const [inputMode, setInputMode] = useState<'single' | 'bulk'>('single');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [examTitle, setExamTitle] = useState<string>('Ujian Semester');
  const [subjectName, setSubjectName] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [semester, setSemester] = useState<string>(defaultSemester || 'Ganjil');
  const [academicYear, setAcademicYear] = useState<string>(defaultAcademicYear || '2025/2026');

  // Single-student fields
  const [studentName, setStudentName] = useState('');
  const [studentNis, setStudentNis] = useState('');
  const [scoreInput, setScoreInput] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Bulk paste field
  const [bulkRaw, setBulkRaw] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScoreVal, setEditScoreVal] = useState<string>('');
  const [editNotesVal, setEditNotesVal] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeacher, setFilterTeacher] = useState<string>('ALL');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleSelectExamDoc = (docId: string) => {
    setSelectedDocId(docId);
    const found = documents.find((d) => d.id === docId);
    if (found) {
      setExamTitle(stripRichHtml(found.title) || 'Ujian');
      setSubjectName(
        stripRichHtml(found.subjectFormalName || found.identity?.subjectFormalName || '')
      );
      setClassName(stripRichHtml(found.className || found.identity?.className || ''));
      if (found.identity?.semester) setSemester(stripRichHtml(found.identity.semester));
      if (found.identity?.academicYear) setAcademicYear(stripRichHtml(found.identity.academicYear));
    }
  };

  const bulkPreview = useMemo(() => parseBulkLines(bulkRaw), [bulkRaw]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericScore = Number(scoreInput.replace(',', '.'));
    if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      onToast('Nilai harus berupa angka antara 0 sampai 100.', 'error');
      return;
    }
    if (!subjectName.trim() || !className.trim() || !studentName.trim()) {
      onToast('Mata pelajaran, kelas, dan nama siswa wajib diisi.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const entry: StudentScoreEntry = {
        id: `score_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ownerId: currentUserUid || 'local',
        teacherEmail: currentUserEmail || 'guru@lokal',
        teacherName: currentUserName || 'Ustadz / Guru',
        documentId: selectedDocId || undefined,
        examTitle: examTitle.trim() || `Ujian ${subjectName.trim()}`,
        subjectName: subjectName.trim(),
        className: className.trim(),
        semester: semester.trim() || undefined,
        academicYear: academicYear.trim() || undefined,
        studentName: studentName.trim(),
        studentNis: studentNis.trim() || undefined,
        score: numericScore,
        predicate: computePredicate(numericScore),
        notes: notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await onSaveScore(entry);
      setStudentName('');
      setStudentNis('');
      setScoreInput('');
      setNotes('');
      onToast(`Nilai ${entry.studentName} tersimpan ke sistem Guru & Admin`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan nilai', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (bulkPreview.length === 0) {
      onToast('Belum ada baris nilai valid yang terdeteksi.', 'error');
      return;
    }
    if (!subjectName.trim() || !className.trim()) {
      onToast('Isi Mata Pelajaran dan Kelas terlebih dahulu sebelum menyimpan massal.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const baseTs = Date.now();
      const entries: StudentScoreEntry[] = bulkPreview.map((row, idx) => ({
        id: `score_${baseTs}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: currentUserUid || 'local',
        teacherEmail: currentUserEmail || 'guru@lokal',
        teacherName: currentUserName || 'Ustadz / Guru',
        documentId: selectedDocId || undefined,
        examTitle: examTitle.trim() || `Ujian ${subjectName.trim()}`,
        subjectName: subjectName.trim(),
        className: className.trim(),
        semester: semester.trim() || undefined,
        academicYear: academicYear.trim() || undefined,
        studentName: row.studentName,
        studentNis: row.studentNis || undefined,
        score: row.score,
        predicate: computePredicate(row.score),
        notes: row.notes || undefined,
        createdAt: now,
        updatedAt: now,
      }));
      await onSaveScoresBatch(entries);
      setBulkRaw('');
      onToast(`${entries.length} data nilai berhasil disimpan ke sistem Guru & Admin`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan daftar nilai', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommitInlineEdit = async (entry: StudentScoreEntry) => {
    const val = Number(editScoreVal.replace(',', '.'));
    if (Number.isNaN(val) || val < 0 || val > 100) {
      onToast('Nilai harus di antara 0 dan 100.', 'error');
      return;
    }
    try {
      await onSaveScore({
        ...entry,
        score: val,
        predicate: computePredicate(val),
        notes: editNotesVal.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      setEditingId(null);
      onToast('Nilai berhasil diperbarui');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memperbarui nilai', 'error');
    }
  };

  // Unique Filter Options
  const teacherOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of scores) {
      if (s.teacherEmail) {
        map.set(s.teacherEmail, s.teacherName || s.teacherEmail);
      }
    }
    return Array.from(map.entries());
  }, [scores]);

  const subjectOptions = useMemo(
    () => Array.from(new Set(scores.map((s) => s.subjectName).filter(Boolean))).sort(),
    [scores]
  );

  const classOptions = useMemo(
    () => Array.from(new Set(scores.map((s) => s.className).filter(Boolean))).sort(),
    [scores]
  );

  const filteredScores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scores.filter((s) => {
      if (filterTeacher !== 'ALL' && s.teacherEmail !== filterTeacher) return false;
      if (filterSubject !== 'ALL' && s.subjectName !== filterSubject) return false;
      if (filterClass !== 'ALL' && s.className !== filterClass) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        (s.studentNis || '').toLowerCase().includes(q) ||
        s.subjectName.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.teacherName.toLowerCase().includes(q)
      );
    });
  }, [scores, filterTeacher, filterSubject, filterClass, searchQuery]);

  const stats = useMemo(() => {
    if (filteredScores.length === 0) {
      return { count: 0, avg: 0, max: 0, passRate: 0 };
    }
    const total = filteredScores.reduce((acc, s) => acc + Number(s.score || 0), 0);
    const max = Math.max(...filteredScores.map((s) => Number(s.score || 0)));
    const passed = filteredScores.filter((s) => Number(s.score || 0) >= 75).length;
    return {
      count: filteredScores.length,
      avg: Number((total / filteredScores.length).toFixed(1)),
      max,
      passRate: Math.round((passed / filteredScores.length) * 100),
    };
  }, [filteredScores]);

  const handleExportExcel = async () => {
    if (filteredScores.length === 0) {
      onToast('Tidak ada data nilai untuk dikonversi ke Excel.', 'error');
      return;
    }
    setIsExportingExcel(true);
    try {
      const parts: string[] = [];
      if (filterTeacher !== 'ALL') parts.push(`Guru: ${filterTeacher}`);
      if (filterSubject !== 'ALL') parts.push(`Mapel: ${filterSubject}`);
      if (filterClass !== 'ALL') parts.push(`Kelas: ${filterClass}`);

      await exportGradesToExcel(
        {
          scores: filteredScores,
          schoolName,
          exportedBy: `${currentUserName} (${role === 'admin' ? 'Admin' : 'Ustadz/Guru'})`,
          filterSummary: parts.length > 0 ? parts.join(' | ') : 'Semua Data Tersaring',
        },
        role === 'admin' ? 'Rekap_Semua_Nilai_Admin' : 'Rekap_Nilai_Guru'
      );
      onToast(`File Excel (.xlsx) berisi ${filteredScores.length} nilai berhasil diunduh`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal membuat file Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner + Export Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {role === 'admin'
              ? 'Rekapitulasi Seluruh Nilai Ujian (Semua Ustadz / Guru)'
              : 'Input & Rekapitulasi Nilai Ujian Siswa'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {role === 'admin'
              ? 'Semua nilai yang dimasukkan oleh Ustadz/Guru langsung tampil otomatis di sistem Admin dan siap dikonversi ke file Excel (.xlsx).'
              : 'Setiap nilai yang Anda masukkan otomatis tersimpan di rekap pribadi Anda sekaligus terkirim ke sistem Admin.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          disabled={isExportingExcel || filteredScores.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {isExportingExcel ? 'Membuat File Excel...' : 'Convert & Unduh Excel (.xlsx)'}
        </button>
      </div>

      {drivePanel}

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Data Nilai</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">{stats.count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Rata-Rata Nilai</span>
            <TrendingUp className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">{stats.avg}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Nilai Tertinggi</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">{stats.max}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ketuntasan (&ge; 75)</span>
            <ListChecks className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {stats.passRate}%
          </div>
        </div>
      </div>

      {/* Input Nilai Card (For Ustadz/Guru & Admin) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-slate-900">Input Nilai Siswa</div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setInputMode('single')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                inputMode === 'single'
                  ? 'bg-[#0F1E3D] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Input Satu Siswa
            </button>
            <button
              type="button"
              onClick={() => setInputMode('bulk')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                inputMode === 'bulk'
                  ? 'bg-[#0F1E3D] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tempel Daftar Massal
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Common Exam Context Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ambil dari Naskah Soal (Opsional)
              </label>
              <select
                value={selectedDocId}
                onChange={(e) => handleSelectExamDoc(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">-- Isi Manual --</option>
                {documents.map((docItem) => (
                  <option key={docItem.id} value={docItem.id}>
                    {stripRichHtml(docItem.subjectFormalName || docItem.title)} (
                    {stripRichHtml(docItem.className || '-')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Mata Pelajaran *
              </label>
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Contoh: Bahasa Arab / Fiqih"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Kelas *
              </label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Contoh: Kelas 3 KMI"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Nama Ujian
              </label>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="Ujian Semester"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Semester
                </label>
                <input
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="Ganjil"
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Thn Ajaran
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="2025/2026"
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>

          {inputMode === 'single' ? (
            <form
              onSubmit={handleSingleSubmit}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-end"
            >
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nama Siswa / Santri *
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Nama lengkap siswa"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  NIS / No. Peserta
                </label>
                <input
                  type="text"
                  value={studentNis}
                  onChange={(e) => setStudentNis(e.target.value)}
                  placeholder="Opsional"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nilai (0–100) *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  step="0.1"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  placeholder="85"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Catatan
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opsional"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isSaving ? 'Menyimpan...' : 'Simpan Nilai'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tempel Daftar Nilai (1 siswa per baris: Nama, NIS, Nilai atau Nama, Nilai)
                </label>
                <textarea
                  rows={5}
                  value={bulkRaw}
                  onChange={(e) => setBulkRaw(e.target.value)}
                  placeholder={`Ahmad Fauzan, 202401, 92\nSiti Rahmawati, 202402, 88\nMuhammad Rizki, 85`}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  <span>
                    Terdeteksi <strong className="text-slate-900">{bulkPreview.length}</strong> baris
                    nilai valid
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBulkSave}
                  disabled={isSaving || bulkPreview.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isSaving ? 'Menyimpan...' : `Simpan ${bulkPreview.length} Nilai Sekaligus`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Live Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama siswa, NIS, mapel, kelas..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {role === 'admin' && (
            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Semua Ustadz / Guru</option>
              {teacherOptions.map(([mail, name]) => (
                <option key={mail} value={mail}>
                  {name} ({mail})
                </option>
              ))}
            </select>
          )}

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Semua Mata Pelajaran</option>
            {subjectOptions.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Semua Kelas</option>
            {classOptions.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4 w-10">No</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">NIS</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Ujian</th>
                <th className="py-3 px-4 text-center">Nilai</th>
                <th className="py-3 px-4">Predikat</th>
                {role === 'admin' && <th className="py-3 px-4">Ustadz / Guru</th>}
                <th className="py-3 px-4">Catatan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredScores.length === 0 ? (
                <tr>
                  <td
                    colSpan={role === 'admin' ? 11 : 10}
                    className="py-10 px-4 text-center text-slate-500"
                  >
                    Belum ada data nilai yang sesuai. Gunakan form di atas untuk memasukkan nilai.
                  </td>
                </tr>
              ) : (
                filteredScores.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  const canEdit = role === 'admin' || item.ownerId === currentUserUid;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {item.studentName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 tabular-nums">
                        {item.studentNis || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{item.className}</td>
                      <td className="py-2.5 px-4 text-slate-800 font-medium">{item.subjectName}</td>
                      <td className="py-2.5 px-4 text-slate-600">{item.examTitle}</td>
                      <td className="py-2.5 px-4 text-center tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={editScoreVal}
                            onChange={(e) => setEditScoreVal(e.target.value)}
                            className="w-16 px-2 py-1 text-xs text-center border border-sky-400 rounded"
                          />
                        ) : (
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-bold ${
                              item.score >= 75
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {item.score}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {item.predicate || computePredicate(item.score)}
                      </td>
                      {role === 'admin' && (
                        <td className="py-2.5 px-4 text-slate-700">
                          <div className="font-medium">{item.teacherName}</div>
                          <div className="text-[11px] text-slate-400">{item.teacherEmail}</div>
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-slate-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNotesVal}
                            onChange={(e) => setEditNotesVal(e.target.value)}
                            className="w-28 px-2 py-1 text-xs border border-sky-400 rounded"
                          />
                        ) : (
                          item.notes || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {canEdit && (
                          <div className="inline-flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCommitInlineEdit(item)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Simpan"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                                  title="Batal"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(item.id);
                                    setEditScoreVal(String(item.score));
                                    setEditNotesVal(item.notes || '');
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded"
                                  title="Edit Nilai"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteScore(item.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                                  title="Hapus Nilai"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
