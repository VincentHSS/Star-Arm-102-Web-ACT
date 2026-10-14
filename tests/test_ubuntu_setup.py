import contextlib
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import ubuntu_setup, serve_local
from runtime import ubuntu_runtime


class UbuntuSetupTests(unittest.TestCase):
    def test_training_test_refuses_old_or_api_only_services_without_starting_another(self):
        for health in ({'version':'1.0.9','static_workbench':True},
                       {'version':ubuntu_runtime.VERSION,'static_workbench':False}):
            with self.subTest(health=health), patch.object(ubuntu_runtime,'runtime_health_info',return_value=health), \
                 patch.object(ubuntu_runtime,'serve') as serve, patch.object(serve_local.webbrowser,'open') as browser, \
                 patch.object(serve_local.sys,'argv',['serve_local.py','--require-local-version','--act-workbench']), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(serve_local.main(),1)
                serve.assert_not_called(); browser.assert_not_called()

    def test_training_test_reuses_matching_local_workbench_and_original_state_directory(self):
        health={'version':ubuntu_runtime.VERSION,'static_workbench':True,
                'state_directory_id':ubuntu_runtime.state_directory_id(ubuntu_runtime.state_directory())}
        with patch.object(ubuntu_runtime,'runtime_health_info',return_value=health), \
             patch.object(ubuntu_runtime,'serve') as serve, patch.object(serve_local.webbrowser,'open') as browser, \
             patch.object(serve_local.sys,'argv',['serve_local.py','--require-local-version','--act-workbench']), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(serve_local.main(),0)
            serve.assert_not_called(); browser.assert_called_once_with('http://127.0.0.1:18765/act-workbench.html')

    def test_training_test_starts_source_with_same_default_state_when_no_service_is_running(self):
        with patch.object(ubuntu_runtime,'runtime_health_info',return_value=None), \
             patch.object(ubuntu_runtime,'serve') as serve, \
             patch.object(serve_local.sys,'argv',['serve_local.py','--require-local-version','--act-workbench','--no-browser']), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(serve_local.main(),0)
            serve.assert_called_once_with(ubuntu_runtime.state_directory().resolve(),18765,serve_local.ROOT/'Browser_SDK')

    def test_missing_dependencies_accepts_ubuntu_24_glib_replacement(self):
        def runner(command, **kwargs):
            ready = command[-1] not in ('ffmpeg', 'libglib2.0-0')
            return subprocess.CompletedProcess(command, 0 if ready else 1, 'install ok installed' if ready else '')
        self.assertEqual(ubuntu_setup.missing_dependencies(runner), ['ffmpeg'])

    def test_desktop_authorization_waits_for_dpkg_and_disallows_removal(self):
        with patch.dict(os.environ, {'DISPLAY': ':0'}):
            command = ubuntu_setup.install_command(['ffmpeg'], which=lambda name: '/usr/bin/' + name, uid=1000)
        self.assertEqual(command[:3], ['/usr/bin/pkexec', '/usr/bin/env', 'DEBIAN_FRONTEND=noninteractive'])
        self.assertIn('DPkg::Lock::Timeout=300', command)
        self.assertIn('Acquire::Retries=3', command)
        self.assertIn('--no-remove', command)
        self.assertEqual(command[-1], 'ffmpeg')

    def test_headless_uses_system_authorization_and_cancel_has_clear_message(self):
        with patch.dict(os.environ, {}, clear=True):
            command = ubuntu_setup.install_command(['ffmpeg'], which=lambda name: '/usr/bin/sudo' if name == 'sudo' else None, uid=1000)
        self.assertEqual(command[0], '/usr/bin/sudo')
        self.assertIn('授权未完成', ubuntu_setup.install_hint('', 126))

    def test_lock_failure_does_not_delete_locks_kill_or_run_repair_commands(self):
        commands = []
        def runner(command, **kwargs):
            commands.append(command)
            return subprocess.CompletedProcess(command, 100, 'Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 5471')
        with patch.object(ubuntu_setup, 'install_command', return_value=['apt-get', 'install', 'ffmpeg']), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as error:
            self.assertEqual(ubuntu_setup.install(['ffmpeg'], runner), 1)
        self.assertEqual(len(commands), 1)
        self.assertIn('等系统更新完成', error.getvalue())
        self.assertEqual(commands[0], ['apt-get', 'install', 'ffmpeg'])

    def test_repeated_source_start_reuses_service_without_starting_another(self):
        health = {'version': ubuntu_runtime.VERSION, 'static_workbench': True}
        with patch.object(ubuntu_runtime, 'runtime_health_info', return_value=health), patch.object(ubuntu_runtime, 'serve') as serve, patch.object(serve_local.webbrowser, 'open') as browser, patch.object(serve_local.sys, 'argv', ['serve_local.py']), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(serve_local.main(), 0)
        serve.assert_not_called()
        browser.assert_called_once()

    def test_source_start_does_not_silently_change_active_data_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            health = {'version': ubuntu_runtime.VERSION, 'static_workbench': True,
                      'state_directory_id': ubuntu_runtime.state_directory_id(Path(directory) / 'other')}
            with patch.object(ubuntu_runtime, 'runtime_health_info', return_value=health), patch.object(ubuntu_runtime, 'serve') as serve, patch.object(serve_local.sys, 'argv', ['serve_local.py', '--state-dir', directory]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(serve_local.main(), 1)
            serve.assert_not_called()

    def test_health_check_bypasses_proxy_and_rejects_unrelated_program(self):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"status":"ok","browser_bridge":false,"version":"1.0.8"}'
        opener = unittest.mock.Mock()
        opener.open.return_value = response
        with patch.object(ubuntu_runtime, 'build_opener', return_value=opener), patch.object(ubuntu_runtime, 'ProxyHandler') as proxy:
            self.assertIsNone(ubuntu_runtime.runtime_health_info())
            proxy.assert_called_once_with({})


if __name__ == '__main__':
    unittest.main()
