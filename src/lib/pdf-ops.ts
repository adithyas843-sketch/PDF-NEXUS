import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export function validatePdf(file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Please select a PDF file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Files must be smaller than 50 MB.');
}
export function parsePages(input: string, total: number, preserveOrder = false): number[] {
  const pages = new Set<number>();
  for (const part of input.split(',').map(s => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) { const start = Number(range[1]), end = Number(range[2]); if (start < 1 || end < start || end > total) throw new Error(`Page range must be between 1 and ${total}.`); for (let p = start; p <= end; p++) pages.add(p - 1); }
    else if (/^\d+$/.test(part)) { const p = Number(part); if (p < 1 || p > total) throw new Error(`Page number must be between 1 and ${total}.`); pages.add(p - 1); }
    else throw new Error('Use page numbers and ranges, for example 1, 3-5.');
  }
  if (!pages.size) throw new Error('Enter at least one page number.');
  return preserveOrder ? [...pages] : [...pages].sort((a,b) => a-b);
}
async function load(file: File) { validatePdf(file); try { return await PDFDocument.load(await file.arrayBuffer()); } catch { throw new Error('This PDF could not be opened. It may be damaged or password-protected.'); } }
async function save(doc: PDFDocument) { const bytes = await doc.save(); const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); return new Blob([buffer], { type: 'application/pdf' }); }
export async function mergePdfs(files: File[]) { if (files.length < 2) throw new Error('Choose at least two PDFs to merge.'); const out = await PDFDocument.create(); for (const file of files) { const doc = await load(file); const pages = await out.copyPages(doc, doc.getPageIndices()); pages.forEach(p => out.addPage(p)); } return save(out); }
export async function splitPdf(file: File, pagesInput: string) { const doc = await load(file), pages = parsePages(pagesInput, doc.getPageCount()), out = await PDFDocument.create(); (await out.copyPages(doc, pages)).forEach(p => out.addPage(p)); return save(out); }
export async function rotatePdf(file: File, angle: number, pagesInput = '') { const doc = await load(file), ids = pagesInput.trim() ? parsePages(pagesInput, doc.getPageCount()) : doc.getPageIndices(); ids.forEach(i => { const page = doc.getPage(i); page.setRotation(degrees((page.getRotation().angle + angle) % 360)); }); return save(doc); }
export async function rearrangePdf(file: File, orderInput: string, remove = false) { const doc = await load(file), order = parsePages(orderInput, doc.getPageCount(), !remove); if (!remove && order.length !== doc.getPageCount()) throw new Error(`Enter all ${doc.getPageCount()} pages in the new order.`); const ids = remove ? doc.getPageIndices().filter(i => !order.includes(i)) : order; if (!ids.length) throw new Error('A PDF must contain at least one page.'); const out = await PDFDocument.create(); (await out.copyPages(doc, ids)).forEach(p => out.addPage(p)); return save(out); }
export async function imagesToPdf(files: File[]) { if (!files.length) throw new Error('Choose at least one JPG or PNG image.'); const doc = await PDFDocument.create(); for (const f of files) { if (!/^image\/(jpeg|png)$/.test(f.type)) throw new Error('Only JPG and PNG images are supported.'); if (f.size > MAX_FILE_SIZE) throw new Error('Each image must be smaller than 50 MB.'); const bytes = await f.arrayBuffer(), image = f.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); const page = doc.addPage([image.width, image.height]); page.drawImage(image, {x:0,y:0,width:image.width,height:image.height}); } return save(doc); }
export async function addTextPdf(file: File, text: string, watermark = false) { if (!text.trim()) throw new Error('Enter the text to add.'); const doc = await load(file), font = await doc.embedFont(StandardFonts.Helvetica); for (const page of doc.getPages()) { const { width, height } = page.getSize(); page.drawText(text, { x: watermark ? width*.12 : 48, y: watermark ? height*.5 : 48, size: watermark ? Math.min(44, width*.08) : 16, font, color: rgb(.3,.34,.31), opacity: watermark ? .22 : 1, rotate: watermark ? degrees(35) : degrees(0), maxWidth: width-96 }); } return save(doc); }

export async function removePagesByIndex(file: File, selected: number[]) {
  const doc = await load(file);
  const pages = validatePageIndices(selected, doc.getPageCount());
  if (pages.length === doc.getPageCount()) throw new Error('A PDF must contain at least one page.');
  const kept = doc.getPageIndices().filter((index) => !pages.includes(index));
  const out = await PDFDocument.create();
  (await out.copyPages(doc, kept)).forEach((page) => out.addPage(page));
  return save(out);
}

