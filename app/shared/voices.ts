// Local Kokoro voices by language. The first letter of a voice id names its language; the second
// its gender. Japanese is left out: Kokoro's ONNX build reads it poorly.

export type VoiceLang = { id: string; name: string; kokoro: string; voices: [string, string][] }

export const LANGS: VoiceLang[] = [
  { id: 'p', name: 'Português (BR)', kokoro: 'pt-br', voices: [['pf_dora', 'Dora'], ['pm_alex', 'Alex'], ['pm_santa', 'Santa']] },
  { id: 'a', name: 'English (US)', kokoro: 'en-us', voices: [['af_heart', 'Heart'], ['af_bella', 'Bella'], ['af_nicole', 'Nicole'], ['am_michael', 'Michael'], ['am_fenrir', 'Fenrir'], ['am_puck', 'Puck']] },
  { id: 'b', name: 'English (UK)', kokoro: 'en-gb', voices: [['bf_emma', 'Emma'], ['bf_isabella', 'Isabella'], ['bm_george', 'George'], ['bm_fable', 'Fable']] },
  { id: 'e', name: 'Español', kokoro: 'es', voices: [['ef_dora', 'Dora'], ['em_alex', 'Alex']] },
  { id: 'f', name: 'Français', kokoro: 'fr-fr', voices: [['ff_siwis', 'Siwis']] },
  { id: 'i', name: 'Italiano', kokoro: 'it', voices: [['if_sara', 'Sara'], ['im_nicola', 'Nicola']] },
  { id: 'h', name: 'हिन्दी', kokoro: 'hi', voices: [['hf_alpha', 'Alpha'], ['hm_omega', 'Omega']] },
  { id: 'z', name: '中文', kokoro: 'cmn', voices: [['zf_xiaobei', 'Xiaobei'], ['zm_yunxi', 'Yunxi']] },
]

export const LOCAL_VOICES = LANGS.flatMap((l) => l.voices.map(([id]) => id))
export const langOf = (voice: string) => LANGS.find((l) => l.id === voice[0] && l.voices.some(([v]) => v === voice))
