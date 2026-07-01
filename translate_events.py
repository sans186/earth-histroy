"""
Multi-threaded batch translation of all JSON files in public/events/ from English to Chinese.
Uses Anthropic API (via DeepSeek proxy) with concurrent requests.
"""
import json
import os
import time
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from anthropic import Anthropic

EVENTS_DIR = Path(__file__).parent / "public" / "events"
PROGRESS_FILE = Path(__file__).parent / "translate_progress.txt"
BATCH_SIZE = 2         # Files per API call (smaller = fewer JSON errors)
CONCURRENCY = 15       # Parallel API calls

SYSTEM_PROMPT = """You are a professional translator. Translate the following JSON content from English to Simplified Chinese (zh-CN).

CRITICAL RULES:
1. Translate ALL English text values into natural, fluent Simplified Chinese
2. DO NOT modify any keys (property names)
3. DO NOT modify these VALUE types (keep original even if they look like English words):
   - "category" values (political, military, economic, cultural, exploration, demographic, social, technological)
   - "certainty" values (confirmed, probable, approximate)
   - "relation" values (led_to, contemporary_with)
   - "type" values (primary_text, later_compilation, numismatic, archaeological, epigraphic, chronicle)
4. Keep proper names but translate their descriptions
5. Return ONLY valid JSON that is structurally identical to the input. No extra text, no markdown fences.
6. Translate book names, source descriptions, event descriptions, geographic notes, etc.
7. For historical terms, use standard Chinese academic translations
8. Return the COMPLETE JSON with ALL fields, nothing omitted"""

progress_lock = threading.Lock()


def get_batches():
    json_files = sorted(
        [f for f in EVENTS_DIR.iterdir() if f.suffix == '.json'],
        key=lambda f: int(f.stem)
    )
    done = set()
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            done = set(line.strip() for line in f)

    remaining = [f for f in json_files if f.name not in done]
    batches = []
    for i in range(0, len(remaining), BATCH_SIZE):
        batches.append(remaining[i:i + BATCH_SIZE])

    return batches, len(json_files), len(done)


def translate_batch(client, batch, batch_idx, total_batches):
    """Translate one batch of files. Returns (batch_idx, success)."""
    names = [f.name for f in batch]

    # Build payload
    payload = {}
    for fp in batch:
        with open(fp, 'r', encoding='utf-8') as f:
            payload[fp.name] = json.load(f)
    payload_str = json.dumps(payload, ensure_ascii=False, indent=2)

    try:
        response = client.messages.create(
            model="deepseek-v4-flash",
            max_tokens=64000,
            temperature=0.1,
            timeout=3600.0,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Translate all English text values in this JSON to Chinese. Keep all keys and programmatic values unchanged. Return the complete translated JSON with the same structure:\n\n{payload_str}"
            }]
        )

        # Extract text from response (skip thinking blocks)
        result_text = ""
        for block in response.content:
            if hasattr(block, 'text'):
                result_text += block.text

        # Clean up markdown fences
        text = result_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        translated = json.loads(text)

        # Save files
        for fname, data in translated.items():
            filepath = EVENTS_DIR / fname
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        # Record progress (thread-safe)
        with progress_lock:
            with open(PROGRESS_FILE, 'a') as f:
                for name in names:
                    f.write(name + "\n")

        return (batch_idx, True, f"{names[0]} ... {names[-1]}")

    except Exception as e:
        return (batch_idx, False, str(e)[:80])


def main():
    client = Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        base_url=os.environ.get("ANTHROPIC_BASE_URL")
    )

    batches, total, done_count = get_batches()
    remaining = total - done_count
    print(f"Total: {total} | Done: {done_count} | Remaining: {remaining}")
    print(f"Batches: {len(batches)} | Threads: {CONCURRENCY} | Batch size: {BATCH_SIZE}")
    print()

    completed = 0
    failed = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {
            executor.submit(translate_batch, client, batch, i, len(batches)): i
            for i, batch in enumerate(batches)
        }

        for future in as_completed(futures):
            i, ok, msg = future.result()
            completed += 1
            if ok:
                elapsed = time.time() - t0
                rate = completed / elapsed * 60  # batches per minute
                eta = (len(batches) - completed) / rate if rate > 0 else 0
                print(f"[{completed}/{len(batches)}] OK  {msg}  "
                      f"({rate:.1f} batch/min, ETA {eta:.0f}min)")
            else:
                failed += 1
                print(f"[{completed}/{len(batches)}] FAIL  {msg}")

    elapsed = time.time() - t0
    print(f"\nFinished in {elapsed/60:.1f} min. {completed - failed} ok, {failed} failed.")
    if failed:
        print("Re-run the script to retry failed batches.")


if __name__ == "__main__":
    main()
