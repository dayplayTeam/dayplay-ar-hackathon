"""Task-3 dev/demo server: boots the existing FastAPI app (backend.main:app)
on an ephemeral-ish port with the same env defaults as CI/tests.

Usage: /tmp/ar-venv/bin/python tools/t3_server.py --port 8765
No pipeline code is modified here — /pipeline, /ask, /pins, /health and the
/sim + /eval static mounts all come from backend.main untouched.
"""
import argparse
import os


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    os.environ.setdefault("MODEL_PROVIDER", "mock")
    os.environ.setdefault("DAYPLAY_PROVIDER_MODE", "fixture")
    import uvicorn
    from backend.main import app
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
