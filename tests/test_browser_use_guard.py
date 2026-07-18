import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[1] / "src-tauri" / "resources" / "browser-use" / "browser_use_guard.py"
SPEC = importlib.util.spec_from_file_location("browser_use_guard", MODULE_PATH)
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)


class BrowserUseGuardTests(unittest.TestCase):
    def test_read_only_tools_are_default(self):
        with patch.dict(os.environ, {}, clear=True):
            tools = GUARD.allowed_tools()
        self.assertIn("browser_navigate", tools)
        self.assertNotIn("browser_click", tools)
        self.assertNotIn("browser_type", tools)
        self.assertNotIn("retry_with_browser_use_agent", tools)

    def test_permissions_require_explicit_environment_flags(self):
        with patch.dict(os.environ, {
            "XINGSHU_BROWSER_ALLOW_INTERACTION": "1",
            "XINGSHU_BROWSER_ALLOW_AUTONOMOUS": "true",
        }, clear=True):
            tools = GUARD.allowed_tools()
        self.assertIn("browser_click", tools)
        self.assertIn("browser_type", tools)
        self.assertIn("retry_with_browser_use_agent", tools)

    def test_local_and_private_destinations_are_blocked(self):
        for url in ("http://localhost", "http://127.0.0.1", "http://10.0.0.1", "http://[::1]"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                GUARD.validate_public_url(url)

    def test_embedded_credentials_are_blocked(self):
        with self.assertRaises(ValueError):
            GUARD.validate_public_url("https://user:password@example.com")

    def test_domain_allowlist_includes_subdomains_only(self):
        with patch.dict(os.environ, {"BROWSER_USE_ALLOWED_DOMAINS": "example.com"}, clear=True):
            self.assertTrue(GUARD.domain_allowed("example.com"))
            self.assertTrue(GUARD.domain_allowed("docs.example.com"))
            self.assertFalse(GUARD.domain_allowed("notexample.com"))


if __name__ == "__main__":
    unittest.main()
