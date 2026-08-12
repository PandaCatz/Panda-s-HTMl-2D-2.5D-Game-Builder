"use client";

import { useState } from "react";

export type VisualIdentityRole = "all" | "character" | "enemy" | "pickup" | "prop" | "effect" | "ui" | "tileset" | "environment";
export type VisualIdentityDimension = "palette" | "value" | "shape" | "outline" | "lighting" | "material" | "texture" | "projection" | "proportion" | "scale" | "motion" | "ui";
export type VisualIdentityDirective = { id: string; dimension: VisualIdentityDimension; instruction: string; appliesToRoles: VisualIdentityRole[]; strength: "guide" | "lock"; userAuthored: boolean };
export type VisualIdentityReference = { id: string; assetId: string; purpose: "style" | "identity" | "structure" | "material" | "ui"; appliesToRoles: VisualIdentityRole[]; delivery: "semantic" | "image"; note: string };
export type VisualIdentityExclusion = { id: string; instruction: string; appliesToRoles: VisualIdentityRole[] };
export type VisualIdentityContract = {
  schemaVersion: "looplab-visual-identity/v1";
  revision: number;
  status: "draft" | "adopted";
  intent: string;
  directives: VisualIdentityDirective[];
  references: VisualIdentityReference[];
  exclusions: VisualIdentityExclusion[];
};

type VisualIdentityReport = {
  status?: string;
  identityDigest?: string | null;
  errors?: string[];
  warnings?: string[];
  metrics?: { directiveCount?: number; referenceCount?: number; imageReferenceCount?: number; exclusionCount?: number };
};

type AssetOption = { id: string; name: string; type: string; dataUrl?: string };
type Props = {
  identity: VisualIdentityContract | null;
  assets: AssetOption[];
  report?: VisualIdentityReport | null;
  onSave: (identity: VisualIdentityContract) => void;
  onRemove: () => void;
};

