import JSZip from 'jszip';
import type { StudentScoreEntry } from '../types/exam';

function escapeXml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetters(colIndexZeroBased: number): string {
  let n = colIndexZeroBased;
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

type CellSpec =
  | { type: 'string'; value: string; style?: number }
  | { type: 'number'; value: number; style?: number }
  | { type: 'formula'; formula: string; style?: number };

function renderCellXml(rowNum1Based: number, colIdx0Based: number, cell: CellSpec): string {
  const ref = `${columnLetters(colIdx0Based)}${rowNum1Based}`;
  const styleAttr = cell.style !== undefined ? ` s="${cell.style}"` : '';

  if (cell.type === 'number') {
    const safeNum = Number.isFinite(cell.value) ? cell.value : 0;
    return `<c r="${ref}"${styleAttr}><v>${safeNum}</v></c>`;
  }
  if (cell.type === 'formula') {
    return `<c r="${ref}"${styleAttr}><f>${escapeXml(cell.formula)}</f></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

interface SheetSpec {
  name: string;
  colWidths: number[];
  rows: CellSpec[][];
  merges?: string[];
}

function buildWorksheetXml(sheet: SheetSpec): string {
  const colsXml =
    sheet.colWidths.length > 0
      ? `<cols>${sheet.colWidths
          .map(
            (w, idx) =>
              `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
          )
          .join('')}</cols>`
      : '';

  const rowsXml = sheet.rows
    .map((cells, rIdx) => {
      const rNum = rIdx + 1;
      const cellsXml = cells.map((cell, cIdx) => renderCellXml(rNum, cIdx, cell)).join('');
      return `<row r="${rNum}">${cellsXml}</row>`;
    })
    .join('');

  const mergesXml =
    sheet.merges && sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((m) => `<mergeCell ref="${escapeXml(m)}"/>`)
          .join('')}</mergeCells>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;
}

function buildStylesXml(): string {
  // Style IDs:
  // 0 = Default body left
  // 1 = Title bold navy text 14pt
  // 2 = Subtitle muted 10pt
  // 3 = Table Header (Navy #0F1E3D fill, white bold 11pt, centered, thin border)
  // 4 = Body text left with thin border
  // 5 = Body text center with thin border
  // 6 = Body number (0.00 or integer) center with thin border
  // 7 = Summary / Total row bold with light blue fill (#EFF6FF) and border
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF0F1E3D"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F1E3D"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;
}

export function computePredicate(score: number): string {
  if (score >= 90) return 'A (Mumtaz / Sangat Baik)';
  if (score >= 80) return 'B (Jayyid Jiddan / Baik)';
  if (score >= 70) return 'C (Jayyid / Cukup)';
  if (score >= 60) return 'D (Maqbul / Perlu Bimbingan)';
  return 'E (Belum Tuntas)';
}

export interface ExcelRecapExportOptions {
  scores: StudentScoreEntry[];
  schoolName?: string;
  exportedBy?: string;
  filterSummary?: string;
}

export async function buildGradesExcelBlob(options: ExcelRecapExportOptions): Promise<Blob> {
  const {
    scores,
    schoolName = 'Pondok Pesantren / Madrasah',
    exportedBy = 'Sistem Rekap Nilai',
    filterSummary = 'Semua Data Nilai',
  } = options;

  const sorted = [...scores].sort((a, b) => {
    const subCmp = a.subjectName.localeCompare(b.subjectName);
    if (subCmp !== 0) return subCmp;
    const clsCmp = a.className.localeCompare(b.className);
    if (clsCmp !== 0) return clsCmp;
    return a.studentName.localeCompare(b.studentName);
  });

  const exportDateStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // Sheet 1: Detailed Rekap Nilai Siswa
  const sheet1Rows: CellSpec[][] = [
    [{ type: 'string', value: `REKAPITULASI NILAI UJIAN — ${schoolName}`, style: 1 }],
    [
      {
        type: 'string',
        value: `Filter: ${filterSummary} | Diunduh oleh: ${exportedBy} | Tanggal: ${exportDateStr}`,
        style: 2,
      },
    ],
    [],
    [
      { type: 'string', value: 'No', style: 3 },
      { type: 'string', value: 'Nama Siswa / Santri', style: 3 },
      { type: 'string', value: 'NIS / No. Peserta', style: 3 },
      { type: 'string', value: 'Kelas', style: 3 },
      { type: 'string', value: 'Mata Pelajaran', style: 3 },
      { type: 'string', value: 'Nama Ujian', style: 3 },
      { type: 'string', value: 'Semester', style: 3 },
      { type: 'string', value: 'Tahun Ajaran', style: 3 },
      { type: 'string', value: 'Nilai Angka', style: 3 },
      { type: 'string', value: 'Predikat', style: 3 },
      { type: 'string', value: 'Catatan / Keterangan', style: 3 },
      { type: 'string', value: 'Ustadz / Guru', style: 3 },
      { type: 'string', value: 'Email Guru', style: 3 },
      { type: 'string', value: 'Diperbarui', style: 3 },
    ],
  ];

  const firstDataRow1Based = 5;
  sorted.forEach((item, idx) => {
    sheet1Rows.push([
      { type: 'number', value: idx + 1, style: 5 },
      { type: 'string', value: item.studentName, style: 4 },
      { type: 'string', value: item.studentNis || '-', style: 5 },
      { type: 'string', value: item.className, style: 5 },
      { type: 'string', value: item.subjectName, style: 4 },
      { type: 'string', value: item.examTitle, style: 4 },
      { type: 'string', value: item.semester || '-', style: 5 },
      { type: 'string', value: item.academicYear || '-', style: 5 },
      { type: 'number', value: Number(item.score), style: 6 },
      { type: 'string', value: item.predicate || computePredicate(item.score), style: 4 },
      { type: 'string', value: item.notes || '-', style: 4 },
      { type: 'string', value: item.teacherName, style: 4 },
      { type: 'string', value: item.teacherEmail, style: 4 },
      {
        type: 'string',
        value: new Date(item.updatedAt).toLocaleDateString('id-ID'),
        style: 5,
      },
    ]);
  });

  if (sorted.length > 0) {
    const lastDataRow1Based = firstDataRow1Based + sorted.length - 1;
    sheet1Rows.push([]);
    sheet1Rows.push([
      { type: 'string', value: 'RINGKASAN', style: 7 },
      { type: 'string', value: `Total ${sorted.length} Data Nilai`, style: 7 },
      { type: 'string', value: '', style: 7 },
      { type: 'string', value: '', style: 7 },
      { type: 'string', value: '', style: 7 },
      { type: 'string', value: '', style: 7 },
      { type: 'string', value: '', style: 7 },
      { type: 'string', value: 'Rata-Rata:', style: 7 },
      { type: 'formula', formula: `AVERAGE(I${firstDataRow1Based}:I${lastDataRow1Based})`, style: 7 },
      { type: 'string', value: 'Tertinggi:', style: 7 },
      { type: 'formula', formula: `MAX(I${firstDataRow1Based}:I${lastDataRow1Based})`, style: 7 },
      { type: 'string', value: 'Terendah:', style: 7 },
      { type: 'formula', formula: `MIN(I${firstDataRow1Based}:I${lastDataRow1Based})`, style: 7 },
      { type: 'string', value: '', style: 7 },
    ]);
  }

  // Sheet 2: Aggregated Summary Per Mapel, Kelas, & Ustadz/Guru
  const groupMap = new Map<
    string,
    { subjectName: string; className: string; teacherName: string; scores: number[] }
  >();
  for (const s of sorted) {
    const key = `${s.subjectName}__${s.className}__${s.teacherName}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.scores.push(Number(s.score));
    } else {
      groupMap.set(key, {
        subjectName: s.subjectName,
        className: s.className,
        teacherName: s.teacherName,
        scores: [Number(s.score)],
      });
    }
  }

  const sheet2Rows: CellSpec[][] = [
    [{ type: 'string', value: `RINGKASAN NILAI PER MATA PELAJARAN & KELAS — ${schoolName}`, style: 1 }],
    [{ type: 'string', value: `Diunduh pada: ${exportDateStr}`, style: 2 }],
    [],
    [
      { type: 'string', value: 'No', style: 3 },
      { type: 'string', value: 'Mata Pelajaran', style: 3 },
      { type: 'string', value: 'Kelas', style: 3 },
      { type: 'string', value: 'Ustadz / Guru', style: 3 },
      { type: 'string', value: 'Jumlah Siswa', style: 3 },
      { type: 'string', value: 'Rata-Rata', style: 3 },
      { type: 'string', value: 'Nilai Tertinggi', style: 3 },
      { type: 'string', value: 'Nilai Terendah', style: 3 },
      { type: 'string', value: 'Tuntas (>=75)', style: 3 },
    ],
  ];

  Array.from(groupMap.values()).forEach((grp, idx) => {
    const count = grp.scores.length;
    const avg = count > 0 ? grp.scores.reduce((a, b) => a + b, 0) / count : 0;
    const max = count > 0 ? Math.max(...grp.scores) : 0;
    const min = count > 0 ? Math.min(...grp.scores) : 0;
    const passed = grp.scores.filter((n) => n >= 75).length;

    sheet2Rows.push([
      { type: 'number', value: idx + 1, style: 5 },
      { type: 'string', value: grp.subjectName, style: 4 },
      { type: 'string', value: grp.className, style: 5 },
      { type: 'string', value: grp.teacherName, style: 4 },
      { type: 'number', value: count, style: 5 },
      { type: 'number', value: Number(avg.toFixed(2)), style: 6 },
      { type: 'number', value: max, style: 6 },
      { type: 'number', value: min, style: 6 },
      { type: 'number', value: passed, style: 5 },
    ]);
  });

  const sheets: SheetSpec[] = [
    {
      name: 'Rekap Nilai Siswa',
      colWidths: [6, 28, 18, 14, 24, 28, 14, 15, 13, 24, 24, 22, 26, 15],
      rows: sheet1Rows,
      merges: ['A1:N1', 'A2:N2'],
    },
    {
      name: 'Ringkasan Per Mapel',
      colWidths: [6, 28, 16, 24, 15, 14, 16, 16, 16],
      rows: sheet2Rows,
      merges: ['A1:I1', 'A2:I2'],
    },
  ];

  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join('\n    ')}
  </sheets>
</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  zip.file('xl/styles.xml', buildStylesXml());

  sheets.forEach((sheet, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildWorksheetXml(sheet));
  });

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function exportGradesToExcel(
  options: ExcelRecapExportOptions,
  filenamePrefix = 'Rekap_Nilai_Ujian'
): Promise<void> {
  const blob = await buildGradesExcelBlob(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}_${datePart}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
