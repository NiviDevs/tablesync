"use client";
import * as m from 'motion/react-m';
import { useReducedMotion } from 'motion/react';
import Link from "next/link";

const reveal = { hidden: { opacity: .7, y: 24 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 170, damping: 21 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: .06 } } };

export default function Home() {
  const reducedMotion = useReducedMotion();
  return <div className="landing-intro">
    <div className="landing-intro-backdrop" aria-hidden="true" />
    <div className="landing-intro-star" aria-hidden="true">✦</div>
    <div className="landing-unveil"><main className="site-shell">
    <nav className="site-nav"><div className="brand">table<i>sync</i></div><div className="nav-actions"><Link href="/restaurant/sign-in">Restaurant dashboard</Link><Link className="text-link" href="/app?table=SAGE-12">Open table</Link></div></nav>
    <m.section className="landing-hero" variants={{ hidden: {}, visible: { transition: { delayChildren: reducedMotion ? 0 : .58, staggerChildren: .08 } } }} initial="hidden" animate="visible">
      <m.div className="hero-copy" variants={stagger}><m.p variants={reveal} className="kicker">Ordering, kitchen and restaurant insights</m.p><m.h1 variants={reveal}>The table is shared.<br /><em>The choice is yours.</em></m.h1><m.p variants={reveal} className="hero-lede">Guests scan a QR and build a shared order. Manage your menu, keep the kitchen moving, and see which dishes perform each day.</m.p><m.div variants={reveal} className="hero-actions"><Link className="primary-button" href="/app?table=SAGE-12">Open your table <span>→</span></Link><Link className="secondary-button" href="/restaurant/sign-in">Restaurant dashboard</Link></m.div><m.p variants={reveal} className="quiet-note">Payments are simulated. No money is charged.</m.p></m.div>
      <m.div variants={reveal} className="hero-scene" aria-label="A shared restaurant table order"><div className="scene-glow" /><div className="scene-topline"><span>JUNIPER HOUSE</span><span>TABLE 12</span></div><m.div className="scene-plate" initial={{ rotate: -12, scale: .9 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: reducedMotion ? 0 : .72, type: 'spring', stiffness: 180, damping: 17 }}><span>✦</span></m.div><m.div className="scene-order" initial={{ y: 18, rotate: -2 }} animate={{ y: 0, rotate: 0 }} transition={{ delay: reducedMotion ? 0 : .8 }}><p>Table order</p><strong>4 friends, 1 ticket</strong><div className="scene-line"><span>Smoked butter paneer</span><b>₹340</b></div><div className="scene-line"><span>Crispy corn dumplings</span><b>₹260</b></div><div className="scene-divider" /><div className="scene-total"><span>Ready when everyone is</span><b>₹600</b></div></m.div><m.div className="scene-avatars" variants={reveal}><span>M</span><span>A</span><span>R</span><span>D</span><i>all here</i></m.div></m.div>
    </m.section>
    </main></div>
  </div>;
}
