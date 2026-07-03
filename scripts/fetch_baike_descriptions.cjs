/**
 * Fetch Baidu Baike summaries for all polities in the Cliopatria dataset.
 *
 * Produces public/ne/polity_descriptions.json — a lookup keyed by
 * Wikipedia page name (e.g. "Han_dynasty") with Chinese extracts,
 * thumbnail URL, and existence years.
 *
 * Strategy:
 *  1. Collect unique polities from GeoJSON.
 *  2. Build Chinese name candidates from multiple sources:
 *     - existing polity_names_zh.json mapping
 *     - pattern-based rules ("X Dynasty" → "X朝"/"X王朝")
 *     - English name as a direct fallback
 *  3. Fetch Baidu Baike page (meta description) for each candidate.
 *  4. Save results.
 *
 * Usage:  node scripts/fetch_baike_descriptions.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const POLITIES_DIR = 'public/ne/polities';
const ZH_NAME_FILE = 'public/ne/polity_names_zh.json';
const OUTPUT_FILE = 'public/ne/polity_descriptions.json';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10000;
const DELAY_MS = 200; // be polite to Baidu servers

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP helper ──

function fetchBaiduPage(name) {
  return new Promise((resolve, reject) => {
    const url = `https://baike.baidu.com/item/${encodeURIComponent(name)}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://baike.baidu.com/',
      },
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      // Follow redirects manually (Node.js http does not auto-follow)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://baike.baidu.com${res.headers.location}`;
        // Follow one redirect
        https.get(redirectUrl, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': url,
          },
          timeout: FETCH_TIMEOUT_MS,
        }, (res2) => {
          let data = '';
          let resolved = false;
          res2.on('data', (c) => {
            if (!resolved) {
              data += c;
              // Stop once we have enough to find the meta description (~20KB)
              if (data.length > 30000) { resolved = true; req.destroy(); }
            }
          });
          res2.on('end', () => resolve({ status: res2.statusCode, html: data }));
        }).on('error', (e) => reject(e));
      } else {
        let data = '';
        let resolved = false;
        res.on('data', (c) => {
          if (!resolved) {
            data += c;
            if (data.length > 30000) { resolved = true; req.destroy(); }
          }
        });
        res.on('end', () => resolve({ status: res.statusCode, html: data }));
      }
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Step 1: collect unique polities ──

console.log('Step 1: collecting unique polities from GeoJSON...');

const polityMap = new Map(); // Wikipedia page → { name, from, to, zhName? }

const files = fs
  .readdirSync(POLITIES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json');

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(POLITIES_DIR, file), 'utf-8'));
  if (!data.features) continue;
  for (const f of data.features) {
    const wiki = f.properties?.Wikipedia;
    const name = f.properties?.Name;
    if (!wiki || !name) continue;
    const from = f.properties.FromYear;
    const to = f.properties.ToYear;
    if (polityMap.has(wiki)) {
      const existing = polityMap.get(wiki);
      if (from != null && (existing.from == null || from < existing.from)) existing.from = from;
      if (to != null && (existing.to == null || to > existing.to)) existing.to = to;
    } else {
      polityMap.set(wiki, { name, from, to });
    }
  }
}

const entries = [...polityMap.entries()];
console.log(`  → ${entries.length} unique polities with Wikipedia links`);

// ── Step 2: load Chinese name mapping ──

let zhNameMap = {};
try {
  zhNameMap = JSON.parse(fs.readFileSync(ZH_NAME_FILE, 'utf-8'));
  console.log(`  → ${Object.keys(zhNameMap).length} Chinese name mappings loaded`);
} catch {
  console.log('  → No Chinese name mapping found');
}

// ── Step 2b: build Chinese name candidates ──

/**
 * Known Chinese translations for irregular polity names.
 * These cover major historical states whose names don't follow simple patterns.
 */
