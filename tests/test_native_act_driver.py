import struct
import unittest
from ai_service.native_act_driver import NativeActDriver
from ai_service.fashionstar_protocol import pack_sync_angle_command
from tests.test_fashionstar_protocol import response_frame

class Uart:
    def __init__(self):
        self.is_open = True
        self.frames = []
        self.buffer = bytearray()
        self.missing = None
        self.fail = False
    def write(self, frame):
        if self.fail: raise OSError('USB write failed')
        self.frames.append(bytes(frame))
        if frame[2] == 25 and frame[4] == 22:
            self.buffer.extend(b''.join(response_frame(i, 12.3 + i) for i in range(7) if i != self.missing))
        return len(frame)
    @property
    def in_waiting(self): return len(self.buffer)
    def read(self, size):
        result = bytes(self.buffer[:size]); del self.buffer[:size]; return result

class NativeActDriverTests(unittest.TestCase):
    def setUp(self):
        self.uart = Uart()
        self.driver = NativeActDriver(self.uart)
    def test_actual_official_sdk_is_loaded_from_bundled_wheel(self):
        import fashionstar_uart_sdk.uart_pocket_handler as sdk
        self.assertIn('fashionstar_uart_sdk-1.3.6-py3-none-any.whl', sdk.__file__)
    def test_release_motion_matches_sdk_350ms_and_gripper_100ms(self):
        self.driver.write([0,1,2,3,4,5,6])
        frame = self.uart.frames[-1]
        self.assertEqual(frame, pack_sync_angle_command([0,1,2,3,4,5,6], interval_ms=350,
            motor_options={6:{'interval_ms':100,'power':1000}}))
        for i in range(6):
            self.assertEqual(struct.unpack_from('<BiIHHH',frame,7+i*15)[2:],(350,50,50,0))
        self.assertEqual(struct.unpack_from('<BiIHHH',frame,7+6*15)[2:],(100,50,50,1000))
    def test_native_prepare_unlocks_all_then_resets_turn_count_without_resetting_origin(self):
        self.driver.prepare();self.driver.lock();self.driver.release()
        self.assertEqual([f[5] for f in self.uart.frames[:7]],[0x10]*7)
        self.assertEqual(self.uart.frames[7][2],17)
        self.assertEqual(self.uart.frames[7][4],255)
        self.assertEqual([f[5] for f in self.uart.frames[8:15]],[0x11]*7)
        self.assertNotIn(23,[f[2] for f in self.uart.frames])
    def test_official_read_returns_degrees_and_fresh_device_health(self):
        values=self.driver.read(.03)
        self.assertEqual(values,[12.3+i for i in range(7)])
        monitors=self.driver.snapshot()['monitors']
        self.assertEqual(monitors[0]['voltage_v'],7.4)
        self.assertEqual(monitors[0]['current_a'],.12)
        self.assertEqual(monitors[0]['status'],0)
    def test_missing_reply_does_not_reuse_previous_angle(self):
        self.driver.read(.03)
        self.uart.missing=6
        with self.assertRaisesRegex(OSError,'ID 6'):self.driver.read(.03)
    def test_io_error_cannot_be_reported_as_sent_action(self):
        self.uart.fail=True
        with self.assertRaisesRegex(OSError,'USB write failed'):self.driver.write([0]*7)
    def test_invalid_target_is_rejected_before_any_uart_write(self):
        with self.assertRaises(ValueError):self.driver.write([float('nan')]*7)
        self.assertEqual(self.uart.frames,[])


    def test_serial_manager_reuses_existing_uart_and_routes_all_act_operations_to_sdk(self):
        import sys, types, tempfile
        from threading import Lock
        from unittest.mock import patch
        if sys.platform == 'win32':
            sys.modules.setdefault('termios', types.ModuleType('termios'))
        from ai_service.serial_connections import SerialConnectionManager
        with tempfile.TemporaryDirectory() as folder:
            manager = SerialConnectionManager(folder)
            connection = {'fd':42,'port':'test','baudrate':1000000,'leader_type':None,
                'verification':'transport_open','identity_verified':False,'io_lock':Lock()}
            manager._connections['follower']=connection
            with patch('ai_service.serial_connections.AttachedUart', return_value=self.uart), patch('os.open') as opened:
                state=manager.begin_native_act()
                self.assertEqual(state['version'],'1.3.6')
                manager.lock_follower_torque()
                self.assertEqual(manager.read_follower_angles(),[12.3+i for i in range(7)])
                manager.write_follower_angles_for_act([0]*7)
                self.assertEqual(self.uart.frames[-1][4],14)
                self.assertTrue(manager.snapshot()['follower']['act_driver']['monitors'])
                manager.release_follower_torque()
                manager.end_native_act()
                self.assertIsNone(manager.snapshot()['follower']['act_driver'])
                opened.assert_not_called()
