"""Check dependency imports separately from skipped live E5 weight tests."""


def test_e5_library_has_enabled_torch_without_loading_weights(monkeypatch, tmp_path):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    from transformers.utils import is_torch_available
    assert is_torch_available(), "Installed Transformers disabled this Torch version"
    from sentence_transformers import SentenceTransformer
    assert callable(SentenceTransformer)
