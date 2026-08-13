"use client";

import { useMemo, useState } from "react";

type Target = { type: "object-id" | "object-kind"; id: string };
type CameraBehavior = {
  mode: "follow" | "fixed";
  centerX: number;
  centerY: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  lerpX: number;
  lerpY: number;
  deadzoneWidth: number;
  deadzoneHeight: number;
  transitionMs: number;
  clampToMap: boolean;
};
type CameraZone = { id: string; mapId: string; enabled: boolean; priority: number; x: number; y: number; width: number; height: number; behavior: CameraBehavior; reducedMotionBehavior: CameraBehavior };
type AnimationState = { id: string; assetId: string; frames: number[]; fps: number; loop: boolean; interruptMode: "immediate" | "frame-end" | "cycle-end" | "locked"; reducedMotionFrame: number };
type AnimationTransition = { id: string; from: string; to: string; trigger: "event" | "action-active" | "action-inactive" | "moving" | "stopped" | "grounded" | "airborne" | "runtime-state" | "complete"; priority: number; queue: boolean; event?: string; actionId?: string; value?: string };
type AnimationMachine = { id: string; enabled: boolean; target: Target; initialState: string; states: AnimationState[]; transitions: AnimationTransition[] };
type PrimitiveEffect = { type: "particles" | "shake" | "flash" | "squash"; [key: string]: unknown };
type EffectPlugin = { id: string; enabled: boolean; effects: PrimitiveEffect[]; reducedMotion: { mode: "replace" | "omit"; effects: PrimitiveEffect[] }; assetRequirements: Array<{ assetId: string; minimumFrames: number; purpose: string }> };
type MotionCue = { id: string; event: string; enabled: boolean; target: "event-object" | "player" | "center"; effects: Array<Record<string, unknown>> };
type PresentationProgram = {
  version: 1;
  status: "draft" | "approved";
  enabled: boolean;
  reducedMotion: "respect" | "always-reduce" | "ignore";
  audio: Record<string, unknown> & { cues: Array<Record<string, unknown>> };
  motion: Record<string, unknown> & { enabled: boolean; maxParticles: number; cues: MotionCue[] };
  camera: { enabled: boolean; subject: Target; defaultBehavior: CameraBehavior; zones: CameraZone[] };
  animation: { enabled: boolean; machines: AnimationMachine[] };
  effectPlugins: EffectPlugin[];
  [key: string]: unknown;
};

type Props = {
  draft: string;
  maps: Array<{ id: string; name: string; width: number; height: number }>;
  assets: Array<{ id: string; name: string; type: string; frames: number }>;
  onDraftChange: (next: string) => void;
};

const stableId = (stem: string, existing: string[]) => {
  if (!existing.includes(stem)) return stem;
  for (let index = 2; ; index += 1) if (!existing.includes(`${stem}-${index}`)) return `${stem}-${index}`;
};

const behavior = (reduced = false): CameraBehavior => ({
  mode: "follow",
  centerX: 0,
  centerY: 0,
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  lerpX: reduced ? 1 : 0.18,
  lerpY: reduced ? 1 : 0.18,
  deadzoneWidth: reduced ? 0 : 120,
  deadzoneHeight: reduced ? 0 : 72,
  transitionMs: reduced ? 0 : 220,
  clampToMap: true,
});

const initialProgram = (): PresentationProgram => ({
  version: 1,
  status: "draft",
  enabled: true,
  reducedMotion: "respect",
  audio: { enabled: true, masterVolume: 0.55, maxVoices: 12, debounceMs: 30, cues: [] },
  motion: { enabled: true, maxParticles: 160, cues: [] },
  camera: { enabled: false, subject: { type: "object-kind", id: "player" }, defaultBehavior: behavior(), zones: [] },
  animation: { enabled: false, machines: [] },
  effectPlugins: [],
});

