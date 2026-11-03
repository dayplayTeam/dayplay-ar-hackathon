/**
 * InputFilterBar — glassmorphic bottom search bar + quick intent chips.
 *
 * Layout (bottom docked, above safe-area bottom inset):
 *   [ 🔍 ai marketing meetups this week      ✕ | ↵ ]
 *   [ ⚡ What's live now ] [ 📅 Happening today ] [ 🎉 … ]
 *
 * Styling: DayPlay dark canon tokens (src/theme/dayplay.ts) — glass
 * surface rgba(28,27,26,0.88), hairline #2A2826 border, coral #FF6B47
 * active chips, muted #A19D97 inactive chips, #F5F4F2 input text.
 *
 * REC VIEW: the parent renders nothing (or a minimal floating pill to
 * re-expand) when `hidden` is true, so screen recording shows a pristine
 * camera viewport.
 */

import { memo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ACCENT_CORAL,
  BORDER,
  RADIUS,
  SURFACE_GLASS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../theme/dayplay.ts";

/** Glass surface for the bottom bar (dark canon at 88%). */
const SURFACE_BAR = "rgba(28,27,26,0.88)";
/** Input placeholder — cool slate gray per spec. */
const PLACEHOLDER = "#64748b";
/** Inactive chip glass tint. */
const CHIP_IDLE_BG = "rgba(255,255,255,0.08)";

export interface InputFilterBarProps {
  /** Currently selected quick-intent chip label, or null for none. */
  activeChip: string | null;
  /** Current free-text search query. */
  searchQuery: string;
  /** Chip tap — same label toggles off, new label selects. */
  onSelectChip: (chip: string | null) => void;
  /** Every keystroke of the search field. */
  onChangeSearchQuery: (query: string) => void;
  /** Submit (enter key or ↵ button). */
  onSubmitQuery: (query: string) => void;
  /** Reset the free-text search back to "". */
  onClearFilter: () => void;
  /** Optional filtered-pin count badge shown inside the bar. */
  resultCount?: number;
  /** When true the bar is hidden (REC VIEW / clean camera viewport). */
  hidden?: boolean;
  /** When true only a minimal floating pill is shown (collapsed). */
  collapsed?: boolean;
  /** Expand from the collapsed pill. */
  onExpand?: () => void;
  /** Preloaded text inside the field (defaults to the demo query). */
  initialQuery?: string;
}

/** Quick intent filter chips, in display order. */
export const QUICK_INTENT_CHIPS: readonly string[] = [
  "⚡ What's live now",
  "📅 Happening today",
  "🎉 Happening this weekend",
  "☕ Coffee & coworking",
  "🍸 Nightlife & lounges",
];

const Chip = memo(function Chip({
  label,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Landscape: tighter chip paddings for the compact bottom bar. */
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, compact ? styles.chipCompact : null, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
});

export default function InputFilterBar({
  activeChip,
  searchQuery,
  onSelectChip,
  onChangeSearchQuery,
  onSubmitQuery,
  onClearFilter,
  resultCount,
  hidden = false,
  collapsed = false,
  onExpand,
  initialQuery = "ai marketing meetups this week",
}: InputFilterBarProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery || initialQuery);
  // Landscape: rotation happens on the fly — re-read the window each render.
  // The bar stays sleek + compact and clears the home indicator / rounded
  // screen corners via the horizontal safe-area insets.
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const sideInset = isLandscape ? Math.max(insets.left, insets.right) : 0;

  if (hidden) return null;

  if (collapsed) {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.collapsedWrap, { left: 16 + sideInset, right: 16 + sideInset }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expand search and filters"
          onPress={onExpand}
          style={styles.collapsedPill}
        >
          <Text style={styles.collapsedPillText}>🔍 Search</Text>
        </Pressable>
      </View>
    );
  }

  const submit = () => onSubmitQuery(localQuery.trim());

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { left: 12 + sideInset, right: 12 + sideInset }]}>
      <View style={[styles.bar, isLandscape ? styles.barCompact : null]}>
        {/* Search row */}
        <View style={styles.inputRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            accessibilityLabel="Search DayPlay pins"
            style={styles.input}
            value={localQuery}
            placeholder={initialQuery}
            placeholderTextColor={PLACEHOLDER}
            onChangeText={setLocalQuery}
            onSubmitEditing={submit}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {localQuery.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                setLocalQuery("");
                onClearFilter();
              }}
              style={styles.iconButton}
            >
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit search"
            onPress={submit}
            style={styles.iconButton}
          >
            <Text style={styles.submitText}>↵</Text>
          </Pressable>
        </View>

        {/* Result count badge */}
        {typeof resultCount === "number" ? (
          <Text style={styles.resultCount}>{resultCount} pins</Text>
        ) : null}

        {/* Quick intent chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {QUICK_INTENT_CHIPS.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              active={activeChip === chip}
              onPress={() => onSelectChip(activeChip === chip ? null : chip)}
              compact={isLandscape}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  /** Landscape: sleek + compact — shorter paddings and smaller type so the
   * bottom bar blocks as little of the short landscape viewport as possible. */
  barCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  bar: {
    backgroundColor: SURFACE_BAR,
    borderColor: BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CHIP_IDLE_BG,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  searchIcon: { fontSize: 14, opacity: 0.85 },
  input: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    padding: 0,
  },
  iconButton: { paddingHorizontal: 4 },
  clearText: { color: TEXT_SECONDARY, fontSize: 14, fontWeight: "700" },
  submitText: { color: ACCENT_CORAL, fontSize: 16, fontWeight: "700" },
  resultCount: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    alignSelf: "flex-end",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  chipCompact: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chip: {
    backgroundColor: CHIP_IDLE_BG,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: ACCENT_CORAL,
    borderColor: ACCENT_CORAL,
  },
  chipText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
  collapsedWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    alignItems: "flex-end",
  },
  collapsedPill: {
    backgroundColor: SURFACE_BAR,
    borderColor: BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  collapsedPillText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: "700",
  },
});
