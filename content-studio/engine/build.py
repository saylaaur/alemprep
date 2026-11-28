"""Конвейер: сценарий → озвучка → видео ru и kk → постер → лист кадров для проверки.

    python3 content-studio/engine/build.py uniform-motion            # один урок, оба языка, 720p
    python3 content-studio/engine/build.py --all -j 2                  # все сценарии из lessons/
    python3 content-studio/engine/build.py uniform-motion --lang kk --draft   # быстро, 480p, для проверки

Готовое: public/lessons/<id>.mp4 (ru), public/lessons/<id>.kk.mp4, <id>.jpg — постер,
content-studio/engine/out/<id>.<lang>.png — лист кадров (каждые 5 с) для быстрой проверки глазами.
Голос: TTS=azure|elevenlabs (ключи в env, см. tts.py); без TTS — немое видео с субтитрами и оценочными паузами."""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
LESSONS = HERE / "lessons"
OUT = HERE / "out"
PUBLIC = ROOT / "public" / "lessons"


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        tail = "\n".join((r.stdout + r.stderr).splitlines()[-25:])
        raise RuntimeError(f"{' '.join(map(str, cmd[:3]))} …\n{tail}")
    return r


def check(sb: dict):
    """Сценарий без ошибок: у каждой фразы есть оба языка, типы сцен известны."""
    sys.path.insert(0, str(HERE))
    known = {"title", "text", "bullets", "formula", "example", "graph", "forces", "numberline", "table", "code", "geometry", "quiz", "summary", "outro", "motion"}
    errs = []
    for i, sc in enumerate(sb["scenes"]):
        if sc["type"] not in known:
            errs.append(f"сцена {i}: неизвестный тип {sc['type']}")
        for j, b in enumerate(sc.get("beats", [])):
            s = b.get("say")
            if isinstance(s, dict) and not (s.get("ru") and s.get("kk")):
                errs.append(f"сцена {i}, шаг {j}: нет ru или kk в say")
    if errs:
        raise SystemExit("\n".join(errs))


def render(lesson_id: str, lang: str, draft: bool) -> Path:
    sb_path = LESSONS / f"{lesson_id}.json"
    media = Path(tempfile.mkdtemp(prefix=f"m_{lesson_id}_{lang}_"))
    env = {**os.environ, "LESSON": str(sb_path), "LESSON_LANG": lang}
    q = "-ql" if draft else "-qm"
    t0 = time.time()
    run(["manim", q, "--media_dir", str(media), "-o", f"{lesson_id}_{lang}", "--disable_caching", str(HERE / "lesson.py"), "Lesson"], env=env, cwd=HERE)
    mp4 = next(media.rglob(f"{lesson_id}_{lang}.mp4"))
    OUT.mkdir(exist_ok=True)
    dst = OUT / f"{lesson_id}.{lang}.mp4"
    # сжатие для сайта: H.264, звук AAC, быстрый старт
    run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dst)])
    run(["ffmpeg", "-v", "error", "-y", "-i", str(dst), "-vf", "fps=1/5,scale=320:-1,tile=6x12", "-frames:v", "1", str(OUT / f"{lesson_id}.{lang}.png")])
    shutil.rmtree(media, ignore_errors=True)
    print(f"  {lesson_id}.{lang}: {time.time() - t0:.0f} с рендера", flush=True)
    return dst


def build(lesson_id: str, langs, draft: bool, publish: bool):
    sb = json.load(open(LESSONS / f"{lesson_id}.json"))
    check(sb)
    if os.environ.get("TTS", "none") != "none":
        run([sys.executable, str(HERE / "tts.py"), str(LESSONS / f"{lesson_id}.json"), *langs])
    done = {}
    for lang in langs:
        done[lang] = render(lesson_id, lang, draft)
    if publish and not draft:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        for lang, p in done.items():
            shutil.copy(p, PUBLIC / (f"{lesson_id}.mp4" if lang == "ru" else f"{lesson_id}.{lang}.mp4"))
        src = done.get("ru") or next(iter(done.values()))
        run(["ffmpeg", "-v", "error", "-y", "-ss", "2.5", "-i", str(src), "-frames:v", "1", "-q:v", "3", str(PUBLIC / f"{lesson_id}.jpg")])
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(next(iter(done.values())))]).stdout)
    return lesson_id, round(dur)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--lang", choices=["ru", "kk", "both"], default="both")
    ap.add_argument("--draft", action="store_true", help="480p, без публикации")
    ap.add_argument("--no-publish", action="store_true")
    ap.add_argument("-j", type=int, default=1, help="сколько уроков рендерить параллельно")
    a = ap.parse_args()
    ids = sorted(p.stem for p in LESSONS.glob("*.json") if not p.stem.startswith("_")) if a.all else a.ids
    langs = ["ru", "kk"] if a.lang == "both" else [a.lang]
    t0 = time.time()
    with ProcessPoolExecutor(a.j) as ex:
        for lid, dur in ex.map(build, ids, [langs] * len(ids), [a.draft] * len(ids), [not a.no_publish] * len(ids)):
            print(f"✓ {lid}: {dur // 60}:{dur % 60:02d}", flush=True)
    print(f"Готово: {len(ids)} урок(ов) за {(time.time() - t0) / 60:.1f} мин")


if __name__ == "__main__":
    main()
