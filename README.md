# PDF Nexus

PDF Nexus is a Next.js PDF workspace with browser-based viewing, page operations, and annotations. It uses PDF.js for rendering and pdf-lib for local PDF changes. Password encryption is provided by an optional FastAPI service.

## Prerequisites

- Node.js 20 or newer and pnpm 9+
- Python 3.10 or newer for the optional password service

## Installation

```bash
corepack enable
pnpm install
```

## Local development

```bash
pnpm dev
```

Open http://localhost:3000. Browser tools accept files up to 50 MB. PDF.js's matching worker is copied from the installed dependency into `public/` before the dev server and production build.

## Features implemented

- PDF preview with page thumbnails, page numbers, a selectable text layer, page navigation, zoom, fit-to-page, and preview rotation. Thumbnails render as they approach the viewport.
- Merge multiple PDFs in a user-selected order. The file list can be reordered, and each input can be previewed.
- Remove, extract/split, rotate, and reorder pages using thumbnail selection or manual page entry. Page changes affect the exported PDF. Reordering supports drag and drop.
- Edit PDF with placed text, freehand ink, highlights, rectangles, ellipses, lines, arrows, and JPG/PNG insertion. Added objects can be selected, moved, resized where applicable, deleted, and undone/redone. An eraser removes editor-created marks.
- Convert JPG/PNG images to PDF and PDF pages to individual JPG downloads.
- Add simple text to each page, apply a text watermark, and encrypt a PDF with a password through the optional API.

## Editor and PDF limitations

- Existing PDF text is selectable when the source contains a text layer. Direct in-place editing of arbitrary original text is not supported. Added text is an overlay; deleting an overlay does not remove or redact underlying source content.
- Highlights are area annotations, not semantic text annotations. The pen is a freehand polyline. Editor annotations can be exported, but the original document's content and layout are not rewritten.
- Split/extract currently exports one selected page set as one PDF; it does not create multiple range files or a ZIP archive.
- PDF to JPG creates one download per page. Large documents can use substantial browser memory despite the 50 MB input limit.
- Password-protected input PDFs cannot be previewed or edited by the browser tools. Password encryption is supported through FastAPI; password removal/unlocking is not implemented.
- OCR, PDF compression, PDF/Office document conversion, page numbers, headers/footers, crop, compare, repair, cryptographic signatures, genuine redaction, and whiteout are not implemented. No paid API or login is required.

## Optional password-protection API

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The local default is `http://localhost:8000`. For a separately hosted API, set `NEXT_PUBLIC_PDF_API_URL` to its HTTPS origin at frontend build time. Set `PDF_NEXUS_CORS_ORIGINS` on the API to a comma-separated list of exact frontend origins. The API keeps request bytes in memory and does not persist uploads.

## Tests and checks

```bash
pnpm test
pnpm build
```

Vitest generates sample PDFs in memory and checks merge, page extraction, deletion, rotation, ordering, validation, and annotation export. For manual preview checks, use an unencrypted multi-page PDF under 50 MB with selectable text. For editor image insertion, use a JPG or PNG under 10 MB.

## Deployment

The frontend is compatible with the standard Next.js Vercel build. PDF viewing and editing run in the browser; the worker is copied into the build's public assets. Vercel does not host the optional FastAPI service: deploy it separately to a Python host, configure HTTPS and a strict CORS allowlist, and set `NEXT_PUBLIC_PDF_API_URL`. Apply request-size and execution limits at that host. Validate memory use and the deployed preview flow with representative documents before public launch.

Uploaded PDFs and images, dependency folders, build output, and environment files are excluded by `.gitignore`. `.env.example` contains only the local API URL and no secrets.
