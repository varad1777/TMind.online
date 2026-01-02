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

type NotificationType = UserNotification

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
const NotificationContext = createContext<
  NotificationContextProps | undefined
>(undefined);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};



export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] =
    useState<"all" | "unread" | "read">("all");

  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;
  

  const loadNotifications = async (reset = false) => {
  if (loading) return;
  setLoading(true);

  try {
    let res;

    if (activeTab === "all") {
      // ✅ GLOBAL + USER notifications
      res = await getAllNotifications({
        limit: PAGE_SIZE,
        cursor: reset ? null : cursor,
      });
    } else {
      // ✅ USER notifications only
      res = await getMyNotifications({
        unread: activeTab === "unread",
        limit: PAGE_SIZE,
        cursor: reset ? null : cursor,
      });
    }

    setNotifications(prev =>
      reset ? res.data : [...prev, ...res.data]
    );

    setCursor(res.nextCursor);
    setHasMore(res.hasMore);

    // unread count always from "my" notifications
    const unreadRes = await getMyNotifications({
      unread: true,
      limit: 50,
    });
    setUnreadCount(unreadRes.data.length);

  } catch (err) {
    console.error("Failed to load notifications:", err);
  } finally {
    setLoading(false);
  }
};


/* Reload when tab changes */
  useEffect(() => {
  setNotifications([]);
  setCursor(null);
  setHasMore(true);
  loadNotifications(true);
}, [activeTab]);


  /* --------------------------------------------------------
     LOAD MORE (PAGINATION)
  -------------------------------------------------------- */
  const loadMore = () => {
    if (!hasMore || loading) return;
    loadNotifications();
  };

  /** ===================================================
   *                 SIGNALR REAL TIME
   * =================================================== */
  useEffect(():any => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_URL}/api/asset/hubs/notifications`, {
        withCredentials: true,
      })
      .withAutomaticReconnect()
      .build();

    connection.start().catch(console.error);

    connection.on("ReceiveNotification", (notif: NotificationType) => {
    playNotificationSound();

    let parsed = null;
    try {
      parsed =
        typeof notif.text === "string"
          ? JSON.parse(notif.text)
          : notif.text;
    } catch (e) {
      console.error("JSON parse failed", e);
    }

    const data = parsed ? structuredClone(parsed) : null;

    console.log("FINAL DATA (CLONED):", data);

    toast(
      () => <AssetAlertToast data={data} />,
      {
        position: "top-right",
        autoClose: 7000,
        pauseOnHover: true,
        closeOnClick: true,
        draggable: true,
      }
    );

  setUnreadCount((prev) => prev + 1);
  if (activeTab !== "read") {
        setNotifications((prev) => [notif, ...prev]);
  }
});


    return () => connection.stop();
  }, [activeTab]);

  /** ===================================================
   *            MARK SINGLE NOTIFICATION READ
   * =================================================== */
  const markRead = async (id: string) => {
    await markNotificationAsRead(id);
    setUnreadCount((c) => Math.max(c - 1, 0));
    loadNotifications(true);
  };

  const markAllRead = async () => {
    await markAllNotificationsAsRead();
    setUnreadCount(0);
    setActiveTab("read");
  };

  function playNotificationSound() {
  const audioCtx = new (window.AudioContext)();

  // Helper function to play a single tone
  function playTone(frequency:any, duration:any, startTime:any) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle'; // softer than sine
    oscillator.frequency.setValueAtTime(frequency, startTime);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.15, startTime);

    // quick fade out
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  const now = audioCtx.currentTime;
  playTone(1000, 0.15, now);       // first tone
  playTone(1200, 0.15, now + 0.15); // second tone
}


  return (
    <NotificationContext.Provider
      value={{
        notifications,
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