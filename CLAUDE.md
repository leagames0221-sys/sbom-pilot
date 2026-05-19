# sbom-pilot — Tier 2 PJ-local rules

> Tier 1 (~/.claude/) のユニバーサル doctrine / security / orchestrator は auto-import 済。
> 本 file は **PJ 固有** 規約のみ記述。

## PJ Identity

- 案件: `sbom-pilot` — Software Bill of Materials (SBOM) generator + vulnerability scanner + JP/US/EU compliance reporter
- 目的: 個人開発者 / SMB 向け defensive-first CLI tool として portfolio に追加、 supply-chain security 受託案件への entry point (mcp-guard の sibling security tool #2)
- scope: Phase α (本 repo 単独 ★★★ verify) → Phase β 完了 = 2 つ目 security tool ship 完遂
- target audience: dependency tree を持つ全 software project の maintainer + supply-chain 監査義務を負う SMB

## Repo public framing

本 repo は **GitHub PRIVATE で initial commit**、 ★★★ verify 通過後 PUBLIC 化判断。 PUBLIC 化時の framing:

- author identity: `tomohiro takada` (GitHub `leagames0221-sys`)
- profile framing: 「AI 開発者 / フルスタックエンジニア」
- "solo" / "individual" / "single dev" framing words avoided
- Off-repo personal identity details and unrelated project names not disclosed
- Internal infrastructure terminology not disclosed (commit-time sanitization hook blocks at write)

詳細 mask list: `.claude/internal_notes.md` (gitignored、 commit 不可)。

## Stack (TBD — Stage 1 Discovery で literal lock 予定)

候補軸 (Discovery で評価 + 単一 route 確定):

- **Option A (default 推奨)**: TypeScript (Node.js 20 LTS) + pnpm + vitest + commander + zod
  - 利点: mcp-guard sibling 再利用可能 component (SARIF emitter / atomic emitter / sysexits exit code / probe loader pattern) literal 流用、 開発速度
  - 不利: syft / grype の Go binary を CLI wrap する場合 child-process IPC cost
- **Option B**: Go + standard tooling (cobra / testify)
  - 利点: syft / grype native stack 整合、 single-binary deploy ease、 SPDX/CycloneDX go-package native
  - 不利: mcp-guard reusable component 再実装必要、 stack 学習 cost

→ Stage 1 Discovery で literal verdict、 ADR-0001 で rationale 記録。

## PJ 固有 verify priority

Tier 1 default を継承 + 下記 addition:

1. SBOM schema validation (SPDX 2.3 JSON schema + CycloneDX 1.5 JSON schema、 公式 schema literal 適用)
2. Vulnerability DB cache fixture (OSV / NVD / GHSA snapshot) で scanner unit test
3. Compliance reporter golden test (改正個情法 26-2 / METI SBOM minimum fields / NTIA Minimum Elements / EU CRA Annex I)
4. Offline-mode smoke (network egress ZERO で SBOM 生成 + vuln scan 完走)
5. SARIF output schema validation (CI gating 用)

## PJ 固有 forbidden

- 実 dependency tree の credential / API key literal commit 禁止
- 顧客 dependency tree (受託案件 hint) literal commit 禁止
- Channel B 順守: 内部 infra 用語 / 内部 module 名 commit 禁止 (pre-commit hook で literal block)
- **クレカ要求 external service 採用 literal 禁止** (Cloudflare free tier / GitHub Actions free tier 等 クレカ不要 service のみ)
- **paid LLM API (Anthropic / OpenAI 等) auto-call literal 禁止** (env-var-gated optional、 user 明示時のみ active)
- **vulnerability DB online fetch を default で実行禁止** (offline-first、 explicit `--refresh` flag のみ network egress)
- **package manager install (`npm install` / `go mod download` 等) 不用意実行禁止** (Phase 1 Discovery + stack lock 完了後 1 回のみ、 lockfile commit と同時)

## PJ 固有 required

- 全 commit に `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (cross-PJ universal)
- ADR-based 設計判断記録 (`docs/adr/NNNN-*.md`)
- LICENSE = MIT 維持
- 外部 OSS adopt 前に security audit gate 必須 (Scorecard ≥ 7 + signed release + dep tree audit + user 承認)
- **LLM 使用時 default = Ollama local** (consumer laptop 完走前提、 primary model = `gemma3:4b`)
- **mock mode (LLM 不使用、 pure static SBOM + vuln scan のみ) を default fallback として常時 available**
- 全 CI workflow が GitHub Actions free tier (月 2,000 分) 内で完走することを literal verify
- **JP 法規制 compliance matrix を README 同梱** (改正個情法 26-2 / METI SBOM 導入手引き v2.0 / NTIA Minimum Elements / EU CRA Annex I)
- **paid-API 6-layer defense intact** (constructor gate / pre-flight reserve / key non-leak / CI auto-call ban / default mock / no-credit-card service、 mcp-guard pattern literal inherit)

## paid-API 6-layer defense (mcp-guard inherit、 cross-PJ universal)

1. **Constructor gate**: 2-factor env check (`<PROVIDER>_API_KEY` + `SBOM_PILOT_LLM_PROVIDER=<provider>`)
2. **Pre-flight reserve**: 3 ceiling (token / request count / cost) + poisoned state
3. **Key non-leak**: error msg に API key literal 含めない (key prefix 6 char masked)
4. **CI auto-call ban**: `fetch` unstubbed throw in test default
5. **Default provider = mock**: 全 entry point で auto-fallback (LLM unset でも CLI 動作)
6. **Credit-card-required service ZERO**: 全 dep が free-tier 完走、 OSV.dev / GHSA.org / NVD 等 free public DB のみ

paid provider 構築 path は **CLI layer の explicit construction のみ**、 SBOM 生成 / vuln scan / compliance reporter どこからも literal instantiate 不可。

## 関連 doc

- [spec.md](spec.md): PJ 仕様の SSoT (Stage 1 Discovery doc から育成)
- [docs/adr/](docs/adr/): 設計判断記録
- [.claude/memory_bank/](.claude/memory_bank/): session 連絡帳 (Cline 5-file pattern)
- [tasks.md](tasks.md): Stage 4 で起草、 L0-L9 + AC-α-N mapping
