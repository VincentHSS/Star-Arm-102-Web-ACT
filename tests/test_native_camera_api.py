import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from ai_service.app import create_server


JPEG = b'\xff\xd8native-frame\xff\xd9'


class FakeNativeCameras:
    def __init__(self):
        self.connected = False
        self.closed = 0
        self.recording = None

    def available(self):
        return True

    def devices(self):
        return [
            {'stable_id': 'usb-a', 'name': 'Camera A', 'path': '/dev/video2', 'nodes': ['/dev/video2']},
            {'stable_id': 'usb-b', 'name': 'Camera B', 'path': '/dev/video4', 'nodes': ['/dev/video4']},
        ]

    def connect(self, wrist_id, world_id, profile):
        self.connected = True
        self.profile = profile
        return self.snapshot()

    def snapshot(self):
        return {
            'backend': 'native',
            'status': 'streaming' if self.connected else 'idle',
            'roles': {
                'wrist': {'device_id': 'usb-a', 'device_name': 'Camera A', 'mode': {'pixel_format': 'MJPG', 'width': 640, 'height': 480, 'fps': 60.0}, 'actual_fps': 59.8, 'frames': 100, 'dropped': 0, 'error': None},
                'world': {'device_id': 'usb-b', 'device_name': 'Camera B', 'mode': {'pixel_format': 'MJPG', 'width': 640, 'height': 480, 'fps': 60.0}, 'actual_fps': 59.7, 'frames': 100, 'dropped': 0, 'error': None},
            } if self.connected else {},
        }

    def latest_frame(self, role):
        return (1, JPEG, 1.0) if self.connected else None

    def close(self):
        self.connected = False
        self.closed += 1

    def start_recording(self, episode_id, fps, sink):
        self.recording = (episode_id, fps, sink)

    def stop_recording(self):
        self.recording = None


class NativeCameraApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cameras = FakeNativeCameras()
        self.server = create_server(('127.0.0.1', 0), Path(self.tmp.name), Path('Browser_SDK'), native_cameras=self.cameras)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def json_request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = Request(self.base + path, data=data, method=method, headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=2) as response:
            return response.status, json.load(response)

    def test_native_camera_devices_connect_status_frame_and_disconnect(self):
        status, devices = self.json_request('GET', '/api/v1/cameras/native')
        self.assertEqual(status, 200)
        self.assertTrue(devices['available'])
        self.assertEqual([item['stable_id'] for item in devices['devices']], ['usb-a', 'usb-b'])

        status, connected = self.json_request('POST', '/api/v1/cameras/native/connect', {
            'wrist_camera_id': 'usb-a', 'world_camera_id': 'usb-b',
            'width': 640, 'height': 360, 'fps': 30,
        })
        self.assertEqual(status, 200)
        self.assertEqual(connected['status'], 'streaming')
        self.assertEqual(self.cameras.profile, {'width': 640, 'height': 360, 'fps': 30})

        with urlopen(self.base + '/api/v1/cameras/native/wrist/frame', timeout=2) as response:
            self.assertEqual(response.headers.get_content_type(), 'image/jpeg')
            self.assertEqual(response.read(), JPEG)

        status, snapshot = self.json_request('GET', '/api/v1/cameras/native/status')
        self.assertEqual(snapshot['roles']['world']['mode']['pixel_format'], 'MJPG')

        status, result = self.json_request('POST', '/api/v1/cameras/native/disconnect', {})
        self.assertEqual(result['status'], 'idle')
        self.assertGreaterEqual(self.cameras.closed, 1)

    def test_server_close_releases_native_camera_processes(self):
        self.server.shutdown()
        before = self.cameras.closed
        self.server.server_close()
        self.assertGreater(self.cameras.closed, before)


if __name__ == '__main__':
    unittest.main()
