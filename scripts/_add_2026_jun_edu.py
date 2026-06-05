#!/usr/bin/env python3
"""2026 6월 고1/고2 전국연합학력평가 surgical append — 기존 데이터/페이지 무손상.

build-data.py 단독 재빌드 금지(부분 빌더). from_edu/build_static_* 재사용해 12 엔트리만 추가.
"""
import importlib.util, json, shutil, tempfile
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-06-05'

spec = importlib.util.spec_from_file_location("bd", ROOT / "scripts/build-data.py")
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)
print("ASSET_INDEX 구축(gh)...")
bd.ASSET_INDEX = bd.build_asset_index()

# 1) 2026 6월 고1/고2 items
items = []
bd.from_edu(bd.ARCHIVE / 'edu.db', items)
new = [it for it in items if it.get('examYear') == 2026 and it.get('month') == 6
       and it.get('studentGrade') in (1, 2)]
assert len(new) == 12, f"expected 12, got {len(new)}"

# 2) Download 필드 보강
def dl_from(u): return unquote(u.split('?name=', 1)[1]) if u and '?name=' in u else None
for it in new:
    if it.get('questionUrl'): it['questionDownload'] = dl_from(it['questionUrl'])
    if it.get('answerUrl'):   it['answerDownload']   = dl_from(it['answerUrl'])
    if it.get('scriptUrl') and not it.get('scriptDownload'):
        it['scriptDownload'] = dl_from(it['scriptUrl'])

# 3) id 할당
exams = json.loads((ROOT / 'data/exams.json').read_text(encoding='utf-8'))
maxid = max(it['id'] for it in exams)
for i, it in enumerate(new, 1):
    it['id'] = maxid + i
print(f"새 id: {maxid+1}..{maxid+len(new)}")

# 4) 페이지/OG/set 생성 (temp 격리)
tmp = Path(tempfile.mkdtemp(prefix='edu26_')); (tmp / 'og').mkdir()
bd._OG_DIR = tmp / 'og'
bd.build_static_exam_pages(new, ROOT / 'exam.html', tmp)
bd.build_static_set_pages(new, ROOT / 'exam-set.html', tmp)
(ROOT / 'og').mkdir(exist_ok=True)
for it in new:
    shutil.copy2(tmp / f"exam-{it['id']}.html", ROOT / f"exam-{it['id']}.html")
    og = tmp / 'og' / f"exam-{it['id']}.jpg"
    if og.exists(): shutil.copy2(og, ROOT / 'og' / f"exam-{it['id']}.jpg")
new_sets = []
for sp in tmp.glob('exam-set-*.html'):
    if not (ROOT / sp.name).exists():
        shutil.copy2(sp, ROOT / sp.name); new_sets.append(sp.name)
print(f"새 set 페이지: {new_sets}")

# 5) exams.json
all_items = exams + new
(ROOT / 'data/exams.json').write_text(
    json.dumps(all_items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 6) data/exam/{id}.json
ed = ROOT / 'data/exam'; ed.mkdir(parents=True, exist_ok=True)
for it in new:
    (ed / f"{it['id']}.json").write_text(json.dumps(it, ensure_ascii=False), encoding='utf-8')

# 7) sitemap-exams.xml (+12, priority 0.7 학평 최근)
sm = ROOT / 'sitemap-exams.xml'; txt = sm.read_text(encoding='utf-8')
rows = ''.join(
    f'  <url><loc>https://kicegg.com/exam-{it["id"]}.html</loc>'
    f'<lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n'
    for it in new)
sm.write_text(txt.replace('</urlset>', rows + '</urlset>'), encoding='utf-8')

# 8) sitemap-sets.xml (+2: 고1·고2 set)
sset = ROOT / 'sitemap-sets.xml'; stxt = sset.read_text(encoding='utf-8')
add = ''
for g in (1, 2):
    name = bd.set_friendly_filename('2015', '2026', 'jun', g)
    if name not in stxt and name not in add:
        add += (f'  <url><loc>https://kicegg.com/{name}</loc>'
                f'<lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n')
if add:
    sset.write_text(stxt.replace('</urlset>', add + '</urlset>'), encoding='utf-8')

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n✓ exams.json {len(exams)}→{len(all_items)}, exam 페이지 +{len(new)}, set +{len(new_sets)}")
