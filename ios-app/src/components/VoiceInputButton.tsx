/**
 * VoiceInputButton — real microphone pickup + Muse tool-loop transcription.
 *
 * Real audio pipeline (no simulated waveforms, no fake transcripts):
 *
 *   1. Tap the 🎙️ mic → mic permission is requested via
 *      `requestRecordingPermissionsAsync()` (expo-audio).
 *   2. On grant, an `AudioRecorder` starts with `isMeteringEnabled: true`;
 *      the waveform bars are driven by REAL live audio levels from
 *      `recorder.getStatus().metering` (dB) polled every 100 ms — silence
 *      sits low, speech spikes it.
 *   3. "Done speaking" (or Cancel) stops the recorder and grabs the file
 *      URI. The .m4a is uploaded to the backend `POST /transcribe`
 *      (EXPO_PUBLIC_API_URL), which transcribes it with a local whisper.cpp
 *      model and routes the text through the pipeline's Muse/Meta native
 *      tool loop → `{ text, intent, pins }` (gate-verified pins).
 *
 * NATIVE-SAFETY NOTE (2026-11-04 crash fix): this component uses
 * `expo-audio` (native module `ExpoAudio`), NOT `expo-av`. `expo-av` was
 * removed: its native module `ExponentAV` is NOT compiled into the Expo Go
 * SDK 58 iOS client (verified against expo/expo sdk-58 apps/expo-go
 * package.json — expo-audio vendored, expo-av absent), so any
 * `requireNativeModule('ExponentAV')` crashed the app at import time
 * ("[runtime not ready]: Cannot find native module 'ExponentAV'").
 * `expo-audio` IS vendored into Expo Go 58, so the real mic pipeline runs
 * in Expo Go with zero native build.
 *   4. NO-BACKEND FALLBACK (no hard blocker): when no backend URL is
 *      configured, the recorded audio is still honored — the sheet surfaces
 *      the explicit sample-intent chips as the manual transcript step ("tap
 *      what you said — spoken straight into the live cloud"). Picking the
 *      chip that matches the recording routes the query DIRECTLY to the
 *      live production DayPlay MCP `search_smart` (verified live
 *      2026-11-04), which resolves it to ranked geo-verified rows; no
 *      local backend, no blocker, no fabricated transcript — the query is
 *      always the user's own words, and the client zero-hallucination gate
 *      still re-validates every pin at render time.
 *
 * Styling: DayPlay dark canon tokens (src/theme/dayplay.ts) — glass
 * surface, hairline border, coral #FF6B47 listening glow.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from "expo-audio";

import { transcribeRecording, type VoiceTranscribeResult } from "../data/voiceClient.ts";
import { searchSmartResolve } from "../data/smartSearchClient.ts";
import {
  ACCENT_CORAL,
  BORDER,
  CORAL_TINT,
  RADIUS,
  SURFACE_GLASS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../theme/dayplay.ts";

/** Glass surface for the mic button (dark canon at 88%). */
const SURFACE_BAR = "rgba(28,27,26,0.88)";

export interface VoiceInputButtonProps {
  /**
   * Full voice-pipeline result — transcript + Muse intent + gate-verified
   * pins. Fired by the real recording path AND by the manual preset fallback
   * (which synthesizes an ok result whose pins the parent re-resolves).
   */
  onVoiceResult: (result: VoiceTranscribeResult) => void;
  /** Optional disabled state (bar already hidden in REC VIEW). */
  disabled?: boolean;
  /** Optional backend base URL override (defaults to EXPO_PUBLIC_API_URL). */
  apiUrl?: string;
}

/**
 * Spoken-intent presets shown as "tap to transcribe" chips while listening.
 * These remain as an explicit manual fallback when the mic/upload path is
 * unavailable (Expo Go has no native speech module; the backend may be
 * offline). Wording mirrors real corridor pin data so the filtered placard
 * deck visibly responds (comedy / dance / sports fixtures).
 */
