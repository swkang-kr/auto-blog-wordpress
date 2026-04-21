import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Scene } from '../services/shorts-script.service.js';

export interface Props {
  scenes: Scene[];
  audioSrc: string;
  keyword: string;
  bgColor?: string;
}

const ACCENT = '#0066FF';
const BG = '#0A0A1A';
const TEXT = '#FFFFFF';

function SceneSlide({ scene, frame, fps }: { scene: Scene; frame: number; fps: number }) {
  const localFrame = frame - scene.startSec * fps;
  const totalFrames = (scene.endSec - scene.startSec) * fps;

  const opacity = interpolate(localFrame, [0, 8, totalFrames - 8, totalFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 80 } });
  const scaleVal = interpolate(scale, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scaleVal})`, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 }}>
      {scene.highlight && (
        <div style={{
          fontSize: 96,
          fontWeight: 900,
          color: ACCENT,
          fontFamily: 'Noto Sans KR, sans-serif',
          textShadow: '0 0 40px rgba(0,102,255,0.6)',
          marginBottom: 16,
          lineHeight: 1,
        }}>
          {scene.highlight}
        </div>
      )}
      <div style={{
        fontSize: 44,
        fontWeight: 700,
        color: TEXT,
        fontFamily: 'Noto Sans KR, sans-serif',
        textAlign: 'center',
        padding: '16px 32px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 16,
        borderLeft: `6px solid ${ACCENT}`,
        maxWidth: 900,
        lineHeight: 1.4,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
}

export const ShortsComposition: React.FC<Props> = ({ scenes, audioSrc, keyword }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeScene = scenes.find(s => frame >= s.startSec * fps && frame < s.endSec * fps)
    ?? scenes[scenes.length - 1];

  const bgPulse = interpolate(frame % (fps * 4), [0, fps * 2, fps * 4], [0.97, 1.03, 0.97]);

  return (
    <AbsoluteFill style={{ background: BG, overflow: 'hidden' }}>
      {/* 배경 그라데이션 애니메이션 */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% ${30 + bgPulse * 10}%, rgba(0,102,255,0.15) 0%, transparent 70%)`,
      }} />

      {/* 키워드 워터마크 */}
      <div style={{
        position: 'absolute', top: 60, left: 0, right: 0,
        textAlign: 'center',
        fontSize: 28,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'Noto Sans KR, sans-serif',
        letterSpacing: 2,
      }}>
        📈 {keyword}
      </div>

      {/* 장면 자막 */}
      {activeScene && (
        <SceneSlide scene={activeScene} frame={frame} fps={fps} />
      )}

      {/* 하단 브랜딩 */}
      <div style={{
        position: 'absolute', bottom: 40, left: 0, right: 0,
        textAlign: 'center',
        fontSize: 22,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'Noto Sans KR, sans-serif',
      }}>
        trendhunt.net
      </div>

      {/* 오디오 */}
      <Audio src={audioSrc} />
    </AbsoluteFill>
  );
};
