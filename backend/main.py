"""Optional local API for PDF password encryption. Input remains memory-only."""
import base64, binascii, os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
from io import BytesIO

app = FastAPI(title="PDF Nexus API")
origins = [origin.strip() for origin in os.getenv("PDF_NEXUS_CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST"], allow_headers=["Content-Type"])
class ProtectRequest(BaseModel):
    pdf: str = Field(min_length=1, max_length=75_000_000)
    password: str = Field(min_length=1, max_length=256)

@app.post("/protect")
def protect(req: ProtectRequest):
    try:
        raw = base64.b64decode(req.pdf, validate=True)
        if len(raw) > 50 * 1024 * 1024: raise HTTPException(413, "PDF exceeds 50 MB.")
        reader = PdfReader(BytesIO(raw), strict=True)
        if reader.is_encrypted: raise HTTPException(400, "This PDF is already password-protected.")
        writer = PdfWriter(clone_from=reader)
        writer.encrypt(req.password, algorithm="AES-256")
        out = BytesIO(); writer.write(out)
        return Response(out.getvalue(), media_type="application/pdf", headers={"Content-Disposition":"attachment; filename=protected.pdf"})
    except HTTPException: raise
    except (binascii.Error, ValueError, OSError) as exc: raise HTTPException(400, "Invalid or damaged PDF document.") from exc
