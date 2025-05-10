
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: string;
  birthdate?: string;
  avatarUrl?: string;
  bio?: string;
  joinDate?: string;
}

export const useCollaborators = () => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCollaborators = async () => {
      try {
        // Buscar perfis de usuário da tabela user_profiles
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, name, role, birthdate, created_at');

        if (error) {
          console.error('Erro ao buscar colaboradores:', error);
          toast.error('Erro ao carregar colaboradores');
          setIsLoading(false);
          return;
        }

        // Obter e-mails dos usuários (simulado, em uma implementação real
        // seria necessário mais uma chamada ou join para buscar os e-mails)
        const collaboratorsWithEmails: Collaborator[] = data.map((profile) => {
          // Gerar e-mail a partir do nome (apenas simulação)
          const nameParts = profile.name.toLowerCase().split(' ');
          let email = '';
          
          if (nameParts.length > 1) {
            email = `${nameParts[0]}.${nameParts[nameParts.length - 1]}@empresa.com`;
          } else {
            email = `${nameParts[0]}@empresa.com`;
          }
          
          return {
            id: profile.id,
            name: profile.name,
            email: email,
            role: profile.role,
            birthdate: profile.birthdate,
            joinDate: profile.created_at,
            bio: generateRandomBio(profile.name, profile.role)
          };
        });

        setCollaborators(collaboratorsWithEmails);
      } catch (err) {
        console.error('Erro ao buscar colaboradores:', err);
        toast.error('Erro ao carregar colaboradores');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCollaborators();
  }, []);

  // Função auxiliar para gerar bios aleatórias (apenas para demonstração)
  const generateRandomBio = (name: string, role: string): string => {
    const bios = [
      `${name} é um profissional dedicado com experiência no setor automotivo.`,
      `Especialista em vendas de veículos com mais de 5 anos de experiência.`,
      `Formado em administração, ${name} se juntou à equipe para ajudar a melhorar os processos de gestão.`,
      `Com foco em atendimento ao cliente, sempre busca a melhor experiência para os compradores.`,
      `Apaixonado por carros desde criança, ${name} transformou seu hobby em profissão.`,
      `Experiência anterior no setor financeiro trouxe uma visão diferenciada para os negócios.`
    ];

    // Seleciona uma bio aleatória baseada no papel do usuário
    if (role === 'Administrador') {
      return `${name} é parte da equipe administrativa e responsável por coordenar as operações. Com experiência em gestão, busca sempre otimizar os processos internos.`;
    } else if (role === 'Gerente') {
      return `Como gerente, ${name} lidera equipes de vendas e garante que as metas sejam atingidas. Experiência prévia em grandes concessionárias.`;
    } else {
      const randomIndex = Math.floor(Math.random() * bios.length);
      return bios[randomIndex];
    }
  };

  return { collaborators, isLoading };
};
