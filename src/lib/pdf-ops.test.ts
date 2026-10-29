import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  addTextPdf, applyPdfAnnotations, extractPagesByIndex, mergePdfs, parsePages,
  rearrangePdf, removePagesByIndex, rotatePagesByIndex, splitPdf,
} from './pdf-ops';

async function sample(count: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([612 + i * 10, 792]);
  const bytes = await doc.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], `sample-${count}.pdf`, { type: 'application/pdf' });
}

async function load(blob: Blob) {
  return PDFDocument.load(await blob.arrayBuffer());
}

describe('PDF operations', () => {
  it('parses page selections and ranges into zero-based indices', () => {
    expect(parsePages('4, 1-2', 5)).toEqual([0, 1, 3]);
    expect(parsePages('3,1,2', 3, true)).toEqual([2, 0, 1]);
    expect(() => parsePages('1,7', 5)).toThrow();
  });

  it('merges documents in the input order', async () => {
    const output = await load(await mergePdfs([await sample(2), await sample(1)]));
    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(2).getWidth()).toBe(612);
  });

  it('extracts selected pages and supports page ranges', async () => {
    const file = await sample(4);
    const selected = await load(await extractPagesByIndex(file, [1, 3]));
    const ranged = await load(await splitPdf(file, '2,4'));
    expect(selected.getPageCount()).toBe(2);
    expect(selected.getPage(1).getWidth()).toBe(ranged.getPage(1).getWidth());
  });

  it('rotates only the selected pages', async () => {
    const file = await sample(2);
    const output = await load(await rotatePagesByIndex(file, [0], 90));
    expect(output.getPage(0).getRotation().angle).toBe(90);
    expect(output.getPage(1).getRotation().angle).toBe(0);
  });

  it('reorders selected pages and verifies their actual positions', async () => {
    const output = await load(await rearrangePdf(await sample(3), '3,1,2'));
    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(0).getWidth()).toBe(632);
    expect(output.getPage(1).getWidth()).toBe(612);
  });

  it('deletes selected pages and leaves the original unchanged', async () => {
    const original = await sample(3);
    const removed = await load(await removePagesByIndex(original, [1]));
    expect(removed.getPageCount()).toBe(2);
    expect((await PDFDocument.load(await original.arrayBuffer())).getPageCount()).toBe(3);
    await expect(removePagesByIndex(original, [0, 1, 2])).rejects.toThrow('A PDF must contain at least one page.');
  });

  it('writes text, ink, highlights, shapes, arrows, and images into an actual PDF', async () => {
    const file = await sample(1);
    const textOutput = await addTextPdf(file, 'Added text');
    const annotated = await applyPdfAnnotations(file, [
      { id: 'text', pageIndex: 0, kind: 'text', text: 'Editor text', color: '#26332b', fontSize: 18, points: [[40, 700]] },
      { id: 'ink', pageIndex: 0, kind: 'stroke', color: '#e33c35', width: 3, points: [[20, 20], [40, 40]] },
      { id: 'highlight', pageIndex: 0, kind: 'highlight', color: '#f2c94c', points: [[10, 50], [100, 80]] },
      { id: 'rectangle', pageIndex: 0, kind: 'rectangle', color: '#2684ff', points: [[120, 50], [170, 90]] },
      { id: 'ellipse', pageIndex: 0, kind: 'ellipse', color: '#178153', points: [[200, 50], [250, 100]] },
      { id: 'arrow', pageIndex: 0, kind: 'arrow', color: '#26332b', points: [[260, 50], [320, 90]] },
      { id: 'image', pageIndex: 0, kind: 'image', color: '#26332b', imageType: 'image/png', imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', points: [[330, 50], [350, 70]] },
    ]);
    expect((await load(textOutput)).getPageCount()).toBe(1);
    expect((await load(annotated)).getPageCount()).toBe(1);
    expect(annotated.size).toBeGreaterThan(file.size);
  });
});