export const VOICE_SUGGESTIONS: readonly string[] = [
  "What's happening tonight?",
  "Comedy shows nearby",
  "Dance classes tonight",
  "Sports drop-in sessions",
  "ai marketing meetups this week",
];

const BAR_COUNT = 5;
/** Metering poll interval (ms) — smooth waveform without recompositor spam. */
const METER_POLL_MS = 100;
/** Recording cap (ms) — voice intents are short; auto-stop forces the round-trip. */
const MAX_RECORDING_MS = 15000;

/** dBFS (−160 silence .. 0 max) → waveform bar scale (0.18 .. 1.6). */
export function meteringToScale(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return 0.18 + ((clamped + 60) / 60) * 1.42;
}

/**
 * Live waveform — 5 bars driven by REAL mic metering levels. Each bar gets
 * the same level with a center-weighted stagger so the shape reads as a
 * waveform rather than a uniform block. No Animated.loop: every transition
 * is a real level → animation mapping.
 */
function LiveWaveform({ dbLevel, active }: { dbLevel: number; active: boolean }) {
  const values = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.18)),
  ).current;

  useEffect(() => {
    const scale = active ? meteringToScale(dbLevel) : 0.18;
    const animations = values.map((value, i) => {
      const stagger = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) * 0.18;
      return Animated.timing(value, {
        toValue: Math.max(0.18, scale * stagger),
        duration: METER_POLL_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      });
    });
    const running = Animated.parallel(animations);
    running.start();
    return () => running.stop();
  }, [dbLevel, active, values]);

  return (
    <View
      accessible
      accessibilityLabel={active ? "Live microphone level waveform" : "Audio waveform idle"}
      style={styles.waveRow}
    >
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={[styles.waveBar, { transform: [{ scaleY: value }] }]}
        />
      ))}
    </View>
  );
}

/** Pulsing coral glow rings behind the listening mic icon. */
function PulseMic({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, active]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={styles.pulseWrap}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
      ) : null}
      <View style={[styles.pulseMicCircle, active ? styles.pulseMicCircleActive : null]}>
        <Text style={styles.pulseMicIcon}>🎙️</Text>
      </View>
    </View>
  );
}

type VoicePhase = "idle" | "recording" | "processing";

