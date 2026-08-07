"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, CirclePlus, Settings2, Trash2, UsersRound } from "lucide-react";
import {
  GAME_PROFILE_PRESETS,
  presetProfile,
  uniqueFieldId,
  type GameProfilePresetId,
} from "@/lib/tiletally/gameProfiles";
import type { GameLedgerCounter, GameLedgerField, GameLedgerProfile } from "@/lib/tiletally/types";
import type { CreateLedgerGameInput, LedgerEntity, LedgerGame } from "./gameLedgerTypes";
import styles from "./game-ledger.module.css";

type Props = {
  entities: LedgerEntity[];
  busy: boolean;
  onAddEntity: (name: string, entityType: string) => Promise<LedgerEntity | null>;
  onStartGame: (input: CreateLedgerGameInput) => Promise<LedgerGame | null>;
  onCancel?: () => void;
};

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CounterEditor({
  counters,
  onChange,
}: {
  counters: GameLedgerCounter[];
  onChange: (counters: GameLedgerCounter[]) => void;
}) {
  function update(index: number, patch: Partial<GameLedgerCounter>) {
    onChange(counters.map((counter, candidateIndex) => candidateIndex === index ? { ...counter, ...patch } : counter));
  }

  return (
    <section className={styles.definitionSection} aria-labelledby="counter-editor-heading">
      <div className={styles.definitionHeading}>
        <div>
          <h4 id="counter-editor-heading">Counters</h4>
          <p>Use none for a journal, one for a normal score, or several for sets, lives, time and more.</p>
        </div>
        <button
          className={styles.smallButton}
          type="button"
          onClick={() => {
            const id = uniqueFieldId("Counter", counters.map((counter) => counter.id), "counter");
            onChange([...counters, {
              id,
              label: `Counter ${counters.length + 1}`,
              scope: "participant",
              value_type: "decimal",
              unit: "",
              initial: 0,
              target: null,
              aggregation: "sum",
              ranking: "highest",
              input: { mode: "delta", quick_values: [1, 2, 3, 5], allow_negative: true },
            }]);
          }}
        >
          <CirclePlus size={15} aria-hidden="true" /> Add counter
        </button>
      </div>

      {counters.length === 0 ? (
        <p className={styles.definitionEmpty}>No score is required. Notes, fields, photos and clips can still tell the whole story.</p>
      ) : (
        <div className={styles.builderList}>
          {counters.map((counter, index) => (
            <div className={styles.builderCard} key={`${counter.id}-${index}`}>
              <div className={styles.builderGrid}>
                <label>
                  <span>Name</span>
                  <input
                    value={counter.label}
                    maxLength={60}
                    onChange={(event) => update(index, { label: event.target.value })}
                    placeholder="Points"
                  />
                </label>
                <label>
                  <span>Unit <em>optional</em></span>
                  <input
                    value={counter.unit ?? ""}
                    maxLength={30}
                    onChange={(event) => update(index, { unit: event.target.value })}
                    placeholder="pts, pegs, seconds"
                  />
                </label>
                <label>
                  <span>Belongs to</span>
                  <select
                    value={counter.scope ?? "participant"}
                    onChange={(event) => update(index, { scope: event.target.value as GameLedgerCounter["scope"] })}
                  >
                    <option value="participant">Each participant</option>
                    <option value="game">The whole game</option>
                  </select>
                </label>
                <label>
                  <span>Calculation</span>
                  <select
                    value={counter.aggregation}
                    onChange={(event) => update(index, { aggregation: event.target.value as GameLedgerCounter["aggregation"] })}
                  >
                    <option value="sum">Add each entry</option>
                    <option value="latest">Use latest value</option>
                    <option value="min">Keep lowest value</option>
                    <option value="max">Keep highest value</option>
                  </select>
                </label>
                <label>
                  <span>Ranking</span>
                  <select
                    value={counter.ranking ?? "highest"}
                    onChange={(event) => update(index, { ranking: event.target.value as GameLedgerCounter["ranking"] })}
                  >
                    <option value="highest">Highest wins</option>
                    <option value="lowest">Lowest wins</option>
                    <option value="none">No winner</option>
                  </select>
                </label>
                <label>
                  <span>Starting value</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={counter.initial ?? 0}
                    onChange={(event) => update(index, { initial: Number(event.target.value) || 0 })}
                  />
                </label>
                <label>
                  <span>Target <em>optional</em></span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={counter.target?.value ?? ""}
                    onChange={(event) => update(index, {
                      target: event.target.value === "" ? null : {
                        operator: counter.target?.operator ?? ">=",
                        value: Number(event.target.value),
                        finish: counter.target?.finish ?? "suggest",
                      },
                    })}
                    placeholder="121"
                  />
                </label>
                <label>
                  <span>Target rule</span>
                  <select
                    value={counter.target?.operator ?? ">="}
                    disabled={!counter.target}
                    onChange={(event) => counter.target && update(index, {
                      target: { ...counter.target, operator: event.target.value as ">=" | "<=" | "=" },
                    })}
                  >
                    <option value=">=">Reach or pass</option>
                    <option value="<=">Reach or go below</option>
                    <option value="=">Hit exactly</option>
                  </select>
                </label>
                <label>
                  <span>Quick values <em>optional</em></span>
                  <input
                    value={(counter.input?.quick_values ?? []).join(", ")}
                    onChange={(event) => update(index, {
                      input: {
                        ...counter.input,
                        quick_values: event.target.value.split(",").map(Number).filter(Number.isFinite).slice(0, 12),
                      },
                    })}
                    placeholder="1, 2, 3, 5"
                  />
                </label>
              </div>
              <button
                className={styles.removeButton}
                type="button"
                onClick={() => onChange(counters.filter((_counter, candidateIndex) => candidateIndex !== index))}
                aria-label={`Remove ${counter.label || `counter ${index + 1}`}`}
              >
                <Trash2 size={14} aria-hidden="true" /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FieldEditor({
  heading,
  help,
  fields,
  onChange,
}: {
  heading: string;
  help: string;
  fields: GameLedgerField[];
  onChange: (fields: GameLedgerField[]) => void;
}) {
  function update(index: number, patch: Partial<GameLedgerField>) {
    onChange(fields.map((field, candidateIndex) => candidateIndex === index ? { ...field, ...patch } : field));
  }

  return (
    <section className={styles.definitionSection}>
      <div className={styles.definitionHeading}>
        <div><h4>{heading}</h4><p>{help}</p></div>
        <button
          className={styles.smallButton}
          type="button"
          onClick={() => {
            const id = uniqueFieldId("Field", fields.map((field) => field.id), "field");
            onChange([...fields, { id, label: `Field ${fields.length + 1}`, type: "text" }]);
          }}
        >
          <CirclePlus size={15} aria-hidden="true" /> Add field
        </button>
      </div>
      {fields.length === 0 ? (
        <p className={styles.definitionEmpty}>No extra fields.</p>
      ) : (
        <div className={styles.builderList}>
          {fields.map((field, index) => (
            <div className={styles.fieldBuilderRow} key={`${field.id}-${index}`}>
              <label>
                <span>Label</span>
                <input
                  value={field.label}
                  maxLength={60}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder="Round, move, weather…"
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={field.type}
                  onChange={(event) => update(index, { type: event.target.value as GameLedgerField["type"] })}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes / no</option>
                  <option value="select">Choice</option>
                </select>
              </label>
              {field.type === "select" && (
                <label className={styles.optionsField}>
                  <span>Choices <em>comma separated</em></span>
                  <input
                    value={(field.options ?? []).join(", ")}
                    onChange={(event) => update(index, {
                      options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                    })}
                    placeholder="Win, Loss, Draw"
                  />
                </label>
              )}
              <label className={styles.requiredField}>
                <input
                  type="checkbox"
                  checked={field.required === true}
                  onChange={(event) => update(index, { required: event.target.checked })}
                />
                Required
              </label>
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => onChange(fields.filter((_field, candidateIndex) => candidateIndex !== index))}
                aria-label={`Remove ${field.label || `field ${index + 1}`}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function GameSetup({ entities, busy, onAddEntity, onStartGame, onCancel }: Props) {
  const [presetId, setPresetId] = useState<GameProfilePresetId>("freeform");
  const [definition, setDefinition] = useState<GameLedgerProfile>(() => presetProfile("freeform"));
  const [title, setTitle] = useState("Open tally");
  const [startedAt, setStartedAt] = useState(localDateTime);
  const [location, setLocation] = useState("");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(() => entities.slice(0, 2).map((entity) => entity.id));
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("person");
  const [showDefinition, setShowDefinition] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedEntities = useMemo(
    () => selectedEntityIds.map((id) => entities.find((entity) => entity.id === id)).filter(Boolean),
    [entities, selectedEntityIds],
  );
  const participantRoles = definition.participant?.roles ?? [];
  const needsParticipant = definition.counters.some((counter) => counter.scope !== "game") || (definition.participant?.min ?? 0) > 0;
  const minimumParticipants = Math.max(definition.participant?.min ?? 0, needsParticipant ? 1 : 0);
  const maximumParticipants = definition.participant?.max ?? 32;
  const rolesAreAssigned = participantRoles.length === 0 || (
    participantRoles.every((_role, index) => Boolean(selectedEntityIds[index]))
    && new Set(selectedEntityIds.slice(0, participantRoles.length)).size === participantRoles.length
  );
  const canStart = Boolean(
    title.trim()
    && selectedEntityIds.length >= minimumParticipants
    && selectedEntityIds.length <= maximumParticipants
    && rolesAreAssigned,
  );

  function choosePreset(id: GameProfilePresetId) {
    const next = presetProfile(id);
    setPresetId(id);
    setDefinition(next);
    setTitle(next.name);
    setShowDefinition(id === "custom");
    setSelectedEntityIds((current) => {
      const selected = current.filter(Boolean);
      const roleCount = next.participant?.roles?.length ?? 0;
      return selected.slice(0, roleCount || next.participant?.max || 32);
    });
  }

  function assignRole(roleIndex: number, entityId: string) {
    setSelectedEntityIds((current) => {
      const next = Array.from({ length: participantRoles.length }, (_item, index) => current[index] ?? "");
      const previousEntityId = next[roleIndex];
      const existingRoleIndex = entityId ? next.indexOf(entityId) : -1;
      next[roleIndex] = entityId;
      if (existingRoleIndex >= 0 && existingRoleIndex !== roleIndex) next[existingRoleIndex] = previousEntityId;
      return next;
    });
  }

  async function addEntity() {
    if (!newEntityName.trim()) return;
    setLocalError(null);
    try {
      const created = await onAddEntity(newEntityName, newEntityType);
      if (created) setSelectedEntityIds((current) => {
        if (participantRoles.length === 0) return Array.from(new Set([...current, created.id]));
        const next = Array.from({ length: participantRoles.length }, (_item, index) => current[index] ?? "");
        const emptyRoleIndex = next.findIndex((id) => !id);
        if (emptyRoleIndex >= 0) next[emptyRoleIndex] = created.id;
        return next;
      });
      setNewEntityName("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "That participant could not be added.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canStart) return;
    setLocalError(null);
    try {
      await onStartGame({
        title: title.trim(),
        definition: { ...definition, name: title.trim(), preset: presetId },
        entityIds: selectedEntityIds,
        startedAt: new Date(startedAt).toISOString(),
        location: location.trim(),
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "That game could not be started.");
    }
  }

  return (
    <section className={styles.setupCard} aria-labelledby="new-ledger-game-heading">
      <div className={styles.sectionIntro}>
        <p className={styles.kicker}>New game</p>
        <h2 id="new-ledger-game-heading">What are we keeping track of?</h2>
        <p>Start from a useful shape, then change every counter and field. The presets never constrain the underlying ledger.</p>
      </div>

      <div className={styles.presetGrid} role="radiogroup" aria-label="Starting shape">
        {GAME_PROFILE_PRESETS.map((preset) => (
          <button
            className={presetId === preset.id ? styles.presetSelected : styles.presetCard}
            type="button"
            role="radio"
            aria-checked={presetId === preset.id}
            key={preset.id}
            onClick={() => choosePreset(preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>

      <form className={styles.setupForm} onSubmit={submit}>
        <div className={styles.twoColumns}>
          <label>
            <span>Game name</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required />
          </label>
          <label>
            <span>Started</span>
            <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required />
          </label>
        </div>
        <label>
          <span>Location <em>optional</em></span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} placeholder="Kitchen table" />
        </label>

        <fieldset className={styles.participantPicker}>
          <legend><UsersRound size={17} aria-hidden="true" /> Participants</legend>
          <p>{participantRoles.length > 0
            ? "Assign every named seat explicitly. These roles determine role-aware results."
            : "People, teams, sides—or any named thing that owns a counter."}</p>
          {participantRoles.length > 0 ? (
            <div className={styles.roleAssignments}>
              {participantRoles.map((role, roleIndex) => (
                <label key={role.id}>
                  <span>{role.label}</span>
                  <select
                    value={selectedEntityIds[roleIndex] ?? ""}
                    onChange={(event) => assignRole(roleIndex, event.target.value)}
                    required
                  >
                    <option value="">Choose {role.label}</option>
                    {entities.map((entity) => <option value={entity.id} key={entity.id}>{entity.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : entities.length > 0 && (
            <div className={styles.entityChoices}>
              {entities.map((entity) => {
                const selected = selectedEntityIds.includes(entity.id);
                return (
                  <label className={selected ? styles.entitySelected : styles.entityChoice} key={entity.id}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setSelectedEntityIds((current) => selected
                        ? current.filter((id) => id !== entity.id)
                        : [...current, entity.id])}
                    />
                    <span>{entity.name}</span>
                    <small>{entity.entity_type}</small>
                  </label>
                );
              })}
            </div>
          )}
          <div className={styles.inlineEntityForm}>
            <label>
              <span className={styles.srOnly}>New participant type</span>
              <select value={newEntityType} onChange={(event) => setNewEntityType(event.target.value)}>
                <option value="person">Person</option>
                <option value="team">Team</option>
                <option value="side">Side</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span className={styles.srOnly}>New participant name</span>
              <input
                value={newEntityName}
                onChange={(event) => setNewEntityName(event.target.value)}
                placeholder="Add a person or team"
                maxLength={80}
              />
            </label>
            <button className={styles.smallButton} type="button" disabled={busy || !newEntityName.trim()} onClick={() => void addEntity()}>
              <CirclePlus size={15} aria-hidden="true" /> Add
            </button>
          </div>
          {!rolesAreAssigned ? (
            <p className={styles.fieldHint}>Assign a different participant to every role.</p>
          ) : selectedEntities.length < minimumParticipants && (
            <p className={styles.fieldHint}>Choose at least {minimumParticipants} {minimumParticipants === 1 ? "participant" : "participants"} for this definition.</p>
          )}
        </fieldset>

        <button
          className={styles.definitionToggle}
          type="button"
          aria-expanded={showDefinition}
          onClick={() => setShowDefinition((current) => !current)}
        >
          <Settings2 size={17} aria-hidden="true" /> Customize counters and fields
          <ChevronDown className={showDefinition ? styles.chevronOpen : ""} size={17} aria-hidden="true" />
        </button>

        {showDefinition && (
          <div className={styles.definitionBuilder}>
            <CounterEditor counters={definition.counters} onChange={(counters) => setDefinition((current) => ({ ...current, counters }))} />
            <FieldEditor
              heading="Fields on each moment"
              help="Optional structured details to record alongside a score or note."
              fields={definition.event_fields}
              onChange={(event_fields) => setDefinition((current) => ({ ...current, event_fields }))}
            />
            <FieldEditor
              heading="Fields when finishing"
              help="Result, winner, reason, board number—or anything else worth keeping."
              fields={definition.result_fields}
              onChange={(result_fields) => setDefinition((current) => ({ ...current, result_fields }))}
            />
            <section className={styles.definitionSection}>
              <div className={styles.definitionHeading}>
                <div>
                  <h4>Result</h4>
                  <p>Keep the final outcome explicit; a target only signals progress and never silently decides a winner.</p>
                </div>
              </div>
              <div className={styles.resultDefinitionGrid}>
                <label>
                  <span>Result mode</span>
                  <select
                    value={definition.result?.mode ?? "manual"}
                    onChange={(event) => setDefinition((current) => ({
                      ...current,
                      result: {
                        ...current.result,
                        mode: event.target.value as "derived" | "manual" | "none",
                        allow_draw: current.result?.allow_draw !== false,
                      },
                    }))}
                  >
                    <option value="derived">Suggest from a counter</option>
                    <option value="manual">Choose when finishing</option>
                    <option value="none">No winner / result</option>
                  </select>
                </label>
                {(definition.result?.mode ?? "manual") === "derived" && (
                  <label>
                    <span>Winner counter</span>
                    <select
                      value={definition.result?.winner_counter_id ?? ""}
                      onChange={(event) => setDefinition((current) => ({
                        ...current,
                        result: { ...current.result!, winner_counter_id: event.target.value },
                      }))}
                    >
                      <option value="">Choose…</option>
                      {definition.counters
                        .filter((counter) => counter.scope !== "game" && counter.ranking !== "none")
                        .map((counter) => <option key={counter.id} value={counter.id}>{counter.label}</option>)}
                    </select>
                  </label>
                )}
                {(definition.result?.mode ?? "manual") !== "none" && (
                  <label className={styles.booleanField}>
                    <input
                      type="checkbox"
                      checked={definition.result?.allow_draw !== false}
                      onChange={(event) => setDefinition((current) => ({
                        ...current,
                        result: { ...current.result!, allow_draw: event.target.checked },
                      }))}
                    />
                    <span>Allow a draw</span>
                  </label>
                )}
              </div>
            </section>
          </div>
        )}

        {localError && <div className={styles.inlineError} role="alert">{localError}</div>}
        <div className={styles.formActions}>
          {onCancel && <button className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button>}
          <button className={styles.primaryButton} type="submit" disabled={busy || !canStart}>
            {busy ? "Starting…" : "Start game ledger"}
          </button>
        </div>
      </form>
    </section>
  );
}
