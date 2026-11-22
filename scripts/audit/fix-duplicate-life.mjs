/**
 * Removes the duplicate life-event entries that the duplicate-title audit found.
 *
 * Why each pair/set is broken: the upstream corpus regenerates the same obituary
 * in several year shards with a different year each time. The surviving copy is
 * the one whose year matches the best-attested date, so the decision table below
 * is a fact list, not a preference.
 */
import fs from 'node:fs';

const decisions = [
  ['瑞典国王阿努德·雅各布去世；继承危机', [1091, 1120]],
  ['阿蒙霍特普三世去世和阿蒙霍特普四世（阿肯那顿）继位', [-1370]],
  ['托勒密三世·施恩者去世；托勒密四世·爱父者即位', [-221]],
  ['英格兰亨利一世去世；继承危机与内战开始', [1106]],
  ['托斯卡纳的玛蒂尔达去世；意大利的继承争端', [1128]],
  ['耶路撒冷国王鲍德温三世去世', [1151]],
  ['教皇阿德里安四世去世', [1156]],
  ['法蒂玛哈里发去世后萨拉丁在埃及巩固权力', [1163]],
  ['亚历山大三世去世后的苏格兰继承危机', [1285]],
  ['彼特拉克在罗马被加冕为桂冠诗人', [1336]],
  ['圣女贞德出生（传统日期）；在栋雷米的早年生活', [1416]],
  ['正德皇帝驾崩与嘉靖皇帝即位（明朝）', [1529]],
  ['丰臣秀吉去世', [1599]],
  ['伽利略·伽利雷去世；自然哲学一个时代的终结', [1643]],
  ['萨珊波斯纳尔塞斯一世去世', [303]],
  ['唐朝唐文宗即位', [828]],
  ['奥托一世加冕为神圣罗马帝国皇帝', [961]],
];

const log = [];
for (const [title, years] of decisions) {
  for (const year of years) {
    const zhPath = `public/events/${year}.json`;
    const enPath = `public/en-events/${year}.json`;
    const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    const hit = (zh.events ?? []).find((ev) => ev.title === title);
    if (!hit) {
      log.push({ year, title, status: 'missing' });
      continue;
    }
    zh.events = zh.events.filter((ev) => ev.id !== hit.id);
    fs.writeFileSync(zhPath, `${JSON.stringify(zh, null, 2)}\n`, 'utf8');
    if (fs.existsSync(enPath)) {
      const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
      const before = (en.events ?? []).length;
      en.events = (en.events ?? []).filter((ev) => ev.id !== hit.id);
      if (en.events.length !== before) fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`, 'utf8');
    }
    log.push({ year, id: hit.id, status: 'deleted' });
  }
}

fs.writeFileSync('.tmp-audit/duplicate-life-applied.json', JSON.stringify(log, null, 2), 'utf8');
console.log(JSON.stringify({ deleted: log.filter((r) => r.status === 'deleted').length, missing: log.filter((r) => r.status === 'missing') }, null, 2));
