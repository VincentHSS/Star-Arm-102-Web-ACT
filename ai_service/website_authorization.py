"""One-time desktop-browser consent for a Windows website connection."""
import html
import secrets
import threading
import time


class WebsiteConsent:
    def __init__(self, normalize, clock=time.monotonic):
        self.normalize, self.clock = normalize, clock
        self._pending = {}
        self._lock = threading.Lock()

    def issue(self, origin):
        origin = self.normalize(origin)
        now = self.clock()
        with self._lock:
            self._pending = {key: value for key, value in self._pending.items() if value[1] > now}
            if len(self._pending) >= 64:
                raise ValueError('连接请求过多，请稍后再试')
            token = secrets.token_urlsafe(32)
            self._pending[token] = (origin, now + 300)
        return origin, token

    def consume(self, token, origin):
        origin = self.normalize(origin)
        with self._lock:
            record = self._pending.pop(token, None)
        if not record or record[0] != origin or record[1] <= self.clock():
            raise ValueError('此连接确认已失效，请回原网页重新点击连接')
        return origin


def consent_page(origin, token):
    origin, token = html.escape(origin, quote=True), html.escape(token, quote=True)
    return page('连接你的网页', f'<p>允许下面的网站使用这台电脑的 ACT 服务：</p><p class="origin">{origin}</p>'
        '<p>连接后可在原网页准备环境、导入模型并操作本机设备。请确认这是你正在使用的网站。</p>'
        '<form method="post" action="/api/v1/websites/authorize">'
        f'<input type="hidden" name="origin" value="{origin}"><input type="hidden" name="token" value="{token}">'
        '<button type="submit">允许连接这个网站</button></form>')


def page(title, body):
    return ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Star Arm 102 · 网页连接</title><style>body{margin:0;padding:40px 20px;background:#101719;color:#e4edf0;'
        'font:16px/1.7 system-ui,sans-serif}main{max-width:620px;margin:8vh auto;padding:36px;border:1px solid #35494f;'
        'border-radius:20px;background:#1b272b}h1{font-size:28px}.origin{padding:16px;background:#111c20;word-break:break-all;'
        'border-radius:10px;color:#50d1db}button{padding:14px 22px;border:0;border-radius:10px;background:#43ccd5;'
        'color:#102125;font:inherit;font-weight:600;cursor:pointer}button:hover{background:#76e1e8}</style>'
        f'<main><h1>{html.escape(title)}</h1>{body}</main></html>').encode('utf-8')
