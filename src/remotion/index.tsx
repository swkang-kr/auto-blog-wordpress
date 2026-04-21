import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ShortsComposition } from './ShortsComposition.js';

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Shorts"
      component={ShortsComposition as unknown as React.ComponentType<Record<string, unknown>>}
      durationInFrames={60 * 30}  // 60초 × 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        scenes: [],
        audioSrc: '',
        keyword: '',
      }}
    />
  );
};

registerRoot(RemotionRoot);
