/**
 * War plugin – major war history visualisation.
 *
 * Data source: AI-generated war profiles in /public/wars/profiles/
 *
 * Features:
 *  - Toggle button to open/close left war list panel
 *  - War list (left side, styled like event/trajectory panels)
 *  - Multi-tab detail card (right side): 概览/背景/双方/战役/节点/分析
 *  - Battle markers on Cesium/MapLibre for active phase
 *  - Year-based phase/battle filtering via timeline sync
 */

import * as Cesium from 'cesium';
import { formatYearLocale } from '../locale.js';

const WARS_INDEX = '/wars/profiles/index.json';
const WARS_DIR = '/wars/profiles';
const WAR_LOCATIONS_URL = '/wars/profiles/war_locations.json';

// ── Canvas marker cache ──
const markerCache = new Map();

function cachedMarker(key, draw) {
  if (markerCache.has(key)) return markerCache.get(key);
  const s = 40;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  draw(ctx, s);
  const uri = c.toDataURL();
  markerCache.set(key, uri);
  return uri;
}

function getBattleMarker(color) {
  const key = 'battle_' + color;
  return cachedMarker(key, (ctx, s) => {
    const cx = s / 2, cy = s * 0.42;
    // Crossed swords pin shape
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cx, s - 3);
    ctx.bezierCurveTo(cx - 8, cy + 12, cx - 10, cy + 2, cx - 8, cy - 4);
    ctx.bezierCurveTo(cx - 6, cy - 10, cx, cy - 14, cx, cy - 11);
    ctx.bezierCurveTo(cx, cy - 14, cx + 6, cy - 10, cx + 8, cy - 4);
    ctx.bezierCurveTo(cx + 10, cy + 2, cx + 8, cy + 12, cx, s - 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Cross icon in center
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔', cx, cy - 1);
  });
}

function getActiveBattleMarker(color) {
  const key = 'active_battle_' + color;
  return cachedMarker(key, (ctx, s) => {
    const cx = s / 2, cy = s / 2;
    const g = ctx.createRadialGradient(cx, cy, s * 0.15, cx, cy, s * 0.48);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color + '88');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.stroke();
    // Small cross
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚔', cx, cy);
  });
}

