import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Checkbox, alpha, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Snackbar, Alert, LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon, RestoreFromTrash as RestoreIcon, Delete as DeleteIcon,
  Close as CloseIcon, Folder as FolderIcon, Description as FileIcon,
  Business as CompanyIcon, Person as UserIcon, Assignment as ProjectIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const ITEM_TYPES: Record<string, { icon: any; color: string }> = {
  Project: { icon: ProjectIcon, color: T.blue },
  Document: { icon: FileIcon, color: T.teal },
  Company: { icon: CompanyIcon, color: T.purple },
  User: { icon: UserIcon, color: T.amber },
  Folder: { icon: FolderIcon, color: T.t3 },
};

const MOCK_ITEMS = [
  { id: '1', name: 'Steel Bridge Assembly — Draft', type: 'Project', deletedBy: 'Vikraman Nair', deletedAt: '2026-03-14T10:30:00', size: '24.5 MB', expiresAt: '2026-04-13', company: 'Tata Steel Ltd' },
  { id: '2', name: 'Quotation QT-2026-089.pdf', type: 'Document', deletedBy: 'Deepa Iyer', deletedAt: '2026-03-13T15:20:00', size: '2.1 MB', expiresAt: '2026-04-12', company: 'Bajaj Auto' },
  { id: '3', name: 'MetalWorks India Pvt Ltd', type: 'Company', deletedBy: 'System', deletedAt: '2026-03-12T09:00:00', size: '156 KB', expiresAt: '2026-04-11', company: '—' },
  { id: '4', name: 'Ramesh Venkat Account', type: 'User', deletedBy: 'Priya Sharma', deletedAt: '2026-03-11T14:45:00', size: '48 KB', expiresAt: '2026-04-10', company: 'Ashok Leyland' },
  { id: '5', name: 'Archive - Old Estimates', type: 'Folder', deletedBy: 'Rajesh Kumar', deletedAt: '2026-03-10T11:00:00', size: '89.3 MB', expiresAt: '2026-04-09', company: 'Mahindra & Mahindra' },
  { id: '6', name: 'Vendor PO-2026-034.pdf', type: 'Document', deletedBy: 'Ananya Desai', deletedAt: '2026-03-09T16:30:00', size: '1.8 MB', expiresAt: '2026-04-08', company: 'Godrej Industries' },
  { id: '7', name: 'Work Order WO-2026-012', type: 'Project', deletedBy: 'Suresh Patel', deletedAt: '2026-03-08T08:15:00', size: '15.7 MB', expiresAt: '2026-04-07', company: 'Bharat Forge' },
  { id: '8', name: 'Annual Report 2025.xlsx', type: 'Document', deletedBy: 'Meera Reddy', deletedAt: '2026-03-07T13:00:00', size: '4.2 MB', expiresAt: '2026-04-06', company: 'Larsen & Toubro' },
];

