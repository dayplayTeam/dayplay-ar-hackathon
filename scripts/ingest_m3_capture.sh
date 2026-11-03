#!/usr/bin/env bash
# Ingest and normalize raw physical iPhone screen capture for Milestone M3 (feeds T5b demo video)
set -euo pipefail

RAW_INPUT="${1:-}"
if [ -z "$RAW_INPUT" ]; then
  echo "Usage: $0 <path_to_raw_iphone_screen_recording.mov_or_mp4>"
  exit 1
fi

if [ ! -f "$RAW_INPUT" ]; then
  echo "Error: Input file '$RAW_INPUT' not found."
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPTURES_DIR="$ROOT/ops/hackathon/captures"
OUTPUT_FILE="$CAPTURES_DIR/m3-corridor-iphone-capture.mp4"
mkdir -p "$CAPTURES_DIR"

echo "=== Milestone M3 iPhone Video Ingestion ==="
echo "Source: $RAW_INPUT"
echo "Target: $OUTPUT_FILE"

# Probe input file
if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg is required but not installed."
  exit 1
fi

DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$RAW_INPUT" | cut -d. -f1)
echo "Detected duration: ${DURATION}s"

if [ "$DURATION" -lt 15 ]; then
  echo "Warning: Video is under 15 seconds. Recommended demo duration is 60-90s."
fi

# Transcode to standard high-compatibility 1080x1920 (9:16 portrait) @ 60fps
echo "Transcoding to 1080x1920 portrait @ 60fps (libx264 yuv420p)..."
ffmpeg -y -i "$RAW_INPUT"   -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"   -c:v libx264 -preset medium -crf 19 -r 60 -pix_fmt yuv420p   -an   "$OUTPUT_FILE"

FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE")
echo "Transcoding complete!"
echo "Saved to: $OUTPUT_FILE"
echo "File size: $((FILE_SIZE / 1024 / 1024)) MB"
echo "Ready for T5b judging video montage."
