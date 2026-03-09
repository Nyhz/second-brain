import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Wallet,
} from 'lucide-react';

export type PortalModule = {
  name: string;
  href: string;
  description: string;
  detail: string;
  status: 'live' | 'planned';
  cta: string;
  icon: LucideIcon;
};

export const appModules: PortalModule[] = [
  {
    name: 'Finances',
    href: '/finances',
    description: 'Portfolio, markets, transactions, and asset operations.',
    detail: 'Production-ready dashboard with summary, assets, transactions, and taxes.',
    status: 'live',
    cta: 'Open module',
    icon: Wallet,
  },
  {
    name: 'Calendar',
    href: '/calendar',
    description: 'Scheduling workspace and timeline orchestration.',
    detail: 'Live month grid, agenda, recurring events, and structured AI event intake.',
    status: 'live',
    cta: 'Open module',
    icon: CalendarDays,
  },
  {
    name: 'Tasks',
    href: '/tasks',
    description: 'Action board for personal execution loops.',
    detail: 'Reserved domain for tasks, follow-ups, and future Telegram-driven actions.',
    status: 'planned',
    cta: 'Coming soon',
    icon: ClipboardList,
  },
];

export const portalRoutes = [
  {
    label: 'Home',
    href: '/',
    icon: Wallet,
  },
  {
    label: 'Operations Status',
    href: '/status',
    icon: Activity,
  },
] as const;
