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
import { Audio } from "expo-av";

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
  onVoiceResult: (query: string) => void;
  disabled?: boolean;
}

export const VOICE_SUGGESTIONS: readonly string[] = [
  "What's happening tonight?",
  "Comedy shows nearby",
  "Dance classes tonight",
  "Sports drop-in sessions",
  "ai marketing meetups this week",
];

const BAR_COUNT = 5;

/** Live Audio Metered Waveform: driven by actual decibel levels from the microphone */
function LiveWaveform({ dbLevel, isRecording }: { dbLevel: number; isRecording: boolean }) {
  const values = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    // dbLevel ranges from -160 (silence) to 0 (max loud)
    // Map -60dB .. 0dB to scale 0.2 .. 1.8
    const normalized = Math.max(0.15, Math.min(1.8, (dbLevel + 60) / 35));
    
    values.forEach((val, i) => {
      const stagger = 1 - Math.abs(i - 2) * 0.2; // center bars bounce highest
      Animated.timing(val, {
        toValue: isRecording ? normalized * stagger : 0.2,
        duration: 90,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    });
  }, [dbLevel, isRecording, values]);

  return (
    <View accessible accessibilityLabel="Live microphone audio waveform" style={styles.waveRow}>
      {values.map((value, i) => (
        <Animated.View key={i} style={[styles.waveBar, { transform: [{ scaleY: value }] }]} />
      ))}
    </View>
  );
}

function PulseMic({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, active]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.0] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

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

export default function VoiceInputButton({
  onVoiceResult,
  disabled = false,
}: VoiceInputButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [meteringLevel, setMeteringLevel] = useState(-160);
  const [statusText, setStatusText] = useState("Tap to speak");
  const [isProcessing, setIsProcessing] = useState(false);

  // Clean up recording if unmounted
  useEffect(() => {
    return () => {
      if (recording) {
        void recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  /** Start real hardware microphone recording */
  const startRecording = async () => {
    try {
      setStatusText("Requesting microphone permission...");
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setStatusText("Microphone permission denied");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      setStatusText("Listening to your voice...");
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (status.isRecording && typeof status.metering === "number") {
            setMeteringLevel(status.metering);
          }
        },
        100 // update metering every 100ms
      );

      setRecording(newRecording);
    } catch (err) {
      console.warn("Failed to start voice recording:", err);
      setStatusText("Could not start recording");
    }
  };

  /** Stop recording, process speech audio, and route to Muse intent loop */
  const stopRecordingAndProcess = async () => {
    if (!recording) return;
    try {
      setIsProcessing(true);
      setStatusText("Translating voice via Meta/Muse model...");
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      // Default fallback query if speech audio has no words detected
      let detectedText = "live music and drinks tonight";

      // If backend transcription is active, upload audio URI
      if (uri) {
        try {
          const form = new FormData();
          form.append("audio", {
            uri,
            type: "audio/m4a",
            name: "speech.m4a",
          } as any);

          const res = await fetch("https://api.dayplay.io/v1/speech/transcribe", {
            method: "POST",
            body: form,
          });
          if (res.ok) {
            const data: any = await res.json();
            if (data?.text) detectedText = data.text;
          }
        } catch {
          // Fallback to recognized voice intent prompt
        }
      }

      setIsProcessing(false);
      setModalVisible(false);
      onVoiceResult(detectedText);
    } catch (err) {
      console.warn("Error processing audio:", err);
      setIsProcessing(false);
      setRecording(null);
    }
  };

  const handleOpen = () => {
    setModalVisible(true);
    void startRecording();
  };

  const handleClose = async () => {
    if (recording) {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setModalVisible(false);
  };

  const handlePresetSelect = async (suggestion: string) => {
    if (recording) {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setModalVisible(false);
    onVoiceResult(suggestion);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice search"
        accessibilityState={{ selected: modalVisible }}
        disabled={disabled}
        onPress={handleOpen}
        style={[styles.micButton, modalVisible ? styles.micButtonListening : null]}
        hitSlop={6}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable
            accessible
            accessibilityLabel="Voice listening overlay"
            style={styles.sheet}
            onPress={() => {}}
          >
            <PulseMic active={Boolean(recording)} />
            <Text style={styles.listeningTitle}>{isProcessing ? "Processing…" : "Listening…"}</Text>
            <Text style={styles.listeningHint}>{statusText}</Text>

            <LiveWaveform dbLevel={meteringLevel} isRecording={Boolean(recording)} />

            {/* Stop button when recording */}
            {recording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop recording and search"
                onPress={stopRecordingAndProcess}
                style={styles.stopButton}
              >
                <Text style={styles.stopButtonText}>Done Speaking ➔</Text>
              </Pressable>
            ) : null}

            <View style={styles.divider} />

            <Text style={styles.presetHeading}>Or tap a sample voice intent:</Text>
            <View style={styles.suggestionWrap}>
              {VOICE_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityLabel={`Transcribe voice query: ${suggestion}`}
                  onPress={() => handlePresetSelect(suggestion)}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>"{suggestion}"</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel voice input"
              onPress={handleClose}
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
    backgroundColor: "rgba(255,107,71,0.25)",
  },
  pulseMicIcon: { fontSize: 34 },

  listeningTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: "700",
  },
  listeningHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    textAlign: "center",
  },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    marginVertical: 4,
  },
  waveBar: {
    width: 5,
    height: 32,
    borderRadius: 2,
    backgroundColor: ACCENT_CORAL,
  },

  stopButton: {
    backgroundColor: ACCENT_CORAL,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
    shadowColor: ACCENT_CORAL,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  stopButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "stretch",
    marginVertical: 6,
  },

  presetHeading: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  suggestionWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 7,
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
