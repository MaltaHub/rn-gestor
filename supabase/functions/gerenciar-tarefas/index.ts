
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.3";

// Configuração CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Método para lidar com requisições OPTIONS
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Função para obter tarefas pendentes
async function getTasks(supabase) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, vehicles(model, plate)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar tarefas:", error);
    throw error;
  }

  return data;
}

// Função para marcar uma tarefa como concluída
async function completeTask(supabase, taskId, userId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      is_completed: true,
      completed_at: now
    })
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    console.error("Erro ao completar tarefa:", error);
    throw error;
  }

  return data;
}

serve(async (req) => {
  // Lidar com requisições OPTIONS
  if (req.method === "OPTIONS") {
    return handleOptions();
  }

  try {
    // Extrair a chave de autorização
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Criar cliente Supabase
    const supabaseClient = createClient(
      "https://cvhgjiksyyfhnswcvsqb.supabase.co",
      authHeader.replace("Bearer ", ""),
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Obter a URL da requisição
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    if (req.method === "GET") {
      // Buscar tarefas
      const tasks = await getTasks(supabaseClient);
      return new Response(
        JSON.stringify({ tasks }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (req.method === "PUT" && path === "complete") {
      // Marcar tarefa como concluída
      const { taskId } = await req.json();
      
      // Obter o ID do usuário autenticado
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();
      
      if (userError) {
        return new Response(
          JSON.stringify({ error: "Erro ao obter usuário" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const updatedTask = await completeTask(supabaseClient, taskId, user.id);
      return new Response(
        JSON.stringify({ task: updatedTask }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Requisição não suportada
    return new Response(
      JSON.stringify({ error: "Método não suportado" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
