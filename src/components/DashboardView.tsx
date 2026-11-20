import React from 'react';
import {
  FileText,
  FilePlus2,
  FolderKanban,
  BookOpen,
  ArrowRight,
  Download,
  Clock,
} from 'lucide-react';
import type { ExamDocument, SubjectConfig, TemplateDocument } from '../types/exam';

interface DashboardViewProps {
  documents: ExamDocument[];
  templates: TemplateDocument[];
  subjects: SubjectConfig[];
  onNavigate: (tab: 'editor' | 'templates' | 'subjects' | 'history' | 'settings') => void;
  onCreateNewDocument: () => void;
  onOpenDocument: (doc: ExamDocument) => void;
  onDownloadDocx: (doc: ExamDocument) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  templates,
  subjects,
  onNavigate,
  onCreateNewDocument,
  onOpenDocument,
  onDownloadDocx,
}) => {
  const totalQuestions = documents.reduce((acc, d) => acc + (d.questionCount || 0), 0);
  const exportedCount = documents.filter((d) => d.status === 'exported').length;
  const recentDocs = documents.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0F1E3D] text-white rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-sky-300 tracking-wide uppercase">
            Otomatisasi Naskah Ujian Sekolah
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Konversi Soal Mentah ke Dokumen Siap Cetak
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Tempelkan soal dari Word atau PDF, identifikasi struktur dan jenis soal secara otomatis tanpa mengubah redaksi asli, lalu ekspor ke template sekolah dalam format DOCX atau PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onCreateNewDocument}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-4 h-4" />
            Input Soal Baru
          </button>
          <button
            type="button"
            onClick={() => onNavigate('templates')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FolderKanban className="w-4 h-4" />
            Kelola Template
          </button>
        </div>
      </div>

      {/* Real Computed Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Dokumen Ujian</span>
            <FileText className="w-4 h-4 text-[#0F1E3D]" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {documents.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="tabular-nums">{exportedCount}</span> dokumen telah diekspor
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Soal Diproses</span>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {totalQuestions}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Terstruktur & tervalidasi
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Template Dokumen Aktif</span>
            <FolderKanban className="w-4 h-4 text-[#0F1E3D]" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {templates.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="tabular-nums">
              {templates.filter((t) => t.sourceType !== 'builtin').length}
            </span>{' '}
            template sekolah diunggah
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Mata Pelajaran</span>
            <BookOpen className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {subjects.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Siap pergantian identitas otomatis
          </div>
        </div>
      </div>

      {/* Main Split: Recent Documents + Quick Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Riwayat Dokumen Terbaru</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buka kembali atau unduh ulang naskah ujian yang tersimpan
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Lihat Semua
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentDocs.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">Belum ada dokumen tersimpan</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Mulai dengan memasukkan soal mentah pada halaman Input Soal Otomatis, lalu simpan sebagai draft atau ekspor ke DOCX/PDF.
              </p>
              <button
                type="button"
                onClick={onCreateNewDocument}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F1E3D] text-white text-xs font-medium rounded-lg hover:bg-[#172B4D] transition-colors"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Buat Dokumen Pertama
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama Dokumen</th>
                    <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                    <th className="px-4 py-3 font-semibold text-right">Soal</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => onOpenDocument(doc)}
                          className="text-left hover:text-sky-700 transition-colors"
                        >
                          {doc.title}
                        </button>
                        <div className="text-[11px] text-slate-500 font-normal">
                          {doc.className} · {doc.templateName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{doc.subjectCode}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                        {doc.questionCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-medium ${
                            doc.status === 'exported'
                              ? 'text-emerald-700'
                              : doc.status === 'ready'
                              ? 'text-sky-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {doc.status === 'exported'
                            ? 'Diekspor'
                            : doc.status === 'ready'
                            ? 'Siap Cetak'
                            : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenDocument(doc)}
                            className="text-sky-700 hover:text-sky-900 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDownloadDocx(doc)}
                            className="p-1 text-slate-500 hover:text-slate-900"
                            title="Unduh DOCX"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alur Kerja Cepat */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Alur Otomatisasi Sistem</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              6 langkah dari teks mentah hingga dokumen cetak
            </p>
          </div>
          <ol className="space-y-3 text-xs">
            {[
              {
                step: '01',
                title: 'Input Soal Mentah',
                desc: 'Ketik, tempel dari Word/PDF, atau unggah file .docx/.txt.',
              },
              {
                step: '02',
                title: 'AI Smart Parser & Fallback',
                desc: 'Mengenali nomor, opsi A-E, jenis soal, stimulus, tabel, dan anomali.',
              },
              {
                step: '03',
                title: 'Identitas & Mata Pelajaran',
                desc: 'Ganti mapel otomatis memperbarui kop, judul, dan template terkait.',
              },
              {
                step: '04',
                title: 'Pemetaan Template Sekolah',
                desc: 'Unggah DOCX sekolah Anda dan pertahankan gaya asli tanpa ubah desain.',
              },
              {
                step: '05',
                title: 'Validasi & Perbandingan',
                desc: 'Audit panel kiri-kanan memastikan substansi soal terjaga verbatim.',
              },
              {
                step: '06',
                title: 'Ekspor DOCX, PDF & Print',
                desc: 'Hasil siap dibuka di Microsoft Word, WPS Office, atau dicetak langsung.',
              },
            ].map((item) => (
              <li key={item.step} className="flex items-start gap-3 pb-2.5 border-b border-slate-100 last:border-b-0 last:pb-0">
                <span className="font-mono text-[11px] font-semibold text-sky-700 tabular-nums mt-0.5">
                  {item.step}.
                </span>
                <div>
                  <div className="font-semibold text-slate-900">{item.title}</div>
                  <div className="text-slate-600 mt-0.5">{item.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};
