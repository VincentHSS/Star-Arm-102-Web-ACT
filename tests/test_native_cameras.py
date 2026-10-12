import subprocess
import unittest

from ai_service.native_cameras import (
    NativeCameraError,
    choose_mjpeg_mode,
    parse_v4l2_device_list,
    parse_v4l2_formats,
)


DEVICE_LIST = """icspring camera: icspring camer (usb-0000:06:00.3-1):
\t/dev/video4
\t/dev/video5
\t/dev/media2

icspring camera: icspring camer (usb-0000:06:00.3-2):
\t/dev/video2
\t/dev/video3
\t/dev/media1

Integrated Camera: Integrated C (usb-0000:06:00.3-3):
\t/dev/video0
\t/dev/video1
\t/dev/media0
"""

FORMATS = """ioctl: VIDIOC_ENUM_FMT
\tType: Video Capture

\t[0]: 'MJPG' (Motion-JPEG, compressed)
\t\tSize: Discrete 1920x1080
\t\t\tInterval: Discrete 0.017s (60.000 fps)
\t\tSize: Discrete 1280x720
\t\t\tInterval: Discrete 0.017s (60.000 fps)
\t\tSize: Discrete 640x480
\t\t\tInterval: Discrete 0.017s (60.000 fps)
\t[1]: 'YUYV' (YUYV 4:2:2)
\t\tSize: Discrete 640x480
\t\t\tInterval: Discrete 0.033s (30.000 fps)
"""


class NativeCameraParsingTests(unittest.TestCase):
    def test_device_list_groups_multiple_video_nodes_as_one_physical_camera(self):
        devices = parse_v4l2_device_list(DEVICE_LIST)

        self.assertEqual([item["path"] for item in devices], ["/dev/video4", "/dev/video2", "/dev/video0"])
        self.assertEqual([item["name"] for item in devices], [
            "icspring camera: icspring camer",
            "icspring camera: icspring camer",
            "Integrated Camera: Integrated C",
        ])
        self.assertEqual(len({item["stable_id"] for item in devices}), 3)
        self.assertEqual(devices[0]["nodes"], ["/dev/video4", "/dev/video5"])

    def test_format_parser_and_selector_choose_nearest_native_mjpeg_mode(self):
        modes = parse_v4l2_formats(FORMATS)

        selected = choose_mjpeg_mode(modes, width=640, height=360, fps=30)

        self.assertEqual(selected, {"pixel_format": "MJPG", "width": 640, "height": 480, "fps": 60.0})

    def test_selector_never_silently_uses_uncompressed_yuyv(self):
        modes = parse_v4l2_formats("""[0]: 'YUYV' (YUYV 4:2:2)\n\tSize: Discrete 640x480\n\t\tInterval: Discrete 0.033s (30.000 fps)\n""")

        with self.assertRaisesRegex(NativeCameraError, "不支持 MJPEG"):
            choose_mjpeg_mode(modes, width=640, height=480, fps=30)


if __name__ == "__main__":
    unittest.main()
