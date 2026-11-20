#!/usr/bin/env python3
"""Print a YouTube playlist's videos as JSON, scraped from the public playlist
page (first ~100 items, no API key). Usage: fetch-playlist.py <playlistId> [title]
Stopgap until the parent console lands."""
import json, re, sys, urllib.request

pid = sys.argv[1]
req = urllib.request.Request(f'https://www.youtube.com/playlist?list={pid}',
                             headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en'})
html = urllib.request.urlopen(req).read().decode()
data = json.loads(re.search(r'var ytInitialData = (\{.*?\});</script>', html).group(1))

videos = []
def duration(o):
    # The thumbnail badge holds the length as "22:10" or "1:02:10".
    for t in re.findall(r"'text': '(\d+(?::\d\d)+)'", str(o)):
        secs = 0
        for part in t.split(':'): secs = secs * 60 + int(part)
        return secs
    return 0
def walk(o):
    if isinstance(o, dict):
        l = o.get('lockupViewModel')
        if l and l.get('contentType') == 'LOCKUP_CONTENT_TYPE_VIDEO':
            title = l['metadata']['lockupMetadataViewModel']['title']['content']
            videos.append({'id': l['contentId'], 'title': title,
                           'duration': duration(l.get('contentImage'))})
            return
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(data)
title = sys.argv[2] if len(sys.argv) > 2 else pid
print(json.dumps({'id': pid, 'title': title, 'videos': videos}, ensure_ascii=False, indent=1))
