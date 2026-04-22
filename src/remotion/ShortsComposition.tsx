import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Scene } from '../services/shorts-script.service.js';

export interface Props {
  scenes: Scene[];
  audioSrc: string;
  bgmSrc: string;
  keyword: string;
}

const BLUE   = '#1E90FF';
const GREEN  = '#00E676';
const RED    = '#FF1744';
const GOLD   = '#FFD600';
const PURPLE = '#AA00FF';
const BG     = '#060912';

// ── 유틸 ──────────────────────────────────────────────
function easeOut3(p: number) { return 1 - Math.pow(1 - p, 3); }
function easeIn2(p: number)  { return p * p; }

function useProgress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
}

// ── 공통 컴포넌트 ───────────────────────────────────
// 숫자 카운트업
function CountUp({ target, frame, start, dur, suffix = '', prefix = '' }: {
  target: number; frame: number; start: number; dur: number; suffix?: string; prefix?: string;
}) {
  const p = easeOut3(useProgress(frame, start, start + dur));
  return <>{prefix}{Math.round(target * p).toLocaleString()}{suffix}</>;
}

// 원형 게이지
function CircleGauge({ value, max, frame, start, color, size }: {
  value: number; max: number; frame: number; start: number; color: string; size: number;
}) {
  const p = easeOut3(useProgress(frame, start, start + 45));
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const dash = circ * (value / max) * p;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

// 막대 차트 (미니 캔들)
function BarChart({ values, colors, frame, start, width, height }: {
  values: number[]; colors: string[]; frame: number; start: number; width: number; height: number;
}) {
  const maxVal = Math.max(...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, width, height }}>
      {values.map((v, i) => {
        const p = easeOut3(useProgress(frame, start + i * 4, start + i * 4 + 30));
        const barH = (v / maxVal) * height * p;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height }}>
            <div style={{ width: '100%', height: barH, background: colors[i % colors.length], borderRadius: '4px 4px 0 0' }} />
          </div>
        );
      })}
    </div>
  );
}

// 트렌드 화살표
function TrendArrow({ up, frame, start }: { up: boolean; frame: number; start: number }) {
  const p = spring({ frame: frame - start, fps: 30, config: { damping: 10, stiffness: 120 } });
  const scale = interpolate(p, [0, 1], [0.2, 1]);
  const color = up ? GREEN : RED;
  const rotate = up ? '0deg' : '180deg';
  return (
    <div style={{ transform: `scale(${scale}) rotate(${rotate})`, display: 'inline-block' }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <polygon points="50,5 95,75 5,75" fill={color} />
      </svg>
    </div>
  );
}

// 레이더 핑
function RadarPing({ frame, color, size }: { frame: number; color: string; size: number }) {
  const rings = [0, 20, 40];
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {rings.map((offset, i) => {
        const lf = (frame + offset) % 60;
        const scale = interpolate(lf, [0, 60], [0.1, 1.4]);
        const opacity = interpolate(lf, [0, 60], [0.8, 0]);
        return (
          <div key={i} style={{
            position: 'absolute',
            inset: 0, borderRadius: '50%',
            border: `3px solid ${color}`,
            transform: `scale(${scale})`,
            opacity,
          }} />
        );
      })}
      <div style={{
        position: 'absolute', inset: '30%',
        borderRadius: '50%', background: color,
        boxShadow: `0 0 30px ${color}`,
      }} />
    </div>
  );
}

// 파티클 배경
function Particles({ frame, color }: { frame: number; color: string }) {
  const pts = Array.from({ length: 16 }, (_, i) => ({
    x: (i * 113.7 + frame * (0.2 + (i % 4) * 0.1)) % 100,
    y: (i * 79.3  + frame * (0.3 + (i % 3) * 0.15)) % 100,
    s: 2 + (i % 3) * 2,
    o: 0.06 + (i % 5) * 0.04,
  }));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
          width: p.s, height: p.s, borderRadius: '50%',
          background: color, opacity: p.o,
        }} />
      ))}
    </AbsoluteFill>
  );
}

// 격자 배경선
function GridLines({ color }: { color: string }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.03 }}>
      {[1,2,3,4,5,6,7].map(i => (
        <React.Fragment key={i}>
          <div style={{ position: 'absolute', left: `${i * 14.28}%`, top: 0, bottom: 0, width: 1, background: color }} />
          <div style={{ position: 'absolute', top: `${i * 14.28}%`, left: 0, right: 0, height: 1, background: color }} />
        </React.Fragment>
      ))}
    </AbsoluteFill>
  );
}

