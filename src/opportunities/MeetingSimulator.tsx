import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLIENT_SIZES,
  MEETING_TYPES,
  SELLER_PROFILES,
  getClientSectorModel,
  selectableClientSectors,
  type ClientSizeId,
  type MeetingTypeId,
} from "./sectorModels";
import { getBlockerFactor, type BlockerFactorId } from "./blockerFactors";
import { METIER_PACKS, getMetierDomain } from "./metierPacks";
import {
  applyChoice,
  buildDebrief,
  buildSimulation,
  buyerLineFor,
  currentStep,
  getDiscoveryStage,
  isFinished,
  startSimulation,
  TRAME_STATUS_LABEL,
  type DiscoveryStageId,
  type TrameStatus,
  type SimState,
} from "./meetingPatterns";

type Props = {
  /** Secteur client proposé d'office (déduit du compte). */
  defaultClientSectorId: string;
  /** Compte rattaché à un groupe. */
  defaultMultiEntity: boolean;
  /** Taille déduite de la fiche compte, si renseignée. */
  defaultClientSize?: ClientSizeId | null;
  /** Ce que vend le commercial (partagé avec la revue). */
  sellerProfileId: string;
  onSellerProfileChange: (id: string) => void;
  disabled?: boolean;
};

type Phase = "setup" | "play" | "debrief";

const METIER_KEY = "dbr.metierId";

function readMetier(): string {
  try {
    return window.localStorage.getItem(METIER_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeMetier(id: string) {
  try {
    if (id) window.localStorage.setItem(METIER_KEY, id);
    else window.localStorage.removeItem(METIER_KEY);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="sim-chips" disabled={disabled}>
      <legend>{label}</legend>
      <div className="sim-chips-row">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`sim-chip${o.id === value ? " is-active" : ""}`}
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PatienceMeter({ value, max }: { value: number; max: number }) {
  return (
    <p className="sim-patience" aria-label={`Patience de l'acheteur : ${value} sur ${max}`}>
      Patience de l’acheteur{" "}
      <span aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`sim-dot${i < value ? " is-on" : ""}`} />
        ))}
      </span>
    </p>
  );
}

const STATUS_LABEL = {
  creuse: "Trouvé et creusé",
  repere: "Trouvé, pas creusé",
  manque: "Pas trouvé",
} as const;

