import React from 'react';
import { Box } from '@mui/material';
import AccessControlCenter, { AccessControlProps } from '../components/AccessControlCenter';

const AccessControlPage: React.FC<AccessControlProps> = ({ section }) => (
  <Box sx={{ height: '100%' }}>
    <AccessControlCenter section={section} />
  </Box>
);

export default AccessControlPage;
