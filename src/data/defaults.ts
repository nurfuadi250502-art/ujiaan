import type {
  ExamIdentity,
  ExamTableLabels,
  FormatConfig,
  PlaceholderKey,
  SubjectConfig,
  TemplateDocument,
  UserSettings,
} from '../types/exam';

export const PLACEHOLDER_CATALOG: { key: PlaceholderKey; label: string; description: string }[] = [
  { key: '{{NAMA_SEKOLAH}}', label: 'Nama Sekolah / Ma’had', description: 'Nama satuan pendidikan pada kop atas' },
  { key: '{{ALAMAT_SEKOLAH}}', label: 'Sub-judul Lembaga', description: 'Keterangan lembaga / kampus' },
  { key: '{{JENIS_UJIAN}}', label: 'Jenis Ujian', description: 'Baris judul utama ujian' },
  { key: '{{MATA_PELAJARAN}}', label: 'Mata Pelajaran', description: 'Diisi langsung oleh guru' },
  { key: '{{KELAS}}', label: 'Kelas', description: 'Tingkat atau rombel peserta ujian' },
  { key: '{{SEMESTER}}', label: 'Semester', description: 'Ganjil atau Genap' },
  { key: '{{TAHUN_AJARAN}}', label: 'Tahun Ajaran', description: 'Contoh: 1448/2026' },
  { key: '{{HARI_TANGGAL}}', label: 'Hari & Tanggal', description: 'Jadwal pelaksanaan ujian' },
  { key: '{{WAKTU}}', label: 'Alokasi Waktu', description: 'Durasi pengerjaan (mis. 90 minutes / ٩٠ دقيقة)' },
  { key: '{{NAMA_GURU}}', label: 'Nama Guru', description: 'Penyusun naskah soal' },
  { key: '{{JUMLAH_SOAL}}', label: 'Jumlah Soal', description: 'Terhitung otomatis dari soal yang terdeteksi' },
  { key: '{{PETUNJUK_PENGERJAAN}}', label: 'Petunjuk Pengerjaan', description: 'Instruksi umum untuk peserta ujian' },
  { key: '{{DAFTAR_SOAL}}', label: 'Area Daftar Soal', description: 'Lokasi utama penyisipan seluruh soal terformat' },
];

// Dikosongkan secara default agar guru dapat menginput mata pelajaran sendiri secara bebas
export const DEFAULT_SUBJECTS: SubjectConfig[] = [];

export const ALLOWED_BUILTIN_TEMPLATE_IDS = ['tpl_kmi_latin', 'tpl_arab_standar'] as const;