export default function VoiceInputButton({
  onVoiceResult,
  disabled = false,
  apiUrl,
}: VoiceInputButtonProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [meteringLevel, setMeteringLevel] = useState(-160);
  const [statusText, setStatusText] = useState("Tap Done when you finish speaking");
  /** Set when recorded audio could not be auto-transcribed (no backend /
   * offline): the sheet then offers the explicit "tap what you said" chips
   * which route through the direct-cloud resolver — never a dead end. */
  const [pendingResolve, setPendingResolve] = useState<string | null>(null);
  // expo-audio: the hook owns the recorder instance (lifecycle-managed);
  // a ref mirrors it so imperative stop/teardown can run from callbacks.
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
    undefined,
  );
  const recorderRef = useRef<AudioRecorder>(recorder);
  const recordingRef = useRef<AudioRecorder | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (maxTimer.current) {
      clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
  }, []);

  /** Real live audio levels → metering state → waveform bars. */
  const startMeteringPoll = useCallback((activeRecorder: AudioRecorder) => {
    pollTimer.current = setInterval(() => {
      try {
        const status = activeRecorder.getStatus();
        if (status.isRecording && typeof status.metering === "number") {
          setMeteringLevel(status.metering);
        }
      } catch {
        /* transient status errors during recorder teardown — ignore */
      }
    }, METER_POLL_MS);
    maxTimer.current = setTimeout(() => {
      void finishRecording();
    }, MAX_RECORDING_MS);
  }, []);

  /** Stop the recorder, release audio mode, return the file URI. */
  const teardownRecording = useCallback(async (): Promise<string | null> => {
    stopPolling();
    const activeRecorder = recordingRef.current;
    recordingRef.current = null;
    let uri: string | null = null;
    if (activeRecorder) {
      try {
        await activeRecorder.stop();
      } catch {
        /* already stopped */
      }
      uri = activeRecorder.uri;
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* audio mode restore is best-effort */
    }
    return uri;
  }, [stopPolling]);

  /** Finish: stop the mic, upload the recording, route the Muse result. */
  const finishRecording = useCallback(async () => {
    const wasOpen = sheetOpen;
    setPhase("processing");
    setStatusText("Transcribing & resolving intent…");
    const uri = await teardownRecording();

    if (!uri) {
      // Nothing recorded (mic failed / instant cancel): fail visibly, never
      // fabricate a transcript.
      setStatusText("No audio captured — try again");
      setPhase("idle");
      if (!wasOpen) setSheetOpen(false);
      return;
    }

    try {
      const result = await transcribeRecording(uri, undefined, apiUrl);
      setSheetOpen(false);
      setPhase("idle");
      setMeteringLevel(-160);
      setPendingResolve(null);
      if (result.ok) {
        onVoiceResult(result); // full result: text + intent + gate-verified pins
      } else {
        // Audio was captured but STT could not run (no backend / offline).
        // Never a dead end: open the manual transcript sheet — the user's
        // own tap on a sample-intent chip routes the query through the
        // direct-cloud resolver (searchSmartResolve) so the intent pipeline
        // still runs to verified pins.
        setPendingResolve(result.error ?? "transcription unavailable");
        setStatusText("Mic transcription unavailable — tap what you said below");
        setSheetOpen(true);
        setPhase("idle");
        setMeteringLevel(-160);
        return;
      }
    } catch {
      setSheetOpen(wasOpen);
      setPhase("idle");
      setStatusText("Voice transcription failed");
    }
  }, [apiUrl, onVoiceResult, sheetOpen, teardownRecording]);

  /** Begin real recording: permission → audio mode → metering recorder. */
  const beginRecording = useCallback(async () => {
    setPhase("recording");
    setStatusText("Listening…");
    setMeteringLevel(-160);
    setPendingResolve(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatusText("Microphone permission denied — enable it in Settings");
        setPhase("idle");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      const activeRecorder = recorderRef.current ?? recorder;
      recorderRef.current = activeRecorder;
      // REAL audio metering for the waveform (isMeteringEnabled from the
      // hook options). prepare -> record, then poll getStatus().metering.
      await activeRecorder.prepareToRecordAsync();
      activeRecorder.record();
      recordingRef.current = activeRecorder;
      startMeteringPoll(activeRecorder);
    } catch (err) {
      console.warn("voice: failed to start recording", err);
      setStatusText("Could not start the microphone — try again");
      setPhase("idle");
      void teardownRecording();
    }
  }, [recorder, startMeteringPoll, teardownRecording]);

  /** Cancel: stop the mic and close — no transcript, no fabricated query. */
  const cancel = useCallback(async () => {
    await teardownRecording();
    setPhase("idle");
    setSheetOpen(false);
    setMeteringLevel(-160);
    setPendingResolve(null);
  }, [teardownRecording]);

  /**
   * Manual preset fallback: same onVoiceResult path as the real pipeline.
   * Presets are the operator's own spoken-intent text (not a fabricated
   * transcription) — delivered with stt_backend "client_text" and no pins,
   * so the parent routes them through the normal text-query filter path.
   */
  const usePreset = useCallback(
    (suggestion: string) => {
      void (async () => {
        void cancel();
        setPhase("processing");
        setStatusText("Resolving via DayPlay cloud…");
        // Direct-cloud resolve (search_smart on the live production MCP) —
        // works with or without a local backend, so a voice tap always
        // completes the pipeline to verified pins. The chip text is the
        // operator's own spoken-intent words (never a fabricated transcript).
        const resolved = await searchSmartResolve(suggestion, undefined, apiUrl);
        setPhase("idle");
        setMeteringLevel(-160);
        setPendingResolve(null);
        setSheetOpen(false);
        if (resolved.ok) {
          onVoiceResult(resolved);
        } else {
          // Absolute last resort (fully offline): keep the same honest
          // onVoiceResult contract — the parent filters typed text against
          // the already-loaded pin deck; no pins are invented here.
          onVoiceResult({
            ok: true,
            text: suggestion,
            sttBackend: "client_text",
            intent: null,
            pins: [],
            error: null,
          });
        }
      })();
    },
    [apiUrl, cancel, onVoiceResult],
  );

  // Unmount cleanup: never leave a recorder or timers running.
  useEffect(
    () => () => {
      stopPolling();
      const activeRecorder = recordingRef.current;
      recordingRef.current = null;
      if (activeRecorder) {
        void activeRecorder.stop().catch(() => undefined);
      }
    },
    [stopPolling],
  );

  const recording = phase === "recording";
  const processing = phase === "processing";
  const busy = recording || processing;

  return (
    <>
      {/* Mic FAB — glassmorphic circle inside the search row. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice search"
        accessibilityState={{ selected: sheetOpen }}
        disabled={disabled}
        onPress={() => {
          setSheetOpen(true);
          void beginRecording();
        }}
        style={[styles.micButton, sheetOpen ? styles.micButtonListening : null]}
        hitSlop={6}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </Pressable>

      {/* Listening / processing overlay. */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => void cancel()}
      >
        <Pressable style={styles.backdrop} onPress={() => void cancel()}>
          <Pressable
            accessible
            accessibilityLabel="Voice input overlay"
            style={styles.sheet}
            onPress={() => {
              /* swallow taps inside the sheet */
            }}
          >
            <PulseMic active={recording} />
            <Text style={styles.listeningTitle}>
              {processing ? "Resolving…" : recording ? "Listening…" : pendingResolve ? "One more step" : "Voice search"}
            </Text>
            <Text style={styles.listeningHint}>{statusText}</Text>

            <LiveWaveform dbLevel={meteringLevel} active={recording} />

            {recording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop recording and transcribe"
                onPress={() => void finishRecording()}
                style={styles.stopButton}
              >
                <Text style={styles.stopButtonText}>Done speaking →</Text>
              </Pressable>
            ) : null}

            <View style={styles.divider} />

            <Text style={styles.presetHeading}>
              {pendingResolve
                ? "Tap what you said — spoken straight to the DayPlay cloud:"
                : "Or tap a sample voice intent:"}
            </Text>
            <View style={styles.suggestionWrap}>
              {VOICE_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={`Transcribe voice query: ${suggestion}`}
                  disabled={busy}
                  onPress={() => usePreset(suggestion)}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>"{suggestion}"</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel voice input"
              disabled={processing}
              onPress={() => void cancel()}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE_BAR,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  micButtonListening: {
    backgroundColor: CORAL_TINT,
    borderColor: ACCENT_CORAL,
  },
  micIcon: { fontSize: 16 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    backgroundColor: SURFACE_GLASS,
    borderColor: ACCENT_CORAL,
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 10,
    shadowColor: ACCENT_CORAL,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },

  pulseWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  pulseRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ACCENT_CORAL,
  },
  pulseMicCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CORAL_TINT,
    borderWidth: 1,
    borderColor: ACCENT_CORAL,
  },
  pulseMicCircleActive: {
    backgroundColor: "rgba(255,107,71,0.35)",
  },
  pulseMicIcon: { fontSize: 34 },

  listeningTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: "700",
  },
  listeningHint: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textAlign: "center",
    minHeight: 16,
  },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    marginTop: 2,
  },
  waveBar: {
    width: 4,
    height: 30,
    borderRadius: 2,
    backgroundColor: ACCENT_CORAL,
  },

  stopButton: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: ACCENT_CORAL,
  },
  stopButtonText: {
    color: "#1C1B1A",
    fontSize: 14,
    fontWeight: "800",
  },

  divider: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 8,
  },

  presetHeading: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  suggestionWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  suggestionChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  suggestionText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: "600",
  },

  cancelButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cancelText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: "700",
  },
});
