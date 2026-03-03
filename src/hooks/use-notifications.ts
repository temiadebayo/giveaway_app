import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase';

export interface AppNotification {
    id: string;
    user_id: string;
    type: 'win' | 'kyc' | 'trust' | 'giveaway_live' | 'deposit' | 'system';
    title: string;
    message: string;
    link: string | null;
    payload: Record<string, any>;
    is_read: boolean;
    created_at: string;
}

export function useNotifications() {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const channelRef = useRef<any>(null);

    // Request browser notification permission on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_read).length);
        }
        setLoading(false);
    }, []);

    // Send a browser notification (Level 1: tab open)
    const sendBrowserNotification = useCallback((title: string, body: string) => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        try {
            new Notification(title, {
                body,
                icon: '/logo_white.png',
                badge: '/logo_white.png',
                tag: 'ga-notification', // Prevents stacking identical notifications
            });
        } catch {
            // Silent fail (some browsers restrict in certain contexts)
        }
    }, []);

    const markAsRead = useCallback(async (id: string) => {
        const supabase = createClient();
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);

        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    const markAllRead = useCallback(async () => {
        const supabase = createClient();
        await supabase.rpc('mark_all_notifications_read');

        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    }, []);

    // Subscribe to realtime inserts
    useEffect(() => {
        const setup = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await fetchNotifications();

            // Subscribe to new notifications for this user
            channelRef.current = supabase
                .channel('user-notifications')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`,
                    },
                    (payload: any) => {
                        const newNotif = payload.new as AppNotification;
                        setNotifications(prev => [newNotif, ...prev].slice(0, 20));
                        setUnreadCount(prev => prev + 1);

                        // Fire browser notification
                        sendBrowserNotification(newNotif.title, newNotif.message);
                    }
                )
                .subscribe();
        };

        setup();

        return () => {
            if (channelRef.current) {
                const supabase = createClient();
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [fetchNotifications, sendBrowserNotification]);

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllRead,
        refetch: fetchNotifications,
    };
}