const CDPLRecycleBinPage: React.FC = () => {
  const [items, setItems] = useState(MOCK_ITEMS);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selected, setSelected] = useState<string[]>([]);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = items.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'All' && i.type !== typeFilter) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map((i) => i.id));
  };

  const restore = (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelected([]);
    setToast(`${ids.length} item(s) restored`);
  };

  const deletePerm = (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelected([]);
    setToast(`${ids.length} item(s) permanently deleted`);
  };

  const emptyBin = () => {
    setItems([]);
    setSelected([]);
    setEmptyConfirm(false);
    setToast('Recycle bin emptied');
  };

  const totalSize = '137.6 MB';
  const maxSize = '500 MB';
  const usagePct = 27.5;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Safety / Recycle Bin</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Recycle Bin</Typography>
        </Box>
        <Button variant="outlined" color="error" startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
          onClick={() => setEmptyConfirm(true)} disabled={items.length === 0}
          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px' }}>
          Empty Recycle Bin
        </Button>
      </Box>

      {/* Storage Bar */}
      <Card sx={{ p: 2.5, mb: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>Recycle Bin Storage</Typography>
          <Typography sx={{ fontSize: 12, color: T.t3 }}>{totalSize} of {maxSize} used</Typography>
        </Box>
        <LinearProgress variant="determinate" value={usagePct}
          sx={{ height: 8, borderRadius: '4px', bgcolor: T.borderSubtle, '& .MuiLinearProgress-bar': { bgcolor: usagePct > 80 ? T.red : usagePct > 50 ? T.amber : T.teal, borderRadius: '4px' } }} />
        <Box sx={{ display: 'flex', gap: 3, mt: 1.5 }}>
          <Typography sx={{ fontSize: 11, color: T.t3 }}>{items.length} items</Typography>
          <Typography sx={{ fontSize: 11, color: T.t3 }}>Items auto-delete after 30 days</Typography>
        </Box>
      </Card>

      {/* Filters + Bulk Actions */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Search deleted items..." value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
            sx={{ minWidth: 260, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
          <Select size="small" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface }}>
            <MenuItem value="All" sx={{ fontSize: 13 }}>All Types</MenuItem>
            {Object.keys(ITEM_TYPES).map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{t}</MenuItem>)}
          </Select>
        </Box>
        {selected.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={`${selected.length} selected`} size="small" sx={{ fontSize: 11, fontWeight: 600 }} />
            <Button size="small" startIcon={<RestoreIcon sx={{ fontSize: 14 }} />} onClick={() => restore(selected)}
              sx={{ textTransform: 'none', fontSize: 11, color: T.teal, fontWeight: 600 }}>
              Restore
            </Button>
            <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 14 }} />} color="error" onClick={() => deletePerm(selected)}
              sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600 }}>
              Delete Forever
            </Button>
          </Box>
        )}
      </Box>

      {/* Items Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Box component="th" sx={{ px: 2, py: 1.5, width: 40 }}>
                <Checkbox size="small" checked={selected.length === filtered.length && filtered.length > 0} indeterminate={selected.length > 0 && selected.length < filtered.length}
                  onChange={toggleAll} sx={{ '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: T.teal } }} />
              </Box>
              {['Item', 'Type', 'Company', 'Deleted By', 'Deleted At', 'Size', 'Expires', 'Actions'].map((h) => (
                <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {filtered.map((item) => {
              const it = ITEM_TYPES[item.type];
              const Icon = it.icon;
              const daysLeft = dayjs(item.expiresAt).diff(dayjs(), 'day');
              return (
                <Box component="tr" key={item.id} sx={{ borderBottom: `1px solid ${T.borderSubtle}`, '&:hover': { bgcolor: alpha(T.teal, 0.02) } }}>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Checkbox size="small" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} sx={{ '&.Mui-checked': { color: T.teal } }} />
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon sx={{ fontSize: 18, color: it.color }} />
                      <Typography sx={{ fontSize: 13, color: T.t1, fontWeight: 500 }}>{item.name}</Typography>
                    </Box>
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}><Chip label={item.type} size="small" sx={{ fontSize: 10, height: 20, bgcolor: alpha(it.color, 0.1), color: it.color }} /></Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{item.company}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{item.deletedBy}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 11, color: T.t3 }}>{dayjs(item.deletedAt).format('MMM D, h:mm A')}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{item.size}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Chip label={`${daysLeft}d`} size="small" sx={{ fontSize: 10, height: 18, bgcolor: daysLeft < 7 ? alpha(T.red, 0.1) : alpha(T.t3, 0.1), color: daysLeft < 7 ? T.red : T.t3 }} />
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => restore([item.id])} sx={{ color: T.teal }}>
                        <RestoreIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => deletePerm([item.id])} sx={{ color: T.red }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
        {filtered.length === 0 && (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <RestoreIcon sx={{ fontSize: 40, color: T.t3, mb: 1 }} />
            <Typography sx={{ fontSize: 14, color: T.t3 }}>Recycle bin is empty</Typography>
          </Box>
        )}
      </Card>

      {/* Empty Confirm Dialog */}
      <Dialog open={emptyConfirm} onClose={() => setEmptyConfirm(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon sx={{ color: T.red }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Empty Recycle Bin</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: T.t2, lineHeight: 1.7 }}>
            This will <strong>permanently delete {items.length} items</strong> ({totalSize}). This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEmptyConfirm(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={emptyBin} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px' }}>
            Delete All Permanently
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLRecycleBinPage;
