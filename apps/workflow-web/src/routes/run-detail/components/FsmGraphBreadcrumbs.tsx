import type { ReactElement } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Breadcrumbs, Link, Paper, Typography } from '@mui/material';

export type FsmGraphBreadcrumbItem = {
  key: string;
  label: string;
  to?: string;
  state?: unknown;
};

export type FsmGraphBreadcrumbsProps = {
  items: FsmGraphBreadcrumbItem[];
};

export const FsmGraphBreadcrumbs = ({ items }: FsmGraphBreadcrumbsProps): ReactElement | null => {
  if (items.length <= 1) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.25 }} data-testid="graph-breadcrumbs">
      <Breadcrumbs aria-label="FSM graph breadcrumbs">
        {items.map((item, index) => {
          const to = item.to;
          const isCurrent = index === items.length - 1 || !to;

          if (isCurrent) {
            return (
              <Typography key={item.key} variant="body2" color="text.primary" fontWeight={600}>
                {item.label}
              </Typography>
            );
          }

          return (
            <Link
              key={item.key}
              component={RouterLink}
              to={to}
              state={item.state as never}
              underline="hover"
              color="inherit"
              variant="body2"
            >
              {item.label}
            </Link>
          );
        })}
      </Breadcrumbs>
    </Paper>
  );
};
