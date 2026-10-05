import importlib.util
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


versions = load('version-assets')
render = load('render-site')


class BuildTests(unittest.TestCase):
    def test_set_meta_distinguishes_education_grades_from_kice_month_types(self):
        items = [{'subject': '국어'}, {'subject': '영어', 'listenUrl': 'https://example.com/a.mp3'}]
        grade1 = render.bd.build_set_meta('2015', '2022', 'jun', 1, items)
        grade2 = render.bd.build_set_meta('2015', '2022', 'jun', 2, items)
        kice = render.bd.build_set_meta('2015', '2022', 'june', None, items)

        self.assertIn('2021년 6월 고1 학력평가', grade1['title'])
        self.assertIn('2021년 6월 고2 학력평가', grade2['title'])
        self.assertIn('2022학년도 6월 모의평가', kice['title'])
        self.assertEqual(len({grade1['title'], grade2['title'], kice['title']}), 3)

        old_csat = render.bd.build_set_meta('7차', '2011', 'csat', None, items)
        old_june = render.bd.build_set_meta('7차', '2011', 'june', None, items)
        leet = render.bd.build_set_meta('LEET', '2009', 'leet_annual', None, items)
        leet_prelim = render.bd.build_set_meta('LEET', '2009', 'prelim', None, items)
        self.assertNotEqual(old_csat['title'], old_june['title'])
        self.assertNotEqual(leet['title'], leet_prelim['title'])

    def test_summary_uses_source_revision_date_not_future_exam_date(self):
        source = render.ROOT
        items = json.loads((source / 'data/exams.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            try:
                render.ROOT = Path(tmp)
                (render.ROOT / 'data').mkdir()
                with patch.object(render.subprocess, 'check_output', return_value='2026-09-03\n'):
                    render.render_site_summary(items)
                summary = json.loads((render.ROOT / 'data/site-summary.json').read_text())
                self.assertEqual(summary['updatedAt'], '2026-09-03')
                self.assertEqual(summary['archiveCount'], sum(1 for it in items if it.get('typeGroup') != 'reference'))  # 자료가 늘어도 깨지지 않게
                self.assertNotIn('updateDate', summary)
            finally:
                render.ROOT = source

    def test_cache_version_is_stable_and_tracks_data_and_nested_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'lib').mkdir()
            (root / 'data').mkdir()
            (root / 'data/exams.json').write_text('[1]')
            (root / 'lib/search.js').write_text("export const query = '국어';", encoding='utf-8')
            (root / 'app.js').write_text("import './lib/search.js';\nconst DATA_VERSION = 'old';\nfetch('data/exams.json?v=old');")
            (root / 'index.html').write_text('<script src="app.js?v=old"></script><a href="https://example.com/file.js?v=old">external</a><script src="//cdn.example.com/file.js?v=old"></script>')
            first, _ = versions.version_assets(root)
            self.assertEqual(versions.version_assets(root, True), (first, []))
            self.assertIn('https://example.com/file.js?v=old', (root / 'index.html').read_text())
            self.assertIn('//cdn.example.com/file.js?v=old', (root / 'index.html').read_text())
            (root / 'data/exams.json').write_text('[1,2]')
            second, changed = versions.version_assets(root)
            self.assertNotEqual(first, second)
            self.assertIn('index.html', changed)
            (root / 'lib/search.js').write_text("export const query = '영어';", encoding='utf-8')
            third, _ = versions.version_assets(root)
            self.assertNotEqual(second, third)
            self.assertEqual(versions.version_assets(root, True), (third, []))

    def test_global_index_preserves_search_metadata_without_download_payload(self):
        source = render.ROOT
        items = json.loads((source / 'data/exams.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            try:
                render.ROOT = Path(tmp)
                render.render_archive_splits(items)
                index = json.loads((render.ROOT / 'data/archive/all.json').read_text())
                expected = {e['id']: e for e in items if e.get('typeGroup') != 'reference'}
                self.assertEqual({e['id'] for e in index}, set(expected))
                for entry in index:
                    original = expected[entry['id']]
                    self.assertEqual(entry['subject'], original['subject'])
                    self.assertEqual(entry['hasListening'], bool(original.get('listenUrl') or original.get('scriptUrl')))
                    self.assertNotIn('questionUrl', entry)
            finally:
                render.ROOT = source

    def test_archive_split_omits_download_name_already_carried_by_url(self):
        source = render.ROOT
        items = [{
            'id': 1, 'curriculum': '2015', 'gradeYear': 2027, 'examYear': 2026,
            'month': 6, 'typeGroup': 'suneung', 'type': 'june',
            'subject': '국어', 'subSubject': None,
            'questionUrl': 'https://suneung-files.hdh061224.workers.dev/t/q.pdf?name=%EA%B5%AD%EC%96%B4.pdf',
            'questionDownload': '국어.pdf',
        }]
        with tempfile.TemporaryDirectory() as tmp:
            try:
                render.ROOT = Path(tmp)
                render.render_archive_splits(items)
                entry = json.loads((render.ROOT / 'data/archive/senior.json').read_text())[0]
                # 목록에는 주소 대신 있음 표시(1)만, 실제 주소는 senior.urls.json
                self.assertEqual(entry['questionUrl'], 1)
                self.assertNotIn('questionDownload', entry)
                urls = json.loads((render.ROOT / 'data/archive/senior.urls.json').read_text())
                self.assertEqual(urls['1'][0], items[0]['questionUrl'])
            finally:
                render.ROOT = source

    def test_public_files_serves_downloads_from_own_domain(self):
        # 화면 HTML 의 문제지·음원 주소는 kicegg.com/files/ — hwp(GitHub 직링크)·다른 주소는 그대로
        html = ('<a href="https://suneung-files.hdh061224.workers.dev/kice-v5/q.pdf?name=a.pdf">'
                '<a href="https://github.com/hongdoohyeon/Suneung/releases/download/x/a.hwp">')
        out = render.bd.public_files(html)
        self.assertIn('href="https://kicegg.com/files/kice-v5/q.pdf?name=a.pdf"', out)
        self.assertIn('href="https://github.com/hongdoohyeon/Suneung/releases/download/x/a.hwp"', out)
        self.assertNotIn('workers.dev', out)

    def test_grouped_moments_recovers_known_distribution(self):
        # 표준점수 영역: 평균 100·σ 20 정규분포의 이론 등급컷 → 추정 평균·σ·왜도가 가까워야 한다
        from statistics import NormalDist
        nd = NormalDist(100, 20)
        cum = [.04, .11, .23, .40, .60, .77, .89, .96]
        cuts = [round(nd.inv_cdf(1 - c)) for c in cum]
        edges = render.bd.relative_edges(cuts, 40, 160)
        mean, sd, skew = render.bd.grouped_moments(edges, render.bd.GRADE_RATIOS)
        self.assertAlmostEqual(mean, 100, delta=1.5)
        self.assertAlmostEqual(sd, 20, delta=1.5)
        self.assertAlmostEqual(skew, 0, delta=0.15)

    def test_tier_uses_three_levels_for_small_series_and_five_for_large(self):
        vals_small = [1, 2, 3, 4, 5, 6]
        self.assertEqual(render.bd._series_tier(vals_small, 6), 2)
        self.assertEqual(render.bd._series_tier(vals_small, 1), 4)
        self.assertEqual(render.bd._series_tier(vals_small, 3.5), 3)
        vals_big = list(range(20))
        self.assertEqual(render.bd._series_tier(vals_big, 19), 1)
        self.assertEqual(render.bd._series_tier(vals_big, 0), 5)

    def test_cut_moments_skips_broken_cuts(self):
        bad = {'standardCuts': [130, 140, 120, 110, 100, 90, 80, 70], 'rawCuts': [90, 80, 70, 60, 50, 40, 30, 20], 'fullScore': 100}
        out = render.bd.cut_moments(bad, False)
        self.assertNotIn('skew', out)          # 순서가 어긋난 표점 컷은 버린다
        self.assertIn('mean', out)
        self.assertGreater(out['mean'], 0.4)
        self.assertLess(out['mean'], 0.8)

    def test_absolute_english_tier_follows_first_grade_ratio(self):
        # 1등급 비율이 낮을수록 어려움 — 평균이 높게 추정되더라도 등급은 1등급 비율을 따른다
        items = [{'id': i, 'curriculum': '2015', 'gradeYear': 2018 + i, 'type': 'csat', 'typeGroup': 'suneung',
                  'subject': '영어', 'subSubject': None} for i in range(6)]
        cuts = [{'curriculum': '2015', 'gradeYear': 2018 + i, 'type': 'csat', 'subject': '영어', 'subSubject': None,
                 'rawCuts': [90], 'absolute': True} for i in range(6)]
        import unittest.mock as um
        ratios = {f'{2018 + i}|csat': {'ratios': [r, 15, 25, 25, 15, 10, 5, 3, 1]} for i, r in enumerate([3, 8, 12, 5, 20, 1])}
        with um.patch.object(Path, 'read_text', return_value=json.dumps(ratios)):
            out = render.bd.compute_exam_scores(items, cuts)
        self.assertEqual(out[5]['tierBasis'], 'ratio')
        self.assertEqual(out[4]['tier'], 2)   # 1등급 20% → 쉬움
        self.assertEqual(out[5]['tier'], 4)   # 1등급 1% → 어려움 (6회차라 3단계)


    def test_set_related_links_cover_prev_next_same_exam_and_hubs(self):
        cat = [
            {'fname': f'exam-set-kice-{y}-sept.html', 'head': f'{y}학년도 9월 모의평가', 'gy': y, 'examYear': y - 1, 'month': 9,
             'typeGroup': 'suneung', 'ntype': 'sept', 'sg': None} for y in (2024, 2025, 2026)
        ] + [{'fname': 'exam-set-kice-2026-june.html', 'head': '2026학년도 6월 모의평가', 'gy': 2026, 'examYear': 2025, 'month': 6,
              'typeGroup': 'suneung', 'ntype': 'june', 'sg': None}]
        me = cat[1]
        html = render.bd.set_related_html(me, cat, ['국어', '수학'])
        self.assertIn('href="exam-set-kice-2024-sept.html"', html)
        self.assertIn('href="exam-set-kice-2026-sept.html"', html)
        self.assertIn('이전 시험', html)
        self.assertIn('href="exam-set-kice-2026-june.html"', html)       # 같은 학년도의 다른 시험
        self.assertNotIn('href="exam-set-kice-2025-sept.html"', html)     # 자기 자신은 제외
        self.assertIn('suneung-korean.html', html)

    def test_set_titles_include_student_search_terms(self):
        exams = [{'subject': '국어'}]
        edu = render.bd.build_set_meta('2015', '2027', 'mar', 3, exams)
        self.assertIn('3모', edu['title'])
        self.assertIn('모의고사', edu['title'])
        self.assertIn('학력평가', edu['title'])
        csat = render.bd.build_set_meta('2015', '2026', 'csat', None, exams)
        self.assertIn('수능', csat['title'])


if __name__ == '__main__':
    unittest.main()
