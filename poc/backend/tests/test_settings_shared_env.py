from app.core.config import Settings
import pytest
from pydantic import ValidationError


def test_shared_launcher_option_does_not_prevent_api_startup(tmp_path, monkeypatch):
    monkeypatch.delenv('MIRROR_TING_WORKPLACE_FIXED_SCENE_ORDER', raising=False)
    env = tmp_path / '.env'
    env.write_text('MIRROR_TING_IRIS_AUTOSTART=false\nMIRROR_TING_WORKPLACE_FIXED_SCENE_ORDER=15\n')
    settings = Settings(_env_file=env)
    assert settings.workplace_fixed_scene_order == 15


def test_known_setting_still_rejects_invalid_value(tmp_path, monkeypatch):
    monkeypatch.delenv('MIRROR_TING_WORKPLACE_FIXED_SCENE_ORDER', raising=False)
    env = tmp_path / '.env'
    env.write_text('MIRROR_TING_WORKPLACE_FIXED_SCENE_ORDER=invalid\n')
    with pytest.raises(ValidationError):
        Settings(_env_file=env)
