'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw } from 'lucide-react';

type PdfDocument = any;
type Props = {
  file: File;
  selectable?: boolean;
  selectedPages?: number[];
  onSelectedPagesChange?: (pages: number[]) => void;
  pageOrder?: number[];
  onPageOrderChange?: (order: number[]) => void;
  pageRotations?: Record<number, number>;
  onReady?: (pageCount: number) => void;
  onError?: (message: string) => void;
  overlay?: (context: { pageNumber: number; viewport: any }) => ReactNode;
};

function PageThumbnail({
  document,
  pageNumber,
  active,
  checked,
  onOpen,
  onToggle,
  onDragStart,
  onDrop,
  onMovePrevious,
  onMoveNext,
}: {
  document: PdfDocument;
  pageNumber: number;
  active: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggle?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
  onMovePrevious?: () => void;
  onMoveNext?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: any;
    if (!visible || !canvasRef.current) return;
    (async () => {
      try {
        const page = await document.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(132 / base.width, 170 / base.height);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = page.render({ canvasContext: context, viewport });
        await task.promise;
      } catch {
        // A failed thumbnail does not block the main page preview.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [document, pageNumber, visible]);

  return <div ref={hostRef} draggable={!!onDragStart} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop?.(); }} className={`relative shrink-0 rounded-md border p-1 ${active ? 'border-green bg-mint' : 'border-line bg-white'} ${onDragStart ? 'cursor-grab' : ''}`}>
    <button type="button" onClick={onOpen} className="flex min-h-[154px] w-[142px] flex-col items-center justify-center gap-2 rounded text-xs text-muted focus:outline-none focus:ring-2 focus:ring-green" aria-label={`Open page ${pageNumber}`}>
      <canvas ref={canvasRef} className="max-h-[136px] max-w-[132px] bg-white shadow-sm" />
      <span>Page {pageNumber}</span>
    </button>
    {onToggle && <button type="button" onClick={onToggle} aria-pressed={checked} aria-label={`${checked ? 'Deselect' : 'Select'} page ${pageNumber}`} className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded border text-[11px] font-bold ${checked ? 'border-green bg-green text-white' : 'border-[#8a968e] bg-white text-transparent'}`}>
      ✓
    </button>}
    {(onMovePrevious || onMoveNext) && <div className="absolute left-2 top-2 flex gap-1">{onMovePrevious && <button type="button" onClick={onMovePrevious} aria-label={`Move page ${pageNumber} earlier`} className="grid h-6 w-6 place-items-center rounded border border-line bg-white text-muted shadow-sm"><ChevronLeft size={14}/></button>}{onMoveNext && <button type="button" onClick={onMoveNext} aria-label={`Move page ${pageNumber} later`} className="grid h-6 w-6 place-items-center rounded border border-line bg-white text-muted shadow-sm"><ChevronRight size={14}/></button>}</div>}
  </div>;
}

export default function PdfPreview({ file, selectable = false, selectedPages = [], onSelectedPagesChange, pageOrder, onPageOrderChange, pageRotations, onReady, onError, overlay }: Props) {
  const [pdf, setPdf] = useState<PdfDocument>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const draggingRef = useRef<number | null>(null);
  const [internalOrder, setInternalOrder] = useState<number[]>([]);
  const [viewportState, setViewportState] = useState<any>(null);

  useEffect(() => {
    let disposed = false;
    let loadingTask: any;
    setLoading(true);
    setError('');
    setPdf(null);
    setPageNumber(1);
    setPageCount(0);
    setRotation(0);
    setViewportState(null);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const data = new Uint8Array(await file.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data, stopAtErrors: true, useSystemFonts: true });
        const document = await loadingTask.promise;
        if (disposed) {
          await document.destroy();
          return;
        }
        setPdf(document);
        setPageCount(document.numPages);
        setInternalOrder(Array.from({ length: document.numPages }, (_, index) => index));
        onReady?.(document.numPages);
      } catch (cause) {
        const message = cause instanceof Error && /password/i.test(cause.message)
          ? 'This PDF is password-protected. Unlock it with the password before previewing.'
          : 'This PDF could not be displayed. It may be damaged, encrypted, or unsupported.';
        if (!disposed) {
          setError(message);
          onError?.(message);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      loadingTask?.destroy?.();
    };
  }, [file, onError, onReady]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any;
    let textLayer: any;
    if (!pdf || !canvasRef.current || !textLayerRef.current) return;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const pageRotation = pageRotations?.[pageNumber - 1] || 0;
        const baseViewport = page.getViewport({ scale: 1, rotation: (page.rotate + pageRotation + rotation + 360) % 360 });
        const fitScale = Math.min(1, 760 / baseViewport.width, 820 / baseViewport.height);
        const viewport = page.getViewport({ scale: fitScale * scale, rotation: (page.rotate + pageRotation + rotation + 360) % 360 });
        setViewportState(viewport);
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || cancelled) return;
        canvas.width = Math.ceil(viewport.width * dpr);
        canvas.height = Math.ceil(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvasContext: context, viewport, ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] }) });
        await renderTask.promise;
        if (cancelled) return;
        const layer = textLayerRef.current;
        if (!layer) return;
        layer.replaceChildren();
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        const pdfjs = await import('pdfjs-dist');
        textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true }), container: layer, viewport });
        await textLayer.render();
      } catch (cause) {
        if (!cancelled && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) {
          setError('This page could not be rendered. Try another page or a smaller PDF.');
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
    };
  }, [pdf, pageNumber, scale, rotation, pageRotations]);

  const togglePage = (index: number) => {
    const next = selectedPages.includes(index) ? selectedPages.filter((page) => page !== index) : [...selectedPages, index].sort((a, b) => a - b);
    onSelectedPagesChange?.(next);
  };
  const reorder = (destination: number) => {
    const source = draggingRef.current;
    const currentOrder = pageOrder?.length === pageCount ? pageOrder : internalOrder;
    if (!onPageOrderChange || source === null || source === destination) return;
    const next = [...currentOrder];
    const [moved] = next.splice(source, 1);
    next.splice(destination, 0, moved);
    setInternalOrder(next);
    onPageOrderChange(next);
    draggingRef.current = null;
  };

  return <div className="overflow-hidden rounded-lg border border-line bg-[#f8faf8]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPageNumber((n) => Math.max(1, n - 1))} disabled={pageNumber <= 1} className="rounded border border-line p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16}/></button>
        <label className="text-xs text-muted">Page <input aria-label="Current page" type="number" min={1} max={pageCount} value={pageNumber} onChange={(e) => setPageNumber(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))} className="w-14 rounded border border-line px-2 py-1 text-center text-ink"/> of {pageCount || '—'}</label>
        <button type="button" onClick={() => setPageNumber((n) => Math.min(pageCount, n + 1))} disabled={pageNumber >= pageCount} className="rounded border border-line p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={16}/></button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setScale((n) => Math.max(.5, +(n - .15).toFixed(2)))} className="rounded border border-line p-1.5" aria-label="Zoom out"><Minus size={15}/></button>
        <span className="w-12 text-center text-xs text-muted">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((n) => Math.min(2.5, +(n + .15).toFixed(2)))} className="rounded border border-line p-1.5" aria-label="Zoom in"><Plus size={15}/></button>
        <button type="button" onClick={() => setScale(1)} className="rounded border border-line px-2 py-1.5 text-xs text-muted">Fit</button>
        <button type="button" onClick={() => setRotation((n) => (n + 90) % 360)} className="rounded border border-line p-1.5" aria-label="Rotate preview clockwise"><RotateCw size={15}/></button>
      </div>
    </div>
    {selectable && <div className="border-b border-line bg-white px-3 py-2 text-xs text-muted">Select pages using the checkmarks. <span className="font-semibold text-ink">{selectedPages.length} selected</span></div>}
    {error && <p role="alert" className="m-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    {loading ? <div className="grid min-h-[350px] place-items-center text-sm text-muted" role="status">Loading PDF preview…</div> : error && !pdf ? <div className="grid min-h-[240px] place-items-center px-6 text-center text-sm text-muted">Preview unavailable</div> : <>
      <div className="flex min-h-[440px] justify-center overflow-auto p-4 sm:min-h-[650px]">
        <div className="relative h-fit max-w-full bg-white shadow-md">
          <canvas ref={canvasRef} className="block max-w-none" />
          <div ref={textLayerRef} className="textLayer" />
          {overlay && viewportState && <div className="absolute inset-0 z-[2]" style={{ width: viewportState.width, height: viewportState.height }}>{overlay({ pageNumber, viewport: viewportState })}</div>}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-t border-line bg-white p-3" aria-label="PDF page thumbnails">
        {pdf && (pageOrder?.length === pageCount ? pageOrder : internalOrder).map((index, position, order) => <PageThumbnail key={`${file.name}-${index + 1}`} document={pdf} pageNumber={index + 1} active={pageNumber === index + 1} checked={selectedPages.includes(index)} onOpen={() => setPageNumber(index + 1)} onToggle={selectable ? () => togglePage(index) : undefined} onDragStart={onPageOrderChange ? () => { draggingRef.current = position; } : undefined} onDrop={onPageOrderChange ? () => reorder(position) : undefined} onMovePrevious={onPageOrderChange && position > 0 ? () => { draggingRef.current = position; reorder(position - 1); } : undefined} onMoveNext={onPageOrderChange && position < order.length - 1 ? () => { draggingRef.current = position; reorder(position + 1); } : undefined}/>)}
      </div>
    </>}
  </div>;
}
