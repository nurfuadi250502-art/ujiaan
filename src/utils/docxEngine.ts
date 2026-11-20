import JSZip from 'jszip';
import mammoth from 'mammoth';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  ExamIdentity,
  FormatConfig,
  ParsedQuestion,
  TemplateDocument,
  TemplateStructureCheck,
} from '../types/exam';
import {
  ARABIC_KMI_IDENTITY_DEFAULTS,
  ARABIC_KMI_TABLE_LABELS,
  LATIN_KMI_IDENTITY_DEFAULTS,
  LATIN_KMI_TABLE_LABELS,
} from '../data/defaults';
import { formatQuestionNumberLabel } from './accuracyValidator';
import {
  containsArabicText,
  formatOptionMarkerChar,
  toEasternArabicDigits,
} from './ruleParser';
import { parseRichTextSegments, stripRichHtml } from './richText';

const PLACEHOLDER_REGEX = /\{\{[A-Z0-9_]+\}\}/g;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function detectStructureFromTextAndXml(
  text: string,
  xmlContent: string,
  hasMedia: boolean,
  hasHeaderOrFooter: boolean
): TemplateStructureCheck {
  const lower = text.toLowerCase();
  return {
    hasKopSekolah:
      /dinas|pemerintah|yayasan|kementerian|smp|sma|smk|sd|madrasah|وزارة|المدرسة|المعهد/i.test(text) ||
      hasHeaderOrFooter,
    hasLogo: hasMedia,
    hasSchoolName: /sekolah|madrasah|المدرسة|المعهد|\{\{nama_sekolah\}\}/i.test(lower),
    hasExamIdentity: /ujian|penilaian|ulangan|pas|pts|uas|uts|الامتحان|الاختبار|\{\{jenis_ujian\}\}/i.test(lower),
    hasSubject: /mata pelajaran|mapel|المادة|\{\{mata_pelajaran\}\}/i.test(lower),
    hasClass: /kelas|الفصل|الصف|\{\{kelas\}\}/i.test(lower),
    hasSemester: /semester|الفصل الدراسي|\{\{semester\}\}/i.test(lower),
    hasAcademicYear: /tahun ajaran|tahun pelajaran|العام الدراسي|\{\{tahun_ajaran\}\}/i.test(lower),
    hasDate: /hari|tanggal|اليوم|التاريخ|\{\{hari_tanggal\}\}/i.test(lower),
    hasDuration: /waktu|durasi|menit|الزمن|المدة|\{\{waktu\}\}/i.test(lower),
    hasParticipantFields: /nama peserta|nomor peserta|no\.?\s*ujian|اسم الطالب|رقم الجلوس/i.test(lower),
    hasInstructions: /petunjuk|instruksi|التعليمات|إرشادات|\{\{petunjuk_pengerjaan\}\}/i.test(lower),
    hasQuestionArea: /\{\{daftar_soal\}\}|soal|pilihlah jawaban|السؤال|الأسئلة/i.test(lower),
    hasPageNumbers: /w:pgNum/i.test(xmlContent) || /halaman|الصفحة/i.test(lower),
  };
}

export async function extractRawTextFromQuestionFile(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.txt')) {
    return await file.text();
  }
  if (lowerName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  }
  throw new Error('Format file soal tidak didukung. Gunakan file .docx atau .txt.');
}

