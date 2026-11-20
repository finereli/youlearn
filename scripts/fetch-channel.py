#!/usr/bin/env python3
"""Every video a YouTube channel has uploaded, as JSON lines of {id, title,
duration}. Scrapes the public /videos tab and follows its continuation through
the same endpoint the web page uses, so no API key is needed.

Usage: fetch-channel.py <@handle or channel/UC...> [tab]   (tab: videos)
"""
import json, re, sys, urllib.request

UA = {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en'}


def get(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = dict(UA, **({'Content-Type': 'application/json'} if data else {}))
    req = urllib.request.Request(url, data=data, headers=headers)
    return urllib.request.urlopen(req, timeout=30).read().decode()


def seconds(text):
    if not text or not re.fullmatch(r'\d+(:\d\d)+', text):
        return 0
    s = 0
    for part in text.split(':'):
        s = s * 60 + int(part)
    return s


def collect(node, out, conts):
    if isinstance(node, dict):
        v = node.get('videoRenderer')
        if v:
            out.append({
                'id': v['videoId'],
                'title': ''.join(r['text'] for r in v['title']['runs']),
                'duration': seconds(v.get('lengthText', {}).get('simpleText')),
            })
            return
        l = node.get('lockupViewModel')
        if l and l.get('contentType') == 'LOCKUP_CONTENT_TYPE_VIDEO':
            badge = re.findall(r"'text': '(\d+(?::\d\d)+)'", str(l.get('contentImage')))
            out.append({
                'id': l['contentId'],
                'title': l['metadata']['lockupMetadataViewModel']['title']['content'],
                'duration': seconds(badge[0] if badge else ''),
            })
            return
        c = node.get('continuationCommand')
        if c:
            conts.append(c['token'])
        for x in node.values():
            collect(x, out, conts)
    elif isinstance(node, list):
        for x in node:
            collect(x, out, conts)


def main():
    channel = sys.argv[1].strip('/')
    tab = sys.argv[2] if len(sys.argv) > 2 else 'videos'
    html = get(f'https://www.youtube.com/{channel}/{tab}')
    data = json.loads(re.search(r'var ytInitialData = (\{.*?\});</script>', html).group(1))
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html).group(1)
    version = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html).group(1)
    context = {'client': {'clientName': 'WEB', 'clientVersion': version, 'hl': 'en', 'gl': 'US'}}

    videos, conts = [], []
    collect(data, videos, conts)
    seen = set()
    while conts:
        token = conts.pop()
        if token in seen:
            continue
        seen.add(token)
        page = json.loads(get(f'https://www.youtube.com/youtubei/v1/browse?key={key}&prettyPrint=false',
                              {'context': context, 'continuation': token}))
        collect(page.get('onResponseReceivedActions', page), videos, conts)
        print(f'{len(videos)} videos', file=sys.stderr)

    unique = {v['id']: v for v in videos}
    for v in unique.values():
        print(json.dumps(v, ensure_ascii=False))


main()
