
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Tratamento de CORS para requisições OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Criar cliente do Supabase usando variáveis de ambiente
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Buscar a lista de cargos únicos da tabela role_permissions
    const { data: roleData, error: roleError } = await supabaseClient
      .from('role_permissions')
      .select('role')
      .distinct('role')

    if (roleError) {
      console.error('Erro ao buscar cargos:', roleError)
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar cargos', details: roleError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Extrair apenas os nomes dos cargos em um array
    const roles = roleData.map(item => item.role)
    
    console.log('Cargos encontrados:', roles)
    
    // Retornar os cargos em ordem alfabética
    return new Response(
      JSON.stringify({ roles: roles.sort() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro no servidor:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
