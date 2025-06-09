
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { PendingWorkflowAction, PendingWorkflowResult } from '@/types/store';
import { executeWorkflowAction } from '@/services/pendingService';

export const usePendingWorkflow = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const executeAction = async (action: PendingWorkflowAction): Promise<PendingWorkflowResult> => {
    if (!user) {
      return { success: false, message: 'Usuário não autenticado' };
    }

    setIsExecuting(true);
    
    try {
      const result = await executeWorkflowAction(action, user.id);
      
      if (result.success) {
        // Invalidar queries relacionadas para atualizar a UI
        await queryClient.invalidateQueries({ queryKey: ['advertisements'] });
        await queryClient.invalidateQueries({ queryKey: ['advertisement-insights'] });
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
      
      return result;
    } finally {
      setIsExecuting(false);
    }
  };

  const markAdvertisementPublished = async (advertisementId: string) => {
    return await executeAction({
      type: 'publish_advertisement',
      advertisement_id: advertisementId
    });
  };

  const resolveInsight = async (insightId: string) => {
    return await executeAction({
      type: 'resolve_insight',
      insight_id: insightId
    });
  };

  return {
    isExecuting,
    executeAction,
    markAdvertisementPublished,
    resolveInsight
  };
};
