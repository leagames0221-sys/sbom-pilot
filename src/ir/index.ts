/**
 * Public barrel for the SBOM IR module.
 *
 * Consumers (parsers, emitters, compliance reporters, CLI) import IR types
 * and zod schemas through this entry point only; the underlying split
 * between `sbom-ir.ts` (compile-time contract) and `schemas.ts` (runtime
 * gate) is an implementation detail.
 *
 * Spec mapping: ADR-0005, AC-001-5/6.
 */
export type {
  Component,
  ComponentHash,
  ComponentRef,
  Ecosystem,
  LicenseExpression,
  Relationship,
  SbomDocument,
  SbomIR,
} from './sbom-ir.js';

export {
  ComponentHashSchema,
  ComponentSchema,
  EcosystemSchema,
  LicenseExpressionSchema,
  RelationshipSchema,
  SbomDocumentSchema,
  SbomIRSchema,
} from './schemas.js';