const KNOWN_ZH_NAMES = {
  // Ancient Near East
  'Babylonia': '巴比伦',
  'Assyria': '亚述',
  'Elam': '埃兰',
  'Phoenicia': '腓尼基',
  'Hittites': '赫梯',
  'Mitanni': '米坦尼',
  'Urartu': '乌拉尔图',
  'Sumer': '苏美尔',
  'Akkad': '阿卡德',
  'Minoa': '米诺斯',
  'Mycenae': '迈锡尼',
  'Philistia': '非利士',
  'Carthage': '迦太基',
  'Numidia': '努米底亚',
  'Mauretania': '毛里塔尼亚',
  'Judea': '犹太',
  'Samaria': '撒马利亚',
  'Galilee': '加利利',
  'Cappadocia': '卡帕多细亚',
  'Bithynia': '比提尼亚',
  'Pontus': '本都',
  'Galatia': '加拉太',
  'Lycia': '吕基亚',
  'Lydia': '吕底亚',
  'Media': '米底',
  'Parthia': '帕提亚',
  'Sogdia': '粟特',
  'Bactria': '巴克特里亚',
  'Macedonia': '马其顿',
  'Epirus': '伊庇鲁斯',
  'Thrace': '色雷斯',
  'Dacia': '达契亚',
  'Illyria': '伊利里亚',
  'Nubia': '努比亚',
  'Kush': '库施',
  'Aksum': '阿克苏姆',
  'Ghana': '加纳',
  'Mali': '马里',
  'Songhai': '桑海',
  'Benin': '贝宁',
  'Kongo': '刚果',
  'Mutapa': '穆塔帕',
  'Zimbabwe': '津巴布韦',
  'Saba': '萨巴',
  'Hadhramaut': '哈德拉毛',
  'Qataban': '卡塔班',
  'Minaeans': '米奈',
  'Nabataeans': '纳巴泰',
  'Palmyra': '巴尔米拉',
  // South Asia
  'Magadha': '摩揭陀',
  'Kosala': '拘萨罗',
  'Vatsa': '跋蹉',
  'Avanti': '阿槃提',
  'Gandhara': '犍陀罗',
  'Kalinga': '羯陵伽',
  'Chola': '朱罗',
  'Chera': '哲罗',
  'Pandya': '潘地亚',
  'Vijayanagara': '毗奢耶那伽罗',
  'Satavahana': '百乘王朝',
  'Kushan': '贵霜',
  'Gupta': '笈多',
  'Harsha': '戒日',
  'Pala': '波罗',
  'Chandela': '金德拉',
  'Chalukya': '遮娄其',
  'Rashtrakuta': '拉什特拉库塔',
  'Hoysala': '曷萨拉',
  'Kakatiya': '卡卡提亚',
  'Bahmani': '巴赫曼尼',
  'Maratha': '马拉塔',
  'Sikh': '锡克',
  'Mughal': '莫卧儿',
  // Southeast Asia
  'Srivijaya': '室利佛逝',
  'Majapahit': '满者伯夷',
  'Ayutthaya': '阿瑜陀耶',
  'Khmer': '高棉',
  'Champa': '占婆',
  'Pagan': '蒲甘',
  'Taungoo': '东吁',
  'Konbaung': '贡榜',
  'Lan Xang': '澜沧',
  'Đại Việt': '大越',
  'Sukhothai': '素可泰',
  // East Asia
  'Goguryeo': '高句丽',
  'Baekje': '百济',
  'Silla': '新罗',
  'Goryeo': '高丽',
  'Joseon': '朝鲜',
  'Balhae': '渤海',
  'Yamato': '大和',
  'Ryukyu': '琉球',
  'Mongol': '蒙古',
  'Xiongnu': '匈奴',
  'Xianbei': '鲜卑',
  'Rouran': '柔然',
  'Göktürks': '突厥',
  'Uyghur': '回鹘',
  'Khitan': '契丹',
  'Jurchen': '女真',
  'Tangut': '西夏',
  'Tibet': '吐蕃',
  'Nanzhao': '南诏',
  'Dali': '大理',
  // Europe
  'Sparta': '斯巴达',
  'Athens': '雅典',
  'Corinth': '科林斯',
  'Thebes': '底比斯',
  'Miletus': '米利都',
  'Ephesus': '以弗所',
  'Troy': '特洛伊',
  'Crete': '克里特',
  'Cyprus': '塞浦路斯',
  'Etruria': '埃特鲁里亚',
  'Latium': '拉丁姆',
  'Samnium': '萨莫奈',
  'Umbria': '翁布里亚',
  'Liguria': '利古里亚',
  'Cisalpine Gaul': '山南高卢',
  'Transalpine Gaul': '山北高卢',
  'Aquitania': '阿基坦',
  'Celtiberia': '凯尔特伊比利亚',
  'Lusitania': '卢西塔尼亚',
  'Britannia': '不列颠尼亚',
  'Caledonia': '喀里多尼亚',
  'Hibernia': '希伯尼亚',
  'Germania': '日耳曼尼亚',
  'Raetia': '雷蒂亚',
  'Noricum': '诺里库姆',
  'Pannonia': '潘诺尼亚',
  'Dalmatia': '达尔马提亚',
  'Moesia': '默西亚',
  'Dacia': '达契亚',
  'Scythia': '斯基泰',
  'Sarmatia': '萨尔马提亚',
  'Bosporan': '博斯普鲁斯',
  'Chersonese': '赫尔松涅斯',
  'Lombard': '伦巴第',
  'Ostrogoth': '东哥特',
  'Visigoth': '西哥特',
  'Vandal': '汪达尔',
  'Frank': '法兰克',
  'Burgundian': '勃艮第',
  'Anglo-Saxon': '盎格鲁-撒克逊',
  'Merovingian': '墨洛温',
  'Carolingian': '加洛林',
  'Holy Roman': '神圣罗马',
  'Byzantine': '拜占庭',
  'Seljuk': '塞尔柱',
  'Ottoman': '奥斯曼',
  'Safavid': '萨法维',
  'Mamluk': '马穆鲁克',
  'Ayyubid': '阿尤布',
  'Fatimid': '法蒂玛',
  'Umayyad': '倭马亚',
  'Abbasid': '阿拔斯',
  'Almoravid': '穆拉比特',
  'Almohad': '穆瓦希德',
  // Americas
  'Olmec': '奥尔梅克',
  'Maya': '玛雅',
  'Aztec': '阿兹特克',
  'Inca': '印加',
  'Toltec': '托尔特克',
  'Zapotec': '萨波特克',
  'Mixtec': '米斯特克',
  'Teotihuacan': '特奥蒂瓦坎',
  'Moche': '莫切',
  'Chimu': '奇穆',
  'Tiwanaku': '蒂瓦纳科',
  'Wari': '瓦里',
  'Muisca': '穆伊斯卡',
  'Taino': '泰诺',
  'Iroquois': '易洛魁',
  'Cherokee': '切罗基',
  'Creek': '克里克',
  'Sioux': '苏族',
  'Comanche': '科曼奇',
  'Apache': '阿帕奇',
  'Navajo': '纳瓦霍',
  'Pueblo': '普韦布洛',
  'Mississippian': '密西西比',
  'Cahokia': '卡霍基亚',
  // Oceania
  'Tonga': '汤加',
  'Hawaii': '夏威夷',
  'Tahiti': '塔希提',
  'Fiji': '斐济',
  'Samoa': '萨摩亚',
  'Rapa Nui': '拉帕努伊',
  // Miscellaneous
  'Mongol': '蒙古',
  'Cossack': '哥萨克',
  'Zulu': '祖鲁',
  'Boer': '布尔',
  'Golden Horde': '金帐汗国',
  'Ilkhanate': '伊尔汗国',
  'Chagatai': '察合台',
  'Timurid': '帖木儿',
  'Ming dynasty': '明朝',
  'Qing dynasty': '清朝',
  'Yuan dynasty': '元朝',
};

