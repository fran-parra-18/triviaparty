import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from songs import SONGS
# Ajustes de búsqueda: término, título exacto en iTunes o palabras a excluir.
EXTRA = {
 'Pink Floyd|Another Brick in the Wall': {'title': 'Another Brick in the Wall, Pt. 2'},
 'The Jackson 5|ABC': {'artist': 'Jackson 5', 'term': 'Jackson 5 ABC'},
 'Bad Bunny|Callaita': {'term': 'Bad Bunny Tainy Callaíta'},
 "Ricky Martin|Livin' la Vida Loca": {'exclude': r'spanish'},
 'Radiohead|Creep': {'term': 'Radiohead Pablo Honey Creep', 'album': 'Pablo Honey'},
 'Haddaway|What Is Love': {'allow_mix': True},
 'Green Day|Boulevard of Broken Dreams': {'term': 'Green Day American Idiot Boulevard of Broken Dreams'},
 '(G)I-DLE|TOMBOY': {'artist': 'i-dle', 'term': 'i-dle TOMBOY'},
}

CACHE = os.path.join(os.path.dirname(__file__), 'itunes_cache.json')
cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
BAD = re.compile(r'\b(unplugged|live|en vivo|directo|remix|remixed|karaoke|instrumental|acoustic|acústico|acústica|acustica|japanese|spanglish|demo|cover|tribute|tributo|re-?recorded|sped up|slowed|mtv|remixes|mix)\b', re.I)

def norm(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower())

def base(t):
    return re.sub(r'\s*[\(\[].*', '', re.sub(r'\s+-\s+.*', '', t))

def search(artist, title, ex):
    artist = ex.get('artist', artist); title = ex.get('title', title)
    for country in ['US', 'MX', 'AR', 'ES']:
        q = urllib.parse.urlencode({'term': ex.get('term', f'{artist} {title}'), 'entity': 'song', 'limit': 50, 'country': country})
        for _ in range(3):
            try:
                res = json.load(urllib.request.urlopen('https://itunes.apple.com/search?' + q, timeout=20))['results']
                break
            except Exception as e:
                time.sleep(3)
        else:
            continue
        time.sleep(0.4)
        for r in res:
            an, tn, cn = r.get('artistName', ''), r.get('trackName', ''), r.get('collectionName', '')
            if not r.get('previewUrl') or not norm(an).startswith(norm(artist)):
                continue
            if norm(base(tn)) != norm(base(title)) and norm(tn) != norm(title):
                continue
            bad = BAD.search(tn) or BAD.search(cn)
            if bad and not (ex.get('allow_mix') and bad.group(0).lower() == 'mix'):
                continue
            if ex.get('exclude') and re.search(ex['exclude'], tn + ' ' + cn, re.I):
                continue
            if ex.get('album') and ex['album'].lower() not in cn.lower():
                continue
            return {'url': r['previewUrl'], 'track': tn, 'artist': an, 'album': cn, 'year': r.get('releaseDate', '')[:4], 'country': country}
    return None

missing = []
for cat, songs in SONGS.items():
    for artist, title, *_ in songs:
        key = f'{artist}|{title}'
        if key in cache and cache[key]:
            continue
        hit = search(artist, title, EXTRA.get(key, {}))
        cache[key] = hit
        if hit:
            print(f"OK  {artist} - {title} -> {hit['artist']} - {hit['track']} | {hit['album']} ({hit['year']}, {hit['country']})")
        else:
            missing.append(key)
            print(f'NO  {artist} - {title}')
        json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('faltan:', missing)
