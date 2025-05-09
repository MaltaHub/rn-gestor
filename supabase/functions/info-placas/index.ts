import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Em produção, restrinja para seus domínios
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função auxiliar para extrair dados da tabela HTML
function extractDataFromHtml(html: string, label: string): string | null {
  // Regex mais robusta para encontrar o valor associado a um label na tabela
  // Procura pelo <td> contendo o label, e então captura o conteúdo do próximo <td> com a classe "black bold"
  const regex = new RegExp(
    `<tr>\\s*<td>${label}</td>\\s*<td class="black bold">([^<]+)</td>\\s*</tr>`, 
    "i"
  );
  const match = html.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

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

    // Formata a placa: remove caracteres especiais e converte para maiúsculo (geralmente placas são maiúsculas)
    const formattedPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    console.log(`Buscando informações para a placa: ${formattedPlaca}`);

    // Faz a requisição para o site de consulta de placas
    // Adicionar um User-Agent pode ajudar a evitar bloqueios simples
    const response = await fetch(`https://infoplacas.com.br/placa/${formattedPlaca}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' // Exemplo de User-Agent
      }
    });

    if (!response.ok) {
      console.error(`Erro na requisição para infoplacas.com.br: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error("Corpo do erro:", errorBody);
      return new Response(
        JSON.stringify({ error: `Falha ao consultar o serviço de placas (HTTP ${response.status})` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const html = await response.text();

    // Log do HTML para depuração (opcional, remover em produção para não poluir os logs)
    // console.log("HTML recebido:", html.substring(0, 1000)); // Logar apenas uma parte para não ser excessivo

    // Extrai informações do HTML usando a função auxiliar
    const marca = extractDataFromHtml(html, 'Marca');
    const modelo = extractDataFromHtml(html, 'Modelo');
    const anoFabricacaoStr = extractDataFromHtml(html, 'Ano Fabricação');
    const anoModeloStr = extractDataFromHtml(html, 'Ano Modelo');
    const cor = extractDataFromHtml(html, 'Cor');
    
    // O site parece não ter um campo único "Ano", mas sim "Ano Fabricação" e "Ano Modelo".
    // Decida qual usar ou se retorna ambos. Aqui, usaremos Ano Modelo se disponível, senão Ano Fabricação.
    const ano = anoModeloStr ? parseInt(anoModeloStr) : (anoFabricacaoStr ? parseInt(anoFabricacaoStr) : null);

    // Dados do veículo extraídos
    const vehicleData = {
      success: true,
      plate: formattedPlaca, // Retorna a placa formatada que foi consultada
      brand: marca,
      model: modelo,
      year: ano,
      yearManufacture: anoFabricacaoStr ? parseInt(anoFabricacaoStr) : null,
      yearModel: anoModeloStr ? parseInt(anoModeloStr) : null,
      color: cor,
    };
    
    // Verifica se algum dado crucial não foi encontrado, o que pode indicar problema no scraping
    if (!marca && !modelo && !ano && !cor) {
        console.warn(`Nenhum dado principal encontrado para a placa ${formattedPlaca}. O layout do site pode ter mudado ou a placa não retornou dados.`);
        // Você pode decidir se isso ainda é um 'sucesso' ou se deve retornar um status diferente.
        // Por ora, manteremos success: true, mas com campos nulos.
    }

    console.log("Dados encontrados:", JSON.stringify(vehicleData));

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