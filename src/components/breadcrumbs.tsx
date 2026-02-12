"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
    label: string;
    href?: string;
    icon?: React.ReactNode;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
    showHome?: boolean;
}

/**
 * Breadcrumb Navigation Component
 * 
 * Usage:
 * <Breadcrumbs items={[
 *   { label: 'Giveaways', href: '/giveaways' },
 *   { label: 'Create', href: '/giveaways/create' },
 *   { label: 'Lobby' }
 * ]} />
 */
export function Breadcrumbs({ items, showHome = true }: BreadcrumbsProps) {
    const allItems: BreadcrumbItem[] = showHome
        ? [{ label: 'Home', href: '/dashboard', icon: <Home className="w-4 h-4" /> }, ...items]
        : items;

    return (
        <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center gap-1 text-sm flex-wrap">
                {allItems.map((item, index) => {
                    const isLast = index === allItems.length - 1;

                    return (
                        <li key={index} className="flex items-center gap-1">
                            {index > 0 && (
                                <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                            )}

                            {isLast ? (
                                // Current page - no link
                                <span className="flex items-center gap-1.5 text-white font-medium px-2 py-1 rounded-lg bg-white/10">
                                    {item.icon}
                                    {item.label}
                                </span>
                            ) : (
                                // Clickable link
                                <Link
                                    href={item.href || '#'}
                                    className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                                >
                                    {item.icon}
                                    <span className="hidden sm:inline">{item.label}</span>
                                    {/* Show only icon on mobile for non-last items if there's an icon */}
                                    {!item.icon && <span className="sm:hidden">{item.label}</span>}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

/**
 * Helper to generate breadcrumbs from pathname
 */
export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [];

    let currentPath = '';

    const labelMap: Record<string, string> = {
        'giveaways': 'Giveaways',
        'create': 'Create',
        'wallet': 'Wallet',
        'dashboard': 'Dashboard',
        'settings': 'Settings',
        'wins': 'My Wins',
    };

    segments.forEach((segment, index) => {
        currentPath += `/${segment}`;
        const isLast = index === segments.length - 1;

        // Skip UUIDs from breadcrumb labels
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);

        items.push({
            label: isUUID ? 'Details' : (labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)),
            href: isLast ? undefined : currentPath,
        });
    });

    return items;
}
