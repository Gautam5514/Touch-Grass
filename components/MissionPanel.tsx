"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Images, Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { ai, AI_ERROR_HELP, AiError } from "@/lib/ai/classifier";
import { MODEL_ID, MODEL_VERSION } from "@/lib/ai/config";
import { verify } from "@/lib/ai/verify";
import { beginAnalysis, getSettings, recordManual, recordMatch, revertAnalysis, skipMission, StorageError, toStorageError } from "@/lib/db";
import { prepareImage, ImageError, type PreparedImage } from "@/lib/image";
import { getApproxLocation } from "@/lib/location";
import type { Mission, SessionMission, VerifyResult } from "@/lib/types";
import { useAi } from "@/lib/hooks";
import AIResult from "./AIResult";
import AiStatus from "./AiStatus";
import Photo from "./Photo";
import { btnGhost, btnLime, btnPrimary, btnSecondary } from "./ui";

interface Props {
  mission: Mission;
  sessionMission: SessionMission;
  onClose: () => void;
}

type Outcome = { verify: VerifyResult; ms: number } | null;

export default function MissionPanel({ mission, sessionMission, onClose }: Props) {
  const { status: aiStatus } = useAi();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedImage>();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [step, setStep] = useState<"idle" | "reading" | "analyzing" | "saving">("idle");
  const [problem, setProblem] = useState<{ title: string; hint?: string; ai?: boolean } | null>(null);
  const [saved, setSaved] = useState<"matched" | "manual" | null>(null);

  const busy = step !== "idle";
  const busyRef = useRef(false); // synchronous guard against double taps
  const abortRef = useRef<AbortController | null>(null);
  const analyzingRef = useRef(false);
  const smId = sessionMission.id!;

  // If the user leaves mid-analysis, cancel and put the mission back to pending.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (analyzingRef.current) void revertAnalysis(smId);
    },
    [smId],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busyRef.current) return; // cancelled picker or double event
    busyRef.current = true;
    setStep("reading");
    setProblem(null);
    setOutcome(null);
    try {
      setPrepared(await prepareImage(file));
    } catch (err) {
      setProblem({ title: err instanceof ImageError ? err.message : "We couldn’t read that image.", hint: "Take another photo or choose a different one." });
    } finally {
      busyRef.current = false;
      setStep("idle");
    }
  }

  const reset = () => {
    setPrepared(undefined);
    setOutcome(null);
    setProblem(null);
  };

  async function maybeLocation() {
    try {
      if (!(await getSettings()).locationEnabled) return undefined;
      const r = await getApproxLocation();
      return r.ok ? { lat: r.lat, lon: r.lon } : undefined;
    } catch {
      return undefined;
    }
  }

  async function analyze() {
    if (!prepared || busyRef.current) return;
    busyRef.current = true;
    setStep("analyzing");
    setProblem(null);
    abortRef.current = new AbortController();
    try {
      if (!(await beginAnalysis(smId))) {
        setProblem({ title: "This mission was already updated.", hint: "Go back to the mission list to see its status." });
        return;
      }
      analyzingRef.current = true;
      const { scores, ms } = await ai.classify(prepared.rgb, mission.candidateLabels, abortRef.current.signal);
      const result = verify(mission, scores);
      if (result.outcome === "matched") {
        setStep("saving");
        const location = await maybeLocation();
        const { saved: ok } = await recordMatch(smId, {
          thumbnail: prepared.thumbnail,
          image: prepared.image,
          predictedLabel: result.topLabel,
          score: result.targetScore,
          margin: result.margin,
          modelId: MODEL_ID,
          modelVersion: MODEL_VERSION,
          approximateLocation: location,
        });
        analyzingRef.current = false;
        if (ok) setSaved("matched");
      } else {
        await revertAnalysis(smId);
        analyzingRef.current = false;
        if (result.outcome === "error") setProblem({ title: result.reason, hint: "Try again or log it manually." });
      }
      setOutcome({ verify: result, ms });
    } catch (err) {
      if (analyzingRef.current) await revertAnalysis(smId).catch(() => {});
      analyzingRef.current = false;
      if (err instanceof AiError) {
        if (err.code !== "aborted") setProblem({ title: AI_ERROR_HELP[err.code].message, hint: AI_ERROR_HELP[err.code].hint, ai: true });
      } else if (err instanceof StorageError) setProblem({ title: err.message });
      else setProblem({ title: toStorageError(err).message });
    } finally {
      busyRef.current = false;
      setStep("idle");
    }
  }

  async function logManual() {
    if (!prepared || busyRef.current) return;
    busyRef.current = true;
    setStep("saving");
    try {
      const location = await maybeLocation();
      const { saved: ok } = await recordManual(smId, { thumbnail: prepared.thumbnail, image: prepared.image, approximateLocation: location });
      if (ok) setSaved("manual");
    } catch (err) {
      setProblem({ title: toStorageError(err).message });
    } finally {
      busyRef.current = false;
      setStep("idle");
    }
  }

  async function skip() {
    if (busyRef.current) return;
    await skipMission(smId);
    onClose();
  }

  // ---- success / manual saved ----
  if (saved) {
    return (
      <div className="flex flex-1 flex-col gap-5" data-testid="mission-saved" data-kind={saved}>
        {prepared && <Photo blob={prepared.image} alt="Your saved discovery" className="aspect-[4/3] w-full rounded-3xl bg-line object-cover" />}
        {saved === "matched" && outcome && <AIResult result={outcome.verify} mission={mission} modelId={MODEL_ID} modelVersion={MODEL_VERSION} ms={outcome.ms} />}
        {saved === "manual" && (
          <div className="rounded-3xl border-2 border-line bg-card p-5" role="status">
            <h2 className="text-2xl font-bold">Logged manually</h2>
            <p className="mt-1 text-muted">Saved to your journal as a manual discovery. It doesn’t earn AI-verified points.</p>
          </div>
        )}
        <button onClick={onClose} className={`${btnPrimary} mt-auto`} data-testid="next-mission">Back to missions</button>
      </div>
    );
  }

  const aiBroken = aiStatus === "error";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <button onClick={onClose} className="mb-3 inline-flex min-h-11 items-center text-base font-semibold text-forest"><span aria-hidden>←</span>&nbsp;Missions</button>
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-lime/60 text-4xl" aria-hidden>{mission.emoji}</span>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{mission.title}</h1>
            <p className="text-muted">{mission.description}</p>
          </div>
        </div>
        {mission.safety && (
          <p className="mt-3 flex gap-2 rounded-2xl bg-warn-bg p-3 text-sm text-warn"><ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />{mission.safety}</p>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="sr-only" aria-label="Take a photo with the camera" tabIndex={-1} data-testid="camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} className="sr-only" aria-label="Choose a photo from your files" tabIndex={-1} data-testid="file-input" />

      {!prepared ? (
        <>
          <button onClick={() => cameraRef.current?.click()} disabled={busy} className="grid min-h-64 place-items-center rounded-3xl border-2 border-dashed border-forest/40 bg-card text-center transition active:scale-[0.99]">
            <span className="flex flex-col items-center gap-3 px-6">
              {step === "reading" ? <Loader2 className="animate-spin text-forest" size={44} aria-hidden /> : <Camera className="text-forest" size={44} aria-hidden />}
              <span className="text-xl font-bold">{step === "reading" ? "Preparing photo…" : "Take a photo"}</span>
              <span className="text-sm text-muted">Opens your rear camera on a phone.</span>
            </span>
          </button>
          <button onClick={() => galleryRef.current?.click()} disabled={busy} className={btnSecondary}><Images size={20} aria-hidden /> Choose from files</button>
          <p className="text-xs text-muted">If the camera doesn’t open, check that your browser is allowed to use it, or choose a photo from your files instead.</p>
        </>
      ) : (
        <>
          <Photo blob={prepared.image} alt="Your photo, ready to analyze" className="aspect-[4/3] w-full rounded-3xl bg-line object-cover" />
          {!outcome && (
            <div className="flex flex-col gap-2">
              <button onClick={() => void analyze()} disabled={busy} className={btnPrimary} data-testid="analyze">
                {step === "analyzing" || step === "saving" ? <><Loader2 className="animate-spin" size={22} aria-hidden /> {aiStatus === "loading" ? "Loading AI…" : step === "saving" ? "Saving…" : "Looking closely…"}</> : <><Sparkles size={22} aria-hidden /> Analyze discovery</>}
              </button>
              <button onClick={reset} disabled={busy} className={btnSecondary}><RefreshCw size={20} aria-hidden /> Retake</button>
            </div>
          )}
          {step === "analyzing" && aiStatus === "loading" && <AiStatus compact />}
        </>
      )}

      {outcome && (
        <>
          <AIResult result={outcome.verify} mission={mission} modelId={MODEL_ID} modelVersion={MODEL_VERSION} ms={outcome.ms} />
          <div className="flex flex-col gap-2">
            <button onClick={reset} className={btnPrimary}><RefreshCw size={20} aria-hidden /> Try another photo</button>
            <button onClick={() => void logManual()} disabled={busy} className={btnSecondary} data-testid="log-manual">I’m sure, log it manually</button>
          </div>
        </>
      )}

      {problem && (
        <div role="alert" className="rounded-2xl bg-warn-bg p-4 text-warn" data-testid="problem">
          <p className="font-bold">{problem.title}</p>
          {problem.hint && <p className="mt-1 text-sm">{problem.hint}</p>}
          {problem.ai && prepared && (
            <div className="mt-3 flex flex-col gap-2">
              {!aiBroken && <button onClick={() => void analyze()} className={btnLime}>Retry analysis</button>}
              <button onClick={() => void logManual()} disabled={busy} className={btnSecondary}>Log it manually</button>
            </div>
          )}
        </div>
      )}

      {!prepared && (
        <button onClick={() => void skip()} className={btnGhost} data-testid="skip">Skip this mission</button>
      )}
      {prepared && !outcome && <button onClick={() => void skip()} disabled={busy} className={btnGhost}>Skip this mission</button>}
    </div>
  );
}