// \n을 <br>로 렌더링하는 자막 컴포넌트
function SubText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const lines = text.split('\\n');
  return (
    <div style={style}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── 장면별 애니메이션 ────────────────────────────────

// Scene 0 — 훅: 가격 카운트업 + 방사형 버스트
function HookScene({ scene, frame }: { scene: Scene; frame: number }) {
  const rawNum = scene.highlight ? parseFloat(scene.highlight.replace(/[^0-9.]/g, '')) : null;
  const num = rawNum !== null && !isNaN(rawNum) && rawNum > 0 ? rawNum : null;
  const suffix = scene.highlight ? scene.highlight.replace(/[0-9.,]/g, '').trim() : '원';

  const rays = Array.from({ length: 16 }, (_, i) => i);
  const rayP = easeOut3(useProgress(frame, 0, 20));
  const numP = spring({ frame, fps: 30, config: { damping: 16, stiffness: 80 } });
  const numScale = interpolate(numP, [0, 1], [0.4, 1]);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Particles frame={frame} color={RED} />

      {/* 방사형 빛줄기 */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {rays.map(i => (
          <div key={i} style={{
            position: 'absolute',
            width: 3, height: interpolate(rayP, [0, 1], [0, 600]),
            background: `linear-gradient(to top, transparent, ${RED}44)`,
            transform: `rotate(${i * (360 / 16)}deg)`,
            transformOrigin: 'bottom center',
            bottom: '50%', left: '50%', marginLeft: -1.5,
          }} />
        ))}
      </div>

      {/* 원형 글로우 */}
      <div style={{
        position: 'absolute',
        width: interpolate(rayP, [0, 1], [0, 700]),
        height: interpolate(rayP, [0, 1], [0, 700]),
        borderRadius: '50%',
        background: `radial-gradient(circle, ${RED}30 0%, transparent 70%)`,
      }} />

      {/* 핵심 숫자 */}
      <div style={{ transform: `scale(${numScale})`, textAlign: 'center', zIndex: 2 }}>
        {num !== null && (
          <>
            <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)', letterSpacing: 3, marginBottom: 8 }}>
              현재가
            </div>
            <div style={{
              fontSize: 130, fontWeight: 900, color: '#fff',
              fontFamily: 'Noto Sans KR, sans-serif',
              lineHeight: 1, letterSpacing: -4,
              textShadow: `0 0 60px ${RED}`,
            }}>
              <CountUp target={num} frame={frame} start={4} dur={36} suffix={suffix} />
            </div>
            {/* 트렌드 화살표 */}
            <div style={{ marginTop: 8 }}>
              <TrendArrow up frame={frame} start={20} />
            </div>
          </>
        )}
        <SubText text={scene.text} style={{
          fontSize: 38, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
          marginTop: 16, letterSpacing: 0.3, lineHeight: 1.5,
          fontFamily: 'Noto Sans KR, sans-serif',
        }} />
      </div>
    </AbsoluteFill>
  );
}

// Scene 1 — 현황: 미니 바차트 + 수치
function SituationScene({ scene, frame }: { scene: Scene; frame: number }) {
  const rawNum = scene.highlight ? parseFloat(scene.highlight.replace(/[^0-9.]/g, '')) : 0;
  const num = isNaN(rawNum) ? 0 : rawNum;
  const suffix = scene.highlight ? scene.highlight.replace(/[0-9.,]/g, '').trim() : '';

  const barValues = [60, 45, 72, 55, 80, 68, num > 0 ? Math.min((num / 10000) * 100, 100) : 75];
  const barColors = [BLUE + '88', BLUE + '88', BLUE + '88', BLUE + '88', BLUE + '88', BLUE + '88', GREEN];
  const labelP = easeOut3(useProgress(frame, 20, 50));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Particles frame={frame} color={BLUE} />
      <GridLines color={BLUE} />

      <div style={{ width: 900, textAlign: 'center' }}>
        {/* 섹션 레이블 */}
        <div style={{
          opacity: labelP, fontSize: 26, fontWeight: 700,
          color: BLUE, letterSpacing: 3, marginBottom: 20, textTransform: 'uppercase',
        }}>
          📊 현재 시장 흐름
        </div>

        {/* 바 차트 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <BarChart values={barValues} colors={barColors} frame={frame} start={4} width={780} height={320} />
        </div>

        {/* 핵심 수치 */}
        {num > 0 && (
          <div style={{
            fontSize: 88, fontWeight: 900, color: GREEN,
            fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1, letterSpacing: -2,
            textShadow: `0 0 40px ${GREEN}88`,
          }}>
            <CountUp target={num} frame={frame} start={10} dur={40} suffix={suffix} />
          </div>
        )}
        <SubText text={scene.text} style={{
          marginTop: 16, fontSize: 40, fontWeight: 600,
          color: 'rgba(255,255,255,0.88)', letterSpacing: 0.3, lineHeight: 1.5,
          fontFamily: 'Noto Sans KR, sans-serif',
        }} />
      </div>
    </AbsoluteFill>
  );
}

