/**
 * Test Facebook Page API access
 * Usage: npx tsx src/scripts/test-facebook.ts
 */
import axios from 'axios';

const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const FB_PAGE_ID = process.env.FB_PAGE_ID || '';
const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0';
const GRAPH_API = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function main() {
  console.log('=== Facebook API Access Test ===\n');

  if (!FB_ACCESS_TOKEN) {
    console.error('❌ FB_ACCESS_TOKEN is not set');
    process.exit(1);
  }
  if (!FB_PAGE_ID) {
    console.error('❌ FB_PAGE_ID is not set');
    process.exit(1);
  }

  console.log(`Page ID: ${FB_PAGE_ID}`);
  console.log(`API Version: ${GRAPH_API_VERSION}\n`);

  // 1. Check token validity
  console.log('1️⃣  Checking token validity...');
  try {
    const debugRes = await axios.get(`${GRAPH_API}/debug_token`, {
      params: {
        input_token: FB_ACCESS_TOKEN,
        access_token: FB_ACCESS_TOKEN,
      },
    });
    const data = debugRes.data.data;
    console.log(`   ✅ Token valid`);
    console.log(`   Type: ${data.type}`);
    console.log(`   App ID: ${data.app_id}`);
    console.log(`   Scopes: ${data.scopes?.join(', ') || 'N/A'}`);
    if (data.expires_at) {
      const expiresDate = new Date(data.expires_at * 1000);
      console.log(`   Expires: ${data.expires_at === 0 ? 'Never' : expiresDate.toISOString()}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`   ❌ Token debug failed: ${JSON.stringify(error.response?.data)}`);
    } else {
      console.error(`   ❌ Token debug failed: ${error}`);
    }
  }

  // 2. Check page access
  console.log('\n2️⃣  Checking page access...');
  try {
    const pageRes = await axios.get(`${GRAPH_API}/${FB_PAGE_ID}`, {
      params: {
        fields: 'name,id,fan_count,category',
        access_token: FB_ACCESS_TOKEN,
      },
    });
    const page = pageRes.data;
    console.log(`   ✅ Page accessible`);
    console.log(`   Name: ${page.name}`);
    console.log(`   ID: ${page.id}`);
    console.log(`   Category: ${page.category || 'N/A'}`);
    console.log(`   Fans: ${page.fan_count ?? 'N/A'}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`   ❌ Page access failed: ${JSON.stringify(error.response?.data)}`);
    } else {
      console.error(`   ❌ Page access failed: ${error}`);
    }
  }

  // 3. Check publish_pages / pages_manage_posts permission by reading feed
  console.log('\n3️⃣  Checking feed read access...');
  try {
    const feedRes = await axios.get(`${GRAPH_API}/${FB_PAGE_ID}/feed`, {
      params: {
        limit: 3,
        fields: 'id,message,created_time',
        access_token: FB_ACCESS_TOKEN,
      },
    });
    const posts = feedRes.data.data || [];
    console.log(`   ✅ Feed accessible (${posts.length} recent posts)`);
    for (const p of posts) {
      const msg = p.message?.slice(0, 60) || '(no message)';
      console.log(`   - ${p.created_time}: ${msg}...`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`   ❌ Feed access failed: ${JSON.stringify(error.response?.data)}`);
    } else {
      console.error(`   ❌ Feed access failed: ${error}`);
    }
  }

  // 4. Test write permission (dry run — post then immediately delete)
  console.log('\n4️⃣  Testing write access (post + delete)...');
  try {
    const testRes = await axios.post(
      `${GRAPH_API}/${FB_PAGE_ID}/feed`,
      {
        message: '[API Test] Auto-blog Facebook access check — will be deleted immediately.',
        published: false, // unpublished test
      },
      {
        params: { access_token: FB_ACCESS_TOKEN },
      },
    );
    const testPostId = testRes.data.id;
    console.log(`   ✅ Write access OK (created unpublished post: ${testPostId})`);

    // Clean up
    await axios.delete(`${GRAPH_API}/${testPostId}`, {
      params: { access_token: FB_ACCESS_TOKEN },
    });
    console.log(`   🗑️  Cleaned up test post`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errData = error.response?.data?.error;
      console.error(`   ❌ Write test failed: [${errData?.code}] ${errData?.message}`);
      if (errData?.code === 200) {
        console.error('   💡 Hint: Token may lack pages_manage_posts permission');
      }
    } else {
      console.error(`   ❌ Write test failed: ${error}`);
    }
  }

  console.log('\n=== Done ===');
}

main();
