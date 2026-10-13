import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from ai_service.capabilities import serial_candidates
from ai_service.domain import DomainError
from ai_service.native_act_driver import AttachedUart, serial_module
from ai_service.serial_connections import SerialConnectionManager
from ai_service.training_environment import TrainingEnvironmentManager
from ai_service.training_jobs import TrainingJobManager
from ai_service.windows_cameras import (
    WindowsCameraManager, build_dshow_command, parse_dshow_devices, parse_dshow_modes,
)
from tests.test_native_act_driver import Uart
from tests.test_native_camera_manager import FakeProcess, JPEG


class WindowsUart(Uart):
    def reset_input_buffer(self):
        self.buffer.clear()

    def close(self):
        self.is_open = False


class WindowsSerialTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.uart = WindowsUart()
        self.manager = SerialConnectionManager(Path(self.temp.name))
        self.addCleanup(self.manager.close_all)
        self.module = patch('ai_service.serial_connections.serial_module', return_value=SimpleNamespace(Serial=lambda **kwargs: self.open(kwargs)))
        self.module.start(); self.addCleanup(self.module.stop)
        self.platform = patch('ai_service.serial_connections.termios', None)
        self.platform.start(); self.addCleanup(self.platform.stop)

    def open(self, kwargs):
        self.settings = kwargs
        return self.uart

    def connect(self):
        return self.manager.connect('follower', 'COM7', ['COM7', 'COM8'])

    def test_com_transport_uses_actual_product_baudrate_and_nonblocking_reads(self):
        result = self.connect()
        self.assertTrue(result['connected'])
        self.assertEqual(self.settings['baudrate'], 1_000_000)
        self.assertEqual(self.settings['timeout'], 0)
        self.assertEqual(self.settings['port'], 'COM7')

    def test_com_monitor_reads_seven_real_replies_without_posix_calls(self):
        self.connect()
        self.assertEqual(self.manager.read_follower_angles(), [12.3 + i for i in range(7)])

    def test_com_uses_the_same_official_sdk_for_act_write_and_feedback(self):
        self.connect()
        state = self.manager.begin_native_act()
        self.assertEqual(state['version'], '1.3.6')
        self.manager.write_follower_angles_for_act([1, 2, 3, 4, 5, 6, 7])
        self.assertEqual(self.manager.read_follower_angles(), [12.3 + i for i in range(7)])
        from ai_service.fashionstar_protocol import pack_sync_angle_command
        self.assertIn(pack_sync_angle_command([1,2,3,4,5,6,7], interval_ms=350,
            motor_options={6: {'interval_ms':100, 'power':1000, 't_acc':50, 't_dec':50}}, t_acc=50,t_dec=50), self.uart.frames)

    def test_missing_servo_does_not_return_cached_sdk_state(self):
        self.connect(); self.manager.begin_native_act()
        self.manager.read_follower_angles()
        self.uart.missing = 3
        with self.assertRaises(DomainError) as ctx:
            self.manager.read_follower_angles(timeout=0.01)
        self.assertIn('ID 3', str(ctx.exception))

    def test_duplicate_com_role_and_unknown_com_are_rejected(self):
        self.connect()
        with self.assertRaises(DomainError):
            self.manager.connect('leader', 'COM7', ['COM7'], leader_type='LD')
        with self.assertRaises(DomainError):
            self.manager.connect('leader', 'COM100', ['COM7'], leader_type='LD')

    def test_disconnect_closes_windows_handle(self):
        self.connect(); self.manager.disconnect('follower')
        self.assertFalse(self.uart.is_open)
        with self.assertRaises(DomainError): self.manager.read_follower_angles()

    def test_attached_uart_forwards_pending_bytes_without_fcntl(self):
        self.uart.buffer.extend(b'abc')
        adapter = AttachedUart(self.uart, SerialConnectionManager._write_all)
        self.assertEqual(adapter.in_waiting, 3)
        self.assertEqual(adapter.read(2), b'ab')
        self.assertEqual(adapter.in_waiting, 1)

    def test_partial_windows_write_sends_the_entire_command(self):
        received = bytearray()
        uart = SimpleNamespace(write=lambda frame: received.extend(frame[:2]) or min(len(frame), 2))
        SerialConnectionManager._write_all(uart, b'abcdefg', 0.1)
        self.assertEqual(received, b'abcdefg')

    def test_com_enumeration_uses_windows_device_names(self):
        serial_module()
        from serial.tools import list_ports  # Import under the real OS before platform injection.
        with patch('ai_service.capabilities.sys.platform', 'win32'), patch('serial.tools.list_ports.comports',
            return_value=[SimpleNamespace(device='COM7'), SimpleNamespace(device='COM2')]):
            self.assertEqual(serial_candidates(), ['COM2', 'COM7'])


