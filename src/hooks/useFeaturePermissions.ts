
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeatureId, FeaturePermission } from '@/types/featurePermissions';
import { toast } from '@/components/ui/sonner';

// Hook to fetch feature permissions from Supabase
export const useFeaturePermissionsData = () => {
  const {
    data: featurePermissions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['featurePermissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_permissions')
        .select('*');

      if (error) {
        console.error('Error fetching feature permissions:', error);
        toast.error('Error loading feature permissions');
        return [];
      }

      return data.map(item => ({
        featureId: item.feature_id as FeatureId,
        area: item.area,
        requiredLevel: item.required_permission_level,
        description: item.description || ''
      })) as FeaturePermission[];
    },
  });

  return {
    featurePermissions,
    isLoading,
    error,
  };
};
