// src/context/NotificationContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import * as signalR from "@microsoft/signalr";
import { toast } from "react-toastify";
import { AssetAlertToast } from "../notification/AssetAlertToast";

import {
  getAllNotifications,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type UserNotification,
} from "@/api/assetApi";

type NotificationType = UserNotification;

interface NotificationContextProps {
  notifications: NotificationType[];
  unreadCount: number;
  activeTab: "all" | "unread" | "read";
  setActiveTab: (tab: "all" | "unread" | "read") => void;

  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;

  markRead: (id: string) => void;
  markAllRead: () => void;
}

/* --------------------------------------------------------
   CONTEXT
-------------------------------------------------------- */
const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rendered, setRendered] = useState<NotificationType[]>([]);
  const [prefetch, setPrefetch] = useState<NotificationType[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "read">("all");
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 10;

  /** --------------------------------------------------------
   * FETCH PAGE
  -------------------------------------------------------- */
  const fetchPage = async (cursorArg: string | null) => {
    if (activeTab === "all") {
      return getAllNotifications({ limit: PAGE_SIZE, cursor: cursorArg });
    }
    return getMyNotifications({ unread: activeTab === "unread", limit: PAGE_SIZE, cursor: cursorArg });
  };

  /** --------------------------------------------------------
   * INITIAL LOAD
  -------------------------------------------------------- */
  const loadInitial = async () => {
    setLoading(true);
    try {
      const first = await fetchPage(null);
      setRendered(first.data);

      if (first.hasMore) {
        const second = await fetchPage(first.nextCursor);
        setPrefetch(second.data);
        setNextCursor(second.nextCursor);
        setHasMore(second.hasMore);
      } else {
        setHasMore(false);
        setPrefetch([]);
      }

      // Always get unread count
      const unreadRes = await getMyNotifications({ unread: true, limit: 50 });
      setUnreadCount(unreadRes.data.length);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  /** --------------------------------------------------------
   * LOAD MORE (PAGINATION)
  -------------------------------------------------------- */
  const loadMore = async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      // Render prefetched items immediately
      setRendered(prev => [...prev, ...prefetch]);

      // Prefetch next page
      if (nextCursor) {
        const next = await fetchPage(nextCursor);
        setPrefetch(next.data);
        setNextCursor(next.nextCursor);
        setHasMore(next.hasMore);
      } else {
        setHasMore(false);
        setPrefetch([]);
      }
    } catch (err) {
      console.error("Failed to load more notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  /** --------------------------------------------------------
   * RELOAD WHEN TAB CHANGES
  -------------------------------------------------------- */
  useEffect(() => {
    setRendered([]);
    setPrefetch([]);
    setNextCursor(null);
    setHasMore(true);
    loadInitial();
  }, [activeTab]);

  /** ===================================================
   * SIGNALR REAL-TIME NOTIFICATIONS
  =================================================== */
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_URL}/api/asset/hubs/notifications`, { withCredentials: true })
      .withAutomaticReconnect()
      .build();

    connection.start().catch(console.error);

    connection.on("ReceiveNotification", (notif: NotificationType) => {
      playNotificationSound();

      let parsed = null;
      try {
        parsed = typeof notif.text === "string" ? JSON.parse(notif.text) : notif.text;
      } catch (err) {
        console.error("JSON parse failed", err);
      }
      const data = parsed ? structuredClone(parsed) : null;

      toast(() => <AssetAlertToast data={data} />, {
        position: "top-right",
        autoClose: 7000,
        pauseOnHover: true,
        closeOnClick: true,
        draggable: true,
      });

      setUnreadCount(prev => prev + 1);

      // Only add to list if tab is not "read"
      if (activeTab !== "read") setRendered(prev => [notif, ...prev]);
    });

    return () => connection.stop();
  }, [activeTab]);

  /** ===================================================
   * MARK SINGLE NOTIFICATION READ
  =================================================== */
  const markRead = async (id: string) => {
    await markNotificationAsRead(id);
    setUnreadCount(prev => Math.max(prev - 1, 0));
    loadInitial(); // reload current tab
  };

  /** ===================================================
   * MARK ALL NOTIFICATIONS READ
  =================================================== */
  const markAllRead = async () => {
    await markAllNotificationsAsRead();
    setUnreadCount(0);
    setActiveTab("read");
  };

  /** --------------------------------------------------------
   * PLAY SOUND
  -------------------------------------------------------- */
  function playNotificationSound() {
    const audioCtx = new (window.AudioContext)();

    function playTone(frequency: number, duration: number, startTime: number) {
      const oscillator = audioCtx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);

      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    }

    const now = audioCtx.currentTime;
    playTone(1000, 0.15, now);
    playTone(1200, 0.15, now + 0.15);
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications: rendered,
        unreadCount,
        activeTab,
        setActiveTab,
        loadMore,
        hasMore,
        loading,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
