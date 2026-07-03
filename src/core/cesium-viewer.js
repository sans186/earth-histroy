/**
 * Cesium Viewer factory.
 *
 * Creates and returns a configured Cesium.Viewer instance.
 * Does NOT set the Ion token – that is done once in main.js.
 */

import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Set worker base URL globally so Cesium can find Web Workers
window.CESIUM_BASE_URL = '/cesium/';

/**
 * @param {string} containerId  DOM element id
 * @param {{ lon: number, lat: number, height: number }} initialView
 * @returns {import('cesium').Viewer}
 */
export function createViewer(containerId, initialView) {
  const viewer = new Cesium.Viewer(containerId, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    homeButton: false,
    geocoder: false,
    sceneModePicker: true,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'],
      credit: '© OpenStreetMap contributors',
    }),
  });

  viewer.cesiumWidget.creditContainer.style.display = 'none';

  viewer.scene.globe.enableLighting = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;

  // Ocean base color – shows through where imagery tiles are absent or loading
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a6080');

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      initialView.lon,
      initialView.lat,
      initialView.height,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
    duration: 2,
  });

  return viewer;
}
