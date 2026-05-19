/**
 * `sbom-pilot suggest <advisory-id>` — upgrade-suggestion subcommand.
 *
 * Asks the configured LLM provider for free-text guidance on the
 * given advisory id. Default behaviour:
 *   1. If `--provider` is explicit, use it.
 *   2. Else if `SBOM_PILOT_LLM_PROVIDER` env var is set, use that.
 *   3. Else try Ollama first; if the local daemon is unreachable
 *      fall back to the mock provider with a stderr note.
 *
 * Paid providers (anthropic / openai) reach this subcommand only via
 * explicit `--provider` or env opt-in; the 6-layer defense in
 * src/providers/llm/paid-defense.ts enforces the constraint.
 *
 * Per ADR-0006 §Decision: Layer 5 (CLI). Reads providers/ through the
 * barrel re-export only.
 *
 * Spec mapping: AC-NF-5, AC-005-1, ADR-0005, ADR-0006.
 */
import {
  createProvider,
  OllamaProvider,
  MockProvider,
  PaidDefenseError,
} from '../../providers/llm/index.js';
import {
  EX_OK,
  EX_SOFTWARE,
  EX_TEMPFAIL,
} from '../../exit-codes.js';

export interface SuggestCommandOptions {
  provider?: string;
  /** Injected for tests so the action does not actually fetch. */
  ollamaFetch?: typeof fetch;
}

export interface SuggestActionContext {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

function buildPrompt(advisoryId: string): string {
  return [
    `You are a software-supply-chain assistant. Suggest a concrete one-paragraph upgrade plan for the advisory id ${advisoryId}.`,
    'Cover: (a) the immediate version pin / upgrade, (b) the smallest-impact migration sequence, (c) any breaking-change checkpoints, (d) post-upgrade verification command (single line).',
    'Output plain text, no markdown.',
  ].join(' ');
}

async function trySuggest(
  provider: { name: string; suggest: (req: { prompt: string }) => Promise<{ text: string }> },
  advisoryId: string,
  ctx: SuggestActionContext,
): Promise<boolean> {
  try {
    const result = await provider.suggest({ prompt: buildPrompt(advisoryId) });
    ctx.stdout(result.text);
    return true;
  } catch (e) {
    if (e instanceof PaidDefenseError) {
      ctx.stderr(`sbom-pilot suggest: ${e.message}`);
    } else {
      ctx.stderr(
        `sbom-pilot suggest: ${provider.name} provider failed: ${(e as Error).message}`,
      );
    }
    return false;
  }
}

export async function suggestAction(
  advisoryId: string,
  options: SuggestCommandOptions,
  ctx: SuggestActionContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const explicit = options.provider ?? env['SBOM_PILOT_LLM_PROVIDER'];

  // Explicit selection — no fallback. Surfaces config errors loudly.
  if (explicit !== undefined && explicit.length > 0) {
    let provider;
    try {
      provider = createProvider(explicit, { env });
    } catch (e) {
      if (e instanceof PaidDefenseError) {
        ctx.stderr(`sbom-pilot suggest: ${e.message}`);
        ctx.exit(EX_TEMPFAIL);
        return;
      }
      throw e;
    }
    const ok = await trySuggest(provider, advisoryId, ctx);
    ctx.exit(ok ? EX_OK : EX_SOFTWARE);
    return;
  }

  // Default — try Ollama, fall back to mock on transport failure.
  // The injected fetchImpl is only used by the Ollama attempt so the
  // mock fallback is always reachable in tests.
  const ollama =
    options.ollamaFetch !== undefined
      ? new OllamaProvider({ fetchImpl: options.ollamaFetch })
      : new OllamaProvider();
  const okOllama = await trySuggest(ollama, advisoryId, ctx);
  if (okOllama) {
    ctx.exit(EX_OK);
    return;
  }
  ctx.stderr('sbom-pilot suggest: falling back to the mock provider.');
  const ok = await trySuggest(new MockProvider(), advisoryId, ctx);
  ctx.exit(ok ? EX_OK : EX_SOFTWARE);
}
