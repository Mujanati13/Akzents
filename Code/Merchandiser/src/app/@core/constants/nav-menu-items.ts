import { NavMenuItem } from '@core/interfaces';

// THIS FILE CONTAINS THE NAVIGATION MENU ITEMS FOR THE SIDEBAR AND ALL OTHER NAVIGATION MENUS WHICH ARE USED IN THE APPLICATION AND ARE CONSTANT

/**
 * Navigation menu items for WEB Sidebar
 */
export const webSidebarMenuItems: NavMenuItem[] = [
  {
    href: '/dashboard',
    title: 'Dashboard',
    active: true,
    icon: 'dashboard',
  },
  {
    href: '/all-entries',
    title: 'Alle Einsätze',
    active: false,
    icon: 'see_all',
  },
  {
    href: '/clients',
    title: 'Kunden',
    active: false,
    icon: 'clients',
  },
  {
    href: '/anfragen',
    title: 'Anfragen',
    active: false,
    icon: 'question',
    divider: true,
  },
  {
    href: '/notifications',
    title: 'Neugkeiten',
    active: false,
    icon: 'notifications',
    divider: true,
    tag: true,
  },
  {
    href: '/favorites',
    title: 'Favoriten',
    active: false,
    icon: 'favorite_filled',
    divider: true,
  },
];
