/**
 * fix-jsonld.ts
 * 기존 포스트의 JSON-LD 구조화 데이터를 수정합니다.
 * - Product 스키마에서 비제품 항목(Honorable Mentions, 질문형 제목) 제거
 * - Product 항목에 image 필드 추가 (포스트 본문에서 추출)
 *
 * Usage: npx tsx src/scripts/fix-jsonld.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const DRY_RUN = process.argv.includes('--dry-run');

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

interface WPPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  meta: Record<string, string>;
}

/** Check if a name is a non-product heading that should be excluded */
function isNonProductHeading(name: string): boolean {
  if (!name) return true;
  // Question headings (FAQ-like)
  if (name.endsWith('?')) return true;
  // Structural / non-product headings
  const skipPattern = /FAQ|Table of Contents|Key Takeaways|Conclusion|How We|Bottom Line|Honorable Mentions?|Final (?:Thoughts|Verdict|Words)|What (?:to|You)|Where |When |Which |Why |How (?:Do|Does|Can|To|Should|Is|Are)|Is It|Are There/i;
  return skipPattern.test(name);
}

/** Extract image URLs from HTML sections, keyed by product name */
function extractSectionImages(html: string): Map<string, string> {
  const imageMap = new Map<string, string>();
  const regex = /<h[23][^>]*>(?:\d+[.):\s]+|#\d+[:\s]+)?(.*?)<\/h[23]>([\s\S]*?)(?=<h[23]|$)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].replace(/<[^>]+>/g, '').trim();
    const section = match[2];
    const imgMatch = section.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && name) {
      imageMap.set(name.toLowerCase(), imgMatch[1]);
    }
  }
  return imageMap;
}

async function fixJsonLd(): Promise<void> {
  console.log(`\n🔧 JSON-LD Fix Script ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  let page = 1;
  let totalFixed = 0;
  let totalPosts = 0;

  while (true) {
    let posts: WPPost[];
    try {
      const resp = await api.get<WPPost[]>('/posts', {
        params: {
          per_page: 20,
          page,
          status: 'publish',
          _fields: 'id,title,content,link,meta',
        },
      });
      posts = resp.data;
    } catch (e: any) {
      // 400 = no more pages
      if (e.response?.status === 400) break;
      throw e;
    }

    if (posts.length === 0) break;

    for (const post of posts) {
      totalPosts++;
      const jsonldRaw = post.meta?._autoblog_jsonld;
      if (!jsonldRaw) continue;

      let schemas: any[];
      try {
        schemas = JSON.parse(jsonldRaw);
        if (!Array.isArray(schemas)) continue;
      } catch {
        continue;
      }

      const htmlContent = post.content.rendered;
      const sectionImages = extractSectionImages(htmlContent);
      let changed = false;

      for (let i = schemas.length - 1; i >= 0; i--) {
        const schema = schemas[i];
        if (schema['@type'] !== 'ItemList') continue;

        const items = schema.itemListElement;
        if (!Array.isArray(items)) continue;

        // Filter out non-product items and add image field
        const originalLength = items.length;
        const filteredItems: any[] = [];
        let position = 1;

        for (const item of items) {
          if (item['@type'] !== 'ListItem') {
            filteredItems.push(item);
            continue;
          }

          const product = item.item;
          if (!product || product['@type'] !== 'Product') {
            // Non-product ListItem (e.g., simple name-only ItemList) — keep as-is
            filteredItems.push({ ...item, position });
            position++;
            continue;
          }

          const productName = product.name || '';

          // Remove non-product items
          if (isNonProductHeading(productName)) {
            console.log(`  ❌ Removed non-product: "${productName.substring(0, 60)}"`);
            changed = true;
            continue;
          }

          // Add image if missing
          if (!product.image) {
            const imageUrl = sectionImages.get(productName.toLowerCase());
            if (imageUrl) {
              product.image = imageUrl;
              changed = true;
            }
          }

          filteredItems.push({ ...item, item: product, position });
          position++;
        }

        if (filteredItems.length !== originalLength) {
          schema.itemListElement = filteredItems;
          schema.numberOfItems = filteredItems.length;
          changed = true;
        } else {
          schema.itemListElement = filteredItems;
        }

        // Remove ItemList entirely if less than 2 valid items remain
        if (filteredItems.length < 2) {
          schemas.splice(i, 1);
          changed = true;
          console.log(`  🗑️  Removed empty ItemList (< 2 items)`);
        }
      }

      if (changed) {
        const title = post.title.rendered.replace(/<[^>]+>/g, '').trim();
        console.log(`\n📝 [${post.id}] ${title.substring(0, 60)}`);
        console.log(`   URL: ${post.link}`);

        if (!DRY_RUN) {
          try {
            await api.post(`/posts/${post.id}`, {
              meta: { _autoblog_jsonld: JSON.stringify(schemas) },
            });
            console.log(`   ✅ Updated`);
          } catch (e: any) {
            console.log(`   ⚠️  Update failed: ${e.response?.status || e.message}`);
          }
        } else {
          console.log(`   🔍 Would update (dry-run)`);
        }
        totalFixed++;
      }
    }

    page++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Total: ${totalPosts} posts scanned, ${totalFixed} fixed ${DRY_RUN ? '(dry-run)' : ''}`);
}

fixJsonLd().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
