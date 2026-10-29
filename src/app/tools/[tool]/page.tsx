'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ToolDialog, { ToolId } from '@/components/ToolDialog';

const tools: { id: ToolId; title: string }[] = [
  { id: 'merge', title: 'Merge PDF' }, { id: 'split', title: 'Split PDF' },
  { id: 'rotate', title: 'Rotate PDF' }, { id: 'reorder', title: 'Reorder pages' },
  { id: 'delete', title: 'Delete pages' }, { id: 'jpg-to-pdf', title: 'JPG to PDF' },
  { id: 'pdf-to-jpg', title: 'PDF to JPG' }, { id: 'add-text', title: 'Add text' },
  { id: 'watermark', title: 'Add watermark' }, { id: 'protect', title: 'Protect PDF' },
];

export default function ToolPage({ params }: { params: { tool: string } }) {
  const router = useRouter();
  const tool = tools.find((item) => item.id === params.tool);
  if (!tool) return <main className="p-8 text-center">Tool not found. <Link className="text-green" href="/">Return home</Link></main>;
  return <><header className="border-b border-line bg-white"><div className="mx-auto flex h-[70px] max-w-6xl items-center justify-between px-5"><Link href="/" className="text-[19px] font-bold tracking-[-.6px]">PDF <span className="text-green">Nexus</span></Link><Link href="/" className="text-sm font-medium text-muted hover:text-ink">All tools</Link></div></header><ToolDialog id={tool.id} title={tool.title} standalone onClose={() => router.push('/')} /><p className="pb-8 text-center text-xs text-muted">Simple PDF tools. Your documents, handled with care.</p></>;
}
