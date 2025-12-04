import React from 'react';

export type MemoryNotificationType = 'update' | 'conflict' | 'goal';

export interface MemoryNotification {
  type: MemoryNotificationType;
  title: string;
  description: string;
}

const typeStyles: Record<MemoryNotificationType, string> = {
  update: 'bg-[var(--surface-tertiary)] text-[var(--text-primary)]',
  conflict: 'bg-[var(--error-100)] text-[var(--error-500)]',
  goal: 'bg-[var(--warning-100)] text-[var(--warning-500)]',
};

export const MemoryNotifications: React.FC<{ notifications: MemoryNotification[] }> = ({ notifications }) => {
  if (notifications.length === 0) {
    return <span className="text-xs text-[var(--text-tertiary)]">No alerts</span>;
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {notifications.map((notification, index) => (
        <span
          key={`${notification.title}-${index}`}
          className={`text-xs px-2 py-1 rounded border border-[var(--border-primary)] ${typeStyles[notification.type]}`}
        >
          {notification.title}
        </span>
      ))}
    </div>
  );
};

export default MemoryNotifications;
