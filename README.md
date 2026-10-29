# PDF Nexus

A minimal, responsive PDF workspace built with Next.js, TypeScript, Tailwind CSS, PDF.js, and pdf-lib. Most operations run in the browser; files are not uploaded to an application server unless you explicitly use the optional password-protection API.

## Prerequisites

- Node.js 20 or newer and pnpm 9+
- Python 3.10 or newer only for password protection

## Installation

```bash
corepack enable
pnpm install
```

## Local development

```bash
pnpm dev
```

Open http://localhost:3000. Browser tools accept PDFs up to 50 MB each. Password protection requires the optional API:

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

For a separately hosted API, set `NEXT_PUBLIC_PDF_API_URL` to its HTTPS origin at build time and set `PDF_NEXUS_CORS_ORIGINS` on the API to a comma-separated allowlist of exact frontend origins. The sample API permits only localhost by default.

## Tests and checks

```bash
pnpm test
pnpm build
```

The core merge, split, rotate, reorder, delete and page parsing operations have automated Vitest coverage. Tests generate small sample PDFs in memory. For manual checks, use any unencrypted PDF under 50 MB and a JPG or PNG image. The backend endpoint can be exercised with a POST to `/protect`, sending JSON with base64 `pdf` bytes and a `password`; it returns encrypted PDF bytes. Install backend requirements before starting it.

## Deployment

Deploy the frontend to Vercel using the default Next.js build settings. No server secrets are required by the frontend. Deploy the optional FastAPI service separately to a Python host, use HTTPS, configure a strict CORS origin, set `NEXT_PUBLIC_PDF_API_URL`, and apply request-size limits at the host/proxy. The API keeps uploaded bytes in memory and has no persistent upload directory.

## Current feature limitations

- Merge, page extraction (one output document), rotation, page reordering, page deletion, JPG/PNG to PDF, PDF to JPG (one download per page), text annotation, text watermark, and password encryption are implemented.
- Password encryption requires the optional FastAPI service and uses AES-256 through pypdf. `pdf-lib` itself cannot encrypt output.
- PDFs are limited to 50 MB. Very large or image-heavy documents may be slow or run out of browser memory.
- PDF to JPG uses PDF.js. The matching worker is copied to `public/` automatically before development and builds.
- Text insertion is a simple annotation at a fixed location on every page, not a full layout-aware editor. Watermarks are plain text.
- This initial app does not include OCR, compression, form filling, signatures, or visual page previews/reordering.
- Password-protected inputs are not supported by the browser tools. Validate the optional API deployment and operating limits before exposing it to untrusted public traffic.

Uploaded documents are excluded from source control by `.gitignore`.
