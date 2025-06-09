
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { PendingWorkflowAction, PendingWorkflowResult } from '@/types/store';
import { executeWorkflowAction } from '@/services/pendingService';
import { toast } from '@/components/ui/sonner';
import { useStore } from '@/contexts/StoreContext';

export const usePendingWorkflow = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingItems, setExecutingItems] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  const invalidatePendingCaches = () => {
    // Invalidar caches com as query keys corretas
    queryClient.invalidateQueries({ queryKey: ["pending-tasks", currentStore] });
    queryClient.invalidateQueries({ queryKey: ["pending-insights", currentStore] });
    queryClient.invalidateQueries({ queryKey: ["pending-unpublished-ads", currentStore] });
    
    // Invalidar outros caches relacionados
    queryClient.invalidateQueries({ queryKey: ['advertisements'] });
    queryClient.invalidateQueries({ queryKey: ['advertisement-insights'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending-analytics'] });
  };

  const executeAction = async (action: PendingWorkflowAction): Promise<PendingWorkflowResult> => {
    if (!user) {
      console.error('usePendingWorkflow - Usuário não autenticado');
      toast.error('Usuário não autenticado');
      return { success: false, message: 'Usuário não autenticado' };
    }

    setIsExecuting(true);
    
    try {
      console.log('usePendingWorkflow - Executando ação:', action);
      console.log('usePendingWorkflow - ID do usuário:', user.id);
      
      const result = await executeWorkflowAction(action, user.id);
      
      if (result.success) {
        console.log('usePendingWorkflow - Ação executada com sucesso:', result);
        
        // Invalidar caches imediatamente
        invalidatePendingCaches();
        
        toast.success(result.message);
      } else {
        console.error('usePendingWorkflow - Erro na ação:', result);
        toast.error(result.message || 'Erro ao executar ação');
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
    console.log('usePendingWorkflow - Iniciando publicação do anúncio:', advertisementId);
    setExecutingItems(prev => new Set(prev).add(advertisementId));
    
    // Atualização otimística - remover da lista imediatamente
    queryClient.setQueryData(["pending-unpublished-ads", currentStore], (oldData: any[] = []) => {
      return oldData.filter(ad => ad.id !== advertisementId);
    });
    
    try {
      const result = await executeAction({
        type: 'publish_advertisement',
        advertisement_id: advertisementId
      });
      
      if (!result.success) {
        // Reverter atualização otimística se falhou
        invalidatePendingCaches();
        toast.error('Falha ao publicar. Lista restaurada.');
      }
      
      console.log('usePendingWorkflow - Resultado da publicação:', result);
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
    console.log('usePendingWorkflow - Resolvendo insight:', insightId);
    setExecutingItems(prev => new Set(prev).add(insightId));
    
    // Atualização otimística - remover da lista imediatamente
    queryClient.setQueryData(["pending-insights", currentStore], (oldData: any[] = []) => {
      return oldData.filter(insight => insight.id !== insightId);
    });
    
    try {
      const result = await executeAction({
        type: 'resolve_insight',
        insight_id: insightId
      });
      
      if (!result.success) {
        // Reverter atualização otimística se falhou
        invalidatePendingCaches();
        toast.error('Falha ao resolver. Lista restaurada.');
      }
      
      console.log('usePendingWorkflow - Resultado da resolução:', result);
      return result;
    } finally {
      setExecutingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(insightId);
        return newSet;
      });
    }
  };

  // NOVA FUNÇÃO: markTaskCompleted
  const markTaskCompleted = async (taskId: string) => {
    console.log('usePendingWorkflow - Marcando tarefa como completa:', taskId);
    setExecutingItems(prev => new Set(prev).add(taskId));
    
    // Atualização otimística - remover da lista imediatamente
    queryClient.setQueryData(["pending-tasks", currentStore], (oldData: any[] = []) => {
      return oldData.filter(task => task.id !== taskId);
    });
    
    try {
      const result = await executeAction({
        type: 'create_task', // Usando o tipo existente por agora
        task_id: taskId,
        metadata: { action: 'complete' }
      });
      
      if (!result.success) {
        // Reverter atualização otimística se falhou
        invalidatePendingCaches();
        toast.error('Falha ao completar tarefa. Lista restaurada.');
      }
      
      console.log('usePendingWorkflow - Resultado da conclusão da tarefa:', result);
      return result;
    } finally {
      setExecutingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
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
    markTaskCompleted, // ADICIONADA
    isItemExecuting
  };
};
