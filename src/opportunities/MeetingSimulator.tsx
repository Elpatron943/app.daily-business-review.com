import { useEffect, useMemo, useRef, useState } from "react";
import {
  MEETING_TYPES,
  SELLER_PROFILES,
  getClientSectorModel,
  selectableClientSectors,
  type MeetingTypeId,
} from "./sectorModels";
import {
  buildDebrief,
  buildSimulation,
  playChoice,
  type SimTurn,
} from "./meetingPatterns";

type Props = {
  /** Secteur client proposé d'office (déduit du compte). */
  defaultClientSectorId: string;
  /** Compte rattaché à un groupe. */
  defaultMultiEntity: boolean;
  /** Ce que vend le commercial (partagé avec la revue). */
  sellerProfileId: string;
  onSellerProfileChange: (id: string) => void;
  disabled?: boolean;
};

type Phase = "setup" | "play" | "debrief";

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

export default function MeetingSimulator({
  defaultClientSectorId,
  defaultMultiEntity,
  sellerProfileId,
  onSellerProfileChange,
  disabled = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [clientSectorId, setClientSectorId] = useState(defaultClientSectorId);
  const [multiEntity, setMultiEntity] = useState(defaultMultiEntity);
  const [meeting, setMeeting] = useState<MeetingTypeId>("R1");
  const [seed, setSeed] = useState(newSeed);
  const [turns, setTurns] = useState<SimTurn[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === "setup") {
      setClientSectorId(defaultClientSectorId);
      setMultiEntity(defaultMultiEntity);
    }
    // Ne suit le compte qu'avant la partie.
  }, [defaultClientSectorId, defaultMultiEntity]);

  const sim = useMemo(
    () =>
      buildSimulation({
        clientSectorId,
        sellerProfileId,
        multiEntity,
        meeting,
        seed,
      }),
    [clientSectorId, sellerProfileId, multiEntity, meeting, seed],
  );

  const stepIndex = turns.length;
  const currentStep = phase === "play" ? sim.steps.at(stepIndex) : undefined;
  const debrief = phase === "debrief" ? buildDebrief(sim, turns) : null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, phase]);

  function start(nextMeeting?: MeetingTypeId) {
    if (nextMeeting) setMeeting(nextMeeting);
    setSeed(newSeed());
    setTurns([]);
    setPhase("play");
  }

  function choose(choiceId: string) {
    if (!currentStep) return;
    const turn = playChoice(currentStep, choiceId);
    const next = [...turns, turn];
    setTurns(next);
    if (next.length >= sim.steps.length) setPhase("debrief");
  }

  const meetingIndex = MEETING_TYPES.findIndex((m) => m.id === meeting);
  const nextMeeting = MEETING_TYPES.at(meetingIndex + 1)?.id;

  if (phase === "setup") {
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
          label="Secteur de ton client"
          value={clientSectorId}
          options={selectableClientSectors().map((m) => ({
            id: m.id,
            label: m.label,
          }))}
          onChange={setClientSectorId}
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
          options={MEETING_TYPES.map((m) => ({
            id: m.id,
            label: `${m.id} · ${m.label}`,
          }))}
          onChange={setMeeting}
          disabled={disabled}
        />
        <p className="muted sim-hint">
          {getClientSectorModel(clientSectorId)?.keyInsight}
        </p>
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
      <div className="deal-review-messages sim-messages" ref={scrollerRef}>
        <p className="sim-opening">{sim.opening}</p>
        {sim.steps.slice(0, stepIndex + (phase === "play" ? 1 : 0)).map((step, i) => {
          const turn = turns.at(i);
          return (
            <div key={step.id} className="sim-step">
              <div className="deal-review-msg bot">
                <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
                  A
                </span>
                <div className="deal-review-bubble bot">
                  {turn ? (
                    <span className="deal-review-topic">{step.theme}</span>
                  ) : null}
                  {step.buyerLine}
                </div>
              </div>
              {turn ? (
                <>
                  <div className="deal-review-msg user">
                    <div className={`deal-review-bubble user sim-pick is-${turn.kind}`}>
                      {turn.label}
                    </div>
                  </div>
                  <div className="deal-review-msg bot">
                    <span className="deal-review-avatar size-sm sim-buyer" aria-hidden>
                      A
                    </span>
                    <div className="deal-review-bubble bot">{turn.reply}</div>
                  </div>
                  {turn.riskFound ? (
                    <p
                      className={`sim-flag is-${turn.riskFound.level}`}
                      role="status"
                    >
                      Signal repéré : {turn.riskFound.text}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {phase === "play" && currentStep ? (
        <div className="sim-choices" role="group" aria-label="Ta réponse">
          <p className="sim-choices-label">
            Étape {stepIndex + 1} sur {sim.steps.length} · que fais-tu ?
          </p>
          {currentStep.choices.map((c) => (
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
          <p>
            <strong>Questions posées :</strong> {debrief.asked.length} sur{" "}
            {sim.steps.length}
          </p>
          {debrief.missed.length > 0 ? (
            <div className="deal-review-debrief-part">
              <strong>Questions oubliées</strong>
              <ul>
                {debrief.missed.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {debrief.risksFound.length > 0 ? (
            <div className="deal-review-debrief-part">
              <strong>Signaux repérés</strong>
              <ul>
                {debrief.risksFound.map((r) => (
                  <li key={r.text}>
                    {r.text} → {r.action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {debrief.risksMissed.length > 0 ? (
            <div className="deal-review-debrief-part">
              <strong>Signaux manqués</strong>
              <ul>
                {debrief.risksMissed.map((r) => (
                  <li key={r.text}>
                    {r.text} → {r.action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>
            <strong>Issue du rendez-vous :</strong>{" "}
            {debrief.issueReached ? "atteinte" : "pas encore atteinte"}
          </p>
          <p>{debrief.nextStep}</p>
          <div className="sim-actions">
            <button type="button" className="sim-chip" onClick={() => start()}>
              Rejouer ce rendez-vous
            </button>
            {nextMeeting ? (
              <button
                type="button"
                className="sim-chip"
                onClick={() => start(nextMeeting)}
              >
                Rendez-vous suivant ({nextMeeting})
              </button>
            ) : null}
            <button
              type="button"
              className="sim-chip"
              onClick={() => {
                setTurns([]);
                setPhase("setup");
              }}
            >
              Changer de secteur
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
