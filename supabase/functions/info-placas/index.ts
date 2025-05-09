
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placa } = await req.json();
    
    if (!placa || typeof placa !== 'string' || placa.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Placa inválida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Formata a placa para o formato esperado pelo site
    const formattedPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    console.log(`Buscando informações para a placa: ${formattedPlaca}`);
    
    // Faz a requisição para o site de consulta de placas
    const response = await fetch(`https://infoplacas.com.br/placa/${formattedPlaca}`);
    const html = await response.text();
    
    // Extrai informações do HTML usando regex básico
    // Nota: Isso é uma implementação simples, pode quebrar se o site mudar o layout
    const modeloMatch = html.match(/<h4[^>]*>Modelo:<\/h4>\s*<span[^>]*>([^<]+)<\/span>/i);
    const anoMatch = html.match(/<h4[^>]*>Ano:<\/h4>\s*<span[^>]*>(\d{4})(?:\/(\d{4}))?<\/span>/i);
    const corMatch = html.match(/<h4[^>]*>Cor:<\/h4>\s*<span[^>]*>([^<]+)<\/span>/i);
    
    // Dados do veículo extraídos
    const vehicleData = {
      success: true,
      plate: formattedPlaca,
      model: modeloMatch ? modeloMatch[1].trim() : null,
      year: anoMatch ? parseInt(anoMatch[1]) : null,
      color: corMatch ? corMatch[1].trim() : null,
    };
    
    console.log("Dados encontrados:", JSON.stringify(vehicleData));
    
    return new Response(
      JSON.stringify(vehicleData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Erro ao buscar informações da placa:", error);
    
    return new Response(
      JSON.stringify({ error: "Falha ao obter informações da placa" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
