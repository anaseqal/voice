"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mic, MicOff, RotateCcw, Square, Check } from "lucide-react";
import { cn, fmtDuration } from "@/lib/utils";

type Phase = "idle" | "requesting" | "recording" | "preview" | "denied";

const MAX_BARS = 96;
const TICK_MS = 50; // visualizer + timer poll cadence

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "";
}

function extFromMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

export function MicRecorder({
  onUse,
  maxSeconds = 600,
}: {
  onUse: (file: File, durationSec: number) => void;
  maxSeconds?: number;
}) {
  const t = useTranslations("recorder");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewMimeRef = useRef<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>(new Array(MAX_BARS).fill(0));

  // Cleanup all resources. Safe to call multiple times.
  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current !== null) clearInterval(tickRef.current);
    tickRef.current = null;
    try {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
    } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }, []);

  // Always teardown on unmount
  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    if (phase === "requesting" || phase === "recording") return;
    setPhase("requesting");
    historyRef.current = new Array(MAX_BARS).fill(0);
    setElapsedMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio graph for visualization (independent of MediaRecorder)
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Recorder
      const mime = pickMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      previewMimeRef.current = mime || recorder.mimeType || "audio/webm";
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: previewMimeRef.current,
        });
        previewBlobRef.current = blob;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPhase("preview");
        // Stop the mic + visualizer but keep the blob/url for preview
        rafRef.current && cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        tickRef.current && clearInterval(tickRef.current);
        tickRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        analyserRef.current = null;
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;
      };

      recorder.start(100);
      startedAtRef.current = performance.now();
      setPhase("recording");

      // Visualizer loop
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        const hist = historyRef.current;
        hist.push(peak);
        if (hist.length > MAX_BARS) hist.shift();
        renderCanvas(canvasRef.current, hist);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      // Timer + max-duration auto-stop
      tickRef.current = window.setInterval(() => {
        const ms = performance.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= maxSeconds * 1000) stop();
      }, TICK_MS);
    } catch (err) {
      console.warn("mic permission denied or unavailable:", err);
      setPhase("denied");
      teardown();
    }
  }, [phase, previewUrl, maxSeconds, teardown]);

  const stop = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {}
  }, []);

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    previewBlobRef.current = null;
    setPhase("idle");
    setElapsedMs(0);
  }, [previewUrl]);

  const use = useCallback(() => {
    const blob = previewBlobRef.current;
    if (!blob) return;
    const ext = extFromMime(previewMimeRef.current);
    const file = new File([blob], `recording-${Date.now()}.${ext}`, {
      type: previewMimeRef.current,
    });
    onUse(file, elapsedMs / 1000);
  }, [onUse, elapsedMs]);

  // Auto-stop on unmount via teardown
  // (already covered by useEffect cleanup)

  return (
    <div className="surface space-y-3 p-4 sm:p-5">
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <button
            type="button"
            onClick={start}
            className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
            aria-label={t("start")}
          >
            <Mic className="h-6 w-6" />
          </button>
          <p className="text-xs text-muted-foreground">
            {t("hint", { max: Math.floor(maxSeconds / 60) })}
          </p>
        </div>
      )}

      {phase === "requesting" && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("requesting")}
        </div>
      )}

      {phase === "denied" && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-medium text-destructive">{t("denied")}</p>
            <p className="text-xs text-destructive/80">{t("deniedHint")}</p>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="mt-2 text-xs underline-offset-2 hover:underline"
            >
              {t("tryAgain")}
            </button>
          </div>
        </div>
      )}

      {phase === "recording" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="grid h-2 w-2 place-items-center">
                <span className="absolute h-2 w-2 animate-ping rounded-full bg-red-500/60" />
                <span className="h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t("recording")}
            </span>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {fmtDuration(elapsedMs / 1000)}
            </span>
          </div>
          <div className="overflow-hidden rounded-md border bg-muted/30">
            <canvas
              ref={canvasRef}
              width={800}
              height={120}
              className="h-24 w-full text-primary"
            />
          </div>
          <button
            type="button"
            onClick={stop}
            className="btn btn-primary w-full"
          >
            <Square className="h-4 w-4 fill-current" />
            {t("stop")}
          </button>
        </div>
      )}

      {phase === "preview" && previewUrl && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t("preview")}</span>
            <span className="tabular-nums text-muted-foreground">
              {fmtDuration(elapsedMs / 1000)}
            </span>
          </div>
          <audio src={previewUrl} controls className="w-full" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={retake}
              className="btn btn-outline flex-1"
            >
              <RotateCcw className="h-4 w-4" />
              {t("retake")}
            </button>
            <button
              type="button"
              onClick={use}
              className="btn btn-primary flex-1"
            >
              <Check className="h-4 w-4" />
              {t("use")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Draws a centered, mirrored bar visualization. Most-recent samples are on the
 * right, scrolling left over time. Uses the canvas's offsetWidth for crisp HiDPI.
 */
function renderCanvas(canvas: HTMLCanvasElement | null, history: number[]) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const n = history.length;
  if (n === 0) return;
  const barW = Math.max(2, cssW / n - 2);
  const gap = 2;
  const cy = cssH / 2;
  const maxBar = cssH * 0.85;
  const computed = getComputedStyle(canvas);
  const fg = computed.color || "currentColor";

  for (let i = 0; i < n; i++) {
    const v = history[i];
    const h = Math.max(2, v * maxBar);
    const x = i * (barW + gap) + gap / 2;
    // recent bars more saturated, older bars dim
    const ageRatio = i / (n - 1 || 1);
    ctx.globalAlpha = 0.25 + 0.75 * ageRatio;
    ctx.fillStyle = fg;
    const rounded = Math.min(barW / 2, h / 2);
    drawRoundRect(ctx, x, cy - h / 2, barW, h, rounded);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
