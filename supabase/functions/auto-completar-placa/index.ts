
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
    
    // Calcular a FIPE ganhadora (modelo mais longo)
    const fipeSelecionada = apiData.fipe?.dados?.reduce((prev, current) => {
        if (!prev) return current;
        return current.texto_modelo.length > prev.texto_modelo.length ? current : prev;
    }, null);

    const vehicleData = {
        success: true,
        placa: formattedPlaca,
        marca: fipeSelecionada?.texto_marca || apiData.marca || null,
        modelo: fipeSelecionada?.texto_modelo || apiData.modelo || null,
        ano: apiData.ano ? parseInt(apiData.ano) : null,
        anoFabricacao: apiData.extra?.ano_fabricacao ? parseInt(apiData.extra.ano_fabricacao) : null,
        anoModelo: apiData.anoModelo ? parseInt(apiData.anoModelo) : null,
        cor: apiData.cor || null,
        modeloCompleto: apiData.extra?.modelo || null,
        tipoCombustivel: apiData.extra?.combustivel || null,
        municipio: apiData.extra?.municipio || null,
        renavam: apiData.extra?.renavam || null,
        tipoCarroceria: apiData.extra?.tipo_carroceria || null,
        uf: apiData.extra?.uf || null,
        valorFipe: fipeSelecionada?.texto_valor || null,
        chassi: apiData.chassi || null
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
