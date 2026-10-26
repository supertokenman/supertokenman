#!/bin/sh
# One-time setup of the voice engine: a private Python environment and the Kokoro model files plus Whisper (about 500 MB).
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
mkdir -p models
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "models/$f" ] || curl -fL --progress-bar -o "models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
done
# Whisper (MIT) for the exact time of every word in the captions, about 140 MB
.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root='models/whisper')"
echo "voice engine ready"
