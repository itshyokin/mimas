"""Rebuilds Character Builder.html (in the project folder) from src/: python tools/character-builder/build.py"""
import os, sys
D = os.path.dirname(os.path.abspath(__file__))
src = lambda f: open(os.path.join(D, 'src', f)).read()
js = "\n".join(src(f) for f in ['zip.js', 'art.js', 'store.js', 'app.js'])
assert '</script' not in js.lower()
page = src('page.html').replace('<!--SCRIPTS-->', '<script>\n(() => {\n"use strict";\n' + js + '\n})();\n</script>')
# The project's copy, opened by double-clicking (saves into the browser it's opened in).
open(os.path.join(D, '..', '..', 'Character Builder.html'), 'w').write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body style="margin:0">\n' + page + '\n</body></html>\n')
print('Built “Character Builder.html”')
