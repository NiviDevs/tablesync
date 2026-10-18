import Link from 'next/link';

export function RestaurantNav() {
  return <nav className="restaurant-nav"><Link className="brand inverse" href="/">table<i>sync</i></Link>
    <div className="table-actions"><a href="/restaurant/dashboard">Dashboard</a><a href="/restaurant">Tables</a>
      <a href="/restaurant/menu">Menu</a><a href="/restaurant?view=kitchen">Kitchen</a>
      <Link href="/restaurant/sign-in">Staff sign-in</Link></div>
  </nav>;
}
