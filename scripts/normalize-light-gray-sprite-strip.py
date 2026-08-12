#!/usr/bin/env python3
"""Normalize a light-neutral-gray-backed strip with transparent final output.

This is the default entry point for new game artwork. It reuses the proven
border-connected neutral-matte normalizer while selecting a light-grey key and
review background. The legacy dark-grey entry point remains reproducible for
already-generated source art.
"""

from pathlib import Path
import runpy
import sys


def add_default(flag: str, value: str) -> None:
    if flag not in sys.argv:
        sys.argv.extend((flag, value))


add_default("--key-min", "170")
add_default("--key-max", "245")
add_default("--background-policy", "border-connected-light-neutral-gray")
add_default("--preview-background", "#d9d9d9")
add_default("--generator-label", "scripts/normalize-light-gray-sprite-strip.py")
runpy.run_path(str(Path(__file__).with_name("normalize-dark-gray-sprite-strip.py")), run_name="__main__")
