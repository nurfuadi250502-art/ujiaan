export type QuestionType =
  | 'pilihan_ganda'
  | 'pilihan_ganda_kompleks'
  | 'benar_salah'
  | 'menjodohkan'
  | 'isian_singkat'
  | 'uraian'
  | 'esai';

export type PaperSize = 'A4' | 'F4' | 'Letter';

export type TextDirection = 'ltr' | 'rtl';

export type ArabicNumeralStyle = 'western' | 'eastern';

export type DocumentStatus = 'draft' | 'ready' | 'exported';

export interface ParsedOption {
  label: string; // e.g., 'A', 'B', 'C', 'D', 'E' or 'أ', 'ب', 'ج', 'د', 'هـ'
  originalMarker: string; // e.g., 'A.', 'a)', 'أ.'
  text: string;
}

export interface ParsedQuestion {
  id: string;
  number: number | null;
  originalNumberLabel: string; // e.g., '1.', '1)', 'Soal 1.', '١.'
  sectionTitle?: string; // e.g., 'لالف ) أجب هذه الأسئلة الآتية...'
  type: QuestionType;
  stem: string;
  options: ParsedOption[];
  instruction?: string;
  stimulus?: string;
  subquestions?: string[];
  hasTable?: boolean;
  hasFormula?: boolean;
  hasImageRef?: boolean;
  needsManualReview: boolean;
  reviewReason?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  rawBlock: string;
}

export interface ParserWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  questionNumber?: number | null;
  message: string;
}

export interface ParseResult {
  detectedSubject?: string;
  globalInstruction?: string;
  questions: ParsedQuestion[];
  warnings: ParserWarning[];
  engine: 'gemini-ai' | 'rule-based';
  fallbackNotice?: string;
}

export interface ExamTableLabels {
  subject: string;
  day: string;
  classLabel: string;
  period: string;
  teacher: string;
}

export interface ExamIdentity {
  schoolName: string;
  schoolAddress: string;
  examType: string;
  headerLines?: string[];
  tableLabels?: ExamTableLabels;
  subjectCode: string;
  subjectFormalName: string;
  className: string;
  semester: string;
  academicYear: string;
  examDate: string;
  examDay?: string;
  hijriDate?: string;
  sessionPeriod?: string;
  closingText?: string;
  duration: string;
  teacherName: string;
  questionCount: number;
  instructions: string;
  includeStudentFields: boolean;
}

export interface FormatConfig {
  paperSize: PaperSize;
  direction: TextDirection;
  arabicTemplateStyle?: 'pesantren-kmi' | 'standard';
  arabicNumeralStyle: ArabicNumeralStyle;
  optionLabelStyle: 'auto' | 'latin' | 'arabic';
  fontFamily:
    | 'Times New Roman'
    | 'Calibri'
    | 'Arial'
    | 'Georgia'
    | 'Plus Jakarta Sans'
    | 'Amiri'
    | 'Noto Naskh Arabic'
    | 'Traditional Arabic';
  fontSize: number; // pt
  questionSpacing: number; // px
  optionSpacing: number; // px
  lineSpacing: number; // 1.15, 1.35, 1.5, 1.75
  marginTop: number; // mm
  marginRight: number; // mm
  marginBottom: number; // mm
  marginLeft: number; // mm
  numberPosition: 'left-hang' | 'inline';
  numberFormat: 'dot' | 'paren' | 'soal-dot' | 'keep-original';
  stemBold: boolean;
  stemItalic: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
  optionColumns: 1 | 2;
}

export type PlaceholderKey =
  | '{{NAMA_SEKOLAH}}'
  | '{{ALAMAT_SEKOLAH}}'
  | '{{JENIS_UJIAN}}'
  | '{{MATA_PELAJARAN}}'
  | '{{KELAS}}'
  | '{{SEMESTER}}'
  | '{{TAHUN_AJARAN}}'
  | '{{HARI_TANGGAL}}'
  | '{{WAKTU}}'
  | '{{NAMA_GURU}}'
  | '{{JUMLAH_SOAL}}'
  | '{{PETUNJUK_PENGERJAAN}}'
  | '{{DAFTAR_SOAL}}';

export interface TemplateStructureCheck {
  hasKopSekolah: boolean;
  hasLogo: boolean;
  hasSchoolName: boolean;
  hasExamIdentity: boolean;
  hasSubject: boolean;
  hasClass: boolean;
  hasSemester: boolean;
  hasAcademicYear: boolean;
  hasDate: boolean;
  hasDuration: boolean;
  hasParticipantFields: boolean;
  hasInstructions: boolean;
  hasQuestionArea: boolean;
  hasPageNumbers: boolean;
}

export interface TemplateDocument {
  id: string;
  name: string;
  description: string;
  sourceType: 'builtin' | 'docx' | 'doc' | 'pdf';
  direction?: TextDirection;
  paperSize: PaperSize;
  headerTitle: string;
  headerSubtitle: string;
  kopLines: string[];
  placeholdersDetected: string[];
  placeholderMappings: Record<string, string>; // key: PlaceholderKey, value: target text in uploaded file or placeholder itself
  docxBase64?: string;
  pdfDataUrl?: string;
  storageUrl?: string;
  extractedPreviewText?: string;
  extractedHtmlPreview?: string;
  logoDataUrl?: string;
  structure: TemplateStructureCheck;
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SubjectConfig {
  id: string;
  code: string;
  shortName: string;
  formalName: string;
  defaultTemplateId: string;
  defaultDuration: string;
  defaultInstructions: string;
  isCustom: boolean;
  updatedAt: string;
}

export interface ExamDocument {
  id: string;
  title: string;
  subjectCode: string;
  subjectFormalName: string;
  className: string;
  questionCount: number;
  templateId: string;
  templateName: string;
  status: DocumentStatus;
  rawText: string;
  identity: ExamIdentity;
  formatConfig: FormatConfig;
  parsedQuestions: ParsedQuestion[];
  warnings: ParserWarning[];
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  schoolName: string;
  schoolAddress: string;
  examType: string;
  academicYear: string;
  semester: string;
  defaultDuration: string;
  teacherName: string;
  paperSize: PaperSize;
  fontFamily: FormatConfig['fontFamily'];
  fontSize: number;
  preserveContentStrict: boolean;
  autoAnalyzeOnPaste: boolean;
  logoDataUrl?: string;
  updatedAt: string;
}

export interface AccuracyCheckItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: 'ok' | 'warning' | 'error';
}

export interface DiffRow {
  lineNumber: number;
  rawLine: string;
  formattedLine: string;
  status: 'identical' | 'structured' | 'flagged' | 'missing';
}

export interface AccuracyReport {
  overallVerified: boolean;
  preservationScore: number; // 0..100
  checks: AccuracyCheckItem[];
  diffRows: DiffRow[];
  manualReviewCount: number;
}
