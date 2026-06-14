/**
 * QuotationTab — V2-only.
 *
 * The project-level quotation experience is now ENTIRELY the Designer (V2)
 * revision chain, surfaced via V2QuotationsPanel: per configuration ->
 * switchboards -> immutable quote revisions, client Proposal PDF, internal
 * cost-sheet PDF, Epicor export, Accept & hand off, and change-order
 * approve/reject.
 *
 * The legacy `quotationCompiler` editor (manual quote lines, price-summary
 * column, compile-and-download PDF) was removed - V2 owns the quote end to
 * end and the app no longer depends on the old engine. The legacy backend
 * services remain in the repo as reference until the V2 system is finalized.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { FileText } from 'lucide-react';
import { Project } from '../../types';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection } from '../UIComponents';
import V2QuotationsPanel from '../../configurator/steps/V2QuotationsPanel';

interface QuotationTabProps {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const QuotationTab: React.FC<QuotationTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  return (
    <TabContainer>
      <AnimatedSection>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box
            sx={{
              width: 48, height: 48, borderRadius: '12px',
              backgroundColor: 'rgba(0,200,255,0.10)', border: '1px solid rgba(0,200,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <FileText size={22} color="#00c8ff" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: UI.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Quotation
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: UI.textLight }}>
              {project.quotation_number || 'Designer revisions, proposal & hand-off'}
            </Typography>
          </Box>
        </Box>
      </AnimatedSection>

      {project?.id && <V2QuotationsPanel projectId={project.id} onChanged={onUpdate} />}

      <EnhancedNavFooter onBack={onBack} onNext={onNext} backLabel="Back to Estimation" nextLabel="Next: PO from Client" />
    </TabContainer>
  );
};

export default QuotationTab;
