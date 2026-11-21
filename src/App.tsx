import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  FileEdit,
  FolderKanban,
  BookOpen,
  History,
  Settings,
  Menu,
  X,
  LogIn,
  LogOut,
  FilePlus2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ShieldCheck,
  Home,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  auth,
  connectGoogleDriveAccess,
  signInWithGoogleAndCaptureDriveToken,
  subscribeDriveToken,
} from './lib/firebase';
import {
  ALLOWED_BUILTIN_TEMPLATE_IDS,
  ARABIC_KMI_IDENTITY_DEFAULTS,
  ARABIC_KMI_TABLE_LABELS,
  createDefaultIdentity,
  DEFAULT_FORMAT_CONFIG,
  DEFAULT_TEMPLATES,
  LATIN_KMI_IDENTITY_DEFAULTS,
  LATIN_KMI_TABLE_LABELS,
  SAMPLE_ARABIC_RAW_QUESTIONS,
  SAMPLE_RAW_QUESTIONS,
} from './data/defaults';
import type {
  ExamDocument,
  ExamIdentity,
  FormatConfig,
  ParsedQuestion,
  ParserWarning,
  SharedExamDocument,
  StudentScoreEntry,
  SubjectConfig,
  TemplateDocument,
  UserProfile,
  UserRole,
  UserSettings,
} from './types/exam';
import {
  parseQuestionsRuleBased,
  parseQuestionsSmart,
  containsArabicText,
} from './utils/ruleParser';
import { stripRichHtml } from './utils/richText';
import { exportDocumentToDocx } from './utils/docxEngine';
import { exportDocumentToPdf } from './utils/pdfExporter';
import {
  ensureUserProfile,
  isPrimaryAdminEmail,
  loadLocalDocuments,
  loadLocalScores,
  loadLocalSettings,
  loadLocalSubjects,
  loadLocalTemplates,
  PRIMARY_ADMIN_EMAIL,
  saveLocalDocuments,
  saveLocalScores,
  saveLocalSettings,
  saveLocalSubjects,
  saveLocalTemplates,
  subscribeSharedDocuments,
  subscribeStudentScores,
  subscribeUserProfiles,
  syncDeleteDocumentFromCloud,
  syncDeleteStudentScore,
  syncDeleteSubjectFromCloud,
  syncDeleteTemplateFromCloud,
  syncLoadAllFromCloud,
  syncSaveDocumentToCloud,
  syncSaveSettingsToCloud,
  syncSaveStudentScore,
  syncSaveSubjectToCloud,
  syncSaveTemplateToCloud,
} from './services/storageService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardView } from './components/DashboardView';
import { QuestionWorkspace } from './components/QuestionWorkspace';
import { TemplateManagerView } from './components/TemplateManagerView';
import { SubjectSettingsView } from './components/SubjectSettingsView';
import { HistoryView } from './components/HistoryView';
import { WebsiteSettingsView } from './components/WebsiteSettingsView';
import { LandingAuthPortal } from './components/LandingAuthPortal';
import { GradesRecapView } from './components/GradesRecapView';
import { AdminMonitorView } from './components/AdminMonitorView';
import {
  DriveActionConfirmModal,
  GoogleDriveSyncPanel,
  type PendingDriveConfirmation,
} from './components/GoogleDriveSyncPanel';
import {
  buildExamDocxDrivePayload,
  buildMetadataBackupPayloads,
  buildScoreDatasetPayloads,
  createDriveFile,
  deleteDriveFile,
  listAppDriveFiles,
  prepareDriveSyncPlan,
  updateDriveFile,
  withTimestampSuffix,
  type DriveFileItem,
  type DriveFolderInfo,
  type DriveUploadPayload,
} from './services/googleDriveService';

type NavTab =
  | 'dashboard'
  | 'editor'
  | 'grades'
  | 'admin'
  | 'templates'
  | 'subjects'
  | 'history'
  | 'settings';

interface EditorSnapshot {
  identity: ExamIdentity;
  formatConfig: FormatConfig;
  parsedQuestions: ParsedQuestion[];
}

const BASE_NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'editor', label: 'Input Soal', icon: FileEdit },
  { id: 'grades', label: 'Input & Rekap Nilai', icon: FileSpreadsheet },
  { id: 'templates', label: 'Template Dokumen', icon: FolderKanban },
  { id: 'subjects', label: 'Pengaturan Mata Pelajaran', icon: BookOpen },
  { id: 'history', label: 'Riwayat Dokumen', icon: History },
  { id: 'settings', label: 'Pengaturan Website', icon: Settings },
];

const ADMIN_NAV_ITEM: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> } = {
  id: 'admin',
  label: 'Pusat Data Admin',
  icon: ShieldCheck,
};

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi tidak cocok. Silakan periksa kembali.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan masuk atau reset kata sandi.';
    case 'auth/weak-password':
      return 'Kata sandi minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/operation-not-allowed':
      return 'Login Email & Kata Sandi belum diaktifkan di Firebase Console (Authentication -> Sign-in method -> Email/Password). Silakan aktifkan terlebih dahulu atau gunakan tombol Masuk Email Google.';
    case 'auth/popup-closed-by-user':
      return 'Jendela login Google ditutup sebelum selesai.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Silakan tunggu beberapa saat lalu coba lagi.';
    default:
      return err instanceof Error ? err.message : 'Terjadi kesalahan saat proses autentikasi.';
  }
}