export default function MeetingSimulator({
  defaultClientSectorId,
  defaultMultiEntity,
  defaultClientSize = null,
  sellerProfileId,
  onSellerProfileChange,
  disabled = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [clientSectorId, setClientSectorId] = useState(defaultClientSectorId);
  const [multiEntity, setMultiEntity] = useState(defaultMultiEntity);
  const [clientSize, setClientSize] = useState<ClientSizeId>(defaultClientSize ?? "eti");
  const [meeting, setMeeting] = useState<MeetingTypeId>("R1");
  const [seed, setSeed] = useState(newSeed);
  const [carryOver, setCarryOver] = useState<BlockerFactorId[]>([]);
  const [known, setKnown] = useState<BlockerFactorId[]>([]);
  const [grid, setGrid] = useState<Partial<Record<DiscoveryStageId, TrameStatus>>>({});
  const [state, setState] = useState<SimState | null>(null);
  const [metierId, setMetierIdState] = useState(readMetier);
  const metier = getMetierDomain(metierId);
  const [packId, setPackId] = useState(metier?.pack.id ?? "");
  const pack = METIER_PACKS.find((p) => p.id === packId) ?? null;

  function setMetierId(id: string) {
    setMetierIdState(id);
    writeMetier(id);
  }
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === "setup") {
      setClientSectorId(defaultClientSectorId);
      setMultiEntity(defaultMultiEntity);
      if (defaultClientSize) setClientSize(defaultClientSize);
    }
    // Ne suit le compte qu'avant la partie.
  }, [defaultClientSectorId, defaultMultiEntity, defaultClientSize]);

  const settings = { clientSectorId, sellerProfileId, multiEntity, clientSize, metierId };
  const sim = useMemo(
    () => buildSimulation({ ...settings, meeting, seed, carryOver, known, trame: grid }),
    [clientSectorId, sellerProfileId, multiEntity, clientSize, metierId, meeting, seed, carryOver, known, grid],
  );

  const step = state && phase === "play" ? currentStep(state) : undefined;
  const debrief = state && phase === "debrief" ? buildDebrief(sim, state) : null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state, phase]);

  function start(opts?: {
    meeting?: MeetingTypeId;
    carryOver?: BlockerFactorId[];
    known?: BlockerFactorId[];
    trame?: Partial<Record<DiscoveryStageId, TrameStatus>>;
  }) {
    const nextMeetingId = opts?.meeting ?? meeting;
    const nextCarry = opts?.carryOver ?? [];
    const nextKnown = opts?.known ?? [];
    const nextGrid = opts?.trame ?? {};
    const nextSeed = newSeed();
    // Même entrée que le useMemo : la partie démarre sur la simulation affichée.
    const fresh = buildSimulation({
      ...settings,
      meeting: nextMeetingId,
      seed: nextSeed,
      carryOver: nextCarry,
      known: nextKnown,
      trame: nextGrid,
    });
    setMeeting(nextMeetingId);
    setCarryOver(nextCarry);
    setKnown(nextKnown);
    setGrid(nextGrid);
    setSeed(nextSeed);
    setState(startSimulation(fresh));
    setPhase("play");
  }

  function choose(choiceId: string) {
    if (!state) return;
    const next = applyChoice(state, choiceId);
    setState(next);
    if (isFinished(next)) setPhase("debrief");
  }

  const meetingIndex = MEETING_TYPES.findIndex((m) => m.id === meeting);
  const nextMeeting = MEETING_TYPES.at(meetingIndex + 1)?.id;
  const hiddenCount = sim.blockers.length - sim.carried.length;

  if (phase === "setup" || !state) {
    return (
      <div className="sim-root">
        <Chips
          label="Ce que tu vends"
          value={sellerProfileId}
          options={[
            ...SELLER_PROFILES.map((p) => ({ id: p.id, label: p.label })),
            { id: "", label: "Autre" },
          ]}
          onChange={onSellerProfileChange}
          disabled={disabled}
        />
        <Chips
          label="Ton métier (optionnel)"
          value={packId}
          options={[
            { id: "", label: "Non précisé" },
            ...METIER_PACKS.map((p) => ({ id: p.id, label: p.label })),
          ]}
          onChange={(id) => {
            setPackId(id);
            if (!id) setMetierId("");
            else if (getMetierDomain(metierId)?.pack.id !== id) setMetierId("");
          }}
          disabled={disabled}
        />
        {pack ? (
          <Chips
            label={`Domaine (${pack.label})`}
            value={metierId}
            options={[
              { id: "", label: "Tous" },
              ...pack.domains.map((d) => ({ id: d.id, label: d.label })),
            ]}
            onChange={setMetierId}
            disabled={disabled}
          />
        ) : null}
        <Chips
          label="Secteur de ton client"
          value={clientSectorId}
          options={selectableClientSectors().map((m) => ({ id: m.id, label: m.label }))}
          onChange={setClientSectorId}
          disabled={disabled}
        />
        <Chips
          label="Taille du client"
          value={clientSize}
          options={CLIENT_SIZES.map((c) => ({ id: c.id, label: `${c.label} · ${c.detail}` }))}
          onChange={setClientSize}
          disabled={disabled}
        />
        <Chips
          label="Organisation du client"
          value={multiEntity ? "groupe" : "seule"}
          options={[
            { id: "seule", label: "Entité seule" },
            { id: "groupe", label: "Filiale d'un groupe" },
          ]}
          onChange={(id) => setMultiEntity(id === "groupe")}
          disabled={disabled}
        />
        <Chips
          label="Rendez-vous"
          value={meeting}
          options={MEETING_TYPES.map((m) => ({ id: m.id, label: `${m.id} · ${m.label}` }))}
          onChange={setMeeting}
          disabled={disabled}
        />
        <p className="sim-level">
          Complexité du deal :{" "}
          <strong>
            {sim.complexity.level} · {sim.complexity.label}
          </strong>{" "}
          — au moins {sim.steps.length} questions, {sim.blockers.length} blocage
          {sim.blockers.length > 1 ? "s" : ""} à trouver. L’acheteur tolère {sim.patience} réponses
          faibles avant d’écourter.
        </p>
        <p className="muted sim-hint">{getClientSectorModel(clientSectorId)?.keyInsight}</p>
        <button
          type="button"
          className="deal-review-chatbot-start"
          disabled={disabled}
          onClick={() => start()}
        >
          Commencer le rendez-vous
        </button>
      </div>
    );
  }

  return (
    <div className="sim-root">
      {phase === "play" ? <PatienceMeter value={state.patience} max={state.maxPatience} /> : null}
      <div className="deal-review-messages sim-messages" ref={scrollerRef}>
        <p className="sim-opening">{sim.opening}</p>
        <p className="sim-opening">
          {hiddenCount > 0
            ? `Ce deal cache ${hiddenCount} blocage${hiddenCount > 1 ? "s" : ""} : à toi de ${hiddenCount > 1 ? "les" : "le"} trouver.`
            : ""}
          {sim.carried.length > 0
            ? ` ${sim.carried.length} blocage${sim.carried.length > 1 ? "s" : ""} du rendez-vous précédent revien${sim.carried.length > 1 ? "nent" : "t"}.`
            : ""}
        </p>
        {state.played.map(({ step: s, buyerLine, turn }, i) => (
          <div key={`${s.id}-${i}`} className="sim-step">
            <div className="deal-review-msg bot">
              <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
                A
              </span>
              <div className={`deal-review-bubble bot${s.origin === "retour" || s.origin === "verrou" ? " sim-escalation" : ""}`}>
                <span className="deal-review-topic">
                  {getDiscoveryStage(s.stage).label} · {s.theme}
                </span>
                {buyerLine}
              </div>
            </div>
            <div className="deal-review-msg user">
              <div className={`deal-review-bubble user sim-pick is-${turn.kind}`}>{turn.label}</div>
            </div>
            <div className="deal-review-msg bot">
              <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
                A
              </span>
              <div className="deal-review-bubble bot">{turn.reply}</div>
            </div>
            {turn.riskFound && s.origin === "base" ? (
              <p className={`sim-flag is-${turn.riskFound.level}`} role="status">
                Blocage repéré : {turn.riskFound.text} Une relance est possible.
              </p>
            ) : null}
          </div>
        ))}
        {step ? (
          <div className="deal-review-msg bot">
            <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
              A
            </span>
            <div className={`deal-review-bubble bot${step.origin === "retour" || step.origin === "verrou" ? " sim-escalation" : ""}`}>
              {step.origin !== "base" ? <span className="deal-review-topic">{step.theme}</span> : null}
              {buyerLineFor(state, step)}
            </div>
          </div>
        ) : null}
        {state.closingLine ? (
          <div className="deal-review-msg bot">
            <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
              A
            </span>
            <div className="deal-review-bubble bot sim-escalation">{state.closingLine}</div>
          </div>
        ) : null}
      </div>

      {phase === "play" && step ? (
        <div className="sim-choices" role="group" aria-label="Ta réponse">
          <p className="sim-choices-label">
            Étape {state.played.length + 1} · {getDiscoveryStage(step.stage).label} · que dis-tu ?
          </p>
          {step.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className="sim-choice"
              disabled={disabled}
              onClick={() => choose(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      {debrief ? (
        <div className="deal-review-debrief sim-debrief">
          <h4>Débrief</h4>
          <div className="deal-review-debrief-part">
            <strong>La trame du deal</strong>
            <span className="muted"> · sur tout le cycle</span>
            {debrief.eventFound === false ? (
              <p className="sim-flag is-risque_majeur">
                Qualification pas commencée : on ne sait toujours pas pourquoi ce projet doit être lancé
                maintenant. Sans cette priorité, sponsor, décideur, budget et la suite ne servent à rien.
              </p>
            ) : null}
            <ol className="sim-trame">
              {debrief.trame.map((t) => (
                <li key={t.stage} className={`is-${t.status}`}>
                  <span className="sim-trame-head">
                    <strong>{t.label}</strong>
                    <span className="sim-trame-status">
                      {TRAME_STATUS_LABEL[t.status]}
                      {t.fromEarlier ? " · rendez-vous précédent" : ""}
                    </span>
                  </span>
                  <span className="muted">{t.question}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="deal-review-debrief-part">
            <strong>Ce qui bloquait ce deal</strong>
            <ul className="sim-blockers">
              {debrief.blockers.map((b) => (
                <li key={b.factor} className={`is-${b.status}`}>
                  <span className="sim-blocker-status">
                    {b.carried ? "Revenu · " : ""}
                    {STATUS_LABEL[b.status]}
                  </span>{" "}
                  <strong>{b.label}</strong> — {b.evidence}.
                  <br />
                  <span className="muted">À faire : {b.action}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="deal-review-debrief-part">
            <strong>Ce qui s’est passé</strong>
            <ol className="sim-events">
              {debrief.events.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {debrief.events.length === 0 ? <li>Rendez-vous mené sans faux pas.</li> : null}
            </ol>
          </div>
          <p>
            <strong>Questions posées :</strong> {debrief.asked.length} sur{" "}
            {debrief.asked.length + debrief.missed.length}
            {debrief.lost.length > 0
              ? ` (dont ${debrief.lost.length} perdue${debrief.lost.length > 1 ? "s" : ""} : rendez-vous écourté)`
              : ""}
          </p>
          {debrief.missed.length > 0 ? (
            <div className="deal-review-debrief-part">
              <strong>Questions manquées</strong>
              <ul>
                {debrief.missed.map((q, i) => (
                  <li key={`${q}-${i}`}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>
            <strong>Issue du rendez-vous :</strong>{" "}
            {debrief.issueReached
              ? "atteinte"
              : debrief.endedEarly
                ? "rendez-vous écourté"
                : "pas encore atteinte"}
          </p>
          <p>{debrief.nextStep}</p>
          <div className="sim-actions">
            <button
              type="button"
              className="sim-chip"
              onClick={() =>
                start({ meeting, carryOver: sim.carried, known: sim.known, trame: sim.trameBefore })
              }
            >
              Rejouer ce rendez-vous
            </button>
            {nextMeeting ? (
              <button
                type="button"
                className="sim-chip is-active"
                onClick={() =>
                  start({
                    meeting: nextMeeting,
                    carryOver: debrief.carryOver,
                    known: debrief.known,
                    trame: Object.fromEntries(debrief.trame.map((t) => [t.stage, t.status])),
                  })
                }
              >
                Rendez-vous suivant ({nextMeeting})
              </button>
            ) : null}
            <button
              type="button"
              className="sim-chip"
              onClick={() => {
                setState(null);
                setCarryOver([]);
                setKnown([]);
                setGrid({});
                setPhase("setup");
              }}
            >
              Changer de secteur
            </button>
          </div>
          {debrief.carryOver.length > 0 && nextMeeting ? (
            <p className="muted">
              Si tu passes au rendez-vous suivant, ces blocages non traités reviendront :{" "}
              {debrief.carryOver.map((f) => getBlockerFactor(f)?.label).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
