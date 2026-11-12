/**
 * Ficha individual da NCM em Word (.docx) — equivalente à célula 44 do notebook.
 * Carregado sob demanda (import dinâmico) para não pesar no carregamento inicial do app.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ImageRun, AlignmentType, PageBreak, ShadingType, BorderStyle,
} from 'docx';

export interface ReportTable {
  heading?: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
  source?: string;
  emptyMessage?: string;
}

export interface ReportImage {
  heading: string;
  png: Uint8Array;
  width: number;
  height: number;
  source?: string;
}

export interface ReportBlock { type: 'table'; table: ReportTable }
export interface ReportImageBlock { type: 'image'; image: ReportImage }
export interface ReportTextBlock { type: 'text'; text: string; italic?: boolean }
export interface ReportPageBreak { type: 'pagebreak' }
export type ReportItem = ReportBlock | ReportImageBlock | ReportTextBlock | ReportPageBreak;

const FONT = 'Calibri';
const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function cell(text: string, header: boolean, small: boolean, alignRight: boolean): TableCell {
  return new TableCell({
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE6F2' } : undefined,
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: alignRight && !header ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: header, font: FONT, size: small ? 14 : 16 })],
    })],
  });
}

function buildTable(t: ReportTable): Table {
  const small = t.columns.length > 8;
  const isNumeric = (v: unknown) => typeof v === 'number' || /^[-–]?[\d.,]+%?$/.test(String(v ?? ''));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: t.columns.map(c => cell(c, true, small, false)) }),
      ...t.rows.map(r => new TableRow({
        children: r.map(v => cell(v === null || v === undefined ? '' : String(v), false, small, isNumeric(v))),
      })),
    ],
  });
}

const p = (text: string, opts: { italic?: boolean; size?: number } = {}) =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, italics: opts.italic })] });
const source = (text: string) =>
  new Paragraph({ spacing: { before: 60, after: 240 }, children: [new TextRun({ text, font: FONT, size: 16, color: '595959' })] });
const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({ heading: level, keepNext: true, keepLines: true, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, font: FONT, color: '1F3864', bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 22 })] });

export async function buildWordReport(title: string, subtitle: string, items: ReportItem[]): Promise<Blob> {
  const children: (Paragraph | Table)[] = [heading(title, HeadingLevel.HEADING_1)];
  if (subtitle) children.push(p(subtitle, { italic: true, size: 18 }));

  for (const item of items) {
    if (item.type === 'pagebreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (item.type === 'text') {
      children.push(p(item.text, { italic: item.italic }));
    } else if (item.type === 'table') {
      const t = item.table;
      if (t.heading) children.push(heading(t.heading, HeadingLevel.HEADING_2));
      if (t.rows.length === 0) {
        children.push(p(t.emptyMessage ?? 'Sem dados.'));
      } else {
        children.push(buildTable(t));
        if (t.source) children.push(source(t.source));
        else children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      }
    } else if (item.type === 'image') {
      const img = item.image;
      const targetW = 672; // ~7 polegadas, como no notebook
      const targetH = Math.round((img.height / img.width) * targetW);
      children.push(heading(img.heading, HeadingLevel.HEADING_2));
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [new ImageRun({ type: 'png', data: img.png, transformation: { width: targetW, height: targetH } })],
      }));
      children.push(source(img.source ?? 'Fonte: Comex Stat/MDIC. Elaboração própria.'));
    }
  }

  const doc = new Document({
    creator: 'Analisador Comex Stat NCM',
    title,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 850 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
