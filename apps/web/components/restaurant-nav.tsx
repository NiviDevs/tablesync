import Link from 'next/link';
import styles from './restaurant-workspace.module.css';

export function RestaurantNav({ active }: { active: 'dashboard' | 'tables' | 'menu' | 'kitchen' }) {
  return <nav className={styles.nav} aria-label="Restaurant workspace"><Link className="brand" href="/">table<i>sync</i></Link>
    <div>{([
      ['dashboard', '/restaurant/dashboard', 'Dashboard'], ['tables', '/restaurant', 'Tables'],
      ['menu', '/restaurant/menu', 'Menu'], ['kitchen', '/restaurant?view=kitchen', 'Kitchen'],
    ] as const).map(([view, href, label]) => <a key={view} href={href} aria-current={active === view ? 'page' : undefined}>{label}</a>)}</div>
    <Link className={styles.staffLink} href="/restaurant/sign-in">Switch workspace <span aria-hidden="true">↗</span></Link>
  </nav>;
}
