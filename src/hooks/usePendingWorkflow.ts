
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { PendingWorkflowAction, PendingWorkflowResult } from '@/types/store';
import { executeWorkflowAction } from '@/services/pendingService';
import { toast } from '@/components/ui/sonner';

export const usePendingWorkflow = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingItems, setExecutingItems] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const executeAction = async (action: PendingWorkflowAction): Promise<PendingWorkflowResult> => {
    if (!user) {
      toast.error('Usuário não autenticado');
      return { success: false, message: 'Usuário não autenticado' };
    }

    setIsExecuting(true);
    
    try {
      console.log('usePendingWorkflow - Executando ação:', action);
      console.log('usePendingWorkflow - ID do usuário:', user.id);
      
      const result = await executeWorkflowAction(action, user.id);
      
      if (result.success) {
        // Invalidar queries para atualizar a interface
        queryClient.invalidateQueries({ queryKey: ['advertisements'] });
        queryClient.invalidateQueries({ queryKey: ['advertisement-insights'] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['pending-analytics'] });
        
        toast.success(result.message);
        console.log('usePendingWorkflow - Ação executada com sucesso:', result);
      } else {
        toast.error(result.message || 'Erro ao executar ação');
        console.error('usePendingWorkflow - Erro na ação:', result);
      }
      
      return result;
    } catch (error) {
      console.error('usePendingWorkflow - Erro ao executar ação:', error);
      const errorMessage = 'Erro interno ao executar ação';
      toast.error(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsExecuting(false);
    }
  };

  const markAdvertisementPublished = async (advertisementId: string) => {
    console.log('usePendingWorkflow - Marcando anúncio como publicado:', advertisementId);
    setExecutingItems(prev => new Set(prev).add(advertisementId));
    
    try {
      const result = await executeAction({
        type: 'publish_advertisement',
        advertisement_id: advertisementId
      });
      
      return result;
    } finally {
      setExecutingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(advertisementId);
        return newSet;
      });
    }
  };

  const resolveInsight = async (insightId: string) => {
    setExecutingItems(prev => new Set(prev).add(insightId));
    
    try {
      const result = await executeAction({
        type: 'resolve_insight',
        insight_id: insightId
      });
      
      return result;
    } finally {
      setExecutingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(insightId);
        return newSet;
      });
    }
  };

  const isItemExecuting = (itemId: string) => executingItems.has(itemId);

  return {
    isExecuting,
    executeAction,
    markAdvertisementPublished,
    resolveInsight,
    isItemExecuting
  };
};
