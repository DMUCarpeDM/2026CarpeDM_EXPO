"""Run the real two-app contract and consent/reissue checks with no hardware.

No servers are kept running. All Python outbound sockets are blocked in the
child; temporary SQLite/media/cache files are removed on exit. Dependencies of
both repositories must already be installed. No models are downloaded.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def revision(root):
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--printer-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    mirror_root = backend.parents[1]
    printer_root = args.printer_root.resolve()
    if not (printer_root / "backend/app.py").is_file():
        parser.error("--printer-root must point to the IDPrinter repository")
    sources = {"mirror": revision(mirror_root), "idprinter": revision(printer_root)}
    tests = [backend / "tests" / name for name in (
        "test_idprinter_integration.py", "test_idprinter_kiosk_flow.py", "test_mirror_consent.py")]
    with tempfile.TemporaryDirectory(prefix="mirrorting-rehearsal-") as work:
        folder = Path(work)
        (folder / "sitecustomize.py").write_text(
            "import sys\n"
            "def block_network(event, args):\n"
            "    if event == 'socket.connect':\n"
            "        raise OSError('No-hardware rehearsal: outbound sockets disabled')\n"
            "sys.addaudithook(block_network)\n")
        env = os.environ.copy()
        for name in ("OPENAI", "GEMINI", "ELEVENLABS"):
            env[f"MIRROR_TING_{name}_API_KEY"] = ""
        env.update({"IDPRINTER_SOURCE": str(printer_root), "MIRROR_TING_NFC_BRIDGE_ENABLED": "false",
                    "MIRROR_TING_IDPRINTER_BASE_URL": "", "MIRROR_TING_IDPRINTER_BRIDGE_TOKEN": "",
                    "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HOME": str(folder / "hf"),
                    "KIOSK_NFC": "disabled", "KIOSK_PRINT": "screen", "MIRROR_TING_MEDIA_DIR": str(folder / "media")})
        env["PYTHONPATH"] = os.pathsep.join(filter(None, [work, env.get("PYTHONPATH"), str(backend)]))
        print("NO-HARDWARE REHEARSAL: real APIs/DBs; mock card reader, transport and screen print", flush=True)
        run = subprocess.run([sys.executable, "-m", "pytest", "-q", *map(str, tests)], cwd=work, env=env,
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(run.stdout, end="")
        result = {"mode": "no-hardware-contract", "sources": sources, "passed": run.returncode == 0,
                  "exit_code": run.returncode, "test_count": int(m.group(1)) if (m := re.search(r"(\d+) passed", run.stdout)) else 0,
                  "not_run": ["paid AI", "face matching", "physical NFC", "camera/microphone", "paper/cutter", "live E5 weights"],
                  "scores": "no-key report preserves null scores", "temporary_data_removed": True}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return run.returncode


if __name__ == "__main__":
    sys.exit(main())
