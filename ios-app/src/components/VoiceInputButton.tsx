/**
 * VoiceInputButton — real microphone pickup + Muse tool-loop transcription.
 *
 * Real audio pipeline (no simulated waveforms, no fake transcripts):
 *
 *   1. Tap the 🎙️ mic → mic permission is requested via
 *      `Audio.requestPermissionsAsync()` (expo-av).
 *   2. On grant, an `Audio.Recording` starts with
 *      `isMeteringEnabled: true`; the waveform bars are driven by REAL live
 *      audio levels from `recording.getStatusAsync().metering` (dBFS,
 *      −160..0) polled every 100 ms — silence sits low, speech spikes it.
 *   3. "Done speaking" (or Cancel) stops the recorder and grabs the file
 *      URI. The .m4a is uploaded to the backend `POST /transcribe`
 *      (EXPO_PUBLIC_API_URL), which transcribes it with a local whisper.cpp
 *      model and routes the text through the pipeline's Muse/Meta native
 *      tool loop → `{ text, intent, pins }` (gate-verified pins).
 *   4. If the backend is unreachable (demo mode / airplane), the client
 *      transcript is unavailable in Expo Go (no native speech module), so
 *      the preset chips remain as an explicit manual fallback — they route
 *      the same `onVoiceResult(text)` path. A failed upload NEVER invents a
 *      transcript; it surfaces the error and closes the sheet.
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
import { Audio } from "expo-av";

import { transcribeRecording, type VoiceTranscribeResult } from "../data/voiceClient.ts";
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
  const recordingRef = useRef<Audio.Recording | null>(null);
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
  const startMeteringPoll = useCallback((recording: Audio.Recording) => {
    pollTimer.current = setInterval(() => {
      recording
        .getStatusAsync()
        .then((status) => {
          if (status.isRecording && typeof status.metering === "number") {
            setMeteringLevel(status.metering);
          }
        })
        .catch(() => {
          /* transient status errors during recorder teardown — ignore */
        });
    }, METER_POLL_MS);
    maxTimer.current = setTimeout(() => {
      void finishRecording();
    }, MAX_RECORDING_MS);
  }, []);

  /** Stop + unload the recorder, release audio mode, return the file URI. */
  const teardownRecording = useCallback(async (): Promise<string | null> => {
    stopPolling();
    const recording = recordingRef.current;
    recordingRef.current = null;
    let uri: string | null = null;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        /* already stopped / unloaded */
      }
      uri = recording.getURI();
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
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
      if (result.ok) {
        onVoiceResult(result); // full result: text + intent + gate-verified pins
      } else {
        setStatusText(result.error ?? "Voice transcription unavailable");
        setSheetOpen(true); // keep the sheet open so the error is visible
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
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setStatusText("Microphone permission denied — enable it in Settings");
        setPhase("idle");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true, // REAL audio metering for the waveform
        },
        undefined,
        METER_POLL_MS,
      );
      recordingRef.current = recording;
      startMeteringPoll(recording);
    } catch (err) {
      console.warn("voice: failed to start recording", err);
      setStatusText("Could not start the microphone — try again");
      setPhase("idle");
      void teardownRecording();
    }
  }, [startMeteringPoll, teardownRecording]);

  /** Cancel: stop the mic and close — no transcript, no fabricated query. */
  const cancel = useCallback(async () => {
    await teardownRecording();
    setPhase("idle");
    setSheetOpen(false);
    setMeteringLevel(-160);
  }, [teardownRecording]);

  /**
   * Manual preset fallback: same onVoiceResult path as the real pipeline.
   * Presets are the operator's own spoken-intent text (not a fabricated
   * transcription) — delivered with stt_backend "client_text" and no pins,
   * so the parent routes them through the normal text-query filter path.
   */
  const usePreset = useCallback(
    (suggestion: string) => {
      void cancel();
      onVoiceResult({
        ok: true,
        text: suggestion,
        sttBackend: "client_text",
        intent: null,
        pins: [],
        error: null,
      });
    },
    [cancel, onVoiceResult],
  );

  // Unmount cleanup: never leave a recorder or timers running.
  useEffect(
    () => () => {
      stopPolling();
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
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
              {processing ? "Resolving…" : recording ? "Listening…" : "Voice search"}
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
              Or tap a sample voice intent:
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