// ── Plugin ──
export default {
  name: 'war-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    // ── State ──
    let warIndex = [];
    let warListOpen = false;
    let selectedWar = null;
    let selectedWarData = null;
    let detailTab = 'overview';        // overview / background / sides / battles / timeline / analysis
    let battleEntities = [];            // current Cesium entities for battle markers

    // ── Inject styles ──
    const style = document.createElement('style');
    style.textContent = `
      #war-toggle {
        position: fixed; left: 10px; top: 140px; z-index: 110;
        background: var(--bg-panel); border: 1px solid var(--border-secondary); border-radius: 6px;
        color: var(--btn-text); font-size: 13px; padding: 6px 10px; cursor: pointer;
        transition: left 0.25s ease, background 0.2s, border-color 0.2s, color 0.2s; font-family: inherit; line-height: 1;
      }
      #war-toggle:hover { background: var(--btn-hover); color: var(--text-white); }
      #war-toggle.active { background: #c0392b; border-color: #e74c3c; color: var(--text-white); }

      #war-list {
        position: fixed; left: 0; top: 0; bottom: 200px; width: 0;
        z-index: 105; overflow: hidden;
        background: var(--bg-panel-solid);
        border-right: 1px solid var(--border-secondary);
        display: flex; flex-direction: column;
        transition: width 0.25s ease;
      }
      #war-list.open { width: 290px; }
      @media (max-width: 768px) { #war-list.open { width: 240px; } }

      #war-list .wl-header {
        padding: 10px 14px; border-bottom: 1px solid var(--divider); flex-shrink: 0;
      }
      #war-list .wl-header h3 {
        color: #e74c3c; font-size: 15px; margin: 0 0 4px;
      }
      #war-list .wl-sub { color: var(--text-dim); font-size: 11px; }
      #war-list .wl-search {
        width: 100%; box-sizing: border-box; margin-top: 6px;
        background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 14px;
        color: var(--text-primary); font-size: 12px; padding: 4px 10px; font-family: inherit;
        outline: none;
      }
      #war-list .wl-search:focus { border-color: #e74c3c; }
      #war-list .wl-search::placeholder { color: var(--filter-dot-border); }

      #war-list .wl-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
      }
      #war-list .wl-list::-webkit-scrollbar { width: 4px; }
      #war-list .wl-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

      #war-list .wl-item {
        padding: 8px 14px; cursor: pointer;
        transition: background 0.15s; border-left: 3px solid transparent;
      }
      #war-list .wl-item:hover { background: rgba(231,76,60,0.1); }
      #war-list .wl-item.active {
        background: rgba(231,76,60,0.15);
        border-left-color: #e74c3c;
      }
      #war-list .wl-name {
        font-size: 14px; color: #e74c3c; font-weight: bold;
      }
      #war-list .wl-period {
        font-size: 11px; color: var(--text-dim); margin-left: 6px;
      }
      #war-list .wl-tags {
        display: flex; gap: 3px; margin-top: 3px; flex-wrap: wrap;
      }
      #war-list .wl-tag {
        font-size: 9px; padding: 1px 6px; border-radius: 8px;
        background: rgba(231,76,60,0.12); color: #e74c3c;
      }
      #war-list .wl-summary {
        font-size: 11px; color: #999; margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      /* War detail card */
      #war-card {
        position: fixed; top: 50%; right: 20px; transform: translateY(-50%);
        background: linear-gradient(145deg, var(--bg-card-start) 0%, var(--bg-card-end) 100%);
        border: 1px solid rgba(231,76,60,0.4); border-radius: 14px;
        z-index: 1000; width: 520px; max-width: 92vw; max-height: 85vh;
        box-shadow: 0 12px 50px var(--card-shadow), 0 0 40px rgba(231,76,60,0.2);
        display: none; color: var(--text-primary); overflow: hidden;
        flex-direction: column;
      }
      #war-card.visible { display: flex; animation: warCardIn 0.25s ease-out; }
      @keyframes warCardIn {
        from { opacity: 0; transform: translateY(-50%) translateX(20px); }
        to   { opacity: 1; transform: translateY(-50%) translateX(0); }
      }

      #war-card .wc-header {
        padding: 14px 18px 10px; border-bottom: 1px solid var(--divider);
        display: flex; justify-content: space-between; align-items: flex-start;
        flex-shrink: 0;
      }
      #war-card .wc-header h3 { color: #e74c3c; font-size: 18px; margin: 0; padding-right: 20px; }
      #war-card .wc-header .close-btn {
        background: none; border: none; color: var(--text-faint); font-size: 18px;
        cursor: pointer; padding: 0; line-height: 1;
      }
      #war-card .wc-header .close-btn:hover { color: var(--text-white); }
      #war-card .wc-header .wc-period {
        color: var(--text-dim); font-size: 12px; margin-top: 2px;
      }

      /* Tab bar */
      #war-card .wc-tabs {
        display: flex; gap: 2px; padding: 6px 14px;
        border-bottom: 1px solid var(--divider); flex-shrink: 0; flex-wrap: wrap;
      }
      #war-card .wc-tab {
        font-size: 11px; padding: 4px 12px; border-radius: 12px; cursor: pointer;
        background: rgba(231,76,60,0.08); color: var(--text-faint);
        border: 1px solid transparent; transition: all 0.15s; user-select: none;
        white-space: nowrap;
      }
      #war-card .wc-tab:hover { background: rgba(231,76,60,0.18); color: #ddd; }
      #war-card .wc-tab.active {
        background: rgba(231,76,60,0.2); color: #e74c3c; border-color: rgba(231,76,60,0.4);
      }

      #war-card .wc-body {
        padding: 12px 18px 16px; overflow-y: auto; flex: 1;
      }
      #war-card .wc-body::-webkit-scrollbar { width: 4px; }
      #war-card .wc-body::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

      #war-card .wc-section { margin-bottom: 14px; }
      #war-card .wc-section-title {
        color: #e74c3c; font-size: 13px; font-weight: bold; margin-bottom: 6px;
        padding-bottom: 4px; border-bottom: 1px solid rgba(231,76,60,0.2);
      }
      #war-card .wc-text { font-size: 13px; color: #bbb; line-height: 1.7; }
      #war-card .wc-text h4 { color: #ddd; font-size: 12px; margin: 8px 0 4px; }

      /* Side comparison */
      #war-card .wc-side-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }
      #war-card .wc-side-col {
        background: var(--bg-input); border-radius: 8px; padding: 10px 12px;
        border: 1px solid var(--border-secondary);
      }
      #war-card .wc-side-col h4 { margin: 0 0 6px; font-size: 13px; }

      /* Commander list */
      #war-card .wc-commander {
        display: flex; align-items: center; gap: 6px; padding: 3px 0;
        font-size: 12px; color: #bbb;
      }
      #war-card .wc-commander .wc-cmd-name { color: var(--text-link); font-weight: bold; }
      #war-card .wc-commander .wc-cmd-role { color: var(--text-dim); font-size: 11px; }

      /* Battle list */
      #war-card .wc-battle {
        background: var(--bg-input); border-radius: 8px; padding: 10px 12px;
        margin-bottom: 8px; border: 1px solid var(--border-secondary);
        cursor: pointer; transition: border-color 0.15s;
      }
      #war-card .wc-battle:hover { border-color: rgba(231,76,60,0.5); }
      #war-card .wc-battle.active { border-color: #e74c3c; }
      #war-card .wc-battle .wc-btl-header {
        display: flex; justify-content: space-between; align-items: center;
      }
      #war-card .wc-battle .wc-btl-name { color: var(--text-link); font-weight: bold; font-size: 13px; }
      #war-card .wc-battle .wc-btl-date { color: var(--text-dim); font-size: 11px; }
      #war-card .wc-battle .wc-btl-desc { font-size: 12px; color: #999; margin-top: 4px; line-height: 1.5; }

      /* Timeline list */
      #war-card .wc-tl-item {
        display: flex; gap: 10px; padding: 5px 0; border-left: 2px solid rgba(231,76,60,0.3);
        padding-left: 12px; margin-left: 4px;
      }
      #war-card .wc-tl-year {
        color: var(--text-link); font-size: 12px; font-weight: bold; min-width: 60px; flex-shrink: 0;
      }
      #war-card .wc-tl-content { font-size: 12px; color: #bbb; line-height: 1.5; }
      #war-card .wc-tl-type {
        font-size: 9px; padding: 1px 5px; border-radius: 6px; display: inline-block;
        margin-right: 4px;
      }
      #war-card .wc-tl-type.decision { background: rgba(74,96,175,0.3); color: #8ab4f8; }
      #war-card .wc-tl-type.crisis { background: rgba(231,76,60,0.3); color: #e74c3c; }
      #war-card .wc-tl-type.diplomacy { background: rgba(46,204,113,0.3); color: #2ecc71; }
      #war-card .wc-tl-type.leadership { background: rgba(230,126,34,0.3); color: #e67e22; }

      /* Tag badges */
      #war-card .wc-tag {
        display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 10px;
        background: rgba(231,76,60,0.15); color: #e74c3c; margin: 2px;
      }

      /* Battle popup */
      #battle-popup {
        position: fixed; bottom: 220px; left: 50%; transform: translateX(-50%);
        background: var(--bg-panel-solid); border: 1px solid rgba(231,76,60,0.5);
        border-radius: 10px; padding: 10px 16px; z-index: 90;
        display: none; min-width: 300px; max-width: 500px;
      }
      #battle-popup.visible { display: block; }
      #battle-popup .bp-name { color: #e74c3c; font-size: 14px; font-weight: bold; }
      #battle-popup .bp-meta { font-size: 11px; color: var(--text-dim); margin: 4px 0; }
      #battle-popup .bp-desc { font-size: 12px; color: #bbb; line-height: 1.5; }

      @media (max-width: 768px) {
        #war-card { width: 340px; }
        #war-card .wc-side-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);

    // ── DOM: Toggle button ──
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'war-toggle';
    toggleBtn.textContent = '⚔ 战争史';
    toggleBtn.title = '打开战争列表';

    // ── DOM: Left war list panel ──
    const listPanel = document.createElement('div');
    listPanel.id = 'war-list';
    listPanel.innerHTML = `
      <div class="wl-header">
        <h3>⚔ 人类战争史</h3>
        <div class="wl-sub" id="wl-sub"></div>
        <input class="wl-search" id="wl-search" type="text" placeholder="搜索战争名称...">
      </div>
      <div class="wl-list" id="wl-list"></div>
    `;

    // ── DOM: Detail card ──
    const card = document.createElement('div');
    card.id = 'war-card';
    card.innerHTML = `
      <div class="wc-header">
        <div>
          <h3 id="wc-name"></h3>
          <div class="wc-period" id="wc-period"></div>
        </div>
        <button class="close-btn" id="wc-close">✕</button>
      </div>
      <div class="wc-tabs" id="wc-tabs">
        <span class="wc-tab active" data-tab="overview">概览</span>
        <span class="wc-tab" data-tab="background">背景</span>
        <span class="wc-tab" data-tab="sides">交战双方</span>
        <span class="wc-tab" data-tab="battles">战役</span>
        <span class="wc-tab" data-tab="timeline">关键节点</span>
        <span class="wc-tab" data-tab="analysis">深度分析</span>
      </div>
      <div class="wc-body" id="wc-body"></div>
    `;

    // ── DOM: Battle popup ──
    const battlePopup = document.createElement('div');
    battlePopup.id = 'battle-popup';

    document.body.append(toggleBtn, listPanel, card, battlePopup);

    // ── DOM refs ──
    const listContainer = listPanel.querySelector('#wl-list');
    const listSub = listPanel.querySelector('#wl-sub');
    const searchInput = listPanel.querySelector('#wl-search');
    const wcName = card.querySelector('#wc-name');
    const wcPeriod = card.querySelector('#wc-period');
    const wcBody = card.querySelector('#wc-body');

    // ── Clear battle markers ──
    function clearBattleMarkers() {
      for (const e of battleEntities) {
        if (e) viewer.entities.remove(e);
      }
      battleEntities = [];
    }

    // ── Render battle markers on map ──
    function renderBattleMarkers(warData, currentYear) {
      clearBattleMarkers();
      if (!warData) return;

      const wp = warData.warProcess;
      if (!wp) return;

      // Collect all battles
      let allBattles = [];
      if (wp.phases && wp.phases.length > 0) {
        for (const phase of wp.phases) {
          if (phase.battles) {
            for (const b of phase.battles) {
              allBattles.push({ ...b, phaseName: phase.name });
            }
          }
        }
      } else if (wp.majorBattles && wp.majorBattles.length > 0) {
        allBattles = wp.majorBattles.map(b => ({ ...b, phaseName: '' }));
      }

      // Filter by current year (within battle's timeframe)
      const activeBattles = allBattles.filter(b => {
        const bs = b.startYear ?? b.startYear ?? 0;
        const be = b.endYear ?? b.endYear ?? 0;
        return currentYear >= bs && currentYear <= be;
      });

      // Show all battles (not just active) as dim markers, active as bright
      for (const b of allBattles) {
        if (!b.coords || !Array.isArray(b.coords) || b.coords.length !== 2) continue;
        const [lon, lat] = b.coords;
        if (lon === 0 && lat === 0) continue;

        const isActive = currentYear >= (b.startYear ?? 0) && currentYear <= (b.endYear ?? 0);
        const color = isActive ? '#e74c3c' : '#8b4513';

        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          billboard: {
            image: isActive ? getActiveBattleMarker('#e74c3c') : getBattleMarker('#8b4513'),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance: new Cesium.NearFarScalar(1e6, 1.4, 10e6, 0.25),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 18e6),
          },
          properties: {
            battleData: b,
            isActive: isActive,
          },
        });
        battleEntities.push(entity);
      }
    }

    // ── Fly to battle ──
    function flyToBattle(battle) {
      if (!battle?.coords) return;
      const [lon, lat] = battle.coords;
      const mode = core.state.get('mapMode') ?? '3d';
      if (mode === '2d') {
        const m2 = core.state.get('_map2d');
        if (m2) m2.flyTo(lon, lat, 5);
      } else {
        const tgt = Cesium.Cartesian3.fromDegrees(lon, lat);
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(tgt, 100000),
          {
            duration: 1.2,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 500000),
          },
        );
      }
    }

    // ── Render detail card ──
    function renderDetailCard() {
      if (!selectedWarData) {
        card.classList.remove('visible');
        return;
      }

      const w = selectedWarData;
      const locale = core.state.get('locale') ?? 'zh';
      const useEn = locale === 'en';

      wcName.textContent = useEn ? (w.nameEn || w.name) : w.name;
      wcPeriod.textContent = `${w.startYear || '?'} — ${w.endYear || '?'}  ·  ${w.category || ''}`;
      card.classList.add('visible');

      let html = '';

      switch (detailTab) {
        case 'overview':
          html = renderOverview(w, useEn);
          break;
        case 'background':
          html = renderBackground(w, useEn);
          break;
        case 'sides':
          html = renderSides(w, useEn);
          break;
        case 'battles':
          html = renderBattles(w, useEn);
          break;
        case 'timeline':
          html = renderTimeline(w, useEn);
          break;
        case 'analysis':
          html = renderAnalysis(w, useEn);
          break;
        default:
          html = renderOverview(w, useEn);
      }

      wcBody.innerHTML = html;

      // Attach battle click handlers
      wcBody.querySelectorAll('.wc-battle').forEach(el => {
        el.addEventListener('click', () => {
          const btlId = el.dataset.battleId;
          // Find battle in data
          const wp = w.warProcess;
          let battle = null;
          if (wp?.phases) {
            for (const ph of wp.phases) {
              const found = (ph.battles || []).find(b => b.battleId === btlId);
              if (found) { battle = found; break; }
            }
          }
          if (!battle && wp?.majorBattles) {
            battle = wp.majorBattles.find(b => b.battleId === btlId);
          }
          if (battle) {
            flyToBattle(battle);
            showBattlePopup(battle, useEn);
          }
        });
      });
    }

    function showBattlePopup(battle, useEn) {
      battlePopup.innerHTML = `
        <div class="bp-name">${useEn ? (battle.nameEn || battle.name) : battle.name}</div>
        <div class="bp-meta">
          ${(battle.startYear || '?')} — ${(battle.endYear || '?')}
          ${battle.theater ? ' · ' + battle.theater : ''}
          · 结果: ${battle.result || ''}
        </div>
        <div class="bp-meta">
          兵力: ${battle.forces?.sideA || '?'} vs ${battle.forces?.sideB || '?'}
          · 伤亡: ${battle.casualties?.sideA || '?'} vs ${battle.casualties?.sideB || '?'}
        </div>
        <div class="bp-desc">${battle.description || ''}</div>
      `;
      battlePopup.classList.add('visible');
      // Auto hide after 8 seconds
      clearTimeout(battlePopup._timer);
      battlePopup._timer = setTimeout(() => battlePopup.classList.remove('visible'), 8000);
    }

    // ── Tab renderers ──
    function renderOverview(w, useEn) {
      const tags = w.tags || {};
      const allTags = [
        ...(tags.warfareType || []),
        ...(tags.geopolitical || []),
        tags.scale,
        ...(tags.cause || []),
      ].filter(Boolean);

      return `
        <div class="wc-section">
          <div class="wc-section-title">概述</div>
          <div class="wc-text">${w.summary || ''}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">标签</div>
          <div>${allTags.map(t => `<span class="wc-tag">${t}</span>`).join('')}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">战区</div>
          <div class="wc-text">${(w.theaters || []).join(' / ') || '未分类'}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">战争结果</div>
          <div class="wc-text">${(w.outcome || {}).result || ''}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">历史意义</div>
          <div class="wc-text">${(w.legacy || {}).significance || ''}</div>
        </div>
        ${w.relatedWars && w.relatedWars.length > 0 ? `
        <div class="wc-section">
          <div class="wc-section-title">相关战争</div>
          <div class="wc-text">${w.relatedWars.join(' → ')}</div>
        </div>` : ''}
      `;
    }

    function renderBackground(w, useEn) {
      const bg = w.background || {};
      return `
        <div class="wc-section">
          <div class="wc-section-title">深层原因</div>
          <div class="wc-text">${bg.causes || ''}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">直接导火索</div>
          <div class="wc-text">${bg.immediateCause || ''}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">战前局势</div>
          <div class="wc-text">${bg.preWarSituation || ''}</div>
        </div>
        <div class="wc-section">
          <div class="wc-section-title">双方战略目标</div>
          <div class="wc-text"><strong>${(w.belligerents?.sideA?.name || 'A方')}:</strong> ${bg.objectivesA || ''}</div>
          <div class="wc-text" style="margin-top:8px;"><strong>${(w.belligerents?.sideB?.name || 'B方')}:</strong> ${bg.objectivesB || ''}</div>
        </div>
        ${bg.precedingConflicts && bg.precedingConflicts.length > 0 ? `
        <div class="wc-section">
          <div class="wc-section-title">前导冲突</div>
          <div class="wc-text">${bg.precedingConflicts.join(' / ')}</div>
        </div>` : ''}
      `;
    }

    function renderSides(w, useEn) {
      const sideA = w.belligerents?.sideA || {};
      const sideB = w.belligerents?.sideB || {};

      // Helper: normalize person (object {name,role,bio} or string)
      function normPerson(p) {
        if (typeof p === 'string') {
          // Could be "胡安·尼格列尔"、"恩里克·利斯特" (multiple names joined)
          // or a simple "name - role" string
          const names = p.split(/[、，,""]+/).filter(Boolean);
          if (names.length > 1) return names.map(n => ({ name: n.trim(), role: '' }));
          return { name: p.trim(), role: '' };
        }
        return p || { name: '', role: '' };
      }
      function renderPeople(list) {
        const items = [];
        for (const raw of (list || [])) {
          const n = normPerson(raw);
          if (Array.isArray(n)) { items.push(...n); } else { items.push(n); }
        }
        return items.map(c =>
          `<div class="wc-commander"><span class="wc-cmd-name">${c.name || ''}</span><span class="wc-cmd-role">${c.role || ''}</span></div>`
        ).join('');
      }
      function renderEquipment(list) {
        if (!list || list.length === 0) return '<div style="font-size:12px;color:#999;">-</div>';
        return list.map(e => {
          if (typeof e === 'string') return `<div style="font-size:12px;color:#999;">• ${e}</div>`;
          return `<div style="font-size:12px;color:#999;">• ${e.name || ''}: ${e.quantity || ''} — ${e.description || ''}</div>`;
        }).join('');
      }

      function sideCard(side, color) {
        const countries = (side.countries || []).map(c => typeof c === 'string' ? c : (c.name || '')).join(', ');
        const casualties = side.totalCasualties || {};
        const ms = side.militarySystem || {};
        const pws = side.preWarStrength || {};
        const prop = side.propaganda || {};

        return `
          <div class="wc-side-col">
            <h4 style="color:${color}">${side.name || ''}</h4>
            <div style="font-size:11px;color:#888;margin-bottom:6px;">${countries}</div>

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>政治领袖</strong></div>
            ${renderPeople(side.politicalLeaders) || '<div style="font-size:12px;color:#999;">-</div>'}

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>主要将领</strong></div>
            ${renderPeople(side.commanders) || '<div style="font-size:12px;color:#999;">-</div>'}

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>兵制</strong></div>
            <div style="font-size:12px;color:#999;">募兵: ${ms.recruitment || '-'}</div>
            <div style="font-size:12px;color:#999;">编制: ${ms.organization || '-'}</div>
            <div style="font-size:12px;color:#999;">后勤: ${ms.logistics || '-'}</div>

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>战前兵力</strong></div>
            <div style="font-size:12px;color:#999;">陆军: ${pws.army || '-'}</div>
            <div style="font-size:12px;color:#999;">海军: ${pws.navy || '-'}</div>
            <div style="font-size:12px;color:#999;">空军: ${pws.airForce || '-'}</div>
            <div style="font-size:12px;color:#999;">装甲: ${pws.armor || '-'}</div>

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>主要装备</strong></div>
            ${renderEquipment(side.equipment)}

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>经济实力</strong></div>
            <div style="font-size:12px;color:#999;">${side.economicStrength || '-'}</div>
            <div style="font-size:12px;color:#999;">军工产能: ${side.industrialCapacity || '-'}</div>

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>伤亡</strong></div>
            <div style="font-size:12px;color:#999;">阵亡: ${casualties.dead || '-'} / 伤: ${casualties.wounded || '-'}</div>
            <div style="font-size:12px;color:#999;">被俘: ${casualties.captured || '-'} / 失踪: ${casualties.missing || '-'}</div>
            <div style="font-size:12px;color:#999;">平民: ${casualties.civilian || '-'}</div>

            <div style="font-size:12px;color:#ddd;margin-top:8px;"><strong>宣传</strong></div>
            <div style="font-size:12px;color:#999;">口号: ${(prop.slogans || []).join('；') || '-'}</div>
            <div style="font-size:12px;color:#999;">主题: ${(prop.themes || []).join('；') || '-'}</div>

            ${Array.isArray(side.warCrimes) && side.warCrimes.length > 0 ? `
            <div style="font-size:12px;color:#e74c3c;margin-top:8px;"><strong>战争罪行</strong></div>
            <div style="font-size:12px;color:#e74c3c;">${side.warCrimes.join('；')}</div>` : ''}
          </div>`;
      }

      return `
        <div class="wc-side-grid">
          ${sideCard(sideA, '#3498db')}
          ${sideCard(sideB, '#e67e22')}
        </div>
        ${w.neutralParties && w.neutralParties.length > 0 ? `
        <div class="wc-section" style="margin-top:12px;">
          <div class="wc-section-title">中立/第三方</div>
          <div class="wc-text">${[].concat(w.neutralParties).join(' / ')}</div>
        </div>` : ''}
      `;
    }

    function renderBattles(w, useEn) {
      const wp = w.warProcess || {};
      const currentYear = core.state.get('currentYear') ?? 1945;

      let html = '';

      // Render phases with battles
      if (wp.phases && wp.phases.length > 0) {
        for (const phase of wp.phases) {
          html += `<div class="wc-section">
            <div class="wc-section-title">${phase.name || ''} (${phase.startYear || ''} — ${phase.endYear || ''})</div>
            <div class="wc-text" style="margin-bottom:8px;">${phase.summary || ''}</div>`;

          for (const b of (phase.battles || [])) {
            const isActive = currentYear >= (b.startYear || 0) && currentYear <= (b.endYear || 0);
            html += `
            <div class="wc-battle ${isActive ? 'active' : ''}" data-battle-id="${b.battleId || ''}">
              <div class="wc-btl-header">
                <span class="wc-btl-name">${isActive ? '● ' : ''}${useEn ? (b.nameEn || b.name) : b.name}</span>
                <span class="wc-btl-date">${b.startYear || ''} — ${b.endYear || ''}</span>
              </div>
              <div class="wc-btl-desc">${b.description ? b.description.substring(0, 120) + '...' : ''}</div>
              <div style="font-size:11px;color:#888;margin-top:3px;">结果: ${b.result || ''} · 坐标: ${(b.coords || []).join(', ')}</div>
            </div>`;
          }
          html += '</div>';
        }
      } else if (wp.majorBattles && wp.majorBattles.length > 0) {
        html += '<div class="wc-section"><div class="wc-section-title">主要战役</div>';
        for (const b of wp.majorBattles) {
          const isActive = currentYear >= (b.startYear || 0) && currentYear <= (b.endYear || 0);
          html += `
          <div class="wc-battle ${isActive ? 'active' : ''}" data-battle-id="${b.battleId || ''}">
            <div class="wc-btl-header">
              <span class="wc-btl-name">${isActive ? '● ' : ''}${useEn ? (b.nameEn || b.name) : b.name}</span>
              <span class="wc-btl-date">${b.startYear || ''} — ${b.endYear || ''}</span>
            </div>
            <div class="wc-btl-desc">${b.description ? b.description.substring(0, 120) + '...' : ''}</div>
          </div>`;
        }
        html += '</div>';
      } else {
        html += '<div class="wc-text">暂无战役数据</div>';
      }

      // Strategy
      if (wp.strategyA || wp.strategyB) {
        html += `
        <div class="wc-section">
          <div class="wc-section-title">双方战略</div>
          <div class="wc-text"><strong>A方:</strong> ${wp.strategyA || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><strong>B方:</strong> ${wp.strategyB || '-'}</div>
        </div>`;
      }

      // Turning points
      if (wp.turningPoints && wp.turningPoints.length > 0) {
        html += `<div class="wc-section">
          <div class="wc-section-title">关键转折点</div>`;
        for (const tp of wp.turningPoints) {
          html += `<div class="wc-text" style="margin-bottom:4px;"><strong>${tp.year || ''}:</strong> ${tp.event || ''} — ${tp.description || ''}</div>`;
        }
        html += '</div>';
      }

      return html;
    }

    function renderTimeline(w, useEn) {
      const tl = w.timeline || [];
      if (tl.length === 0) return '<div class="wc-text">暂无时间轴数据</div>';

      const wp = w.warProcess || {};

      let html = '<div class="wc-section"><div class="wc-section-title">关键决策与事件</div>';

      // Sort by year
      const sorted = [...tl].sort((a, b) => (a.year || 0) - (b.year || 0));
      for (const item of sorted) {
        html += `
        <div class="wc-tl-item">
          <span class="wc-tl-year">${item.year || '?'}年</span>
          <div class="wc-tl-content">
            <span class="wc-tl-type ${item.type || 'decision'}">${item.type || 'decision'}</span>
            <strong>${item.event || ''}</strong>
            <div>${item.description || ''}</div>
            ${item.impact ? `<div style="color:#888;font-size:11px;">影响: ${item.impact}</div>` : ''}
          </div>
        </div>`;
      }
      html += '</div>';

      // Diplomacy
      if (wp.diplomacy && wp.diplomacy.length > 0) {
        html += '<div class="wc-section"><div class="wc-section-title">外交进程</div>';
        for (const d of wp.diplomacy) {
          html += `<div class="wc-tl-item">
            <span class="wc-tl-year">${d.year || ''}年</span>
            <div class="wc-tl-content"><strong>${d.event || ''}</strong><div>${d.description || ''}</div></div>
          </div>`;
        }
        html += '</div>';
      }

      // Intelligence
      if (wp.intelligence && wp.intelligence.length > 0) {
        html += '<div class="wc-section"><div class="wc-section-title">情报与密码战</div>';
        for (const i of wp.intelligence) {
          html += `<div class="wc-tl-item">
            <span class="wc-tl-year">${i.year || ''}年</span>
            <div class="wc-tl-content"><strong>${i.event || ''}</strong><div>${i.description || ''}</div></div>
          </div>`;
        }
        html += '</div>';
      }

      return html;
    }

    function renderAnalysis(w, useEn) {
      const wp = w.warProcess || {};
      const out = w.outcome || {};
      const leg = w.legacy || {};
      const va = out.victoryAnalysis || {};
      const cw = wp.cognitiveWarfare || {};
      const geo = wp.geography || {};
      const econ = wp.economics || {};
      const lti = leg.longTermImpact || {};

      return `
        <div class="wc-section">
          <div class="wc-section-title">胜负分析</div>
          <div class="wc-text"><h4>胜方制胜因素</h4>${va.winnerFactors || '-'}</div>
          <div class="wc-text" style="margin-top:8px;"><h4>败方失败原因</h4>${va.loserFactors || '-'}</div>
        </div>

        ${out.treaty?.name ? `
        <div class="wc-section">
          <div class="wc-section-title">和约/条约</div>
          <div class="wc-text"><strong>${out.treaty.name || ''}</strong> (${out.treaty.date || ''})</div>
          <div class="wc-text">${out.treaty.content || ''}</div>
        </div>` : ''}

        <div class="wc-section">
          <div class="wc-section-title">领土变更</div>
          <div class="wc-text">${out.territorialChanges || '-'}</div>
        </div>

        <div class="wc-section">
          <div class="wc-section-title">经济代价 & 人口影响</div>
          <div class="wc-text"><h4>经济代价</h4>${out.economicCost || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>人口影响</h4>${out.demographicImpact || '-'}</div>
        </div>

        <div class="wc-section">
          <div class="wc-section-title">认知战与信息操控</div>
          <div class="wc-text"><h4>心理战手段</h4>${(cw.psyOps || []).join('；') || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>伪军/合作者</h4>${(cw.collaborationists || []).join('；') || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>宣传对比</h4>${cw.propagandaComparison || '-'}</div>
        </div>

        <div class="wc-section">
          <div class="wc-section-title">地理与气候</div>
          ${(geo.keyObstacles || []).map(o =>
            `<div class="wc-text"><strong>${o.name || ''}:</strong> ${o.description || ''}</div>`
          ).join('')}
          ${(geo.extremeWeather || []).map(e =>
            `<div class="wc-text" style="margin-top:4px;"><strong>${e.year || ''}年 ${e.event || ''}:</strong> ${e.description || ''}</div>`
          ).join('')}
          <div class="wc-text" style="margin-top:4px;"><h4>非战斗减员</h4>${geo.nonCombatLosses || '-'}</div>
        </div>

        <div class="wc-section">
          <div class="wc-section-title">战争经济学</div>
          <div class="wc-text"><h4>资源依赖</h4></div>
          <div class="wc-text"><strong>A方:</strong> ${(econ.resourceDependency?.sideA?.summary) || '-'}</div>
          <div class="wc-text"><strong>B方:</strong> ${(econ.resourceDependency?.sideB?.summary) || '-'}</div>
          ${econ.foreignAid && econ.foreignAid.length > 0 ? `
          <div class="wc-text" style="margin-top:8px;"><h4>外援与租借</h4>
            ${econ.foreignAid.map(a => `• ${a.from} → ${a.to}: ${a.program || ''} — ${a.content || ''}`).join('<br>')}
          </div>` : ''}
        </div>

        <div class="wc-section">
          <div class="wc-section-title">历史影响</div>
          <div class="wc-text"><h4>直接后果</h4>${leg.immediateConsequences || '-'}</div>
          <div class="wc-text" style="margin-top:8px;"><h4>政治格局</h4>${lti.political || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>军事思想</h4>${lti.military || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>经济影响</h4>${lti.economic || '-'}</div>
          <div class="wc-text" style="margin-top:4px;"><h4>社会文化</h4>${lti.social || '-'}</div>
        </div>

        ${leg.culturalLegacy ? `
        <div class="wc-section">
          <div class="wc-section-title">文化遗产</div>
          <div class="wc-text"><strong>纪念设施:</strong> ${(leg.culturalLegacy.memorials || []).join(' / ') || '-'}</div>
          <div class="wc-text"><strong>纪念日:</strong> ${(leg.culturalLegacy.observances || []).join(' / ') || '-'}</div>
          <div class="wc-text"><strong>影视文学:</strong> ${(leg.culturalLegacy.media || []).join(' / ') || '-'}</div>
        </div>` : ''}

        ${w.sources && w.sources.length > 0 ? `
        <div class="wc-section">
          <div class="wc-section-title">参考资料</div>
          ${w.sources.map(s => `<div class="wc-text">• ${s.name || ''} (${s.type || ''}) ${s.url ? '— ' + s.url : ''}</div>`).join('')}
        </div>` : ''}
      `;
    }

    // ── Render war list ──
    function renderList(filter) {
      listContainer.innerHTML = '';
      const q = (filter || '').toLowerCase();
      let filtered = warIndex;
      if (q) {
        filtered = filtered.filter(w =>
          w.name.toLowerCase().includes(q) ||
          (w.nameEn && w.nameEn.toLowerCase().includes(q)) ||
          (w.category && w.category.includes(q)));
      }
      filtered = [...filtered].sort((a, b) => (b.startYear || 0) - (a.startYear || 0));
      listSub.textContent = `${filtered.length}/${warIndex.length} 场战争`;

      for (const w of filtered) {
        const item = document.createElement('div');
        item.className = 'wl-item';
        if (selectedWar === w.warId) item.classList.add('active');
        item.dataset.warId = w.warId;

        const tags = w.tags || {};
        const tagList = [
          tags.scale,
          ...(tags.warfareType || []).slice(0, 2),
        ].filter(Boolean);

        item.innerHTML = `
          <div>
            <span class="wl-name">${w.name}</span>
            <span class="wl-period">${w.startYear || '?'} — ${w.endYear || '?'}</span>
          </div>
          <div class="wl-tags">${tagList.map(t => `<span class="wl-tag">${t}</span>`).join('')}</div>
          <div class="wl-summary">${w.summary || ''}</div>
        `;

        item.addEventListener('click', () => selectWar(w.warId));
        listContainer.appendChild(item);
      }
    }

    function loadWarIndex() {
      fetch(WARS_INDEX)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(list => {
          warIndex = list;
          listSub.textContent = `${list.length} 场战争`;
          searchInput.addEventListener('input', () => renderList(searchInput.value));
          renderList('');
        })
        .catch(e => console.warn('[war] load index:', e));
    }

    async function loadWarData(warId) {
      try {
        const r = await fetch(`${WARS_DIR}/${warId}.json`);
        return r.ok ? r.json() : null;
      } catch { return null; }
    }

    async function selectWar(warId) {
      clearBattleMarkers();
      battlePopup.classList.remove('visible');
      detailTab = 'overview';
      selectedWar = warId;

      // Update tab active state
      card.querySelectorAll('.wc-tab').forEach(t => t.classList.remove('active'));
      const firstTab = card.querySelector('.wc-tab[data-tab="overview"]');
      if (firstTab) firstTab.classList.add('active');

      if (!warId) {
        card.classList.remove('visible');
        selectedWarData = null;
        return;
      }

      const data = await loadWarData(warId);
      if (!data) {
        console.warn('[war] failed to load:', warId);
        return;
      }

      selectedWarData = data;
      renderList(searchInput.value);

      const currentYear = core.state.get('currentYear') ?? data.startYear ?? 1945;
      renderBattleMarkers(data, currentYear);
      renderDetailCard();
    }

    // ── Toggle left list ──
    const SIBLING_IDS = ['#evt-toggle', '#traj-toggle'];
    function showSiblings() { for (const id of SIBLING_IDS) { const el = document.querySelector(id); if (el) el.style.display = ''; } }
    function hideSiblings() { for (const id of SIBLING_IDS) { const el = document.querySelector(id); if (el) el.style.display = 'none'; } }

    toggleBtn.addEventListener('click', () => {
      warListOpen = !warListOpen;
      listPanel.classList.toggle('open', warListOpen);
      toggleBtn.classList.toggle('active', warListOpen);
      toggleBtn.style.left = warListOpen ? '300px' : '10px';
      if (warListOpen) hideSiblings(); else showSiblings();
    });

    // ── Tab switching ──
    card.querySelector('#wc-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.wc-tab');
      if (!tab) return;
      detailTab = tab.dataset.tab;
      card.querySelectorAll('.wc-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderDetailCard();
    });

    // ── Close button ──
    card.querySelector('#wc-close').addEventListener('click', () => {
      card.classList.remove('visible');
      clearBattleMarkers();
      battlePopup.classList.remove('visible');
    });

    // ── Close on Escape ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (warListOpen) {
          warListOpen = false;
          listPanel.classList.remove('open');
          toggleBtn.classList.remove('active');
          toggleBtn.style.left = '10px';
          showSiblings();
        }
        card.classList.remove('visible');
        clearBattleMarkers();
        battlePopup.classList.remove('visible');
      }
    });

    // ── Close card on outside click ──
    document.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */(e.target);
      if (card.classList.contains('visible') &&
          !card.contains(t) && !t.closest('#war-toggle') && !t.closest('#war-list') &&
          !t.closest('#battle-popup')) {
        card.classList.remove('visible');
        clearBattleMarkers();
        battlePopup.classList.remove('visible');
      }
    });

    // ── Cesium click handler for battle markers ──
    const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    h.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!Cesium.defined(picked)) return;
      const entity = picked.id;
      if (!entity || !entity.properties) return;
      const battleData = entity.properties.battleData?.getValue();
      if (battleData) {
        flyToBattle(battleData);
        const locale = core.state.get('locale') ?? 'zh';
        showBattlePopup(battleData, locale === 'en');
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // ── React to year changes (update battle markers) ──
    core.state.on('currentYear', (year) => {
      if (selectedWarData) {
        renderBattleMarkers(selectedWarData, year);
        // Re-render tab content if on battles tab
        if (detailTab === 'battles') {
          renderDetailCard();
        }
      }
    });

    // ── React to locale ──
    core.state.on('locale', () => {
      if (selectedWarData) renderDetailCard();
      renderList(searchInput.value);
    });

    // ── React to map mode (markers persist across 2d/3d switch) ──
    core.state.on('mapMode', () => {
      if (selectedWarData) {
        const currentYear = core.state.get('currentYear') ?? selectedWarData.startYear ?? 1945;
        renderBattleMarkers(selectedWarData, currentYear);
      }
    });

    // ═══════════════════════════════════════════
    // ── Globe war markers (sword animation) ──
    // ═══════════════════════════════════════════
    let warLocations = {};
    let globeWarMarkers = [];
    let warMarkerOverlay = null;
    let swordAnimRaf = null;

    if (core.state.get('showWarMarkers') == null) {
      core.state.set('showWarMarkers', false);
    }

    function drawSwordMarker(ctx, s, phase) {
      const cx = s / 2, cy = s / 2;
      const bladeLen = s * 0.34;
      const swing = Math.sin(phase * Math.PI * 2) * 0.18;

      // Glow behind swords
      const g = ctx.createRadialGradient(cx, cy, bladeLen * 0.15, cx, cy, bladeLen * 0.8);
      g.addColorStop(0, 'rgba(255,180,60,0.35)');
      g.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, bladeLen * 0.8, 0, Math.PI * 2); ctx.fill();

      function blade(x, y, angle, color) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -bladeLen);
        ctx.lineTo(2.5, -bladeLen * 0.55);
        ctx.lineTo(1.5, bladeLen * 0.45);
        ctx.lineTo(0, bladeLen * 0.5);
        ctx.lineTo(-1.5, bladeLen * 0.45);
        ctx.lineTo(-2.5, -bladeLen * 0.55);
        ctx.closePath(); ctx.fill();
        // Crossguard
        ctx.fillStyle = '#daa520';
        ctx.fillRect(-7, -bladeLen * 0.58, 14, 2.5);
        // Grip
        ctx.fillStyle = '#6b3a2a';
        ctx.fillRect(-1.8, -bladeLen * 0.5, 3.6, bladeLen * 0.32);
        // Pommel
        ctx.fillStyle = '#daa520';
        ctx.beginPath(); ctx.arc(0, -bladeLen * 0.15, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      blade(cx, cy, -0.55 + swing, '#d4d4d4');
      blade(cx, cy, Math.PI + 0.55 + swing, '#eaeaea');

      // Clash spark
      const spark = 0.3 + Math.abs(Math.sin(phase * Math.PI * 2)) * 0.7;
      ctx.fillStyle = `rgba(255,255,200,${spark})`;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,200,80,${spark * 0.7})`;
      ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
    }

    function clearGlobeWarMarkers() {
      if (swordAnimRaf) { cancelAnimationFrame(swordAnimRaf); swordAnimRaf = null; }
      for (const m of globeWarMarkers) {
        if (m.el && warMarkerOverlay) warMarkerOverlay.removeChild(m.el);
      }
      globeWarMarkers = [];
    }

    function updateMarkerPositions() {
      const mode = core.state.get('mapMode') ?? '3d';
      for (const m of globeWarMarkers) {
        if (mode === '2d') {
          m.el.style.display = 'none';
          continue;
        }
        const pos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
          viewer.scene, m.cartesian,
        );
        if (pos) {
          m.el.style.display = '';
          m.el.style.left = (pos.x - m.size / 2) + 'px';
          m.el.style.top = (pos.y - m.size / 2) + 'px';
        } else {
          m.el.style.display = 'none';
        }
      }
    }

    function startSwordAnimation() {
      if (swordAnimRaf) return;
      function tick(ts) {
        const phase = (ts / 800) % 1;
        for (const m of globeWarMarkers) {
          if (m.ctx) {
            m.ctx.clearRect(0, 0, m.size, m.size);
            drawSwordMarker(m.ctx, m.size, phase + m.phaseOffset);
          }
        }
        swordAnimRaf = requestAnimationFrame(tick);
      }
      swordAnimRaf = requestAnimationFrame(tick);
    }

    function renderGlobeWarMarkers(currentYear) {
      clearGlobeWarMarkers();
      const enabled = core.state.get('showWarMarkers') ?? false;
      if (!enabled || !warLocations || Object.keys(warLocations).length === 0) return;
      if (!warIndex || warIndex.length === 0) return;

      // Create overlay container if needed
      if (!warMarkerOverlay) {
        warMarkerOverlay = document.createElement('div');
        warMarkerOverlay.id = 'war-marker-overlay';
        warMarkerOverlay.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:calc(100% - 200px);pointer-events:none;z-index:50;overflow:hidden;';
        document.body.appendChild(warMarkerOverlay);
      }

      const markerSize = 52;

      for (const w of warIndex) {
        const loc = warLocations[w.warId];
        if (!loc) continue;
        const sy = w.startYear ?? 0;
        const ey = w.endYear ?? 0;
        if (currentYear < sy || currentYear > ey) continue;

        const canvas = document.createElement('canvas');
        canvas.width = markerSize; canvas.height = markerSize;
        const ctx = canvas.getContext('2d');
        const phaseOffset = (w.warId || '').length * 0.13;

        // Draw initial frame
        drawSwordMarker(ctx, markerSize, phaseOffset);

        // Create overlay div with canvas
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;width:${markerSize}px;height:${markerSize}px;pointer-events:none;`;
        el.appendChild(canvas);

        warMarkerOverlay.appendChild(el);
        globeWarMarkers.push({
          el,
          ctx,
          size: markerSize,
          phaseOffset,
          cartesian: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat),
        });
      }

      // Position markers initially
      updateMarkerPositions();

      // Start animation
      if (globeWarMarkers.length > 0) startSwordAnimation();
    }

    function syncGlobeMarkers() {
      const enabled = core.state.get('showWarMarkers') ?? false;
      if (!enabled) {
        clearGlobeWarMarkers();
        return;
      }
      if (Object.keys(warLocations).length === 0) {
        fetch(WAR_LOCATIONS_URL)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(data => {
            warLocations = data;
            if (core.state.get('showWarMarkers')) {
              const year = core.state.get('currentYear') ?? 1945;
              renderGlobeWarMarkers(year);
            }
          })
          .catch(() => {});
      } else {
        const year = core.state.get('currentYear') ?? 1945;
        renderGlobeWarMarkers(year);
      }
    }

    // Camera move → update overlay positions (throttled)
    let _posUpdatePending = false;
    viewer.scene.preRender.addEventListener(() => {
      if (globeWarMarkers.length === 0) return;
      if (_posUpdatePending) return;
      _posUpdatePending = true;
      requestAnimationFrame(() => {
        _posUpdatePending = false;
        updateMarkerPositions();
      });
    });

    core.state.on('showWarMarkers', syncGlobeMarkers);

    core.state.on('currentYear', (year) => {
      if ((core.state.get('showWarMarkers') ?? false) && Object.keys(warLocations).length > 0) {
        renderGlobeWarMarkers(year);
      }
    });

    syncGlobeMarkers();

    // ── Init ──
    loadWarIndex();
  },
};
