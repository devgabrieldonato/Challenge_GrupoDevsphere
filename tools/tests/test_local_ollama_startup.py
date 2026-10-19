"""Guardas do inicializador com executável falso somente nos testes; sem modelos."""

from pathlib import Path
import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class LocalOllamaStartupTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="pv-ollama-startup-")
        self.fake = Path(self.folder.name) / "fake-ollama"
        self.fake.write_text(
            "#!"
            + sys.executable
            + '\nimport os,json,sys\nprint(json.dumps({"args":sys.argv[1:],"env":dict(os.environ)}))\n'
        )
        self.fake.chmod(0o700)
        self.env = dict(
            os.environ,
            DEVSPHERE_OLLAMA_BIN=str(self.fake),
            DEVSPHERE_PYTHON=sys.executable,
            DEVSPHERE_FAKE_SECRET="must-not-be-passed",
        )

    def tearDown(self):
        self.folder.cleanup()

    def run_script(self, port):
        return subprocess.run(
            ["bash", str(ROOT / "tools/start-local-ollama.sh")],
            env=dict(self.env, DEVSPHERE_LOCAL_OLLAMA_PORT=str(port)),
            capture_output=True,
            text=True,
            timeout=8,
        )

    def test_profile_is_loopback_serial_and_does_not_forward_secrets(self):
        with socket.socket() as guard:
            guard.bind(("127.0.0.1", 0))
            port = guard.getsockname()[1]
        result = self.run_script(port)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout.splitlines()[-1])
        self.assertEqual(payload["args"], ["serve"])
        env = payload["env"]
        self.assertEqual(env["OLLAMA_HOST"], f"127.0.0.1:{port}")
        self.assertEqual(env["OLLAMA_NUM_PARALLEL"], "1")
        self.assertEqual(env["OLLAMA_KV_CACHE_TYPE"], "q8_0")
        self.assertEqual(env["OLLAMA_NO_CLOUD"], "1")
        self.assertEqual(env["OLLAMA_NOPRUNE"], "1")
        self.assertNotIn("DEVSPHERE_FAKE_SECRET", env)

    def test_occupied_port_does_not_execute_or_stop_existing_service(self):
        with socket.socket() as guard:
            guard.bind(("127.0.0.1", 0))
            guard.listen()
            result = self.run_script(guard.getsockname()[1])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Porta local indisponível", result.stderr)
            self.assertNotIn('"args"', result.stdout)
            self.assertGreater(guard.fileno(), -1)

    def test_invalid_port_and_missing_binary_have_clear_errors(self):
        for port in ("11435;echo unsafe", 0, 99999):
            self.assertEqual(self.run_script(port).returncode, 2)
        self.env["DEVSPHERE_OLLAMA_BIN"] = "/nonexistent/ollama"
        self.assertIn("Ollama não encontrado", self.run_script(11435).stderr)
