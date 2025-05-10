
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Collaborator } from "./useCollaborators";

export const useCollaborator = (id: string) => {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCollaborator = async () => {
      if (!id) {
        setIsLoading(false);
        return;
      }

      try {
        // Buscar perfil do usuário
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, name, role, birthdate, created_at')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Erro ao buscar colaborador:', error);
          toast.error('Erro ao carregar informações do colaborador');
          setIsLoading(false);
          return;
        }

        if (!data) {
          setCollaborator(null);
          setIsLoading(false);
          return;
        }

        // Gerar e-mail a partir do nome (apenas simulação)
        const nameParts = data.name.toLowerCase().split(' ');
        let email = '';
        
        if (nameParts.length > 1) {
          email = `${nameParts[0]}.${nameParts[nameParts.length - 1]}@empresa.com`;
        } else {
          email = `${nameParts[0]}@empresa.com`;
        }
        
        // Criar objeto do colaborador
        const collaboratorData: Collaborator = {
          id: data.id,
          name: data.name,
          email: email,
          role: data.role,
          birthdate: data.birthdate,
          joinDate: data.created_at,
          bio: generateRandomBio(data.name, data.role)
        };

        setCollaborator(collaboratorData);
      } catch (err) {
        console.error('Erro ao buscar colaborador:', err);
        toast.error('Erro ao carregar informações do colaborador');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollaborator();
  }, [id]);

  // Função auxiliar para gerar bios aleatórias (apenas para demonstração)
  const generateRandomBio = (name: string, role: string): string => {
    const bios = [
      `${name} é um profissional dedicado com experiência no setor automotivo.`,
      `Especialista em vendas de veículos com mais de 5 anos de experiência no mercado.`,
      `Formado em administração, ${name} se juntou à equipe para ajudar a melhorar os processos de gestão e aumentar a eficiência operacional.`,
      `Com foco em atendimento ao cliente, sempre busca a melhor experiência para os compradores, entendendo suas necessidades e oferecendo soluções personalizadas.`,
      `Apaixonado por carros desde criança, ${name} transformou seu hobby em profissão. Conhecimento técnico aprofundado sobre diversos modelos e fabricantes.`,
      `Experiência anterior no setor financeiro trouxe uma visão diferenciada para os negócios, especialmente na análise de financiamentos e crédito para os clientes.`
    ];

    // Seleciona uma bio baseada no papel do usuário
    if (role === 'Administrador') {
      return `${name} é parte da equipe administrativa e responsável por coordenar as operações. Com vasta experiência em gestão, busca sempre otimizar os processos internos e garantir que os objetivos estratégicos sejam alcançados. Formação em Administração de Empresas com especialização em Gestão de Negócios.`;
    } else if (role === 'Gerente') {
      return `Como gerente, ${name} lidera equipes de vendas e garante que as metas sejam atingidas. Possui experiência prévia em grandes concessionárias e um histórico comprovado de resultados. Especialista em motivação de equipes e desenvolvimento de estratégias de vendas inovadoras.`;
    } else {
      const randomIndex = Math.floor(Math.random() * bios.length);
      return bios[randomIndex];
    }
  };

  return { collaborator, isLoading };
};
