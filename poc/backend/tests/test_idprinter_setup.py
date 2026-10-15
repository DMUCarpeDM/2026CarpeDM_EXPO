"""다른 장비 연결 설정에서 기존 제공자 설정과 비밀 보존을 검증한다."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from dotenv import dotenv_values


@pytest.fixture
def setup_tool(monkeypatch, tmp_path):
    script = Path(__file__).resolve().parents[3] / "scripts" / "idprinter-link.py"
    spec = importlib.util.spec_from_file_location("idprinter_link_setup", script)
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    backend = tmp_path / "poc" / "backend"
    backend.mkdir(parents=True)
    monkeypatch.setattr(tool, "ROOT", tmp_path)
    monkeypatch.setattr(tool, "BACKEND", backend)
    return tool


def test_configuration_preserves_models_and_reuses_secret(setup_tool, capsys):
    tool = setup_tool
    token = "existing-test-only-secret-123456789012345"
    original = f"# 모델 설정\nMIRROR_TING_DIALOGUE_PROVIDER=gemini\nMIRROR_TING_IDPRINTER_BRIDGE_TOKEN={token}\n"
    env_file = tool.BACKEND / ".env"
    env_file.write_text(original, encoding="utf-8")
    args = SimpleNamespace(kiosk_url="http://192.168.0.20:8002/",
                           mirror_url="http://192.168.0.30:8001", token_file=None)
    assert tool.configure(args) == 0
    mirror = dotenv_values(env_file)
    printer = dotenv_values(tool.ROOT / ".local-setup/idprinter-link/idprinter.env")
    assert mirror["MIRROR_TING_DIALOGUE_PROVIDER"] == "gemini"
    assert mirror["MIRROR_TING_NFC_READER_ROLES"] == "mirror"
    assert mirror["MIRROR_TING_IDPRINTER_BASE_URL"] == "http://192.168.0.20:8002"
    assert printer["KIOSK_MIRRORTING_URL"] == args.mirror_url
    assert printer["KIOSK_BRIDGE_TOKEN"] == mirror["MIRROR_TING_IDPRINTER_BRIDGE_TOKEN"] == token
    assert printer["KIOSK_HOST"] == "0.0.0.0"
    assert "KIOSK_PRINT" not in printer
    assert token not in capsys.readouterr().out
    assert next((tool.ROOT / ".local-setup/idprinter-link").glob("*.bak")).read_text(encoding="utf-8") == original


@pytest.mark.parametrize("url", ["http://localhost:8002", "http://127.0.0.1:8002", "http://0.0.0.0:8002", "http://[::1]:8002", "http://pc:8002/api", "http://pc:bad", "http://user:secret@pc:8002"])
def test_configure_rejects_unusable_addresses_without_writing(setup_tool, url):
    with pytest.raises(ValueError):
        setup_tool.configure(SimpleNamespace(kiosk_url=url, mirror_url="http://192.168.0.30:8001", token_file=None))
    assert not (setup_tool.BACKEND / ".env").exists()
