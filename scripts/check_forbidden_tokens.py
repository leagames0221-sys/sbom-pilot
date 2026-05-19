#!/usr/bin/env python3
"""
Channel B forbidden-token pre-commit scanner.

Reads the mask list from .claude/internal_notes.md (gitignored) and rejects
any commit whose staged diff literally contains a forbidden token. Fail-closed:
if the mask file is missing or unreadable, the script exits 1 to block the
commit (developer must intentionally configure the mask list).

stdlib-only by design (no pnpm / npm / pip deps to install).

Exit codes:
  0 = clean (no forbidden token in staged diff)
  1 = forbidden token detected or fail-closed scenario (missing mask, etc.)
  2 = invocation error (cwd is not a git repo, etc.)

Spec mapping: PJ rule (channel B mask) — pre-commit gate.
ADR ref:      ADR-0007 Phase α exit checklist (no channel B leaks).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List


REPO_ROOT_MARKERS = (".git",)
MASK_LIST_PATH = Path(".claude") / "internal_notes.md"
MASK_HEADING_RE = re.compile(r"^##\s*Forbidden\s*tokens", re.IGNORECASE)


def _find_repo_root(start: Path) -> Path | None:
    cur = start.resolve()
    while True:
        if any((cur / m).exists() for m in REPO_ROOT_MARKERS):
            return cur
        if cur.parent == cur:
            return None
        cur = cur.parent


def _read_mask_tokens(repo_root: Path) -> List[str]:
    """Extract bulleted tokens from the Forbidden-tokens section.

    The mask file is expected to contain a section like:

        ## Forbidden tokens (channel B mask)

        - TOKEN_ONE
        - TOKEN_TWO
        ...

    Returns the literal token strings (stripped of leading bullet + whitespace),
    skipping comment lines and empty lines. Returns an empty list if the
    section is absent — caller decides fail-closed vs allow.
    """
    mask_path = repo_root / MASK_LIST_PATH
    if not mask_path.is_file():
        raise FileNotFoundError(str(mask_path))
    text = mask_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    in_section = False
    tokens: List[str] = []
    for line in lines:
        if line.startswith("## "):
            in_section = bool(MASK_HEADING_RE.match(line))
            continue
        if not in_section:
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- "):
            token = stripped[2:].strip()
            if token:
                tokens.append(token)
    return tokens


def _staged_diff(repo_root: Path) -> str:
    """Return the staged diff text. Empty string if nothing staged."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--no-color", "-U0"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git diff --cached failed: {result.stderr.strip()}")
    return result.stdout


def _scan(diff: str, tokens: Iterable[str]) -> List[str]:
    """Return the list of tokens that literally appear in `diff` (case-insensitive)."""
    lower = diff.lower()
    hits: List[str] = []
    for token in tokens:
        if token.lower() in lower:
            hits.append(token)
    return hits


def main(argv: List[str]) -> int:
    repo_root = _find_repo_root(Path.cwd())
    if repo_root is None:
        print("ERROR: not inside a git repository", file=sys.stderr)
        return 2

    try:
        tokens = _read_mask_tokens(repo_root)
    except FileNotFoundError as exc:
        print(
            f"ERROR (fail-closed): mask file missing: {exc}\n"
            "Channel B mask requires .claude/internal_notes.md with a "
            "'## Forbidden tokens' section. Create it (gitignored) before "
            "committing.",
            file=sys.stderr,
        )
        return 1

    if not tokens:
        print(
            "WARNING: mask file present but contains no tokens; this is "
            "treated as fail-closed to prevent silent-allow drift.",
            file=sys.stderr,
        )
        return 1

    try:
        diff = _staged_diff(repo_root)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if diff == "":
        return 0

    hits = _scan(diff, tokens)
    if hits:
        print(
            "BLOCK: channel B forbidden token(s) found in staged diff:",
            file=sys.stderr,
        )
        for h in hits:
            print(f"  - {h}", file=sys.stderr)
        print(
            "\nResolve: edit the staged content to remove or paraphrase, "
            "or update .claude/internal_notes.md if the token should no longer "
            "be masked.",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
