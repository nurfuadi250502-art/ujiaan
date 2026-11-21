import React, { useMemo, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Users,
  Search,
  ExternalLink,
  Download,
  Printer,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';
import type {
  SharedExamDocument,
  StudentScoreEntry,
  UserProfile,
} from '../types/exam';
import { exportGradesToExcel } from '../utils/excelExporter';
import { stripRichHtml } from '../utils/richText';

interface AdminMonitorViewProps {
  schoolName: string;
  adminName: string;
  sharedDocuments: SharedExamDocument[];
  studentScores: StudentScoreEntry[];
  userProfiles: UserProfile[];
  onOpenSharedDocument: (docItem: SharedExamDocument) => void;
  onDownloadSharedDocx: (docItem: SharedExamDocument) => Promise<void>;
  onDownloadSharedPdf: (docItem: SharedExamDocument) => Promise<void>;
  onGoToGradesTab: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  drivePanel?: React.ReactNode;
}

export const AdminMonitorView: React.FC<AdminMonitorViewProps> = ({
  schoolName,
  adminName,
  sharedDocuments,
  studentScores,
  userProfiles,
  onOpenSharedDocument,
  onDownloadSharedDocx,
  onDownloadSharedPdf,
  onGoToGradesTab,
  onToast,
  drivePanel,
}) => {
  const [subTab, setSubTab] = useState<'documents' | 'scores-summary' | 'teachers'>('documents');
  const [searchDoc, setSearchDoc] = useState('');
  const [filterTeacherEmail, setFilterTeacherEmail] = useState('ALL');
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const uniqueTeachersInDocs = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of sharedDocuments) {
      if (d.teacherEmail) map.set(d.teacherEmail, d.teacherName || d.teacherEmail);
    }
    return Array.from(map.entries());
  }, [sharedDocuments]);

  const filteredDocs = useMemo(() => {
    const q = searchDoc.trim().toLowerCase();
    return sharedDocuments.filter((d) => {
      if (filterTeacherEmail !== 'ALL' && d.teacherEmail !== filterTeacherEmail) return false;
      if (!q) return true;
      return (
        stripRichHtml(d.title).toLowerCase().includes(q) ||
        stripRichHtml(d.subjectFormalName).toLowerCase().includes(q) ||
        stripRichHtml(d.className).toLowerCase().includes(q) ||
        d.teacherName.toLowerCase().includes(q) ||
        d.teacherEmail.toLowerCase().includes(q)
      );
    });
  }, [sharedDocuments, filterTeacherEmail, searchDoc]);

  const groupedScoreSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        subjectName: string;
        className: string;
        teacherName: string;
        teacherEmail: string;
        count: number;
        total: number;
        max: number;
        min: number;
        passed: number;
      }
    >();
    for (const s of studentScores) {
      const key = `${s.subjectName}__${s.className}__${s.teacherEmail}`;
      const cur = map.get(key);
      const val = Number(s.score || 0);
      if (cur) {
        cur.count += 1;
        cur.total += val;
        cur.max = Math.max(cur.max, val);
        cur.min = Math.min(cur.min, val);
        if (val >= 75) cur.passed += 1;
      } else {
        map.set(key, {
          subjectName: s.subjectName,
          className: s.className,
          teacherName: s.teacherName,
          teacherEmail: s.teacherEmail,
          count: 1,
          total: val,
          max: val,
          min: val,
          passed: val >= 75 ? 1 : 0,
        });
      }
    }
    return Array.from(map.values());
  }, [studentScores]);

  const handleExportAllExcel = async () => {
    if (studentScores.length === 0) {
      onToast('Belum ada nilai yang dimasukkan oleh Ustadz/Guru.', 'error');
      return;
    }
    setIsExportingExcel(true);
    try {
      await exportGradesToExcel(
        {
          scores: studentScores,
          schoolName,
          exportedBy: `${adminName} (Admin)`,
          filterSummary: 'Seluruh Nilai Semua Guru & Mapel',
        },
        'Rekap_Seluruh_Nilai_Admin'
      );
      onToast(`Berhasil mengonversi ${studentScores.length} nilai ke file Excel (.xlsx)`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal ekspor Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700">
            <ShieldCheck className="w-4 h-4" />
            Pusat Kontrol Admin Sistem
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            Monitoring Naskah Soal &amp; Rekap Nilai Seluruh Ustadz / Guru
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Semua soal dan nilai yang diinput oleh Ustadz/Guru otomatis masuk ke sini secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToGradesTab}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors"
          >
            Lihat Detail Semua Nilai
          </button>
          <button
            type="button"
            onClick={handleExportAllExcel}
            disabled={isExportingExcel || studentScores.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExportingExcel ? 'Memproses Excel...' : 'Convert Semua Nilai ke Excel (.xlsx)'}
          </button>
        </div>
      </div>

      {drivePanel}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Naskah Soal Guru</span>
            <FileText className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {sharedDocuments.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Nilai Terekap</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {studentScores.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Akun Ustadz / Guru &amp; Admin</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {userProfiles.length}
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubTab('documents')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              subTab === 'documents'
                ? 'border-[#0F1E3D] text-[#0F1E3D]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Naskah Soal Masuk ({sharedDocuments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('scores-summary')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              subTab === 'scores-summary'
                ? 'border-[#0F1E3D] text-[#0F1E3D]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Rekap Nilai Per Mapel &amp; Guru ({groupedScoreSummary.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('teachers')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              subTab === 'teachers'
                ? 'border-[#0F1E3D] text-[#0F1E3D]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Daftar Akun Terdaftar ({userProfiles.length})
          </button>
        </div>

        {subTab === 'documents' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDoc}
                  onChange={(e) => setSearchDoc(e.target.value)}
                  placeholder="Cari judul ujian, mata pelajaran, kelas, atau nama guru..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <select
                value={filterTeacherEmail}
                onChange={(e) => setFilterTeacherEmail(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="ALL">Semua Ustadz / Guru</option>
                {uniqueTeachersInDocs.map(([mail, name]) => (
                  <option key={mail} value={mail}>
                    {name} ({mail})
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Judul Naskah</th>
                    <th className="py-3 px-4">Mata Pelajaran</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-center">Soal</th>
                    <th className="py-3 px-4">Ustadz / Guru</th>
                    <th className="py-3 px-4">Diperbarui</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 px-4 text-center text-slate-500">
                        Belum ada naskah soal masuk dari Ustadz/Guru.
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((docItem) => (
                      <tr key={docItem.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {stripRichHtml(docItem.title)}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {stripRichHtml(docItem.subjectFormalName)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {stripRichHtml(docItem.className)}
                        </td>
                        <td className="py-3 px-4 text-center tabular-nums font-medium">
                          {docItem.questionCount}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{docItem.teacherName}</div>
                          <div className="text-[11px] text-slate-400">{docItem.teacherEmail}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(docItem.updatedAt).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenSharedDocument(docItem)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-md"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Buka
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadSharedDocx(docItem)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-md"
                            >
                              <Download className="w-3 h-3" />
                              Word
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadSharedPdf(docItem)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md"
                            >
                              <Printer className="w-3 h-3" />
                              PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subTab === 'scores-summary' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Mata Pelajaran</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Ustadz / Guru</th>
                  <th className="py-3 px-4 text-center">Jumlah Siswa</th>
                  <th className="py-3 px-4 text-center">Rata-Rata</th>
                  <th className="py-3 px-4 text-center">Tertinggi</th>
                  <th className="py-3 px-4 text-center">Terendah</th>
                  <th className="py-3 px-4 text-center">Tuntas (&ge;75)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedScoreSummary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 px-4 text-center text-slate-500">
                      Belum ada data nilai yang dimasukkan oleh guru.
                    </td>
                  </tr>
                ) : (
                  groupedScoreSummary.map((grp) => (
                    <tr
                      key={`${grp.subjectName}_${grp.className}_${grp.teacherEmail}`}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">{grp.subjectName}</td>
                      <td className="py-3 px-4 text-slate-700">{grp.className}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{grp.teacherName}</div>
                        <div className="text-[11px] text-slate-400">{grp.teacherEmail}</div>
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums">{grp.count}</td>
                      <td className="py-3 px-4 text-center tabular-nums font-bold text-[#0F1E3D]">
                        {(grp.total / grp.count).toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-emerald-700 font-semibold">
                        {grp.max}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-amber-700 font-semibold">
                        {grp.min}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums">
                        {grp.passed} / {grp.count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'teachers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Peran</th>
                  <th className="py-3 px-4">Bidang Mapel</th>
                  <th className="py-3 px-4">Aktivitas Terakhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-slate-500">
                      Belum ada akun Ustadz/Guru yang tercatat.
                    </td>
                  </tr>
                ) : (
                  userProfiles.map((prof) => (
                    <tr key={prof.ownerId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900">{prof.displayName}</td>
                      <td className="py-3 px-4 text-slate-600">{prof.email}</td>
                      <td className="py-3 px-4">
                        {prof.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0F1E3D] text-white text-[11px] font-semibold">
                            <ShieldCheck className="w-3 h-3 text-sky-300" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-semibold">
                            <GraduationCap className="w-3 h-3" />
                            Ustadz / Guru
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {prof.subjectSpecialty || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(prof.updatedAt).toLocaleString('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
