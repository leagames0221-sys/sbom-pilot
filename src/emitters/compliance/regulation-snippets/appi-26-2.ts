/**
 * Citation snippet for the 改正個人情報保護法 第26条の2 incident-
 * disclosure clause (Japanese Act on the Protection of Personal
 * Information, 2022 amendment, Article 26-2). Embedded in the
 * footer of every 改正個情法 26-2 report (T-23).
 *
 * Retrieval-date is honoured by the snippet-age check in
 * `src/emitters/compliance/_shared.ts` — a warning fires when the
 * snippet is more than 12 months stale (AC-003-5) so the bundle is
 * refreshed against the upstream regulation site before report
 * generation.
 *
 * Source: 個人情報保護委員会 (PPC), 個人情報の保護に関する法律 第26条の2,
 *         令和2年改正・令和4年4月施行 (https://www.ppc.go.jp/)
 */
export const APPI_26_2_SNIPPET = {
  id: 'appi-26-2',
  title: '改正個人情報保護法 第26条の2 (漏えい等の報告等)',
  version: '令和4年4月施行',
  retrievalDate: '2026-05-20',
  citation:
    '改正個人情報保護法 第26条の2 (漏えい等の報告等)、 令和2年改正、 令和4年4月施行。 個人情報保護委員会、 https://www.ppc.go.jp/',
} as const;
