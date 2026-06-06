import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

interface SummaryCardProps {
  title: string;
  value: string | number;
  color?: string;
  icon?: React.ReactNode;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, color = '#1F7A63', icon }) => (
  <Card sx={{ minWidth: 180, borderRadius: 3, boxShadow: '0 2px 8px rgba(31, 122, 99,0.06)', background: '#fff' }}>
    <CardContent>
      <Box display="flex" alignItems="center" gap={2} mb={1}>
        {icon && <Box color={color}>{icon}</Box>}
        <Typography variant="h6" sx={{ fontWeight: 700, color }}>{value}</Typography>
      </Box>
      <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>{title}</Typography>
    </CardContent>
  </Card>
);

export default SummaryCard;
