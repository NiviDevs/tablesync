"use client";

import * as m from 'motion/react-m';
import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return <m.div initial={{ opacity: .75 }} animate={{ opacity: 1 }} transition={{ duration: .2 }}>
    {children}
  </m.div>;
}
