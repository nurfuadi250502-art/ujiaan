import React, { useMemo, useState } from 'react';
import { Search, Copy, Trash2, Download, Edit3, FileText } from 'lucide-react';
import type { DocumentStatus, ExamDocument } from '../types/exam';

interface HistoryViewProps {
  documents: ExamDocument[];
  onOpenDocument: (doc: ExamDocument) => void;
  onDuplicateDocument: (doc: ExamDocument) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onDownloadDocx: (doc: ExamDocument) => Promise<void>;
  onDownloadPdf: (doc: ExamDocument) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  documents,
  onOpenDocument,
  onDuplicateDocument,
  onDeleteDocument,
  onDownloadDocx,
  onDownloadPdf,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.subjectCode.toLowerCase().includes(q) ||
        doc.subjectFormalName.toLowerCase().includes(q) ||
        doc.className.toLowerCase().includes(q) ||
        doc.templateName.toLowerCase().includes(q)
      );
    });
  }, [documents, searchQuery, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Riwayat Dokumen Ujian</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Seluruh draft dan dokumen yang pernah dibuat tersimpan otomatis di perangkat dan Cloud Firestore (saat masuk akun).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, mapel, kelas..."
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', 'Semua'],
                ['draft', 'Draft'],
                ['ready', 'Siap Cetak'],
                ['exported', 'Diekspor'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === val
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredDocs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">
              {documents.length === 0
                ? 'Belum ada dokumen dalam riwayat'
                : 'Tidak ada dokumen yang cocok dengan pencarian'}
            </p>
            <p className="text-xs text-slate-500">
              Simpan draft atau ekspor naskah ujian dari halaman Input Soal untuk melihatnya di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama Dokumen</th>
                  <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                  <th className="px-4 py-3 font-semibold">Kelas</th>
                  <th className="px-4 py-3 font-semibold">Tanggal Dibuat</th>
                  <th className="px-4 py-3 font-semibold text-right">Soal</th>
                  <th className="px-4 py-3 font-semibold">Template</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{doc.title}</td>
                    <td className="px-4 py-3 text-slate-700">{doc.subjectCode}</td>
                    <td className="px-4 py-3 text-slate-700">{doc.className}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                      {new Date(doc.updatedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {doc.questionCount}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">
                      {doc.templateName}
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
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenDocument(doc)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded font-medium"
                          title="Buka & Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateDocument(doc)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                          title="Duplikasi Dokumen"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadDocx(doc)}
                          className="px-2 py-1 text-slate-700 hover:bg-slate-100 rounded font-medium inline-flex items-center gap-1"
                          title="Unduh Ulang DOCX"
                        >
                          <Download className="w-3.5 h-3.5" />
                          DOCX
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadPdf(doc)}
                          className="px-2 py-1 text-slate-700 hover:bg-slate-100 rounded font-medium inline-flex items-center gap-1"
                          title="Unduh Ulang PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteDocument(doc.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                          title="Hapus Dokumen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  );
};
