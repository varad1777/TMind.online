import React, { useState, useRef, useEffect } from "react";
import { useNotifications } from "../context/NotificationContext";
import { Bell ,Eye} from "lucide-react";

export const NotificationList = () => {
  const {
  notifications,
  markAllRead,
  markRead,
  activeTab,
  setActiveTab,
  loadMore,
  hasMore,
  loading,
} = useNotifications();

  const [filter, setFilter] = useState<"all" | "read" | "unread">(activeTab);
  const loaderRef = useRef<HTMLDivElement | null>(null);


  const fmt = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n)
      ? (Math.round(n * 10) / 10).toLocaleString()
      : "-";

  const fmtDate = (iso: string | null | undefined) => {
    try {
      return iso ? new Date(iso).toLocaleString() : "-";
    } catch {
      return "-";
    }
  };

  const parsePayload = (notif: any) => {
    try {
      return typeof notif.text === "string"
        ? JSON.parse(notif.text)
        : notif.text;
    } catch {
      return null;
    }
  };

  const isResolvedLike = (data: any) =>
    !!data && (typeof data.durationSeconds === "number" || (data.from && data.to));

  const isStartLike = (data: any) =>
    !!data &&
    (!!data.status || typeof data.value === "number" || typeof data.percent === "number");

  const filtered = notifications.filter((n: any) => {
    if (filter === "all") return true;
    if (filter === "read") return n.isRead === true;
    if (filter === "unread") return n.isRead === false;
  });

  const cardBase =
    "relative p-4 mb-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition";
  useEffect(() => {
  if (!hasMore || loading) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        loadMore(); // 🔥 CURSOR FETCH HERE
      }
    },
    {
      root: null,
      rootMargin: "0px",
      threshold: 0.6,
    }
  );

  if (loaderRef.current) {
    observer.observe(loaderRef.current);
  }

  return () => observer.disconnect();
}, [hasMore, loading, loadMore]);

useEffect(() => {
  setFilter(activeTab);
}, [activeTab]);


  return (
    <div className="flex flex-col h-full bg-background">

      {/* ===================== FILTER BAR ===================== */}
      <div className="border-b border-border px-4 py-3 bg-card flex justify-between items-center">
        <div className="flex items-center gap-6">
          {["all", "unread", "read"].map(key => (
            <button
              id={`notif-filter-${key}`}
              key={key}
              onClick={() => {
                setFilter(key as any);
                setActiveTab(key as any);
              }}
              className={`pb-2 text-sm font-medium transition border-b-2 ${
                filter === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        {/* MARK ALL READ BUTTON */}
        {filter === "unread" && filtered.length > 0 && (
          <button
            onClick={markAllRead}
            className="px-3 py-1 rounded bg-primary text-white text-sm hover:bg-primary/90 transition"
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* ===================== LIST ===================== */}
      <div  id="notification-list" className="flex-1 overflow-y-auto p-4 bg-background">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-10">No notifications found</p>
        )}

        {filtered.map((notif: any) => {
          const data = parsePayload(notif);
          const resolved = isResolvedLike(data) && !isStartLike(data);
          const start = isStartLike(data);

          /* ===================== UNREAD CARD BUTTON ===================== */
        const ReadBtn =
        !notif.isRead && filter === "unread" ? (
            <button
            onClick={() => markRead(notif.recipientId)}   // ✅ Correct ID
            className="ml-auto flex items-center p-1 rounded hover:bg-primary/20 text-primary transition"
            title="Mark as Read"
            >
            <Eye className="h-4 w-4" />
            </button>
        ) : null;

          /* ===================== PLAINTEXT NOTIFICATION ===================== */
          if (!data) {
            return (
              <div key={notif.id} className={cardBase}>
            <div className="flex justify-between items-start">

                {/* LEFT SIDE CONTENT */}
                <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-muted-foreground mt-1" />
                <div>
                    <p className="font-medium text-foreground">{notif.title ?? "Notification"}</p>
                    <p className="text-sm text-foreground/80">{notif.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtDate(notif.createdAt)}</p>
                </div>
                </div>

                {/* RIGHT SIDE READ BUTTON */}
                {ReadBtn}

            </div>
            </div>
            );
          }

          /* ===================== RESOLVED NOTIFICATION ===================== */
          if (resolved) {
            const durationSeconds =
              data.durationSeconds ??
              Math.max(0, (new Date(data.to).getTime() - new Date(data.from).getTime()) / 1000);

            return (
              <div key={notif.id} className={cardBase}>
                {ReadBtn}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-xl" />

                <div className="text-xs text-right text-muted-foreground">{fmtDate(data.to)}</div>

                <p className="font-semibold text-sm text-foreground">
                  {data.signal} is back to normal
                </p>

                <div className="mt-2 text-sm flex justify-between text-foreground/90">
                  <div>Asset: <b>{data.asset}</b></div>
                  <div>Signal: <b>{data.signal}</b></div>
                </div>

                {/* DETAILS */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-muted/10 p-3 rounded-lg border border-border">
                  <div>From: <b>{fmtDate(data.from)}</b></div>
                  <div>To: <b>{fmtDate(data.to)}</b></div>
                  <div className="col-span-2">Duration: <b>{Math.round(durationSeconds)} sec</b></div>
                  <div>Min: <b>{fmt(data.min)}</b></div>
                  <div>Max: <b>{fmt(data.max)}</b></div>
                </div>

                <div className="mt-2 h-1 bg-green-500 rounded-full" />
              </div>
            );
          }

          /* ===================== START / HIGH / LOW ===================== */
          if (start) {
            const isHigh = data.status === "HIGH";
            const isLow = data.status === "LOW";

            return (
              <div key={notif.id} className={cardBase}>
                {ReadBtn}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                    isHigh ? "bg-red-500" : isLow ? "bg-blue-500" : "bg-gray-400"
                  }`}
                />

                <div className="text-xs text-right text-muted-foreground">{fmtDate(data.timestamp)}</div>

                <div className="font-semibold text-sm text-foreground">
                  {data.asset} • {data.signal}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      isHigh ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {data.status}
                  </span>

                  <span className="text-sm text-foreground">
                    {fmt(data.value)} {data.unit}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs bg-muted/10 p-3 rounded-lg border border-border">
                  <div>Min: <b>{fmt(data.min)}</b></div>
                  <div>Max: <b>{fmt(data.max)}</b></div>
                </div>
              </div>
            );
          }

          /* ===================== FALLBACK JSON ===================== */
          return (
            <div key={notif.id} className={cardBase}>
              {ReadBtn}
              <p className="font-semibold text-foreground">{notif.title}</p>
              <pre className="text-xs mt-2 bg-muted/10 p-2 rounded border border-border text-foreground">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          );
        })}
        {hasMore && (
        <div
          ref={loaderRef}
          className="h-10 flex items-center justify-center text-xs text-muted-foreground"
        >
          {loading ? "Loading more..." : "Scroll for more"}
        </div>
      )}
      </div>
    </div>
  );
};
