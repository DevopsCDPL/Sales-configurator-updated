"""One-off PDF text extractor for the PH4 enhancement spec."""
from pathlib import Path
from pypdf import PdfReader

src = Path(r"e:\forged-idas-copy\Sales Configurator ENHANCEMENTS PH4.pdf")
out = Path(r"e:\forged-idas-copy\docs\_pdf_extract.txt")
out.parent.mkdir(parents=True, exist_ok=True)

reader = PdfReader(str(src))
parts = []
for i, page in enumerate(reader.pages, 1):
    parts.append(f"\n\n===== PAGE {i} =====\n")
    try:
        parts.append(page.extract_text() or "")
    except Exception as e:
        parts.append(f"[extract error: {e}]")

out.write_text("".join(parts), encoding="utf-8")
print(f"Pages: {len(reader.pages)}  ->  {out}")