// Scene 2 — 분석: 원형 게이지 + 신호 강도
function AnalysisScene({ scene, frame }: { scene: Scene; frame: number }) {
  const rawNum = scene.highlight ? parseFloat(scene.highlight.replace(/[^0-9.]/g, '')) : 75;
  const signalStrength = (isNaN(rawNum) || rawNum === 0) ? 75 : Math.min(rawNum % 101, 100);
  const signalLabel = signalStrength >= 70 ? '강세' : signalStrength >= 40 ? '중립' : '약세';
  const signalColor = signalStrength >= 70 ? GREEN : signalStrength >= 40 ? GOLD : RED;

  const gaugeP = easeOut3(useProgress(frame, 0, 50));
  const textP = easeOut3(useProgress(frame, 15, 40));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Particles frame={frame} color={PURPLE} />

      {/* 배경 글로우 */}
      <div style={{
        position: 'absolute',
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${signalColor}18 0%, transparent 70%)`,
      }} />

      <div style={{ textAlign: 'center' }}>
        {/* 섹션 레이블 */}
        <div style={{
          fontSize: 26, fontWeight: 700, color: PURPLE,
          letterSpacing: 3, marginBottom: 32,
        }}>
          🔍 신호 강도 분석
        </div>

        {/* 원형 게이지 */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <CircleGauge value={signalStrength} max={100} frame={frame} start={0} color={signalColor} size={320} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          }}>
            <div style={{ fontSize: 72, fontWeight: 900, color: signalColor, lineHeight: 1 }}>
              <CountUp target={signalStrength} frame={frame} start={0} dur={50} suffix="%" />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: signalColor, marginTop: 4 }}>
              {signalLabel}
            </div>
          </div>
        </div>

        {/* 텍스트 */}
        <SubText text={scene.text} style={{
          opacity: textP, marginTop: 32,
          fontSize: 40, fontWeight: 700,
          color: 'rgba(255,255,255,0.88)', letterSpacing: 0.3, lineHeight: 1.5,
          transform: `translateY(${interpolate(textP, [0, 1], [20, 0])}px)`,
          fontFamily: 'Noto Sans KR, sans-serif',
        }} />
      </div>
    </AbsoluteFill>
  );
}

// Scene 3 — 전략: 레이더 핑 + 매수존 표시
function StrategyScene({ scene, frame }: { scene: Scene; frame: number }) {
  const rawNum = scene.highlight ? parseFloat(scene.highlight.replace(/[^0-9.]/g, '')) : 0;
  const num = isNaN(rawNum) ? 0 : rawNum;
  const suffix = scene.highlight ? scene.highlight.replace(/[0-9.,]/g, '').trim() : '';

  const contentP = easeOut3(useProgress(frame, 6, 30));
  const isBuy = !scene.text.includes('매도') && !scene.text.includes('하락');
  const color = isBuy ? GREEN : RED;
  const label = isBuy ? '매수 신호' : '주의 신호';

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Particles frame={frame} color={color} />

      <div style={{
        opacity: contentP,
        transform: `scale(${interpolate(contentP, [0, 1], [0.9, 1])})`,
        textAlign: 'center',
      }}>
        {/* 섹션 레이블 */}
        <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: 3, marginBottom: 24 }}>
          ⚡ 투자 전략
        </div>

        {/* 레이더 + 신호 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative' }}>
            <RadarPing frame={frame} color={color} size={200} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              fontSize: 26, fontWeight: 800, color: '#fff',
            }}>
              {label}
            </div>
          </div>
        </div>

        {/* 가격 + 화살표 */}
        {num > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
            <TrendArrow up={isBuy} frame={frame} start={8} />
            <div style={{
              fontSize: 96, fontWeight: 900, color,
              fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1, letterSpacing: -2,
              textShadow: `0 0 40px ${color}88`,
            }}>
              <CountUp target={num} frame={frame} start={10} dur={36} suffix={suffix} />
            </div>
          </div>
        )}

        <SubText text={scene.text} style={{
          fontSize: 40, fontWeight: 700,
          color: 'rgba(255,255,255,0.88)', letterSpacing: 0.3, lineHeight: 1.5,
          fontFamily: 'Noto Sans KR, sans-serif',
        }} />
      </div>
    </AbsoluteFill>
  );
}

// Scene 4 — CTA: 벨 애니메이션
function CtaScene({ scene, frame }: { scene: Scene; frame: number }) {
  const bellSpring = spring({ frame, fps: 30, config: { damping: 6, stiffness: 200 } });
  const bellRotate = interpolate(bellSpring, [0, 1], [-30, 0]);
  const bellScale  = interpolate(bellSpring, [0, 1], [0.3, 1]);

  const textP = easeOut3(useProgress(frame, 12, 35));
  const btnP  = easeOut3(useProgress(frame, 20, 40));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Particles frame={frame} color={GOLD} />

      {/* 배경 글로우 */}
      <div style={{
        position: 'absolute',
        width: 700, height: 700, borderRadius: '50%',
        background: `radial-gradient(circle, ${GOLD}20 0%, transparent 70%)`,
      }} />

      <div style={{ textAlign: 'center', zIndex: 2 }}>
        {/* 벨 */}
        <div style={{
          fontSize: 120, lineHeight: 1,
          transform: `rotate(${bellRotate}deg) scale(${bellScale})`,
          display: 'inline-block',
          filter: `drop-shadow(0 0 30px ${GOLD})`,
          marginBottom: 24,
        }}>
          🔔
        </div>

        {/* 텍스트 */}
        <div style={{
          opacity: textP,
          transform: `translateY(${interpolate(textP, [0, 1], [30, 0])}px)`,
          fontSize: 48, fontWeight: 900,
          color: '#fff',
          fontFamily: 'Noto Sans KR, sans-serif',
          lineHeight: 1.35, marginBottom: 32, padding: '0 64px',
        }}>
          {(scene.text || '매일 종목 분석\n받아보세요!').split('\\n').map((line, i, arr) => (
            <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
          ))}
        </div>

        {/* 버튼 */}
        <div style={{
          opacity: btnP,
          transform: `scale(${interpolate(btnP, [0, 1], [0.8, 1])})`,
          display: 'inline-block',
          background: GOLD, borderRadius: 60,
          padding: '20px 56px',
          fontSize: 32, fontWeight: 800, color: '#000',
          boxShadow: `0 0 40px ${GOLD}88`,
        }}>
          구독 + 알림 설정 ✓
        </div>

        <div style={{
          marginTop: 28, fontSize: 24,
          color: 'rgba(255,255,255,0.35)', letterSpacing: 1,
        }}>
          trendhunt.net
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── 오프닝 ──────────────────────────────────────────
function OpeningCard({ frame, fps, keyword }: { frame: number; fps: number; keyword: string }) {
  const fadeOut = interpolate(frame, [fps * 1.5, fps * 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const scale = interpolate(s, [0, 1], [0.85, 1]);
  const lineW = interpolate(s, [0, 1], [0, 140]);

  const words = keyword.split(' ');
  const mid = Math.ceil(words.length / 2);

  return (
    <AbsoluteFill style={{ background: BG, opacity: fadeOut }}>
      <Particles frame={frame} color={BLUE} />
      <GridLines color={BLUE} />

      {/* 상단 LIVE 배지 */}
      <div style={{
        position: 'absolute', top: 52, left: 48,
        background: RED, borderRadius: 6, padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />
        <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>LIVE</span>
      </div>
      <div style={{
        position: 'absolute', top: 52, right: 48,
        fontSize: 22, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: 1,
      }}>trendhunt.net</div>

      {/* 중앙 */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ transform: `scale(${scale})`, textAlign: 'center', padding: '0 72px' }}>
          <div style={{
            fontSize: 68, fontWeight: 900, color: '#fff',
            fontFamily: 'Noto Sans KR, sans-serif',
            lineHeight: 1.25, letterSpacing: -1.5,
            textShadow: `0 0 80px ${BLUE}66`,
          }}>
            {words.slice(0, mid).join(' ')}
            {words.length > mid && <><br />{words.slice(mid).join(' ')}</>}
          </div>
          <div style={{
            width: lineW, height: 4,
            background: `linear-gradient(90deg, ${BLUE}, ${GREEN})`,
            borderRadius: 2, margin: '32px auto',
          }} />
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>
            지금 바로 확인하세요 ↓
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── 카드 전환 ────────────────────────────────────────
function CardSlide({ children, localFrame, fps }: { children: React.ReactNode; localFrame: number; fps: number }) {
  const s = spring({ frame: localFrame, fps, config: { damping: 26, stiffness: 240 } });
  return (
    <AbsoluteFill style={{ transform: `translateX(${interpolate(s, [0, 1], [1080, 0])}px)` }}>
      {children}
    </AbsoluteFill>
  );
}

// 페이드아웃 래퍼 (배경 이미지 포함)
function SceneFade({ children, localFrame, totalFrames, imageSrc }: {
  children: React.ReactNode; localFrame: number; totalFrames: number; imageSrc?: string;
}) {
  const fadeOut = interpolate(localFrame, [totalFrames - 8, totalFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  // 이미지 켄번스 효과 (미세한 줌인)
  const zoomP = interpolate(localFrame, [0, totalFrames], [1, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, opacity: fadeOut }}>
      {/* 배경 이미지 레이어 */}
      {imageSrc && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={imageSrc}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              transform: `scale(${zoomP})`,
              transformOrigin: 'center center',
            }}
          />
          {/* 다크 오버레이 (애니메이션 가독성 확보) */}
          <AbsoluteFill style={{ background: 'rgba(4,9,18,0.72)' }} />
        </AbsoluteFill>
      )}
      {children}
    </AbsoluteFill>
  );
}

// ── 메인 ─────────────────────────────────────────────
export const ShortsComposition: React.FC<Props> = ({ scenes, audioSrc, bgmSrc, keyword }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const OPEN_F = fps * 2;
  const offsetScenes = scenes.map(s => ({ ...s, startSec: s.startSec + 2, endSec: s.endSec + 2 }));

  function renderScene(scene: Scene, index: number, localFrame: number, totalFrames: number) {
    const inner = (() => {
      switch (index) {
        case 0: return <HookScene scene={scene} frame={localFrame} />;
        case 1: return <SituationScene scene={scene} frame={localFrame} />;
        case 2: return <AnalysisScene scene={scene} frame={localFrame} />;
        case 3: return <StrategyScene scene={scene} frame={localFrame} />;
        default: return <CtaScene scene={scene} frame={localFrame} />;
      }
    })();
    return (
      <SceneFade localFrame={localFrame} totalFrames={totalFrames} imageSrc={scene.imageSrc}>
        {inner}
      </SceneFade>
    );
  }

  return (
    <AbsoluteFill style={{ background: BG, overflow: 'hidden', fontFamily: 'Noto Sans KR, sans-serif' }}>
      {frame < OPEN_F && <OpeningCard frame={frame} fps={fps} keyword={keyword} />}

      {frame >= OPEN_F && offsetScenes.map((scene, i) => {
        const startF = scene.startSec * fps;
        const endF   = scene.endSec * fps;
        if (frame < startF || frame >= endF) return null;
        const localFrame  = frame - startF;
        const totalFrames = endF - startF;
        return (
          <CardSlide key={i} localFrame={localFrame} fps={fps}>
            {renderScene(scene, i, localFrame, totalFrames)}
          </CardSlide>
        );
      })}

      {/* 나레이션 TTS */}
      <Audio src={audioSrc} volume={1.0} />

      {/* 배경음악 — 페이드인/아웃 포함 */}
      {bgmSrc && (
        <Audio
          src={bgmSrc}
          volume={(f) => {
            const fadeIn  = interpolate(f, [0, 45], [0, 0.18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const fadeOut = interpolate(f, [durationInFrames - 45, durationInFrames], [0.18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return Math.min(fadeIn, fadeOut);
          }}
        />
      )}
    </AbsoluteFill>
  );
};
