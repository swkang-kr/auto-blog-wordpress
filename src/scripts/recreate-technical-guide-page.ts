/**
 * recreate-technical-guide-page.ts
 * guide-daily-picks-technical 페이지를 재생성합니다.
 * (fix-pages-sitemap.ts의 /tech/i 패턴에 의해 실수로 삭제됨)
 */
import axios from 'axios';
import { logger } from '../utils/logger.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  auth: { username: WP_USERNAME, password: WP_APP_PASSWORD },
  timeout: 30_000,
});

const PAGE_SLUG = 'guide-daily-picks-technical';
const PAGE_TITLE = '종목분석 기술적 분석 완전 가이드 (2026): RSI·MACD·볼린저밴드로 매매 타이밍 잡기';

const PAGE_CONTENT = `
<!-- wp:paragraph {"className":"intro-paragraph"} -->
<p class="intro-paragraph">한국 주식시장에서 기술적 분석은 <strong>매매 타이밍을 결정하는 핵심 도구</strong>입니다. RSI, MACD, 볼린저밴드 등 주요 보조지표를 올바르게 활용하면 감정이 아닌 데이터 기반으로 종목을 분석하고 수익률을 높일 수 있습니다. 이 가이드는 입문자부터 중급 투자자까지 실전에서 바로 적용할 수 있는 기술적 분석 방법론을 체계적으로 안내합니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>목차</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li><a href="#what-is-technical">기술적 분석이란?</a></li>
  <li><a href="#rsi">RSI (상대강도지수) 활용법</a></li>
  <li><a href="#macd">MACD 매매 신호 읽기</a></li>
  <li><a href="#bollinger">볼린저밴드 전략</a></li>
  <li><a href="#moving-average">이동평균선 조합 전략</a></li>
  <li><a href="#volume">거래량 분석</a></li>
  <li><a href="#candlestick">캔들스틱 패턴</a></li>
  <li><a href="#combined">복합 지표 활용 전략</a></li>
  <li><a href="#faq">자주 묻는 질문</a></li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2 id="what-is-technical">기술적 분석이란?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>기술적 분석(Technical Analysis)은 <strong>과거 주가 움직임과 거래량 데이터를 분석</strong>하여 미래 주가 방향을 예측하는 방법론입니다. 기본적 분석이 기업의 내재가치에 집중한다면, 기술적 분석은 시장 참여자들의 심리와 수급 흐름을 차트로 읽어냅니다.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>한국 주식시장에서 기술적 분석이 특히 중요한 이유는 <strong>개인투자자 비중이 높아 심리적 요인이 주가에 크게 반영</strong>되기 때문입니다. 코스피·코스닥 종목 모두 기술적 지지·저항선에서 강한 반응을 보이는 경향이 있습니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 id="rsi">RSI (상대강도지수) 활용법</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>RSI(Relative Strength Index)는 <strong>0~100 사이의 값으로 과매수·과매도 구간을 측정</strong>하는 모멘텀 지표입니다. 기본 설정은 14일 기준이며, 한국 시장에서는 다음 기준이 널리 사용됩니다.</p>
<!-- /wp:paragraph -->

<!-- wp:table -->
<figure class="wp-block-table"><table><thead><tr><th>RSI 구간</th><th>의미</th><th>매매 전략</th></tr></thead><tbody><tr><td>70 이상</td><td>과매수</td><td>매도 신호 (단기 고점 가능성)</td></tr><tr><td>50~70</td><td>강세 유지</td><td>추세 추종 매수 유지</td></tr><tr><td>30~50</td><td>약세 전환 가능</td><td>관망 또는 부분 익절</td></tr><tr><td>30 이하</td><td>과매도</td><td>매수 신호 (반등 가능성)</td></tr></tbody></table></figure>
<!-- /wp:table -->

<!-- wp:paragraph -->
<p><strong>실전 팁:</strong> RSI 다이버전스를 주목하세요. 주가가 신고점을 갱신하는데 RSI가 이전 고점보다 낮으면 <em>약세 다이버전스</em>로 추세 반전 신호입니다. 반대로 주가가 신저점인데 RSI가 이전 저점보다 높으면 <em>강세 다이버전스</em>로 반등 가능성이 높습니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 id="macd">MACD 매매 신호 읽기</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>MACD(Moving Average Convergence Divergence)는 <strong>두 개의 지수이동평균(EMA) 차이로 추세 변화를 감지</strong>하는 지표입니다. 기본 설정은 12일 EMA - 26일 EMA = MACD선이며, 9일 EMA를 시그널선으로 사용합니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>핵심 매매 신호</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li><strong>골든크로스</strong>: MACD선이 시그널선을 위로 돌파 → 매수 신호</li>
  <li><strong>데드크로스</strong>: MACD선이 시그널선을 아래로 돌파 → 매도 신호</li>
  <li><strong>제로선 돌파</strong>: MACD가 0선 위로 올라서면 상승 추세 전환</li>
  <li><strong>히스토그램 수축</strong>: 막대가 줄어들면 현재 추세 약화 신호</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p><strong>주의사항:</strong> MACD는 후행 지표이므로 횡보 구간에서는 잦은 허위 신호가 발생합니다. RSI나 볼린저밴드와 함께 사용하면 신뢰도가 높아집니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 id="bollinger">볼린저밴드 전략</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>볼린저밴드(Bollinger Bands)는 <strong>20일 이동평균선을 중심으로 상하 2 표준편차 밴드를 형성</strong>하여 주가의 변동성과 추세를 동시에 파악합니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>핵심 전략</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li><strong>밴드 수축(Squeeze)</strong>: 밴드 폭이 좁아지면 큰 움직임 예고 → 방향 확인 후 진입</li>
  <li><strong>밴드 터치 매매</strong>: 하단 밴드 접촉 시 매수, 상단 밴드 접촉 시 익절 고려</li>
  <li><strong>중심선 지지</strong>: 20일선 지지 여부로 추세 강도 확인</li>
  <li><strong>밴드 워킹</strong>: 주가가 상단 밴드를 타고 오르면 강한 상승 추세</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2 id="moving-average">이동평균선 조합 전략</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>한국 주식시장에서 가장 많이 참고되는 이동평균선 조합입니다.</p>
<!-- /wp:paragraph -->

<!-- wp:table -->
<figure class="wp-block-table"><table><thead><tr><th>이동평균선</th><th>의미</th><th>활용법</th></tr></thead><tbody><tr><td>5일선</td><td>단기 추세</td><td>단타 매매 기준선</td></tr><tr><td>20일선</td><td>중기 추세 (볼린저 중심)</td><td>스윙 매매 진입·청산 기준</td></tr><tr><td>60일선</td><td>중장기 추세</td><td>주요 지지·저항 확인</td></tr><tr><td>120일선</td><td>장기 추세</td><td>경기 사이클 확인</td></tr><tr><td>240일선</td><td>초장기 추세</td><td>연간 주요 지지선</td></tr></tbody></table></figure>
<!-- /wp:table -->

<!-- wp:paragraph -->
<p><strong>정배열·역배열:</strong> 5일 > 20일 > 60일 > 120일 순서로 배열되면 <em>정배열</em>로 강한 상승 추세입니다. 반대면 역배열로 하락 추세가 지속됩니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 id="volume">거래량 분석</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>거래량은 주가 움직임의 <strong>신뢰도를 검증하는 핵심 지표</strong>입니다. 거래량 없는 주가 상승은 지속되기 어렵습니다.</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
  <li><strong>급등+거래량 폭증</strong>: 세력 진입 가능성, 모멘텀 매매 기회</li>
  <li><strong>상승+거래량 감소</strong>: 상승 추세 약화, 고점 접근 주의</li>
  <li><strong>하락+거래량 폭증</strong>: 투매 가능성, 바닥 확인 후 반등 대기</li>
  <li><strong>하락+거래량 감소</strong>: 매도 소진, 추세 반전 가능성</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2 id="candlestick">캔들스틱 패턴</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>캔들스틱 패턴은 <strong>단기 심리 변화를 가장 빠르게 포착</strong>하는 도구입니다. 주요 반전 패턴을 알아두면 매매 타이밍을 크게 개선할 수 있습니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>주요 상승 반전 패턴</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li><strong>망치형(Hammer)</strong>: 아래 꼬리가 몸통의 2배 이상 → 매수세 강화</li>
  <li><strong>상승 잉걸핀(Bullish Engulfing)</strong>: 전일 음봉을 완전히 감싸는 양봉 → 강한 반전 신호</li>
  <li><strong>샛별형(Morning Star)</strong>: 3일 연속 패턴 (음봉→작은몸통→양봉) → 바닥 확인</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>주요 하락 반전 패턴</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li><strong>유성형(Shooting Star)</strong>: 위 꼬리가 긴 형태 → 고점 저항</li>
  <li><strong>하락 잉걸핀(Bearish Engulfing)</strong>: 전일 양봉을 감싸는 음봉 → 매도 신호</li>
  <li><strong>저녁별형(Evening Star)</strong>: 3일 패턴 (양봉→작은몸통→음봉) → 고점 확인</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":2} -->
<h2 id="combined">복합 지표 활용 전략</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>단일 지표보다 <strong>여러 지표를 복합적으로 활용</strong>할 때 신뢰도가 높아집니다. 아래는 실전에서 검증된 조합입니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>스윙 매매 조합</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li>20일 이동평균선 지지 + RSI 40~50 + MACD 골든크로스 → 강력 매수 신호</li>
  <li>볼린저밴드 하단 터치 + RSI 30 이하 + 거래량 폭증 → 단기 반등 매수</li>
  <li>RSI 70 이상 + MACD 데드크로스 + 거래량 감소 → 부분 익절 신호</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>추세 추종 조합</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
  <li>정배열 + 20일선 지지 + MACD 양전환 → 추세 추종 매수 유지</li>
  <li>역배열 + 20일선 저항 + MACD 음전환 → 반등 시 분할 매도</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p><strong>핵심 원칙:</strong> 2개 이상의 지표가 같은 방향을 가리킬 때만 진입합니다. 지표 간 상충 시에는 관망이 최선입니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2 id="faq">자주 묻는 질문</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>기술적 분석만으로 수익을 낼 수 있나요?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>기술적 분석은 매매 타이밍을 잡는 데 유용하지만, 기업의 펀더멘털(실적, 재무상태)과 시장 전체 흐름(거시경제, 섹터 로테이션)을 함께 고려해야 안정적인 수익을 기대할 수 있습니다. 기술적 분석만으로는 갑작스러운 공시나 외부 충격을 예측할 수 없습니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>RSI와 MACD 중 어느 것이 더 신뢰할 만한가요?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>RSI는 과매수·과매도 상태를 빠르게 파악하는 데 강하고, MACD는 추세 전환을 확인하는 데 유리합니다. 두 지표는 상호 보완적이므로 함께 사용하는 것이 효과적입니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>어떤 시간봉을 기준으로 분석해야 하나요?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>투자 기간에 따라 다릅니다. 단타는 5분·15분봉, 스윙은 일봉과 주봉, 중장기 투자는 주봉과 월봉을 주로 분석합니다. 일봉을 기본으로 하고 주봉으로 큰 추세를 확인하는 방법이 가장 일반적입니다.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>볼린저밴드 설정값을 바꿔도 되나요?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>기본 설정(20일, 2 표준편차)이 가장 널리 사용됩니다. 변동성이 높은 코스닥 소형주는 표준편차를 2.5로 높이거나, 단기 매매 시 10일 기준으로 조정하는 경우도 있습니다. 단, 설정 변경 시에는 충분한 백테스트가 필요합니다.</p>
<!-- /wp:paragraph -->

<!-- wp:separator -->
<hr class="wp-block-separator"/>
<!-- /wp:separator -->

<!-- wp:paragraph -->
<p><em>이 가이드는 TrendHunt AI 시스템이 한국 주식 기술적 분석 데이터를 기반으로 작성했습니다. 투자는 항상 본인의 판단과 책임하에 이루어져야 하며, 이 내용은 투자 권유가 아닙니다.</em></p>
<!-- /wp:paragraph -->
`;

