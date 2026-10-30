"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType } from "@zxing/library";
import { getTranslator } from "@/i18n";
import { normalizeBarcode } from "@/lib/barcode";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

type ScannerStatus = "starting" | "scanning" | "error";

type ScannerErrorKey =
  | "scanner.insecure"
  | "scanner.unsupported"
  | "scanner.permissionDenied"
  | "scanner.noCamera"
  | "scanner.error";

function releaseVideo(video: HTMLVideoElement | null): void {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (video) video.srcObject = null;
}

function isConstraintFailure(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "OverconstrainedError" ||
    error.name === "ConstraintNotSatisfiedError"
  );
}

function describeCameraError(error: unknown): ScannerErrorKey {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    ) {
      return "scanner.permissionDenied";
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      return "scanner.noCamera";
    }
    if (error.name === "NotSupportedError") {
      return "scanner.unsupported";
    }
  }
  return "scanner.error";
}

/** A short confirmation tone; best effort because iOS may mute it. */
function scanFeedback(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    // Sound is a nicety; camera scanning still works without it.
  }
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(60);
  } catch {
    // Vibration is optional.
  }
}

export function BarcodeScanner({
  language,
  onDetected,
  onClose,
}: {
  language: Language;
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const t = getTranslator(language);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [errorKey, setErrorKey] = useState<ScannerErrorKey | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let localControls: IScannerControls | null = null;
    handledRef.current = false;

    void (async () => {
      // Yield once so the effect has installed its cleanup before the camera
      // status changes; this also keeps camera startup out of render.
      await Promise.resolve();
      if (cancelled) return;
      setStatus("starting");
      setErrorKey(null);
      setTorchAvailable(false);
      setTorchOn(false);

      if (!window.isSecureContext) {
        setErrorKey("scanner.insecure");
        setStatus("error");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorKey("scanner.unsupported");
        setStatus("error");
        return;
      }

      try {
        const zxing = await import("@zxing/browser");
        if (cancelled) return;

        const hints = new Map<DecodeHintType, boolean>();
        const { DecodeHintType } = await import("@zxing/library");
        if (cancelled) return;
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new zxing.BrowserMultiFormatReader(
          hints,
          {
            delayBetweenScanAttempts: 220,
            delayBetweenScanSuccess: 1000,
            tryPlayVideoTimeout: 15_000,
          },
        );
        reader.possibleFormats = [
          zxing.BarcodeFormat.EAN_13,
          zxing.BarcodeFormat.EAN_8,
          zxing.BarcodeFormat.UPC_A,
          zxing.BarcodeFormat.UPC_E,
          zxing.BarcodeFormat.CODE_128,
        ];

        const onDecode = (
          result?: { getText: () => string },
          _error?: unknown,
          controls?: IScannerControls,
        ) => {
          if (cancelled || handledRef.current || !result) return;
          const code = normalizeBarcode(result.getText());
          if (!code) return;
          handledRef.current = true;
          controls?.stop();
          localControls?.stop();
          controlsRef.current?.stop();
          controlsRef.current = null;
          streamRef.current = null;
          releaseVideo(video);
          scanFeedback();
          onDetectedRef.current(code);
        };

        const primaryConstraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        let controls: IScannerControls;
        try {
          controls = await reader.decodeFromConstraints(
            primaryConstraints,
            video,
            onDecode,
          );
        } catch (error) {
          if (cancelled) return;
          if (!isConstraintFailure(error)) throw error;
          // Some phones reject facingMode or a requested resolution. A plain
          // camera request is better than refusing to scan at all.
          controls = await reader.decodeFromConstraints(
            { audio: false, video: true },
            video,
            onDecode,
          );
        }

        if (cancelled) {
          controls.stop();
          releaseVideo(video);
          return;
        }
        localControls = controls;
        controlsRef.current = controls;
        const stream =
          video.srcObject instanceof MediaStream ? video.srcObject : null;
        streamRef.current = stream;
        if (stream) {
          setTorchAvailable(
            zxing.BrowserCodeReader.mediaStreamIsTorchCompatible(stream),
          );
        }
        setStatus("scanning");
      } catch (error) {
        if (cancelled) return;
        releaseVideo(video);
        setErrorKey(describeCameraError(error));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      localControls?.stop();
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current = null;
      releaseVideo(video);
    };
  }, [attempt, facingMode]);

  async function toggleTorch(): Promise<void> {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const { BrowserCodeReader } = await import("@zxing/browser");
      await BrowserCodeReader.mediaStreamSetTorch(track, !torchOn);
      setTorchOn((value) => !value);
    } catch {
      setTorchAvailable(false);
      setTorchOn(false);
    }
  }

  function retry(): void {
    setErrorKey(null);
    setStatus("starting");
    setAttempt((value) => value + 1);
  }

  function switchCamera(): void {
    setErrorKey(null);
    setStatus("starting");
    setTorchAvailable(false);
    setTorchOn(false);
    setFacingMode((value) =>
      value === "environment" ? "user" : "environment",
    );
  }

  return (
    <section className="barcode-scanner" aria-label={t("scanner.title")}>
      <div className="barcode-scanner-head">
        <div>
          <strong>{t("scanner.title")}</strong>
          <p className="field-hint">{t("scanner.hint")}</p>
        </div>
        <button
          type="button"
          className="icon-button small ghost"
          onClick={onClose}
          aria-label={t("scanner.close")}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        className={`barcode-video-panel ${status === "error" ? "has-error" : ""}`}
      >
        <video
          ref={videoRef}
          className="barcode-video"
          autoPlay
          muted
          playsInline
          aria-label={t("scanner.title")}
        />
        {status === "scanning" ? (
          <div className="barcode-reticle" aria-hidden="true">
            <span />
          </div>
        ) : null}
        {status !== "scanning" ? (
          <div
            className={`barcode-overlay ${status === "error" ? "error" : ""}`}
            role={status === "error" ? "alert" : "status"}
          >
            {status === "starting" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>{t("scanner.starting")}</span>
              </>
            ) : (
              <>
                <Icon name="alert" size={22} />
                <p>{t(errorKey ?? "scanner.error")}</p>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={retry}
                >
                  {t("scanner.retry")}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="barcode-scanner-actions">
        {torchAvailable && status === "scanning" ? (
          <button
            type="button"
            className="button ghost small"
            onClick={() => void toggleTorch()}
            aria-pressed={torchOn}
          >
            <Icon name="sun" size={16} />
            {torchOn ? t("scanner.torchOff") : t("scanner.torchOn")}
          </button>
        ) : null}
        {status === "scanning" ? (
          <button
            type="button"
            className="button ghost small"
            onClick={switchCamera}
          >
            <Icon name="repeat" size={16} />
            {t("scanner.switchCamera")}
          </button>
        ) : null}
        <button type="button" className="button ghost small" onClick={onClose}>
          {t("scanner.manual")}
        </button>
      </div>
      <p className="source-note">{t("scanner.note")}</p>
    </section>
  );
}
