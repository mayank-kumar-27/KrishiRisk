"""Run the whole KrishiRisk pipeline in order: 01 -> 06. Stops at the first failing step.

Usage:  python analysis/run_all.py            # all steps
        python analysis/run_all.py --from 3   # resume from 03_eda.py
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["01_fetch_data.py", "02_features.py", "03_eda.py", "04_model.py", "05_risk.py", "06_export_web.py"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=1, help="step number to start from (1-6)")
    args = ap.parse_args()
    t0 = time.time()
    for i, step in enumerate(STEPS, 1):
        if i < args.start:
            continue
        print(f"\n===== [{i}/{len(STEPS)}] {step} =====", flush=True)
        t = time.time()
        rc = subprocess.run([sys.executable, str(HERE / step)], cwd=HERE.parent).returncode
        print(f"===== {step} finished in {time.time() - t:.0f}s (exit {rc}) =====", flush=True)
        if rc != 0:
            print(f"\nStopped at {step}. Fix the problem above, then resume with:  "
                  f"python analysis/run_all.py --from {i}", flush=True)
            return rc
    print(f"\nAll steps done in {time.time() - t0:.0f}s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
