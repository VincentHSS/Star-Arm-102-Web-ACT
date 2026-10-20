"""Lumos launcher checks: isolate setup and never instantiate real hardware."""
import argparse
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from tools import start_lumos_local as launcher


class LumosLocalTests(unittest.TestCase):
    def test_clean_environment_avoids_conda_python_and_libraries(self):
        with patch.dict("os.environ", {
            "PYTHONHOME": "/conda", "PYTHONPATH": "/conda/packages",
            "LD_LIBRARY_PATH": "/conda/lib", "LD_PRELOAD": "/conda/lib/preload.so",
            "PATH": "/conda/bin",
        }):
            env = launcher.clean_environment()
        for name in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "LD_PRELOAD"):
            self.assertNotIn(name, env)
        self.assertNotIn("/conda", env["PATH"])

    def test_sdk_existing_directory_preserves_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sdk = root / "startouch_sdk"
            config = sdk / "src/config/robot_kinematics.yaml"
            config.parent.mkdir(parents=True)
            config.write_text("customer: preserved\n")
            (sdk / ".star-arm-sdk-commit").write_text(launcher.SDK_COMMIT)
            with patch.object(launcher.urllib.request, "urlopen") as network:
                self.assertEqual(launcher.download_sdk(root), sdk)
            network.assert_not_called()
            self.assertEqual(config.read_text(), "customer: preserved\n")

    def test_unrecognized_sdk_directory_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            sdk = Path(tmp) / "startouch_sdk"
            sdk.mkdir()
            keep = sdk / "customer.yaml"
            keep.write_text("keep")
            with self.assertRaisesRegex(RuntimeError, "已保留原文件"):
                launcher.download_sdk(Path(tmp))
            self.assertEqual(keep.read_text(), "keep")

    def test_download_rejects_bad_checksum_before_unpacking(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(launcher.urllib.request, "urlopen", return_value=io.BytesIO(b"bad")):
                with self.assertRaisesRegex(RuntimeError, "校验不匹配"):
                    launcher.download_sdk(Path(tmp))
            self.assertFalse((Path(tmp) / "startouch_sdk").exists())

    def test_pip_failure_has_three_attempts_and_finite_network_limits(self):
        with patch.object(launcher.subprocess, "run", return_value=Mock(returncode=1)) as runner:
            with self.assertRaisesRegex(RuntimeError, "连续 3 次"):
                launcher.run_pip(Path("/venv/bin/python"), ["example"], {})
        self.assertEqual(runner.call_count, 3)
        command = runner.call_args.args[0]
        self.assertEqual(command[:4], [str(Path("/venv/bin/python")), "-I", "-m", "pip"])
        self.assertEqual(command[command.index("--timeout") + 1], "30")
        self.assertEqual(runner.call_args.kwargs["timeout"], 1800)

    def test_duplicate_same_service_only_opens_existing_page(self):
        expected = {"service": "star-arm-lumos-local", "version": "example"}
        with patch.object(launcher, "existing_identity", return_value=expected):
            with patch.object(launcher.webbrowser, "open") as browser:
                self.assertTrue(launcher.reuse_existing(expected, False))
        browser.assert_called_once_with("http://127.0.0.1:18766/index.html")

    def test_conflicting_service_is_not_replaced(self):
        with patch.object(launcher, "existing_identity", return_value={"version": "old"}):
            with patch.object(launcher.webbrowser, "open") as browser:
                with self.assertRaisesRegex(RuntimeError, "Ctrl.C"):
                    launcher.reuse_existing({"version": "new"}, False)
        browser.assert_not_called()

    def test_can_check_only_reads_interface(self):
        record = [{"flags": ["UP"], "linkinfo": {
            "info_kind": "can", "info_data": {"bittiming": {"bitrate": 1000000}},
        }}]
        with patch.object(launcher.shutil, "which", return_value="/usr/sbin/ip"):
            with patch.object(launcher.subprocess, "run",
                              return_value=Mock(returncode=0, stdout=json.dumps(record))) as runner:
                launcher.print_can_status("can0")
        self.assertEqual(runner.call_args.args[0],
                         ["/usr/sbin/ip", "-details", "-json", "link", "show", "can0"])
        with self.assertRaisesRegex(ValueError, "名称"):
            launcher.print_can_status("can0; rm")

    def test_mock_service_serves_console_and_closes_on_keyboard_interrupt(self):
        server = Mock()
        server.serve_forever.side_effect = KeyboardInterrupt
        factory = Mock(return_value=server)
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ"):
            root = Path(tmp)
            with patch.object(launcher, "identity", return_value={"version": "test"}):
                self.assertEqual(launcher.run_service(
                    argparse.Namespace(no_browser=True), root, root / "data",
                    server_factory=factory), 0)
            self.assertEqual(launcher.os.environ["STAR_ARM_LUMOS_SDK_ROOT"],
                             str(root / "startouch_sdk"))
        factory.assert_called_once_with(("127.0.0.1", 18766), root / "data",
                                        launcher.ROOT / "Browser_SDK", data_dir_explicit=True)
        server.server_close.assert_called_once()
        self.assertEqual(server.lumos_launcher_identity, {"version": "test"})


if __name__ == "__main__":
    unittest.main()
