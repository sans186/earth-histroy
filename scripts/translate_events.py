"""Translate remaining English event JSON files to Chinese."""
import json
import os
import time
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')  # Fix encoding issue

from deep_translator import MyMemoryTranslator

EVENTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'events')

# Files known to need translation (year ranges with English content)
ENGLISH_YEARS = list(range(1888, 1896)) + list(range(1957, 1966)) + list(range(2018, 2026))

translator = MyMemoryTranslator(source='en-GB', target='zh-CN')

def has_chinese(text):
    return bool(re.search(r'[一-鿿]', text))

def translate_text(text):
    """Translate English text to Chinese, splitting into chunks under 500 chars."""
    if not text or has_chinese(text):
        return text
    try:
        # Split text into sentences/chunks under 500 chars
        parts = text.split('\n')
        translated_parts = []
        for part in parts:
            if not part.strip() or has_chinese(part):
                translated_parts.append(part)
                continue

            # If part is too long, split by sentence boundaries
            if len(part) > 450:
                sentences = re.split(r'(?<=[.!?])\s+', part)
                sub_translated = []
                current_chunk = ""
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) < 450:
                        current_chunk += (" " if current_chunk else "") + sentence
                    else:
                        if current_chunk:
                            sub_translated.append(translator.translate(current_chunk))
                            time.sleep(0.15)
                        current_chunk = sentence
                if current_chunk:
                    sub_translated.append(translator.translate(current_chunk))
                    time.sleep(0.15)
                translated_parts.append(''.join(sub_translated))
            else:
                translated = translator.translate(part)
                time.sleep(0.15)
                translated_parts.append(translated)
        return '\n'.join(translated_parts)
    except Exception as e:
        print(f"  Translation error: {e}")
        return text

def translate_field(obj, field):
    if field in obj and obj[field] and isinstance(obj[field], str):
        obj[field] = translate_text(obj[field])

def translate_list(obj, field):
    if field in obj and obj[field]:
        translated = []
        for item in obj[field]:
            if isinstance(item, str) and not has_chinese(item):
                translated.append(translate_text(item))
            else:
                translated.append(item)
        obj[field] = translated

def translate_file(filepath):
    """Translate all English text fields in a single event JSON file."""
    basename = os.path.basename(filepath)
    print(f"Processing: {basename}")

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = False

    # Top-level fields
    if 'era_context' in data and not has_chinese(data['era_context']):
        print(f"  [{basename}] Translating era_context...")
        data['era_context'] = translate_text(data['era_context'])
        modified = True

    if 'documentation_level' in data and not has_chinese(data['documentation_level']):
        print(f"  [{basename}] Translating documentation_level...")
        data['documentation_level'] = translate_text(data['documentation_level'])
        modified = True

    translate_list(data, 'geographic_coverage_gaps')

    # Events
    for event in data.get('events', []):
        translate_field(event, 'title')
        translate_field(event, 'region')
        translate_field(event, 'description')
        translate_field(event, 'certainty_note')
        translate_list(event, 'key_figures')
        translate_list(event, 'cross_references')

        for source in event.get('sources', []):
            translate_field(source, 'name')

    # Top-level notes
    translate_field(data, 'disconfirming_evidence')
    translate_field(data, 'historiographic_note')

    # Graph edges
    for edge in data.get('graph_edges', []):
        translate_field(edge, 'note')

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  [{basename}] Done - translated")
    else:
        print(f"  [{basename}] Skipped - already Chinese")

    return modified

def main():
    total = 0
    for year in ENGLISH_YEARS:
        filepath = os.path.join(EVENTS_DIR, f'{year}.json')
        if os.path.exists(filepath):
            if translate_file(filepath):
                total += 1

    print(f"\nTotal files translated: {total}")

if __name__ == '__main__':
    main()
