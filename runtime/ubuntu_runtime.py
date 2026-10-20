"""User-session ACT runtime for the installed Ubuntu desktop application."""
import argparse
import hashlib
from http.client import HTTPException
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parent
PORT = 18765
VERSION = '1.0.23'


def normalize_origin(value):
    parsed = urlsplit(value.strip())
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('网站地址无效')
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('网站授权地址不能包含路径或额外参数')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('网站需要启用 HTTPS')
    host = parsed.hostname.encode('idna').decode('ascii')
    if ':' in host:
        host = f'[{host}]'
    port = parsed.port
    suffix = f':{port}' if port and port != (443 if parsed.scheme == 'https' else 80) else ''
    return f'{parsed.scheme}://{host}{suffix}'


def origin_from_uri(uri):
    parsed = urlsplit(uri)
    if parsed.scheme != 'star-arm-act' or parsed.netloc != 'connect' or parsed.path not in ('', '/'):
        raise ValueError('启动链接无效，请从网页重新启用 ACT')
    values = parse_qs(parsed.query, strict_parsing=True)
    if set(values) != {'origin'} or len(values['origin']) != 1 or parsed.fragment:
        raise ValueError('启动链接包含无效参数')
    return normalize_origin(values['origin'][0])


def state_directory():
    return Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'star-arm-act'


def read_config(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def save_config(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.chmod(0o600)
    os.replace(temporary, path)


def authorized_origins(path):
    values = read_config(path).get('origins', [])
    origins = set()
    if not isinstance(values, list):
        return origins
    for value in values:
        try:
            origins.add(normalize_origin(value))
        except (ValueError, TypeError, AttributeError):
            pass
    return origins


def configure_publisher(directory):
    """Use the website fixed by the publisher in the installed package."""
    value = read_config(ROOT / 'website.json').get('origin')
    if not value:
        # A generic delivery may be configured by the publisher later. Start
        # the runtime, but authorize no remote website until then.
        return None
    origin = normalize_origin(value)
    path = directory / 'websites.json'
    config = read_config(path)
    config['origins'] = sorted(authorized_origins(path) | {origin})
    save_config(path, config)
    return origin


def serve(directory, port=PORT, static_root=None):
    # The installed /opt application is read-only. All configuration stays with
    # this desktop user, including the existing page's data-directory setting.
    from ai_service import app
    directory.mkdir(parents=True, exist_ok=True)
    os.chdir(directory)
    app.CONFIG_FILE = directory / 'config.json'
    bridge_config = directory / 'websites.json'
    from ai_service.website_authorization import WebsiteConsent, consent_page, page
    consent = WebsiteConsent(normalize_origin)
    if not app._config_data_dir() and not os.environ.get('ACT_DATA_DIR'):
        app.write_config_data_dir(directory / 'data')

    class WebsiteHandler(app.Handler):
        def _local_origins(self):
            return {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}

        def _origin_allowed(self):
            origin = self.headers.get('Origin')
            return not origin or origin in self._local_origins() or origin in authorized_origins(bridge_config)

        def _health_path(self):
            return urlsplit(self.path).path == '/api/v1/health'

        def _allowed(self, health=False):
            if self.headers.get('Host') not in {urlsplit(value).netloc for value in self._local_origins()}:
                self._json(403, {'error': {'code': 'invalid_host', 'message': '请求地址无效'}})
                return False
            if not health and not self._origin_allowed():
                self._json(403, {'error': {'code': 'website_not_authorized', 'message': '当前网站与运行组件的发布配置不匹配，请由提供方更新配置'}})
                return False
            return True

        def end_headers(self):
            origin = self.headers.get('Origin')
            public_health = False
            if self._health_path() and origin:
                try:
                    public_health = normalize_origin(origin) == origin
                except ValueError:
                    pass
            if origin and (self._origin_allowed() or public_health):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
            super().end_headers()

        def do_OPTIONS(self):
            if not self._allowed(health=self._health_path()):
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Max-Age', '600')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_GET(self):
            if not self._allowed(health=self._health_path()):
                return
            if sys.platform == 'win32' and urlsplit(self.path).path == '/connect-website':
                if self.headers.get('Origin') not in (None, *self._local_origins()):
                    return self._json(403, {'error': {'message': '请在本机确认连接'}})
                try:
                    values = parse_qs(urlsplit(self.path).query)
                    if set(values) != {'origin'} or len(values['origin']) != 1:
                        raise ValueError('网站地址无效')
                    origin, token = consent.issue(values['origin'][0])
                    return self._consent_html(consent_page(origin, token))
                except ValueError as error:
                    return self._json(400, {'error': {'message': str(error)}})
            if self._health_path():
                return self._json(200, {'status': 'ok', 'version': VERSION, 'browser_bridge': True,
                                       'authorized': self._origin_allowed(), 'platform': sys.platform,
                                       'static_workbench': bool(static_root),
                                       'state_directory_id': state_directory_id(directory)})
            super().do_GET()

        def do_POST(self):
            if sys.platform == 'win32' and urlsplit(self.path).path == '/api/v1/websites/authorize':
                if not self._allowed():
                    return
                if self.headers.get('Origin') not in self._local_origins():
                    return self._json(403, {'error': {'message': '请通过本机确认页面连接网站'}})
                try:
                    values = parse_qs(self._raw_body(4096).decode('utf-8'), strict_parsing=True)
                    if set(values) != {'origin', 'token'} or any(len(v) != 1 for v in values.values()):
                        raise ValueError('连接确认无效')
                    origin = consent.consume(values['token'][0], values['origin'][0])
                    config = read_config(bridge_config)
                    config['origins'] = sorted(authorized_origins(bridge_config) | {origin})
                    save_config(bridge_config, config)
                    return self._consent_html(page('网页已连接', '<p>请关闭此页面，返回原网站。网页会自动检测连接并继续准备 ACT 环境。</p>'))
                except (ValueError, app.DomainError) as error:
                    return self._json(400, {'error': {'message': str(error)}})
            if self._allowed():
                super().do_POST()

        def _consent_html(self, body):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)

    data = Path(app.resolve_data_dir()).resolve()
    explicit = bool(app._config_data_dir() or os.environ.get('ACT_DATA_DIR'))
    server = app.create_server(('127.0.0.1', port), data, Path(static_root) if static_root else ROOT / 'Browser_SDK', data_dir_explicit=explicit)
    server.RequestHandlerClass = WebsiteHandler
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def state_directory_id(directory):
    return hashlib.sha256(os.path.normcase(str(directory.resolve())).encode('utf-8')).hexdigest()


def runtime_health_info():
    try:
        # Corporate/Conda proxies must never redirect this loopback request.
        with build_opener(ProxyHandler({})).open(f'http://127.0.0.1:{PORT}/api/v1/health', timeout=1) as response:
            health = json.loads(response.read(65536))
            if isinstance(health, dict) and health.get('status') == 'ok' and health.get('browser_bridge') is True and str(health.get('version', '')).startswith('1.'):
                return health
    except (OSError, ValueError, HTTPException):
        pass
    return None


def runtime_health():
    return runtime_health_info() is not None


def ensure_running(directory):
    if runtime_health():
        return
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'runtime.log').open('ab') as log:
        process = subprocess.Popen([sys.executable, str(ROOT / 'ubuntu_runtime.py'), '--serve'],
                         cwd=str(directory), stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                         start_new_session=True)
    for _ in range(80):
        if runtime_health():
            return
        if process.poll() not in (None, 0):
            raise RuntimeError(f'ACT 后台启动时退出（退出码 {process.returncode}）。请查看 {directory / "runtime.log"}；若端口被其他程序占用，先关闭那个程序再重试。')
        time.sleep(.15)
    raise RuntimeError('ACT 未能启动。请关闭旧版 ACT 程序后重试；详细记录保存在本机 runtime.log。')


