
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuração CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Lidar com requisições OPTIONS (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Definir cargos disponíveis na aplicação
    const roles = [
      'Usuário', 
      'Vendedor', 
      'Secretário', // Cargo de secretário
      'Gerente', 
      'Administrador'
    ];

    // Retornar resposta com os cargos
    return new Response(
      JSON.stringify({ roles }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    // Tratar erros e retornar resposta de erro
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