class WindowsCameraTests(unittest.TestCase):
    def test_identically_named_cameras_keep_distinct_device_paths_and_ignore_microphone(self):
        text = '\n'.join(['[dshow] "USB Camera" (video)', '[dshow] Alternative name "@device_camera_a"',
            '[dshow] "USB Camera" (video)', '[dshow] Alternative name "@device_camera_b"',
            '[dshow] "Microphone" (audio)', '[dshow] Alternative name "@device_audio"'])
        cameras = parse_dshow_devices(text)
        self.assertEqual(len(cameras), 2)
        self.assertNotEqual(cameras[0]['stable_id'], cameras[1]['stable_id'])

    def test_modes_include_mjpeg_and_raw_with_fractional_fps(self):
        modes = parse_dshow_modes('vcodec=mjpeg min s=640x480 fps=29.97 max s=640x480 fps=30\npixel_format=yuyv422 min s=640x480 fps=30 max s=1280x720 fps=30')
        self.assertEqual(len(modes), 4)
        self.assertEqual(modes[0]['fps'], 29.97)
        self.assertEqual(modes[-1]['pixel_format'], 'raw:yuyv422')

    def test_command_keeps_unique_name_as_one_argument_and_copies_mjpeg(self):
        mode = {'pixel_format':'MJPG','width':640,'height':480,'fps':30}
        command = build_dshow_command('@device_pnp_\\camera with spaces', mode, 'ffmpeg.exe')
        self.assertIn('video=@device_pnp_\\camera with spaces', command)
        self.assertEqual(command[command.index('-c:v')+1], 'copy')
        self.assertEqual(command[-1], 'pipe:1')

    def test_raw_camera_is_encoded_without_changing_requested_geometry(self):
        mode = {'pixel_format':'raw:yuyv422','width':640,'height':480,'fps':30}
        command = build_dshow_command('camera', mode, 'ffmpeg.exe')
        self.assertIn('640x480', command)
        self.assertEqual(command[command.index('-c:v')+1], 'mjpeg')

    def test_windows_stream_uses_existing_pair_state_and_releases_both_processes(self):
        with tempfile.TemporaryDirectory() as temp:
            executable = Path(temp)/'ffmpeg.exe'; executable.write_bytes(b'ffmpeg')
            devices = '\n'.join(f'"Camera {name}" (video)\n Alternative name "@{name}"' for name in ('a','b'))
            runner = lambda command, **kwargs: SimpleNamespace(returncode=1, stdout='', stderr=
                devices if '-list_devices' in command else 'vcodec=mjpeg min s=640x480 fps=30 max s=640x480 fps=30')
            processes=[]
            def launch(command, **kwargs):
                self.assertIn('dshow', command)
                process=FakeProcess(payload=JPEG,persistent=True);processes.append(process);return process
            camera = WindowsCameraManager(lambda: executable, runner=runner, popen=launch)
            try:
                state=camera.connect('@a','@b',{'width':640,'height':480,'fps':30})
                self.assertEqual(state['status'], 'streaming')
                self.assertEqual(set(state['roles']), {'wrist','world'})
                self.assertIsNotNone(camera.latest_frame('wrist'))
            finally:camera.close()
            self.assertTrue(all(p.terminated for p in processes))


class WindowsEnvironmentTests(unittest.TestCase):
    def test_cpu_environment_installs_and_publishes_scripts_python_without_linux_entrypoint(self):
        with tempfile.TemporaryDirectory() as temp:
            paths, commands = {}, []
            def run(command, **kwargs):
                commands.append(command)
                if command[1:3] == ['-m', 'venv']:
                    root=Path(command[-1]); paths['root']=root
                    (root/'Scripts').mkdir(parents=True); (root/'Scripts/python.exe').write_bytes(b'python')
                    f=root/'Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg.exe';f.parent.mkdir(parents=True);f.write_bytes(b'ffmpeg');paths['ffmpeg']=f
                return SimpleNamespace(returncode=0,stdout=json.dumps({'ffmpeg_executable':str(paths.get('ffmpeg',''))}),stderr='')
            manager=TrainingEnvironmentManager(temp,runner=run,backend_detector=lambda:[],
                python_detector=lambda *_: 'python', platform_name='win32')
            manager.prepare();state=manager.wait()
            self.assertEqual(state['status'], 'ready')
            self.assertEqual(state['backend'], 'cpu')
            self.assertFalse(state['training_supported'])
            self.assertIsNone(state['executable'])
            self.assertTrue(state['python'].endswith('Scripts\\python.exe') or state['python'].endswith('Scripts/python.exe'))
            self.assertTrue(Path(state['ffmpeg_executable']).is_file())
            self.assertEqual(Path(state['runtime_dir']), paths['root'])
            self.assertTrue(paths['root'].exists())
            self.assertEqual(manager.snapshot()['status'], 'ready')
            self.assertTrue(any('https://download.pytorch.org/whl/cpu' in c for c in commands))
            self.assertFalse(any('/bin/python' in part for c in commands for part in c))
            reloaded=TrainingEnvironmentManager(temp,platform_name='win32')
            self.assertEqual(reloaded.snapshot()['python'], state['python'])
            self.assertEqual(reloaded.snapshot()['status'], 'ready')

    def test_windows_does_not_choose_linux_rocm_backend(self):
        with tempfile.TemporaryDirectory() as temp:
            manager=TrainingEnvironmentManager(temp,platform_name='win32',backend_detector=lambda:['rocm'])
            state=manager.prepare('rocm')
            self.assertEqual(state['status'], 'failed')

    def test_windows_runtime_cannot_launch_a_training_job(self):
        with tempfile.TemporaryDirectory() as temp:
            jobs=TrainingJobManager(temp)
            with self.assertRaises(DomainError) as ctx:jobs.create({'training_supported':False}, {}, {})
            self.assertEqual(ctx.exception.code, 'training_platform_unsupported')
