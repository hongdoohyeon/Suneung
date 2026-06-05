#!/usr/bin/env python3
"""2027학년도 6월 모평(고3) surgical append — 기존 데이터/페이지 무손상.

build-data.py 는 부분 빌더라 단독 재빌드 시 옛학평·제2외/직탐 ~2,661건이 날아감.
→ 전체 재빌드 대신 6모 24 엔트리 + exam-{id}.html + OG + data/exam json + sitemap 만 추가.
build-data 의 from_kice / build_static_exam_pages / build_static_set_pages 를 재사용해 포맷 일치.
"""
import importlib.util, json, shutil, tempfile, re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
TODAY = '2026-06-05'

spec = importlib.util.spec_from_file_location("bd", ROOT / "scripts/build-data.py")
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)

print("ASSET_INDEX 구축(gh)...")
bd.ASSET_INDEX = bd.build_asset_index()

# 1) 6모 24 items 생성
items = []
bd.from_kice(bd.ARCHIVE / 'kice_2015.db', items)
m6 = [it for it in items if it.get('gradeYear') == 2027 and it.get('type') == 'june']
assert len(m6) == 24, f"expected 24, got {len(m6)}"

# 2) Download 필드 보강 (기존 item 일관성 — ?name= 디코드)
def dl_from(url):
    return unquote(url.split('?name=', 1)[1]) if url and '?name=' in url else None
for it in m6:
    if it.get('questionUrl'): it['questionDownload'] = dl_from(it['questionUrl'])
    if it.get('answerUrl'):   it['answerDownload']   = dl_from(it['answerUrl'])
    if it.get('scriptUrl') and not it.get('scriptDownload'):
        it['scriptDownload'] = dl_from(it['scriptUrl'])

# 3) 기존 exams.json 로드 + 새 id 할당 (id = 위치기반, max+1..)
exams = json.loads((ROOT / 'data/exams.json').read_text(encoding='utf-8'))
maxid = max(it['id'] for it in exams)
for i, it in enumerate(m6, 1):
    it['id'] = maxid + i
print(f"새 id: {maxid+1}..{maxid+len(m6)}")

# 4) 페이지/OG 생성 — temp out_root + _OG_DIR 격리로 기존 페이지 cleanup 방지
tmp = Path(tempfile.mkdtemp(prefix='m6pages_'))
(tmp / 'og').mkdir()
bd._OG_DIR = tmp / 'og'
bd.build_static_exam_pages(m6, ROOT / 'exam.html', tmp)
bd.build_static_set_pages(m6, ROOT / 'exam-set.html', tmp)

# 새 exam 페이지 + OG 복사
(ROOT / 'og').mkdir(exist_ok=True)
for it in m6:
    shutil.copy2(tmp / f"exam-{it['id']}.html", ROOT / f"exam-{it['id']}.html")
    og = tmp / 'og' / f"exam-{it['id']}.jpg"
    if og.exists():
        shutil.copy2(og, ROOT / 'og' / f"exam-{it['id']}.jpg")
# 새 set 페이지 복사 (ROOT 에 없던 것만)
new_sets = []
for sp in tmp.glob('exam-set-*.html'):
    dst = ROOT / sp.name
    if not dst.exists():
        shutil.copy2(sp, dst); new_sets.append(sp.name)
print(f"새 set 페이지: {new_sets}")

# 5) exams.json = 기존 + 24
all_items = exams + m6
(ROOT / 'data/exams.json').write_text(
    json.dumps(all_items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 6) data/exam/{id}.json (신규 24만)
exam_dir = ROOT / 'data/exam'; exam_dir.mkdir(parents=True, exist_ok=True)
for it in m6:
    (exam_dir / f"{it['id']}.json").write_text(
        json.dumps(it, ensure_ascii=False), encoding='utf-8')

# 7) sitemap-exams.xml — 24 url 삽입 (priority: 2027=현학년도 평가원 → 0.9)
sm = ROOT / 'sitemap-exams.xml'
txt = sm.read_text(encoding='utf-8')
rows = ''.join(
    f'  <url><loc>https://kicegg.com/exam-{it["id"]}.html</loc>'
    f'<lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>\n'
    for it in m6)
sm.write_text(txt.replace('</urlset>', rows + '</urlset>'), encoding='utf-8')

# 8) sitemap-sets.xml — 2027 june set 1건 (priority 1.0)
sset = ROOT / 'sitemap-sets.xml'
stxt = sset.read_text(encoding='utf-8')
setname = bd.set_friendly_filename('2015', '2027', 'june', None)
if setname not in stxt:
    row = (f'  <url><loc>https://kicegg.com/{setname}</loc>'
           f'<lastmod>{TODAY}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n')
    sset.write_text(stxt.replace('</urlset>', row + '</urlset>'), encoding='utf-8')
    print(f"sitemap-sets 추가: {setname}")

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n✓ 완료: exams.json {len(exams)}→{len(all_items)}, exam 페이지 +{len(m6)}, set +{len(new_sets)}")
