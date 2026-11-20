import type {
  AccuracyCheckItem,
  AccuracyReport,
  ArabicNumeralStyle,
  DiffRow,
  ExamIdentity,
  ParsedQuestion,
  ParserWarning,
  TemplateDocument,
} from '../types/exam';
import { containsArabicText, formatNumberStringByStyle, stripUnderlineMarkup } from './ruleParser';

function normalizeTokens(text: string): string[] {
  return stripUnderlineMarkup(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic diacritics only for duplicate similarity key
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function formatQuestionNumberLabel(
  q: ParsedQuestion,
  index: number,
  numberFormat: 'dot' | 'paren' | 'soal-dot' | 'keep-original',
  numeralStyle: ArabicNumeralStyle = 'western',
  isRtl = false
): string {
  const num = q.number ?? index + 1;
  const numStr = formatNumberStringByStyle(num, numeralStyle);
  switch (numberFormat) {
    case 'dot':
      return `${numStr}.`;
    case 'paren':
      return `${numStr})`;
    case 'soal-dot':
      return isRtl ? `السؤال ${numStr}.` : `Soal ${numStr}.`;
    case 'keep-original':
      return q.originalNumberLabel || `${numStr}.`;
  }
}

export function buildAccuracyReport(params: {
  rawText: string;
  detectedSubject?: string;
  questions: ParsedQuestion[];
  warnings: ParserWarning[];
  identity: ExamIdentity;
  template: TemplateDocument;
  numberFormat: 'dot' | 'paren' | 'soal-dot' | 'keep-original';
}): AccuracyReport {
  const { rawText, detectedSubject, questions, warnings, identity, template, numberFormat } = params;

  const checks: AccuracyCheckItem[] = [];

  // 1. Question count
  const hasQuestions = questions.length > 0;
  checks.push({
    id: 'chk_count',
    label: 'Jumlah Soal Terdeteksi',
    passed: hasQuestions,
    detail: hasQuestions
      ? `${questions.length} soal berhasil dikenali dari teks mentah.`
      : 'Belum ada soal yang berhasil diproses.',
    severity: hasQuestions ? 'ok' : 'error',
  });

  // 2. Sequential numbering
  const gapOrDupWarnings = warnings.filter(
    (w) => w.code === 'MISSING_NUMBER' || w.code === 'DUPLICATE_NUMBER'
  );
  checks.push({
    id: 'chk_sequence',
    label: 'Urutan Nomor Soal',
    passed: gapOrDupWarnings.length === 0 && hasQuestions,
    detail:
      gapOrDupWarnings.length === 0
        ? hasQuestions
          ? 'Seluruh nomor soal tersusun berurutan tanpa loncatan atau duplikasi.'
          : 'Menunggu input soal.'
        : gapOrDupWarnings.map((w) => w.message).join(' '),
    severity: gapOrDupWarnings.length === 0 ? (hasQuestions ? 'ok' : 'warning') : 'warning',
  });

  // 3. Option completeness
  const incompleteMc = questions.filter(
    (q) =>
      (q.type === 'pilihan_ganda' || q.type === 'pilihan_ganda_kompleks') &&
      q.options.length < 3
  );
  checks.push({
    id: 'chk_options',
    label: 'Kelengkapan Pilihan Jawaban',
    passed: incompleteMc.length === 0 && hasQuestions,
    detail:
      incompleteMc.length === 0
        ? 'Seluruh soal pilihan ganda memiliki opsi jawaban yang memadai.'
        : `${incompleteMc.length} soal memiliki pilihan jawaban kurang lengkap (Nomor: ${incompleteMc
            .map((q) => q.number ?? '?')
            .join(', ')}).`,
    severity: incompleteMc.length === 0 ? (hasQuestions ? 'ok' : 'warning') : 'warning',
  });

  // 4. Content verbatim preservation (stems + options vs rawText)
  const rawNormalized = stripUnderlineMarkup(rawText).replace(/\s+/g, ' ').toLowerCase();
  let exactStemMatches = 0;
  let exactOptionMatches = 0;
  let totalOptions = 0;

  for (const q of questions) {
    const stemNorm = stripUnderlineMarkup(q.stem).replace(/\s+/g, ' ').trim().toLowerCase();
    if (stemNorm && rawNormalized.includes(stemNorm)) {
      exactStemMatches++;
    }
    for (const opt of q.options) {
      totalOptions++;
      const optNorm = stripUnderlineMarkup(opt.text).replace(/\s+/g, ' ').trim().toLowerCase();
      if (optNorm && rawNormalized.includes(optNorm)) {
        exactOptionMatches++;
      }
    }
  }

  const stemScore = questions.length > 0 ? exactStemMatches / questions.length : 0;
  const optionScore = totalOptions > 0 ? exactOptionMatches / totalOptions : 1;
  const preservationScore =
    questions.length > 0 ? Math.round((stemScore * 0.65 + optionScore * 0.35) * 100) : 0;

  checks.push({
    id: 'chk_stem_match',
    label: 'Kesamaan Isi Soal dengan Input Mentah',
    passed: hasQuestions && stemScore >= 0.95,
    detail: hasQuestions
      ? `${exactStemMatches} dari ${questions.length} redaksi pertanyaan identik secara verbatim dengan teks mentah.`
      : 'Belum ada pertanyaan untuk dibandingkan.',
    severity: !hasQuestions ? 'warning' : stemScore >= 0.95 ? 'ok' : 'warning',
  });

  checks.push({
    id: 'chk_option_match',
    label: 'Kesamaan Isi Pilihan Jawaban',
    passed: hasQuestions && optionScore >= 0.95,
    detail:
      totalOptions > 0
        ? `${exactOptionMatches} dari ${totalOptions} teks opsi jawaban identik dengan input asli.`
        : 'Tidak ada opsi pilihan ganda pada dokumen ini.',
    severity: optionScore >= 0.95 ? 'ok' : 'warning',
  });

  // 5. Duplicate question stem detection
  const seenStems = new Map<string, number>();
  const duplicateStems: number[] = [];
  for (const q of questions) {
    const key = normalizeTokens(q.stem).join(' ');
    if (key.length > 10) {
      if (seenStems.has(key)) {
        duplicateStems.push(q.number ?? 0);
      } else {
        seenStems.set(key, q.number ?? 0);
      }
    }
  }
  checks.push({
    id: 'chk_duplicates',
    label: 'Deteksi Soal Terduplikasi',
    passed: duplicateStems.length === 0,
    detail:
      duplicateStems.length === 0
        ? 'Tidak ditemukan redaksi soal yang terduplikasi.'
        : `Ditemukan kemiripan redaksi soal ganda pada nomor: ${duplicateStems.join(', ')}.`,
    severity: duplicateStems.length === 0 ? 'ok' : 'warning',
  });

  // 6. Truncated question detection (allow short single-word translation/vocabulary prompts like City., Country., ذوبان)
  const truncatedQuestions = questions.filter((q) => {
    const s = stripUnderlineMarkup(q.stem).trim();
    if (s.length === 0) return true;
    if (containsArabicText(s)) return false;
    return s.length < 2 && q.options.length === 0;
  });
  checks.push({
    id: 'chk_truncated',
    label: 'Pemeriksaan Pertanyaan Terpotong',
    passed: truncatedQuestions.length === 0 && hasQuestions,
    detail:
      truncatedQuestions.length === 0
        ? 'Tidak ada pertanyaan kosong atau terputus.'
        : `${truncatedQuestions.length} soal terindikasi kosong atau terputus.`,
    severity: truncatedQuestions.length === 0 ? (hasQuestions ? 'ok' : 'warning') : 'error',
  });

  // 7. Subject identity consistency
  const formalName = identity.subjectFormalName || '';
  const code = identity.subjectCode || '';
  const subjectMismatch =
    Boolean(detectedSubject) &&
    Boolean(formalName.trim()) &&
    !formalName.toLowerCase().includes(detectedSubject!.toLowerCase()) &&
    !code.toLowerCase().includes(detectedSubject!.toLowerCase());

  checks.push({
    id: 'chk_subject',
    label: 'Identitas Mata Pelajaran',
    passed: !subjectMismatch,
    detail: subjectMismatch
      ? `Teks mentah menyebut "${detectedSubject}", sedangkan identitas dokumen saat ini "${formalName}".`
      : formalName.trim()
      ? `Mata pelajaran diisi guru: ${formalName}.`
      : 'Mata pelajaran belum diisi — guru dapat mengetik langsung di kolom Mata Pelajaran atau tabel dokumen.',
    severity: subjectMismatch ? 'warning' : 'ok',
  });

  // 8. Template readiness
  const templateReady = Boolean(template && template.id);
  checks.push({
    id: 'chk_template',
    label: 'Kesesuaian Template Dokumen',
    passed: templateReady,
    detail: templateReady
      ? `Menggunakan "${template.name}" (${template.paperSize}).`
      : 'Belum ada template yang dipilih.',
    severity: templateReady ? 'ok' : 'error',
  });

  // Build side-by-side comparison rows
  const rawLines = rawText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !/^(?:Mata\s+Pelajaran|Mapel|المادة(?:\s+الدراسية)?)\s*[:：]/i.test(l.trim()));
  const formattedLines: string[] = [];
  let lastSectionTitle: string | undefined;
  questions.forEach((q, idx) => {
    if (q.sectionTitle && q.sectionTitle !== lastSectionTitle) {
      formattedLines.push(q.sectionTitle);
      lastSectionTitle = q.sectionTitle;
    }
    if (q.stimulus) {
      formattedLines.push(`[Stimulus] ${q.stimulus}`);
    }
    const label = formatQuestionNumberLabel(q, idx, numberFormat);
    formattedLines.push(`${label} ${q.stem}`);
    for (const opt of q.options) {
      formattedLines.push(`${opt.label}. ${opt.text}`);
    }
  });

  const maxRows = Math.max(rawLines.length, formattedLines.length);
  const diffRows: DiffRow[] = [];
  for (let i = 0; i < maxRows; i++) {
    const rLine = rawLines[i] ?? '';
    const fLine = formattedLines[i] ?? '';
    const rClean = stripUnderlineMarkup(rLine).replace(/\s+/g, ' ').trim();
    const fClean = stripUnderlineMarkup(fLine).replace(/\s+/g, ' ').trim();

    let status: DiffRow['status'] = 'structured';
    if (!rClean && fClean) {
      status = 'structured';
    } else if (rClean && !fClean) {
      status = 'missing';
    } else if (rClean === fClean) {
      status = 'identical';
    } else {
      const stripPrefix = (s: string) =>
        s
          .replace(
            /^(?:Soal\s+|السؤال\s+|س\s*)?[0-9٠-٩]+[.)\]:\-]\s*|^(?:[A-Ea-e]|أ|ا|إ|ب|ج|د|هـ|ه)[.)\]:\-]\s*|^\[Stimulus\]\s*/i,
            ''
          )
          .trim();
      status = stripPrefix(rClean) === stripPrefix(fClean) ? 'identical' : 'flagged';
    }

    diffRows.push({
      lineNumber: i + 1,
      rawLine: rLine,
      formattedLine: fLine,
      status,
    });
  }

  const manualReviewCount = questions.filter((q) => q.needsManualReview).length;
  const overallVerified =
    hasQuestions &&
    manualReviewCount === 0 &&
    checks.every((c) => c.severity !== 'error') &&
    preservationScore >= 95;

  return {
    overallVerified,
    preservationScore,
    checks,
    diffRows,
    manualReviewCount,
  };
}
