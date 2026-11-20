#!/usr/bin/env python3
"""Sort each show's uploads into seasons of single full episodes.

Inputs, all under content/:
  raw/<channel>.jsonl   every upload of a channel (scripts/fetch-channel.py)
  wiki/<show>.wiki      the show's Wikipedia episode list (wikitext)
  <playlist>.json       ready-made season playlists (scripts/fetch-playlist.py)
Output: src/lib/library.json, the shows the app lists.

Only single full episodes go in: no compilations, marathons, "best of",
shorts or promos. A video counts when its length fits one episode and its
title matches an episode on Wikipedia, which also gives the season and the
order. Each episode appears once, however many times it was uploaded.
"""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
content = root / 'content'

JUNK = re.compile(r'compilation|marathon|best of|best bits|special|double|triple|songs?\b|promo|trailer|'
                  r'shorts?\b|clips?\b|megamix|supercut|\+|hours?\b|movie', re.I)


def raw(channel):
    return [json.loads(l) for l in open(content / 'raw' / f'{channel}.jsonl')]


def words(s):
    s = s.lower().replace('&', ' and ').replace('’', "'")
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", s)


def wiki_episodes(show):
    """[{season, ep, titles, code}] from {{Episode list}} blocks under
    'Season N' / 'Series N' headings."""
    eps, season, cur = [], None, None
    for line in open(content / 'wiki' / f'{show}.wiki'):
        h = re.match(r'^===\s*(?:Season|Series)\s+(\d+)', line)
        if h:
            season = int(h.group(1))
        if re.match(r'^==\s*Specials', line):
            season = None
        if '{{Episode list' in line:
            cur = {'season': season, 'titles': {}, 'ep': None, 'code': None}
            if season:
                eps.append(cur)
        m = re.match(r'^\s*\|\s*(\w+)\s*=\s*(.*?)\s*$', line.split('{{Episode list')[-1])
        if cur is not None and m:
            k, v = m.groups()
            v = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', v)  # [[a|b]] -> b
            v = re.sub(r'<[^>]+>|\{\{[^}]*\}\}|"', '', v).strip()
            if k in ('Title', 'Title_1', 'Title_2'):
                cur['titles'][k] = v
            elif k == 'EpisodeNumber2':
                cur['ep'] = int(re.sub(r'\D', '', v) or 0)
            elif k == 'ProdCode':
                cur['code'] = v
    return eps


def video(v, title, season, ep, part=''):
    return {'id': v['id'], 'title': title, 'duration': v['duration'], 'season': season, 'order': (ep, part)}


def seasons(show_id, title, channel, items):
    by = {}
    for it in sorted(items, key=lambda x: (x['season'], x['order'])):
        by.setdefault(it['season'], []).append({k: it[k] for k in ('id', 'title', 'duration')})
    return {
        'id': show_id,
        'title': title,
        'channel': channel,
        'seasons': [{'id': f'{show_id}-s{s}', 'title': f'Season {s}', 'videos': vs} for s, vs in sorted(by.items())],
    }


def match(titles_words, vwords):
    """Longest wiki title whose words appear as a run in the video title."""
    best = None
    for key, tw in titles_words:
        n = len(tw)
        if n and any(vwords[i:i + n] == tw for i in range(len(vwords) - n + 1)):
            if not best or n > len(best[1]):
                best = (key, tw)
    return best


# --- Octonauts -----------------------------------------------------------------

def octonauts():
    eps = wiki_episodes('octonauts')
    keys = []
    for e in eps:
        t = e['titles'].get('Title', '')
        w = words(re.sub(r'^(The )?Octonauts and (the )?', '', t, flags=re.I))
        keys.append(((e['season'], e['ep'], t), w))
    seen, items = set(), []
    for v in raw('octonauts'):
        if not (480 <= v['duration'] <= 900) or 'full episode' not in v['title'].lower() or JUNK.search(v['title']):
            continue
        hit = match(keys, words(v['title']))
        if not hit or hit[0] in seen:
            continue
        season, ep, t = hit[0]
        stated = re.search(r'(?:season|series) (\d+)', v['title'], re.I)
        if stated and int(stated.group(1)) != season:
            continue  # title words matched a different episode
        seen.add(hit[0])
        name = re.sub(r'^(The )?Octonauts and ', '', t, flags=re.I)
        items.append(video(v, name[:1].upper() + name[1:], season, ep))
    return seasons('octonauts', 'Octonauts', '@Octonauts', items)


