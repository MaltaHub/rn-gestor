
import { supabase } from "@/integrations/supabase/client";
import { PendingWorkflowAction, PendingWorkflowResult } from "@/types/store";

export const markAdvertisementAsPublished = async (
  advertisementId: string,
  userId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Iniciando publicação do anúncio:", advertisementId);
    console.log("PendingService - Usuário responsável:", userId);

    // Verificar se o anúncio existe primeiro
    const { data: existingAd, error: checkError } = await supabase
      .from('advertisements')
      .select('id, publicado, platform, id_ancora')
      .eq('id', advertisementId)
      .single();

    if (checkError) {
      console.error("PendingService - Erro ao buscar anúncio:", checkError);
      return { success: false, message: 'Anúncio não encontrado' };
    }

    console.log("PendingService - Anúncio encontrado:", existingAd);

    if (existingAd.publicado) {
      console.log("PendingService - Anúncio já estava publicado");
      return { success: false, message: 'Anúncio já está publicado' };
    }

    // Update com dados otimizados
    const updateData = {
      publicado: true,
      data_publicacao: new Date().toISOString(),
      publicado_por: userId
    };

    console.log("PendingService - Executando update com dados:", updateData);

    const { data, error } = await supabase
      .from('advertisements')
      .update(updateData)
      .eq('id', advertisementId)
      .select()
      .single();

    if (error) {
      console.error("PendingService - Erro no update:", error);
      return { 
        success: false, 
        message: `Erro ao publicar anúncio: ${error.message}` 
      };
    }

    console.log("PendingService - Update realizado com sucesso:", data);
    return { 
      success: true, 
      message: `Anúncio publicado com sucesso!`, 
      data 
    };
  } catch (error) {
    console.error("PendingService - Erro geral na publicação:", error);
    return { 
      success: false, 
      message: 'Erro interno do servidor ao publicar anúncio' 
    };
  }
};

export const resolveAdvertisementInsight = async (
  insightId: string
): Promise<PendingWorkflowResult> => {
  try {
    console.log("PendingService - Resolvendo insight:", insightId);

    // Verificar se o insight existe
    const { data: existingInsight, error: checkError } = await supabase
      .from('advertisement_insights')
      .select('id, resolved, insight_type')
      .eq('id', insightId)
      .single();

    if (checkError) {
      console.error("PendingService - Erro ao buscar insight:", checkError);
      return { success: false, message: 'Insight não encontrado' };
    }

    if (existingInsight.resolved) {
      console.log("PendingService - Insight já estava resolvido");
      return { success: false, message: 'Insight já foi resolvido' };
    }

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

    console.log("PendingService - Insight resolvido:", data);
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
        status: 'obsolete',
        resolved_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error("PendingService - Erro ao completar tarefa:", error);
      return { success: false, message: `Erro ao completar tarefa: ${error.message}` };
    }

    console.log("PendingService - Tarefa completada:", data);
    return {success: true, message: 'Tarefa completada com sucesso!', data };
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
  console.log("PendingService - ID do usuário:", userId);

  if (!userId) {
    console.error("PendingService - ID do usuário não fornecido");
    return { success: false, message: 'ID do usuário é obrigatório' };
  }

  try {
    switch (action.type) {
      case 'publish_advertisement':
        if (!action.advertisement_id) {
          return { success: false, message: 'ID do anúncio é obrigatório' };
        }
        console.log("PendingService - Executando publicação de anúncio:", action.advertisement_id);
        return await markAdvertisementAsPublished(action.advertisement_id, userId);

      case 'resolve_insight':
        if (!action.insight_id) {
          return { success: false, message: 'ID do insight é obrigatório' };
        }
        console.log("PendingService - Executando resolução de insight:", action.insight_id);
        return await resolveAdvertisementInsight(action.insight_id);

      case 'create_task':
        console.log("PendingService - Criação de tarefa não implementada");
        return { success: false, message: 'Ação não implementada ainda' };

      default:
        console.error("PendingService - Tipo de ação desconhecido:", action.type);
        return { success: false, message: 'Tipo de ação não reconhecido' };
    }
  } catch (error) {
    console.error("PendingService - Erro na execução da ação:", error);
    return { success: false, message: 'Erro interno ao executar ação' };
  }
};
