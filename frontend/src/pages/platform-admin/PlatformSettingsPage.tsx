import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

const PlatformSettingsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Platform Settings
      </Typography>
      <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Platform settings will be available in a future update.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PlatformSettingsPage;
