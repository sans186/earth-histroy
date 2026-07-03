#!/usr/bin/env python
"""Translate remaining English event files to Chinese using MyMemoryTranslator."""
import json
import os
import re
import sys
import time

# Fix encoding for Windows
sys.stdout.reconfigure(encoding='utf-8')

from deep_translator import MyMemoryTranslator

EVENTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'events')

translator = MyMemoryTranslator(source='en-GB', target='zh-CN')

def has_chinese(text):
    return bool(re.search(r'[一-鿿]', text))

def translate_chunk(chunk):
    """Translate a single chunk (under 500 chars)."""
    if not chunk.strip() or has_chinese(chunk):
        return chunk
    try:
        result = translator.translate(chunk)
        time.sleep(1.0)  # Rate limiting
        return result
    except Exception as e:
        print(f"  Error translating chunk: {e}", file=sys.stderr)
        return chunk

def split_text(text, max_len=450):
    """Split text into chunks under max_len characters."""
    if len(text) <= max_len:
        return [text]

    # Split by sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current = ""
    for s in sentences:
        if len(current) + len(s) + 1 <= max_len:
            current = (current + " " + s).strip() if current else s
        else:
            if current:
                chunks.append(current)
            # If a single sentence is too long, split it by clauses
            if len(s) > max_len:
                clauses = re.split(r'(?<=[,;:])\s+', s)
                for c in clauses:
                    if len(c) > max_len:
                        # Hard split
                        for i in range(0, len(c), max_len):
                            chunks.append(c[i:i+max_len])
                    else:
                        if chunks and len(chunks[-1]) + len(c) + 1 <= max_len:
                            chunks[-1] += " " + c
                        else:
                            chunks.append(c)
            else:
                chunks.append(s)
    if current:
        chunks.append(current)
    return chunks

def translate_text(text):
    """Translate English to Chinese, handling long text."""
    if not text or has_chinese(text):
        return text
    chunks = split_text(text)
    if len(chunks) == 1:
        return translate_chunk(chunks[0])
    translated = [translate_chunk(c) for c in chunks]
    return ' '.join(translated)

def process_file(filepath):
    """Process a single file."""
    basename = os.path.basename(filepath)

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = False

    def process_field(obj, field):
        nonlocal modified
        if field in obj and obj[field] and isinstance(obj[field], str) and not has_chinese(obj[field]):
            new_val = translate_text(obj[field])
            if new_val != obj[field]:
                obj[field] = new_val
                modified = True

    def process_list(obj, field):
        nonlocal modified
        if field in obj and obj[field]:
            new_list = []
            for item in obj[field]:
                if isinstance(item, str) and not has_chinese(item):
                    t = translate_text(item)
                    if t != item:
                        modified = True
                    new_list.append(t)
                else:
                    new_list.append(item)
            obj[field] = new_list

    if not has_chinese(data.get('era_context', '')):
        print(f"  [{basename}] Translating era_context...")
        data['era_context'] = translate_text(data['era_context'])
        modified = True

    process_field(data, 'documentation_level')
    process_list(data, 'geographic_coverage_gaps')

    for i, event in enumerate(data.get('events', [])):
        if (i+1) % 5 == 0:
            sys.stdout.flush()
        process_field(event, 'title')
        process_field(event, 'region')
        process_field(event, 'description')
        process_field(event, 'certainty_note')
        process_list(event, 'key_figures')
        process_list(event, 'cross_references')
        for source in event.get('sources', []):
            process_field(source, 'name')

    process_field(data, 'disconfirming_evidence')
    process_field(data, 'historiographic_note')
    for edge in data.get('graph_edges', []):
        process_field(edge, 'note')

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  [{basename}] Translated and saved")
    else:
        print(f"  [{basename}] Already Chinese, skipped")

    return modified

def main():
    # Files to process (English content)
    files_to_process = []

    # -1895 to -1900 (Hammurabi years)
    for year in range(1895, 1901):
        files_to_process.append(os.path.join(EVENTS_DIR, f'-{year}.json'))

    # 1957-1965
    for year in range(1957, 1966):
        files_to_process.append(os.path.join(EVENTS_DIR, f'{year}.json'))

    # 2018-2025
    for year in range(2018, 2026):
        files_to_process.append(os.path.join(EVENTS_DIR, f'{year}.json'))

    total = len(files_to_process)
    done = 0
    skipped = 0

    for fp in files_to_process:
        if not os.path.exists(fp):
            print(f"  NOT FOUND: {os.path.basename(fp)}")
            continue
        if process_file(fp):
            done += 1
        else:
            skipped += 1

    print(f"\nDone! {done} translated, {skipped} already Chinese, {total} total")

    # Check remaining English files
    print("\nVerifying remaining English files...")
    remaining = 0
    for fname in sorted(os.listdir(EVENTS_DIR)):
        if not fname.endswith('.json'):
            continue
        fp = os.path.join(EVENTS_DIR, fname)
        with open(fp, 'r', encoding='utf-8') as f:
            d = json.load(f)
        events = d.get('events', [])
        if events:
            first_title = events[0].get('title', '')
            if not has_chinese(first_title):
                print(f"  STILL ENGLISH: {fname} ({len(events)} events)")
                remaining += 1

    print(f"Remaining English files: {remaining}")

if __name__ == '__main__':
    main()
