/**
 * RSS feed utilities for fetching SkidrowReloaded links
 */

import Parser from 'rss-parser';

/**
 * Fetch SkidrowReloaded links for a game from their RSS feed
 */
export async function getSkidrowLinks(
  gameName: string,
  sinceDate: Date
): Promise<string[]> {
  try {
    const feedUrl = 'https://feeds.feedburner.com/SkidrowReloadedGames';
    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);

    const links: string[] = [];
    const normalizedGameName = gameName
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s/g, '');

    if (!feed.items) {
      return links;
    }

    for (const item of feed.items) {
      if (!item.categories || !item.pubDate || !item.guid) {
        continue;
      }

      const pubDate = new Date(item.pubDate);
      const guidUrl = item.guid;

      for (const category of item.categories) {
        const normalizedCat = category
          .toLowerCase()
          .replace(/\./g, '')
          .replace(/\s/g, '');

        if (
          normalizedCat === normalizedGameName &&
          pubDate >= sinceDate &&
          guidUrl.startsWith('https://www.skidrowreloaded.com/')
        ) {
          links.push(guidUrl);
        }
      }
    }

    return links;
  } catch (error) {
    console.error(`Error fetching Skidrow links for ${gameName}:`, error);
    return [];
  }
}
