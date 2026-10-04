// Shared by the server layout and the client shell, so it must stay free of 'use client'.
export const SIDEBAR_COOKIE = 'pathways-sidebar'

export const isSidebarCompact = (value?: string) => value === 'compact'

export const sidebarCookie = (compact: boolean) =>
  `${SIDEBAR_COOKIE}=${compact ? 'compact' : 'expanded'}; Path=/; Max-Age=31536000; SameSite=Lax`
