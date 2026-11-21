import { getInMemoryDriveToken, setInMemoryDriveToken } from '../lib/firebase';
import type {
  ExamDocument,
  StudentScoreEntry,
  SubjectConfig,
  TemplateDocument,
  UserSettings,
} from '../types/exam';
import { exportDocumentToDocx } from '../utils/docxEngine';
import { buildGradesExcelBlob } from '../utils/excelExporter';
import { stripRichHtml } from '../utils/richText';

export const DRIVE_APP_FOLDER_NAME = 'Smart Question & Grade Portal - Data';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DriveUploadPayload {
  fileName: string;
  mimeType: string;
  blob: Blob;
  description?: string;
}

export interface DriveSyncPlan {
  folder: DriveFolderInfo;
  newItems: DriveUploadPayload[];
  conflicts: {
    payload: DriveUploadPayload;
    existingFile: DriveFileItem;
  }[];
}

function sanitizeFilePart(raw: string, fallback: string): string {
  const clean = stripRichHtml(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return clean || fallback;
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) {
    setInMemoryDriveToken(null);
    throw new Error(
      'Izin sesi Google Drive telah berakhir. Silakan klik "Hubungkan Google Drive" lagi.'
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Drive Error (${res.status}): ${errText || res.statusText}`);
  }

  return res;
}

export function requireDriveToken(): string {
  const token = getInMemoryDriveToken();
  if (!token) {
    throw new Error('Google Drive belum terhubung pada sesi ini.');
  }
  return token;
}

export async function ensureAppDriveFolder(accessToken: string): Promise<DriveFolderInfo> {
  const q = `name = '${escapeDriveQueryValue(
    DRIVE_APP_FOLDER_NAME
  )}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const searchUrl = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    q
  )}&fields=files(id,name,webViewLink)&spaces=drive`;

  const searchRes = await driveFetch(searchUrl, accessToken);
  const searchJson = (await searchRes.json()) as { files?: DriveFolderInfo[] };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0];
  }

  const createRes = await driveFetch(
    `${DRIVE_FILES_API}?fields=id,name,webViewLink`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description:
          'Folder khusus penyimpan seluruh file naskah soal dan rekap nilai Excel dari Smart Question & Grade Portal.',
      }),
    }
  );

  return (await createRes.json()) as DriveFolderInfo;
}

export async function listAppDriveFiles(accessToken: string): Promise<{
  folder: DriveFolderInfo;
  files: DriveFileItem[];
}> {
  const folder = await ensureAppDriveFolder(accessToken);
  const q = `'${escapeDriveQueryValue(folder.id)}' in parents and trashed = false`;
  const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
    q
  )}&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`;

  const res = await driveFetch(url, accessToken);
  const json = (await res.json()) as { files?: DriveFileItem[] };
  return {
    folder,
    files: json.files || [],
  };
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  blob: Blob,
  boundary: string
): Blob {
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`;

  const closePart = `\r\n--${boundary}--`;
  return new Blob([metaPart, blob, closePart], {
    type: `multipart/related; boundary=${boundary}`,
  });
}

export async function createDriveFile(
  accessToken: string,
  folderId: string,
  payload: DriveUploadPayload
): Promise<DriveFileItem> {
  const boundary = `sqg_drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = {
    name: payload.fileName,
    parents: [folderId],
    mimeType: payload.mimeType,
    description: payload.description || 'Dihasilkan oleh Smart Question & Grade Portal',
  };

  const body = buildMultipartBody(metadata, payload.blob, boundary);
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  return (await res.json()) as DriveFileItem;
}

