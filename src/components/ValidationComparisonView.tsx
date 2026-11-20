import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import type { AccuracyReport } from '../types/exam';

interface ValidationComparisonViewProps {
  report: AccuracyReport;
}

export const ValidationComparisonView: React.FC<ValidationComparisonViewProps> = ({ report }) => {
  return (
    <div className="space-y-5">
      {/* Verification Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {report.overallVerified ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {report.overallVerified
                ? 'Validasi Struktur & Kesamaan Teks Lolos Pemeriksaan'
                : 'Memerlukan Pemeriksaan Manual Sebelum Ekspor'}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {report.overallVerified
                ? 'Seluruh redaksi pertanyaan dan opsi cocok dengan input mentah. Tetap tinjau preview halaman cetak sebelum dibagikan.'
                : `Terdapat ${report.manualReviewCount} soal bertanda PERLU PEMERIKSAAN MANUAL atau peringatan struktur yang harus ditinjau.`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Preservasi Isi Asli</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#0F1E3D]">
            {report.preservationScore}%
          </div>
        </div>
      </div>

      {/* Checklist Pemeriksaan */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Audit Akurasi Pra-Ekspor (9 Parameter)
          </h4>
        </div>
        <div className="divide-y divide-slate-100">
          {report.checks.map((chk) => (
            <div key={chk.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
              {chk.severity === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : chk.severity === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 text-xs">{chk.label}</div>
                <div className="text-xs text-slate-600 mt-0.5">{chk.detail}</div>
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                  chk.severity === 'ok'
                    ? 'text-emerald-700'
                    : chk.severity === 'warning'
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {chk.severity === 'ok' ? 'Sesuai' : chk.severity === 'warning' ? 'Periksa' : 'Perlu Aksi'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Split Comparison Panel */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-700">
          <div className="px-4 py-2.5 border-r border-slate-200">Panel Kiri: Soal Mentah</div>
          <div className="px-4 py-2.5">Panel Kanan: Soal Hasil Formatting</div>
        </div>
        {report.diffRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada teks soal untuk dibandingkan.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto divide-y divide-slate-100 font-mono text-xs">
            {report.diffRows.map((row) => (
              <div key={row.lineNumber} className="grid grid-cols-2">
                <div className="px-3 py-2 border-r border-slate-200 text-slate-700 whitespace-pre-wrap break-words flex gap-2">
                  <span className="text-slate-400 select-none w-6 shrink-0 tabular-nums">
                    {row.lineNumber}
                  </span>
                  <span>{row.rawLine || '—'}</span>
                </div>
                <div
                  className={`px-3 py-2 whitespace-pre-wrap break-words flex gap-2 ${
                    row.status === 'flagged'
                      ? 'bg-amber-50 text-amber-950'
                      : row.status === 'missing'
                      ? 'bg-rose-50 text-rose-900'
                      : 'bg-white text-slate-900'
                  }`}
                >
                  <span className="text-slate-400 select-none w-6 shrink-0 tabular-nums">
                    {row.lineNumber}
                  </span>
                  <span className="flex-1">{row.formattedLine || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