# --- Zoboomafoo ----------------------------------------------------------------

def zoboomafoo():
    names = {e['code']: e['titles'].get('Title') for e in wiki_episodes('zoboomafoo') if e['code']}
    best = {}
    for v in raw('zoboomafoo'):
        m = re.search(r'Zoboomafoo (\d)(\d\d)\b', v['title'])
        if not m or not (1400 <= v['duration'] <= 1700) or JUNK.search(v['title']):
            continue
        code = m.group(1) + m.group(2)
        # Prefer the plain "(Full Episode)" uploads over the retitled ones.
        rank = 0 if '(Full Episode)' in v['title'] else 1
        if code not in best or rank < best[code][0]:
            best[code] = (rank, v)
    items = []
    for code, (_, v) in best.items():
        name = names.get(code)
        if not name:
            after = re.split(r'Zoboomafoo \d{3}\s*[-|]\s*', v['title'])[-1]
            name = re.split(r'\s*[|(]', after)[0].strip()
        items.append(video(v, name, int(code[0]), int(code[1:])))
    return seasons('zoboomafoo', 'Zoboomafoo', '@ZoboomafooWildBrain', items)


# --- Nature Cat ----------------------------------------------------------------

def naturecat():
    eps = wiki_episodes('naturecat')
    by_code = {re.sub(r'\D', '', e['code'] or '')[-3:]: e for e in eps}
    items, seen = [], set()
    # Scholastic posts half-episodes: "Nature Cat - 102A - Muck Amok".
    for v in raw('scholastic'):
        m = re.match(r'Nature Cat - (\d{3})([AB]) - (.+?) \(Full Episode\)', v['title'])
        if not m or v['duration'] < 480:
            continue
        e = by_code.get(m.group(1))
        part = m.group(2)
        title = (e and e['titles'].get('Title_1' if part == 'A' else 'Title_2')) or m.group(3).strip()
        season = e['season'] if e else int(m.group(1)[0])
        ep = e['ep'] if e else int(m.group(1)[1:])
        seen.add((season, ep, part))
        items.append(video(v, title, season, ep, part))
    # PBS KIDS posts whole episodes: "Nature Cat FULL EPISODE | A / B | PBS KIDS".
    keys = [((e['season'], e['ep']), words(e['titles'].get('Title_1', ''))) for e in eps]
    for v in raw('pbskids'):
        if 'nature cat full episode' not in v['title'].lower() or not (1200 <= v['duration'] <= 1700):
            continue
        hit = match(keys, words(v['title']))
        if not hit:
            continue
        season, ep = hit[0]
        if (season, ep, 'A') in seen:
            continue
        e = next(x for x in eps if (x['season'], x['ep']) == (season, ep))
        items.append(video(v, f"{e['titles'].get('Title_1')} / {e['titles'].get('Title_2')}", season, ep))
    return seasons('naturecat', 'Nature Cat', '@PBSKIDS', items)


# --- Wild Kratts: the channel keeps season playlists ---------------------------

NOISE = re.compile(r'^(wild kratts|full episodes?|season \d+|animals for kids|kids videos?|hd)$', re.I)


def wildkratts():
    out = []
    for f in sorted(content.glob('season-*.json')):
        d = json.loads(f.read_text())
        vids = []
        for v in d['videos']:
            parts = [p.strip() for p in re.split(r'\s*\|\s*', v['title'])]
            kept = [p for p in parts if p and not NOISE.match(p)]
            vids.append({'id': v['id'], 'title': kept[0] if kept else v['title'], 'duration': v['duration']})
        out.append({'id': d['id'], 'title': d['title'], 'videos': vids})
    return {'id': 'wildkratts', 'title': 'Wild Kratts', 'channel': '@WildKratts', 'seasons': out}


shows = [wildkratts(), octonauts(), zoboomafoo(), naturecat()]
for s in shows:
    s['art'] = f'/shows/{s["id"]}.jpg'
    print(f"{s['title']}: " + ', '.join(f"{x['title']} ({len(x['videos'])})" for x in s['seasons']))
(root / 'src/lib/library.json').write_text(json.dumps({'shows': shows}, ensure_ascii=False, indent=1) + '\n')
