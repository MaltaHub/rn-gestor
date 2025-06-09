
import React from 'react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface AlertBadgeProps {
  count: number;
  severity: 'critical' | 'warning' | 'info';
  className?: string;
}

export const AlertBadge: React.FC<AlertBadgeProps> = ({ count, severity, className }) => {
  if (count === 0) return null;

  const severityStyles = {
    critical: 'bg-red-500 text-white animate-pulse',
    warning: 'bg-orange-500 text-white',
    info: 'bg-blue-500 text-white'
  };

  return (
    <Badge 
      className={cn(
        'ml-auto text-xs px-2 py-1 min-w-[20px] h-5 rounded-full flex items-center justify-center',
        severityStyles[severity],
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </Badge>
  );
};
