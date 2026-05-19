/**
 * Runtime validation schemas (zod) for the SBOM IR.
 *
 * The TypeScript types in `sbom-ir.ts` are the compile-time contract; these
 * zod schemas are the runtime gate. Parsers populate the IR programmatically
 * (where the type system is enough), but every IR that crosses an external
 * boundary — disk read, JSON.parse, network ingest — is `parse()`d through
 * `SbomIRSchema` before any emitter consumes it.
 *
 * Inferred types are intentionally equal to the hand-written types in
 * `sbom-ir.ts`; the `_typeCheck` lines at the bottom assert this with no
 * runtime cost.
 *
 * Spec mapping:
 *   - AC-001-5 (SPDX 2.3 schema validation before write)
 *   - AC-001-6 (CycloneDX 1.5 schema validation before write)
 *   - ADR-0005 §Decision (IR shape)
 */
import { z } from 'zod';
import type {
  Component,
  ComponentHash,
  Ecosystem,
  LicenseExpression,
  Relationship,
  SbomDocument,
  SbomIR,
} from './sbom-ir.js';

export const EcosystemSchema = z.enum([
  'npm',
  'PyPI',
  'Go',
  'Maven',
  'crates.io',
  'unknown',
]);

export const ComponentHashSchema = z
  .object({
    algorithm: z.enum(['SHA-256', 'SHA-512']),
    value: z.string().min(1),
  })
  .strict();

export const LicenseExpressionSchema = z
  .object({
    spdxId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    expression: z.string().min(1).optional(),
  })
  .strict();

export const ComponentSchema = z
  .object({
    id: z.string().min(1),
    purl: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    supplier: z.string().min(1).optional(),
    license: LicenseExpressionSchema.optional(),
    hash: ComponentHashSchema.optional(),
    ecosystem: EcosystemSchema,
  })
  .strict();

export const RelationshipSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(['depends-on', 'dev-depends-on', 'optional-depends-on']),
  })
  .strict();

export const SbomDocumentSchema = z
  .object({
    namespace: z.string().min(1),
    createdAt: z.string().min(1),
    creator: z.literal('sbom-pilot'),
    creatorVersion: z.string().min(1),
    rootComponent: z.string().min(1),
  })
  .strict();

export const SbomIRSchema = z
  .object({
    document: SbomDocumentSchema,
    components: z.array(ComponentSchema),
    relationships: z.array(RelationshipSchema),
  })
  .strict();

// Compile-time guard: zod-inferred types must equal the hand-written IR types.
// If sbom-ir.ts drifts from schemas.ts (or vice versa), the assignment fails
// to typecheck and `pnpm typecheck` surfaces the mismatch.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck = (): void => {
  const _ecosystem: Ecosystem = '' as z.infer<typeof EcosystemSchema>;
  const _hash: ComponentHash = {} as z.infer<typeof ComponentHashSchema>;
  const _license: LicenseExpression = {} as z.infer<
    typeof LicenseExpressionSchema
  >;
  const _component: Component = {} as z.infer<typeof ComponentSchema>;
  const _relationship: Relationship = {} as z.infer<typeof RelationshipSchema>;
  const _document: SbomDocument = {} as z.infer<typeof SbomDocumentSchema>;
  const _ir: SbomIR = {} as z.infer<typeof SbomIRSchema>;
  // Reverse direction: hand-written types are assignable to zod-inferred.
  const _ir2: z.infer<typeof SbomIRSchema> = {} as SbomIR;
  void _ecosystem;
  void _hash;
  void _license;
  void _component;
  void _relationship;
  void _document;
  void _ir;
  void _ir2;
};
void _typeCheck;
