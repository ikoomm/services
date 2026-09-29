"""Build the same dependency-free app into one portable HTML file."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
core = (root / 'core.js').read_text(encoding='utf-8')
app = (root / 'app.js').read_text(encoding='utf-8')
assert '</style' not in css.lower()
assert '</script' not in (core + app).lower()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="core.js"></script><script src="app.js"></script>', '<script>\n' + core + '\n</script>\n<script>\n' + app + '\n</script>')
output = root / 'Export-Reconcile.html'
output.write_text(html, encoding='utf-8', newline='\n')
print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
