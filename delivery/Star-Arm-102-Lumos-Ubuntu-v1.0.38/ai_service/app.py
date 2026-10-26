"""Loopback-only standalone Lumos API; no ACT/training/camera endpoints."""
import json
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .domain import DomainError
from .lumos_runtime import LumosRuntime

METHODS = {
    'connect': 'connect', 'sample': 'sample',
    'capture-reference': 'capture_reference', 'capture-gripper': 'capture_gripper',
    'finish-calibration': 'finish_calibration', 'restore-calibration': 'restore_calibration',
    'start': 'start', 'stop': 'stop', 'disconnect': 'disconnect',
}


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, data_root, static_root, lumos=None):
        if address[0] != '127.0.0.1':
            raise ValueError('本地 Lumos 仅允许绑定 127.0.0.1')
        self.static_root = Path(static_root).resolve()
        self.data_root = Path(data_root).resolve()
        self.data_root.mkdir(parents=True, exist_ok=True)
        super().__init__(address, Handler)
        self.lumos = lumos if lumos is not None else LumosRuntime(
            calibration_path=self.data_root / 'lumos/calibration.json')

    def server_close(self):
        try:
            if hasattr(self, 'lumos'):
                self.lumos.close()
        finally:
            super().server_close()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'application/javascript', '.css': 'text/css',
                      '.STL': 'application/octet-stream', '.stl': 'application/octet-stream',
                      '.bin': 'application/octet-stream', '.urdf': 'application/xml'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].static_root), **kwargs)

    def log_message(self, format, *args):
        return

    def _local(self, mutation=False):
        port = self.server.server_address[1]
        host = self.headers.get('Host', '').lower()
        if self.client_address[0] not in {'127.0.0.1', '::1'} or host not in {
                f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'}:
            raise DomainError('请从本机 127.0.0.1 页面操作', 'lumos_local_only')
        origin = self.headers.get('Origin')
        if origin and origin != f'http://{host}':
            raise DomainError('本地包只接受本机同源页面请求', 'lumos_origin_denied')
        if mutation and self.headers.get_content_type() != 'application/json':
            raise DomainError('请求需要 application/json', 'invalid_request')

    def _json(self, status, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, error):
        status = 403 if error.code in {'lumos_local_only', 'lumos_origin_denied'} else 400
        self._json(status, {'error': {'code': error.code, 'message': str(error)}})

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError as error:
            raise DomainError('请求长度无效', 'invalid_request') from error
        if length < 0 or length > 16384:
            raise DomainError('请求内容过大', 'payload_too_large')
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise DomainError('请求内容不完整', 'invalid_request')
        try:
            def invalid_constant(value):
                raise ValueError(value)
            body = json.loads(raw or b'{}', parse_constant=invalid_constant)
        except (ValueError, UnicodeDecodeError) as error:
            raise DomainError('JSON 请求无效', 'invalid_json') from error
        if not isinstance(body, dict):
            raise DomainError('请求需要 JSON 对象', 'invalid_request')
        return body

    def do_GET(self):
        try:
            self._local()
            path = urlsplit(self.path).path
            if path == '/api/lumos/launcher':
                identity = getattr(self.server, 'lumos_launcher_identity', None)
                return self._json(200, identity) if identity else self._json(404, {'error': {'code': 'not_found'}})
            if path == '/api/v1/lumos/status':
                return self._json(200, self.server.lumos.snapshot())
            if path == '/api/v1/health':
                return self._json(200, {'service': 'star-arm-lumos-local', 'version': '1.0.37',
                                        'status': 'ok', 'local_only': True})
            if path.startswith('/api/'):
                return self._json(404, {'error': {'code': 'not_found', 'message': '本地包仅提供 Lumos 功能'}})
            translated = Path(self.translate_path(self.path)).resolve()
            if not translated.is_relative_to(self.server.static_root):
                return self.send_error(403)
            return super().do_GET()
        except DomainError as error:
            self._error(error)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def do_HEAD(self):
        try:
            self._local()
            return super().do_HEAD()
        except DomainError as error:
            self._error(error)

    def do_POST(self):
        try:
            body = self._body()
            self._local(mutation=True)
            path = urlsplit(self.path).path
            if path == '/api/v1/emergency-stop':
                self.server.lumos.emergency_stop(str(body.get('reason', '本机网页紧急停止'))[:256])
                return self._json(200, self.server.lumos.snapshot())
            operation = path.removeprefix('/api/v1/lumos/') if path.startswith('/api/v1/lumos/') else ''
            method = METHODS.get(operation)
            if method is None:
                return self._json(404, {'error': {'code': 'not_found', 'message': '本地包仅提供 Lumos 功能'}})
            return self._json(200, getattr(self.server.lumos, method)(body))
        except DomainError as error:
            self._error(error)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True


def create_server(address, data_root, static_root, *, data_dir_explicit=False, lumos=None):
    return ApiServer(address, data_root, static_root, lumos=lumos)
