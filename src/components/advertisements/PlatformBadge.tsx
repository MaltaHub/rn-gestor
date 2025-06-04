
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PlatformType } from '@/types/store';

interface PlatformBadgeProps {
  platform: PlatformType;
  className?: string;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform, className }) => {
  const getPlatformColor = (platform: PlatformType) => {
    switch (platform) {
      case 'OLX':
        return 'bg-purple-100 text-purple-800';
      case 'WhatsApp':
        return 'bg-green-100 text-green-800';
      case 'Mercado Livre':
        return 'bg-yellow-100 text-yellow-800';
      case 'Mobi Auto':
        return 'bg-blue-100 text-blue-800';
      case 'ICarros':
        return 'bg-red-100 text-red-800';
      case 'Na Pista':
        return 'bg-orange-100 text-orange-800';
      case 'Cockpit':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Badge className={`${getPlatformColor(platform)} ${className || ''}`}>
      {platform}
    </Badge>
  );
};
