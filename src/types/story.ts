/**
 * A guided tour across the globe: one stop per step.
 *
 * `year` follows the timeline convention — negative values are BCE. `height`
 * is the camera altitude in metres; without it the viewer keeps its own zoom.
 * The `*En` fields are optional English copy; the unprefixed fields are the
 * Chinese original, so a story can ship before its translation does.
 */
export interface StoryStep {
  year: number;
  lon: number;
  lat: number;
  height?: number;
  title: string;
  titleEn?: string;
  caption: string;
  captionEn?: string;
  duration: number;
}

export interface Story {
  id: string;
  title: string;
  titleEn?: string;
  subtitle: string;
  subtitleEn?: string;
  steps: StoryStep[];
}
