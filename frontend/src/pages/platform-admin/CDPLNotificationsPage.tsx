import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, alpha, IconButton, Divider, Badge,
} from '@mui/material';
import {
  Notifications as NotiIcon, Info as InfoIcon, Warning as WarningIcon,
  Security as SecurityIcon, Payment as PaymentIcon, Settings as SettingsIcon,
  DoneAll as DoneAllIcon, FiberManualRecord as DotIcon, Close as CloseIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const NOTIFICATION_TYPES = {
  system: { label: 'System', icon: SettingsIcon, color: T.blue },
  security: { label: 'Security', icon: SecurityIcon, color: T.red },
  billing: { label: 'Billing', icon: PaymentIcon, color: T.purple },
  general: { label: 'General', icon: InfoIcon, color: T.teal },
  warning: { label: 'Warning', icon: WarningIcon, color: T.amber },
};
type NType = keyof typeof NOTIFICATION_TYPES;

interface Notification {
  id: string; type: NType; title: string; message: string; timestamp: string; read: boolean; company?: string;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'security', title: 'Suspicious Login Detected', message: 'Multiple failed login attempts from IP 192.168.10.33 for user kiran@sundaram.com. Account has been temporarily locked.', timestamp: '2026-03-15T14:30:00', read: false, company: 'Sundaram Fasteners' },
  { id: '2', type: 'billing', title: 'Payment Overdue', message: 'Invoice INV-2026-089 for Bajaj Auto is 15 days overdue. Amount: ₹45,000. Automatic follow-up email will be sent.', timestamp: '2026-03-15T13:00:00', read: false, company: 'Bajaj Auto' },
  { id: '3', type: 'system', title: 'Scheduled Maintenance', message: 'System maintenance planned for March 20, 2026 from 2:00 AM to 4:00 AM IST. All services will be temporarily unavailable.', timestamp: '2026-03-15T11:00:00', read: false },
  { id: '4', type: 'general', title: 'New Company Registered', message: 'Ashok Leyland has completed registration and is pending approval. Plan: Professional. Admin: Ramesh Venkat.', timestamp: '2026-03-15T09:30:00', read: true, company: 'Ashok Leyland' },
  { id: '5', type: 'warning', title: 'Storage Limit Warning', message: 'Tata Steel Ltd has reached 85% of their allocated storage (4.25 GB / 5 GB). Consider upgrading their plan or clearing old files.', timestamp: '2026-03-14T16:20:00', read: true, company: 'Tata Steel Ltd' },
  { id: '6', type: 'system', title: 'Backup Completed', message: 'Daily automated backup completed successfully. Total size: 12.8 GB. All databases and file uploads included.', timestamp: '2026-03-14T10:00:00', read: true },
  { id: '7', type: 'security', title: '2FA Disabled by User', message: 'User meera@larsen.com has disabled two-factor authentication. Consider requiring 2FA for all admin accounts.', timestamp: '2026-03-14T08:45:00', read: true, company: 'Larsen & Toubro' },
  { id: '8', type: 'billing', title: 'Subscription Renewed', message: 'Reliance Industries Enterprise plan has been auto-renewed for 12 months. Amount: ₹5,40,000.', timestamp: '2026-03-13T14:00:00', read: true, company: 'Reliance Industries' },
  { id: '9', type: 'general', title: 'Feature Request Submitted', message: 'Mahindra & Mahindra has submitted a feature request for "Batch Import from SAP". Priority: Medium.', timestamp: '2026-03-13T11:30:00', read: true, company: 'Mahindra & Mahindra' },
  { id: '10', type: 'warning', title: 'API Rate Limit Approaching', message: 'Godrej Industries has used 9,200 of 10,000 monthly API calls. Rate limiting will activate at 10,000.', timestamp: '2026-03-13T09:15:00', read: true, company: 'Godrej Industries' },
];

const CDPLNotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [selected, setSelected] = useState<Notification | null>(null);
  const [typeFilter, setTypeFilter] = useState<NType | 'all'>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = notifications.filter((n) => typeFilter === 'all' || n.type === typeFilter);

  const groupByDate = (items: Notification[]) => {
    const groups: Record<string, Notification[]> = {};
    items.forEach((n) => {
      const key = dayjs(n.timestamp).format('MMMM D, YYYY');
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  };

  const grouped = groupByDate(filtered);

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Operations / Notifications</Typography>
            <Typography variant="h5" fontWeight={700} color={T.t1}>Notifications</Typography>
          </Box>
          {unreadCount > 0 && (
            <Chip label={`${unreadCount} unread`} size="small" sx={{ fontSize: 11, bgcolor: alpha(T.red, 0.1), color: T.red, fontWeight: 600 }} />
          )}
        </Box>
        <Button variant="outlined" startIcon={<DoneAllIcon sx={{ fontSize: 16 }} />} onClick={markAllRead}
          disabled={unreadCount === 0}
          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
          Mark All Read
        </Button>
      </Box>

      {/* Type Filters */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Chip label="All" size="small" clickable onClick={() => setTypeFilter('all')}
          sx={{ fontSize: 11, fontWeight: 500, bgcolor: typeFilter === 'all' ? alpha(T.teal, 0.1) : 'transparent', color: typeFilter === 'all' ? T.teal : T.t3, border: `1px solid ${typeFilter === 'all' ? T.teal : T.border}` }} />
        {Object.entries(NOTIFICATION_TYPES).map(([key, nt]) => (
          <Chip key={key} label={nt.label} size="small" clickable onClick={() => setTypeFilter(key as NType)}
            icon={<nt.icon sx={{ fontSize: '14px !important', color: `${typeFilter === key ? nt.color : T.t3} !important` }} />}
            sx={{ fontSize: 11, fontWeight: 500, bgcolor: typeFilter === key ? alpha(nt.color, 0.1) : 'transparent', color: typeFilter === key ? nt.color : T.t3, border: `1px solid ${typeFilter === key ? nt.color : T.border}` }} />
        ))}
      </Box>

      {/* Split Layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: selected ? '1fr 1fr' : '1fr' }, gap: 2.5 }}>
        {/* Notifications List */}
        <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto', maxHeight: 640 }}>
          {Object.entries(grouped).map(([date, items]) => (
            <Box key={date}>
              <Box sx={{ px: 2.5, py: 1.2, bgcolor: '#F8FAFC', borderBottom: `1px solid ${T.borderSubtle}` }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{date}</Typography>
              </Box>
              {items.map((n) => {
                const nt = NOTIFICATION_TYPES[n.type];
                const Icon = nt.icon;
                const isSelected = selected?.id === n.id;
                return (
                  <Box key={n.id}
                    onClick={() => { setSelected(n); markRead(n.id); }}
                    sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2.5, py: 2,
                      borderBottom: `1px solid ${T.borderSubtle}`, cursor: 'pointer',
                      bgcolor: isSelected ? alpha(T.teal, 0.04) : n.read ? 'transparent' : alpha(T.blue, 0.02),
                      borderLeft: isSelected ? `3px solid ${T.teal}` : '3px solid transparent',
                      '&:hover': { bgcolor: alpha(T.teal, 0.03) }, transition: 'all 0.15s',
                    }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: alpha(nt.color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.3 }}>
                      <Icon sx={{ fontSize: 16, color: nt.color }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                        {!n.read && <DotIcon sx={{ fontSize: 8, color: T.blue }} />}
                        <Typography sx={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: T.t1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 12, color: T.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</Typography>
                      <Typography sx={{ fontSize: 10, color: T.t3, mt: 0.5 }}>{dayjs(n.timestamp).format('h:mm A')}</Typography>
                    </Box>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} sx={{ mt: 0.3, opacity: 0.5, '&:hover': { opacity: 1 } }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          ))}
          {filtered.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <NotiIcon sx={{ fontSize: 40, color: T.t3, mb: 1 }} />
              <Typography sx={{ fontSize: 14, color: T.t3 }}>No notifications</Typography>
            </Box>
          )}
        </Card>

        {/* Detail Panel */}
        {selected && (
          <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', p: 3, alignSelf: 'start' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Chip label={NOTIFICATION_TYPES[selected.type].label} size="small"
                icon={React.createElement(NOTIFICATION_TYPES[selected.type].icon, { sx: { fontSize: '14px !important' } })}
                sx={{ fontSize: 11, bgcolor: alpha(NOTIFICATION_TYPES[selected.type].color, 0.1), color: NOTIFICATION_TYPES[selected.type].color }} />
              <IconButton size="small" onClick={() => setSelected(null)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
            </Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: T.t1, mb: 1 }}>{selected.title}</Typography>
            <Typography sx={{ fontSize: 13, color: T.t2, lineHeight: 1.7, mb: 2.5 }}>{selected.message}</Typography>
            <Divider sx={{ mb: 2 }} />
            {[
              ['Time', dayjs(selected.timestamp).format('MMMM D, YYYY h:mm A')],
              ['Type', NOTIFICATION_TYPES[selected.type].label],
              ...(selected.company ? [['Company', selected.company]] : []),
              ['Status', selected.read ? 'Read' : 'Unread'],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                <Typography sx={{ fontSize: 12, color: T.t3 }}>{label}</Typography>
                <Typography sx={{ fontSize: 12, color: T.t1, fontWeight: 500 }}>{value}</Typography>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
              <Button variant="outlined" size="small" startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                sx={{ textTransform: 'none', fontSize: 11, borderColor: T.border, color: T.t2, borderRadius: '8px' }}
                onClick={() => markRead(selected.id)}>
                Mark Read
              </Button>
              <Button variant="outlined" size="small" startIcon={<CloseIcon sx={{ fontSize: 14 }} />} color="error"
                sx={{ textTransform: 'none', fontSize: 11, borderRadius: '8px' }}
                onClick={() => dismiss(selected.id)}>
                Dismiss
              </Button>
            </Box>
          </Card>
        )}
      </Box>
    </Box>
  );
};

export default CDPLNotificationsPage;
