'use client';

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, Circle, Download, Eraser, Highlighter, ImagePlus, Minus, MousePointer2, Pencil, Redo2, Square, Type, Undo2 } from 'lucide-react';
import PdfPreview from './PdfPreview';
import { applyPdfAnnotations, PdfAnnotation } from '@/lib/pdf-ops';

type Tool = 'select' | 'text' | 'pen' | 'highlighter' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'eraser';
type Point = [number, number];
const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select and move', icon: MousePointer2 }, { id: 'text', label: 'Add text', icon: Type },
  { id: 'pen', label: 'Pencil / pen', icon: Pencil }, { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { id: 'rectangle', label: 'Rectangle', icon: Square }, { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus }, { id: 'arrow', label: 'Arrow', icon: ArrowRight }, { id: 'eraser', label: 'Erase an added mark', icon: Eraser },
];

export default function EditorWorkspace({ file }: { file: File }) {
  const [history, setHistory] = useState<PdfAnnotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#e33c35');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(18);
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PdfAnnotation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const viewportRef = useRef<any>(null);
  const currentPageRef = useRef(1);
  const dragRef = useRef<{ id: string; start: Point; original: PdfAnnotation; mode: 'move' | 'resize' } | null>(null);
  const annotations = history[historyIndex] || [];
  const selectedText = annotations.find((item) => item.id === selectedId && item.kind === 'text');

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); removeSelected(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function commit(next: PdfAnnotation[]) {
    const kept = history.slice(0, historyIndex + 1);
    kept.push(next);
    setHistory(kept);
    setHistoryIndex(kept.length - 1);
    setError('');
  }
  function undo() { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setSelectedId(null); } }
  function redo() { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); setSelectedId(null); } }
  function removeSelected() { if (selectedId) { commit(annotations.filter((item) => item.id !== selectedId)); setSelectedId(null); } }

  function pdfPoint(clientX: number, clientY: number, svg: SVGSVGElement, viewport: any): Point {
    const rect = svg.getBoundingClientRect();
    return viewport.convertToPdfPoint(clientX - rect.left, clientY - rect.top) as Point;
  }

  function startDrawing(event: ReactPointerEvent<SVGSVGElement>, viewport: any, pageNumber: number) {
    if (tool === 'select') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pdfPoint(event.clientX, event.clientY, event.currentTarget, viewport);
    if (tool === 'text') {
      if (!text.trim()) { setError('Enter text in the editor toolbar, then click on the page to place it.'); return; }
      commit([...annotations, { id: crypto.randomUUID(), pageIndex: pageNumber - 1, kind: 'text', text, color, fontSize, points: [point] }]);
      setSelectedId(null);
      return;
    }
    if (tool === 'eraser') {
      const near = annotations.find((item) => item.pageIndex === pageNumber - 1 && item.points?.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 18));
      if (near) commit(annotations.filter((item) => item.id !== near.id));
      return;
    }
    const kind: PdfAnnotation['kind'] = tool === 'pen' ? 'stroke' : tool === 'highlighter' ? 'highlight' : tool;
    const item: PdfAnnotation = { id: crypto.randomUUID(), pageIndex: pageNumber - 1, kind, color, width: strokeWidth, points: [point, point] };
    setDraft(item);
  }

  function moveDrawing(event: ReactPointerEvent<SVGSVGElement>, viewport: any) {
    if (dragRef.current) {
      const point = pdfPoint(event.clientX, event.clientY, event.currentTarget, viewport);
      const { id, start, original, mode } = dragRef.current;
      const dx = point[0] - start[0], dy = point[1] - start[1];
      const nextPoints = original.points?.map(([x, y]) => [x + dx, y + dy] as Point) || [];
      if (mode === 'resize' && nextPoints.length > 1) nextPoints[nextPoints.length - 1] = point;
      setDraft({ ...original, points: nextPoints });
    } else if (draft) {
      const point = pdfPoint(event.clientX, event.clientY, event.currentTarget, viewport);
      const points = draft.points || [];
      setDraft({ ...draft, points: draft.kind === 'stroke' ? [...points, point] : [points[0], point] });
    }
  }

  function finishDrawing() {
    if (dragRef.current && draft) {
      const updated = annotations.map((item) => item.id === draft.id ? draft : item);
      commit(updated);
      dragRef.current = null;
      setDraft(null);
    } else if (draft) {
      if (draft.points && draft.points.length > 1 && Math.hypot(draft.points[1][0] - draft.points[0][0], draft.points[1][1] - draft.points[0][1]) > 1) commit([...annotations, draft]);
      setDraft(null);
    }
  }

  function annotationPointerDown(event: ReactPointerEvent<SVGGElement>, item: PdfAnnotation, viewport: any) {
    event.stopPropagation();
    setSelectedId(item.id);
    if (item.kind === 'text') setText(item.text || '');
    if (tool === 'select') {
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      const point = pdfPoint(event.clientX, event.clientY, svg, viewport);
      const mode = (event.target as Element).getAttribute('data-resize-handle') === 'true' ? 'resize' : 'move';
      dragRef.current = { id: item.id, start: point, original: item, mode };
      setDraft(item);
      (event.currentTarget.ownerSVGElement as SVGSVGElement)?.setPointerCapture(event.pointerId);
    } else if (tool === 'eraser') commit(annotations.filter((annotation) => annotation.id !== item.id));
  }

  function renderOverlay({ pageNumber, viewport }: { pageNumber: number; viewport: any }) {
    viewportRef.current = viewport;
    currentPageRef.current = pageNumber;
    const shown = [...annotations.filter((item) => item.pageIndex === pageNumber - 1), ...(draft?.pageIndex === pageNumber - 1 && !annotations.some((item) => item.id === draft.id) ? [draft] : [])];
    const toScreen = (point: Point) => viewport.convertToViewportPoint(point[0], point[1]) as Point;
    const xy = (item: PdfAnnotation) => (item.points || []).map(toScreen);
    return <svg width={viewport.width} height={viewport.height} viewBox={`0 0 ${viewport.width} ${viewport.height}`} className="absolute inset-0 h-full w-full touch-none" style={{ pointerEvents: tool === 'select' ? 'none' : 'auto' }} onPointerDown={(event) => startDrawing(event, viewport, pageNumber)} onPointerMove={(event) => moveDrawing(event, viewport)} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}>
      <defs><marker id="pdf-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill={color}/></marker></defs>
      {shown.map((item) => {
        const points = xy(item);
        const first = points[0] || [0, 0]; const last = points.at(-1) || first;
        const left = Math.min(first[0], last[0]), top = Math.min(first[1], last[1]);
        const width = Math.max(1, Math.abs(last[0] - first[0])), height = Math.max(1, Math.abs(last[1] - first[1]));
        const selected = selectedId === item.id;
        return <g key={item.id} onPointerDown={(event) => annotationPointerDown(event, item, viewport)} className={selected ? 'cursor-move' : 'cursor-pointer'} style={{ pointerEvents: 'auto' }}>
          <rect x={left - 5} y={top - 5} width={width + 10} height={height + 10} fill="transparent" pointerEvents="all"/>
          {item.kind === 'text' && <text x={first[0]} y={first[1]} fill={item.color} fontSize={(item.fontSize || 18) * viewport.scale} fontFamily="Arial" dominantBaseline="text-after-edge">{item.text}</text>}
          {item.kind === 'image' && item.imageData && <image href={item.imageData} x={left} y={top} width={width} height={height} preserveAspectRatio="none"/>}
          {item.kind === 'stroke' && points.length > 1 && <polyline points={points.map((point) => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={(item.width || 2) * viewport.scale} strokeLinecap="round" strokeLinejoin="round"/>}
          {item.kind === 'highlight' && <rect x={left} y={top} width={width} height={height} fill={item.color} fillOpacity=".32"/>}
          {item.kind === 'rectangle' && <rect x={left} y={top} width={width} height={height} fill="none" stroke={item.color} strokeWidth={(item.width || 2) * viewport.scale}/>}
          {item.kind === 'ellipse' && <ellipse cx={(first[0] + last[0]) / 2} cy={(first[1] + last[1]) / 2} rx={width / 2} ry={height / 2} fill="none" stroke={item.color} strokeWidth={(item.width || 2) * viewport.scale}/>}
          {(item.kind === 'line' || item.kind === 'arrow') && points.length > 1 && <line x1={first[0]} y1={first[1]} x2={last[0]} y2={last[1]} stroke={item.color} strokeWidth={(item.width || 2) * viewport.scale} markerEnd={item.kind === 'arrow' ? 'url(#pdf-arrowhead)' : undefined}/>}
          {selected && <rect x={left - 4} y={top - 4} width={width + 8} height={height + 8} fill="none" stroke="#178153" strokeDasharray="4 3" pointerEvents="none"/>}
          {selected && item.kind !== 'text' && item.kind !== 'stroke' && <circle data-resize-handle="true" cx={last[0]} cy={last[1]} r="5" fill="white" stroke="#178153" strokeWidth="2" className="cursor-nwse-resize"/>}
        </g>;
      })}
    </svg>;
  }

  async function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const viewport = viewportRef.current;
    if (!file || !viewport) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Choose a JPG or PNG under 10 MB.'); return; }
    const imageData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); });
    const p1 = viewport.convertToPdfPoint(viewport.width * .3, viewport.height * .35) as Point;
    const p2 = viewport.convertToPdfPoint(viewport.width * .65, viewport.height * .65) as Point;
    const points: Point[] = [[Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1])], [Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])]];
    const pageIndex = currentPageRef.current - 1;
    commit([...annotations, { id: crypto.randomUUID(), pageIndex: Math.max(0, pageIndex), kind: 'image', color, points, imageData, imageType: file.type as 'image/png' | 'image/jpeg' }]);
    event.target.value = '';
  }

  async function exportPdf() {
    setBusy(true); setError('');
    try {
      const blob = await applyPdfAnnotations(file, annotations);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PDF could not be exported.');
    } finally { setBusy(false); }
  }

  const activeTool = tools.find((item) => item.id === tool);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2">
      {tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTool(id)} title={label} aria-label={label} aria-pressed={tool === id} className={`rounded-md border p-2 ${tool === id ? 'border-green bg-mint text-green' : 'border-transparent text-muted hover:bg-[#f3f6f3]'}`}><Icon size={17}/></button>)}
      <label className="ml-1 flex items-center gap-2 border-l border-line pl-3 text-xs text-muted">Color <input type="color" value={color} onChange={(event) => { const value = event.target.value; setColor(value); if (selectedText) commit(annotations.map((item) => item.id === selectedText.id ? { ...item, color: value } : item)); }} className="h-8 w-9 cursor-pointer border-0 bg-transparent p-0"/></label>
      <div className="flex items-center gap-1" aria-label="Color palette">{['#e33c35','#f2c94c','#2684ff','#178153','#26332b','#ffffff'].map((swatch) => <button key={swatch} type="button" onClick={() => setColor(swatch)} aria-label={`Choose ${swatch}`} className={`h-5 w-5 rounded-full border ${color === swatch ? 'ring-2 ring-green ring-offset-1' : 'border-black/15'}`} style={{ backgroundColor: swatch }}/>)}</div>
      <label className="flex items-center gap-2 text-xs text-muted">Stroke <input type="range" min={1} max={12} value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} className="w-16"/></label>
      <label className="flex items-center gap-1 text-xs text-muted">Text size <input type="number" min={8} max={72} value={selectedText?.fontSize || fontSize} onChange={(event) => { const value = Math.max(8, Math.min(72, Number(event.target.value))); setFontSize(value); if (selectedText) commit(annotations.map((item) => item.id === selectedText.id ? { ...item, fontSize: value } : item)); }} className="w-14 rounded border border-line px-1.5 py-1"/></label>
      <button type="button" onClick={undo} disabled={historyIndex === 0} aria-label="Undo" className="rounded border border-line p-2 disabled:opacity-40"><Undo2 size={16}/></button>
      <button type="button" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Redo" className="rounded border border-line p-2 disabled:opacity-40"><Redo2 size={16}/></button>
      <button type="button" onClick={removeSelected} disabled={!selectedId} className="rounded border border-line px-2 py-1.5 text-xs text-muted disabled:opacity-40">Delete</button>
      <label className="flex cursor-pointer items-center gap-1 rounded border border-line px-2 py-1.5 text-xs text-muted"><ImagePlus size={14}/> Add image<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={insertImage}/></label>
      <button type="button" onClick={exportPdf} disabled={busy} className="ml-auto rounded-md bg-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Exporting…' : 'Export PDF'}</button>
    </div>
    {(tool === 'text' || selectedText) && <label className="block text-xs text-muted">{selectedText ? 'Edit selected text overlay' : 'Text to place on the page'}<textarea value={selectedText ? selectedText.text || '' : text} onChange={(event) => setText(event.target.value)} onBlur={() => { if (selectedText && text !== selectedText.text) commit(annotations.map((item) => item.id === selectedText.id ? { ...item, text } : item)); }} rows={2} className="mt-1 block w-full rounded-md border border-line p-2 text-sm text-ink" placeholder="Enter text, then click where it should appear"/></label>}
    <p className="text-xs text-muted">Active tool: <span className="font-semibold text-ink">{activeTool?.label || tool}</span>. Added items can be selected, moved, deleted, and undone. Existing PDF text is selectable when available. Editing it in place is unsupported; added text and shapes are overlays, and removing an overlay does not remove original PDF content.</p>
    {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    {downloadUrl && <a href={downloadUrl} download="edited.pdf" className="flex items-center justify-between rounded-md border border-[#cfe6d7] bg-[#f4fbf6] px-3 py-2 text-sm font-semibold text-green"><span>Export ready — download edited PDF</span><Download size={16}/></a>}
    <PdfPreview file={file} overlay={renderOverlay}/>
  </div>;
}
