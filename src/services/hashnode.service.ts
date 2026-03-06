import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const HASHNODE_GQL = 'https://gql.hashnode.com';

export class HashnodeService {
  private token: string;
  private publicationId: string;

  constructor(token: string, publicationId: string) {
    this.token = token;
    this.publicationId = publicationId;
  }

  async syndicateBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    try {
      const tags = content.tags.slice(0, 5).map((tag) => ({
        slug: tag.replace(/\s+/g, '-').toLowerCase(),
        name: tag,
      }));

      const slug = content.slug ?? content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
              contentMarkdown: content.html,
              publicationId: this.publicationId,
              slug,
              originalArticleURL: post.url,
              tags,
              subtitle: content.excerpt.substring(0, 150),
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
      logger.info(`Hashnode article published: ${published?.url ?? published?.id}`);
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
