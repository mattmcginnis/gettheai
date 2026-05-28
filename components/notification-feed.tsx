import { BellRing } from "lucide-react";
import { listNotificationEvents } from "@/lib/repository";

export async function NotificationFeed({ recipientEmail }: { recipientEmail?: string }) {
  const notifications = await listNotificationEvents({ recipientEmail, limit: 8 });

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <BellRing className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Notifications</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {notifications.length ? (
          notifications.map((notification) => (
            <div key={notification.id} className="rounded-md border border-line p-3">
              <p className="text-sm font-semibold">{notification.subject ?? notification.tag ?? notification.eventType}</p>
              <p className="mt-1 text-xs text-ink/55">
                {notification.entityType} · {new Date(notification.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