export async function extractPagesByIndex(file: File, selected: number[]) {
  const doc = await load(file);
  const pages = validatePageIndices(selected, doc.getPageCount());
  const out = await PDFDocument.create();
  (await out.copyPages(doc, pages)).forEach((page) => out.addPage(page));
  return save(out);
}

export async function rotatePagesByIndex(file: File, selected: number[], angle: number) {
  if (![90, 180, 270, -90, -180, -270].includes(angle)) throw new Error('Rotation must be 90, 180, or 270 degrees.');
  const doc = await load(file);
  const pages = selected.length ? validatePageIndices(selected, doc.getPageCount()) : doc.getPageIndices();
  pages.forEach((index) => {
    const page = doc.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + angle + 360) % 360));
  });
  return save(doc);
}

export function validatePageIndices(indices: number[], total: number) {
  const unique = [...new Set(indices)];
  if (!unique.length) throw new Error('Select at least one page.');
  if (unique.some((index) => !Number.isInteger(index) || index < 0 || index >= total)) throw new Error(`Select pages between 1 and ${total}.`);
  return unique.sort((a, b) => a - b);
}

export type PdfAnnotation = {
  id: string;
  pageIndex: number;
  kind: 'text' | 'stroke' | 'highlight' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'image';
  color: string;
  width?: number;
  fontSize?: number;
  text?: string;
  points?: Array<[number, number]>;
  imageData?: string;
  imageType?: 'image/png' | 'image/jpeg';
};

function colorFromHex(value: string) {
  const hex = value.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return rgb(0.08, 0.51, 0.33);
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

export async function applyPdfAnnotations(file: File, annotations: PdfAnnotation[]) {
  const doc = await load(file);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const annotation of annotations) {
    if (!Number.isInteger(annotation.pageIndex) || annotation.pageIndex < 0 || annotation.pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(annotation.pageIndex);
    const points = annotation.points || [];
    const color = colorFromHex(annotation.color);
    const strokeWidth = Math.max(0.5, Math.min(annotation.width || 2, 24));
    if (annotation.kind === 'text') {
      if (annotation.text?.trim() && points[0]) page.drawText(annotation.text, { x: points[0][0], y: points[0][1], size: annotation.fontSize || 18, font, color, maxWidth: page.getWidth() - points[0][0] - 12, lineHeight: (annotation.fontSize || 18) * 1.25 });
    } else if (annotation.kind === 'image') {
      if (!annotation.imageData || !points[0] || !points[1]) continue;
      const binary = atob(annotation.imageData.split(',').at(-1) || '');
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const image = annotation.imageType === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      page.drawImage(image, { x: Math.min(points[0][0], points[1][0]), y: Math.min(points[0][1], points[1][1]), width: Math.abs(points[1][0] - points[0][0]), height: Math.abs(points[1][1] - points[0][1]) });
    } else if (annotation.kind === 'stroke' || annotation.kind === 'line' || annotation.kind === 'arrow') {
      for (let index = 1; index < points.length; index++) page.drawLine({ start: { x: points[index - 1][0], y: points[index - 1][1] }, end: { x: points[index][0], y: points[index][1] }, thickness: strokeWidth, color, opacity: annotation.kind === 'stroke' ? 1 : 0.9 });
      if (annotation.kind === 'arrow' && points.length >= 2) {
        const [x1, y1] = points.at(-2)!; const [x2, y2] = points.at(-1)!;
        const angle = Math.atan2(y2 - y1, x2 - x1); const length = Math.max(7, strokeWidth * 4);
        for (const offset of [-Math.PI / 6, Math.PI / 6]) page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - length * Math.cos(angle + offset), y: y2 - length * Math.sin(angle + offset) }, thickness: strokeWidth, color });
      }
    } else if (points.length >= 2) {
      const x = Math.min(points[0][0], points[1][0]); const y = Math.min(points[0][1], points[1][1]);
      const width = Math.abs(points[1][0] - points[0][0]); const height = Math.abs(points[1][1] - points[0][1]);
      if (annotation.kind === 'ellipse') page.drawEllipse({ x: x + width / 2, y: y + height / 2, xScale: width / 2, yScale: height / 2, borderColor: color, borderWidth: strokeWidth });
      else page.drawRectangle({ x, y, width, height, borderColor: annotation.kind === 'highlight' ? undefined : color, borderWidth: annotation.kind === 'highlight' ? 0 : strokeWidth, color: annotation.kind === 'highlight' ? color : undefined, opacity: annotation.kind === 'highlight' ? 0.32 : undefined, borderOpacity: 0.95 });
    }
  }
  return save(doc);
}