export async function inspectUploadedTemplate(file: File): Promise<Partial<TemplateDocument>> {
  const lowerName = file.name.toLowerCase();
  const now = new Date().toISOString();

  if (lowerName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const docxBase64 = uint8ToBase64(bytes);

    const zip = await JSZip.loadAsync(bytes);
    const docXmlFile = zip.file('word/document.xml');
    const docXml = docXmlFile ? await docXmlFile.async('string') : '';

    let allXml = docXml;
    let hasHeaderOrFooter = false;
    for (const key of Object.keys(zip.files)) {
      if (/^word\/(header|footer)\d*\.xml$/i.test(key)) {
        hasHeaderOrFooter = true;
        allXml += '\n' + (await zip.files[key].async('string'));
      }
    }

    const hasMedia = Object.keys(zip.files).some((k) => k.startsWith('word/media/'));

    let margins = { top: 20, right: 20, bottom: 20, left: 25 };
    const marMatch = docXml.match(/<w:pgMar\b([^>]+)\/>/);
    if (marMatch) {
      const attrs = marMatch[1];
      const getAttrMm = (name: string, fallback: number) => {
        const m = attrs.match(new RegExp(`w:${name}="(\\d+)"`));
        return m ? Math.round((parseInt(m[1], 10) / 56.6929) * 10) / 10 : fallback;
      };
      margins = {
        top: getAttrMm('top', 20),
        right: getAttrMm('right', 20),
        bottom: getAttrMm('bottom', 20),
        left: getAttrMm('left', 25),
      };
    }

    let paperSize: TemplateDocument['paperSize'] = 'A4';
    const szMatch = docXml.match(/<w:pgSz\b([^>]+)\/>/);
    if (szMatch) {
      const hMatch = szMatch[1].match(/w:h="(\d+)"/);
      if (hMatch) {
        const hTwips = parseInt(hMatch[1], 10);
        if (hTwips > 17800) paperSize = 'F4';
        else if (hTwips < 16200) paperSize = 'Letter';
      }
    }

    const rawRes = await mammoth.extractRawText({ arrayBuffer: buffer });
    const htmlRes = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const extractedPreviewText = rawRes.value.trim();

    const isArabicDoc =
      containsArabicText(extractedPreviewText) || /<w:bidi\b|<w:rtl\b/i.test(docXml);

    const placeholdersSet = new Set<string>();
    const matches = (extractedPreviewText + ' ' + allXml.replace(/<[^>]+>/g, '')).match(PLACEHOLDER_REGEX);
    if (matches) {
      matches.forEach((m) => placeholdersSet.add(m));
    }

    const placeholderMappings: Record<string, string> = {};
    placeholdersSet.forEach((p) => {
      placeholderMappings[p] = p;
    });

    const lines = extractedPreviewText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return {
      name: file.name.replace(/\.docx$/i, ''),
      description: `Template DOCX asli diunggah (${lines.length} baris terdeteksi${isArabicDoc ? ' · Mode RTL Arab' : ''}). Desain, tabel, logo, header, dan margin asli dipertahankan saat ekspor.`,
      sourceType: 'docx',
      direction: isArabicDoc ? 'rtl' : 'ltr',
      paperSize,
      headerTitle: lines[0] || 'KOP TEMPLATE DOKUMEN',
      headerSubtitle: lines[1] || 'NASKAH UJIAN SEKOLAH',
      kopLines: lines.slice(0, 3),
      placeholdersDetected: Array.from(placeholdersSet),
      placeholderMappings,
      docxBase64,
      extractedPreviewText: extractedPreviewText.slice(0, 45000),
      extractedHtmlPreview: htmlRes.value,
      structure: detectStructureFromTextAndXml(extractedPreviewText, allXml, hasMedia, hasHeaderOrFooter),
      margins,
      createdAt: now,
      updatedAt: now,
    };
  }

  if (lowerName.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const pdfBase64 = uint8ToBase64(bytes);
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    const decoder = new TextDecoder('latin1');
    const rawStr = decoder.decode(bytes);
    const textSnippets = (rawStr.match(/\(([A-Za-z0-9\s.,:/\-()]{4,})\)/g) || [])
      .map((s) => s.slice(1, -1))
      .filter((s) => /[a-zA-Z]{2,}/.test(s))
      .slice(0, 120);
    const extractedPreviewText =
      textSnippets.length > 0
        ? textSnippets.join('\n')
        : 'Referensi tata letak PDF terlampir. Gunakan pratinjau PDF dan pemetaan placeholder untuk menyelaraskan struktur dokumen.';

    return {
      name: file.name.replace(/\.pdf$/i, ''),
      description: 'Referensi tata letak PDF untuk menyelaraskan struktur kop, identitas ujian, dan format halaman.',
      sourceType: 'pdf',
      direction: 'ltr',
      paperSize: 'A4',
      headerTitle: 'REFERENSI TATA LETAK PDF',
      headerSubtitle: file.name,
      kopLines: [file.name],
      placeholdersDetected: [],
      placeholderMappings: {},
      pdfDataUrl,
      extractedPreviewText,
      structure: detectStructureFromTextAndXml(extractedPreviewText, '', false, false),
      margins: { top: 20, right: 20, bottom: 20, left: 25 },
      createdAt: now,
      updatedAt: now,
    };
  }

  if (lowerName.endsWith('.doc')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('latin1');
    const rawStr = decoder.decode(bytes);
    const cleanRuns = (rawStr.match(/[A-Za-z0-9.,:/()\-_{}\s]{6,}/g) || [])
      .map((s) => s.trim())
      .filter((s) => /[a-zA-Z]{3,}/.test(s))
      .slice(0, 150);
    const extractedPreviewText = cleanRuns.join('\n');
    const placeholders = Array.from(new Set(extractedPreviewText.match(PLACEHOLDER_REGEX) || []));

    return {
      name: file.name.replace(/\.doc$/i, ''),
      description: 'Template DOC klasik terindeks. Disarankan menyimpan ke .docx di Word untuk preservasi XML penuh, atau gunakan pemetaan teks di bawah.',
      sourceType: 'doc',
      direction: 'ltr',
      paperSize: 'A4',
      headerTitle: cleanRuns[0] || 'TEMPLATE DOC',
      headerSubtitle: cleanRuns[1] || file.name,
      kopLines: cleanRuns.slice(0, 3),
      placeholdersDetected: placeholders,
      placeholderMappings: Object.fromEntries(placeholders.map((p) => [p, p])),
      extractedPreviewText,
      structure: detectStructureFromTextAndXml(extractedPreviewText, '', false, false),
      margins: { top: 20, right: 20, bottom: 20, left: 25 },
      createdAt: now,
      updatedAt: now,
    };
  }

  throw new Error('Format template tidak didukung. Unggah file .docx, .doc, atau .pdf.');
}

