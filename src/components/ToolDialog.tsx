'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileText, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import PdfPreview from './PdfPreview';
import EditorWorkspace from './EditorWorkspace';
import {
  addTextPdf, extractPagesByIndex, imagesToPdf, mergePdfs, parsePages, rearrangePdf,
  removePagesByIndex, rotatePagesByIndex, validatePdf,
} from '@/lib/pdf-ops';

export type ToolId = 'merge' | 'split' | 'extract' | 'rotate' | 'reorder' | 'delete' | 'jpg-to-pdf' | 'pdf-to-jpg' | 'add-text' | 'watermark' | 'protect' | 'edit';
type Props = { id: ToolId; title: string; onClose: () => void; standalone?: boolean };
type ResultFile = { name: string; url: string };

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <div className="rounded border border-line p-2"><img src={url} alt={file.name} className="h-28 w-full object-contain"/><p className="mt-1 truncate text-xs text-muted">{file.name}</p></div>;
}

const pageTools: ToolId[] = ['split', 'extract', 'rotate', 'reorder', 'delete'];
const selectableTools: ToolId[] = ['split', 'extract', 'rotate', 'delete'];

export default function ToolDialog({ id, title, onClose, standalone = false }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ResultFile[]>([]);
  const [pageInput, setPageInput] = useState('');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [angle, setAngle] = useState(90);
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const imageTool = id === 'jpg-to-pdf';
  const multi = id === 'merge' || imageTool;
  const selectable = selectableTools.includes(id);
  const accept = imageTool ? 'image/jpeg,image/png' : 'application/pdf';
  const resetDocumentState = useCallback(() => {
    setError('');
    setPageInput('');
    setSelectedPages([]);
    setPageOrder([]);
    setPageCount(0);
    setResults([]);
  }, []);

  useEffect(() => () => results.forEach((result) => URL.revokeObjectURL(result.url)), [results]);

  const onPreviewReady = useCallback((count: number) => {
    setPageCount(count);
    setPageOrder(Array.from({ length: count }, (_, index) => index));
  }, []);

  function receive(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    resetDocumentState();
    if (!multi) { setFiles([]); setPreviewIndex(0); }
    try {
      for (const file of incoming) {
        if (imageTool) {
          if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose JPG or PNG images.');
          if (file.size > 50 * 1024 * 1024) throw new Error('Each image must be smaller than 50 MB.');
        } else validatePdf(file);
      }
      setFiles((current) => multi ? [...current, ...incoming] : [incoming[0]]);
      if (!multi) setPreviewIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This file cannot be used.');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    receive(event.dataTransfer.files);
  }

  function moveMergeFile(index: number, direction: -1 | 1) {
    setFiles((current) => {
      const next = [...current];
      const destination = index + direction;
      if (destination < 0 || destination >= next.length) return current;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    setResults([]);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setResults([]);
    setSelectedPages([]);
    setPageCount(0);
  }

  function selectedOrEnteredPages(): number[] {
    if (selectedPages.length) return selectedPages;
    if (pageInput.trim()) return parsePages(pageInput, pageCount);
    throw new Error('Select pages in the preview or enter page numbers.');
  }

  async function processFile() {
    if (!files.length) { setError(imageTool ? 'Select at least one image.' : 'Select a file to continue.'); return; }
    if (id === 'delete' && !window.confirm('Delete the selected pages from the exported copy? The original file will remain unchanged.')) return;
    setBusy(true); setError(''); setResults([]);
    try {
      let blob: Blob;
      let name: string;
      switch (id) {
        case 'merge':
          blob = await mergePdfs(files); name = 'merged.pdf'; break;
        case 'split':
        case 'extract':
          blob = await extractPagesByIndex(files[0], selectedOrEnteredPages()); name = id === 'split' ? 'split-pages.pdf' : 'extracted-pages.pdf'; break;
        case 'rotate':
          blob = await rotatePagesByIndex(files[0], selectedPages, angle); name = 'rotated.pdf'; break;
        case 'reorder': {
          const order = pageInput.trim() ? parsePages(pageInput, pageCount, true) : pageOrder;
          blob = await rearrangePdf(files[0], order.map((page) => page + 1).join(',')); name = 'reordered.pdf'; break;
        }
        case 'delete':
          blob = await removePagesByIndex(files[0], selectedOrEnteredPages()); name = 'pages-removed.pdf'; break;
        case 'jpg-to-pdf':
          blob = await imagesToPdf(files); name = 'images.pdf'; break;
        case 'add-text':
          blob = await addTextPdf(files[0], text); name = 'text-added.pdf'; break;
        case 'watermark':
          blob = await addTextPdf(files[0], text, true); name = 'watermarked.pdf'; break;
        case 'pdf-to-jpg': {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          const pdf = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
          const outputs: ResultFile[] = [];
          for (let number = 1; number <= pdf.numPages; number++) {
            const page = await pdf.getPage(number);
            const viewport = page.getViewport({ scale: 1.35 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not initialize the image renderer.');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;
            const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create the JPG image.')), 'image/jpeg', .9));
            outputs.push({ name: `page-${number}.jpg`, url: URL.createObjectURL(image) });
          }
          setResults(outputs); return;
        }
        case 'protect': {
          if (!password.trim()) throw new Error('Enter a password.');
          const response = await fetch(`${process.env.NEXT_PUBLIC_PDF_API_URL || 'http://localhost:8000'}/protect`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdf: await fileToBase64(files[0]), password }),
          });
          if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail || 'Password protection service is unavailable.'); }
          blob = await response.blob(); name = 'protected.pdf'; break;
        }
        default: return;
      }
      setResults([{ name, url: URL.createObjectURL(blob) }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process this document.');
    } finally { setBusy(false); }
  }

  async function fileToBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }

  const previewFile = imageTool ? null : files[Math.min(previewIndex, Math.max(0, files.length - 1))];
  const pageRotations = useMemo(() => {
    if (id !== 'rotate') return undefined;
    const targets = selectedPages.length ? selectedPages : Array.from({ length: pageCount }, (_, index) => index);
    return Object.fromEntries(targets.map((index) => [index, angle]));
  }, [id, selectedPages, pageCount, angle]);

  return <div className={standalone ? 'min-h-screen bg-[#fcfdfc] px-4 py-6' : 'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#101812]/45 p-3 sm:p-6'} onMouseDown={(event) => { if (!standalone && event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal={standalone ? undefined : true} aria-labelledby="dialog-title" className={`${standalone ? 'mx-auto' : 'my-auto'} w-full max-w-6xl rounded-xl border border-line bg-white shadow-xl`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="dialog-title" className="text-base font-bold">{title}</h2><p className="mt-1 text-xs text-muted">PDF previews and local tools run in your browser.</p></div><button aria-label="Close" onClick={onClose} className="rounded-md p-2 text-muted hover:bg-[#f3f6f3]"><X size={18}/></button></div>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(260px,330px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} className={`cursor-pointer rounded-lg border border-dashed p-6 text-center transition ${dragging ? 'border-green bg-mint' : 'border-[#d7dfd9] hover:border-green hover:bg-[#fbfdfb]'}`}>
            <input ref={inputRef} type="file" multiple={multi} accept={accept} className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => receive(event.target.files)}/>
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-mint text-green"><Upload size={18}/></span>
            <p className="mt-3 text-sm font-semibold">Drop files here or <span className="text-green">browse</span></p>
            <p className="mt-1 text-xs text-muted">{imageTool ? 'JPG or PNG images' : 'PDF documents'} · up to 50 MB each</p>
          </div>

          {files.length > 0 && <div className="space-y-2" aria-label="Selected files">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2">
            <FileText size={16} className="shrink-0 text-green"/><button type="button" onClick={() => setPreviewIndex(index)} className="min-w-0 flex-1 truncate text-left text-xs font-medium" title={`Preview ${file.name}`}>{file.name}<span className="ml-1.5 font-normal text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span></button>
            {id === 'merge' && <><button type="button" onClick={() => moveMergeFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`} className="rounded p-1 text-muted disabled:opacity-30"><ArrowUp size={14}/></button><button type="button" onClick={() => moveMergeFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`} className="rounded p-1 text-muted disabled:opacity-30"><ArrowDown size={14}/></button></>}
            {multi && <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} className="rounded p-1 text-muted hover:text-red-600"><Trash2 size={14}/></button>}
          </div>)}{multi && <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1 text-xs font-semibold text-green"><Plus size={14}/> Add more files</button>}</div>}

          {pageTools.includes(id) && id !== 'rotate' && <label className="block text-xs font-semibold text-ink">{id === 'reorder' ? 'Manual order' : `${id === 'delete' ? 'Pages to remove' : id === 'split' ? 'Pages to split/extract' : 'Pages to extract'}`}<input value={pageInput} onChange={(event) => setPageInput(event.target.value)} placeholder={id === 'reorder' ? '3, 1, 2' : '1, 3-5'} className="mt-1.5 w-full rounded-md border border-line px-3 py-2.5 text-sm font-normal outline-none focus:border-green"/><span className="mt-1 block font-normal text-muted">{id === 'reorder' ? 'You can also drag thumbnails to reorder.' : 'You can select thumbnail checkmarks or enter page numbers.'}</span></label>}
          {id === 'rotate' && <label className="block text-xs font-semibold">Rotation<select value={angle} onChange={(event) => setAngle(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm font-normal"><option value={90}>90° clockwise</option><option value={-90}>90° anticlockwise</option><option value={180}>180°</option><option value={270}>270° clockwise</option></select><span className="mt-1 block font-normal text-muted">The preview shows this rotation. Select pages, or leave them unselected to rotate every page.</span></label>}
          {['add-text', 'watermark'].includes(id) && <label className="block text-xs font-semibold">Text<input value={text} onChange={(event) => setText(event.target.value)} placeholder={id === 'watermark' ? 'CONFIDENTIAL' : 'Type your note'} className="mt-1.5 w-full rounded-md border border-line px-3 py-2.5 text-sm font-normal outline-none focus:border-green"/><span className="mt-1 block font-normal text-muted">This simple tool places the same text on each page. Use Edit PDF to place objects visually.</span></label>}
          {id === 'protect' && <><label className="block text-xs font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter a password" className="mt-1.5 w-full rounded-md border border-line px-3 py-2.5 text-sm font-normal outline-none focus:border-green"/></label><p className="text-xs leading-5 text-muted">Uses the optional FastAPI service. The selected PDF is sent to that service for encryption.</p></>}
          {files.length > 0 && id !== 'edit' && <button type="button" onClick={processFile} disabled={busy || (pageTools.includes(id) && pageCount === 0)} className="flex w-full items-center justify-center gap-2 rounded-md bg-green px-4 py-3 text-sm font-semibold text-white hover:bg-[#116b44] disabled:cursor-wait disabled:opacity-60">{busy ? <><LoaderCircle size={16} className="animate-spin"/> Processing…</> : 'Process PDF'}</button>}
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          {results.length > 0 && <div className="rounded-md border border-[#cfe6d7] bg-[#f4fbf6] p-3"><p className="mb-2 text-xs font-semibold text-green">Processing complete</p>{results.map((result) => <a key={result.url} href={result.url} download={result.name} className="flex items-center justify-between border-t border-[#dceee2] py-2 text-xs font-medium text-ink"><span>{result.name}</span><span className="flex items-center gap-1 text-green">Download <Download size={14}/></span></a>)}</div>}
        </div>

        <div className="min-w-0 space-y-3">
          {id === 'merge' && files.length > 1 && <p className="text-xs text-muted">Merge order follows the file list. Use the up/down buttons to change it.</p>}
          {id === 'edit' && previewFile && <EditorWorkspace file={previewFile}/>}
          {id !== 'edit' && previewFile && <PdfPreview key={`${previewFile.name}-${previewFile.lastModified}-${id}`} file={previewFile} selectable={selectable} selectedPages={selectedPages} onSelectedPagesChange={setSelectedPages} onReady={onPreviewReady} onPageOrderChange={id === 'reorder' ? setPageOrder : undefined} pageRotations={pageRotations}/ >}
          {!files.length && <div className="grid min-h-[300px] place-items-center rounded-lg border border-line bg-[#fbfcfb] p-6 text-center text-sm text-muted">Choose a file to preview the document and start.</div>}
          {imageTool && files.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{files.map((file, index) => <ImagePreview key={`${file.name}-${index}`} file={file}/>)}</div>}
        </div>
      </div>
    </section>
  </div>;
}
