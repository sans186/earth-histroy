/**
 * Which viewports get the desktop-only notice.
 *
 * The atlas assumes a mouse: the globe is dragged, the map zooms on scroll and
 * the time scale is scrubbed across its full width. A phone cannot drive any of
 * that, so it gets a notice instead of a half-broken layout.
 *
 * The test is deliberately a media query rather than a width alone. A desktop
 * window dragged narrow still has a fine pointer, and replacing the interface
 * with the notice there would be a regression; a tablet in landscape is often
 * wider than 900px but still touch-only, so both conditions must agree.
 */

/**
 * The notice condition: `(max-width: 900px) and (pointer: coarse)`.
 *
 * `max-width` is inclusive, so 900px itself is still a narrow screen.
 */
export const MOBILE_NOTICE_QUERY = '(max-width: 900px) and (pointer: coarse)';

/** The width at or below which a coarse-pointer device sees the notice. */
export const MOBILE_NOTICE_MAX_WIDTH = 900;

/**
 * Pure form of {@link MOBILE_NOTICE_QUERY}, for callers that already have the
 * width and pointer type (and for tests).
 */
export function isMobileNoticeViewport(width: number, coarsePointer: boolean): boolean {
  return coarsePointer && width <= MOBILE_NOTICE_MAX_WIDTH;
}
