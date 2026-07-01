/**
 * Cesium Viewer factory.
 *
 * Creates and returns a configured Cesium.Viewer instance.
 * Does NOT set the Ion token – that is done once in main.js.
 */

import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

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
  });

  viewer.cesiumWidget.creditContainer.style.display = 'none';

  viewer.scene.globe.enableLighting = true;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;

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