// Hanya menyisakan 2 template resmi sesuai referensi (Bahasa Inggris/Latin LTR & Bahasa Arab RTL)
export const DEFAULT_TEMPLATES: TemplateDocument[] = [
  {
    id: 'tpl_kmi_latin',
    name: 'Template Ujian KMI / Bahasa Inggris & Umum (LTR - A4)',
    description:
      'Format resmi KMI Latin (LTR A4): kop 4 baris rata tengah, tabel identitas 3 baris berbingkai tebal (SUBJECT, DAY, Tanggal Hijriah & Masehi, CLASS, PERIOD, Durasi, TEACHER), dan bagian soal A/B/C.',
    sourceType: 'builtin',
    direction: 'ltr',
    paperSize: 'A4',
    headerTitle: 'THE SECOND SEMESTER EXAMINATION',
    headerSubtitle: 'ISLAMIC TEACHERS’ TRAINING COLLEGE',
    kopLines: [
      'THE SECOND SEMESTER EXAMINATION',
      'ISLAMIC TEACHERS’ TRAINING COLLEGE',
      'DARUL ITTIHAD MODERN ISLAMIC INSTITUTION',
      'YEAR 1448/2026',
    ],
    placeholdersDetected: [
      '{{NAMA_SEKOLAH}}',
      '{{JENIS_UJIAN}}',
      '{{MATA_PELAJARAN}}',
      '{{KELAS}}',
      '{{TAHUN_AJARAN}}',
      '{{HARI_TANGGAL}}',
      '{{WAKTU}}',
      '{{NAMA_GURU}}',
      '{{DAFTAR_SOAL}}',
    ],
    placeholderMappings: {
      '{{NAMA_SEKOLAH}}': '{{NAMA_SEKOLAH}}',
      '{{JENIS_UJIAN}}': '{{JENIS_UJIAN}}',
      '{{MATA_PELAJARAN}}': '{{MATA_PELAJARAN}}',
      '{{KELAS}}': '{{KELAS}}',
      '{{TAHUN_AJARAN}}': '{{TAHUN_AJARAN}}',
      '{{HARI_TANGGAL}}': '{{HARI_TANGGAL}}',
      '{{WAKTU}}': '{{WAKTU}}',
      '{{NAMA_GURU}}': '{{NAMA_GURU}}',
      '{{DAFTAR_SOAL}}': '{{DAFTAR_SOAL}}',
    },
    structure: {
      hasKopSekolah: true,
      hasLogo: false,
      hasSchoolName: true,
      hasExamIdentity: true,
      hasSubject: true,
      hasClass: true,
      hasSemester: true,
      hasAcademicYear: true,
      hasDate: true,
      hasDuration: true,
      hasParticipantFields: false,
      hasInstructions: false,
      hasQuestionArea: true,
      hasPageNumbers: false,
    },
    margins: { top: 18, right: 20, bottom: 18, left: 20 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl_arab_standar',
    name: 'Template Ujian KMI / Bahasa Arab (RTL - A4)',
    description:
      'Format resmi ujian KMI / Pesantren (RTL A4): judul terpusat 3 baris, tabel identitas 3 baris (المادة، اليوم، التاريخ الهجري والميلادي، الفصل، الحصّة، الزمن، المعلّم)، bagian لالف/الباء/الجيم، dan penutup terpusat.',
    sourceType: 'builtin',
    direction: 'rtl',
    paperSize: 'A4',
    headerTitle: 'الامتحان التحريري للفصل الدراسيّ الثاني بكلّيّة المعلّمين الإسلاميّة',
    headerSubtitle: 'معهد دار الاتّحاد جمبير للتربية الإسلاميّة الحديثة',
    kopLines: [
      'الامتحان التحريري للفصل الدراسيّ الثاني بكلّيّة المعلّمين الإسلاميّة',
      'معهد دار الاتّحاد جمبير للتربية الإسلاميّة الحديثة',
      'عام ١٤٤٨/٢٠٢٦',
    ],
    placeholdersDetected: [
      '{{NAMA_SEKOLAH}}',
      '{{JENIS_UJIAN}}',
      '{{MATA_PELAJARAN}}',
      '{{KELAS}}',
      '{{TAHUN_AJARAN}}',
      '{{HARI_TANGGAL}}',
      '{{WAKTU}}',
      '{{NAMA_GURU}}',
      '{{DAFTAR_SOAL}}',
    ],
    placeholderMappings: {
      '{{NAMA_SEKOLAH}}': '{{NAMA_SEKOLAH}}',
      '{{JENIS_UJIAN}}': '{{JENIS_UJIAN}}',
      '{{MATA_PELAJARAN}}': '{{MATA_PELAJARAN}}',
      '{{KELAS}}': '{{KELAS}}',
      '{{TAHUN_AJARAN}}': '{{TAHUN_AJARAN}}',
      '{{HARI_TANGGAL}}': '{{HARI_TANGGAL}}',
      '{{WAKTU}}': '{{WAKTU}}',
      '{{NAMA_GURU}}': '{{NAMA_GURU}}',
      '{{DAFTAR_SOAL}}': '{{DAFTAR_SOAL}}',
    },
    structure: {
      hasKopSekolah: true,
      hasLogo: false,
      hasSchoolName: true,
      hasExamIdentity: true,
      hasSubject: true,
      hasClass: true,
      hasSemester: true,
      hasAcademicYear: true,
      hasDate: true,
      hasDuration: true,
      hasParticipantFields: false,
      hasInstructions: false,
      hasQuestionArea: true,
      hasPageNumbers: false,
    },
    margins: { top: 20, right: 22, bottom: 20, left: 22 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const LATIN_KMI_TABLE_LABELS: ExamTableLabels = {
  subject: 'SUBJECT',
  day: 'DAY',
  classLabel: 'CLASS',
  period: 'PERIOD',
  teacher: 'TEACHER',
};

export const ARABIC_KMI_TABLE_LABELS: ExamTableLabels = {
  subject: 'المادة',
  day: 'اليوم',
  classLabel: 'الفصل',
  period: 'الحصّة',
  teacher: 'المعلّم',
};

export const LATIN_KMI_IDENTITY_DEFAULTS = {
  schoolName: 'DARUL ITTIHAD MODERN ISLAMIC INSTITUTION',
  schoolAddress: 'ISLAMIC TEACHERS’ TRAINING COLLEGE',
  examType: 'THE SECOND SEMESTER EXAMINATION',
  academicYear: 'YEAR 1448/2026',
  headerLines: [
    'THE SECOND SEMESTER EXAMINATION',
    'ISLAMIC TEACHERS’ TRAINING COLLEGE',
    'DARUL ITTIHAD MODERN ISLAMIC INSTITUTION',
    'YEAR 1448/2026',
  ],
  tableLabels: { ...LATIN_KMI_TABLE_LABELS },
  className: 'THREE',
  examDay: 'WEDNESDAY',
  hijriDate: '23 MUHARRAM 1448',
  examDate: '8 JULI 2026',
  sessionPeriod: 'SECOND',
  duration: '90 minutes',
  teacherName: 'UST. FAREL',
  closingText: '',
};

export const ARABIC_KMI_IDENTITY_DEFAULTS = {
  schoolName: 'معهد دار الاتّحاد جمبير للتربية الإسلاميّة الحديثة',
  schoolAddress: '',
  examType: 'الامتحان التحريري للفصل الدراسيّ الثاني بكلّيّة المعلّمين الإسلاميّة',
  academicYear: '١٤٤٨/٢٠٢٦',
  headerLines: [
    'الامتحان التحريري للفصل الدراسيّ الثاني بكلّيّة المعلّمين الإسلاميّة',
    'معهد دار الاتّحاد جمبير للتربية الإسلاميّة الحديثة',
    'عام ١٤٤٨/٢٠٢٦',
  ],
  tableLabels: { ...ARABIC_KMI_TABLE_LABELS },
  className: 'الثالث',
  examDay: 'السبت',
  hijriDate: '١٩ محرم ١٤٤٨',
  examDate: '٤ يوليو ٢٠٢٦',
  sessionPeriod: 'الثانية',
  duration: '٩٠ دقيقة',
  teacherName: 'الأستاذ شمس الرجال',
  closingText: '--مع أطيب تمنياتنا بالتوفيق و النجاح--',
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  schoolName: LATIN_KMI_IDENTITY_DEFAULTS.schoolName,
  schoolAddress: LATIN_KMI_IDENTITY_DEFAULTS.schoolAddress,
  examType: LATIN_KMI_IDENTITY_DEFAULTS.examType,
  academicYear: LATIN_KMI_IDENTITY_DEFAULTS.academicYear,
  semester: 'Genap',
  defaultDuration: LATIN_KMI_IDENTITY_DEFAULTS.duration,
  teacherName: LATIN_KMI_IDENTITY_DEFAULTS.teacherName,
  paperSize: 'A4',
  fontFamily: 'Times New Roman',
  fontSize: 12,
  preserveContentStrict: true,
  autoAnalyzeOnPaste: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_FORMAT_CONFIG: FormatConfig = {
  paperSize: 'A4',
  direction: 'ltr',
  arabicTemplateStyle: 'pesantren-kmi',
  arabicNumeralStyle: 'western',
  optionLabelStyle: 'auto',
  fontFamily: 'Times New Roman',
  fontSize: 12,
  questionSpacing: 5,
  optionSpacing: 3,
  lineSpacing: 1.35,
  marginTop: 18,
  marginRight: 20,
  marginBottom: 18,
  marginLeft: 20,
  numberPosition: 'left-hang',
  numberFormat: 'dot',
  stemBold: false,
  stemItalic: false,
  alignment: 'left',
  optionColumns: 1,
};

export const createDefaultIdentity = (
  _settings: UserSettings,
  subject?: SubjectConfig,
  questionCount = 0
): ExamIdentity => ({
  schoolName: LATIN_KMI_IDENTITY_DEFAULTS.schoolName,
  schoolAddress: LATIN_KMI_IDENTITY_DEFAULTS.schoolAddress,
  examType: LATIN_KMI_IDENTITY_DEFAULTS.examType,
  headerLines: [...LATIN_KMI_IDENTITY_DEFAULTS.headerLines],
  tableLabels: { ...LATIN_KMI_TABLE_LABELS },
  subjectCode: subject?.code || '',
  subjectFormalName: subject?.formalName || '',
  className: LATIN_KMI_IDENTITY_DEFAULTS.className,
  semester: 'Genap',
  academicYear: LATIN_KMI_IDENTITY_DEFAULTS.academicYear,
  examDay: LATIN_KMI_IDENTITY_DEFAULTS.examDay,
  hijriDate: LATIN_KMI_IDENTITY_DEFAULTS.hijriDate,
  examDate: LATIN_KMI_IDENTITY_DEFAULTS.examDate,
  sessionPeriod: LATIN_KMI_IDENTITY_DEFAULTS.sessionPeriod,
  closingText: LATIN_KMI_IDENTITY_DEFAULTS.closingText,
  duration: subject?.defaultDuration || LATIN_KMI_IDENTITY_DEFAULTS.duration,
  teacherName: LATIN_KMI_IDENTITY_DEFAULTS.teacherName,
  questionCount,
  instructions: subject?.defaultInstructions || '',
  includeStudentFields: false,
});

export const SAMPLE_RAW_QUESTIONS = `A. Answer the questions below correctly !!!
1. Where do the two gentlemen go?
2. Where is the Zoo situated?
3. What animals do they see in Regent's Park?
4. What wild birds do they see on entering the Zoo?
5. What remark does Mr. B. pass about them?
6. Did they hear the roaring of the lions?
7. Has a lioness a mane?

B. Ask the question for the following answers !!!
1. They go to the country.
2. No, not very far.
3. They are near London.
4. We see cattle and sheep grazing.
5. Because they are very fine cattle.
6. From Richmond to Oxford.
7. In the south of England.

C. Translate to Indonesian !!!
1. Country.
2. Domestic animals.
3. Wild animals.
4. Gentlemen.
5. City.
6. You have a good memory.`;

export const SAMPLE_ARABIC_RAW_QUESTIONS = `لالف ) أجب هذه الأسئلة الآتية مطابق بما درست في المطالعة
١. ماذا أراد الأمير ؟ عمن سأل في أول مرة ؟
٢. لماذا أطلق الأمير الرجل الاخير ؟ ولماذا اثبت الآخرين ؟
٣. ماذا للتاجر ؟ وماذا وضع التاجر على ظهرهما ؟
٤. هل يجوز لنا ان نقلد كل ما رأيناه ؟ لماذا ؟
٥. ماذا عمل الرجل ؟ وماذا ينقص من كماله ؟
٦. من اتى لما فكر الرجل في هذا الأمر ؟ لماذا يطلب ان يضرب ؟
٧. لأي شيئ اجتمع الحيوان في عرين ألأسد ؟
٨. عم يتحدثون بعد العزاء ؟

الباء ) اكتب جملة تشبه هذه الجمل باستعمال الكلمات التي تحتها خط
١. <u>ما الذي</u> جنيته <u>حتى</u> حل بك هذا العقاب
٢. <u>ولا اريد لها ثمنا</u> أقل من أن أضرب مائة سوط
٣. <u>وبينما هو</u> سائر بهما <u>اذ</u> مر بترعة
٤. <u>ان ما يصلح لشخص لا يجب ان يصلح لغيره</u>

الجيم ) اكتب معاني هذه الكلمات ثم ضعها في الجملة المفيدة
١. ذوبان
٢. بين أظهر
٣. يتفقد
٤. كف
٥. صمم`;
