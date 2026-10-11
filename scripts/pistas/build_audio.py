import json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from songs import SONGS
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'server', 'data', 'questions')
cache = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'itunes_cache.json'), encoding='utf-8'))
BAD = re.compile(r'\b(unplugged|live|en vivo|remix|remixes|karaoke|instrumental|acoustic|cover|tribute)\b', re.I)
PREFIX = {'pistas-70s': 'p70', 'pistas-80s': 'p80', 'pistas-90s': 'p90', 'pistas-2000s': 'p00', 'pistas-2010s': 'p10'}
Q = {'W': '¿Quién canta esta canción?', 'N': '¿Cómo se llama esta canción?'}
urls = set()
for cat, songs in SONGS.items():
    path = os.path.join(ROOT, f'{cat}.json')
    keep = []
    if cat == 'pistas-80s':  # las 10 primeras se crearon antes que este script: se conservan tal cual
        keep = [q for q in json.load(open(path, encoding='utf-8'))['questions'] if int(q['id'][4:]) <= 10]
    out = list(keep)
    for i, (artist, title, kind, opts, expl, diff, tags) in enumerate(songs, len(keep) + 1):
        hit = cache[f'{artist}|{title}']
        flag = BAD.search(hit['track'] + ' ' + hit['album'])
        if flag and 'mix' not in flag.group(0).lower(): print('REVISAR', artist, title, hit['track'], hit['album'])
        assert len(set(opts)) == 4, (title, opts)
        qid = f'{PREFIX[cat]}-{i:03d}'
        order = list(range(4)); random.Random(qid).shuffle(order)
        out.append({'id': qid, 'question': Q[kind], 'options': [opts[j] for j in order], 'answer': order.index(0),
                    'explanation': expl, 'difficulty': diff, 'source': 'Fragmento de 30 s de iTunes (Apple Music)',
                    'tags': ['audio', cat.split('-')[1]] + tags, 'audio': hit['url']})
    for q in out:
        assert q['audio'] not in urls, q['id']; urls.add(q['audio'])
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{"category":"%s","questions":[\n' % cat + ',\n'.join(json.dumps(q, ensure_ascii=False) for q in out) + '\n]}\n')
    print(cat, len(out))
