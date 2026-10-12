import io
import time
import unittest

from ai_service.native_cameras import NativeCameraError, V4L2CameraManager


JPEG = b'\xff\xd8frame\xff\xd9'


class FakeProcess:
    def __init__(self, payload=b'', returncode=None, stderr=b'', persistent=False):
        self.stdout = io.BytesIO(payload)
        self.stderr = io.BytesIO(stderr)
        self.returncode = returncode
        self.persistent = persistent
        self.terminated = False

    def poll(self):
        if self.returncode is not None:
            return self.returncode
        if self.persistent:
            return None
        if self.stdout.tell() >= len(self.stdout.getvalue()):
            return 0
        return None

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.terminated = True
        self.returncode = -9

    def wait(self, timeout=None):
        return self.returncode


DEVICES = [
    {'stable_id': 'usb-a', 'name': 'Camera A', 'path': '/dev/video2', 'nodes': ['/dev/video2']},
    {'stable_id': 'usb-b', 'name': 'Camera B', 'path': '/dev/video4', 'nodes': ['/dev/video4']},
]
MODE = {'pixel_format': 'MJPG', 'width': 640, 'height': 480, 'fps': 60.0}


class NativeCameraManagerTests(unittest.TestCase):
    def test_connect_waits_for_valid_frames_from_both_roles(self):
        processes = [FakeProcess(JPEG, persistent=True), FakeProcess(JPEG, persistent=True)]
        manager = V4L2CameraManager(
            device_probe=lambda: DEVICES,
            mode_probe=lambda path: [MODE],
            popen=lambda *args, **kwargs: processes.pop(0),
            startup_timeout=0.2,
        )

        result = manager.connect('usb-a', 'usb-b', {'width': 640, 'height': 360, 'fps': 30})

        self.assertEqual(result['status'], 'streaming')
        self.assertEqual(result['roles']['wrist']['mode']['pixel_format'], 'MJPG')
        self.assertEqual(manager.latest_frame('wrist')[1], JPEG)
        manager.close()

    def test_second_camera_failure_rolls_back_first_process(self):
        first = FakeProcess(JPEG, persistent=True)
        second = FakeProcess(b'', returncode=1, stderr=b'VIDIOC_STREAMON returned -1 (No space left on device)')
        processes = [first, second]
        manager = V4L2CameraManager(
            device_probe=lambda: DEVICES,
            mode_probe=lambda path: [MODE],
            popen=lambda *args, **kwargs: processes.pop(0),
            startup_timeout=0.1,
        )

        with self.assertRaisesRegex(NativeCameraError, 'USB 视频带宽不足'):
            manager.connect('usb-a', 'usb-b', {'width': 640, 'height': 360, 'fps': 30})

        self.assertTrue(first.terminated)
        self.assertEqual(manager.snapshot()['status'], 'idle')

    def test_duplicate_physical_device_is_rejected_before_process_start(self):
        manager = V4L2CameraManager(device_probe=lambda: DEVICES, mode_probe=lambda path: [MODE])

        with self.assertRaisesRegex(NativeCameraError, '不同摄像头'):
            manager.connect('usb-a', 'usb-a', {'width': 640, 'height': 360, 'fps': 30})

    def test_recording_samples_each_role_at_target_fps_and_stops_cleanly(self):
        processes = [FakeProcess(JPEG, persistent=True), FakeProcess(JPEG, persistent=True)]
        stored = []
        manager = V4L2CameraManager(
            device_probe=lambda: DEVICES,
            mode_probe=lambda path: [MODE],
            popen=lambda *args, **kwargs: processes.pop(0),
            startup_timeout=0.2,
        )
        manager.connect('usb-a', 'usb-b', {'width': 640, 'height': 360, 'fps': 30})

        manager.start_recording('episode-1', 30, lambda episode_id, role, frames: stored.append((episode_id, role, frames)))
        deadline = time.monotonic() + 0.3
        while len(stored) < 2 and time.monotonic() < deadline:
            time.sleep(0.01)
        manager.stop_recording()

        self.assertEqual({item[1] for item in stored}, {'wrist', 'world'})
        for episode_id, role, frames in stored:
            self.assertEqual(episode_id, 'episode-1')
            self.assertEqual(frames[0]['jpeg'], JPEG)
            self.assertEqual(frames[0]['width'], 640)
            self.assertEqual(frames[0]['height'], 480)
        self.assertFalse(manager.snapshot()['recording'])
        manager.close()

    def test_stream_exit_after_valid_frame_invalidates_stale_role(self):
        wrist = FakeProcess(JPEG, persistent=True, stderr=b'usb disconnect')
        world = FakeProcess(JPEG, persistent=True)
        processes = [wrist, world]
        manager = V4L2CameraManager(
            device_probe=lambda: DEVICES,
            mode_probe=lambda path: [MODE],
            popen=lambda *args, **kwargs: processes.pop(0),
            startup_timeout=0.2,
        )
        manager.connect('usb-a', 'usb-b', {'width': 640, 'height': 360, 'fps': 30})

        wrist.returncode = 1
        deadline = time.monotonic() + 0.5
        while manager.snapshot()['status'] == 'streaming' and time.monotonic() < deadline:
            time.sleep(0.01)

        snapshot = manager.snapshot()
        self.assertEqual(snapshot['status'], 'fault')
        self.assertIn('Camera A', snapshot['error'])
        self.assertIn('usb disconnect', snapshot['roles']['wrist']['error'])
        self.assertIsNone(manager.latest_frame('wrist'))
        self.assertIsNotNone(manager.latest_frame('world'))
        manager.close()

    def test_live_process_with_stale_frame_is_not_reported_as_streaming(self):
        processes = [FakeProcess(JPEG, persistent=True), FakeProcess(JPEG, persistent=True)]
        manager = V4L2CameraManager(
            device_probe=lambda: DEVICES,
            mode_probe=lambda path: [MODE],
            popen=lambda *args, **kwargs: processes.pop(0),
            startup_timeout=0.2,
            frame_stale_timeout=0.02,
        )
        manager.connect('usb-a', 'usb-b', {'width': 640, 'height': 360, 'fps': 30})
        time.sleep(0.03)

        snapshot = manager.snapshot()
        self.assertEqual(snapshot['status'], 'fault')
        self.assertIn('画面停止更新', snapshot['error'])
        self.assertGreater(snapshot['roles']['wrist']['frame_age_ms'], 20)
        self.assertIsNone(manager.latest_frame('wrist'))
        manager.close()


if __name__ == '__main__':
    unittest.main()
