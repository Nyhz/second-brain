export type NavItem = {
  href: string;
  label: string;
  active?: boolean;
};

type SideNavProps = {
  items: NavItem[];
};

export function SideNav({ items }: SideNavProps) {
  return (
    <nav className="sb-ui-sidenav" aria-label="Main Navigation">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={
            item.active ? 'sb-ui-nav-link is-active' : 'sb-ui-nav-link'
          }
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
