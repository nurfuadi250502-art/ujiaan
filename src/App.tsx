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
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
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
  SubjectConfig,
  TemplateDocument,
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
  loadLocalDocuments,
  loadLocalSettings,
  loadLocalSubjects,
  loadLocalTemplates,
  saveLocalDocuments,
  saveLocalSettings,
  saveLocalSubjects,
  saveLocalTemplates,
  syncDeleteDocumentFromCloud,
  syncDeleteSubjectFromCloud,
  syncDeleteTemplateFromCloud,
  syncLoadAllFromCloud,
  syncSaveDocumentToCloud,
  syncSaveSettingsToCloud,
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

type NavTab = 'dashboard' | 'editor' | 'templates' | 'subjects' | 'history' | 'settings';

interface EditorSnapshot {
  identity: ExamIdentity;
  formatConfig: FormatConfig;
  parsedQuestions: ParsedQuestion[];
}

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'editor', label: 'Input Soal', icon: FileEdit },
  { id: 'templates', label: 'Template Dokumen', icon: FolderKanban },
  { id: 'subjects', label: 'Pengaturan Mata Pelajaran', icon: BookOpen },
  { id: 'history', label: 'Riwayat Dokumen', icon: History },
  { id: 'settings', label: 'Pengaturan Website', icon: Settings },
];

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

  // Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);

  // Persistent Collections (Default subjects empty so teacher enters subject directly; strictly 2 KMI templates)
  const [settings, setSettings] = useState<UserSettings>(() => loadLocalSettings());
  const [subjects, setSubjects] = useState<SubjectConfig[]>(() => loadLocalSubjects());
  const [templates, setTemplates] = useState<TemplateDocument[]>(DEFAULT_TEMPLATES);
  const [documents, setDocuments] = useState<ExamDocument[]>(() => loadLocalDocuments());

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

  // Listen to Firebase Auth & sync from Cloud Firestore when signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.emailVerified) {
        try {
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
        } catch (err) {
          console.error('Cloud sync failed:', err);
        }
      }
    });
    return () => unsub();
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

  const saveDocumentRecord = async (status: ExamDocument['status']) => {
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

    const nextDocs = [docRecord, ...documents.filter((d) => d.id !== docRecord.id)];
    setDocuments(nextDocs);
    saveLocalDocuments(nextDocs);
    await syncSaveDocumentToCloud(docRecord).catch((e) => console.error(e));
    return docRecord;
  };

  const handleSaveDraft = async () => {
    await saveDocumentRecord('draft');
    showToast('Draft dokumen berhasil disimpan');
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
    await syncSaveDocumentToCloud(dup).catch((e) => console.error(e));
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
      await saveDocumentRecord('exported');
      showToast('File Word (.docx) berhasil dibuat dan diunduh');
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
    await syncSaveDocumentToCloud(dup).catch((e) => console.error(e));
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

  const handleSignInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Berhasil masuk dengan akun Google');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal masuk dengan Google', 'error');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    showToast('Berhasil keluar dari akun');
  };

  const handleExportBackupJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      subjects,
      documents,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_question_generator_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab)!;
  const headerSubjectDisplay = stripRichHtml(identity.subjectFormalName || '').trim();

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
                  Document Generator
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
              {NAV_ITEMS.map((item) => {
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

          {/* Sidebar Footer: Account & School Context */}
          <div className="p-4 border-t border-white/10 space-y-3">
            <div className="text-xs text-slate-300">
              <div className="font-semibold text-white truncate">{settings.schoolName}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {user ? user.email : 'Penyimpanan Lokal Aktif'}
              </div>
            </div>
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
                onClick={handleSignInGoogle}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30 rounded-lg transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sinkronisasi Google
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
              <span className="truncate max-w-[240px]">{activeTemplate.name}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{parsedQuestions.length} Soal</span>
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
              <WebsiteSettingsView
                settings={settings}
                onSaveSettings={handleSaveSettings}
                user={user}
                onSignInGoogle={handleSignInGoogle}
                onSignOut={handleSignOut}
                onExportBackupJson={handleExportBackupJson}
              />
            )}
          </main>
        </div>

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
