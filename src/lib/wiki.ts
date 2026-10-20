/**
 * Wikipedia links.
 *
 * There are two kinds here, and the difference is worth keeping honest in the
 * UI rather than papering over it:
 *
 *   - `wikiArticleUrl` — the article title is known, so the link is a citation.
 *     Cliopatria ships a `Wikipedia` title on every polity feature, so polities
 *     get this one.
 *   - `wikiSearchUrl` — only a display name is known. War, person and event
 *     profiles carry no article title, so this lands on the search results.
 *     Still useful, but one hop further from the answer.
 */

/**
 * A link to a known Wikipedia article.
 *
 * Cliopatria titles arrive space-separated ("Song dynasty"); the URL form uses
 * underscores, and everything else is percent-encoded so a stray slash or
 * parenthesis cannot break out of the path.
 */
export function wikiArticleUrl(title: string): string {
  const cleaned = title.trim().replace(/\s+/g, '_');
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(cleaned)}`;
}

/**
 * A link to Wikipedia search results for `query`.
 *
 * Defaults to the Chinese edition because the names this is called with are the
 * Chinese display names the interface already shows, and those are what a
 * reader would otherwise type into the search box themselves.
 */
export function wikiSearchUrl(query: string, lang = 'zh'): string {
  return `https://${lang}.wikipedia.org/w/index.php?search=${encodeURIComponent(query.trim())}`;
}
