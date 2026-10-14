import concurrent.futures
import http.client
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent

@unittest.skipUnless(os.name == 'nt', 'Windows PowerShell launcher')
class BrowserLocalTests(unittest.TestCase):
    def test_static_files_modules_wasm_and_request_boundaries(self):
        with tempfile.TemporaryDirectory(prefix='star-arm local test ') as directory:
            root = Path(directory)
            (root / 'act-browser.html').write_bytes(b'<!doctype html><title>Local test</title>')
            (root / 'worker.mjs').write_bytes(b'export const test = true;')
            (root / 'runtime.wasm').write_bytes(b'\x00asm\x01\x00\x00\x00')
            script = ROOT / 'tools/start_browser_local.ps1'
            process = subprocess.Popen(['powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script), '-NoBrowser', '-Port', '0', '-WebRoot', directory],
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            lines = queue.Queue()
            def collect():
                for line in process.stdout: lines.put(line.strip())
                lines.put('PROCESS_EXITED')
            reader = threading.Thread(target=collect, daemon=True)
            reader.start()
            try:
                output = []
                while True:
                    line = lines.get(timeout=45)
                    output.append(line)
                    self.assertNotEqual(line, 'PROCESS_EXITED', '\n'.join(output))
                    if line.startswith('ACT_BROWSER_LOCAL_URL='):
                        url = urlsplit(line.split('=', 1)[1]); break
                def request(path, method='GET', headers=None):
                    connection = http.client.HTTPConnection('127.0.0.1', url.port, timeout=10)
                    try:
                        connection.request(method, path, headers=headers or {})
                        response = connection.getresponse()
                        return response.status, dict(response.getheaders()), response.read()
                    finally: connection.close()
                status, headers, body = request('/')
                self.assertEqual(status, 200); self.assertIn(b'Local test', body)
                self.assertEqual(headers['Cache-Control'], 'no-store')
                self.assertEqual(request('/worker.mjs')[1]['Content-Type'], 'text/javascript; charset=utf-8')
                self.assertEqual(request('/runtime.wasm')[1]['Content-Type'], 'application/wasm')
                self.assertEqual(request('/runtime.wasm', 'HEAD')[2], b'')
                self.assertEqual(request('/missing')[0], 404)
                self.assertEqual(request('/%2e%2e/start_browser_local.ps1')[0], 404)
                self.assertEqual(request('/', 'POST')[0], 405)
                self.assertEqual(request('/', headers={'Host': 'untrusted.example'})[0], 400)
                with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                    results = list(pool.map(request, ['/worker.mjs'] * 16))
                self.assertTrue(all(result[0] == 200 for result in results))
            finally:
                process.terminate(); process.wait(timeout=10)
                reader.join(timeout=5); process.stdout.close()
