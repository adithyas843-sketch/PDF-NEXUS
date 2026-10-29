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
