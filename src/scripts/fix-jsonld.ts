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

/** Check if an ItemList item name looks like the post title (not a product) */
function isPostTitle(name: string, postTitle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = norm(name);
  const t = norm(postTitle);
  // If the item name shares 25+ chars of normalized text with the title, it IS the title
  return n.length >= 20 && (n.includes(t.substring(0, 25)) || t.includes(n.substring(0, 25)));
}

/** Get the longest answer paragraph from HTML following a heading */
function getFullAnswer(html: string, question: string): string | null {
  const escaped = question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<h[23][^>]*>[^<]*${escaped.substring(0, 40)}[^<]*<\\/h[23]>([\\s\\S]*?)(?=<h[2]|$)`, 'i');
  const match = regex.exec(html);
  if (!match) return null;
  // Collect all <p> text in that section, up to 500 chars
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  let total = 0;
  while ((pMatch = pRegex.exec(match[1])) !== null && total < 500) {
    const text = pMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) { paragraphs.push(text); total += text.length; }
  }
  const combined = paragraphs.join(' ').trim();
  return combined.length > 20 ? combined.substring(0, 500) : null;
}

/** Check if a name is a non-product heading that should be excluded */
function isNonProductHeading(name: string): boolean {
  if (!name) return true;
  // Question headings (FAQ-like)
  if (name.endsWith('?')) return true;
  // Structural / non-product headings
  const skipPattern = /FAQ|Table of Contents|Key Takeaways|Conclusion|How We|Bottom Line|Honorable Mentions?|Final (?:Thoughts|Verdict|Words)|What (?:to|You)|Where |When |Which |Why |How (?:Do|Does|Can|To|Should|Is|Are)|Is It|Are There/i;
  if (skipPattern.test(name)) return true;
  // Educational / analysis / collection headings — not single products
  const analysisPattern = /Explained(?:\s*:|$)|(?:What|Tips?)\s+(?:International|You|To)|Bestsellers?|Best\s+Sellers?|Buying\s+Guide|Shopping\s+Guide|Overview|Our\s+(?:Top|Pick|Verdict|Methodology)|Ingredients?\s+(?:List|Guide|Breakdown)|Sun(?:screen)?\s+(?:Types?|Guide|Tips?)|SPF\s+(?:Guide|Explained|Ratings?)|PA\s+Rating|Skin\s+Types?\s+Guide|Comparison\s+(?:Table|Chart)|Rating\s+System|Travelers?\s+(?:Miss|Need|Should)|Spring\s+\d{4}|Summer\s+\d{4}|Fall\s+\d{4}|Winter\s+\d{4}|(?:Q[1-4])\s+\d{4}|What(?:'s|s)?\s+(?:Actually|Really|Worth|New)/i;
  return analysisPattern.test(name);
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

      const postTitle = post.title.rendered.replace(/<[^>]+>/g, '').trim();
      const htmlContent = post.content.rendered;
      const sectionImages = extractSectionImages(htmlContent);
      let changed = false;

      // Fix FAQPage: expand truncated answers from actual HTML content
      for (const schema of schemas) {
        if (schema['@type'] !== 'FAQPage') continue;
        for (const entity of (schema.mainEntity || [])) {
          const currentAnswer = entity.acceptedAnswer?.text || '';
          // If answer is exactly 300 chars it was truncated — fetch full answer from HTML
          if (currentAnswer.length >= 290) {
            const fullAnswer = getFullAnswer(htmlContent, entity.name);
            if (fullAnswer && fullAnswer.length > currentAnswer.length) {
              entity.acceptedAnswer.text = fullAnswer;
              changed = true;
              console.log(`  FAQ expanded: "${entity.name.substring(0, 50)}" (${currentAnswer.length} → ${fullAnswer.length} chars)`);
            }
          }
        }
      }

      // Deduplicate ItemList schemas — keep the one with more valid items, remove others
      const itemListIndices = schemas.reduce<number[]>((acc, s, i) => {
        if (s['@type'] === 'ItemList') acc.push(i);
        return acc;
      }, []);
      if (itemListIndices.length > 1) {
        // Sort by number of valid items descending, remove all but the best
        const scored = itemListIndices.map(idx => {
          const items = schemas[idx].itemListElement || [];
          const validCount = items.filter((it: any) => {
            const n = it.item?.name || it.name || '';
            return !isNonProductHeading(n) && !isPostTitle(n, postTitle);
          }).length;
          return { idx, validCount };
        }).sort((a, b) => b.validCount - a.validCount);
        // Remove all duplicate ItemLists (keep first/best, remove the rest)
        for (let k = scored.length - 1; k >= 1; k--) {
          schemas.splice(scored[k].idx, 1);
          changed = true;
          console.log(`  Removed duplicate ItemList (kept best with ${scored[0].validCount} valid items)`);
        }
      }

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

          // Remove non-product items (structural headings, question headings, post title)
          if (isNonProductHeading(productName) || isPostTitle(productName, postTitle)) {
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

          // Google requires Product to have at least one of: offers, review, aggregateRating
          // If none present, downgrade to a plain ListItem (no @type: Product) to avoid GSC errors
          const hasRequiredProductField = product.offers || product.review || product.aggregateRating;
          if (!hasRequiredProductField) {
            // Preserve name and image but drop Product type to avoid validation error
            const plainItem = { '@type': 'ListItem', position, name: product.name } as any;
            if (product.image) plainItem.image = product.image;
            if (product.url) plainItem.url = product.url;
            console.log(`  ⬇️  Downgraded Product→ListItem (no offers/review/rating): "${productName.substring(0, 60)}"`);
            changed = true;
            filteredItems.push(plainItem);
            position++;
            continue;
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
