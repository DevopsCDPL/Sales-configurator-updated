/**
 * QuotationStep — final compile + PDF download.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useConfigurator } from '../state/ConfiguratorProvider';
import { useNotification } from '../../contexts/NotificationContext';
import { quotationCompilerService } from '../../services/quotationCompilerService';
import type { QuotationRecord } from '../../services/quotationCompilerService';
import { diag } from '../../utils/diag';

const ACCENT = '#2563ff';
const BORDER = 'var(--border, #e4e8ee)';

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QuotationStep: React.FC = () => {
  const notify = useNotification();
  const { configuration, dirty, flush } = useConfigurator();
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);

  const reload = useCallback(async () => {
    if (!configuration?.id) return;
    setLoading(true);
    try {
      const list = await quotationCompilerService.listQuotations({
        configuration_id: configuration.id,
      });
      setQuotations(list);
    } catch (err: any) {
      notify.showError(err?.response?.data?.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [configuration?.id, notify]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCompile = useCallback(async () => {
    if (!configuration?.id) return;
    setCompiling(true);
    const startedAt = Date.now();
    try {
      if (dirty) await flush();
      const compiled = await quotationCompilerService.compile(configuration.id, {
        generate_pdf: true,
      });
      diag('quotation', 'compiled', { id: configuration.id, ms: Date.now() - startedAt, quotationId: compiled?.quotation?.id });
      notify.showSuccess('Quotation compiled successfully');
      await reload();
      // Highlight the newly-compiled quotation by re-fetching.
      if (compiled.quotation?.id) {
        // no-op; reload already pulled it.
      }
    } catch (err: any) {
      diag.error('quotation', 'compile failed', err);
      notify.showError(err?.response?.data?.message || 'Compile failed');
    } finally {
      setCompiling(false);
    }
  }, [configuration?.id, dirty, flush, notify, reload]);

  const handleDownload = useCallback(
    async (q: QuotationRecord) => {
      try {
        const blob = await quotationCompilerService.downloadPdf(q.id);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${q.code || q.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'PDF download failed');
      }
    },
    [notify]
  );

  const handleRegenerate = useCallback(
    async (q: QuotationRecord) => {
      try {
        await quotationCompilerService.regeneratePdf(q.id);
        notify.showSuccess('PDF regenerated');
        await reload();
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Regenerate failed');
      }
    },
    [notify, reload]
  );

  const handleMarkSold = useCallback(
    async (q: QuotationRecord) => {
      try {
        await quotationCompilerService.markSold(q.id);
        notify.showSuccess('Marked as sold');
        await reload();
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Mark-sold failed');
      }
    },
    [notify, reload]
  );

  return (
    <Stack spacing={2}>
      <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
        Compiling will run the full pricing engine, persist a quotation row, and (if requested) generate the customer-facing PDF.
      </Alert>

      <Stack direction="row" spacing={1.5}>
        <Button
          variant="contained"
          startIcon={compiling ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <CheckCircleIcon />}
          disabled={compiling || !configuration?.id}
          onClick={handleCompile}
          sx={{
            bgcolor: ACCENT,
            textTransform: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.82rem',
            '&:hover': { bgcolor: alpha(ACCENT, 0.85) },
          }}
        >
          Compile Quotation
        </Button>
        <Tooltip title="Refresh quotation list">
          <span>
            <IconButton size="small" onClick={reload} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Card variant="outlined" sx={{ borderColor: BORDER, borderRadius: '10px' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #8b93a3)' }}>
            Compiled Quotations
          </Typography>

          {loading ? (
            <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={20} /></Box>
          ) : quotations.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b93a3)' }}>
                No quotations yet. Press <strong>Compile Quotation</strong> above.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />} spacing={0}>
              {quotations.map((q) => (
                <Stack
                  key={q.id}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={1.5}
                  sx={{ py: 1 }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                      {q.code || q.id}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b93a3)' }}>
                      {q.created_at ? new Date(q.created_at).toLocaleString() : '—'} · Total {fmt(q.total)}
                    </Typography>
                  </Box>
                  <Chip
                    label={q.status ?? 'draft'}
                    size="small"
                    sx={{
                      bgcolor: alpha(ACCENT, 0.1),
                      color: ACCENT,
                      fontWeight: 700,
                      fontSize: '0.68rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  />
                  <Tooltip title="Download PDF">
                    <IconButton size="small" onClick={() => handleDownload(q)}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Regenerate PDF">
                    <IconButton size="small" onClick={() => handleRegenerate(q)}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {q.status !== 'sold' && (
                    <Tooltip title="Mark as sold">
                      <IconButton size="small" onClick={() => handleMarkSold(q)}>
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
};

export default QuotationStep;
