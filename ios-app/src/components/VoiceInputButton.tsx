/**
 * VoiceInputButton — glassmorphic mic FAB + "Listening…" voice overlay.
 *
 * Expo Go-safe by design: the Expo Go runtime cannot link external native
 * speech modules (@react-native-voice/voice requires a custom dev build),
 * so this component delivers the full voice-intent UX with pure React
 * Native primitives (Animated + Modal — no native build step):
 *
 *   1. Tap the 🎙️ mic (in the search bar or as a floating FAB) →
 *      a "Listening…" overlay springs up: pulsing coral mic, animated
 *      audio waveform, glowing coral border.
 *   2. A set of spoken-intent presets ("tap to transcribe") simulates
 *      the recognition pass — in Expo Go these are preloaded voice
 *      prompts matched to the Mission corridor fixture data.
 *   3. Selecting a preset routes the recognized text through
 *      `onChangeSearchQuery` + auto-submits via `onSubmitQuery`, which
 *      drives the spatial placard filter engine + HUD in real time.
 *
 * Styling: DayPlay dark canon tokens (src/theme/dayplay.ts) — glass
 * surface, hairline border, coral #FF6B47 listening glow.
 */

import { useEffect, useRef, useState } from "react";
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
   * Recognized (simulated in Expo Go) voice query — the parent routes it
   * into the search query stream and auto-submits the filter.
   */
  onVoiceResult: (query: string) => void;
  /** Optional disabled state (bar already hidden in REC VIEW). */
  disabled?: boolean;
}

/**
 * Spoken-intent presets shown as "tap to transcribe" chips while
 * listening. Wording mirrors real corridor pin data so the filtered
 * placard deck visibly responds (comedy / dance / sports fixtures).
 */
export const VOICE_SUGGESTIONS: readonly string[] = [
  "What's happening tonight?",
  "Comedy shows nearby",
  "Dance classes tonight",
  "Sports drop-in sessions",
  "ai marketing meetups this week",
];

/** Animated audio waveform — 5 bars scaling on staggered sine-ish loops. */
const BAR_COUNT = 5;
function Waveform() {
  const values = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 280 + i * 80,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: 280 + i * 80,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [values]);

  return (
    <View
      accessible
      accessibilityLabel="Audio waveform — microphone listening"
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
function PulseMic() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
      />
      <View style={styles.pulseMicCircle}>
        <Text style={styles.pulseMicIcon}>🎙️</Text>
      </View>
    </View>
  );
}

export default function VoiceInputButton({
  onVoiceResult,
  disabled = false,
}: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);

  /** Simulated recognition pass: route text and auto-submit, close overlay. */
  const transcribe = (query: string) => {
    setListening(false);
    onVoiceResult(query);
  };

  return (
    <>
      {/* Mic FAB — glassmorphic circle inside the search row. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice search"
        accessibilityState={{ selected: listening }}
        disabled={disabled}
        onPress={() => setListening(true)}
        style={[styles.micButton, listening ? styles.micButtonListening : null]}
        hitSlop={6}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </Pressable>

      {/* Listening overlay / sheet. */}
      <Modal
        visible={listening}
        transparent
        animationType="fade"
        onRequestClose={() => setListening(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setListening(false)}>
          <Pressable
            accessible
            accessibilityLabel="Voice listening overlay"
            style={styles.sheet}
            onPress={() => {
              /* swallow taps inside the sheet */
            }}
          >
            <PulseMic />
            <Text style={styles.listeningTitle}>Listening…</Text>
            <Text style={styles.listeningHint}>
              Say a voice intent — or tap to transcribe
            </Text>

            <Waveform />

            <View style={styles.suggestionWrap}>
              {VOICE_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={`Transcribe voice query: ${suggestion}`}
                  onPress={() => transcribe(suggestion)}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>"{suggestion}"</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel voice input"
              onPress={() => setListening(false)}
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

  suggestionWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
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
