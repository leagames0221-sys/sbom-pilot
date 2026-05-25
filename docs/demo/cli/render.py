"""Render CLI command output (.txt) into terminal-style PNG.

Reads docs/demo/cli/*.txt and emits docs/demo/cli/*.png.
Pure Pillow, system Python (>=3.10) + Pillow (>=10). No network egress.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent

# GitHub dark theme palette
BG = (13, 17, 23)
FG = (201, 209, 217)
PROMPT_FG = (88, 166, 255)
COMMAND_FG = (255, 255, 255)
DIM = (139, 148, 158)

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/msgothic.ttc", 0),
    ("C:/Windows/Fonts/YuGothM.ttc", 0),
    ("C:/Windows/Fonts/BIZ-UDGothicR.ttc", 0),
    ("C:/Windows/Fonts/CascadiaMono.ttf", 0),
    ("C:/Windows/Fonts/consola.ttf", 0),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path, index in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size, index=index)
    return ImageFont.load_default()


def render(command: str, output_lines: list[str], out_path: Path, max_lines: int = 30) -> None:
    font_size = 14
    line_h = 20
    pad_x = 20
    pad_y = 16
    char_w = 8

    body = output_lines[:max_lines]
    if len(output_lines) > max_lines:
        body = body + [f"... ({len(output_lines) - max_lines} more lines)"]

    def display_width(s: str) -> int:
        return sum(2 if ord(c) > 0x2E80 else 1 for c in s)

    total_lines = 1 + len(body) + 1
    max_dw = max((display_width(ln) for ln in [f"$ {command}"] + body), default=80)
    width = max(80, max_dw) * char_w + pad_x * 2
    width = min(width, 1100)
    height = pad_y * 2 + line_h * total_lines

    img = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(img)
    font = load_font(font_size)

    y = pad_y
    draw.text((pad_x, y), "$", font=font, fill=PROMPT_FG)
    draw.text((pad_x + char_w * 2, y), command, font=font, fill=COMMAND_FG)
    y += line_h * 2

    for ln in body:
        truncated = ln if len(ln) < 128 else ln[:125] + "..."
        color = DIM if truncated.startswith("...") else FG
        draw.text((pad_x, y), truncated, font=font, fill=color)
        y += line_h

    img.save(out_path, "PNG", optimize=True)
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes, {width}x{height})")


def main() -> int:
    targets = [
        ("help.txt", "sbom-pilot --help", 28),
        ("sbom.txt", "sbom-pilot sbom tests/fixtures/projects/npm-tiny --format spdx", 24),
        ("scan.txt", "sbom-pilot scan tests/fixtures/projects/npm-tiny", 30),
        ("report.txt", "sbom-pilot report tests/fixtures/projects/npm-tiny --standard appi-26-2", 30),
    ]
    for txt_name, command, max_lines in targets:
        txt_path = ROOT / txt_name
        if not txt_path.exists():
            print(f"missing {txt_path}", file=sys.stderr)
            continue
        raw = txt_path.read_bytes()
        if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
            text = raw.decode("utf-16")
        elif raw.startswith(b"\xef\xbb\xbf"):
            text = raw.decode("utf-8-sig")
        else:
            text = raw.decode("utf-8", errors="replace")
        lines = text.splitlines()
        out_path = ROOT / txt_name.replace(".txt", ".png")
        render(command, lines, out_path, max_lines=max_lines)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
