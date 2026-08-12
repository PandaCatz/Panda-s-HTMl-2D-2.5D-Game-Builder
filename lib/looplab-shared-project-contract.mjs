export const LOOPLAB_SHARED_PROJECT_STORE_SCHEMA = "looplab-shared-project-store/v2";
export const LOOPLAB_SHARED_PROJECT_METADATA_SCHEMA = "looplab-shared-project-metadata/v1";
export const LOOPLAB_SHARED_PROJECT_ID_PATTERN = "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$";
export const LOOPLAB_SHARED_PROJECT_STORE_POLICY = Object.freeze({
  storage: "companion-owned-file-store",
  relativeRoot: ".looplab/projects",
  maximumProjects: 256,
  maximumProjectBytes: 25 * 1024 * 1024,
  projectFilename: "project.loop.json",
  metadataFilename: "metadata.json",
  concurrency: "per-project serialized strong-revision-digest precondition",
  revisionTruth: "revisionDigest covers the complete canonical project document and is the If-Match lost-update validator.",
  sourceTruth: "sourceDigest covers Project Doctor gameplay truth and cannot arbitrate complete-document writes.",
  browserAuthority: "IndexedDB is a recoverable cache; companion project bytes are authoritative for mounted shared entries.",
  metadataTruth: "Shared-store metadata never enters project source, Doctor evidence, provider context, gameplay history, or exported HTML.",
  rebase: "Preview a three-way stable-ID-aware merge; apply only an exact conflict-free receipt, then verify before an explicit conditional save.",
});