function resolveTokenValueMap(
  identity: ExamIdentity,
  template: TemplateDocument,
  isRtl: boolean
): Record<string, string> {
  const countStr = isRtl
    ? `${toEasternArabicDigits(identity.questionCount)} سؤالاً`
    : `${identity.questionCount} Soal`;
  const baseValues: Record<string, string> = {
    '{{NAMA_SEKOLAH}}': identity.schoolName,
    '{{ALAMAT_SEKOLAH}}': identity.schoolAddress,
    '{{JENIS_UJIAN}}': identity.examType,
    '{{MATA_PELAJARAN}}': identity.subjectFormalName,
    '{{KELAS}}': identity.className,
    '{{SEMESTER}}': identity.semester,
    '{{TAHUN_AJARAN}}': identity.academicYear,
    '{{HARI_TANGGAL}}': identity.examDate,
    '{{WAKTU}}': identity.duration,
    '{{NAMA_GURU}}': identity.teacherName,
    '{{JUMLAH_SOAL}}': countStr,
    '{{PETUNJUK_PENGERJAAN}}': identity.instructions,
  };

  const resolved: Record<string, string> = { ...baseValues };
  for (const [placeholderKey, mappedTarget] of Object.entries(template.placeholderMappings || {})) {
    if (mappedTarget && mappedTarget !== placeholderKey && baseValues[placeholderKey] !== undefined) {
      resolved[mappedTarget] = baseValues[placeholderKey];
    }
  }
  return resolved;
}

function replacePlaceholdersInXml(xml: string, replacements: Record<string, string>): string {
  const keys = Object.keys(replacements).filter((k) => k.trim().length > 0 && k !== '{{DAFTAR_SOAL}}');
  if (keys.length === 0) return xml;

  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const tNodes: { full: string; inner: string; start: number; end: number }[] = [];
    const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRegex.exec(paragraphXml)) !== null) {
      tNodes.push({
        full: m[0],
        inner: m[1],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    if (tNodes.length === 0) return paragraphXml;

    const combinedText = tNodes.map((n) => n.inner).join('');
    let modifiedText = combinedText;
    let changed = false;

    for (const key of keys) {
      const escapedKey = escapeXml(key);
      if (modifiedText.includes(escapedKey)) {
        modifiedText = modifiedText.split(escapedKey).join(escapeXml(replacements[key]));
        changed = true;
      } else if (modifiedText.includes(key)) {
        modifiedText = modifiedText.split(key).join(escapeXml(replacements[key]));
        changed = true;
      }
    }

    if (!changed) return paragraphXml;

    let result = '';
    let cursor = 0;
    tNodes.forEach((node, idx) => {
      result += paragraphXml.slice(cursor, node.start);
      if (idx === 0) {
        result += `<w:t xml:space="preserve">${modifiedText}</w:t>`;
      } else {
        result += `<w:t></w:t>`;
      }
      cursor = node.end;
    });
    result += paragraphXml.slice(cursor);
    return result;
  });
}

