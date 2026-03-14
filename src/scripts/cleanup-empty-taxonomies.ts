/**
 * 빈 태그/카테고리 일괄 삭제 스크립트
 * 포스트 0개인 태그/카테고리를 삭제하여 크롤 예산 확보
 *
 * 실행: npx tsx src/scripts/cleanup-empty-taxonomies.ts
 */
import 'dotenv/config';
import axios from 'axios';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const token = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

interface Taxonomy { id: number; name: string; count: number; slug: string; }

async function main() {
  // === Tags ===
  const allTags: Taxonomy[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/tags', {
      params: { per_page: 100, page, _fields: 'id,name,count,slug' },
    });
    allTags.push(...(data as Taxonomy[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }

  const emptyTags = allTags.filter(t => t.count === 0);
  const thinTags = allTags.filter(t => t.count === 1);
  console.log(`총 태그: ${allTags.length}개`);
  console.log(`빈 태그 (0 포스트): ${emptyTags.length}개 → 삭제`);
  console.log(`얇은 태그 (1 포스트): ${thinTags.length}개 → noindex만\n`);

  let tagDeleted = 0;
  for (const tag of emptyTags) {
    try {
      await api.delete(`/tags/${tag.id}`, { params: { force: true } });
      tagDeleted++;
      if (tagDeleted % 20 === 0) console.log(`  삭제 진행: ${tagDeleted}/${emptyTags.length}`);
    } catch (error) {
      console.log(`  실패 [${tag.id}] ${tag.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`✅ 빈 태그 ${tagDeleted}개 삭제 완료\n`);

  // === Categories ===
  const { data: cats } = await api.get('/categories', {
    params: { per_page: 100, _fields: 'id,name,count,slug' },
  });
  const emptyCats = (cats as Taxonomy[]).filter(c => c.count === 0 && c.slug !== 'uncategorized');
  console.log(`빈 카테고리 (0 포스트): ${emptyCats.length}개`);
  for (const c of emptyCats) console.log(`  [${c.id}] ${c.name} (${c.slug})`);

  let catDeleted = 0;
  for (const cat of emptyCats) {
    try {
      await api.delete(`/categories/${cat.id}`, { params: { force: true } });
      catDeleted++;
    } catch (error) {
      console.log(`  실패 [${cat.id}]: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`✅ 빈 카테고리 ${catDeleted}개 삭제 완료\n`);

  console.log('=== 요약 ===');
  console.log(`태그: ${allTags.length} → ${allTags.length - tagDeleted} (${tagDeleted}개 삭제)`);
  console.log(`빈 카테고리: ${emptyCats.length} → 0 (${catDeleted}개 삭제)`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
