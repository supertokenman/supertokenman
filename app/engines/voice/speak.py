"""SuperToken read aloud: text to a WAV file with Kokoro, on this machine.

  python speak.py out.wav voice speed < text
The language follows the voice (pf_dora: pt-br). Prints {"file": "...", "seconds": n}.
"""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
models = os.environ.get('STM_VOICE_MODELS', os.path.join(here, 'models'))
LANG = {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it', 'p': 'pt-br', 'z': 'cmn'}

import soundfile as sf  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

out, voice, speed = sys.argv[1], sys.argv[2], float(sys.argv[3])
k = Kokoro(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
samples, rate = k.create(sys.stdin.read(), voice=voice, speed=speed, lang=LANG.get(voice[0], 'en-us'))
sf.write(out, samples, rate)
print(json.dumps({'file': out, 'seconds': len(samples) / rate}))