function buildOoxmlQuestionsBlock(
  questions: ParsedQuestion[],
  format: FormatConfig
): string {
  const isRtl = format.direction === 'rtl';
  const fontName = escapeXml(
    format.fontFamily === 'Amiri' || format.fontFamily === 'Noto Naskh Arabic'
      ? format.fontFamily
      : isRtl
      ? 'Traditional Arabic'
      : format.fontFamily
  );
  const halfPts = Math.round(format.fontSize * 2);
  const spaceAfterQ = Math.round(format.questionSpacing * 15);
  const spaceAfterOpt = Math.round(format.optionSpacing * 15);
  const lineTwips = Math.round(format.lineSpacing * 240);
  const jc =
    format.alignment === 'justify'
      ? 'both'
      : format.alignment === 'center'
      ? 'center'
      : format.alignment === 'right' || isRtl
      ? 'right'
      : 'left';

  const makeParagraph = (
    text: string,
    opts: { bold?: boolean; italic?: boolean; indentLeft?: number; hanging?: number; spaceAfter?: number; keepNext?: boolean }
  ) => {
    const pPrParts = [
      `<w:spacing w:after="${opts.spaceAfter ?? 60}" w:line="${lineTwips}" w:lineRule="auto"/>`,
      `<w:jc w:val="${jc}"/>`,
      '<w:keepLines/>',
    ];
    if (isRtl) pPrParts.push('<w:bidi/>');
    if (opts.keepNext) pPrParts.push('<w:keepNext/>');
    if (opts.indentLeft || opts.hanging) {
      pPrParts.push(
        `<w:ind w:left="${opts.indentLeft ?? 0}"${opts.hanging ? ` w:hanging="${opts.hanging}"` : ''}/>`
      );
    }

    const segs = parseRichTextSegments(text);
    const runsXml = segs
      .map((seg) => {
        const parts = seg.text.split('\n');
        return parts
          .map((part, pIdx) => {
            const rPrParts = [
              `<w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:cs="${fontName}"/>`,
              `<w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/>`,
            ];
            if (isRtl) rPrParts.push('<w:rtl/>');
            if (opts.bold || seg.bold) rPrParts.push('<w:b/><w:bCs/>');
            if (opts.italic || seg.italic) rPrParts.push('<w:i/><w:iCs/>');
            if (seg.underline) rPrParts.push('<w:u w:val="single"/>');
            if (seg.strike) rPrParts.push('<w:strike/>');
            if (seg.superScript) rPrParts.push('<w:vertAlign w:val="superscript"/>');
            else if (seg.subScript) rPrParts.push('<w:vertAlign w:val="subscript"/>');
            if (seg.color) rPrParts.push(`<w:color w:val="${seg.color.replace('#', '')}"/>`);
            if (seg.highlight) rPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${seg.highlight.replace('#', '')}"/>`);

            const br = pIdx > 0 ? '<w:br/>' : '';
            return `<w:r><w:rPr>${rPrParts.join('')}</w:rPr>${br}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
          })
          .join('');
      })
      .join('');

    return `<w:p><w:pPr>${pPrParts.join('')}</w:pPr>${runsXml}</w:p>`;
  };

  const blocks: string[] = [];
  let lastSectionTitle: string | undefined;
  questions.forEach((q, idx) => {
    if (q.sectionTitle && q.sectionTitle !== lastSectionTitle) {
      blocks.push(
        makeParagraph(q.sectionTitle, {
          bold: true,
          spaceAfter: 90,
          keepNext: true,
        })
      );
      lastSectionTitle = q.sectionTitle;
    }

    if (q.stimulus) {
      blocks.push(
        makeParagraph(q.stimulus, {
          italic: !isRtl,
          spaceAfter: 90,
          keepNext: true,
        })
      );
    }
    const label = formatQuestionNumberLabel(
      q,
      idx,
      format.numberFormat,
      format.arabicNumeralStyle,
      isRtl
    );
    blocks.push(
      makeParagraph(`${label} ${q.stem}`, {
        bold: format.stemBold,
        italic: format.stemItalic,
        indentLeft: format.numberPosition === 'left-hang' ? 360 : 0,
        hanging: format.numberPosition === 'left-hang' ? 360 : 0,
        spaceAfter: q.options.length > 0 ? spaceAfterOpt : spaceAfterQ,
        keepNext: q.options.length > 0,
      })
    );

    q.options.forEach((opt, oIdx) => {
      const isLast = oIdx === q.options.length - 1;
      const optChar = formatOptionMarkerChar(opt.label, oIdx, format.optionLabelStyle, isRtl);
      blocks.push(
        makeParagraph(`${optChar}. ${opt.text}`, {
          indentLeft: 640,
          hanging: 280,
          spaceAfter: isLast ? spaceAfterQ : spaceAfterOpt,
          keepNext: !isLast,
        })
      );
    });

    if (q.subquestions && q.subquestions.length > 0) {
      q.subquestions.forEach((sub, sIdx) => {
        const isLast = sIdx === q.subquestions!.length - 1;
        blocks.push(
          makeParagraph(sub, {
            indentLeft: 640,
            hanging: 280,
            spaceAfter: isLast ? spaceAfterQ : spaceAfterOpt,
          })
        );
      });
    }
  });

  return blocks.join('');
}

function dataUrlToUint8(dataUrl: string): Uint8Array | null {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  try {
    return base64ToUint8(parts[1]);
  } catch {
    return null;
  }
}

function getPaperTwips(paperSize: FormatConfig['paperSize']): { width: number; height: number } {
  switch (paperSize) {
    case 'F4':
      return { width: 12189, height: 18709 };
    case 'Letter':
      return { width: 12240, height: 15840 };
    case 'A4':
    default:
      return { width: 11906, height: 16838 };
  }
}

export async function exportDocumentToDocx(params: {
  template: TemplateDocument;
  identity: ExamIdentity;
  format: FormatConfig;
  questions: ParsedQuestion[];
  logoDataUrl?: string;
}): Promise<Blob> {
  const { template, identity, format, questions, logoDataUrl } = params;
  const isRtl = format.direction === 'rtl';

  // Path 1: Preserve uploaded .docx template XML, tables, styles, headers, footers, and logos!
  if (template.sourceType === 'docx' && template.docxBase64) {
    const zip = await JSZip.loadAsync(base64ToUint8(template.docxBase64));
    const replacements = resolveTokenValueMap(identity, template, isRtl);
    const questionsMarker = template.placeholderMappings?.['{{DAFTAR_SOAL}}'] || '{{DAFTAR_SOAL}}';

    for (const fileName of Object.keys(zip.files)) {
      if (fileName === 'word/document.xml' || /^word\/(header|footer)\d*\.xml$/i.test(fileName)) {
        let xml = await zip.files[fileName].async('string');
        xml = replacePlaceholdersInXml(xml, replacements);

        if (fileName === 'word/document.xml') {
          const questionsOoxml = buildOoxmlQuestionsBlock(questions, format);
          const escapedMarker = escapeXml(questionsMarker);
          let injected = false;

          xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
            const plain = pXml.replace(/<[^>]+>/g, '');
            if (!injected && (plain.includes(questionsMarker) || plain.includes(escapedMarker))) {
              injected = true;
              return questionsOoxml;
            }
            return pXml;
          });

          if (!injected) {
            if (xml.includes('<w:sectPr')) {
              xml = xml.replace(/<w:sectPr\b/, `${questionsOoxml}<w:sectPr`);
            } else {
              xml = xml.replace('</w:body>', `${questionsOoxml}</w:body>`);
            }
          }
        }

        zip.file(fileName, xml);
      }
    }

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  // Path 2: Generate crisp built-in .docx document using `docx` library with full RTL support
  const mmToTwips = (mm: number) => Math.round(mm * 56.6929);
  const paper = getPaperTwips(format.paperSize);
  const font = format.fontFamily;
  const bodySize = Math.round(format.fontSize * 2);
  const isKmiArabicPreset = isRtl && (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi';
  const isKmiLatinPreset =
    !isRtl && (template.id === 'tpl_kmi_latin' || (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi');
  const logoBytes =
    logoDataUrl || template.logoDataUrl
      ? dataUrlToUint8((logoDataUrl || template.logoDataUrl)!)
      : null;

  const makeRun = (
    text: string,
    opts?: {
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      strike?: boolean;
      superScript?: boolean;
      subScript?: boolean;
      size?: number;
      color?: string;
      highlight?: string;
    }
  ) =>
    new TextRun({
      text,
      font,
      size: opts?.size ?? bodySize,
      bold: opts?.bold,
      italics: opts?.italics,
      underline: opts?.underline ? { type: UnderlineType.SINGLE } : undefined,
      strike: opts?.strike,
      superScript: opts?.superScript,
      subScript: opts?.subScript,
      color: opts?.color ? opts.color.replace('#', '') : undefined,
      shading: opts?.highlight
        ? { type: ShadingType.CLEAR, fill: opts.highlight.replace('#', ''), color: 'auto' }
        : undefined,
      rightToLeft: isRtl ? true : undefined,
    });

  const makeFormattedRuns = (
    text: string,
    opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string }
  ) => {
    const segs = parseRichTextSegments(text);
    const runs: TextRun[] = [];
    for (const seg of segs) {
      const parts = seg.text.split('\n');
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) {
          runs.push(new TextRun({ break: 1 }));
        }
        runs.push(
          makeRun(part, {
            size: opts?.size,
            bold: opts?.bold || seg.bold,
            italics: opts?.italics || seg.italic,
            underline: seg.underline,
            strike: seg.strike,
            superScript: seg.superScript,
            subScript: seg.subScript,
            color: seg.color || opts?.color,
            highlight: seg.highlight,
          })
        );
      });
    }
    return runs;
  };

  const headerChildren: (Paragraph | Table)[] = [];

  const kmiCellBorders = (heavyBottom = false) => ({
    top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: heavyBottom ? 16 : 6, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  });

  if (isKmiArabicPreset) {
    const arLabels = identity.tableLabels || ARABIC_KMI_TABLE_LABELS;
    const rawYear = (identity.academicYear || ARABIC_KMI_IDENTITY_DEFAULTS.academicYear).trim();
    const yearDigits =
      format.arabicNumeralStyle === 'eastern' ? toEasternArabicDigits(rawYear) : rawYear;
    const yearLine = yearDigits.startsWith('عام') ? yearDigits : `عام ${yearDigits}`;
    const linesToRender =
      identity.headerLines && identity.headerLines.length > 0
        ? identity.headerLines
        : [
            identity.examType || template.headerTitle,
            identity.schoolName || template.headerSubtitle,
            yearLine,
          ];

    linesToRender.forEach((line, lIdx) => {
      headerChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          spacing: { after: lIdx === linesToRender.length - 1 ? 140 : 40 },
          children: makeFormattedRuns(line, { size: 26, bold: true }),
        })
      );
    });

    const makeKmiCell = (
      htmlText: string,
      opts: {
        widthPct: number;
        align?: (typeof AlignmentType)[keyof typeof AlignmentType];
        bold?: boolean;
        rowSpan?: number;
        columnSpan?: number;
        heavyBottom?: boolean;
      }
    ) =>
      new TableCell({
        width: { size: opts.widthPct, type: WidthType.PERCENTAGE },
        rowSpan: opts.rowSpan,
        columnSpan: opts.columnSpan,
        verticalAlign: VerticalAlign.CENTER,
        borders: kmiCellBorders(opts.heavyBottom),
        margins: { top: 55, bottom: 55, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: opts.align ?? AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 0 },
            children: makeFormattedRuns(htmlText, { size: 22, bold: opts.bold }),
          }),
        ],
      });

    const kmiRows: TableRow[] = [
      new TableRow({
        children: [
          makeKmiCell(`${stripRichHtml(arLabels.subject)}   :   ${identity.subjectFormalName}`, {
            widthPct: 31,
            rowSpan: 2,
          }),
          makeKmiCell(`${stripRichHtml(arLabels.day)}   :   ${identity.examDay || 'السبت'}`, {
            widthPct: 43,
            columnSpan: 2,
            rowSpan: 2,
          }),
          makeKmiCell(identity.hijriDate || '١٩ محرم ١٤٤٨', {
            widthPct: 26,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeKmiCell(identity.examDate || '٤ يوليو ٢٠٢٦', {
            widthPct: 26,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeKmiCell(`${stripRichHtml(arLabels.classLabel)}   :   ${identity.className}`, {
            widthPct: 31,
          }),
          makeKmiCell(`${stripRichHtml(arLabels.period)}   :   ${identity.sessionPeriod || 'الثانية'}`, {
            widthPct: 43,
            columnSpan: 2,
          }),
          makeKmiCell(identity.duration, {
            widthPct: 26,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeKmiCell(arLabels.teacher, {
            widthPct: 50,
            columnSpan: 2,
            align: AlignmentType.CENTER,
            bold: true,
            heavyBottom: !identity.includeStudentFields,
          }),
          makeKmiCell(identity.teacherName, {
            widthPct: 50,
            columnSpan: 2,
            align: AlignmentType.CENTER,
            bold: true,
            heavyBottom: !identity.includeStudentFields,
          }),
        ],
      }),
    ];

    if (identity.includeStudentFields) {
      kmiRows.push(
        new TableRow({
          children: [
            makeKmiCell('اسم الطالب : ....................................', {
              widthPct: 50,
              columnSpan: 2,
              heavyBottom: true,
            }),
            makeKmiCell('رقم الجلوس : ............................', {
              widthPct: 50,
              columnSpan: 2,
              heavyBottom: true,
            }),
          ],
        })
      );
    }

    headerChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        visuallyRightToLeft: true,
        rows: kmiRows,
      }),
      new Paragraph({ spacing: { after: 140 }, children: [] })
    );

    if (identity.instructions.trim()) {
      identity.instructions.split('\n').forEach((line) => {
        if (!line.trim()) return;
        headerChildren.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 40 },
            children: makeFormattedRuns(line.trim(), { size: 20 }),
          })
        );
      });
    }
  } else if (isKmiLatinPreset) {
    const ltLabels = identity.tableLabels || LATIN_KMI_TABLE_LABELS;
    const linesToRender =
      identity.headerLines && identity.headerLines.length > 0
        ? identity.headerLines
        : LATIN_KMI_IDENTITY_DEFAULTS.headerLines;

    linesToRender.forEach((line, lIdx) => {
      headerChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: lIdx === linesToRender.length - 1 ? 120 : 20 },
          children: makeFormattedRuns(line, { size: 24, bold: true }),
        })
      );
    });

    const makeLatinKmiCell = (
      htmlText: string,
      opts: {
        widthPct: number;
        align?: (typeof AlignmentType)[keyof typeof AlignmentType];
        bold?: boolean;
        rowSpan?: number;
        columnSpan?: number;
        heavyBottom?: boolean;
      }
    ) =>
      new TableCell({
        width: { size: opts.widthPct, type: WidthType.PERCENTAGE },
        rowSpan: opts.rowSpan,
        columnSpan: opts.columnSpan,
        verticalAlign: VerticalAlign.CENTER,
        borders: kmiCellBorders(opts.heavyBottom),
        margins: { top: 45, bottom: 45, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: opts.align ?? AlignmentType.LEFT,
            spacing: { after: 0 },
            children: makeFormattedRuns(htmlText, { size: 21, bold: opts.bold }),
          }),
        ],
      });

    const latinRows: TableRow[] = [
      new TableRow({
        children: [
          makeLatinKmiCell(`${stripRichHtml(ltLabels.subject)} : ${identity.subjectFormalName}`, {
            widthPct: 34,
            rowSpan: 2,
            bold: true,
          }),
          makeLatinKmiCell(`${stripRichHtml(ltLabels.day)} : ${identity.examDay || ''}`, {
            widthPct: 40,
            columnSpan: 2,
            rowSpan: 2,
            bold: true,
          }),
          makeLatinKmiCell(identity.hijriDate || '', {
            widthPct: 26,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeLatinKmiCell(identity.examDate || '', {
            widthPct: 26,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeLatinKmiCell(`${stripRichHtml(ltLabels.classLabel)} : ${identity.className}`, {
            widthPct: 34,
            bold: true,
          }),
          makeLatinKmiCell(`${stripRichHtml(ltLabels.period)} : ${identity.sessionPeriod || ''}`, {
            widthPct: 40,
            columnSpan: 2,
            bold: true,
          }),
          makeLatinKmiCell(identity.duration, {
            widthPct: 26,
            align: AlignmentType.CENTER,
            bold: true,
          }),
        ],
      }),
      new TableRow({
        children: [
          makeLatinKmiCell(ltLabels.teacher, {
            widthPct: 50,
            columnSpan: 2,
            align: AlignmentType.CENTER,
            bold: true,
            heavyBottom: !identity.includeStudentFields,
          }),
          makeLatinKmiCell(identity.teacherName, {
            widthPct: 50,
            columnSpan: 2,
            align: AlignmentType.CENTER,
            bold: true,
            heavyBottom: !identity.includeStudentFields,
          }),
        ],
      }),
    ];

    if (identity.includeStudentFields) {
      latinRows.push(
        new TableRow({
          children: [
            makeLatinKmiCell('NAME : ................................................', {
              widthPct: 50,
              columnSpan: 2,
              heavyBottom: true,
            }),
            makeLatinKmiCell('NUMBER : .........................................', {
              widthPct: 50,
              columnSpan: 2,
              heavyBottom: true,
            }),
          ],
        })
      );
    }

    headerChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: latinRows,
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] })
    );

    if (identity.instructions.trim()) {
      identity.instructions.split('\n').forEach((line) => {
        if (!line.trim()) return;
        headerChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 40 },
            children: makeFormattedRuns(line.trim(), { size: 20 }),
          })
        );
      });
    }
  } else {
    const kopParagraphs: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        spacing: { after: 30 },
        children: [
          makeRun(
            template.headerTitle ||
              (isRtl ? 'وِزَارَةُ الشُّؤُونِ الدِّينِيَّةِ' : 'DINAS PENDIDIKAN DAN KEBUDAYAAN'),
            { size: 22, bold: true }
          ),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        spacing: { after: 30 },
        children: [makeRun(isRtl ? identity.schoolName : identity.schoolName.toUpperCase(), { size: 28, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        spacing: { after: 40 },
        children: [makeRun(identity.schoolAddress, { size: 18 })],
      }),
    ];

    if (logoBytes) {
      headerChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          visuallyRightToLeft: isRtl,
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '0F1E3D' },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 15, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.DOUBLE, size: 12, color: '0F1E3D' },
                    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new ImageRun({
                          data: logoBytes,
                          transformation: { width: 58, height: 58 },
                          type: 'png',
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 85, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.DOUBLE, size: 12, color: '0F1E3D' },
                    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  },
                  children: kopParagraphs,
                }),
              ],
            }),
          ],
        })
      );
    } else {
      headerChildren.push(
        ...kopParagraphs,
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '0F1E3D' },
          },
          spacing: { after: 140 },
          children: [],
        })
      );
    }

    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        spacing: { before: 140, after: 120 },
        children: [
          makeRun(
            isRtl
              ? `${identity.examType} — العام الدراسي ${identity.academicYear}`
              : `${identity.examType.toUpperCase()} — TAHUN AJARAN ${identity.academicYear}`,
            { size: 24, bold: true }
          ),
        ],
      })
    );

    const makeInfoCell = (text: string, bold = false, widthPct = 25) =>
      new TableCell({
        width: { size: widthPct, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: isRtl,
            spacing: { after: 0 },
            children: [makeRun(text, { size: 20, bold })],
          }),
        ],
      });

    const qCountText = isRtl
      ? `${toEasternArabicDigits(questions.length)} سؤالاً`
      : `${questions.length} Soal`;

    const identityRows: [string, string, string, string][] = isRtl
      ? [
          ['المادة الدراسية', identity.subjectFormalName, 'اليوم والتاريخ', identity.examDate],
          ['الفصل / الفصل الدراسي', `${identity.className} / ${identity.semester}`, 'الزمن / المدة', identity.duration],
          ['اسم المدرس', identity.teacherName, 'عدد الأسئلة', qCountText],
          ...(identity.includeStudentFields
            ? [['اسم الطالب', '........................................', 'رقم الجلوس', '..........................'] as [string, string, string, string]]
            : []),
        ]
      : [
          ['Mata Pelajaran', identity.subjectFormalName, 'Hari / Tanggal', identity.examDate],
          ['Kelas / Semester', `${identity.className} / ${identity.semester}`, 'Alokasi Waktu', identity.duration],
          ['Guru Pengampu', identity.teacherName, 'Jumlah Soal', qCountText],
          ...(identity.includeStudentFields
            ? [['Nama Peserta', '........................................', 'Nomor Peserta', '..........................'] as [string, string, string, string]]
            : []),
        ];

    headerChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        visuallyRightToLeft: isRtl,
        rows: identityRows.map(
          (r) =>
            new TableRow({
              children: [
                makeInfoCell(r[0], true, 18),
                makeInfoCell(`: ${r[1]}`, true, 36),
                makeInfoCell(r[2], true, 18),
                makeInfoCell(`: ${r[3]}`, false, 28),
              ],
            })
        ),
      })
    );

    if (identity.instructions.trim()) {
      headerChildren.push(
        new Paragraph({
          alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: isRtl,
          spacing: { before: 140, after: 40 },
          children: [
            makeRun(isRtl ? 'إرشادات الامتحان:' : 'PETUNJUK PENGERJAAN:', {
              size: 20,
              bold: true,
            }),
          ],
        })
      );
      identity.instructions.split('\n').forEach((line) => {
        if (!line.trim()) return;
        headerChildren.push(
          new Paragraph({
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: isRtl,
            spacing: { after: 30 },
            children: [makeRun(line.trim(), { size: 19 })],
          })
        );
      });
    }

    headerChildren.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
        },
        spacing: { before: 80, after: 160 },
        children: [],
      })
    );
  }

  const questionParagraphs: Paragraph[] = [];
  const resolveDocxAlign = (align?: 'left' | 'center' | 'right' | 'justify') => {
    const target = align || format.alignment;
    if (target === 'justify') return AlignmentType.JUSTIFIED;
    if (target === 'center') return AlignmentType.CENTER;
    if (target === 'right') return AlignmentType.RIGHT;
    return isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  };
  const docAlignment = resolveDocxAlign();
  const lineVal = Math.round(format.lineSpacing * 240);

  let lastSectionTitle: string | undefined;
  questions.forEach((q, idx) => {
    const qAlign = resolveDocxAlign(q.alignment);
    if (q.sectionTitle && q.sectionTitle !== lastSectionTitle) {
      questionParagraphs.push(
        new Paragraph({
          alignment: docAlignment,
          bidirectional: isRtl,
          keepLines: true,
          keepNext: true,
          spacing: { before: idx === 0 ? 40 : 180, after: 80, line: lineVal },
          children: makeFormattedRuns(q.sectionTitle, { bold: true }),
        })
      );
      lastSectionTitle = q.sectionTitle;
    }

    if (q.stimulus) {
      questionParagraphs.push(
        new Paragraph({
          alignment: qAlign,
          bidirectional: isRtl,
          keepLines: true,
          keepNext: true,
          spacing: { after: 80, line: lineVal },
          children: makeFormattedRuns(q.stimulus, { italics: !isRtl }),
        })
      );
    }

    const label = formatQuestionNumberLabel(
      q,
      idx,
      format.numberFormat,
      format.arabicNumeralStyle,
      isRtl
    );
    questionParagraphs.push(
      new Paragraph({
        alignment: qAlign,
        bidirectional: isRtl,
        keepLines: true,
        keepNext: q.options.length > 0,
        indent:
          format.numberPosition === 'left-hang'
            ? { left: isKmiArabicPreset || isKmiLatinPreset ? 520 : 360, hanging: 340 }
            : undefined,
        spacing: {
          after:
            q.options.length > 0
              ? Math.round(format.optionSpacing * 15)
              : Math.round(format.questionSpacing * 15),
          line: lineVal,
        },
        children: [
          makeRun(`${label} `, { bold: !isKmiArabicPreset && !isKmiLatinPreset }),
          ...makeFormattedRuns(q.stem, { bold: format.stemBold, italics: format.stemItalic }),
        ],
      })
    );

    q.options.forEach((opt, oIdx) => {
      const isLast = oIdx === q.options.length - 1;
      const optChar = formatOptionMarkerChar(opt.label, oIdx, format.optionLabelStyle, isRtl);
      questionParagraphs.push(
        new Paragraph({
          alignment: qAlign,
          bidirectional: isRtl,
          keepLines: true,
          keepNext: !isLast,
          indent: { left: 680, hanging: 280 },
          spacing: {
            after: isLast
              ? Math.round(format.questionSpacing * 15)
              : Math.round(format.optionSpacing * 15),
            line: lineVal,
          },
          children: [makeRun(`${optChar}. `, { bold: true }), ...makeFormattedRuns(opt.text)],
        })
      );
    });

    if (q.subquestions && q.subquestions.length > 0) {
      q.subquestions.forEach((sub, sIdx) => {
        const isLast = sIdx === q.subquestions!.length - 1;
        questionParagraphs.push(
          new Paragraph({
            alignment: qAlign,
            bidirectional: isRtl,
            keepLines: true,
            indent: { left: 680, hanging: 280 },
            spacing: {
              after: isLast
                ? Math.round(format.questionSpacing * 15)
                : Math.round(format.optionSpacing * 15),
              line: lineVal,
            },
            children: makeFormattedRuns(sub),
          })
        );
      });
    }
  });

  if (identity.closingText && identity.closingText.trim()) {
    questionParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        spacing: { before: 360, after: 60 },
        children: makeFormattedRuns(identity.closingText.trim(), {
          size: 24,
          bold: true,
        }),
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: paper.width,
              height: paper.height,
            },
            margin: {
              top: mmToTwips(format.marginTop),
              right: mmToTwips(format.marginRight),
              bottom: mmToTwips(format.marginBottom),
              left: mmToTwips(format.marginLeft),
            },
          },
        },
        footers:
          isKmiArabicPreset || isKmiLatinPreset
            ? undefined
            : {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: isRtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
                      bidirectional: isRtl,
                      children: [
                        makeRun(
                          isRtl
                            ? `${identity.subjectFormalName} · الصفحة `
                            : `${identity.subjectFormalName} · Halaman `,
                          { size: 18, color: '475569' }
                        ),
                        new TextRun({
                          children: [PageNumber.CURRENT],
                          font,
                          size: 18,
                          color: '475569',
                        }),
                        makeRun(isRtl ? ' من ' : ' dari ', { size: 18, color: '475569' }),
                        new TextRun({
                          children: [PageNumber.TOTAL_PAGES],
                          font,
                          size: 18,
                          color: '475569',
                        }),
                      ],
                    }),
                  ],
                }),
              },
        children: [...headerChildren, ...questionParagraphs],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
