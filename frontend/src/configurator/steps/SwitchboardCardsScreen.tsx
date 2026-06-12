/**
 * SwitchboardCardsScreen — Phase A spec §6.1 (Configuration cards)
 *
 * Card grid: one card per switchboard + a permanent "+" card.
 * "+" → New Configuration (blank) | Load Configuration (clone picker).
 * Re-entering the project re-opens each card's saved state.
 *
 * Design language: #000000 bg / #13131E surface / #1E2235 border /
 * #00c8ff primary — no gold, low contrast, generous spacing.
 */
import React, { useState } from 'react';
import {
  Box, Typography, Chip, IconButton, Menu, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, List, ListItemButton,
  ListItemText, Tooltip, Stack,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import ElectricBoltRoundedIcon from '@mui/icons-material/ElectricBoltRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ArchitectureRoundedIcon from '@mui/icons-material/ArchitectureRounded';

const C = {
  bg: '#000000',
  surface: '#13131E',
  surfaceHover: '#171724',
  border: '#1E2235',
  blue: '#00c8ff',
  blueSoft: 'rgba(0,200,255,0.12)',
  text: '#E2E8F0',
  sub: '#64748B',
  muted: '#3D4663',
  green: '#22C55E',
  amber: '#D97706',
  red: '#EF4444',
};

export interface SwitchboardCardData {
  id: string;
  name: string;
  boardType?: string;
  status: 'draft' | 'complete' | 'locked';
  voltageSystem?: string | null;
  mainBusRatingA?: number | null;
  sccrKA?: number | null;
  sectionCount: number;
  drawingsStatus: 'none' | 'queued' | 'running' | 'generated' | 'failed';
  updatedAt?: string;
}

export interface SwitchboardCardsScreenProps {
  boards: SwitchboardCardData[];
  /** Boards available company-wide for "Load Configuration" cloning. */
  loadableBoards?: { id: string; name: string; project?: string }[];
  onOpen: (id: string) => void;
  onCreateNew: (name: string) => void;
  onLoadFrom: (sourceId: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const drawingsChip: Record<SwitchboardCardData['drawingsStatus'], { label: string; color: string }> = {
  none: { label: 'No drawings', color: C.muted },
  queued: { label: 'Drawings queued', color: C.sub },
  running: { label: 'Drawings running', color: C.blue },
  generated: { label: 'Drawings ready', color: C.green },
  failed: { label: 'Drawings failed', color: C.red },
};

export default function SwitchboardCardsScreen(props: SwitchboardCardsScreenProps) {
  const { boards } = props;
  const [menuAnchor, setMenuAnchor] = useState<null | { el: HTMLElement; id: string }>(null);
  const [addAnchor, setAddAnchor] = useState<null | HTMLElement>(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  return (
    <Box sx={{ p: 3, bgcolor: C.surface, minHeight: '100%' }}>
      <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 2.5 }}>
        <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 18 }}>Switchgear Configurations</Typography>
        <Typography sx={{ color: C.sub, fontSize: 12 }}>
          {boards.length} board{boards.length === 1 ? '' : 's'} in this project
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 2 }}>
        {boards.map((b) => {
          const dc = drawingsChip[b.drawingsStatus];
          return (
            <Box
              key={b.id}
              onClick={() => props.onOpen(b.id)}
              sx={{
                bgcolor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px',
                p: 2.25, cursor: 'pointer', transition: 'all .15s ease', position: 'relative',
                '&:hover': { bgcolor: C.surfaceHover, borderColor: C.blue, transform: 'translateY(-2px)' },
              }}
            >
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box sx={{
                    width: 38, height: 38, borderRadius: '9px', bgcolor: C.blueSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <ElectricBoltRoundedIcon sx={{ color: C.blue, fontSize: 20 }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ color: C.text, fontWeight: 600, fontSize: 14.5 }}>{b.name}</Typography>
                    <Typography noWrap sx={{ color: C.sub, fontSize: 11.5 }}>
                      {b.boardType?.replace(/_/g, ' ') ?? 'Switchboard'}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  {b.status === 'locked' && (
                    <Tooltip title="Locked — order confirmed. Changes require a Change Order.">
                      <LockRoundedIcon sx={{ color: C.amber, fontSize: 16 }} />
                    </Tooltip>
                  )}
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setMenuAnchor({ el: e.currentTarget, id: b.id }); }}
                    sx={{ color: C.muted, '&:hover': { color: C.text } }}
                  >
                    <MoreVertRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>

              <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1,
                mt: 2, pt: 1.75, borderTop: `1px solid ${C.border}`,
              }}>
                <Metric label="VOLTAGE" value={b.voltageSystem ?? '—'} />
                <Metric label="MAIN BUS" value={b.mainBusRatingA ? `${b.mainBusRatingA} A` : '—'} />
                <Metric label="SCCR" value={b.sccrKA ? `${b.sccrKA} kA` : '—'} />
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
                <Chip
                  size="small"
                  label={`${b.sectionCount} section${b.sectionCount === 1 ? '' : 's'}`}
                  sx={{ bgcolor: 'transparent', border: `1px solid ${C.border}`, color: C.sub, fontSize: 11, height: 22 }}
                />
                <Chip
                  size="small"
                  icon={<ArchitectureRoundedIcon sx={{ fontSize: 13, color: `${dc.color} !important` }} />}
                  label={dc.label}
                  sx={{ bgcolor: 'transparent', border: `1px solid ${C.border}`, color: dc.color, fontSize: 11, height: 22 }}
                />
              </Stack>
            </Box>
          );
        })}

        {/* permanent "+" card */}
        <Box
          onClick={(e) => setAddAnchor(e.currentTarget)}
          sx={{
            border: `1.5px dashed ${C.border}`, borderRadius: '10px', minHeight: 168,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 1, cursor: 'pointer', color: C.muted, transition: 'all .15s ease',
            '&:hover': { borderColor: C.blue, color: C.blue, bgcolor: C.blueSoft },
          }}
        >
          <AddRoundedIcon sx={{ fontSize: 30 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Add Switchgear</Typography>
        </Box>
      </Box>

      {/* card menu */}
      <Menu
        anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { bgcolor: C.bg, border: `1px solid ${C.border}`, color: C.text, minWidth: 160 } }}
      >
        <MenuItem onClick={() => { props.onOpen(menuAnchor!.id); setMenuAnchor(null); }} sx={{ fontSize: 13 }}>Open</MenuItem>
        <MenuItem
          onClick={() => {
            const b = boards.find((x) => x.id === menuAnchor!.id);
            setRenameId(menuAnchor!.id); setNameDraft(b?.name ?? ''); setMenuAnchor(null);
          }}
          sx={{ fontSize: 13 }}
        >
          Rename
        </MenuItem>
        <MenuItem onClick={() => { props.onDuplicate(menuAnchor!.id); setMenuAnchor(null); }} sx={{ fontSize: 13 }}>
          <ContentCopyRoundedIcon sx={{ fontSize: 15, mr: 1, color: C.sub }} /> Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => { props.onDelete(menuAnchor!.id); setMenuAnchor(null); }}
          sx={{ fontSize: 13, color: C.red }}
          disabled={boards.find((x) => x.id === menuAnchor?.id)?.status === 'locked'}
        >
          Delete
        </MenuItem>
      </Menu>

      {/* add menu: New | Load */}
      <Menu
        anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}
        PaperProps={{ sx: { bgcolor: C.bg, border: `1px solid ${C.border}`, color: C.text, minWidth: 220 } }}
      >
        <MenuItem onClick={() => { setNewOpen(true); setAddAnchor(null); }} sx={{ fontSize: 13 }}>
          <Box>
            <Typography sx={{ fontSize: 13, color: C.text }}>New Configuration</Typography>
            <Typography sx={{ fontSize: 11, color: C.sub }}>Start from a blank switchboard</Typography>
          </Box>
        </MenuItem>
        <MenuItem onClick={() => { setLoadOpen(true); setAddAnchor(null); }} sx={{ fontSize: 13 }}>
          <Box>
            <Typography sx={{ fontSize: 13, color: C.text }}>Load Configuration</Typography>
            <Typography sx={{ fontSize: 11, color: C.sub }}>Clone a saved switchgear with all settings</Typography>
          </Box>
        </MenuItem>
      </Menu>

      {/* new dialog */}
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} PaperProps={{ sx: dialogSx }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15 }}>New Configuration</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" placeholder={`Switchboard ${boards.length + 1}`}
            value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} sx={fieldSx}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)} sx={{ color: C.sub }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { props.onCreateNew(nameDraft || `Switchboard ${boards.length + 1}`); setNameDraft(''); setNewOpen(false); }}
            sx={{ bgcolor: C.blue, textTransform: 'none' }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* load dialog */}
      <Dialog open={loadOpen} onClose={() => setLoadOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogSx }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15 }}>Load Configuration</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.sub, fontSize: 12, mb: 1 }}>
            Clones the selected switchgear — sections, devices, components, and settings included.
          </Typography>
          <List dense>
            {(props.loadableBoards ?? []).map((s) => (
              <ListItemButton
                key={s.id}
                onClick={() => { props.onLoadFrom(s.id, `${s.name} (copy)`); setLoadOpen(false); }}
                sx={{ borderRadius: '8px', border: `1px solid ${C.border}`, mb: 0.75, '&:hover': { borderColor: C.blue } }}
              >
                <ListItemText
                  primary={<Typography sx={{ color: C.text, fontSize: 13 }}>{s.name}</Typography>}
                  secondary={<Typography sx={{ color: C.sub, fontSize: 11 }}>{s.project ?? 'This project'}</Typography>}
                />
              </ListItemButton>
            ))}
            {!(props.loadableBoards ?? []).length && (
              <Typography sx={{ color: C.muted, fontSize: 12, py: 2, textAlign: 'center' }}>
                No saved switchgear configurations yet
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadOpen(false)} sx={{ color: C.sub }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* rename dialog */}
      <Dialog open={!!renameId} onClose={() => setRenameId(null)} PaperProps={{ sx: dialogSx }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15 }}>Rename Switchgear</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} sx={fieldSx} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameId(null)} sx={{ color: C.sub }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { if (renameId) props.onRename(renameId, nameDraft); setRenameId(null); }}
            sx={{ bgcolor: C.blue, textTransform: 'none' }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ color: C.muted, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.7px' }}>{label}</Typography>
      <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 600, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

const dialogSx = { bgcolor: C.bg, border: `1px solid ${C.border}`, backgroundImage: 'none' };
const fieldSx = {
  mt: 0.5,
  '& .MuiOutlinedInput-root': {
    color: C.text, fontSize: 13, bgcolor: C.surface,
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: C.blue },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
};