async function main() {
  // 기존 페이지 확인
  const existing = await api.get('/pages', {
    params: { slug: PAGE_SLUG, _fields: 'id,slug,status' },
  });
  const existingPages = existing.data as { id: number; slug: string; status: string }[];

  if (existingPages.length) {
    logger.info(`이미 존재: [ID=${existingPages[0].id}] ${PAGE_SLUG} (${existingPages[0].status})`);
    return;
  }

  // 페이지 생성
  logger.info(`페이지 생성 중: ${PAGE_SLUG}`);
  const res = await api.post('/pages', {
    title: PAGE_TITLE,
    slug: PAGE_SLUG,
    content: PAGE_CONTENT.trim(),
    status: 'publish',
    comment_status: 'closed',
    meta: {
      _yoast_wpseo_title: `${PAGE_TITLE} | TrendHunt`,
      _yoast_wpseo_metadesc: 'RSI, MACD, 볼린저밴드 등 핵심 기술적 분석 지표를 실전 한국 주식 매매에 적용하는 완전 가이드. 초보자도 바로 따라할 수 있는 단계별 설명.',
    },
  });

  const created = res.data as { id: number; slug: string; link: string };
  logger.info(`생성 완료: [ID=${created.id}] ${created.slug}`);
  logger.info(`URL: ${created.link}`);
}

main().catch(e => {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