/**
 * Generate Chinese name candidates for a polity.
 * Returns an array of candidate strings to try on Baidu Baike.
 */
function getZHCandidates(englishName, wikiPage) {
  const candidates = [];

  // 1. Check the existing name map
  if (zhNameMap[englishName]) {
    candidates.push(zhNameMap[englishName]);
  }

  // 2. Check known irregular names (case-insensitive)
  const exactMatch = KNOWN_ZH_NAMES[englishName];
  if (exactMatch) candidates.push(exactMatch);

  // Also check KNOWN_ZH_NAMES by checking if englishName contains any key
  for (const [key, val] of Object.entries(KNOWN_ZH_NAMES)) {
    if (englishName !== key && englishName.toLowerCase().includes(key.toLowerCase())) {
      candidates.push(val);
    }
  }

  // 3. Pattern-based rules
  const name = englishName;

  // "X Dynasty" → "X朝" for Chinese dynasties, "X王朝" for others
  const dynMatch = name.match(/^(.+)\s+(D|d)ynasty$/);
  if (dynMatch) {
    const base = dynMatch[1];
    // Check if it's a known Chinese dynasty
    const chineseDynasties = ['Zhou','Qin','Han','Sui','Tang','Song','Yuan','Ming','Qing',
      'Shang','Xia','Jin','Liao','Song','Wei','Shu','Wu','Liang','Chen','Qi'];
    if (chineseDynasties.includes(base)) {
      candidates.push(base + '朝');
    }
    // Always also try "X王朝" as fallback
    candidates.push(base + '王朝');
  }

  // "X dynasty" → same as above (lowercase d)
  const dynMatch2 = name.match(/^(.+)\s+dynasty$/);
  if (dynMatch2 && !dynMatch) {
    const base = dynMatch2[1];
    const chineseDynasties = ['Zhou','Qin','Han','Sui','Tang','Song','Yuan','Ming','Qing',
      'Shang','Xia','Jin','Liao','Song','Wei','Shu','Wu','Liang','Chen','Qi'];
    if (chineseDynasties.includes(base)) {
      candidates.push(base + '朝');
    }
    candidates.push(base + '王朝');
  }

  // "Kingdom of X" → "X王国"
  const koMatch = name.match(/^Kingdom of (.+)$/i);
  if (koMatch) {
    // Try "X王国" (common for European kingdoms)
    let base = koMatch[1];
    // For "Kingdom of Israel", "Israel" stays as is and Baidu may have a page
    candidates.push(base + '王国');
    candidates.push(base);
  }

  // "Republic of X" → "X共和国"
  const roMatch = name.match(/^Republic of (.+)$/i);
  if (roMatch) {
    candidates.push(roMatch[1] + '共和国');
    candidates.push(roMatch[1]);
  }

  // "Empire of X" → "X帝国"
  const eoMatch = name.match(/^Empire of (.+)$/i);
  if (eoMatch) {
    candidates.push(eoMatch[1] + '帝国');
  }

  // "Duchy of X" → "X公国"
  const doMatch = name.match(/^Duchy of (.+)$/i);
  if (doMatch) {
    candidates.push(doMatch[1] + '公国');
  }

  // "Principality of X" → "X公国" or "X侯国"
  const poMatch = name.match(/^Principality of (.+)$/i);
  if (poMatch) {
    candidates.push(poMatch[1] + '公国');
  }

  // "Sultanate of X" → "X苏丹国"
  const soMatch = name.match(/^Sultanate of (.+)$/i);
  if (soMatch) {
    candidates.push(soMatch[1] + '苏丹国');
  }

  // "X Empire" → "X帝国"
  const eMatch = name.match(/^(.+)\s+(E|e)mpire$/);
  if (eMatch) {
    candidates.push(eMatch[1] + '帝国');
  }

  // "X Republic" → "X共和国"
  const rMatch = name.match(/^(.+)\s+(R|r)epublic$/);
  if (rMatch) {
    candidates.push(rMatch[1] + '共和国');
  }

  // "X Kingdom" → "X王国"
  const kMatch = name.match(/^(.+)\s+(K|k)ingdom$/);
  if (kMatch) {
    candidates.push(kMatch[1] + '王国');
  }

  // "X Sultanate" → "X苏丹国"
  const sMatch = name.match(/^(.+)\s+(S|s)ultanate$/);
  if (sMatch) {
    candidates.push(sMatch[1] + '苏丹国');
  }

  // 4. Try the English name directly (some work on Baidu Baike like "Babylon")
  candidates.push(name);

  // 5. If the name is a Wikipedia-style name with underscores, try with spaces
  if (wikiPage.includes('_')) {
    candidates.push(wikiPage.replace(/_/g, ' '));
    // Also try the first part before parentheses
    const parenIdx = wikiPage.indexOf('(');
    if (parenIdx > 0) {
      const beforeParen = wikiPage.substring(0, parenIdx).replace(/_/g, ' ').trim();
      if (beforeParen) candidates.push(beforeParen);
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

/**
 * Extract description and thumbnail from Baidu Baike HTML.
 */
function parseBaikePage(html) {
  // Meta description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const description = descMatch ? descMatch[1] : null;

  // Meta image / og:image
  const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i);
  const thumbnail = imgMatch ? imgMatch[1] : null;

  // Title from <title>
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/_百度百科$/, '').trim() : null;

  return { description, thumbnail, title };
}

// ── Main ──

async function main() {
  const descriptionMap = new Map();
  let fetched = 0;
  let failed = 0;
  let total = entries.length;

  console.log('\nStep 2: fetching Baidu Baike descriptions...');
  console.log(`  ${total} polities to process\n`);

  for (const [wiki, meta] of entries) {
    // Get Chinese name candidates
    const candidates = getZHCandidates(meta.name, wiki);

    let result = null;
    let usedCandidate = null;

    for (const candidate of candidates) {
      try {
        const resp = await fetchBaiduPage(candidate);
        if (resp.status === 200 && resp.html) {
          const parsed = parseBaikePage(resp.html);
          if (parsed.description && parsed.description.length > 10) {
            result = {
              title: parsed.title || candidate,
              extract: parsed.description,
              thumbnail: parsed.thumbnail || null,
            };
            usedCandidate = candidate;
            break;
          }
        }
      } catch (err) {
        // Continue to next candidate
      }
    }

    if (result) {
      descriptionMap.set(wiki, {
        name: meta.name,
        from: meta.from,
        to: meta.to,
        zh: result,
      });
      fetched++;
      if (fetched % 50 === 0) {
        console.log(`  ... ${fetched}/${total} fetched (last: ${meta.name})`);
      }
    } else {
      // Still record entry without zh description
      descriptionMap.set(wiki, {
        name: meta.name,
        from: meta.from,
        to: meta.to,
        zh: null,
      });
      failed++;
    }

    await delay(DELAY_MS);
  }

  console.log(`\n  ✓ Done: ${fetched} fetched, ${failed} failed`);

  // ── Write output ──

  console.log('\nStep 3: writing output file...');

  const output = {};
  for (const [wiki, desc] of descriptionMap) {
    const clean = { name: desc.name, from: desc.from, to: desc.to };
    if (desc.zh) clean.zh = desc.zh;
    output[wiki] = clean;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`  → ${OUTPUT_FILE} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${Object.keys(output).length} entries)`);

  const withZh = Object.values(output).filter((d) => d.zh).length;
  console.log(`\nDone! ${Object.keys(output).length} polities total:`);
  console.log(`  - With Chinese descriptions: ${withZh}`);
  console.log(`  - Without: ${Object.keys(output).length - withZh}`);

  // Write a log of failed names for manual filling
  const failedNames = entries
    .filter(([wiki]) => !descriptionMap.get(wiki)?.zh)
    .map(([wiki, meta]) => `${meta.name} (${wiki})`);
  if (failedNames.length > 0) {
    const logPath = 'public/ne/baike_failed.log';
    fs.writeFileSync(logPath, failedNames.join('\n'), 'utf-8');
    console.log(`  → Failed names logged to ${logPath}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
