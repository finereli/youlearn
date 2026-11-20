#!/usr/bin/env python3
"""Merge content/*.json (written by fetch-playlist.py) into src/lib/library.json,
with episode titles cleaned of channel boilerplate ("Wild Kratts |",
"Full Episode", "Season 3", "Animals for Kids"). Stopgap until the parent
console keeps the library on the server."""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
NOISE = re.compile(r'^(wild kratts|full episodes?|season \d+|animals for kids|kids videos?|hd)$', re.I)

def clean(title):
    parts = [p.strip() for p in re.split(r'\s*\|\s*', title)]
    kept = [p for p in parts if p and not NOISE.match(p)]
    return kept[0] if kept else title

shows = []
for f in sorted((root / 'content').glob('*.json')):
    d = json.loads(f.read_text())
    shows.append({
        'id': d['id'],
        'title': d['title'],
        'videos': [{'id': v['id'], 'title': clean(v['title']), 'duration': v['duration']} for v in d['videos']],
    })
out = root / 'src/lib/library.json'
out.write_text(json.dumps({'collections': shows}, ensure_ascii=False, indent=1) + '\n')
print(f"{out}: {sum(len(s['videos']) for s in shows)} videos in {len(shows)} collections")
