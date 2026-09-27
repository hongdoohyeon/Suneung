"""수정 계획(plan_*.json) 적용 — 새 파일은 GitHub 릴리즈에 올리고, exams.json 은 해당 칸만 바꾼다(재생성 금지 규약).
계획 항목: {id, field, new, [downloadField, download], [local, asset, tag]}  new=None 이면 칸 비우기, 'set' 필드는 값 교체.
python3 scripts/material-audit/apply_fix.py tmp/material-fix/plan_x.json [...] [--no-upload]"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = 'hongdoohyeon/Suneung'
plans = [a for a in sys.argv[1:] if not a.startswith('--')]
items = [x for f in plans for x in json.loads(Path(f).read_text())]

# 1) 업로드 — 릴리즈별로 모아서
if '--no-upload' not in sys.argv:
    by_tag = {}
    for x in items:
        if x.get('local'):
            by_tag.setdefault(x.get('tag') or x['new'].split('/')[3], {})[x['asset']] = x['local']
    for tag, files in by_tag.items():
        if subprocess.run(['gh', 'release', 'view', tag, '-R', REPO], capture_output=True).returncode:
            subprocess.run(['gh', 'release', 'create', tag, '-R', REPO, '-t', tag, '-n', '자료 검수(2026-09) 바로잡은 원본'], check=True)
        with tempfile.TemporaryDirectory() as td:
            paths = []
            for asset, local in files.items():
                dst = Path(td) / asset; shutil.copy(local, dst); paths.append(str(dst))
            for i in range(0, len(paths), 50):
                subprocess.run(['gh', 'release', 'upload', tag, '--clobber', '-R', REPO, *paths[i:i + 50]], check=True)
        print(f'업로드 {tag}: {len(files)}개')

# 2) exams.json 해당 칸만
path = ROOT / 'data/exams.json'
exams = json.loads(path.read_text())
by_id = {e['id']: e for e in exams}
n = 0
for x in items:
    e = by_id[x['id']]
    if x.get('delete'): continue
    if 'set' in x:
        for k, v in x['set'].items(): e[k] = v
    else:
        e[x['field']] = x['new']
        if x.get('downloadField'): e[x['downloadField']] = x.get('download') if x['new'] else None
    n += 1
if any(x.get('delete') for x in items):
    drop = {x['id'] for x in items if x.get('delete')}
    exams = [e for e in exams if e['id'] not in drop]
path.write_text(json.dumps(exams, ensure_ascii=False, indent=2) + '\n')
print(f'exams.json {n}칸 수정')
