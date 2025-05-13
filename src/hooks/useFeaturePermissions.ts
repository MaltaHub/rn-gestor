
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeatureId, FeaturePermission } from '@/types/featurePermissions';
import { toast } from '@/components/ui/sonner';

// Mock feature permissions data since we don't have the feature_permissions table
const mockFeaturePermissions: FeaturePermission[] = [
  {
    featureId: 'view-inventory',
    area: 'inventory',
    requiredLevel: 1,
    description: 'View inventory of vehicles'
  },
  {
    featureId: 'edit-vehicle',
    area: 'inventory',
    requiredLevel: 2,
    description: 'Edit vehicle details'
  },
  {
    featureId: 'delete-vehicle',
    area: 'inventory',
    requiredLevel: 7,
    description: 'Delete vehicles from inventory'
  },
  {
    featureId: 'add-vehicle',
    area: 'add_vehicle',
    requiredLevel: 5,
    description: 'Add new vehicles to inventory'
  },
  {
    featureId: 'view-vehicle-details',
    area: 'vehicle_details',
    requiredLevel: 1,
    description: 'View detailed vehicle information'
  }
];

// Hook to fetch feature permissions
export const useFeaturePermissionsData = () => {
  const {
    data: featurePermissions = mockFeaturePermissions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['featurePermissions'],
    queryFn: async () => {
      // Since the feature_permissions table doesn't exist,
      // we'll use our mock data instead of fetching from the database
      console.log('Using mock feature permissions data');
      return mockFeaturePermissions;
    },
  });

  return {
    featurePermissions,
    isLoading,
    error,
  };
};
