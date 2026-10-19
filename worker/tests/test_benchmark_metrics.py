"""Métricas recebem amostras sintéticas; nenhum modelo é iniciado."""

import unittest
from worker.benchmark import (
    process_rss_bytes,
    model_allocation_bytes,
    client_max_rss_bytes,
)
from worker.core import model_limits, JobError
from unittest.mock import patch


class BenchmarkMetricsTests(unittest.TestCase):
    def test_missing_platform_resource_reports_unknown_memory(self):
        with patch("worker.benchmark.resource", None):
            self.assertIsNone(client_max_rss_bytes())

    def test_process_lines_do_not_drop_valid_measurements(self):
        text = "/Applications/Ollama.app/Contents/Resources/ollama 100\ninvalid\n/other/process 999\n/private/llama-server 200\n"
        self.assertEqual(process_rss_bytes(text), 300 * 1024)
        self.assertIsNone(process_rss_bytes("unmeasurable\n"))

    def test_reported_allocations_are_not_rss(self):
        self.assertEqual(
            model_allocation_bytes({"models": [{"size": 1024, "size_vram": 768}]}),
            (1024, 768),
        )
        self.assertEqual(
            model_allocation_bytes({"models": [{"size": 1024, "size_vram": 0}]}),
            (1024, 0),
        )
        for payload in (
            {"models": []},
            {"models": [{"size": True, "size_vram": 0}]},
            {"models": [{"size": 1, "size_vram": 2}]},
        ):
            self.assertIsNone(model_allocation_bytes(payload))

    def test_critic_context_can_differ_without_changing_generator(self):
        with patch.dict(
            "os.environ",
            {
                "DEVSPHERE_OLLAMA_CONTEXT": "8192",
                "DEVSPHERE_OLLAMA_CRITIC_CONTEXT": "16384",
            },
        ):
            self.assertEqual(model_limits(False)["context"], 8192)
            self.assertEqual(model_limits(True)["context"], 16384)
        with patch.dict("os.environ", {"DEVSPHERE_OLLAMA_CRITIC_CONTEXT": "invalid"}):
            with self.assertRaises(JobError):
                model_limits(True)
