import Link from "next/link";

const features = [
  ["01", "One table, shared live", "Everyone sees the same table order while only owning the things they added."],
  ["02", "Pay your own share", "A table order becomes one restaurant ticket after every diner settles their portion."],
  ["03", "Ready for the kitchen", "The restaurant receives one clear, paid order instead of chasing split bills."],
];

export default function Home() {
  return <main className="site-shell">
    <nav className="site-nav"><div className="brand">table<i>sync</i></div><div className="nav-actions"><Link href="/restaurant">For restaurants</Link><Link className="text-link" href="/app?table=SAGE-12">Open demo table</Link></div></nav>
    <section className="landing-hero">
      <div className="hero-copy"><p className="kicker">Group dining, without the bill chaos</p><h1>The table is shared.<br /><em>The choice is yours.</em></h1><p className="hero-lede">Scan a table QR, add what you want, and pay only for your share. Your restaurant receives one calm, complete order.</p><div className="hero-actions"><Link className="primary-button" href="/app?table=SAGE-12">Try the live table <span>→</span></Link><Link className="secondary-button" href="/restaurant">See restaurant view</Link></div><p className="quiet-note">Local Review 1 demo · simulated payments only</p></div>
      <div className="hero-scene" aria-label="A shared restaurant table order"><div className="scene-glow" /><div className="scene-topline"><span>JUNIPER HOUSE</span><span>TABLE 12</span></div><div className="scene-plate"><span>✦</span></div><div className="scene-order"><p>Table order</p><strong>4 friends, 1 ticket</strong><div className="scene-line"><span>Smoked butter paneer</span><b>₹340</b></div><div className="scene-line"><span>Crispy corn dumplings</span><b>₹260</b></div><div className="scene-divider" /><div className="scene-total"><span>Ready when everyone is</span><b>₹600</b></div></div><div className="scene-avatars"><span>M</span><span>A</span><span>R</span><span>D</span><i>all here</i></div></div>
    </section>
    <section className="feature-section"><div><p className="kicker">Built around the table</p><h2>Less coordination.<br />More dinner.</h2></div><div className="feature-list">{features.map(([number, title, copy]) => <article className="feature" key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>
    <footer className="site-footer"><div className="brand">table<i>sync</i></div><span>One table. One order. Everyone pays their way.</span></footer>
  </main>;
}