function ensureProgramShape(value: PresentationProgram): PresentationProgram {
  value.audio ??= initialProgram().audio;
  value.audio.cues = Array.isArray(value.audio.cues) ? value.audio.cues : [];
  value.motion ??= initialProgram().motion;
  value.motion.cues = Array.isArray(value.motion.cues) ? value.motion.cues : [];
  value.camera ??= initialProgram().camera;
  value.camera.subject ??= { type: "object-kind", id: "player" };
  value.camera.defaultBehavior ??= behavior();
  value.camera.zones = Array.isArray(value.camera.zones) ? value.camera.zones : [];
  value.animation ??= initialProgram().animation;
  value.animation.machines = Array.isArray(value.animation.machines) ? value.animation.machines : [];
  value.effectPlugins = Array.isArray(value.effectPlugins) ? value.effectPlugins : [];
  return value;
}

function parseDraft(draft: string): { program: PresentationProgram | null; error: string | null } {
  if (!draft.trim()) return { program: null, error: null };
  try {
    const parsed: unknown = JSON.parse(draft);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { program: null, error: "The draft must be one JSON object." };
    return { program: ensureProgramShape(parsed as PresentationProgram), error: null };
  } catch (error) {
    return { program: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function BehaviorEditor({ title, value, onChange }: { title: string; value: CameraBehavior; onChange: (next: CameraBehavior) => void }) {
  const set = <K extends keyof CameraBehavior>(key: K, next: CameraBehavior[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="presentation-behavior">
    <legend>{title}</legend>
    <div className="presentation-fields">
      <label><span>Mode</span><select value={value.mode} onChange={(event) => set("mode", event.target.value as CameraBehavior["mode"])}><option value="follow">Follow subject</option><option value="fixed">Fixed point</option></select></label>
      <NumberField label="Zoom" value={value.zoom} min={0.25} max={4} step={0.05} onChange={(next) => set("zoom", next)} />
      {value.mode === "fixed" ? <><NumberField label="Center X" value={value.centerX} onChange={(next) => set("centerX", next)} /><NumberField label="Center Y" value={value.centerY} onChange={(next) => set("centerY", next)} /></> : <><NumberField label="Offset X" value={value.offsetX} onChange={(next) => set("offsetX", next)} /><NumberField label="Offset Y" value={value.offsetY} onChange={(next) => set("offsetY", next)} /></>}
      <NumberField label="Horizontal follow" value={value.lerpX} min={0} max={1} step={0.01} onChange={(next) => set("lerpX", next)} />
      <NumberField label="Vertical follow" value={value.lerpY} min={0} max={1} step={0.01} onChange={(next) => set("lerpY", next)} />
      <NumberField label="Deadzone width" value={value.deadzoneWidth} min={0} onChange={(next) => set("deadzoneWidth", next)} />
      <NumberField label="Deadzone height" value={value.deadzoneHeight} min={0} onChange={(next) => set("deadzoneHeight", next)} />
      <NumberField label="Zone transition ms" value={value.transitionMs} min={0} max={4000} onChange={(next) => set("transitionMs", next)} />
      <label className="presentation-check"><input type="checkbox" checked={value.clampToMap} onChange={(event) => set("clampToMap", event.target.checked)} /><span>Clamp to map</span></label>
    </div>
  </fieldset>;
}

function EffectEditor({ effect, assets, onChange, onRemove }: { effect: PrimitiveEffect; assets: Props["assets"]; onChange: (next: PrimitiveEffect) => void; onRemove: () => void }) {
  const switchType = (type: PrimitiveEffect["type"]) => {
    if (type === "particles") onChange({ type, count: 8, color: "#f3f3f0", secondaryColor: "#777773", speed: 160, spread: 6.283, direction: 0, lifetimeMs: 320, size: 3, gravity: 0 });
    else if (type === "shake") onChange({ type, intensity: 3, durationMs: 140 });
    else if (type === "squash") onChange({ type, scaleX: 1.1, scaleY: 0.9, durationMs: 120 });
    else onChange({ type: "flash", color: "#f3f3f0", opacity: 0.12, durationMs: 100 });
  };
  const field = (key: string, value: unknown) => onChange({ ...effect, [key]: value });
  return <div className="presentation-effect-row">
    <label><span>Effect</span><select value={effect.type} onChange={(event) => switchType(event.target.value as PrimitiveEffect["type"])}><option value="particles">Particles</option><option value="shake">Shake</option><option value="flash">Flash</option><option value="squash">Squash</option></select></label>
    {effect.type === "particles" && <>
      <NumberField label="Count" value={Number(effect.count ?? 8)} min={1} max={64} onChange={(next) => field("count", next)} />
      <NumberField label="Speed" value={Number(effect.speed ?? 160)} min={0} max={1200} onChange={(next) => field("speed", next)} />
      <NumberField label="Lifetime ms" value={Number(effect.lifetimeMs ?? 320)} min={40} max={2000} onChange={(next) => field("lifetimeMs", next)} />
      <label><span>Sprite (optional)</span><select value={String(effect.assetId ?? "")} onChange={(event) => field("assetId", event.target.value || undefined)}><option value="">Color square</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.frames}f</option>)}</select></label>
      {effect.assetId && <NumberField label="Sprite frame" value={Number(effect.frame ?? 0)} min={0} onChange={(next) => field("frame", next)} />}
    </>}
    {effect.type === "shake" && <><NumberField label="Intensity" value={Number(effect.intensity ?? 3)} min={0} max={24} step={0.25} onChange={(next) => field("intensity", next)} /><NumberField label="Duration ms" value={Number(effect.durationMs ?? 140)} min={20} max={1000} onChange={(next) => field("durationMs", next)} /></>}
    {effect.type === "flash" && <><label><span>Color</span><input type="color" value={String(effect.color ?? "#f3f3f0")} onChange={(event) => field("color", event.target.value)} /></label><NumberField label="Opacity" value={Number(effect.opacity ?? 0.12)} min={0} max={0.9} step={0.01} onChange={(next) => field("opacity", next)} /><NumberField label="Duration ms" value={Number(effect.durationMs ?? 100)} min={20} max={800} onChange={(next) => field("durationMs", next)} /></>}
    {effect.type === "squash" && <><NumberField label="Scale X" value={Number(effect.scaleX ?? 1.1)} min={0.55} max={1.8} step={0.01} onChange={(next) => field("scaleX", next)} /><NumberField label="Scale Y" value={Number(effect.scaleY ?? 0.9)} min={0.55} max={1.8} step={0.01} onChange={(next) => field("scaleY", next)} /><NumberField label="Duration ms" value={Number(effect.durationMs ?? 120)} min={20} max={800} onChange={(next) => field("durationMs", next)} /></>}
    <button type="button" className="danger" onClick={onRemove}>Remove effect</button>
  </div>;
}

export default function PresentationAuthoringPanel({ draft, maps, assets, onDraftChange }: Props) {
  const [tab, setTab] = useState<"camera" | "animation" | "effects">("camera");
  const [zoneId, setZoneId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [stateId, setStateId] = useState("");
  const [transitionId, setTransitionId] = useState("");
  const [pluginId, setPluginId] = useState("");
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const program = parsed.program;
  const spriteAssets = assets.filter((asset) => asset.type === "sprite");

  const mutate = (apply: (next: PresentationProgram) => void) => {
    if (!program) return;
    const next = ensureProgramShape(structuredClone(program));
    apply(next);
    onDraftChange(JSON.stringify(next, null, 2));
  };
  const selectedZone = program?.camera.zones.find((zone) => zone.id === zoneId) ?? program?.camera.zones[0] ?? null;
  const selectedMachine = program?.animation.machines.find((machine) => machine.id === machineId) ?? program?.animation.machines[0] ?? null;
  const selectedState = selectedMachine?.states.find((state) => state.id === stateId) ?? selectedMachine?.states[0] ?? null;
  const selectedTransition = selectedMachine?.transitions.find((transition) => transition.id === transitionId) ?? selectedMachine?.transitions[0] ?? null;
  const selectedPlugin = program?.effectPlugins.find((plugin) => plugin.id === pluginId) ?? program?.effectPlugins[0] ?? null;

  const updateZone = (apply: (zone: CameraZone) => void) => mutate((next) => { const zone = next.camera.zones.find((entry) => entry.id === selectedZone?.id); if (zone) apply(zone); });
  const updateMachine = (apply: (machine: AnimationMachine) => void) => mutate((next) => { const machine = next.animation.machines.find((entry) => entry.id === selectedMachine?.id); if (machine) apply(machine); });
  const updatePlugin = (apply: (plugin: EffectPlugin) => void) => mutate((next) => { const plugin = next.effectPlugins.find((entry) => entry.id === selectedPlugin?.id); if (plugin) apply(plugin); });

  if (!program) return <section className="presentation-authoring-panel" aria-label="Structured presentation editor">
    <div className="presentation-authoring-empty">
      <strong>{parsed.error ? "Structured editor paused" : "No structured presentation draft yet"}</strong>
      <span>{parsed.error ? `The JSON draft is invalid: ${parsed.error}` : "Create a bounded draft here or use the provider-free starter above."}</span>
      {!parsed.error && <button type="button" onClick={() => onDraftChange(JSON.stringify(initialProgram(), null, 2))}>Create blank structured draft</button>}
    </div>
  </section>;

  return <section className="presentation-authoring-panel" aria-label="Structured presentation editor">
    <header><div><strong>Visual presentation systems</strong><span>Mouse controls and headless JSON edit the same draft.</span></div><nav aria-label="Presentation editor sections">{(["camera", "animation", "effects"] as const).map((entry) => <button type="button" key={entry} aria-pressed={tab === entry} onClick={() => setTab(entry)}>{entry === "effects" ? "Effect plugins" : entry}</button>)}</nav></header>

    {tab === "camera" && <div className="presentation-editor-body">
      <div className="presentation-editor-toolbar"><label className="presentation-check"><input type="checkbox" checked={program.camera.enabled} onChange={(event) => mutate((next) => { next.camera.enabled = event.target.checked; })} /><span>Authored camera enabled</span></label><label><span>Subject</span><select value={program.camera.subject.type} onChange={(event) => mutate((next) => { next.camera.subject.type = event.target.value as Target["type"]; })}><option value="object-kind">Object kind</option><option value="object-id">Exact object ID</option></select></label><label><span>Target ID / kind</span><input value={program.camera.subject.id} onChange={(event) => mutate((next) => { next.camera.subject.id = event.target.value; })} /></label></div>
      <BehaviorEditor title="Default camera" value={program.camera.defaultBehavior} onChange={(nextValue) => mutate((next) => { next.camera.defaultBehavior = nextValue; })} />
      <div className="presentation-subsection-heading"><div><strong>Map-bound camera zones</strong><span>Overlap order: priority, then smaller area, then stable ID.</span></div><button type="button" onClick={() => { const id = stableId("camera-zone", program.camera.zones.map((zone) => zone.id)); const map = maps[0]; mutate((next) => { next.camera.zones.push({ id, mapId: map?.id ?? "map-main", enabled: true, priority: 0, x: 0, y: 0, width: Math.max(1, Math.min(320, map?.width ?? 320)), height: Math.max(1, Math.min(180, map?.height ?? 180)), behavior: behavior(), reducedMotionBehavior: behavior(true) }); }); setZoneId(id); }}>Add zone</button></div>
      {program.camera.zones.length > 0 && <><label className="presentation-wide-field"><span>Editing zone</span><select value={selectedZone?.id ?? ""} onChange={(event) => setZoneId(event.target.value)}>{program.camera.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.id} · {zone.mapId}</option>)}</select></label>{selectedZone && <div className="presentation-zone-editor">
        <div className="presentation-fields"><label><span>Stable ID</span><input value={selectedZone.id} onChange={(event) => { const oldId = selectedZone.id; const nextId = event.target.value; updateZone((zone) => { zone.id = nextId; }); if (zoneId === oldId || !zoneId) setZoneId(nextId); }} /></label><label><span>Map</span><select value={selectedZone.mapId} onChange={(event) => updateZone((zone) => { zone.mapId = event.target.value; })}>{maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.width}×{map.height}</option>)}</select></label><NumberField label="Priority" value={selectedZone.priority} min={-100} max={100} onChange={(value) => updateZone((zone) => { zone.priority = value; })} /><NumberField label="X" value={selectedZone.x} min={0} onChange={(value) => updateZone((zone) => { zone.x = value; })} /><NumberField label="Y" value={selectedZone.y} min={0} onChange={(value) => updateZone((zone) => { zone.y = value; })} /><NumberField label="Width" value={selectedZone.width} min={1} onChange={(value) => updateZone((zone) => { zone.width = value; })} /><NumberField label="Height" value={selectedZone.height} min={1} onChange={(value) => updateZone((zone) => { zone.height = value; })} /><label className="presentation-check"><input type="checkbox" checked={selectedZone.enabled} onChange={(event) => updateZone((zone) => { zone.enabled = event.target.checked; })} /><span>Zone enabled</span></label></div>
        <div className="presentation-behavior-grid"><BehaviorEditor title="Full-motion behavior" value={selectedZone.behavior} onChange={(value) => updateZone((zone) => { zone.behavior = value; })} /><BehaviorEditor title="Reduced-motion behavior" value={selectedZone.reducedMotionBehavior} onChange={(value) => updateZone((zone) => { zone.reducedMotionBehavior = value; })} /></div>
        <button type="button" className="danger" onClick={() => { const id = selectedZone.id; mutate((next) => { next.camera.zones = next.camera.zones.filter((zone) => zone.id !== id); }); setZoneId(""); }}>Remove zone</button>
      </div>}</>}
    </div>}

    {tab === "animation" && <div className="presentation-editor-body">
      <div className="presentation-editor-toolbar"><label className="presentation-check"><input type="checkbox" checked={program.animation.enabled} onChange={(event) => mutate((next) => { next.animation.enabled = event.target.checked; })} /><span>Authored animation enabled</span></label><button type="button" onClick={() => { const id = stableId("animation-machine", program.animation.machines.map((machine) => machine.id)); const asset = spriteAssets[0]; const initial = "idle"; mutate((next) => { next.animation.machines.push({ id, enabled: true, target: { type: "object-kind", id: "player" }, initialState: initial, states: [{ id: initial, assetId: asset?.id ?? "select-sprite", frames: [0], fps: 8, loop: true, interruptMode: "immediate", reducedMotionFrame: 0 }], transitions: [] }); }); setMachineId(id); setStateId(initial); }}>Add machine</button></div>
      {program.animation.machines.length === 0 ? <p className="presentation-inline-empty">No animation machines. Add one to bind authored sprite states to an object ID or kind.</p> : <><label className="presentation-wide-field"><span>Editing machine</span><select value={selectedMachine?.id ?? ""} onChange={(event) => { setMachineId(event.target.value); setStateId(""); setTransitionId(""); }}>{program.animation.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.id} · {machine.states.length} states</option>)}</select></label>{selectedMachine && <div className="presentation-machine-editor">
        <div className="presentation-fields"><label><span>Stable ID</span><input value={selectedMachine.id} onChange={(event) => { const oldId = selectedMachine.id; const nextId = event.target.value; updateMachine((machine) => { machine.id = nextId; }); if (machineId === oldId || !machineId) setMachineId(nextId); }} /></label><label><span>Target type</span><select value={selectedMachine.target.type} onChange={(event) => updateMachine((machine) => { machine.target.type = event.target.value as Target["type"]; })}><option value="object-kind">Object kind</option><option value="object-id">Exact object ID</option></select></label><label><span>Target ID / kind</span><input value={selectedMachine.target.id} onChange={(event) => updateMachine((machine) => { machine.target.id = event.target.value; })} /></label><label><span>Initial state</span><select value={selectedMachine.initialState} onChange={(event) => updateMachine((machine) => { machine.initialState = event.target.value; })}>{selectedMachine.states.map((state) => <option key={state.id} value={state.id}>{state.id}</option>)}</select></label><label className="presentation-check"><input type="checkbox" checked={selectedMachine.enabled} onChange={(event) => updateMachine((machine) => { machine.enabled = event.target.checked; })} /><span>Machine enabled</span></label></div>
        <div className="presentation-split-editor"><section><div className="presentation-subsection-heading"><strong>States</strong><button type="button" onClick={() => { const id = stableId("state", selectedMachine.states.map((state) => state.id)); const asset = spriteAssets[0]; updateMachine((machine) => { machine.states.push({ id, assetId: asset?.id ?? "select-sprite", frames: [0], fps: 8, loop: true, interruptMode: "immediate", reducedMotionFrame: 0 }); }); setStateId(id); }}>Add state</button></div>{selectedMachine.states.length > 0 && <><label><span>Editing state</span><select value={selectedState?.id ?? ""} onChange={(event) => setStateId(event.target.value)}>{selectedMachine.states.map((state) => <option key={state.id} value={state.id}>{state.id}</option>)}</select></label>{selectedState && <div className="presentation-fields"><label><span>State ID</span><input value={selectedState.id} onChange={(event) => { const oldId = selectedState.id; const nextId = event.target.value; updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === oldId); if (state) state.id = nextId; if (machine.initialState === oldId) machine.initialState = nextId; for (const transition of machine.transitions) { if (transition.from === oldId) transition.from = nextId; if (transition.to === oldId) transition.to = nextId; } }); setStateId(nextId); }} /></label><label><span>Sprite</span><select value={selectedState.assetId} onChange={(event) => updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.assetId = event.target.value; })}><option value="select-sprite">Select sprite</option>{spriteAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.frames} frames</option>)}</select></label><label><span>Frames</span><input value={selectedState.frames.join(", ")} onChange={(event) => { const frames = event.target.value.split(/[ ,]+/).map(Number).filter(Number.isInteger); updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.frames = frames; }); }} /></label><NumberField label="FPS" value={selectedState.fps} min={1} max={60} step={0.5} onChange={(value) => updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.fps = value; })} /><label><span>Interrupt</span><select value={selectedState.interruptMode} onChange={(event) => updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.interruptMode = event.target.value as AnimationState["interruptMode"]; })}><option value="immediate">Immediate</option><option value="frame-end">Frame end</option><option value="cycle-end">Cycle end</option><option value="locked">On completion only</option></select></label><NumberField label="Reduced-motion frame" value={selectedState.reducedMotionFrame} min={0} onChange={(value) => updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.reducedMotionFrame = value; })} /><label className="presentation-check"><input type="checkbox" checked={selectedState.loop} onChange={(event) => updateMachine((machine) => { const state = machine.states.find((entry) => entry.id === selectedState.id); if (state) state.loop = event.target.checked; })} /><span>Loop</span></label><button type="button" className="danger" disabled={selectedMachine.states.length <= 1} onClick={() => { const id = selectedState.id; updateMachine((machine) => { machine.states = machine.states.filter((state) => state.id !== id); machine.transitions = machine.transitions.filter((transition) => transition.from !== id && transition.to !== id); if (machine.initialState === id) machine.initialState = machine.states[0]?.id ?? ""; }); setStateId(""); }}>Remove state</button></div>}</>}</section>
        <section><div className="presentation-subsection-heading"><strong>Transitions</strong><button type="button" disabled={selectedMachine.states.length < 2} onClick={() => { const id = stableId("transition", selectedMachine.transitions.map((transition) => transition.id)); updateMachine((machine) => { machine.transitions.push({ id, from: machine.states[0].id, to: machine.states[1].id, trigger: "event", event: "input.action", priority: 0, queue: true }); }); setTransitionId(id); }}>Add transition</button></div>{selectedMachine.transitions.length === 0 ? <p className="presentation-inline-empty">Add a second state, then connect it with an event, action, motion, grounded, runtime, or completion condition.</p> : <><label><span>Editing transition</span><select value={selectedTransition?.id ?? ""} onChange={(event) => setTransitionId(event.target.value)}>{selectedMachine.transitions.map((transition) => <option key={transition.id} value={transition.id}>{transition.id}</option>)}</select></label>{selectedTransition && <div className="presentation-fields"><label><span>Transition ID</span><input value={selectedTransition.id} onChange={(event) => { const oldId = selectedTransition.id; const nextId = event.target.value; updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === oldId); if (transition) transition.id = nextId; }); setTransitionId(nextId); }} /></label><label><span>From</span><select value={selectedTransition.from} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.from = event.target.value; })}><option value="*">Any state</option>{selectedMachine.states.map((state) => <option key={state.id} value={state.id}>{state.id}</option>)}</select></label><label><span>To</span><select value={selectedTransition.to} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.to = event.target.value; })}>{selectedMachine.states.map((state) => <option key={state.id} value={state.id}>{state.id}</option>)}</select></label><label><span>Trigger</span><select value={selectedTransition.trigger} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) { transition.trigger = event.target.value as AnimationTransition["trigger"]; delete transition.event; delete transition.actionId; delete transition.value; if (transition.trigger === "event") transition.event = "input.action"; if (transition.trigger === "action-active" || transition.trigger === "action-inactive") transition.actionId = "interact"; if (transition.trigger === "runtime-state") transition.value = "active"; } })}>{["event", "action-active", "action-inactive", "moving", "stopped", "grounded", "airborne", "runtime-state", "complete"].map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}</select></label>{selectedTransition.trigger === "event" && <label><span>Event ID</span><input value={selectedTransition.event ?? ""} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.event = event.target.value; })} /></label>}{(selectedTransition.trigger === "action-active" || selectedTransition.trigger === "action-inactive") && <label><span>Semantic action ID</span><input value={selectedTransition.actionId ?? ""} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.actionId = event.target.value; })} /></label>}{selectedTransition.trigger === "runtime-state" && <label><span>Runtime state</span><input value={selectedTransition.value ?? ""} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.value = event.target.value; })} /></label>}<NumberField label="Priority" value={selectedTransition.priority} min={-100} max={100} onChange={(value) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.priority = value; })} /><label className="presentation-check"><input type="checkbox" checked={selectedTransition.queue} onChange={(event) => updateMachine((machine) => { const transition = machine.transitions.find((entry) => entry.id === selectedTransition.id); if (transition) transition.queue = event.target.checked; })} /><span>Queue if blocked</span></label><button type="button" className="danger" onClick={() => { const id = selectedTransition.id; updateMachine((machine) => { machine.transitions = machine.transitions.filter((transition) => transition.id !== id); }); setTransitionId(""); }}>Remove transition</button></div>}</>}</section></div>
        <button type="button" className="danger" onClick={() => { const id = selectedMachine.id; mutate((next) => { next.animation.machines = next.animation.machines.filter((machine) => machine.id !== id); }); setMachineId(""); }}>Remove machine</button>
      </div>}</>}
    </div>}

    {tab === "effects" && <div className="presentation-editor-body">
      <div className="presentation-editor-toolbar"><span>Reusable, declarative effects only—no scripts or arbitrary code.</span><button type="button" onClick={() => { const id = stableId("effect-plugin", program.effectPlugins.map((plugin) => plugin.id)); mutate((next) => { next.effectPlugins.push({ id, enabled: true, effects: [{ type: "flash", color: "#f3f3f0", opacity: 0.12, durationMs: 100 }], reducedMotion: { mode: "replace", effects: [{ type: "flash", color: "#f3f3f0", opacity: 0.06, durationMs: 70 }] }, assetRequirements: [] }); }); setPluginId(id); }}>Add plugin</button></div>
      {program.effectPlugins.length === 0 ? <p className="presentation-inline-empty">No plugins. Add one to reuse a checked effect recipe across runtime events.</p> : <><label className="presentation-wide-field"><span>Editing plugin</span><select value={selectedPlugin?.id ?? ""} onChange={(event) => setPluginId(event.target.value)}>{program.effectPlugins.map((plugin) => <option key={plugin.id} value={plugin.id}>{plugin.id}</option>)}</select></label>{selectedPlugin && <div className="presentation-plugin-editor">
        <div className="presentation-fields"><label><span>Stable ID</span><input value={selectedPlugin.id} onChange={(event) => { const oldId = selectedPlugin.id; const nextId = event.target.value; mutate((next) => { const plugin = next.effectPlugins.find((entry) => entry.id === oldId); if (plugin) plugin.id = nextId; for (const cue of next.motion.cues) for (const effect of cue.effects) if (effect.type === "plugin" && effect.pluginId === oldId) effect.pluginId = nextId; }); setPluginId(nextId); }} /></label><label className="presentation-check"><input type="checkbox" checked={selectedPlugin.enabled} onChange={(event) => updatePlugin((plugin) => { plugin.enabled = event.target.checked; })} /><span>Plugin enabled</span></label><label><span>Reduced motion</span><select value={selectedPlugin.reducedMotion.mode} onChange={(event) => updatePlugin((plugin) => { plugin.reducedMotion.mode = event.target.value as "replace" | "omit"; if (plugin.reducedMotion.mode === "replace" && plugin.reducedMotion.effects.length === 0) plugin.reducedMotion.effects.push({ type: "flash", color: "#f3f3f0", opacity: 0.06, durationMs: 70 }); })}><option value="replace">Replace with calmer effects</option><option value="omit">Omit plugin</option></select></label></div>
        <div className="presentation-effect-groups"><section><div className="presentation-subsection-heading"><strong>Full-motion recipe</strong><button type="button" onClick={() => updatePlugin((plugin) => { plugin.effects.push({ type: "flash", color: "#f3f3f0", opacity: 0.12, durationMs: 100 }); })}>Add effect</button></div>{selectedPlugin.effects.map((effect, index) => <EffectEditor key={`normal-${index}`} effect={effect} assets={assets} onChange={(value) => updatePlugin((plugin) => { plugin.effects[index] = value; })} onRemove={() => updatePlugin((plugin) => { plugin.effects.splice(index, 1); })} />)}</section>{selectedPlugin.reducedMotion.mode === "replace" && <section><div className="presentation-subsection-heading"><strong>Reduced-motion recipe</strong><button type="button" onClick={() => updatePlugin((plugin) => { plugin.reducedMotion.effects.push({ type: "flash", color: "#f3f3f0", opacity: 0.06, durationMs: 70 }); })}>Add effect</button></div>{selectedPlugin.reducedMotion.effects.map((effect, index) => <EffectEditor key={`reduced-${index}`} effect={effect} assets={assets} onChange={(value) => updatePlugin((plugin) => { plugin.reducedMotion.effects[index] = value; })} onRemove={() => updatePlugin((plugin) => { plugin.reducedMotion.effects.splice(index, 1); })} />)}</section>}</div>
        <section><div className="presentation-subsection-heading"><div><strong>Asset requirements</strong><span>Doctor blocks missing assets and insufficient frame counts.</span></div><button type="button" disabled={assets.length === 0} onClick={() => updatePlugin((plugin) => { const asset = assets[0]; plugin.assetRequirements.push({ assetId: asset.id, minimumFrames: 1, purpose: "effect" }); })}>Add requirement</button></div><div className="presentation-requirements">{selectedPlugin.assetRequirements.map((requirement, index) => <div key={`${requirement.assetId}-${index}`}><label><span>Asset</span><select value={requirement.assetId} onChange={(event) => updatePlugin((plugin) => { plugin.assetRequirements[index].assetId = event.target.value; })}>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.frames}f</option>)}</select></label><NumberField label="Minimum frames" value={requirement.minimumFrames} min={1} onChange={(value) => updatePlugin((plugin) => { plugin.assetRequirements[index].minimumFrames = value; })} /><label><span>Purpose</span><input value={requirement.purpose} onChange={(event) => updatePlugin((plugin) => { plugin.assetRequirements[index].purpose = event.target.value; })} /></label><button type="button" className="danger" onClick={() => updatePlugin((plugin) => { plugin.assetRequirements.splice(index, 1); })}>Remove</button></div>)}</div></section>
        <section><div className="presentation-subsection-heading"><div><strong>Runtime event bindings</strong><span>{program.motion.cues.filter((cue) => cue.effects.some((effect) => effect.type === "plugin" && effect.pluginId === selectedPlugin.id)).length} cue(s) use this plugin.</span></div><button type="button" onClick={() => mutate((next) => { const id = stableId(`${selectedPlugin.id}-cue`, next.motion.cues.map((cue) => cue.id)); next.motion.cues.push({ id, event: "player.landed", enabled: true, target: "event-object", effects: [{ type: "plugin", pluginId: selectedPlugin.id }] }); })}>Bind event cue</button></div></section>
        <button type="button" className="danger" onClick={() => { const id = selectedPlugin.id; mutate((next) => { next.effectPlugins = next.effectPlugins.filter((plugin) => plugin.id !== id); next.motion.cues = next.motion.cues.filter((cue) => !cue.effects.some((effect) => effect.type === "plugin" && effect.pluginId === id)); }); setPluginId(""); }}>Remove plugin and bindings</button>
      </div>}</>}
    </div>}
  </section>;
}
