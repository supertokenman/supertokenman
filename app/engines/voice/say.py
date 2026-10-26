"""SuperToken voice: narration plus the exact time of every word.

  python say.py job.json
job.json: {"provider": "kokoro", "voice": "pf_dora", "speed": 1.05, "out": "/dir",
           "segments": [{"key": "hook", "text": "..."}]}
The language follows the voice (pf_dora: pt-br, af_heart: en-us); "lang" overrides it.
Prints one JSON line per segment: {"key", "file", "seconds", "words": [{"w", "s", "e"}]}, times in
seconds from the start of that segment's audio.

Providers:
  kokoro      local, Apache-2.0, no account (default). Word times come from Whisper (MIT), also local.
  elevenlabs  paid, optional. Needs STM_ELEVENLABS_KEY; word times come back with the audio.
"""
import base64
import difflib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

here = os.path.dirname(os.path.abspath(__file__))
models = os.environ.get('STM_VOICE_MODELS', os.path.join(here, 'models'))


# a Kokoro voice id starts with its language: pf_dora is Brazilian Portuguese, af_heart US English
LANG = {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it', 'p': 'pt-br', 'z': 'cmn'}
WHISPER = {'en-us': 'en', 'en-gb': 'en', 'fr-fr': 'fr', 'cmn': 'zh', 'pt-br': 'pt'}


def norm(w):
    return re.sub(r'[^\w]', '', w.lower())


def align(text, heard):
    """Times for the script's own words (its spelling and punctuation) from what the recogniser heard.
    Words it missed get times interpolated between their neighbours."""
    words = text.split()
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(a=[norm(w) for w in words], b=[norm(h['w']) for h in heard], autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            times[a + k] = (heard[b + k]['s'], heard[b + k]['e'])
    end = heard[-1]['e'] if heard else 0.0
    i = 0
    while i < len(words):
        if times[i]:
            i += 1
            continue
        j = i
        while j < len(words) and not times[j]:
            j += 1
        lo = times[i - 1][1] if i else 0.0
        hi = times[j][0] if j < len(words) else max(end, lo)
        step = (hi - lo) / (j - i)
        for k in range(i, j):
            times[k] = (lo + step * (k - i), lo + step * (k - i + 1))
        i = j
    return [{'w': w, 's': round(s, 3), 'e': round(e, 3)} for w, (s, e) in zip(words, times)]


class Kokoro:
    def __init__(self, job):
        from kokoro_onnx import Kokoro as K
        self.k = K(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
        self.job = job
        self.lang = job.get('lang') or LANG.get(job.get('voice', 'pf_dora')[0], 'pt-br')
        self.whisper = None

    def heard(self, samples, rate):
        import numpy as np
        if self.whisper is None:
            from faster_whisper import WhisperModel
            self.whisper = WhisperModel('base', device='cpu', compute_type='int8', download_root=os.path.join(models, 'whisper'))
        x = np.interp(np.arange(0, len(samples), rate / 16000), np.arange(len(samples)), samples).astype('float32')
        segs, _ = self.whisper.transcribe(x, language=WHISPER.get(self.lang, self.lang[:2]), word_timestamps=True)
        return [{'w': w.word.strip(), 's': w.start, 'e': w.end} for s in segs for w in s.words]

    def say(self, key, text):
        import soundfile as sf
        j = self.job
        samples, rate = self.k.create(text, voice=j.get('voice', 'pf_dora'), speed=float(j.get('speed', 1.0)), lang=self.lang)
        path = os.path.join(j['out'], f'{key}.wav')
        sf.write(path, samples, rate)
        try:
            words = align(text, self.heard(samples, rate))
        except Exception as e:  # no Whisper: the render falls back to spreading words by length
            print(f'word times unavailable: {e}', file=sys.stderr)
            words = []
        return path, len(samples) / rate, words


class ElevenLabs:
    API = os.environ.get('STM_ELEVENLABS_API', 'https://api.elevenlabs.io')

    def __init__(self, job):
        self.key = os.environ.get('STM_ELEVENLABS_KEY', '')
        if not self.key:
            sys.exit('ElevenLabs is not connected: add its key in Accounts.')
        self.job = job

    def say(self, key, text):
        j = self.job
        body = {'text': text, 'model_id': j.get('model', 'eleven_multilingual_v2'), 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75, 'speed': float(j.get('speed', 1.0))}}
        req = urllib.request.Request(f"{self.API}/v1/text-to-speech/{j['voice']}/with-timestamps?output_format=mp3_44100_128", data=json.dumps(body).encode(), headers={'xi-api-key': self.key, 'content-type': 'application/json'})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=120))
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors='replace')[:300]
            sys.exit(f'ElevenLabs refused ({e.code}): {detail}')
        path = os.path.join(j['out'], f'{key}.mp3')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(r['audio_base64']))
        a = r.get('alignment') or {}
        words, cur, s, e = [], '', None, 0.0
        for ch, cs, ce in zip(a.get('characters', []), a.get('character_start_times_seconds', []), a.get('character_end_times_seconds', [])):
            if ch.isspace():
                if cur:
                    words.append({'w': cur, 's': s, 'e': e})
                cur, s = '', None
                continue
            cur += ch
            s = cs if s is None else s
            e = ce
        if cur:
            words.append({'w': cur, 's': s, 'e': e})
        return path, duration(path), align(text, words)


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
    return float(out.strip() or 0)


PROVIDERS = {'kokoro': Kokoro, 'elevenlabs': ElevenLabs}


def main():
    job = json.load(open(sys.argv[1]))
    os.makedirs(job['out'], exist_ok=True)
    p = PROVIDERS[job.get('provider', 'kokoro')](job)
    for seg in job['segments']:
        text = (seg.get('text') or '').strip()
        if not text:
            continue
        path, seconds, words = p.say(seg['key'], text)
        print(json.dumps({'key': seg['key'], 'file': path, 'seconds': round(seconds, 3), 'words': words}), flush=True)


if __name__ == '__main__':
    main()
