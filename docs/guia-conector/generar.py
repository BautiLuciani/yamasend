"""
Regenera la guía del conector (PDF + imágenes por página) desde guia.html.

Uso, parado en esta carpeta:
    npm i --no-save @fontsource/manrope @fontsource/ibm-plex-mono
    pip install playwright pillow && python -m playwright install chromium
    python generar.py

Deja los archivos en public/guias/conector-ia/, que es de donde los lee el
modal de Configuración (components/yamasend/ConfiguracionModal.tsx). Si cambia
la cantidad de páginas, actualizar PAGINAS_GUIA_CONECTOR en ese componente.
"""
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI.parent.parent / "public" / "guias" / "conector-ia"
PDF = DESTINO / "YamaSend-Guia-Conector-IA.pdf"

DESTINO.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    navegador = p.chromium.launch()
    pagina = navegador.new_page()
    pagina.goto((AQUI / "guia.html").as_uri())
    pagina.evaluate("document.fonts.ready")
    pagina.wait_for_timeout(500)
    pagina.pdf(path=str(PDF), format="A4", print_background=True, prefer_css_page_size=True)
    navegador.close()

# Imágenes por página (las muestra el modal: se ven igual en cualquier
# navegador, incluidos los celulares que no muestran PDFs embebidos).
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["pdftoppm", "-r", "150", "-png", str(PDF), os.path.join(tmp, "pg")], check=True)
    for viejo in DESTINO.glob("pagina-*.webp"):
        viejo.unlink()
    for i, png in enumerate(sorted(Path(tmp).glob("pg-*.png")), 1):
        Image.open(png).convert("RGB").save(DESTINO / f"pagina-{i}.webp", "WEBP", quality=86, method=6)
        print("pagina", i)

print("Listo:", PDF)
