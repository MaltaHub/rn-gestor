
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Em produção, restrinja para seus domínios
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placa } = await req.json();

    if (!placa || typeof placa !== 'string' || placa.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Placa inválida. Forneça uma placa com pelo menos 6 caracteres.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Formata a placa: remove caracteres especiais e converte para maiúsculo
    const formattedPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    console.log(`Buscando informações para a placa: ${formattedPlaca}`);
    
    // Obtém o token do ambiente
    const token = Deno.env.get("WDAPI2_TOKEN");
    
    if (!token) {
      console.error("Token da API não encontrado nas variáveis de ambiente");
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta. Token da API não encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Faz a requisição para a API WDAPI2
    const apiUrl = `https://wdapi2.com.br/consulta/${formattedPlaca}/${token}`;
    
    console.log(`Consultando API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Erro na requisição para WDAPI2: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error("Corpo do erro:", errorBody);
      return new Response(
        JSON.stringify({ error: `Falha ao consultar o serviço de veículos (HTTP ${response.status})` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    // Obter e processar os dados JSON retornados pela API
    const apiData = await response.json();
    
    console.log("Dados retornados pela API:", JSON.stringify(apiData));
    
    // Mapear os dados da API para o formato esperado pelo frontend
    const vehicleData = {
      success: true,
      plate: formattedPlaca,
      brand: apiData.marca || null,
      model: apiData.modelo || null,
      year: apiData.ano ? parseInt(apiData.ano) : null,
      yearManufacture: apiData.anoFabricacao ? parseInt(apiData.anoFabricacao) : null,
      yearModel: apiData.anoModelo ? parseInt(apiData.anoModelo) : null,
      color: apiData.cor || null,
    };
    
    console.log("Dados processados:", JSON.stringify(vehicleData));

    return new Response(
      JSON.stringify(vehicleData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Erro ao processar a requisição da placa:", error);
    
    return new Response(
      JSON.stringify({ error: "Falha interna ao obter informações da placa.", details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
