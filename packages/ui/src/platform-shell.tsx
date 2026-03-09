'use client';

import { ArrowLeft, Menu, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { buttonVariants } from './button';
import { cn } from './utils';

export type PlatformNavItem = {
  href: string;
  label: string;
  kind?: 'app' | 'platform';
  match?: 'exact' | 'prefix';
  disabled?: boolean;
  meta?: string;
  children?: PlatformNavItem[];
};

export type PlatformNavGroup = {
  label: string;
  items: PlatformNavItem[];
};

type ResolvedNavItem = Omit<PlatformNavItem, 'children'> & {
  active: boolean;
  children?: ResolvedNavItem[];
};

type PlatformShellProps = {
  appName: string;
  appSubtitle?: string;
  topbarEyebrow?: string;
  topbarTitle: string;
  topbarRight?: ReactNode;
  contentTop?: ReactNode;
  pageHeader?: ReactNode;
  sidebarGroups: PlatformNavGroup[];
  sidebarFooter?: ReactNode;
  platformLinks?: PlatformNavItem[];
  children: ReactNode;
  pathname: string;
  appPathname?: string;
  appBasePath?: string;
  onAppNavigate?: (href: string) => void;
  className?: string;
};

const resolveMatchMode = (item: PlatformNavItem) => item.match ?? 'prefix';

const normalizeBasePath = (basePath?: string) => {
  if (!basePath || basePath === '/') {
    return '';
  }
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

const resolveItemHref = (item: PlatformNavItem, appBasePath?: string) => {
  if (item.kind === 'platform') {
    return item.href;
  }

  const normalizedBasePath = normalizeBasePath(appBasePath);
  if (!normalizedBasePath || item.href === '/') {
    return normalizedBasePath || '/';
  }
  return `${normalizedBasePath}${item.href}`;
};

const matchesPath = (path: string, item: PlatformNavItem) => {
  if (resolveMatchMode(item) === 'exact') {
    return path === item.href;
  }
  return item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`);
};

const withActiveState = (
  item: PlatformNavItem,
  pathname: string,
  appPathname: string,
): ResolvedNavItem => {
  const candidatePath = item.kind === 'platform' ? pathname : appPathname;
  const children = item.children?.map((child) =>
    withActiveState(child, pathname, appPathname),
  );
  const active = matchesPath(candidatePath, item);
  const { children: _children, ...itemProps } = item;

  return {
    ...itemProps,
    active,
    ...(children ? { children } : {}),
  };
};

const defaultPlatformLinks: PlatformNavItem[] = [
  { href: '/', label: 'Portal', kind: 'platform', match: 'exact' },
  { href: '/status', label: 'Status', kind: 'platform', match: 'prefix' },
  { href: '/finances', label: 'Finances', kind: 'platform', match: 'prefix' },
  { href: '/calendar', label: 'Calendar', kind: 'platform', match: 'prefix' },
];

function NavigationItem({
  item,
  active,
  appBasePath,
  onAppNavigate,
  compact = false,
}: {
  item: PlatformNavItem;
  active: boolean;
  appBasePath?: string;
  onAppNavigate?: (href: string) => void;
  compact?: boolean;
}) {
  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          'flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm text-muted-foreground/70',
          compact && 'px-3 py-2.5',
        )}
      >
        <span>{item.label}</span>
        {item.meta ? <span className="text-[10px] uppercase tracking-[0.16em]">{item.meta}</span> : null}
      </span>
    );
  }

  const sharedClassName = cn(
    'flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
    active
      ? 'bg-muted text-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
    compact && 'px-3 py-2.5',
  );

  const content = (
    <>
      <span>{item.label}</span>
      {item.meta ? (
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {item.meta}
        </span>
      ) : null}
    </>
  );

  if (item.kind === 'platform') {
    return (
      <a href={item.href} className={sharedClassName}>
        {content}
      </a>
    );
  }

  const href = resolveItemHref(item, appBasePath);
  const appHref = item.href;

  return (
    <a
      href={href}
      onClick={(event) => {
        if (
          !onAppNavigate ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        onAppNavigate(appHref);
      }}
      className={sharedClassName}
    >
      {content}
    </a>
  );
}

function SidebarNavigation({
  appName,
  appSubtitle,
  groups,
  pathname,
  appPathname,
  footer,
  appBasePath,
  onAppNavigate,
}: {
  appName: string;
  appSubtitle: string | undefined;
  groups: PlatformNavGroup[];
  pathname: string;
  appPathname: string;
  footer: ReactNode | undefined;
  appBasePath?: string;
  onAppNavigate?: (href: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groupedItems: { label: string; items: ResolvedNavItem[] }[] = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        items: group.items.map((item) => withActiveState(item, pathname, appPathname)),
      })),
    [appPathname, groups, pathname],
  );
  const parentItems: ResolvedNavItem[] = useMemo(
    () =>
      groupedItems
        .flatMap((group) => group.items)
        .filter(
          (item): item is ResolvedNavItem =>
            Array.isArray(item.children) && item.children.length > 0,
        ),
    [groupedItems],
  );

  useEffect(() => {
    setExpanded((current) => {
      const next = { ...current };
      let changed = false;

      for (const item of parentItems) {
        const hasActiveChild = Boolean(item.children?.some((child) => child.active));
        if (next[item.href] === undefined) {
          next[item.href] = Boolean(item.active || hasActiveChild);
          changed = true;
          continue;
        }
        if ((item.active || hasActiveChild) && !next[item.href]) {
          next[item.href] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [parentItems]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <p className="text-sm font-semibold tracking-tight">{appName}</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {appSubtitle ?? 'Workspace'}
        </p>
      </div>
      <nav className="space-y-5" aria-label={`${appName} navigation`}>
        {groupedItems.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <p className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
            <div className="grid gap-1">
              {group.items.map((item) => {
                const children: ResolvedNavItem[] = item.children ?? [];
                const hasChildren = children.length > 0;
                const isExpanded = expanded[item.href] ?? false;

                if (!hasChildren) {
                  return (
                    <NavigationItem
                      key={item.href}
                      item={item}
                      active={item.active}
                      {...(appBasePath ? { appBasePath } : {})}
                      {...(onAppNavigate ? { onAppNavigate } : {})}
                    />
                  );
                }

                return (
                  <div key={item.href} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <NavigationItem
                          item={item}
                          active={item.active}
                          {...(appBasePath ? { appBasePath } : {})}
                          {...(onAppNavigate ? { onAppNavigate } : {})}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [item.href]: !isExpanded,
                          }))
                        }
                        className="rounded-lg border border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {isExpanded ? '-' : '+'}
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="ml-3 border-l border-border/50 pl-2">
                        <div className="grid gap-1">
                          {children.map((child) => (
                            <NavigationItem
                              key={child.href}
                              item={child}
                              active={child.active}
                              compact
                              {...(appBasePath ? { appBasePath } : {})}
                              {...(onAppNavigate ? { onAppNavigate } : {})}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
}

function PlatformLinks({
  links,
  pathname,
}: {
  links: PlatformNavItem[];
  pathname: string;
}) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      {links.map((link) => (
        <NavigationItem
          key={link.href}
          item={link}
          active={matchesPath(pathname, link)}
          compact
        />
      ))}
    </div>
  );
}

function TopbarRightSlot({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-10 min-w-[2.5rem] items-center justify-end gap-2">
      {children ? (
        <div className="flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PlatformPageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border/70 bg-card/75 px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.12)] md:flex-row md:items-start md:px-6">
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function PlatformActionBar({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
      <div className="flex min-h-10 items-center">{left}</div>
      <div className="flex min-h-10 items-center justify-end">{right}</div>
    </div>
  );
}

export function PlatformBackButton({
  href = '/',
  label = 'Back to Portal',
}: {
  href?: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        buttonVariants({ variant: 'secondary' }),
        'gap-2 px-3',
      )}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </a>
  );
}

export function PlatformIconButton({
  pressed,
  label,
  title,
  onClick,
  children,
}: {
  pressed?: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: 'secondary', size: 'icon' }),
        'group relative shrink-0 overflow-hidden active:scale-95',
      )}
    >
      {children}
    </button>
  );
}

export function PlatformSidebarNote({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/80 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.12)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm font-semibold tracking-tight">{title}</p>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

export function PlatformShell({
  appName,
  appSubtitle,
  topbarEyebrow,
  topbarTitle,
  topbarRight,
  contentTop,
  pageHeader,
  sidebarGroups,
  sidebarFooter,
  platformLinks = defaultPlatformLinks,
  children,
  pathname,
  appPathname,
  appBasePath,
  onAppNavigate,
  className,
}: PlatformShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const resolvedAppPathname = appPathname ?? pathname;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen]);

  const renderSidebar = () => (
    <SidebarNavigation
      appName={appName}
      appSubtitle={appSubtitle}
      groups={sidebarGroups}
      pathname={pathname}
      appPathname={resolvedAppPathname}
      footer={sidebarFooter}
      {...(appBasePath ? { appBasePath } : {})}
      {...(onAppNavigate ? { onAppNavigate } : {})}
    />
  );

  return (
    <div className={cn('min-h-screen bg-background text-foreground', className)}>
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border/60 bg-background/95 px-5 py-5 lg:block">
          <div className="sticky top-5 h-[calc(100vh-2.5rem)]">{renderSidebar()}</div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 bg-background/95 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">
              <div className="flex h-16 w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/95 px-4 shadow-[0_12px_32px_rgba(0,0,0,0.08)] md:px-5">
                <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground lg:hidden"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu size={18} aria-hidden="true" />
                </button>
                <div className="min-w-0 leading-none">
                  {topbarEyebrow ? (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {topbarEyebrow}
                    </p>
                  ) : null}
                  <p className="truncate text-sm font-semibold tracking-tight">{topbarTitle}</p>
                </div>
                </div>
                <div className="flex items-center gap-2">
                  <PlatformLinks links={platformLinks} pathname={pathname} />
                  <TopbarRightSlot>{topbarRight}</TopbarRightSlot>
                </div>
              </div>
            </div>
          </header>
          <main className="px-4 py-6 md:px-6 xl:px-8">
            <div className="mx-auto grid w-full max-w-[1440px] gap-5">
              {contentTop}
              {pageHeader}
              {children}
            </div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(86vw,340px)] border-r border-border/70 bg-background px-4 py-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <p className="text-sm font-semibold tracking-tight">{appName}</p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {appSubtitle ?? 'Workspace'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card"
                onClick={() => setMobileOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-4 grid gap-2 border-b border-border/60 pb-4 md:hidden">
              {platformLinks.map((link) => (
                <NavigationItem
                  key={link.href}
                  item={link}
                  active={matchesPath(pathname, link)}
                />
              ))}
            </div>
            <div className="h-[calc(100vh-8.5rem)] overflow-y-auto pr-1">{renderSidebar()}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export { defaultPlatformLinks };
