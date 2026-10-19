"use client";

import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

const features = () => import('./motion-features').then(module => module.default);

export function AppMotion({ children }: { children: ReactNode }) {
  return <LazyMotion features={features} strict>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 360, damping: 28, mass: .8 }}>
      {children}
    </MotionConfig>
  </LazyMotion>;
}