export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  payload: DriveUploadPayload
): Promise<DriveFileItem> {
  const boundary = `sqg_drive_upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = {
    name: payload.fileName,
    mimeType: payload.mimeType,
    description: payload.description || 'Diperbarui oleh Smart Question & Grade Portal',
  };

  const body = buildMultipartBody(metadata, payload.blob, boundary);
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/${encodeURIComponent(
      fileId
    )}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    accessToken,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  return (await res.json()) as DriveFileItem;
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
}

export function withTimestampSuffix(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  if (dotIdx === -1) return `${fileName}_${stamp}`;
  return `${fileName.slice(0, dotIdx)}_${stamp}${fileName.slice(dotIdx)}`;
}

export async function prepareDriveSyncPlan(
  accessToken: string,
  items: DriveUploadPayload[]
): Promise<DriveSyncPlan> {
  const { folder, files } = await listAppDriveFiles(accessToken);
  const byName = new Map<string, DriveFileItem>();
  for (const f of files) {
    if (!byName.has(f.name)) {
      byName.set(f.name, f);
    }
  }

  const newItems: DriveUploadPayload[] = [];
  const conflicts: { payload: DriveUploadPayload; existingFile: DriveFileItem }[] = [];

  for (const item of items) {
    const match = byName.get(item.fileName);
    if (match) {
      conflicts.push({ payload: item, existingFile: match });
    } else {
      newItems.push(item);
    }
  }

  return { folder, newItems, conflicts };
}

/**
 * Groups student scores by (subjectName, className) so different data produces different Excel (.xlsx) files
 * inside the single Google Drive folder, plus one overall summary workbook.
 */
export async function buildScoreDatasetPayloads(options: {
  scores: StudentScoreEntry[];
  schoolName: string;
  exportedBy: string;
  includeMasterRecap?: boolean;
}): Promise<DriveUploadPayload[]> {
  const { scores, schoolName, exportedBy, includeMasterRecap = true } = options;
  if (scores.length === 0) return [];

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const payloads: DriveUploadPayload[] = [];

  // Group per (Mapel + Kelas) so different datasets produce separate files
  const groups = new Map<string, StudentScoreEntry[]>();
  for (const item of scores) {
    const key = `${item.subjectName.trim()}__${item.className.trim()}`;
    const arr = groups.get(key) || [];
    arr.push(item);
    groups.set(key, arr);
  }

  for (const [, groupScores] of groups.entries()) {
    const sample = groupScores[0];
    const subPart = sanitizeFilePart(sample.subjectName, 'Mapel');
    const clsPart = sanitizeFilePart(sample.className, 'Kelas');
    const fileName = `Nilai_${subPart}_${clsPart}.xlsx`;

    const blob = await buildGradesExcelBlob({
      scores: groupScores,
      schoolName,
      exportedBy,
      filterSummary: `${sample.subjectName} — ${sample.className}`,
    });

    payloads.push({
      fileName,
      mimeType: XLSX_MIME,
      blob,
      description: `Rekap nilai ${sample.subjectName} kelas ${sample.className} (${groupScores.length} siswa)`,
    });
  }

  // Also include a consolidated workbook when multiple datasets exist
  if (includeMasterRecap && groups.size > 1) {
    const masterBlob = await buildGradesExcelBlob({
      scores,
      schoolName,
      exportedBy,
      filterSummary: 'Gabungan Semua Mata Pelajaran & Kelas',
    });
    payloads.push({
      fileName: 'Rekap_Semua_Nilai_Gabungan.xlsx',
      mimeType: XLSX_MIME,
      blob: masterBlob,
      description: `Gabungan seluruh data nilai (${scores.length} entri)`,
    });
  }

  return payloads;
}

export async function buildExamDocxDrivePayload(options: {
  examDoc: ExamDocument;
  template: TemplateDocument;
  logoDataUrl?: string;
}): Promise<DriveUploadPayload> {
  const { examDoc, template, logoDataUrl } = options;
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const blob = await exportDocumentToDocx({
    template,
    identity: examDoc.identity,
    format: examDoc.formatConfig,
    questions: examDoc.parsedQuestions,
    logoDataUrl,
  });

  const subPart = sanitizeFilePart(
    examDoc.subjectFormalName || examDoc.subjectCode || examDoc.title,
    'Ujian'
  );
  const clsPart = sanitizeFilePart(examDoc.className, 'Kelas');
  const idPart = sanitizeFilePart(examDoc.id.replace(/^doc_/, ''), '1').slice(-6);
  const fileName = `Naskah_${subPart}_${clsPart}_${idPart}.docx`;

  return {
    fileName,
    mimeType: DOCX_MIME,
    blob,
    description: `Naskah soal ${stripRichHtml(examDoc.title)} (${examDoc.questionCount} soal)`,
  };
}

export function buildMetadataBackupPayloads(
  settings: UserSettings,
  subjects: SubjectConfig[]
): DriveUploadPayload[] {
  const payloads: DriveUploadPayload[] = [
    {
      fileName: 'Pengaturan_Identitas_Sekolah.json',
      mimeType: 'application/json',
      blob: new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }),
      description: 'Backup pengaturan sekolah & format default',
    },
  ];
  if (subjects.length > 0) {
    payloads.push({
      fileName: 'Daftar_Mata_Pelajaran_Khusus.json',
      mimeType: 'application/json',
      blob: new Blob([JSON.stringify(subjects, null, 2)], { type: 'application/json' }),
      description: 'Daftar konfigurasi mata pelajaran',
    });
  }
  return payloads;
}
