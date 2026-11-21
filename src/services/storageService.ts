import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  ExamDocument,
  SharedExamDocument,
  StudentScoreEntry,
  SubjectConfig,
  TemplateDocument,
  UserProfile,
  UserRole,
  UserSettings,
} from '../types/exam';
import {
  ALLOWED_BUILTIN_TEMPLATE_IDS,
  DEFAULT_SUBJECTS,
  DEFAULT_TEMPLATES,
  DEFAULT_USER_SETTINGS,
} from '../data/defaults';

export const PRIMARY_ADMIN_EMAIL = 'muhammad505220@gmail.com';

const LS_SETTINGS_KEY = 'sqg_settings_v1';
const LS_SUBJECTS_KEY = 'sqg_subjects_v1';
const LS_TEMPLATES_KEY = 'sqg_templates_v1';
const LS_DOCUMENTS_KEY = 'sqg_documents_v1';
const LS_SCORES_KEY = 'sqg_scores_v1';

// IndexedDB for storing large binary DOCX/PDF template data locally without hitting 5MB localStorage limits
const IDB_NAME = 'sqg_binary_store';
const IDB_STORE = 'template_binaries';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBinaryToIdb(id: string, data: { docxBase64?: string; pdfDataUrl?: string; extractedHtmlPreview?: string }) {
  try {
    const idb = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IndexedDB unavailability in restricted environments
  }
}

