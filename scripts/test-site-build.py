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
                self.assertEqual(summary['archiveCount'], 9624)
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


if __name__ == '__main__':
    unittest.main()
