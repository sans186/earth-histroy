"""
Translate the English event JSON files to Chinese using the DeepSeek API.

Credentials come from the repository `.env` file (`DEEPSEEK_API_KEY`).

They are deliberately NOT read from the ambient environment. An earlier version
used ANTHROPIC_API_KEY, which in this workspace belongs to the IDE rather than
to the project — so the script only ever ran on the machine that happened to
have that variable set, and would silently fail everywhere else.

Usage:
    python scripts/translate/translate_events.py
"""

import os
import sys
import json
import time
from pathlib import Path

import requests


def load_env():
    """Populate os.environ from the repository .env, without overwriting."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env()

API_KEY = os.environ.get("DEEPSEEK_API_KEY")
if not API_KEY:
    print("ERROR: DEEPSEEK_API_KEY is not set. Add it to .env (see .env.example).")
    sys.exit(1)

API_BASE = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL = os.environ.get("TRANSLATE_MODEL", "deepseek-chat")

def translate_json(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    year = os.path.basename(filepath).replace(".json", "")

    prompt = f"""You are translating historical event JSON files from English to Chinese for a world history timeline visualization.

Translate ALL text fields in the following JSON to Chinese:
- year_label: "1897 BCE" → "公元前1897年" (negative years) or "1958年" (positive years)
- era_context → Chinese
- documentation_level → Chinese (e.g. "sparse" → "稀疏", "rich" → "丰富", "very sparse" → "非常稀疏")
- geographic_coverage_gaps → Chinese
- events[].title → Chinese
- events[].region → Chinese
- events[].description → Chinese (translate all English text in descriptions)
- events[].key_figures[]: Keep the English name but add Chinese role in Chinese parentheses: "Hammurabi (King of Babylon)" → "Hammurabi（巴比伦国王）"
- events[].sources[].name → Chinese
- events[].certainty_note → Chinese
- events[].cross_references → Keep as-is (IDs like "1959-008")
- disconfirming_evidence → Chinese
- historiographic_note → Chinese
- graph_edges[].note → Chinese

IMPORTANT rules:
1. Preserve ALL JSON structure, keys, numbers, coordinates, IDs exactly
2. Do NOT translate: ids, year (number), coordinates_approx, category, certainty values (confirmed/probable/approximate), sources[].type, sources[].contemporary, graph_edges[].from/to/relation
3. Return ONLY the valid JSON, no markdown, no explanation
4. Keep the exact same JSON structure - only translate string values

Here is the JSON to translate:

{content}"""

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are a professional translator specializing in historical content. You translate English history content to Chinese accurately and concisely."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 16384
    }

    for attempt in range(3):
        try:
            resp = requests.post(
                f"{API_BASE}/chat/completions",
                headers=headers,
                json=payload,
                timeout=180
            )
            if resp.status_code == 200:
                result = resp.json()
                translated = result["choices"][0]["message"]["content"]
                # Strip markdown code fences if present
                translated = translated.strip()
                if translated.startswith("```json"):
                    translated = translated[7:]
                if translated.startswith("```"):
                    translated = translated[3:]
                if translated.endswith("```"):
                    translated = translated[:-3]
                translated = translated.strip()

                # Validate JSON
                try:
                    json.loads(translated)
                except json.JSONDecodeError as e:
                    print(f"  Invalid JSON response for {year}, attempt {attempt+1}: {e}")
                    if attempt < 2:
                        time.sleep(2)
                        continue
                    else:
                        debug_path = filepath + ".debug"
                        with open(debug_path, "w", encoding="utf-8") as df:
                            df.write(translated)
                        print(f"  Saved raw response to {debug_path}")
                        return False

                # Write translated content
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(translated)
                print(f"  OK")
                return True
            else:
                print(f"  API error {resp.status_code}: {resp.text[:200]}")
                if attempt < 2:
                    time.sleep(3)
        except Exception as e:
            print(f"  Request failed: {e}")
            if attempt < 2:
                time.sleep(3)

    print(f"  FAILED after 3 attempts")
    return False


def main():
    files_to_translate = [
        "-1896.json", "-1897.json", "-1898.json", "-1899.json", "-1900.json",
        "-1901.json", "-1902.json", "-1903.json", "-1904.json",
        "1957.json", "1958.json", "1959.json", "1960.json", "1961.json",
        "1962.json", "1963.json", "1964.json", "1965.json",
        "2018.json", "2019.json", "2020.json", "2021.json", "2022.json",
        "2023.json", "2024.json", "2025.json"
    ]

    events_dir = "public/events"
    total = len(files_to_translate)
    success = 0
    fail = 0

    for i, filename in enumerate(files_to_translate, 1):
        filepath = os.path.join(events_dir, filename)
        if not os.path.exists(filepath):
            print(f"[{i}/{total}] {filename} NOT FOUND")
            continue

        filesize = os.path.getsize(filepath)
        print(f"[{i}/{total}] {filename} ({filesize//1024} KB)...")
        ok = translate_json(filepath)
        if ok:
            success += 1
        else:
            fail += 1

        if i < total:
            time.sleep(1)

    print(f"\nDone. {success} OK, {fail} FAILED out of {total} files.")


if __name__ == "__main__":
    main()
