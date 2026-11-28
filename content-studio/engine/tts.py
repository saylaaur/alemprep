"""Озвучка фраз урока. Провайдер — переменная TTS: none | azure | elevenlabs.
Каждая фраза → content-studio/engine/cache/tts/<hash>.mp3 (повторно не генерируется).
none: аудио нет, длительность оценивается по длине текста (для черновиков без затрат).

Запуск заранее, до рендера:  python3 content-studio/engine/tts.py <storyboard.json> [ru|kk]
Ключи — только в переменных окружения (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, ELEVEN_API_KEY), в git их нет."""
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

CACHE = Path(__file__).parent / "cache" / "tts"
VOICES = {  # можно переопределить: TTS_VOICE_RU / TTS_VOICE_KK
    "azure": {"ru": "ru-RU-DmitryNeural", "kk": "kk-KZ-DauletNeural"},
    "elevenlabs": {"ru": "", "kk": ""},  # voice_id задаётся через env
}
CHARS_PER_SEC = {"ru": 14.0, "kk": 13.0}


def provider() -> str:
    return os.environ.get("TTS", "none")


def voice(lang: str) -> str:
    return os.environ.get(f"TTS_VOICE_{lang.upper()}") or VOICES.get(provider(), {}).get(lang, "")


def key(text: str, lang: str) -> str:
    return hashlib.sha1(f"{provider()}|{voice(lang)}|{lang}|{text}".encode()).hexdigest()[:16]


def path_for(text: str, lang: str) -> Path:
    return CACHE / f"{key(text, lang)}.mp3"


def duration(p: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(out.stdout.strip())


def estimate(text: str, lang: str) -> float:
    return max(1.2, len(text) / CHARS_PER_SEC[lang] + 0.3)


def clip(text: str, lang: str):
    """(путь к mp3 или None, длительность в секундах)."""
    p = path_for(text, lang)
    if provider() != "none" and p.exists():
        return p, duration(p) + 0.25
    return None, estimate(text, lang)


def _ssml(text: str, lang: str) -> bytes:
    loc = {"ru": "ru-RU", "kk": "kk-KZ"}[lang]
    esc = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (f"<speak version='1.0' xml:lang='{loc}'><voice name='{voice(lang)}'>"
            f"<prosody rate='0%'>{esc}</prosody></voice></speak>").encode()


def synth(text: str, lang: str) -> Path:
    p = path_for(text, lang)
    if p.exists():
        return p
    CACHE.mkdir(parents=True, exist_ok=True)
    if provider() == "azure":
        region, k = os.environ["AZURE_SPEECH_REGION"], os.environ["AZURE_SPEECH_KEY"]
        req = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", data=_ssml(text, lang), headers={
            "Ocp-Apim-Subscription-Key": k, "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3", "User-Agent": "alemprep"})
    elif provider() == "elevenlabs":
        body = json.dumps({"text": text, "model_id": os.environ.get("ELEVEN_MODEL", "eleven_v3"), "language_code": lang}).encode()
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice(lang)}?output_format=mp3_44100_128", data=body, headers={
            "xi-api-key": os.environ["ELEVEN_API_KEY"], "Content-Type": "application/json"})
    else:
        raise SystemExit("TTS=none: озвучка не нужна")
    with urllib.request.urlopen(req, timeout=120) as r:
        p.write_bytes(r.read())
    return p


def lines(sb: dict, lang: str):
    for sc in sb["scenes"]:
        for b in sc.get("beats", []):
            s = b.get("say")
            if s:
                yield s[lang] if isinstance(s, dict) else s


if __name__ == "__main__":
    sb = json.load(open(sys.argv[1]))
    langs = sys.argv[2:] or ["ru", "kk"]
    total = 0
    for lang in langs:
        for t in lines(sb, lang):
            total += len(t)
            if provider() != "none":
                synth(t, lang)
    print(f"{sb['id']}: {total} символов озвучки ({', '.join(langs)})")
