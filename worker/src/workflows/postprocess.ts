/**
 * Artifact post-processing hook for Atlas workflows.
 *
 * AT-2 deliberately keeps this as an identity transform. A later phase may
 * route copy-heavy artifacts through the de-slop skill, but workflow execution
 * and provenance must not depend on that optional post-processor.
 */
export function postprocessWorkflowArtifact(bodyMd: string): string {
  return bodyMd;
}
