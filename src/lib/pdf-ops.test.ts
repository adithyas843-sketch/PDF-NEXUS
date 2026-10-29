import { describe,expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePdfs,parsePages,rearrangePdf,rotatePdf,splitPdf } from './pdf-ops';
async function sample(count:number){const doc=await PDFDocument.create();for(let i=0;i<count;i++)doc.addPage([612,792]);return new File([await doc.save()],`sample-${count}.pdf`,{type:'application/pdf'});}
describe('PDF operations',()=>{
 it('parses page selections and ranges into zero-based indices',()=>{expect(parsePages('4, 1-2',5)).toEqual([0,1,3]);expect(parsePages('3,1,2',3,true)).toEqual([2,0,1]);});
 it('rejects invalid page selections',()=>{expect(()=>parsePages('1,7',5)).toThrow();});
 it('merges documents',async()=>{const result=await mergePdfs([await sample(2),await sample(1)]);expect((await PDFDocument.load(await result.arrayBuffer())).getPageCount()).toBe(3);});
 it('extracts selected pages',async()=>{const result=await splitPdf(await sample(4),'2,4');expect((await PDFDocument.load(await result.arrayBuffer())).getPageCount()).toBe(2);});
 it('rotates selected pages',async()=>{const result=await rotatePdf(await sample(2),90,'1');const doc=await PDFDocument.load(await result.arrayBuffer());expect(doc.getPage(0).getRotation().angle).toBe(90);expect(doc.getPage(1).getRotation().angle).toBe(0);});
 it('reorders and deletes selected pages',async()=>{const file=await sample(3);const reordered=await rearrangePdf(file,'3,1,2');expect((await PDFDocument.load(await reordered.arrayBuffer())).getPageCount()).toBe(3);const removed=await rearrangePdf(file,'2',true);expect((await PDFDocument.load(await removed.arrayBuffer())).getPageCount()).toBe(2);});
});