const DIMENSIONS: VisualIdentityDimension[] = ["palette", "value", "shape", "outline", "lighting", "material", "texture", "projection", "proportion", "scale", "motion", "ui"];
const ROLES: VisualIdentityRole[] = ["all", "character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment"];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const blankIdentity = (): VisualIdentityContract => ({ schemaVersion: "looplab-visual-identity/v1", revision: 1, status: "draft", intent: "", directives: [], references: [], exclusions: [] });
const nextId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)}`;

export default function VisualIdentityPanel({ identity, assets, report, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState<VisualIdentityContract>(() => clone(identity ?? blankIdentity()));

  const updateDirective = (id: string, changes: Partial<VisualIdentityDirective>) => setDraft((current) => ({ ...current, directives: current.directives.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) }));
  const updateReference = (id: string, changes: Partial<VisualIdentityReference>) => setDraft((current) => ({ ...current, references: current.references.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) }));
  const updateExclusion = (id: string, changes: Partial<VisualIdentityExclusion>) => setDraft((current) => ({ ...current, exclusions: current.exclusions.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) }));
  const canSave = Boolean(draft.intent.trim())
    && draft.directives.every((entry) => entry.id && entry.instruction.trim())
    && draft.references.every((entry) => entry.id && entry.assetId && entry.note.trim())
    && draft.exclusions.every((entry) => entry.id && entry.instruction.trim());

  return <details className="visual-identity-panel" data-status={report?.status ?? (identity ? "draft" : "absent")}>
    <summary><span><i aria-hidden="true" /> Project visual identity</span><small>{identity ? `${identity.status} · ${report?.metrics?.directiveCount ?? identity.directives.length} rules · ${report?.metrics?.referenceCount ?? identity.references.length} references` : "Optional · inherited by AI by default"}</small></summary>
    <div className="visual-identity-body">
      <header><div><span className="eyebrow">Canonical art guidance</span><strong>One visual language across prompts, assets, maps, and reviews</strong></div>{report?.identityDigest && <code title={report.identityDigest}>{report.identityDigest.slice(0, 16)}…</code>}</header>
      <p className="visual-identity-boundary">This contract guides visual generation only. It never owns collision, supports, traversal, navigation, depth, completion, or replay. Saving an image reference never uploads it; each provider-art job requires separate consent.</p>
      <div className="visual-identity-grid">
        <label><span>Status</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as VisualIdentityContract["status"] }))}><option value="draft">Draft · still reviewing</option><option value="adopted">Adopted · project baseline</option></select></label>
        <label className="wide"><span>Visual intent</span><textarea rows={3} maxLength={2000} value={draft.intent} onChange={(event) => setDraft((current) => ({ ...current, intent: event.target.value }))} placeholder="Describe the project’s visual language without turning quality goals into a fixed aesthetic." /></label>
      </div>

      <section className="visual-identity-section">
        <header><div><strong>Directives</strong><small>Only rules you explicitly mark as locks become fixed constraints.</small></div><button type="button" onClick={() => setDraft((current) => ({ ...current, directives: [...current.directives, { id: nextId("directive"), dimension: "shape", instruction: "", appliesToRoles: ["all"], strength: "guide", userAuthored: true }] }))}>Add directive</button></header>
        {draft.directives.length === 0 ? <p>No persistent visual rules. The AI may still form a coherent direction from the current brief.</p> : draft.directives.map((entry) => <div className="visual-identity-row directive" key={entry.id}>
          <select aria-label="Visual dimension" value={entry.dimension} onChange={(event) => updateDirective(entry.id, { dimension: event.target.value as VisualIdentityDimension })}>{DIMENSIONS.map((dimension) => <option key={dimension}>{dimension}</option>)}</select>
          <select aria-label="Applicable asset role" value={entry.appliesToRoles[0] ?? "all"} onChange={(event) => updateDirective(entry.id, { appliesToRoles: [event.target.value as VisualIdentityRole] })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
          <select aria-label="Directive strength" value={entry.strength} onChange={(event) => updateDirective(entry.id, { strength: event.target.value as VisualIdentityDirective["strength"], userAuthored: true })}><option value="guide">Guide</option><option value="lock">User lock</option></select>
          <input aria-label="Visual directive" value={entry.instruction} onChange={(event) => updateDirective(entry.id, { instruction: event.target.value })} placeholder="Exact reusable instruction…" />
          <button type="button" aria-label="Remove visual directive" onClick={() => setDraft((current) => ({ ...current, directives: current.directives.filter((candidate) => candidate.id !== entry.id) }))}>×</button>
        </div>)}
      </section>

      <section className="visual-identity-section">
        <header><div><strong>Project asset references</strong><small>Semantic sends the stored note only. Image can submit exact PNG pixels after per-job consent.</small></div><button type="button" disabled={assets.length === 0} onClick={() => setDraft((current) => ({ ...current, references: [...current.references, { id: nextId("reference"), assetId: assets[0]?.id ?? "", purpose: "style", appliesToRoles: ["all"], delivery: "semantic", note: "" }] }))}>Add reference</button></header>
        {assets.length === 0 && <p>Save or import a project asset before adding a visual reference.</p>}
        {draft.references.map((entry) => <div className="visual-identity-row reference" key={entry.id}>
          <select aria-label="Reference asset" value={entry.assetId} onChange={(event) => updateReference(entry.id, { assetId: event.target.value })}>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {asset.type}</option>)}</select>
          <select aria-label="Reference purpose" value={entry.purpose} onChange={(event) => updateReference(entry.id, { purpose: event.target.value as VisualIdentityReference["purpose"] })}>{["style", "identity", "structure", "material", "ui"].map((purpose) => <option key={purpose}>{purpose}</option>)}</select>
          <select aria-label="Reference role" value={entry.appliesToRoles[0] ?? "all"} onChange={(event) => updateReference(entry.id, { appliesToRoles: [event.target.value as VisualIdentityRole] })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
          <select aria-label="Reference delivery" value={entry.delivery} onChange={(event) => updateReference(entry.id, { delivery: event.target.value as VisualIdentityReference["delivery"] })}><option value="semantic">Semantic note only</option><option value="image">Exact PNG · consent per job</option></select>
          <input aria-label="Reference note" value={entry.note} onChange={(event) => updateReference(entry.id, { note: event.target.value })} placeholder="What to learn—not content to copy…" />
          <button type="button" aria-label="Remove visual reference" onClick={() => setDraft((current) => ({ ...current, references: current.references.filter((candidate) => candidate.id !== entry.id) }))}>×</button>
        </div>)}
      </section>

      <section className="visual-identity-section">
        <header><div><strong>Exclusions</strong><small>Persistent visual failure modes to avoid.</small></div><button type="button" onClick={() => setDraft((current) => ({ ...current, exclusions: [...current.exclusions, { id: nextId("exclude"), instruction: "", appliesToRoles: ["all"] }] }))}>Add exclusion</button></header>
        {draft.exclusions.map((entry) => <div className="visual-identity-row exclusion" key={entry.id}>
          <select aria-label="Exclusion role" value={entry.appliesToRoles[0] ?? "all"} onChange={(event) => updateExclusion(entry.id, { appliesToRoles: [event.target.value as VisualIdentityRole] })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
          <input aria-label="Visual exclusion" value={entry.instruction} onChange={(event) => updateExclusion(entry.id, { instruction: event.target.value })} placeholder="Avoid…" />
          <button type="button" aria-label="Remove visual exclusion" onClick={() => setDraft((current) => ({ ...current, exclusions: current.exclusions.filter((candidate) => candidate.id !== entry.id) }))}>×</button>
        </div>)}
      </section>

      {(report?.errors?.length ?? 0) + (report?.warnings?.length ?? 0) > 0 && <div className="visual-identity-findings" role="status">{report?.errors?.map((message) => <span className="error" key={message}>{message}</span>)}{report?.warnings?.map((message) => <span className="warning" key={message}>{message}</span>)}</div>}
      <div className="visual-identity-actions"><button type="button" disabled={!identity} onClick={onRemove}>Remove contract</button><button type="button" className="primary" disabled={!canSave} onClick={() => onSave({ ...clone(draft), schemaVersion: "looplab-visual-identity/v1", revision: (identity?.revision ?? 0) + 1 })}>{identity ? "Save visual identity" : "Create visual identity"}</button></div>
    </div>
  </details>;
}
