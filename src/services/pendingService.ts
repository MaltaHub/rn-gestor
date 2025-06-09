
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { PendingWorkflowAction, PendingWorkflowResult } from "@/types/store";

export const markAdvertisementAsPublished = async (
  advertisementId: string,
  userId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Marcando anúncio como publicado:", advertisementId);

    const { data, error } = await supabase
      .from('advertisements')
      .update({
        publicado: true,
        data_publicacao: new Date().toISOString(),
        publicado_por: userId
      })
      .eq('id', advertisementId)
      .select()
      .single();

    if (error) {
      console.error("PendingService - Erro ao marcar anúncio como publicado:", error);
      toast.error('Erro ao marcar anúncio como publicado');
      return { success: false, message: error.message };
    }

    toast.success('Anúncio marcado como publicado com sucesso!');
    return { success: true, message: 'Anúncio publicado', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    toast.error('Erro ao marcar anúncio como publicado');
    return { success: false, message: 'Erro interno' };
  }
};

export const resolveAdvertisementInsight = async (
  insightId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Resolvendo insight:", insightId);

    const { data, error } = await supabase
      .from('advertisement_insights')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString()
      })
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error("PendingService - Erro ao resolver insight:", error);
      toast.error('Erro ao resolver insight');
      return { success: false, message: error.message };
    }

    toast.success('Insight resolvido com sucesso!');
    return { success: true, message: 'Insight resolvido', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    toast.error('Erro ao resolver insight');
    return { success: false, message: 'Erro interno' };
  }
};

export const completePublicationTask = async (
  taskId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Completando tarefa:", taskId);

    const { data, error } = await supabase
      .from('tasks')
      .update({
        completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error("PendingService - Erro ao completar tarefa:", error);
      toast.error('Erro ao completar tarefa');
      return { success: false, message: error.message };
    }

    toast.success('Tarefa completada com sucesso!');
    return { success: true, message: 'Tarefa completada', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    toast.error('Erro ao completar tarefa');
    return { success: false, message: 'Erro interno' };
  }
};

export const executeWorkflowAction = async (
  action: PendingWorkflowAction,
  userId: string
): Promise<PendingWorkflowResult> => {
  console.log("PendingService - Executando ação de workflow:", action);

  switch (action.type) {
    case 'publish_advertisement':
      if (!action.advertisement_id) {
        return { success: false, message: 'ID do anúncio é obrigatório' };
      }
      return await markAdvertisementAsPublished(action.advertisement_id, userId);

    case 'resolve_insight':
      if (!action.insight_id) {
        return { success: false, message: 'ID do insight é obrigatório' };
      }
      return await resolveAdvertisementInsight(action.insight_id);

    case 'create_task':
      // Para criar tarefas, podemos expandir no futuro
      return { success: false, message: 'Ação não implementada ainda' };

    default:
      return { success: false, message: 'Tipo de ação não reconhecido' };
  }
};
