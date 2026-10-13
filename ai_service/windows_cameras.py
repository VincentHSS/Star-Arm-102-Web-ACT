"""DirectShow camera input, sharing the existing JPEG/age/recording lifecycle."""
import os
import re
import subprocess
from pathlib import Path

from .native_cameras import V4L2CameraManager, NativeCameraError, choose_mjpeg_mode


def parse_dshow_devices(output):
    devices, current = [], None
    for line in str(output).splitlines():
        match = re.search(r'"(.+)" \((video|audio)\)', line)
        if match:
            current = {'name': match[1]} if match[2] == 'video' else None
            continue
        alternative = re.search(r'Alternative name "(.+)"', line)
        if alternative and current:
            # Unique DirectShow paths distinguish two cameras with identical names.
            identity = alternative[1]
            devices.append({**current, 'path': identity, 'stable_id': identity, 'nodes': [identity]})
            current = None
    return devices


def parse_dshow_modes(output):
    modes = []
    for line in str(output).splitlines():
        encoding = re.search(r'(?:vcodec|pixel_format)=([^\s]+)', line)
        if not encoding:
            continue
        pixel = 'MJPG' if encoding[1] == 'mjpeg' else ('raw:' + encoding[1] if 'pixel_format=' in line else None)
        if not pixel:
            continue
        for match in re.finditer(r's=(\d+)x(\d+)\s+fps=([\d.]+)', line):
            mode = {'pixel_format': pixel, 'width': int(match[1]), 'height': int(match[2]), 'fps': float(match[3])}
            if mode['fps'] > 0 and mode not in modes:
                modes.append(mode)
    return modes


def build_dshow_command(path, mode, executable):
    command = [str(executable), '-hide_banner', '-loglevel', 'error', '-nostdin',
               '-f', 'dshow', '-rtbufsize', '32M', '-video_size', f"{mode['width']}x{mode['height']}",
               '-framerate', str(mode['fps'])]
    if mode['pixel_format'] == 'MJPG':
        command += ['-vcodec', 'mjpeg']
    else:
        command += ['-pixel_format', mode['pixel_format'].removeprefix('raw:')]
    command += ['-i', 'video=' + str(path), '-an', '-c:v', 'copy' if mode['pixel_format'] == 'MJPG' else 'mjpeg']
    if mode['pixel_format'] != 'MJPG':
        command += ['-q:v', '4', '-threads', '1']
    return command + ['-f', 'mjpeg', 'pipe:1']


class WindowsCameraManager(V4L2CameraManager):
    def __init__(self, executable_resolver, runner=None, **kwargs):
        self._executable_resolver = executable_resolver
        self._runner = runner or subprocess.run
        super().__init__(device_probe=self._devices, mode_probe=self._modes,
                         command_builder=lambda path, mode: build_dshow_command(path, mode, self._executable()), **kwargs)

    def _executable(self):
        value = self._executable_resolver()
        if not value or not Path(value).is_file():
            raise NativeCameraError('Windows 相机环境尚未准备，请先在第 2 步准备运行环境')
        return str(value)

    def available(self):
        try:
            self._executable()
            return True
        except NativeCameraError:
            return False

    def _probe(self, arguments):
        try:
            result = self._runner([self._executable(), '-hide_banner', *arguments],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=8, check=False,
                **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
        except (OSError, subprocess.TimeoutExpired) as error:
            raise NativeCameraError(f'Windows 摄像头检测失败：{error}') from error
        # FFmpeg uses a nonzero exit status after listing devices/options.
        return (result.stderr or '') + '\n' + (result.stdout or '')

    def _devices(self):
        if not self.available():
            return []
        return parse_dshow_devices(self._probe(['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']))

    def _modes(self, path):
        modes = parse_dshow_modes(self._probe(['-list_options', 'true', '-f', 'dshow', '-i', 'video=' + path]))
        if not modes:
            raise NativeCameraError('未读取到相机支持的模式，请检查 Windows 相机权限和设备占用')
        return modes

    def _choose_mode(self, modes, profile):
        jpeg = [mode for mode in modes if mode['pixel_format'] == 'MJPG']
        candidates = jpeg or modes
        # Rank raw modes with the existing resolution/FPS rule, then retain their encoding.
        ranked = [dict(mode, pixel_format='MJPG') for mode in candidates]
        chosen = choose_mjpeg_mode(ranked, profile['width'], profile['height'], profile['fps'])
        index = ranked.index(chosen)
        return dict(candidates[index])
