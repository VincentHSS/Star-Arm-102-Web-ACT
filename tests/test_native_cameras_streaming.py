import unittest

from ai_service.native_cameras import (
    build_stream_command,
    iter_jpeg_frames,
)


class NativeCameraStreamingTests(unittest.TestCase):
    def test_stream_command_forces_mjpeg_and_writes_binary_frames_to_stdout(self):
        command = build_stream_command('/dev/video2', {'width': 640, 'height': 480, 'fps': 60.0})

        self.assertEqual(command[:3], ['v4l2-ctl', '-d', '/dev/video2'])
        self.assertIn('--set-fmt-video=width=640,height=480,pixelformat=MJPG', command)
        self.assertIn('--set-parm=60', command)
        self.assertIn('--stream-to=-', command)

    def test_jpeg_parser_yields_complete_frames_and_keeps_partial_tail(self):
        first = b'noise\xff\xd8one\xff\xd9tail'
        second = b'\xff\xd8two\xff\xd9'

        frames, tail = iter_jpeg_frames(first + second[:4])

        self.assertEqual(frames, [b'\xff\xd8one\xff\xd9'])
        self.assertEqual(tail, b'\xff\xd8tw')

    def test_jpeg_parser_discards_truncated_prefix_merged_before_next_frame(self):
        # A truncated frame (SOI with no EOI) immediately followed by a complete
        # frame must NOT be merged into a corrupt double-SOI JPEG. This is the
        # root cause of the "broken data stream when reading image file" fault.
        data = b'\xff\xd8partial_garbage\xff\xd8complete_frame\xff\xd9'

        frames, tail = iter_jpeg_frames(data)

        self.assertEqual(frames, [b'\xff\xd8complete_frame\xff\xd9'])
        self.assertEqual(tail, b'')


if __name__ == '__main__':
    unittest.main()
