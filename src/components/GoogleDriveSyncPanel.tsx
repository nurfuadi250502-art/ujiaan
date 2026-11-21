import React from 'react';
import {
  FolderOpen,
  FileSpreadsheet,
  FileText,
  FileCode2,
  RefreshCw,
  Trash2,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import type {
  DriveFileItem,
  DriveFolderInfo,
  DriveSyncPlan,
} from '../services/googleDriveService';
import { DRIVE_APP_FOLDER_NAME } from '../services/googleDriveService';

export interface PendingDriveConfirmation {
  kind: 'overwrite' | 'delete';
  plan?: DriveSyncPlan;
  deleteTarget?: DriveFileItem;
}

interface DriveActionConfirmModalProps {
  pending: PendingDriveConfirmation | null;
  isBusy: boolean;
  onConfirmOverwrite: () => Promise<void>;
  onConfirmSaveAsNew: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
  onCancel: () => void;
}

export const DriveActionConfirmModal: React.FC<DriveActionConfirmModalProps> = ({
  pending,
  isBusy,
  onConfirmOverwrite,
  onConfirmSaveAsNew,
  onConfirmDelete,
  onCancel,
}) => {
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900">
              {pending.kind === 'delete'
                ? 'Konfirmasi Hapus File dari Google Drive'
                : 'Konfirmasi Pembaruan File di Google Drive'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-600 leading-relaxed">
          {pending.kind === 'delete' && pending.deleteTarget && (
            <>
              <p>
                Apakah Anda yakin ingin menghapus file berikut dari folder{' '}
                <strong className="text-slate-900">{DRIVE_APP_FOLDER_NAME}</strong> di Google Drive
                Anda?
              </p>
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 font-mono text-rose-900 break-all">
                {pending.deleteTarget.name}
              </div>
              <p className="text-[11px] text-slate-500">
                Tindakan ini akan memindahkan file di Google Drive Anda secara permanen sesuai izin
                hapus.
              </p>
            </>
          )}

          {pending.kind === 'overwrite' && pending.plan && (
            <>
              <p>
                Sebanyak{' '}
                <strong className="text-slate-900">{pending.plan.conflicts.length}</strong> file
                berikut sudah ada di folder{' '}
                <strong className="text-slate-900">{pending.plan.folder.name}</strong> pada Google
                Drive Anda:
              </p>
              <ul className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {pending.plan.conflicts.map((c) => (
                  <li
                    key={c.existingFile.id}
                    className="font-mono text-[11px] text-slate-800 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{c.payload.fileName}</span>
                    <span className="text-[10px] text-amber-700 font-sans shrink-0">
                      Sudah ada
                    </span>
                  </li>
                ))}
              </ul>
              {pending.plan.newItems.length > 0 && (
                <p className="text-[11px] text-emerald-700 font-medium">
                  Selain itu, {pending.plan.newItems.length} file baru lainnya akan langsung dibuat
                  sebagai file terpisah di folder yang sama.
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Pilih <strong>Perbarui File yang Ada</strong> untuk menimpa isi file dengan data
                terbaru, atau <strong>Simpan Sebagai File Baru</strong> agar file lama tetap utuh.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            Batal
          </button>

          {pending.kind === 'delete' ? (
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
            >
              {isBusy ? 'Menghapus...' : 'Ya, Hapus File dari Drive'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onConfirmSaveAsNew}
                disabled={isBusy}
                className="px-3.5 py-2 text-xs font-semibold text-[#0F1E3D] bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg disabled:opacity-50"
              >
                {isBusy ? 'Memproses...' : 'Simpan Sebagai File Baru'}
              </button>
              <button
                type="button"
                onClick={onConfirmOverwrite}
                disabled={isBusy}
                className="px-4 py-2 text-xs font-bold text-white bg-[#0F1E3D] hover:bg-[#172B4D] rounded-lg disabled:opacity-50"
              >
                {isBusy ? 'Memperbarui...' : 'Perbarui File yang Ada'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface GoogleDriveSyncPanelProps {
  driveConnected: boolean;
  driveFolder: DriveFolderInfo | null;
  driveFiles: DriveFileItem[];
  isSyncing: boolean;
  hasScores: boolean;
  hasDocuments: boolean;
  onConnectDrive: () => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  onSyncScoresToDrive: () => Promise<void>;
  onSyncAllDataToDrive: () => Promise<void>;
  onRequestDeleteFile: (file: DriveFileItem) => void;
}

export const GoogleDriveSyncPanel: React.FC<GoogleDriveSyncPanelProps> = ({
  driveConnected,
  driveFolder,
  driveFiles,
  isSyncing,
  hasScores,
  hasDocuments,
  onConnectDrive,
  onRefreshFiles,
  onSyncScoresToDrive,
  onSyncAllDataToDrive,
  onRequestDeleteFile,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/70">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#0F1E3D]" />
            <h3 className="text-sm font-bold text-slate-900">
              Penyimpanan Google Drive (1 Folder, File Terpisah per Data)
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Seluruh data disimpan di dalam 1 folder{' '}
            <span className="font-semibold text-slate-700">{DRIVE_APP_FOLDER_NAME}</span>. Setiap
            mata pelajaran/kelas nilai maupun naskah soal yang berbeda otomatis menjadi file
            tersendiri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!driveConnected ? (
            <button
              type="button"
              onClick={onConnectDrive}
              disabled={isSyncing}
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg shadow-xs text-xs font-semibold transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>Sign in with Google untuk Hubungkan Drive</span>
            </button>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Google Drive Terhubung
              </span>
              {driveFolder?.webViewLink && (
                <a
                  href={driveFolder.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka Folder Drive
                </a>
              )}
              <button
                type="button"
                onClick={onSyncScoresToDrive}
                disabled={isSyncing || !hasScores}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {isSyncing ? 'Menyimpan...' : 'Simpan Data Nilai (.xlsx) ke Drive'}
              </button>
              <button
                type="button"
                onClick={onSyncAllDataToDrive}
                disabled={isSyncing || (!hasScores && !hasDocuments)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#0F1E3D] hover:bg-[#172B4D] text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Simpan Semua Data ke Drive
              </button>
              <button
                type="button"
                onClick={onRefreshFiles}
                disabled={isSyncing}
                className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg"
                title="Muat Ulang Daftar File Drive"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {driveConnected && (
        <div className="p-4">
          {driveFiles.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Folder <strong>{driveFolder?.name || DRIVE_APP_FOLDER_NAME}</strong> siap digunakan.
              Klik tombol simpan di atas untuk mengunggah file nilai (`.xlsx`) atau naskah soal
              (`.docx`) Anda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2 px-3">Nama File di Google Drive</th>
                    <th className="py-2 px-3">Tipe Data</th>
                    <th className="py-2 px-3">Ukuran</th>
                    <th className="py-2 px-3">Terakhir Diubah</th>
                    <th className="py-2 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {driveFiles.map((f) => {
                    const isExcel = f.name.endsWith('.xlsx');
                    const isDocx = f.name.endsWith('.docx');
                    const sizeKb = f.size ? `${Math.max(1, Math.round(Number(f.size) / 1024))} KB` : '-';
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-medium text-slate-900 flex items-center gap-2">
                          {isExcel ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : isDocx ? (
                            <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                          ) : (
                            <FileCode2 className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate max-w-[320px]">{f.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {isExcel ? 'Excel Rekap Nilai' : isDocx ? 'Word Naskah Soal' : 'Backup JSON'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 tabular-nums">{sizeKb}</td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {f.modifiedTime
                            ? new Date(f.modifiedTime).toLocaleString('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {f.webViewLink && (
                              <a
                                href={f.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Buka
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => onRequestDeleteFile(f)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                              title="Hapus file dari Google Drive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