async function loadBinaryFromIdb(id: string): Promise<{ docxBase64?: string; pdfDataUrl?: string; extractedHtmlPreview?: string } | null> {
  try {
    const idb = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function deleteBinaryFromIdb(id: string) {
  try {
    const idb = await openIdb();
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (Array.isArray(v)) {
        out[k] = v.map((item) =>
          item && typeof item === 'object' && !(item instanceof Timestamp)
            ? stripUndefined(item as Record<string, unknown>)
            : item
        );
      } else if (v && typeof v === 'object' && !(v instanceof Timestamp) && Object.getPrototypeOf(v) === Object.prototype) {
        out[k] = stripUndefined(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

function timestampToIso(val: unknown): string {
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

// Local Storage Loaders
export function loadLocalSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveLocalSettings(settings: UserSettings) {
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

export function loadLocalSubjects(): SubjectConfig[] {
  try {
    const raw = localStorage.getItem(LS_SUBJECTS_KEY);
    if (!raw) return DEFAULT_SUBJECTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SUBJECTS;
    // Keep only teacher-created custom subjects; clear legacy pre-populated defaults
    return parsed
      .filter((s: SubjectConfig) => Boolean(s?.isCustom))
      .map((s: SubjectConfig) => ({
        ...s,
        defaultTemplateId: (ALLOWED_BUILTIN_TEMPLATE_IDS as readonly string[]).includes(s.defaultTemplateId)
          ? s.defaultTemplateId
          : 'tpl_kmi_latin',
      }));
  } catch {
    return DEFAULT_SUBJECTS;
  }
}

export function saveLocalSubjects(subjects: SubjectConfig[]) {
  try {
    localStorage.setItem(LS_SUBJECTS_KEY, JSON.stringify(subjects));
  } catch {
    // Ignore
  }
}

export async function loadLocalTemplates(): Promise<TemplateDocument[]> {
  try {
    const raw = localStorage.getItem(LS_TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const list: TemplateDocument[] = JSON.parse(raw);
    // Keep ONLY the 2 official built-in templates (plus any user-uploaded custom templates if explicitly added)
    const filtered = list.filter(
      (t) => t.sourceType !== 'builtin' || (ALLOWED_BUILTIN_TEMPLATE_IDS as readonly string[]).includes(t.id)
    );
    const hydrated = await Promise.all(
      filtered.map(async (tpl) => {
        const defMatch = DEFAULT_TEMPLATES.find((d) => d.id === tpl.id);
        if (defMatch) return { ...defMatch, logoDataUrl: tpl.logoDataUrl };
        const bin = await loadBinaryFromIdb(tpl.id);
        return bin ? { ...tpl, ...bin } : tpl;
      })
    );
    const result = [...DEFAULT_TEMPLATES];
    for (const item of hydrated) {
      if (!result.some((r) => r.id === item.id)) {
        result.push(item);
      }
    }
    return result;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export async function saveLocalTemplates(templates: TemplateDocument[]) {
  const metadataOnly: TemplateDocument[] = [];
  for (const tpl of templates) {
    if (tpl.docxBase64 || tpl.pdfDataUrl || tpl.extractedHtmlPreview) {
      await saveBinaryToIdb(tpl.id, {
        docxBase64: tpl.docxBase64,
        pdfDataUrl: tpl.pdfDataUrl,
        extractedHtmlPreview: tpl.extractedHtmlPreview,
      });
    }
    const { docxBase64: _d, pdfDataUrl: _p, extractedHtmlPreview: _h, ...meta } = tpl;
    metadataOnly.push(meta);
  }
  try {
    localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(metadataOnly));
  } catch {
    // Ignore
  }
}

export function loadLocalDocuments(): ExamDocument[] {
  try {
    const raw = localStorage.getItem(LS_DOCUMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalDocuments(docs: ExamDocument[]) {
  try {
    localStorage.setItem(LS_DOCUMENTS_KEY, JSON.stringify(docs));
  } catch {
    // Ignore
  }
}

export function loadLocalScores(): StudentScoreEntry[] {
  try {
    const raw = localStorage.getItem(LS_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalScores(scores: StudentScoreEntry[]) {
  try {
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(scores));
  } catch {
    // Ignore
  }
}

// Cloud Firestore Sync Operations (authenticated & email-verified user)
function getVerifiedUid(): string | null {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;
  return user.uid;
}

export function isPrimaryAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());
}

export async function syncLoadAllFromCloud(): Promise<{
  settings?: UserSettings;
  subjects?: SubjectConfig[];
  templates?: TemplateDocument[];
  documents?: ExamDocument[];
} | null> {
  const uid = getVerifiedUid();
  if (!uid) return null;

  const userPath = `users/${uid}`;
  let settings: UserSettings | undefined;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      settings = {
        ...DEFAULT_USER_SETTINGS,
        schoolName: String(d.schoolName || DEFAULT_USER_SETTINGS.schoolName),
        schoolAddress: String(d.schoolAddress || DEFAULT_USER_SETTINGS.schoolAddress),
        examType: String(d.examType || DEFAULT_USER_SETTINGS.examType),
        academicYear: String(d.academicYear || DEFAULT_USER_SETTINGS.academicYear),
        semester: String(d.semester || DEFAULT_USER_SETTINGS.semester),
        defaultDuration: String(d.defaultDuration || DEFAULT_USER_SETTINGS.defaultDuration),
        teacherName: String(d.teacherName || DEFAULT_USER_SETTINGS.teacherName),
        paperSize: (d.paperSize as UserSettings['paperSize']) || 'A4',
        fontFamily: (d.fontFamily as UserSettings['fontFamily']) || 'Times New Roman',
        fontSize: typeof d.fontSize === 'number' ? d.fontSize : 11,
        preserveContentStrict: typeof d.preserveContentStrict === 'boolean' ? d.preserveContentStrict : true,
        logoDataUrl: typeof d.logoDataUrl === 'string' ? d.logoDataUrl : undefined,
        updatedAt: timestampToIso(d.updatedAt),
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const subjectsPath = `users/${uid}/subjects`;
  let subjects: SubjectConfig[] | undefined;
  try {
    const subSnap = await getDocs(query(collection(db, 'users', uid, 'subjects'), where('ownerId', '==', uid)));
    if (!subSnap.empty) {
      subjects = subSnap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            code: String(d.code),
            shortName: String(d.shortName),
            formalName: String(d.formalName),
            defaultTemplateId: (ALLOWED_BUILTIN_TEMPLATE_IDS as readonly string[]).includes(String(d.defaultTemplateId))
              ? String(d.defaultTemplateId)
              : 'tpl_kmi_latin',
            defaultDuration: String(d.defaultDuration || '90 minutes'),
            defaultInstructions: String(d.defaultInstructions || ''),
            isCustom: Boolean(d.isCustom),
            updatedAt: timestampToIso(d.updatedAt),
          };
        })
        .filter((s) => s.isCustom);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, subjectsPath);
  }

  const templatesPath = `users/${uid}/templates`;
  let templates: TemplateDocument[] | undefined;
  try {
    const tplSnap = await getDocs(query(collection(db, 'users', uid, 'templates'), where('ownerId', '==', uid)));
    if (!tplSnap.empty) {
      templates = await Promise.all(
        tplSnap.docs.map(async (docSnap) => {
          const d = docSnap.data();
          const localBin = await loadBinaryFromIdb(docSnap.id);
          return {
            id: docSnap.id,
            name: String(d.name),
            description: String(d.headerSubtitle || 'Template tersimpan di Cloud'),
            sourceType: (d.sourceType as TemplateDocument['sourceType']) || 'builtin',
            direction: (d.direction as TemplateDocument['direction']) || 'ltr',
            paperSize: (d.paperSize as TemplateDocument['paperSize']) || 'A4',
            headerTitle: String(d.headerTitle || ''),
            headerSubtitle: String(d.headerSubtitle || ''),
            kopLines: Array.isArray(d.kopLines) ? d.kopLines.map(String) : [],
            placeholdersDetected: Array.isArray(d.placeholdersDetected) ? d.placeholdersDetected.map(String) : [],
            placeholderMappings: (d.placeholderMappings as Record<string, string>) || {},
            docxBase64: typeof d.docxBase64 === 'string' ? d.docxBase64 : localBin?.docxBase64,
            pdfDataUrl: localBin?.pdfDataUrl,
            extractedPreviewText: typeof d.extractedPreviewText === 'string' ? d.extractedPreviewText : undefined,
            extractedHtmlPreview: localBin?.extractedHtmlPreview,
            logoDataUrl: typeof d.logoDataUrl === 'string' ? d.logoDataUrl : undefined,
            margins: d.margins as TemplateDocument['margins'],
            structure: {
              hasKopSekolah: true,
              hasLogo: Boolean(d.logoDataUrl),
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
            createdAt: timestampToIso(d.createdAt),
            updatedAt: timestampToIso(d.updatedAt),
          };
        })
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, templatesPath);
  }

  const docsPath = `users/${uid}/documents`;
  let documents: ExamDocument[] | undefined;
  try {
    const docsSnap = await getDocs(query(collection(db, 'users', uid, 'documents'), where('ownerId', '==', uid)));
    documents = docsSnap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          title: String(d.title),
          subjectCode: String(d.subjectCode),
          subjectFormalName: String(d.subjectFormalName),
          className: String(d.className || ''),
          questionCount: Number(d.questionCount || 0),
          templateId: String(d.templateId || 'tpl_kmi_latin'),
          templateName: String(d.templateName || ''),
          status: (d.status as ExamDocument['status']) || 'draft',
          rawText: String(d.rawText || ''),
          identity: d.identity,
          formatConfig: d.formatConfig,
          parsedQuestions: Array.isArray(d.parsedQuestions) ? d.parsedQuestions : [],
          warnings: Array.isArray(d.warnings) ? d.warnings : [],
          createdAt: timestampToIso(d.createdAt),
          updatedAt: timestampToIso(d.updatedAt),
        } as ExamDocument;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, docsPath);
  }

  return { settings, subjects, templates, documents };
}

export async function syncSaveSettingsToCloud(settings: UserSettings): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  const payload = stripUndefined({
    ownerId: uid,
    schoolName: settings.schoolName.slice(0, 200),
    schoolAddress: settings.schoolAddress.slice(0, 300),
    examType: settings.examType.slice(0, 120),
    academicYear: settings.academicYear.slice(0, 40),
    semester: settings.semester.slice(0, 40),
    defaultDuration: settings.defaultDuration.slice(0, 60),
    teacherName: settings.teacherName.slice(0, 120),
    paperSize: settings.paperSize,
    fontFamily: settings.fontFamily.slice(0, 80),
    fontSize: settings.fontSize,
    preserveContentStrict: settings.preserveContentStrict,
    logoDataUrl: settings.logoDataUrl ? settings.logoDataUrl.slice(0, 350000) : undefined,
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      const { ownerId: _o, ...updateFields } = payload;
      await updateDoc(docRef, updateFields);
    } else {
      await setDoc(docRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSaveSubjectToCloud(subject: SubjectConfig): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const subId = sanitizeId(subject.id);
  const path = `users/${uid}/subjects/${subId}`;
  const docRef = doc(db, 'users', uid, 'subjects', subId);

  const payload = stripUndefined({
    ownerId: uid,
    code: subject.code.slice(0, 80),
    shortName: subject.shortName.slice(0, 100),
    formalName: subject.formalName.slice(0, 160),
    defaultTemplateId: subject.defaultTemplateId.slice(0, 128),
    defaultDuration: subject.defaultDuration.slice(0, 60),
    defaultInstructions: subject.defaultInstructions.slice(0, 2000),
    isCustom: subject.isCustom,
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      const { ownerId: _o, ...updateFields } = payload;
      await updateDoc(docRef, updateFields);
    } else {
      await setDoc(docRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncDeleteSubjectFromCloud(subjectId: string): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const subId = sanitizeId(subjectId);
  const path = `users/${uid}/subjects/${subId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'subjects', subId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncSaveTemplateToCloud(tpl: TemplateDocument): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const tplId = sanitizeId(tpl.id);
  const path = `users/${uid}/templates/${tplId}`;
  const docRef = doc(db, 'users', uid, 'templates', tplId);

  // Only include docxBase64 in Firestore if within safe <750KB limit (otherwise stored in IndexedDB locally)
  const safeDocxBase64 =
    tpl.docxBase64 && tpl.docxBase64.length <= 750000 ? tpl.docxBase64 : undefined;

  const baseFields = stripUndefined({
    name: tpl.name.slice(0, 160),
    sourceType: tpl.sourceType,
    direction: tpl.direction || 'ltr',
    paperSize: tpl.paperSize,
    headerTitle: tpl.headerTitle.slice(0, 240),
    headerSubtitle: tpl.headerSubtitle.slice(0, 300),
    kopLines: (tpl.kopLines || []).slice(0, 10).map((s) => s.slice(0, 240)),
    placeholdersDetected: (tpl.placeholdersDetected || []).slice(0, 50).map((s) => s.slice(0, 80)),
    placeholderMappings: tpl.placeholderMappings || {},
    docxBase64: safeDocxBase64,
    extractedPreviewText: tpl.extractedPreviewText ? tpl.extractedPreviewText.slice(0, 49000) : undefined,
    logoDataUrl: tpl.logoDataUrl && tpl.logoDataUrl.length <= 340000 ? tpl.logoDataUrl : undefined,
    margins: tpl.margins,
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, baseFields);
    } else {
      await setDoc(docRef, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncDeleteTemplateFromCloud(templateId: string): Promise<void> {
  await deleteBinaryFromIdb(templateId);
  const uid = getVerifiedUid();
  if (!uid) return;
  const tplId = sanitizeId(templateId);
  const path = `users/${uid}/templates/${tplId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'templates', tplId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function ensureUserProfile(
  preferredRole: UserRole = 'guru',
  displayNameOverride?: string,
  subjectSpecialty?: string
): Promise<UserProfile | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const uid = user.uid;
  const email = (user.email || '').trim().slice(0, 200);
  const path = `userProfiles/${uid}`;
  const profileRef = doc(db, 'userProfiles', uid);

  let hasAdminRecord = isPrimaryAdminEmail(email);
  if (!hasAdminRecord) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      hasAdminRecord = adminSnap.exists();
    } catch {
      hasAdminRecord = false;
    }
  }

  const effectiveRole: UserRole = hasAdminRecord ? 'admin' : 'guru';
  const fallbackName =
    displayNameOverride?.trim() ||
    user.displayName?.trim() ||
    email.split('@')[0] ||
    (effectiveRole === 'admin' ? 'Administrator' : 'Ustadz / Guru');

  try {
    const existing = await getDoc(profileRef);
    if (existing.exists()) {
      const d = existing.data();
      const nextDisplayName = (displayNameOverride?.trim() || String(d.displayName || fallbackName)).slice(0, 120);
      const nextSpecialty =
        subjectSpecialty !== undefined
          ? subjectSpecialty.trim().slice(0, 120)
          : typeof d.subjectSpecialty === 'string'
          ? d.subjectSpecialty
          : undefined;
      const roleToPersist: UserRole =
        hasAdminRecord && (preferredRole === 'admin' || d.role === 'admin')
          ? 'admin'
          : (d.role as UserRole) === 'admin' && hasAdminRecord
          ? 'admin'
          : 'guru';

      const updateFields = stripUndefined({
        email,
        displayName: nextDisplayName,
        role: roleToPersist,
        subjectSpecialty: nextSpecialty,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(profileRef, updateFields);

      return {
        ownerId: uid,
        email,
        displayName: nextDisplayName,
        role: roleToPersist,
        subjectSpecialty: nextSpecialty,
        createdAt: timestampToIso(d.createdAt),
        updatedAt: new Date().toISOString(),
      };
    }

    const createPayload = stripUndefined({
      ownerId: uid,
      email,
      displayName: fallbackName.slice(0, 120),
      role: effectiveRole,
      subjectSpecialty: subjectSpecialty ? subjectSpecialty.trim().slice(0, 120) : undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(profileRef, createPayload);

    const nowIso = new Date().toISOString();
    return {
      ownerId: uid,
      email,
      displayName: fallbackName.slice(0, 120),
      role: effectiveRole,
      subjectSpecialty: subjectSpecialty ? subjectSpecialty.trim().slice(0, 120) : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function buildSharedDocId(uid: string, sourceDocId: string): string {
  return sanitizeId(`${uid}_${sanitizeId(sourceDocId)}`);
}

export async function syncSaveSharedDocument(
  examDoc: ExamDocument,
  teacherInfo?: { displayName?: string; email?: string }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const uid = user.uid;
  const sourceDocId = sanitizeId(examDoc.id);
  const sharedId = buildSharedDocId(uid, sourceDocId);
  const path = `sharedDocuments/${sharedId}`;
  const docRef = doc(db, 'sharedDocuments', sharedId);

  const teacherEmail = (teacherInfo?.email || user.email || 'guru@sekolah.sch.id').slice(0, 200);
  const teacherName = (
    teacherInfo?.displayName ||
    user.displayName ||
    examDoc.identity?.teacherName ||
    teacherEmail.split('@')[0] ||
    'Ustadz / Guru'
  )
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 120) || 'Ustadz / Guru';

  const baseFields = stripUndefined({
    teacherEmail,
    teacherName,
    title: examDoc.title.slice(0, 200),
    subjectCode: examDoc.subjectCode.slice(0, 80),
    subjectFormalName: examDoc.subjectFormalName.slice(0, 160),
    className: examDoc.className.slice(0, 80),
    questionCount: Math.min(1000, Math.max(0, examDoc.questionCount)),
    templateId: examDoc.templateId.slice(0, 128),
    templateName: examDoc.templateName.slice(0, 160),
    status: examDoc.status,
    rawText: examDoc.rawText.slice(0, 195000),
    identity: examDoc.identity,
    formatConfig: examDoc.formatConfig,
    parsedQuestions: examDoc.parsedQuestions.slice(0, 500),
    warnings: examDoc.warnings.slice(0, 200),
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, baseFields);
    } else {
      await setDoc(docRef, {
        ownerId: uid,
        sourceDocId,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSaveDocumentToCloud(
  examDoc: ExamDocument,
  teacherInfo?: { displayName?: string; email?: string }
): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const docId = sanitizeId(examDoc.id);
  const path = `users/${uid}/documents/${docId}`;
  const docRef = doc(db, 'users', uid, 'documents', docId);

  const baseFields = stripUndefined({
    title: examDoc.title.slice(0, 200),
    subjectCode: examDoc.subjectCode.slice(0, 80),
    subjectFormalName: examDoc.subjectFormalName.slice(0, 160),
    className: examDoc.className.slice(0, 80),
    questionCount: Math.min(1000, Math.max(0, examDoc.questionCount)),
    templateId: examDoc.templateId.slice(0, 128),
    templateName: examDoc.templateName.slice(0, 160),
    status: examDoc.status,
    rawText: examDoc.rawText.slice(0, 195000),
    identity: examDoc.identity,
    formatConfig: examDoc.formatConfig,
    parsedQuestions: examDoc.parsedQuestions.slice(0, 500),
    warnings: examDoc.warnings.slice(0, 200),
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, baseFields);
    } else {
      await setDoc(docRef, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
  // Automatically mirror to centralized sharedDocuments for real-time Guru + Admin visibility
  await syncSaveSharedDocument(examDoc, teacherInfo);
}

export async function syncDeleteDocumentFromCloud(docIdRaw: string): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const docId = sanitizeId(docIdRaw);
  const path = `users/${uid}/documents/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'documents', docId));
    const sharedId = buildSharedDocId(uid, docId);
    await deleteDoc(doc(db, 'sharedDocuments', sharedId)).catch(() => {
      // Ignore if shared copy doesn't exist yet
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncSaveStudentScore(entry: StudentScoreEntry): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const uid = user.uid;
  const scoreId = sanitizeId(entry.id);
  const path = `studentScores/${scoreId}`;
  const scoreRef = doc(db, 'studentScores', scoreId);

  const clampedScore = Math.min(100, Math.max(0, Number(entry.score) || 0));
  const baseFields = stripUndefined({
    teacherEmail: (entry.teacherEmail || user.email || '').slice(0, 200),
    teacherName: (entry.teacherName || user.displayName || 'Ustadz / Guru').slice(0, 120) || 'Ustadz / Guru',
    documentId: entry.documentId ? sanitizeId(entry.documentId) : undefined,
    examTitle: entry.examTitle.trim().slice(0, 200) || 'Ujian',
    subjectName: entry.subjectName.trim().slice(0, 160) || 'Mata Pelajaran',
    className: entry.className.trim().slice(0, 80) || '-',
    semester: entry.semester ? entry.semester.trim().slice(0, 60) : undefined,
    academicYear: entry.academicYear ? entry.academicYear.trim().slice(0, 60) : undefined,
    studentName: entry.studentName.trim().slice(0, 140) || 'Siswa',
    studentNis: entry.studentNis ? entry.studentNis.trim().slice(0, 60) : undefined,
    score: clampedScore,
    predicate: entry.predicate ? entry.predicate.trim().slice(0, 40) : undefined,
    notes: entry.notes ? entry.notes.trim().slice(0, 300) : undefined,
    updatedAt: serverTimestamp(),
  });

  try {
    const existing = await getDoc(scoreRef);
    if (existing.exists()) {
      await updateDoc(scoreRef, baseFields);
    } else {
      await setDoc(scoreRef, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncDeleteStudentScore(scoreIdRaw: string): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const scoreId = sanitizeId(scoreIdRaw);
  const path = `studentScores/${scoreId}`;
  try {
    await deleteDoc(doc(db, 'studentScores', scoreId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeSharedDocuments(
  uid: string,
  isAdminMode: boolean,
  onData: (docs: SharedExamDocument[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const colRef = collection(db, 'sharedDocuments');
  const q = isAdminMode ? query(colRef) : query(colRef, where('ownerId', '==', uid));
  const path = 'sharedDocuments';

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ownerId: String(d.ownerId),
            sourceDocId: String(d.sourceDocId || docSnap.id),
            teacherEmail: String(d.teacherEmail || ''),
            teacherName: String(d.teacherName || 'Ustadz / Guru'),
            title: String(d.title || ''),
            subjectCode: String(d.subjectCode || '-'),
            subjectFormalName: String(d.subjectFormalName || '-'),
            className: String(d.className || '-'),
            questionCount: Number(d.questionCount || 0),
            templateId: String(d.templateId || 'tpl_kmi_latin'),
            templateName: String(d.templateName || ''),
            status: (d.status as ExamDocument['status']) || 'draft',
            rawText: String(d.rawText || ''),
            identity: d.identity,
            formatConfig: d.formatConfig,
            parsedQuestions: Array.isArray(d.parsedQuestions) ? d.parsedQuestions : [],
            warnings: Array.isArray(d.warnings) ? d.warnings : [],
            createdAt: timestampToIso(d.createdAt),
            updatedAt: timestampToIso(d.updatedAt),
          } as SharedExamDocument;
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeStudentScores(
  uid: string,
  isAdminMode: boolean,
  onData: (scores: StudentScoreEntry[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const colRef = collection(db, 'studentScores');
  const q = isAdminMode ? query(colRef) : query(colRef, where('ownerId', '==', uid));
  const path = 'studentScores';

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ownerId: String(d.ownerId),
            teacherEmail: String(d.teacherEmail || ''),
            teacherName: String(d.teacherName || 'Ustadz / Guru'),
            documentId: typeof d.documentId === 'string' ? d.documentId : undefined,
            examTitle: String(d.examTitle || ''),
            subjectName: String(d.subjectName || ''),
            className: String(d.className || ''),
            semester: typeof d.semester === 'string' ? d.semester : undefined,
            academicYear: typeof d.academicYear === 'string' ? d.academicYear : undefined,
            studentName: String(d.studentName || ''),
            studentNis: typeof d.studentNis === 'string' ? d.studentNis : undefined,
            score: Number(d.score ?? 0),
            predicate: String(d.predicate || ''),
            notes: typeof d.notes === 'string' ? d.notes : undefined,
            createdAt: timestampToIso(d.createdAt),
            updatedAt: timestampToIso(d.updatedAt),
          } as StudentScoreEntry;
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeUserProfiles(
  onData: (profiles: UserProfile[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const colRef = collection(db, 'userProfiles');
  const path = 'userProfiles';

  return onSnapshot(
    query(colRef),
    (snapshot) => {
      const list = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            ownerId: String(d.ownerId || docSnap.id),
            email: String(d.email || ''),
            displayName: String(d.displayName || ''),
            role: (d.role as UserRole) || 'guru',
            subjectSpecialty: typeof d.subjectSpecialty === 'string' ? d.subjectSpecialty : undefined,
            createdAt: timestampToIso(d.createdAt),
            updatedAt: timestampToIso(d.updatedAt),
          } as UserProfile;
        })
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

