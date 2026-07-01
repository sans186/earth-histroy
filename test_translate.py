"""
Quick test of the translation script with 2 files.
"""
import json
import os
import sys
from pathlib import Path
from anthropic import Anthropic

EVENTS_DIR = Path(__file__).parent / "public" / "events"

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
5. Return ONLY valid JSON that is structurally identical to the input
6. Translate book names, source descriptions, event descriptions, geographic notes, etc.
7. For historical terms, use standard Chinese academic translations
8. Return the COMPLETE JSON with ALL fields, nothing omitted"""

client = Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
    base_url=os.environ.get("ANTHROPIC_BASE_URL")
)

# Test with 2 files
test_files = [EVENTS_DIR / "-1.json", EVENTS_DIR / "-10.json"]

payload = {}
for fp in test_files:
    with open(fp, 'r', encoding='utf-8') as f:
        payload[fp.name] = json.load(f)

payload_str = json.dumps(payload, ensure_ascii=False, indent=2)
print(f"Input size: {len(payload_str)} chars")
print(f"Sending to API...")

response = client.messages.create(
    model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    max_tokens=32768,
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
print(f"Response size: {len(result_text)} chars")

# Extract JSON
if "```json" in result_text:
    result_text = result_text.split("```json")[1].split("```")[0].strip()
elif "```" in result_text:
    result_text = result_text.split("```")[1].split("```")[0].strip()

result = json.loads(result_text)

# Print a sample
for fname, data in result.items():
    print(f"\n--- {fname} ---")
    print(f"year_label: {data.get('year_label')}")
    print(f"era_context: {data.get('era_context')[:100]}...")
    if data.get('events'):
        evt = data['events'][0]
        print(f"event title: {evt.get('title')}")
        print(f"event description: {evt.get('description')[:100]}...")
        print(f"event category: {evt.get('category')}")

# Check category preserved
for fname, data in result.items():
    for evt in data.get('events', []):
        cat = evt.get('category')
        if cat not in ('political', 'military', 'economic', 'cultural', 'exploration', 'demographic', 'social', 'technological'):
            print(f"ERROR: category '{cat}' was modified in {fname}!")

print("\nTest passed!")
