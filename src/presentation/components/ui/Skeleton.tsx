// src/presentation/components/ui/Skeleton.tsx
import React from 'react';

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = '1rem', className = '' }) => (
  <div
    className={`bg-gray-200 dark:bg-gray-700 animate-pulse ${className}`}
    style={{ width, height }}
  />
);