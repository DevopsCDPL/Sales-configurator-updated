import React, { useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  CloudUpload as UploadIcon,
  Add as AddIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';

export interface UploadedFile {
  name: string;
  path?: string;     // server path or URL
  size?: number;
}

interface MultiFileUploadProps {
  files: UploadedFile[];
  onUpload: (files: FileList) => void;
  onDelete?: (index: number) => void;
  onView?: (file: UploadedFile) => void;
  accept?: string;
  disabled?: boolean;
  uploading?: boolean;
  maxHeight?: number;
  placeholder?: string;
  accentColor?: string;
  compact?: boolean;
}

const MultiFileUpload: React.FC<MultiFileUploadProps> = ({
  files,
  onUpload,
  onDelete,
  onView,
  accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  disabled = false,
  uploading = false,
  maxHeight = 160,
  placeholder = 'Click or drag to upload files',
  accentColor = '#1F7A63',
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      onUpload(selected);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 0) {
      onUpload(dropped);
    }
  };

  const truncate = (name: string, max: number = 28) =>
    name.length > max ? name.slice(0, max - 3) + '...' : name;

  const hasFiles = files.length > 0;

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={disabled}
      />

      {/* Drop zone - shown when no files or always as clickable area */}
      {!hasFiles && (
        <Box
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          sx={{
            border: '2px dashed',
            borderColor: disabled ? '#E0E0E0' : 'var(--text-muted)',
            borderRadius: '8px',
            p: compact ? 1.5 : 2,
            textAlign: 'center',
            cursor: disabled ? 'default' : 'pointer',
            backgroundColor: '#FAFAFA',
            '&:hover': disabled ? {} : {
              borderColor: accentColor,
              backgroundColor: `${accentColor}08`,
            },
            transition: 'all 0.2s',
          }}
        >
          {uploading ? (
            <CircularProgress size={20} sx={{ color: accentColor }} />
          ) : (
            <>
              <UploadIcon sx={{ fontSize: compact ? 20 : 28, color: 'var(--text-muted)', mb: 0.5 }} />
              <Typography sx={{ fontSize: compact ? 11 : 12, color: '#6B7280' }}>
                {placeholder}
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* File list */}
      {hasFiles && (
        <Box
          sx={{
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              maxHeight: maxHeight,
              overflowY: 'auto',
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 },
            }}
          >
            {files.map((file, idx) => (
              <Box
                key={`${file.name}-${idx}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.6,
                  borderBottom: idx < files.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  '&:hover': { backgroundColor: 'var(--bg-surface-2)' },
                  transition: 'background 0.15s',
                }}
              >
                <FileIcon sx={{ fontSize: 16, color: accentColor, flexShrink: 0 }} />
                <Tooltip title={file.name}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: '#334155',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >
                    {truncate(file.name)}
                  </Typography>
                </Tooltip>
                {onView && file.path && (
                  <Tooltip title="View file">
                    <IconButton
                      size="small"
                      onClick={() => onView(file)}
                      sx={{ p: 0.4, color: '#64748B', '&:hover': { color: accentColor } }}
                    >
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {onDelete && !disabled && (
                  <Tooltip title="Remove file">
                    <IconButton
                      size="small"
                      onClick={() => onDelete(idx)}
                      sx={{ p: 0.4, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Box>

          {/* Add More button */}
          <Box
            onClick={() => !disabled && inputRef.current?.click()}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              py: 0.6,
              cursor: disabled ? 'default' : 'pointer',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#FAFAFA',
              '&:hover': disabled ? {} : { backgroundColor: `${accentColor}0A`, color: accentColor },
              transition: 'all 0.2s',
            }}
          >
            {uploading ? (
              <CircularProgress size={14} sx={{ color: accentColor }} />
            ) : (
              <>
                <AddIcon sx={{ fontSize: 14, color: disabled ? 'var(--text-muted)' : accentColor }} />
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: disabled ? 'var(--text-muted)' : accentColor }}>
                  Add More
                </Typography>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default MultiFileUpload;
