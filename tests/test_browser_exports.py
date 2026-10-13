import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from ai_service.browser_exports import BrowserExportManager
from ai_service.domain import DomainError


class BrowserExportTests(unittest.TestCase):
    def fixture(self,temp,runner):
        root=Path(temp);models=root/'models';models.mkdir()
        (models/'pick').mkdir()
        registry=SimpleNamespace(models_root=models,list_models=lambda:[{'id':'pick'}])
        environment=SimpleNamespace(snapshot=lambda:{'status':'ready','python':sys.executable})
        return BrowserExportManager(root,registry,environment,runner=runner)

    def wait(self,manager,job):
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            state=manager.snapshot(job['id'])
            if state['status']!='running':return state
            time.sleep(.01)
        self.fail('export did not finish')

    def test_provider_conversion_is_async_and_installs_no_customer_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            commands=[]
            def run(command,**kwargs):
                commands.append(command)
                if '--output' in command:Path(command[-1]).write_bytes(b'ZIP')
                return SimpleNamespace(returncode=0,stdout='',stderr='')
            manager=self.fixture(temp,run);job=manager.start('pick')
            self.assertEqual(self.wait(manager,job)['status'],'completed')
            self.assertEqual(manager.download(job['id']),b'ZIP')
            self.assertIn('onnx>=1.17,<2',commands[0]);self.assertNotIn('torch',commands[0])
            self.assertEqual(commands[1][0],sys.executable)
            with self.assertRaises(DomainError):manager.download('../model')

    def test_missing_provider_environment_does_not_start_a_process(self):
        with tempfile.TemporaryDirectory() as temp:
            manager=self.fixture(temp,lambda *_:self.fail('must not run'))
            manager.environment.snapshot=lambda:{'status':'not_prepared'}
            with self.assertRaises(DomainError):manager.start('pick')
            self.assertFalse(manager.active())

    def test_converter_failure_is_visible_and_does_not_produce_a_download(self):
        with tempfile.TemporaryDirectory() as temp:
            manager=self.fixture(temp,lambda *a,**k:SimpleNamespace(returncode=1,stdout='',stderr='unsupported processor'))
            job=manager.start('pick');state=self.wait(manager,job)
            self.assertEqual(state['status'],'failed');self.assertIn('unsupported processor',state['error'])
            with self.assertRaises(DomainError):manager.download(job['id'])


if __name__=='__main__':unittest.main()
