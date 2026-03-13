import axios from 'axios';
import { logger } from '../utils/logger.js';
import { htmlToMarkdown } from '../utils/html-to-markdown.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const HASHNODE_GQL = 'https://gql.hashnode.com';

/** Hashnode syndicates all content categories for maximum reach */
const HASHNODE_ALLOWED_CATEGORIES = new Set([
  'Korean Tech', 'Korean Finance', 'Korean Crypto', 'Korean Automotive',
  'K-Beauty', 'Korea Travel', 'K-Entertainment',
]);

export class HashnodeService {
  private token: string;
  private publicationId: string;

  constructor(token: string, publicationId: string) {
    this.token = token;
    this.publicationId = publicationId;
  }

  async syndicateBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    try {
      // Only syndicate relevant content to Hashnode
      if (!HASHNODE_ALLOWED_CATEGORIES.has(content.category)) {
        logger.debug(`Hashnode syndication skipped: "${content.category}" not a relevant category`);
        return;
      }

      // Validate canonical URL before syndication
      if (!post.url || !post.url.startsWith('http')) {
        logger.warn(`Hashnode syndication skipped: invalid canonical URL "${post.url}"`);
        return;
      }

      const tags = content.tags.slice(0, 5).map((tag) => ({
        slug: tag.replace(/\s+/g, '-').toLowerCase(),
        name: tag,
      }));

      const slug =
        content.slug ??
        content.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

      const utmUrl = buildUtmUrl(post.url, 'hashnode', 'syndication', extractSlugFromUrl(post.url));
      const contentMarkdown = htmlToMarkdown(content.html) +
        `\n\n---\n*Originally published at [${new URL(post.url).hostname}](${utmUrl})*`;

      const mutation = `
        mutation PublishPost($input: PublishPostInput!) {
          publishPost(input: $input) {
            post { id url title }
          }
        }
      `;

      const response = await axios.post(
        HASHNODE_GQL,
        {
          query: mutation,
          variables: {
            input: {
              title: content.title,
              contentMarkdown,
              publicationId: this.publicationId,
              slug,
              originalArticleURL: post.url,
              tags,
              subtitle: content.excerpt.substring(0, 150),
              isOriginalOnMyBlog: false,
            },
          },
        },
        { headers: this.headers() },
      );

      const data = response.data;
      if (data.errors?.length) {
        throw new Error(data.errors[0].message);
      }

      const published = data.data?.publishPost?.post;
      logger.info(`Hashnode article published: ${published?.url ?? published?.id} (canonical: ${post.url})`);
    } catch (error) {
      logger.warn(`Hashnode syndication failed (non-critical): ${error instanceof Error ? error.message : error}`);
    }
  }

  private headers() {
    return {
      Authorization: this.token,
      'Content-Type': 'application/json',
    };
  }
}