function sanitizeDocFilenamePart(raw: string, fallback: string): string {
  const cleaned = stripRichHtml(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('editor');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Auth, Role & Portal State
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [selectedPortalRole, setSelectedPortalRole] = useState<UserRole>('guru');
  const selectedPortalRoleRef = useRef<UserRole>(selectedPortalRole);
  selectedPortalRoleRef.current = selectedPortalRole;
  const [showLandingPortal, setShowLandingPortal] = useState<boolean>(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const pendingProfileMetaRef = useRef<{
    role: UserRole;
    displayName?: string;
    subjectSpecialty?: string;
    enforceAdminCheck?: boolean;
  } | null>(null);

  // Persistent Collections (Default subjects empty so teacher enters subject directly; strictly 2 KMI templates)
  const [settings, setSettings] = useState<UserSettings>(() => loadLocalSettings());
  const [subjects, setSubjects] = useState<SubjectConfig[]>(() => loadLocalSubjects());
  const [templates, setTemplates] = useState<TemplateDocument[]>(DEFAULT_TEMPLATES);
  const [documents, setDocuments] = useState<ExamDocument[]>(() => loadLocalDocuments());
  const [sharedDocuments, setSharedDocuments] = useState<SharedExamDocument[]>([]);
  const [studentScores, setStudentScores] = useState<StudentScoreEntry[]>(() => loadLocalScores());
  const [allUserProfiles, setAllUserProfiles] = useState<UserProfile[]>([]);
  const [autoSyncLabel, setAutoSyncLabel] = useState<string | null>(null);

  // Google Drive In-Memory OAuth & Folder State
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveFolder, setDriveFolder] = useState<DriveFolderInfo | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [pendingDriveConfirm, setPendingDriveConfirm] =
    useState<PendingDriveConfirmation | null>(null);

  // Active Document Workbench State
  const [currentDocId, setCurrentDocId] = useState<string>(() => `doc_${Date.now()}`);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl_kmi_latin');
  const [documentTitle, setDocumentTitle] = useState<string>('THE SECOND SEMESTER EXAMINATION');
  const [rawText, setRawText] = useState<string>(SAMPLE_RAW_QUESTIONS);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>(() =>
    parseQuestionsRuleBased(SAMPLE_RAW_QUESTIONS).questions
  );
  const [warnings, setWarnings] = useState<ParserWarning[]>(() =>
    parseQuestionsRuleBased(SAMPLE_RAW_QUESTIONS).warnings
  );
  const [detectedSubject, setDetectedSubject] = useState<string | undefined>(undefined);
  const [parseEngine, setParseEngine] = useState<'gemini-ai' | 'rule-based'>('rule-based');
  const [fallbackNotice, setFallbackNotice] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const [identity, setIdentity] = useState<ExamIdentity>(() =>
    createDefaultIdentity(
      loadLocalSettings(),
      undefined,
      parseQuestionsRuleBased(SAMPLE_RAW_QUESTIONS).questions.length
    )
  );
  const [formatConfig, setFormatConfig] = useState<FormatConfig>(() => ({
    ...DEFAULT_FORMAT_CONFIG,
    paperSize: loadLocalSettings().paperSize || 'A4',
    fontFamily: loadLocalSettings().fontFamily || 'Times New Roman',
    fontSize: loadLocalSettings().fontSize || 12,
  }));

  // Undo / Redo Snapshot Stack for Word-style Editing
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const lastPushTimeRef = useRef<number>(0);

  const pushUndoSnapshot = useCallback(
    (snap: EditorSnapshot, coalesce = true) => {
      const now = Date.now();
      setUndoStack((prev) => {
        if (coalesce && prev.length > 0 && now - lastPushTimeRef.current < 450) {
          lastPushTimeRef.current = now;
          return prev;
        }
        lastPushTimeRef.current = now;
        return [...prev.slice(-39), snap];
      });
      setRedoStack([]);
    },
    []
  );

  const handleIdentityEdit = useCallback(
    (next: ExamIdentity) => {
      pushUndoSnapshot({ identity, formatConfig, parsedQuestions });
      setIdentity(next);
    },
    [identity, formatConfig, parsedQuestions, pushUndoSnapshot]
  );

  const handleFormatConfigEdit = useCallback(
    (next: FormatConfig) => {
      pushUndoSnapshot({ identity, formatConfig, parsedQuestions }, false);
      setFormatConfig(next);
    },
    [identity, formatConfig, parsedQuestions, pushUndoSnapshot]
  );

  const handleParsedQuestionsEdit = useCallback(
    (qs: ParsedQuestion[]) => {
      pushUndoSnapshot({ identity, formatConfig, parsedQuestions });
      setParsedQuestions(qs);
      setIdentity((prev) => ({ ...prev, questionCount: qs.length }));
    },
    [identity, formatConfig, parsedQuestions, pushUndoSnapshot]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setRedoStack((r) => [...r.slice(-39), { identity, formatConfig, parsedQuestions }]);
      setIdentity(target.identity);
      setFormatConfig(target.formatConfig);
      setParsedQuestions(target.parsedQuestions);
      return prev.slice(0, -1);
    });
  }, [identity, formatConfig, parsedQuestions]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setUndoStack((u) => [...u.slice(-39), { identity, formatConfig, parsedQuestions }]);
      setIdentity(target.identity);
      setFormatConfig(target.formatConfig);
      setParsedQuestions(target.parsedQuestions);
      return prev.slice(0, -1);
    });
  }, [identity, formatConfig, parsedQuestions]);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  // Hydrate IndexedDB templates keeping ONLY the 2 official templates + user-uploaded DOCX/PDF templates
  useEffect(() => {
    loadLocalTemplates().then((loaded) => {
      const allowedSet = new Set<string>(ALLOWED_BUILTIN_TEMPLATE_IDS);
      const customUploads = loaded.filter((t) => t.sourceType !== 'builtin');
      const syncedBuiltins = DEFAULT_TEMPLATES.map((defTpl) => {
        const stored = loaded.find((t) => t.id === defTpl.id);
        return stored ? { ...defTpl, logoDataUrl: stored.logoDataUrl } : defTpl;
      });
      const finalTemplates = [...syncedBuiltins, ...customUploads].filter(
        (t) => t.sourceType !== 'builtin' || allowedSet.has(t.id)
      );
      setTemplates(finalTemplates);
      saveLocalTemplates(finalTemplates).catch((e) => console.error(e));
    });
  }, []);

  // Listen to Firebase Auth, ensure user profile, & sync from Cloud Firestore when signed in
  useEffect(() => {
    let unsubShared: (() => void) | undefined;
    let unsubScores: (() => void) | undefined;
    let unsubProfiles: (() => void) | undefined;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      // Tear down old listeners
      if (unsubShared) {
        unsubShared();
        unsubShared = undefined;
      }
      if (unsubScores) {
        unsubScores();
        unsubScores = undefined;
      }
      if (unsubProfiles) {
        unsubProfiles();
        unsubProfiles = undefined;
      }

      if (currentUser && currentUser.emailVerified) {
        try {
          const pendingMeta = pendingProfileMetaRef.current;
          pendingProfileMetaRef.current = null;
          const desiredRole = pendingMeta?.role || selectedPortalRoleRef.current;
          const profile = await ensureUserProfile(
            desiredRole,
            pendingMeta?.displayName,
            pendingMeta?.subjectSpecialty
          );
          setUserProfile(profile);

          if (pendingMeta?.enforceAdminCheck && profile?.role !== 'admin') {
            setAuthError(
              `Email ${currentUser.email} terdaftar sebagai Ustadz/Guru, bukan Admin sistem (${PRIMARY_ADMIN_EMAIL}). Anda dapat masuk sebagai Ustadz/Guru atau keluar untuk mengganti email.`
            );
            setShowLandingPortal(true);
          } else {
            setAuthError(null);
            setShowLandingPortal(false);
            if (profile?.role === 'admin') {
              setActiveTab((prev) => (prev === 'editor' ? 'admin' : prev));
            }
          }

          const cloudData = await syncLoadAllFromCloud();
          if (cloudData) {
            if (cloudData.settings) {
              setSettings(cloudData.settings);
              saveLocalSettings(cloudData.settings);
            }
            if (cloudData.subjects) {
              const customSubs = cloudData.subjects.filter((s) => s.isCustom);
              setSubjects(customSubs);
              saveLocalSubjects(customSubs);
            }
            if (cloudData.templates) {
              const allowedSet = new Set<string>(ALLOWED_BUILTIN_TEMPLATE_IDS);
              const customCloudTpls = cloudData.templates.filter(
                (t) => t.sourceType !== 'builtin'
              );
              const mergedBuiltins = DEFAULT_TEMPLATES.map((defTpl) => {
                const stored = cloudData.templates!.find((t) => t.id === defTpl.id);
                return stored ? { ...defTpl, logoDataUrl: stored.logoDataUrl } : defTpl;
              });
              const finalTpls = [...mergedBuiltins, ...customCloudTpls].filter(
                (t) => t.sourceType !== 'builtin' || allowedSet.has(t.id)
              );
              setTemplates(finalTpls);
              await saveLocalTemplates(finalTpls);
            }
            if (cloudData.documents && cloudData.documents.length > 0) {
              setDocuments(cloudData.documents);
              saveLocalDocuments(cloudData.documents);
            }
          }

          const canListAllAsAdmin =
            profile?.role === 'admin' && isPrimaryAdminEmail(currentUser.email);

          unsubShared = subscribeSharedDocuments(
            currentUser.uid,
            canListAllAsAdmin,
            (sharedList) => {
              setSharedDocuments(sharedList);
            }
          );

          unsubScores = subscribeStudentScores(
            currentUser.uid,
            canListAllAsAdmin,
            (scoreList) => {
              setStudentScores(scoreList);
              saveLocalScores(scoreList);
            }
          );

          if (canListAllAsAdmin) {
            unsubProfiles = subscribeUserProfiles((profilesList) => {
              setAllUserProfiles(profilesList);
            });
          } else if (profile) {
            setAllUserProfiles([profile]);
          }
        } catch (err) {
          console.error('Cloud sync failed:', err);
        }
      } else {
        setUserProfile(null);
        setSharedDocuments([]);
        setAllUserProfiles([]);
        setShowLandingPortal(true);
      }
      setAuthReady(true);
    });

    return () => {
      unsub();
      if (unsubShared) unsubShared();
      if (unsubScores) unsubScores();
      if (unsubProfiles) unsubProfiles();
    };
  }, []);

  const activeSubject = useMemo(
    () => subjects.find((s) => s.code === selectedSubjectCode),
    [subjects, selectedSubjectCode]
  );

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || templates[0] || DEFAULT_TEMPLATES[0],
    [templates, selectedTemplateId]
  );

  const applyArabicKmiIdentityPreset = useCallback((subjectFormalOverride?: string) => {
    setIdentity((prev) => ({
      ...prev,
      schoolName: ARABIC_KMI_IDENTITY_DEFAULTS.schoolName,
      schoolAddress: ARABIC_KMI_IDENTITY_DEFAULTS.schoolAddress,
      examType: ARABIC_KMI_IDENTITY_DEFAULTS.examType,
      academicYear: ARABIC_KMI_IDENTITY_DEFAULTS.academicYear,
      headerLines: [...ARABIC_KMI_IDENTITY_DEFAULTS.headerLines],
      tableLabels: { ...ARABIC_KMI_TABLE_LABELS },
      className: !containsArabicText(prev.className)
        ? ARABIC_KMI_IDENTITY_DEFAULTS.className
        : prev.className,
      examDay: !containsArabicText(prev.examDay || '')
        ? ARABIC_KMI_IDENTITY_DEFAULTS.examDay
        : prev.examDay || ARABIC_KMI_IDENTITY_DEFAULTS.examDay,
      hijriDate: !containsArabicText(prev.hijriDate || '')
        ? ARABIC_KMI_IDENTITY_DEFAULTS.hijriDate
        : prev.hijriDate || ARABIC_KMI_IDENTITY_DEFAULTS.hijriDate,
      examDate: !containsArabicText(prev.examDate)
        ? ARABIC_KMI_IDENTITY_DEFAULTS.examDate
        : prev.examDate,
      sessionPeriod: !containsArabicText(prev.sessionPeriod || '')
        ? ARABIC_KMI_IDENTITY_DEFAULTS.sessionPeriod
        : prev.sessionPeriod || ARABIC_KMI_IDENTITY_DEFAULTS.sessionPeriod,
      duration: !containsArabicText(prev.duration)
        ? ARABIC_KMI_IDENTITY_DEFAULTS.duration
        : prev.duration,
      teacherName: !containsArabicText(prev.teacherName)
        ? ARABIC_KMI_IDENTITY_DEFAULTS.teacherName
        : prev.teacherName,
      closingText: prev.closingText || ARABIC_KMI_IDENTITY_DEFAULTS.closingText,
      subjectFormalName:
        subjectFormalOverride !== undefined ? subjectFormalOverride : prev.subjectFormalName,
      includeStudentFields: false,
    }));
  }, []);

  const applyLatinKmiIdentityPreset = useCallback((subjectFormalOverride?: string) => {
    setIdentity((prev) => ({
      ...prev,
      schoolName: LATIN_KMI_IDENTITY_DEFAULTS.schoolName,
      schoolAddress: LATIN_KMI_IDENTITY_DEFAULTS.schoolAddress,
      examType: LATIN_KMI_IDENTITY_DEFAULTS.examType,
      academicYear: LATIN_KMI_IDENTITY_DEFAULTS.academicYear,
      headerLines: [...LATIN_KMI_IDENTITY_DEFAULTS.headerLines],
      tableLabels: { ...LATIN_KMI_TABLE_LABELS },
      className: containsArabicText(prev.className)
        ? LATIN_KMI_IDENTITY_DEFAULTS.className
        : prev.className || LATIN_KMI_IDENTITY_DEFAULTS.className,
      examDay: containsArabicText(prev.examDay || '')
        ? LATIN_KMI_IDENTITY_DEFAULTS.examDay
        : prev.examDay || LATIN_KMI_IDENTITY_DEFAULTS.examDay,
      hijriDate: containsArabicText(prev.hijriDate || '')
        ? LATIN_KMI_IDENTITY_DEFAULTS.hijriDate
        : prev.hijriDate || LATIN_KMI_IDENTITY_DEFAULTS.hijriDate,
      examDate: containsArabicText(prev.examDate)
        ? LATIN_KMI_IDENTITY_DEFAULTS.examDate
        : prev.examDate || LATIN_KMI_IDENTITY_DEFAULTS.examDate,
      sessionPeriod: containsArabicText(prev.sessionPeriod || '')
        ? LATIN_KMI_IDENTITY_DEFAULTS.sessionPeriod
        : prev.sessionPeriod || LATIN_KMI_IDENTITY_DEFAULTS.sessionPeriod,
      duration: containsArabicText(prev.duration)
        ? LATIN_KMI_IDENTITY_DEFAULTS.duration
        : prev.duration || LATIN_KMI_IDENTITY_DEFAULTS.duration,
      teacherName: containsArabicText(prev.teacherName)
        ? LATIN_KMI_IDENTITY_DEFAULTS.teacherName
        : prev.teacherName || LATIN_KMI_IDENTITY_DEFAULTS.teacherName,
      closingText:
        prev.closingText === ARABIC_KMI_IDENTITY_DEFAULTS.closingText ? '' : prev.closingText,
      subjectFormalName:
        subjectFormalOverride !== undefined ? subjectFormalOverride : prev.subjectFormalName,
      includeStudentFields: false,
    }));
  }, []);

  // Optional Teacher Custom Preset Subject Selection
  const handleSelectSubject = useCallback(
    (code: string) => {
      const sub = subjects.find((s) => s.code === code);
      if (!sub) return;
      setSelectedSubjectCode(code);

      const targetTemplate =
        templates.find((t) => t.id === sub.defaultTemplateId) || activeTemplate;
      const isArabicSub = targetTemplate?.direction === 'rtl';

      if (targetTemplate) {
        setSelectedTemplateId(targetTemplate.id);
        setFormatConfig((prev) => ({
          ...prev,
          paperSize: targetTemplate.paperSize,
          direction: isArabicSub ? 'rtl' : 'ltr',
          arabicTemplateStyle: 'pesantren-kmi',
          arabicNumeralStyle: isArabicSub ? 'eastern' : 'western',
          optionLabelStyle: isArabicSub ? 'arabic' : 'auto',
          fontFamily: isArabicSub ? 'Amiri' : 'Times New Roman',
          fontSize: isArabicSub ? 13 : 12,
          lineSpacing: isArabicSub ? 1.6 : 1.35,
          questionSpacing: isArabicSub ? 6 : 5,
          ...(targetTemplate.margins
            ? {
                marginTop: targetTemplate.margins.top,
                marginRight: targetTemplate.margins.right,
                marginBottom: targetTemplate.margins.bottom,
                marginLeft: targetTemplate.margins.left,
              }
            : {}),
        }));
      }

      if (isArabicSub) {
        applyArabicKmiIdentityPreset(sub.formalName);
      } else {
        applyLatinKmiIdentityPreset(sub.formalName);
      }

      setIdentity((prev) => ({
        ...prev,
        subjectCode: sub.code,
        subjectFormalName: sub.formalName,
        duration: sub.defaultDuration || prev.duration,
        instructions: sub.defaultInstructions ?? prev.instructions,
      }));
      showToast(`Mata pelajaran diganti ke ${sub.formalName}`);
    },
    [subjects, templates, activeTemplate, applyArabicKmiIdentityPreset, applyLatinKmiIdentityPreset, showToast]
  );

  const handleSelectTemplate = useCallback(
    (tplId: string) => {
      setSelectedTemplateId(tplId);
      const tpl =
        templates.find((t) => t.id === tplId) ||
        DEFAULT_TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) return;

      const isRtlTpl = tpl.direction === 'rtl';
      setFormatConfig((prev) => ({
        ...prev,
        paperSize: tpl.paperSize,
        direction: isRtlTpl ? 'rtl' : 'ltr',
        arabicTemplateStyle: 'pesantren-kmi',
        arabicNumeralStyle: isRtlTpl ? 'eastern' : 'western',
        optionLabelStyle: isRtlTpl ? 'arabic' : 'auto',
        fontFamily: isRtlTpl ? 'Amiri' : 'Times New Roman',
        fontSize: isRtlTpl ? 13 : 12,
        lineSpacing: isRtlTpl ? 1.6 : 1.35,
        questionSpacing: isRtlTpl ? 6 : 5,
        alignment: isRtlTpl ? 'right' : 'left',
        ...(tpl.margins
          ? {
              marginTop: tpl.margins.top,
              marginRight: tpl.margins.right,
              marginBottom: tpl.margins.bottom,
              marginLeft: tpl.margins.left,
            }
          : {}),
      }));

      if (isRtlTpl) {
        applyArabicKmiIdentityPreset();
      } else {
        applyLatinKmiIdentityPreset();
      }
    },
    [templates, applyArabicKmiIdentityPreset, applyLatinKmiIdentityPreset]
  );

  const handleLoadEnglishSample = useCallback(() => {
    setRawText(SAMPLE_RAW_QUESTIONS);
    const parsed = parseQuestionsRuleBased(SAMPLE_RAW_QUESTIONS);
    setParsedQuestions(parsed.questions);
    setWarnings(parsed.warnings);
    setDetectedSubject(undefined);
    setParseEngine('rule-based');
    setFallbackNotice(undefined);
    setSelectedTemplateId('tpl_kmi_latin');
    setFormatConfig((prev) => ({
      ...prev,
      paperSize: 'A4',
      direction: 'ltr',
      arabicTemplateStyle: 'pesantren-kmi',
      arabicNumeralStyle: 'western',
      optionLabelStyle: 'auto',
      fontFamily: 'Times New Roman',
      fontSize: 12,
      lineSpacing: 1.35,
      questionSpacing: 5,
      alignment: 'left',
      marginTop: 18,
      marginRight: 20,
      marginBottom: 18,
      marginLeft: 20,
    }));
    applyLatinKmiIdentityPreset();
    setIdentity((prev) => ({
      ...prev,
      instructions: '',
      includeStudentFields: false,
      questionCount: parsed.questions.length,
    }));
    setDocumentTitle('THE SECOND SEMESTER EXAMINATION');
    showToast('Contoh format ujian Bahasa Inggris (KMI) diterapkan');
  }, [applyLatinKmiIdentityPreset, showToast]);

  const handleLoadArabicSample = useCallback(() => {
    setRawText(SAMPLE_ARABIC_RAW_QUESTIONS);
    const parsed = parseQuestionsRuleBased(SAMPLE_ARABIC_RAW_QUESTIONS);
    setParsedQuestions(parsed.questions);
    setWarnings(parsed.warnings);
    setDetectedSubject(undefined);
    setParseEngine('rule-based');
    setFallbackNotice(undefined);
    setSelectedTemplateId('tpl_arab_standar');
    setFormatConfig((prev) => ({
      ...prev,
      paperSize: 'A4',
      direction: 'rtl',
      arabicTemplateStyle: 'pesantren-kmi',
      arabicNumeralStyle: 'eastern',
      optionLabelStyle: 'arabic',
      fontFamily: 'Amiri',
      fontSize: 13,
      lineSpacing: 1.6,
      questionSpacing: 6,
      alignment: 'right',
      marginTop: 20,
      marginRight: 22,
      marginBottom: 20,
      marginLeft: 22,
    }));
    applyArabicKmiIdentityPreset();
    setIdentity((prev) => ({
      ...prev,
      instructions: '',
      includeStudentFields: false,
      questionCount: parsed.questions.length,
    }));
    setDocumentTitle('الامتحان التحريري للفصل الدراسيّ الثاني');
    showToast('Contoh format ujian Bahasa Arab (KMI) diterapkan');
  }, [applyArabicKmiIdentityPreset, showToast]);

  const handleRawTextChange = (nextText: string) => {
    setRawText(nextText);
    if (settings.autoAnalyzeOnPaste) {
      const quick = parseQuestionsRuleBased(nextText);
      setParsedQuestions(quick.questions);
      setWarnings(quick.warnings);
      setDetectedSubject(quick.detectedSubject);
      setIdentity((prev) => ({ ...prev, questionCount: quick.questions.length }));
    }
  };

  const handleAnalyzeQuestions = async () => {
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setFallbackNotice(undefined);
    try {
      pushUndoSnapshot({ identity, formatConfig, parsedQuestions }, false);
      const result = await parseQuestionsSmart(rawText, true);
      setParsedQuestions(result.questions);
      setWarnings(result.warnings);
      setDetectedSubject(result.detectedSubject);
      setParseEngine(result.engine);
      setFallbackNotice(result.fallbackNotice);

      // Sync explicitly typed subject header only if present in raw text
      let explicitSubject: string | undefined;
      if (result.detectedSubject && result.detectedSubject.trim()) {
        const matched = subjects.find(
          (s) =>
            s.code.toLowerCase() === result.detectedSubject!.toLowerCase() ||
            s.shortName.toLowerCase() === result.detectedSubject!.toLowerCase() ||
            s.formalName.toLowerCase() === result.detectedSubject!.toLowerCase()
        );
        if (matched) {
          handleSelectSubject(matched.code);
        } else {
          explicitSubject = result.detectedSubject.trim();
        }
      }

      const arabicChars = (rawText.match(/[\u0600-\u06FF]/g) || []).length;
      if (arabicChars > 15 && formatConfig.direction !== 'rtl') {
        setSelectedTemplateId('tpl_arab_standar');
        setFormatConfig((prev) => ({
          ...prev,
          direction: 'rtl',
          arabicTemplateStyle: 'pesantren-kmi',
          arabicNumeralStyle: 'eastern',
          optionLabelStyle: 'arabic',
          fontFamily: 'Amiri',
          fontSize: 13,
          lineSpacing: 1.6,
          questionSpacing: 6,
          alignment: 'right',
        }));
        applyArabicKmiIdentityPreset(explicitSubject);
      }

      setIdentity((prev) => ({
        ...prev,
        questionCount: result.questions.length,
        ...(explicitSubject ? { subjectCode: explicitSubject, subjectFormalName: explicitSubject } : {}),
        ...(result.globalInstruction ? { instructions: result.globalInstruction } : {}),
      }));

      showToast(
        `${result.questions.length} soal berhasil dianalisis (${
          result.engine === 'gemini-ai' ? 'AI Gemini' : 'Rule Parser'
        })`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menganalisis soal.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyToTemplate = async () => {
    await handleAnalyzeQuestions();
  };

  const handleResetInput = () => {
    pushUndoSnapshot({ identity, formatConfig, parsedQuestions }, false);
    setRawText('');
    setParsedQuestions([]);
    setWarnings([]);
    setDetectedSubject(undefined);
    setFallbackNotice(undefined);
    setIdentity((prev) => ({ ...prev, questionCount: 0 }));
    showToast('Input soal dikosongkan');
  };

  const teacherAttrInfo = useMemo(
    () => ({
      displayName:
        userProfile?.displayName ||
        user?.displayName ||
        stripRichHtml(identity.teacherName || '') ||
        user?.email?.split('@')[0] ||
        'Ustadz / Guru',
      email: user?.email || '',
    }),
    [userProfile, user, identity.teacherName]
  );

  const saveDocumentRecord = useCallback(
    async (status: ExamDocument['status'], silent = false) => {
      const now = new Date().toISOString();
      const existing = documents.find((d) => d.id === currentDocId);
      const cleanSubjectFormal = stripRichHtml(identity.subjectFormalName || '').trim();
      const cleanSubjectCode = stripRichHtml(identity.subjectCode || '').trim();
      const cleanClass = stripRichHtml(identity.className || '').trim();

      // Top-level subjectCode & subjectFormalName satisfy firestore.rules size >= 1 while keeping identity.subjectFormalName untouched
      const docRecord: ExamDocument = {
        id: currentDocId,
        title: documentTitle.trim() || `Naskah ${cleanSubjectFormal || 'Ujian'}`,
        subjectCode: cleanSubjectCode || cleanSubjectFormal.slice(0, 40) || '-',
        subjectFormalName: cleanSubjectFormal || '-',
        className: cleanClass || '-',
        questionCount: parsedQuestions.length,
        templateId: activeTemplate.id,
        templateName: activeTemplate.name,
        status,
        rawText,
        identity: { ...identity, questionCount: parsedQuestions.length },
        formatConfig,
        parsedQuestions,
        warnings,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      setDocuments((prevDocs) => {
        const nextDocs = [docRecord, ...prevDocs.filter((d) => d.id !== docRecord.id)];
        saveLocalDocuments(nextDocs);
        return nextDocs;
      });
      await syncSaveDocumentToCloud(docRecord, teacherAttrInfo).catch((e) => {
        if (!silent) console.error(e);
      });
      setAutoSyncLabel('Tersimpan otomatis ke Guru & Admin');
      return docRecord;
    },
    [
      documents,
      currentDocId,
      identity,
      documentTitle,
      parsedQuestions,
      activeTemplate,
      rawText,
      formatConfig,
      warnings,
      teacherAttrInfo,
    ]
  );

  // Automatic debounced sync of teacher exam input to both Guru & Admin collections
  const autoSaveSignature = useMemo(
    () =>
      JSON.stringify({
        currentDocId,
        documentTitle,
        rawText,
        identity,
        formatConfig,
        qCount: parsedQuestions.length,
      }),
    [currentDocId, documentTitle, rawText, identity, formatConfig, parsedQuestions.length]
  );

  const initialMountRef = useRef(true);
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (!user || !user.emailVerified || showLandingPortal) return;
    if (parsedQuestions.length === 0 && rawText.trim().length < 5) return;

    setAutoSyncLabel('Menyinkronkan...');
    const timer = setTimeout(() => {
      saveDocumentRecord('draft', true).catch((e) => console.error(e));
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveSignature, user?.uid, user?.emailVerified, showLandingPortal]);

  const handleSaveDraft = async () => {
    const savedDoc = await saveDocumentRecord('draft');
    showToast('Draft dokumen tersimpan otomatis di sistem Guru & Admin');
    if (driveToken && savedDoc.parsedQuestions.length > 0) {
      const tpl =
        templates.find((t) => t.id === savedDoc.templateId) || activeTemplate;
      const docxPayload = await buildExamDocxDrivePayload({
        examDoc: savedDoc,
        template: tpl,
        logoDataUrl: settings.logoDataUrl,
      }).catch(() => null);
      if (docxPayload) {
        await syncPayloadsToDriveSafe([docxPayload], true);
      }
    }
  };

  const handleDuplicateCurrentDocument = async () => {
    const newId = `doc_${Date.now()}`;
    const now = new Date().toISOString();
    const copyTitle = `${documentTitle} (Salinan)`;
    const cleanSubjectFormal = stripRichHtml(identity.subjectFormalName || '').trim();
    const cleanSubjectCode = stripRichHtml(identity.subjectCode || '').trim();
    const cleanClass = stripRichHtml(identity.className || '').trim();

    const dup: ExamDocument = {
      id: newId,
      title: copyTitle,
      subjectCode: cleanSubjectCode || cleanSubjectFormal.slice(0, 40) || '-',
      subjectFormalName: cleanSubjectFormal || '-',
      className: cleanClass || '-',
      questionCount: parsedQuestions.length,
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      status: 'draft',
      rawText,
      identity: { ...identity, questionCount: parsedQuestions.length },
      formatConfig,
      parsedQuestions,
      warnings,
      createdAt: now,
      updatedAt: now,
    };
    const nextDocs = [dup, ...documents];
    setDocuments(nextDocs);
    saveLocalDocuments(nextDocs);
    setCurrentDocId(newId);
    setDocumentTitle(copyTitle);
    await syncSaveDocumentToCloud(dup, teacherAttrInfo).catch((e) => console.error(e));
    showToast('Dokumen berhasil diduplikasi');
  };

  const handleExportCurrentDocx = async () => {
    if (parsedQuestions.length === 0) return;
    setIsExportingDocx(true);
    try {
      const blob = await exportDocumentToDocx({
        template: activeTemplate,
        identity: { ...identity, questionCount: parsedQuestions.length },
        format: formatConfig,
        questions: parsedQuestions,
        logoDataUrl: settings.logoDataUrl,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeSub = sanitizeDocFilenamePart(
        identity.subjectCode || identity.subjectFormalName,
        'Ujian'
      );
      const safeCls = sanitizeDocFilenamePart(identity.className, 'Kelas');
      a.href = url;
      a.download = `Soal_${safeSub}_${safeCls}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      const savedDoc = await saveDocumentRecord('exported');
      showToast('File Word (.docx) berhasil dibuat dan diunduh');
      if (driveToken) {
        await syncPayloadsToDriveSafe(
          [
            {
              fileName: `Naskah_${safeSub}_${safeCls}_${savedDoc.id.replace(/^doc_/, '').slice(-6)}.docx`,
              mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              blob,
              description: `Naskah soal ${stripRichHtml(savedDoc.title)}`,
            },
          ],
          true
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor DOCX', 'error');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportCurrentPdf = async () => {
    if (parsedQuestions.length === 0) return;
    try {
      await exportDocumentToPdf({
        template: activeTemplate,
        identity: { ...identity, questionCount: parsedQuestions.length },
        format: formatConfig,
        questions: parsedQuestions,
        logoDataUrl: settings.logoDataUrl,
      });
      await saveDocumentRecord('exported');
      showToast('File PDF siap cetak berhasil diunduh');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor PDF', 'error');
    }
  };

  // Document History Handlers
  const handleCreateNewDocument = () => {
    const newId = `doc_${Date.now()}`;
    setCurrentDocId(newId);
    setRawText('');
    setParsedQuestions([]);
    setWarnings([]);
    setDetectedSubject(undefined);
    setUndoStack([]);
    setRedoStack([]);
    const cleanFormal = stripRichHtml(activeSubject?.formalName || '').trim();
    setDocumentTitle(cleanFormal ? `Naskah Soal — ${cleanFormal}` : 'Naskah Soal Baru');
    setIdentity(createDefaultIdentity(settings, activeSubject, 0));
    setActiveTab('editor');
  };

  const handleOpenDocument = (docItem: ExamDocument) => {
    setCurrentDocId(docItem.id);
    setDocumentTitle(docItem.title);
    setSelectedSubjectCode(docItem.subjectCode === '-' ? '' : docItem.subjectCode);
    const validTplId = templates.some((t) => t.id === docItem.templateId)
      ? docItem.templateId
      : docItem.formatConfig?.direction === 'rtl'
      ? 'tpl_arab_standar'
      : 'tpl_kmi_latin';
    setSelectedTemplateId(validTplId);
    setRawText(docItem.rawText);
    setParsedQuestions(docItem.parsedQuestions);
    setWarnings(docItem.warnings || []);
    setIdentity(docItem.identity);
    setFormatConfig(docItem.formatConfig || DEFAULT_FORMAT_CONFIG);
    setUndoStack([]);
    setRedoStack([]);
    setActiveTab('editor');
    showToast(`Membuka "${docItem.title}"`);
  };

  const handleDuplicateHistoryDoc = async (docItem: ExamDocument) => {
    const now = new Date().toISOString();
    const dup: ExamDocument = {
      ...docItem,
      id: `doc_${Date.now()}`,
      title: `${docItem.title} (Salinan)`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const nextDocs = [dup, ...documents];
    setDocuments(nextDocs);
    saveLocalDocuments(nextDocs);
    await syncSaveDocumentToCloud(dup, teacherAttrInfo).catch((e) => console.error(e));
    showToast('Dokumen diduplikasi ke riwayat');
  };

  const handleDeleteHistoryDoc = async (docId: string) => {
    const nextDocs = documents.filter((d) => d.id !== docId);
    setDocuments(nextDocs);
    saveLocalDocuments(nextDocs);
    await syncDeleteDocumentFromCloud(docId).catch((e) => console.error(e));
    showToast('Dokumen dihapus dari riwayat');
  };

  const handleDownloadHistoryDocx = async (docItem: ExamDocument) => {
    const tpl =
      templates.find((t) => t.id === docItem.templateId) ||
      (docItem.formatConfig?.direction === 'rtl' ? templates[1] : templates[0]) ||
      templates[0];
    const blob = await exportDocumentToDocx({
      template: tpl,
      identity: docItem.identity,
      format: docItem.formatConfig || DEFAULT_FORMAT_CONFIG,
      questions: docItem.parsedQuestions,
      logoDataUrl: settings.logoDataUrl,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeDocFilenamePart(docItem.title, 'Dokumen')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHistoryPdf = async (docItem: ExamDocument) => {
    const tpl =
      templates.find((t) => t.id === docItem.templateId) ||
      (docItem.formatConfig?.direction === 'rtl' ? templates[1] : templates[0]) ||
      templates[0];
    await exportDocumentToPdf({
      template: tpl,
      identity: docItem.identity,
      format: docItem.formatConfig || DEFAULT_FORMAT_CONFIG,
      questions: docItem.parsedQuestions,
      logoDataUrl: settings.logoDataUrl,
    });
  };

  // Template Handlers
  const handleSaveTemplate = async (tpl: TemplateDocument) => {
    const exists = templates.some((t) => t.id === tpl.id);
    const next = exists ? templates.map((t) => (t.id === tpl.id ? tpl : t)) : [tpl, ...templates];
    setTemplates(next);
    await saveLocalTemplates(next);
    await syncSaveTemplateToCloud(tpl).catch((e) => console.error(e));
    showToast(`Template "${tpl.name}" disimpan`);
  };

  const handleDeleteTemplate = async (tplId: string) => {
    const next = templates.filter((t) => t.id !== tplId);
    setTemplates(next);
    if (selectedTemplateId === tplId && next[0]) {
      setSelectedTemplateId(next[0].id);
    }
    await saveLocalTemplates(next);
    await syncDeleteTemplateFromCloud(tplId).catch((e) => console.error(e));
    showToast('Template dihapus');
  };

  // Subject Handlers
  const handleSaveSubject = async (sub: SubjectConfig) => {
    const exists = subjects.some((s) => s.id === sub.id);
    const next = exists ? subjects.map((s) => (s.id === sub.id ? sub : s)) : [...subjects, sub];
    setSubjects(next);
    saveLocalSubjects(next);
    if (sub.code === selectedSubjectCode) {
      setIdentity((prev) => ({
        ...prev,
        subjectFormalName: sub.formalName,
      }));
    }
    await syncSaveSubjectToCloud(sub).catch((e) => console.error(e));
  };

  const handleDeleteSubject = async (subjectId: string) => {
    const next = subjects.filter((s) => s.id !== subjectId);
    setSubjects(next);
    saveLocalSubjects(next);
    await syncDeleteSubjectFromCloud(subjectId).catch((e) => console.error(e));
    showToast('Mata pelajaran dihapus');
  };

  // Settings & Auth Handlers
  const handleSaveSettings = async (next: UserSettings) => {
    setSettings(next);
    saveLocalSettings(next);
    setIdentity((prev) => ({
      ...prev,
      schoolName: next.schoolName,
      schoolAddress: next.schoolAddress,
      examType: next.examType,
      academicYear: next.academicYear,
      semester: next.semester,
      teacherName: next.teacherName,
    }));
    await syncSaveSettingsToCloud(next).catch((e) => console.error(e));
    showToast('Pengaturan website & identitas default disimpan');
  };

  const handleUpdateSchoolLogo = async (logoDataUrl: string | undefined) => {
    const next = { ...settings, logoDataUrl, updatedAt: new Date().toISOString() };
    await handleSaveSettings(next);
  };

  // Subscribe to in-memory Google Drive access token
  useEffect(() => {
    return subscribeDriveToken((tok) => {
      setDriveToken(tok);
      if (!tok) {
        setDriveFolder(null);
        setDriveFiles([]);
      }
    });
  }, []);

  const refreshDriveFiles = useCallback(
    async (tokenOverride?: string) => {
      const tok = tokenOverride || driveToken;
      if (!tok) return;
      setIsDriveSyncing(true);
      try {
        const res = await listAppDriveFiles(tok);
        setDriveFolder(res.folder);
        setDriveFiles(res.files);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal memuat folder Drive', 'error');
      } finally {
        setIsDriveSyncing(false);
      }
    },
    [driveToken, showToast]
  );

  useEffect(() => {
    if (driveToken) {
      refreshDriveFiles(driveToken).catch(() => {});
    }
  }, [driveToken, refreshDriveFiles]);

  const handleConnectDrive = async () => {
    setIsDriveSyncing(true);
    try {
      const token = await connectGoogleDriveAccess();
      await refreshDriveFiles(token);
      showToast('Google Drive berhasil terhubung ke 1 folder khusus Anda');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghubungkan Google Drive',
        'error'
      );
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const syncPayloadsToDriveSafe = useCallback(
    async (payloads: DriveUploadPayload[], quietIfNoToken = false) => {
      if (payloads.length === 0) return;
      if (!driveToken) {
        if (!quietIfNoToken) {
          showToast('Silakan hubungkan Google Drive terlebih dahulu.', 'error');
        }
        return;
      }
      setIsDriveSyncing(true);
      try {
        const plan = await prepareDriveSyncPlan(driveToken, payloads);
        setDriveFolder(plan.folder);

        // New datasets/files that don't exist yet are saved immediately in the single folder
        for (const item of plan.newItems) {
          await createDriveFile(driveToken, plan.folder.id, item);
        }

        if (plan.conflicts.length > 0) {
          // Never overwrite existing Google Drive files silently: ask explicit confirmation!
          setPendingDriveConfirm({
            kind: 'overwrite',
            plan,
          });
        } else if (plan.newItems.length > 0) {
          await refreshDriveFiles(driveToken);
          showToast(
            `${plan.newItems.length} file baru tersimpan di folder Google Drive "${plan.folder.name}"`
          );
        }
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal menyinkronkan ke Google Drive',
          'error'
        );
      } finally {
        setIsDriveSyncing(false);
      }
    },
    [driveToken, refreshDriveFiles, showToast]
  );

  const handleSyncScoresToDrive = useCallback(
    async (scoresOverride?: StudentScoreEntry[], quietIfNoToken = false) => {
      const targetScores = scoresOverride || studentScores;
      if (targetScores.length === 0) {
        if (!quietIfNoToken) {
          showToast('Belum ada data nilai untuk disimpan ke Google Drive.', 'error');
        }
        return;
      }
      const payloads = await buildScoreDatasetPayloads({
        scores: targetScores,
        schoolName: settings.schoolName,
        exportedBy:
          userProfile?.displayName || user?.displayName || user?.email || 'Pengguna',
        includeMasterRecap: true,
      });
      await syncPayloadsToDriveSafe(payloads, quietIfNoToken);
    },
    [studentScores, settings.schoolName, userProfile, user, syncPayloadsToDriveSafe, showToast]
  );

  const handleSyncAllDataToDrive = useCallback(async () => {
    const allPayloads: DriveUploadPayload[] = [];
    if (studentScores.length > 0) {
      const scorePayloads = await buildScoreDatasetPayloads({
        scores: studentScores,
        schoolName: settings.schoolName,
        exportedBy:
          userProfile?.displayName || user?.displayName || user?.email || 'Pengguna',
        includeMasterRecap: true,
      });
      allPayloads.push(...scorePayloads);
    }

    const docsToSync =
      userProfile?.role === 'admin' && sharedDocuments.length > 0
        ? sharedDocuments
        : documents;

    for (const d of docsToSync) {
      const tpl =
        templates.find((t) => t.id === d.templateId) ||
        (d.formatConfig?.direction === 'rtl' ? templates[1] : templates[0]) ||
        activeTemplate;
      const docxPayload = await buildExamDocxDrivePayload({
        examDoc: d,
        template: tpl,
        logoDataUrl: settings.logoDataUrl,
      });
      allPayloads.push(docxPayload);
    }

    allPayloads.push(...buildMetadataBackupPayloads(settings, subjects));
    await syncPayloadsToDriveSafe(allPayloads, false);
  }, [
    studentScores,
    settings,
    userProfile,
    user,
    sharedDocuments,
    documents,
    templates,
    activeTemplate,
    subjects,
    syncPayloadsToDriveSafe,
  ]);

  const handleConfirmOverwriteDrive = async () => {
    if (!pendingDriveConfirm?.plan || !driveToken) return;
    setIsDriveSyncing(true);
    try {
      const { conflicts } = pendingDriveConfirm.plan;
      for (const c of conflicts) {
        await updateDriveFile(driveToken, c.existingFile.id, c.payload);
      }
      setPendingDriveConfirm(null);
      await refreshDriveFiles(driveToken);
      showToast(`${conflicts.length} file di Google Drive berhasil diperbarui`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui file Drive', 'error');
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleConfirmSaveAsNewDrive = async () => {
    if (!pendingDriveConfirm?.plan || !driveToken) return;
    setIsDriveSyncing(true);
    try {
      const { folder, conflicts } = pendingDriveConfirm.plan;
      for (const c of conflicts) {
        await createDriveFile(driveToken, folder.id, {
          ...c.payload,
          fileName: withTimestampSuffix(c.payload.fileName),
        });
      }
      setPendingDriveConfirm(null);
      await refreshDriveFiles(driveToken);
      showToast(`${conflicts.length} file versi baru tersimpan di folder Google Drive`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat file baru di Drive', 'error');
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleConfirmDeleteDrive = async () => {
    if (!pendingDriveConfirm?.deleteTarget || !driveToken) return;
    setIsDriveSyncing(true);
    try {
      const target = pendingDriveConfirm.deleteTarget;
      await deleteDriveFile(driveToken, target.id);
      setPendingDriveConfirm(null);
      await refreshDriveFiles(driveToken);
      showToast(`File "${target.name}" dihapus dari Google Drive`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus file Drive', 'error');
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSignInGoogle = async (role: UserRole = selectedPortalRole) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      setSelectedPortalRole(role);
      pendingProfileMetaRef.current = {
        role,
        enforceAdminCheck: role === 'admin',
      };
      const { accessToken } = await signInWithGoogleAndCaptureDriveToken();
      if (accessToken) {
        showToast('Berhasil masuk dengan email Google & Google Drive terhubung');
      } else {
        showToast('Berhasil masuk dengan email Google');
      }
    } catch (err) {
      pendingProfileMetaRef.current = null;
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignInEmailPassword = async (
    role: UserRole,
    emailInput: string,
    passwordInput: string
  ) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      setSelectedPortalRole(role);
      pendingProfileMetaRef.current = {
        role,
        enforceAdminCheck: role === 'admin',
      };
      const cred = await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      if (!cred.user.emailVerified) {
        setAuthNotice(
          `Email ${cred.user.email} belum terverifikasi. Silakan klik tautan verifikasi di kotak masuk Anda.`
        );
      } else {
        showToast('Berhasil masuk dengan email');
      }
    } catch (err) {
      pendingProfileMetaRef.current = null;
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegisterGuruEmail = async (
    emailInput: string,
    passwordInput: string,
    displayNameInput: string,
    subjectSpecialtyInput: string
  ) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      setSelectedPortalRole('guru');
      pendingProfileMetaRef.current = {
        role: 'guru',
        displayName: displayNameInput,
        subjectSpecialty: subjectSpecialtyInput,
      };
      const cred = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      if (displayNameInput) {
        await updateProfile(cred.user, { displayName: displayNameInput }).catch(() => {});
      }
      await sendEmailVerification(cred.user);
      setAuthNotice(
        `Akun berhasil dibuat. Email verifikasi telah dikirim ke ${emailInput}. Cek inbox/spam Anda lalu klik verifikasi.`
      );
    } catch (err) {
      pendingProfileMetaRef.current = null;
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetPassword = async (emailInput: string) => {
    if (!emailInput) {
      setAuthError('Masukkan alamat email terlebih dahulu untuk reset sandi.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendPasswordResetEmail(auth, emailInput);
      setAuthNotice(`Tautan reset kata sandi telah dikirim ke ${emailInput}.`);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice(`Email verifikasi baru dikirim ulang ke ${auth.currentUser.email}.`);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleReloadVerification = async () => {
    if (!auth.currentUser) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        const profile = await ensureUserProfile(selectedPortalRole);
        setUserProfile(profile);
        setUser({ ...auth.currentUser });
        setShowLandingPortal(false);
        showToast('Email berhasil diverifikasi! Selamat datang.');
      } else {
        setAuthError(
          'Email masih belum berstatus terverifikasi. Pastikan Anda sudah mengklik tautan di email.'
        );
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
      setUserProfile(null);
      setShowLandingPortal(true);
      setAuthError(null);
      setAuthNotice(null);
      showToast('Berhasil keluar dari akun');
    } finally {
      setAuthBusy(false);
    }
  };

  // Student Score Handlers (Auto-saves to local cache + centralized Firestore + Google Drive if connected)
  const handleSaveScore = async (entry: StudentScoreEntry) => {
    const exists = studentScores.some((s) => s.id === entry.id);
    const nextList = exists
      ? studentScores.map((s) => (s.id === entry.id ? entry : s))
      : [entry, ...studentScores];
    setStudentScores(nextList);
    saveLocalScores(nextList);
    await syncSaveStudentScore(entry);
    if (driveToken) {
      const sameDataset = nextList.filter(
        (s) =>
          s.subjectName.trim() === entry.subjectName.trim() &&
          s.className.trim() === entry.className.trim()
      );
      await handleSyncScoresToDrive(sameDataset, true);
    }
  };

  const handleSaveScoresBatch = async (entries: StudentScoreEntry[]) => {
    const nextList = [...entries, ...studentScores];
    setStudentScores(nextList);
    saveLocalScores(nextList);
    for (const entry of entries) {
      await syncSaveStudentScore(entry);
    }
    if (driveToken && entries.length > 0) {
      const sample = entries[0];
      const sameDataset = nextList.filter(
        (s) =>
          s.subjectName.trim() === sample.subjectName.trim() &&
          s.className.trim() === sample.className.trim()
      );
      await handleSyncScoresToDrive(sameDataset, true);
    }
  };

  const handleDeleteScore = async (scoreId: string) => {
    setStudentScores((prev) => {
      const next = prev.filter((s) => s.id !== scoreId);
      saveLocalScores(next);
      return next;
    });
    await syncDeleteStudentScore(scoreId);
    showToast('Data nilai dihapus');
  };

  const handleOpenSharedDocumentAsAdmin = (sharedDoc: SharedExamDocument) => {
    handleOpenDocument(sharedDoc);
  };

  const handleExportBackupJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      subjects,
      documents,
      studentScores,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_question_generator_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const effectiveRole: UserRole = userProfile?.role || 'guru';

  const navItems = useMemo(() => {
    if (effectiveRole === 'admin') {
      return [BASE_NAV_ITEMS[0], ADMIN_NAV_ITEM, ...BASE_NAV_ITEMS.slice(1)];
    }
    return BASE_NAV_ITEMS;
  }, [effectiveRole]);

  const activeNavMeta = navItems.find((n) => n.id === activeTab) || navItems[0];
  const headerSubjectDisplay = stripRichHtml(identity.subjectFormalName || '').trim();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[#0F1E3D] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">Memuat Portal Akademik...</p>
        </div>
      </div>
    );
  }

  if (showLandingPortal || !user || !user.emailVerified) {
    return (
      <ErrorBoundary>
        <LandingAuthPortal
          schoolName={settings.schoolName}
          user={user}
          userProfile={userProfile}
          selectedRole={selectedPortalRole}
          onSelectRole={(r) => {
            setSelectedPortalRole(r);
            setAuthError(null);
            setAuthNotice(null);
          }}
          onSignInGoogle={handleSignInGoogle}
          onSignInEmailPassword={handleSignInEmailPassword}
          onRegisterGuruEmail={handleRegisterGuruEmail}
          onResetPassword={handleResetPassword}
          onResendVerification={handleResendVerification}
          onReloadVerification={handleReloadVerification}
          onSignOut={handleSignOut}
          onEnterWorkspace={() => setShowLandingPortal(false)}
          authError={authError}
          authNotice={authNotice}
          isBusy={authBusy}
        />
      </ErrorBoundary>
    );
  }

  const driveSyncPanelNode = (
    <GoogleDriveSyncPanel
      driveConnected={Boolean(driveToken)}
      driveFolder={driveFolder}
      driveFiles={driveFiles}
      isSyncing={isDriveSyncing}
      hasScores={studentScores.length > 0}
      hasDocuments={documents.length > 0 || sharedDocuments.length > 0}
      onConnectDrive={handleConnectDrive}
      onRefreshFiles={() => refreshDriveFiles()}
      onSyncScoresToDrive={() => handleSyncScoresToDrive()}
      onSyncAllDataToDrive={handleSyncAllDataToDrive}
      onRequestDeleteFile={(file) =>
        setPendingDriveConfirm({
          kind: 'delete',
          deleteTarget: file,
        })
      }
    />
  );

  return (
    <ErrorBoundary>
      <div className="print-reset-layout min-h-screen bg-slate-50 flex">
        {/* Sidebar Navigation (Navy Institutional) */}
        <aside
          className={`no-print fixed inset-y-0 left-0 z-40 w-64 bg-[#0F1E3D] text-white flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 shrink-0 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div>
            {/* Brand Wordmark */}
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight text-white truncate font-display">
                  SMART QUESTION
                </div>
                <div className="text-[11px] font-medium text-sky-300 tracking-wider uppercase">
                  {effectiveRole === 'admin' ? 'Portal Admin' : 'Portal Ustadz / Guru'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="lg:hidden p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Primary Nav */}
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left ${
                      active
                        ? 'bg-sky-500 text-white font-semibold'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer: Account, Laman Utama & School Context */}
          <div className="p-4 border-t border-white/10 space-y-2.5">
            <div className="text-xs text-slate-300">
              <div className="font-semibold text-white truncate">
                {userProfile?.displayName || user?.displayName || settings.schoolName}
              </div>
              <div className="text-[11px] text-sky-300 font-medium mt-0.5 truncate">
                {effectiveRole === 'admin' ? 'Admin Sistem' : 'Ustadz / Guru'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {user ? user.email : 'Penyimpanan Lokal Aktif'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowLandingPortal(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Laman Utama
            </button>

            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar Akun
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSignInGoogle(selectedPortalRole)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30 rounded-lg transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Masuk dengan Email
              </button>
            )}
          </div>
        </aside>

        {/* Mobile Overlay */}
        {mobileNavOpen && (
          <div
            className="no-print fixed inset-0 bg-slate-950/40 z-30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Main Content Viewport */}
        <div className="print-reset-layout flex-1 flex flex-col min-w-0">
          {/* 3-Zone Top Bar */}
          <header className="no-print h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base font-bold text-slate-900 whitespace-nowrap shrink-0">
                {activeNavMeta.label}
              </h1>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-700">
                {headerSubjectDisplay || 'Mapel Diisi Guru'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">{activeTemplate.name}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{parsedQuestions.length} Soal</span>
              {autoSyncLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 font-medium">{autoSyncLabel}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCreateNewDocument}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Dokumen Baru
              </button>
            </div>
          </header>

          {/* Active Page View */}
          <main className="print-reset-layout flex-1 p-4 lg:p-6 overflow-x-hidden">
            {activeTab === 'dashboard' && (
              <DashboardView
                documents={documents}
                templates={templates}
                subjects={subjects}
                onNavigate={(tab) => setActiveTab(tab)}
                onCreateNewDocument={handleCreateNewDocument}
                onOpenDocument={handleOpenDocument}
                onDownloadDocx={handleDownloadHistoryDocx}
              />
            )}

            {activeTab === 'admin' && effectiveRole === 'admin' && (
              <AdminMonitorView
                schoolName={settings.schoolName}
                adminName={teacherAttrInfo.displayName}
                sharedDocuments={sharedDocuments}
                studentScores={studentScores}
                userProfiles={allUserProfiles}
                onOpenSharedDocument={handleOpenSharedDocumentAsAdmin}
                onDownloadSharedDocx={handleDownloadHistoryDocx}
                onDownloadSharedPdf={handleDownloadHistoryPdf}
                onGoToGradesTab={() => setActiveTab('grades')}
                onToast={showToast}
                drivePanel={driveSyncPanelNode}
              />
            )}

            {activeTab === 'editor' && (
              <QuestionWorkspace
                documentTitle={documentTitle}
                onChangeDocumentTitle={setDocumentTitle}
                rawText={rawText}
                onChangeRawText={handleRawTextChange}
                parsedQuestions={parsedQuestions}
                onChangeParsedQuestions={handleParsedQuestionsEdit}
                warnings={warnings}
                detectedSubject={detectedSubject}
                parseEngine={parseEngine}
                fallbackNotice={fallbackNotice}
                isAnalyzing={isAnalyzing}
                onAnalyze={handleAnalyzeQuestions}
                onApplyToTemplate={handleApplyToTemplate}
                onLoadEnglishSample={handleLoadEnglishSample}
                onLoadArabicSample={handleLoadArabicSample}
                onResetInput={handleResetInput}
                onSaveDraft={handleSaveDraft}
                onDuplicateDocument={handleDuplicateCurrentDocument}
                onExportDocx={handleExportCurrentDocx}
                onExportPdf={handleExportCurrentPdf}
                subjects={subjects}
                selectedSubjectCode={selectedSubjectCode}
                onSelectSubject={handleSelectSubject}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={handleSelectTemplate}
                identity={identity}
                onChangeIdentity={handleIdentityEdit}
                formatConfig={formatConfig}
                onChangeFormatConfig={handleFormatConfigEdit}
                logoDataUrl={settings.logoDataUrl}
                isExportingDocx={isExportingDocx}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
              />
            )}

            {activeTab === 'grades' && (
              <GradesRecapView
                role={effectiveRole}
                currentUserEmail={user?.email || ''}
                currentUserUid={user?.uid || ''}
                currentUserName={teacherAttrInfo.displayName}
                schoolName={settings.schoolName}
                defaultSemester={settings.semester}
                defaultAcademicYear={settings.academicYear}
                documents={effectiveRole === 'admin' && sharedDocuments.length > 0 ? sharedDocuments : documents}
                scores={studentScores}
                userProfiles={allUserProfiles}
                onSaveScore={handleSaveScore}
                onSaveScoresBatch={handleSaveScoresBatch}
                onDeleteScore={handleDeleteScore}
                onToast={showToast}
                drivePanel={driveSyncPanelNode}
              />
            )}

            {activeTab === 'templates' && (
              <TemplateManagerView
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={(id) => {
                  handleSelectTemplate(id);
                  showToast('Template aktif diperbarui');
                }}
                onSaveTemplate={handleSaveTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                schoolLogoDataUrl={settings.logoDataUrl}
                onUpdateSchoolLogo={handleUpdateSchoolLogo}
              />
            )}

            {activeTab === 'subjects' && (
              <SubjectSettingsView
                subjects={subjects}
                templates={templates}
                onSaveSubject={handleSaveSubject}
                onDeleteSubject={handleDeleteSubject}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                documents={documents}
                onOpenDocument={handleOpenDocument}
                onDuplicateDocument={handleDuplicateHistoryDoc}
                onDeleteDocument={handleDeleteHistoryDoc}
                onDownloadDocx={handleDownloadHistoryDocx}
                onDownloadPdf={handleDownloadHistoryPdf}
              />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                {driveSyncPanelNode}
                <WebsiteSettingsView
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  user={user}
                  onSignInGoogle={() => handleSignInGoogle(selectedPortalRole)}
                  onSignOut={handleSignOut}
                  onExportBackupJson={handleExportBackupJson}
                />
              </div>
            )}
          </main>
        </div>

        {/* Explicit Google Drive Confirmation Modal for Overwrite or Delete */}
        <DriveActionConfirmModal
          pending={pendingDriveConfirm}
          isBusy={isDriveSyncing}
          onConfirmOverwrite={handleConfirmOverwriteDrive}
          onConfirmSaveAsNew={handleConfirmSaveAsNewDrive}
          onConfirmDelete={handleConfirmDeleteDrive}
          onCancel={() => setPendingDriveConfirm(null)}
        />

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`no-print fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg border text-xs font-medium ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-[#0F1E3D] border-[#172B4D] text-white'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
