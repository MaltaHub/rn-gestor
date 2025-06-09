
import { supabase } from "@/integrations/supabase/client";
import { PendingWorkflowAction, PendingWorkflowResult } from "@/types/store";

export const markAdvertisementAsPublished = async (
  advertisementId: string,
  userId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Marcando anúncio como publicado:", advertisementId);

    // Verificar se o anúncio existe primeiro
    const { data: existingAd, error: checkError } = await supabase
      .from('advertisements')
      .select('id, publicado')
      .eq('id', advertisementId)
      .single();

    if (checkError) {
      console.error("PendingService - Anúncio não encontrado:", checkError);
      return { success: false, message: 'Anúncio não encontrado' };
    }

    if (existingAd.publicado) {
      return { success: false, message: 'Anúncio já está publicado' };
    }

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
      return { success: false, message: `Erro ao publicar anúncio: ${error.message}` };
    }

    console.log("PendingService - Anúncio publicado com sucesso:", data);
    return { success: true, message: 'Anúncio publicado com sucesso!', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    return { success: false, message: 'Erro interno do servidor' };
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
      return { success: false, message: `Erro ao resolver insight: ${error.message}` };
    }

    return { success: true, message: 'Insight resolvido com sucesso!', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    return { success: false, message: 'Erro interno do servidor' };
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
      return { success: false, message: `Erro ao completar tarefa: ${error.message}` };
    }

    return { success: true, message: 'Tarefa completada com sucesso!', data };
  } catch (error) {
    console.error("PendingService - Erro geral:", error);
    return { success: false, message: 'Erro interno do servidor' };
  }
};

export const executeWorkflowAction = async (
  action: PendingWorkflowAction,
  userId: string
): Promise<PendingWorkflowResult> => {
  console.log("PendingService - Executando ação de workflow:", action);

  if (!userId) {
    return { success: false, message: 'ID do usuário é obrigatório' };
  }

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
