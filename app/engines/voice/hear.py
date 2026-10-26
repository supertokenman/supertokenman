"""SuperToken dictation: one recording to text, on this machine.

  python hear.py audio.webm [lang]
Prints one JSON line: {"text": "...", "lang": "pt"}. lang is a Whisper code (pt, en) or empty to detect it.
Nothing leaves the computer: faster-whisper (MIT) with the base model from install.sh.
"""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
models = os.environ.get('STM_VOICE_MODELS', os.path.join(here, 'models'))

from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel('base', device='cpu', compute_type='int8', download_root=os.path.join(models, 'whisper'))
lang = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
segments, info = model.transcribe(sys.argv[1], language=lang, vad_filter=True)
print(json.dumps({'text': ' '.join(s.text.strip() for s in segments).strip(), 'lang': info.language}))