def check_ubuntu():
    if sys.platform != 'linux' or not (3, 10) <= sys.version_info[:2] < (3, 13):
        raise RuntimeError('ACT 需要 Ubuntu 22.04 / 24.04 与 Python 3.10～3.12')
    release = Path('/etc/os-release').read_text(encoding='utf-8')
    if 'ID=ubuntu\n' not in release and 'ID="ubuntu"\n' not in release:
        raise RuntimeError('此安装组件面向 Ubuntu 桌面系统')


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('uri', nargs='?')
    parser.add_argument('--background', action='store_true')
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--state-dir', type=Path, default=None)
    args = parser.parse_args(argv)
    directory = args.state_dir or state_directory()
    if args.serve:
        if sys.platform == 'linux':
            import fcntl
            directory.mkdir(parents=True, exist_ok=True)
            singleton = (directory / 'runtime.lock').open('a')
            try:
                fcntl.flock(singleton.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return 0
        serve(directory, args.port)
        return 0
    if args.background:
        check_ubuntu()
        configure_publisher(directory)
        ensure_running(directory)
        return 0
    import tkinter as tk
    from tkinter import messagebox
    ui = tk.Tk()
    ui.withdraw()
    try:
        check_ubuntu()
        if not args.uri:
            configure_publisher(directory)
            ensure_running(directory)
            messagebox.showinfo('ACT 已连接', '本机设备服务已准备，网页会自动连接。请返回第 1 步采集；需要训练时再到第 2 步准备训练环境。')
            return 0
        origin = origin_from_uri(args.uri)
        path = directory / 'websites.json'
        if origin not in authorized_origins(path):
            if not messagebox.askyesno('允许网页使用 ACT',
                                      f'是否允许以下网站使用这台电脑上的 ACT、机械臂、相机和数据？\n\n{origin}\n\n请确认这是你正在使用的机械臂网站。'):
                return 0
            config = read_config(path)
            config['origins'] = sorted(authorized_origins(path) | {origin})
            save_config(path, config)
        ensure_running(directory)
        # No second workbench opens: the existing website detects the runtime.
        return 0
    except Exception as error:
        messagebox.showerror('ACT 启用失败', str(error))
        return 1
    finally:
        ui.destroy()


if __name__ == '__main__':
    raise SystemExit(main())
