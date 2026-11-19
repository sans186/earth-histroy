/**
 * A guided tour across the globe: one stop per step.
 *
 * `year` follows the timeline convention — negative values are BCE. `height`
 * is the camera altitude in metres; without it the viewer keeps its own zoom.
 */
export interface StoryStep {
  year: number;
  lon: number;
  lat: number;
  height?: number;
  title: string;
  caption: string;
  duration: number;
}

export interface Story {
  id: string;
  title: string;
  subtitle: string;
  steps: StoryStep[];
}
