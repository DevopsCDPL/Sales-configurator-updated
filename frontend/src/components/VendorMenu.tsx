import React from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const T = { primary: '#1F6F5C', textSec: '#6B7280', border: 'var(--border)' };

interface VendorMenuProps {
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const VendorMenu: React.FC<VendorMenuProps> = ({ onView, onEdit, onDelete }) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton size="small" onClick={handleClick} sx={{ color: T.textSec, '&:hover': { color: T.primary } }}>
        <MoreVertIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}
        PaperProps={{ sx: { borderRadius: '10px', border: `1px solid ${T.border}`, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', minWidth: 150 } }}>
        <MenuItem onClick={() => { handleClose(); onView(); }} sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><VisibilityIcon sx={{ fontSize: 16, color: T.primary }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}>View</ListItemText>
        </MenuItem>
        {onEdit && (
          <MenuItem onClick={() => { handleClose(); onEdit(); }} sx={{ fontSize: 13, py: 1 }}>
            <ListItemIcon><EditIcon sx={{ fontSize: 16, color: '#3B82F6' }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}>Edit</ListItemText>
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem onClick={() => { handleClose(); onDelete(); }} sx={{ fontSize: 13, py: 1 }}>
            <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#EF4444' }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }} sx={{ color: '#EF4444' }}>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default VendorMenu;
