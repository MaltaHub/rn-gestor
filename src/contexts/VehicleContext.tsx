import React, { createContext, useContext, useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query"; // (FRONT) Gerenciamento de cache e consultas a dados
import { toast } from "@/components/ui/sonner"; // (UI) Notificações na interface
import { supabase } from "@/integrations/supabase/client"; // (BACK) Conexão com banco de dados Supabase
import { useAuth } from "@/contexts/AuthContext"; // (FRONT) Contexto para dados do usuário logado
import { useStore } from "@/contexts/StoreContext"; // (FRONT) Contexto para dados da loja atual
import { usePermission } from "@/contexts/PermissionContext"; // (FRONT) Contexto para permissões do usuário
import {
  addVehicle as addVehicleService, // (BACK) Serviço para inserir veículo no banco
  updateVehicle as updateVehicleService, // (BACK) Serviço para atualizar veículo no banco
  deleteVehicle as deleteVehicleService // (BACK) Serviço para remover veículo do banco
} from "@/services/vehicleService";
import { createVehicleNotification } from "@/services/notificationService"; // (BACK) Serviço para criar notificações

// (FRONT) Tipo que descreve a estrutura de um veículo no sistema
type Veiculo = {
  id: string;
  plate: string;
  model: string;
  color: string;
  mileage: number;
  image_url?: string;
  price: number;
  year: number;
  description?: string;
  specifications?: string;
  status: string;
  added_at: string;
  user_id: string;
  store: string;
  local?: string;
  documentacao?: string;
  fotos_roberto?: boolean;
  fotos_rn?: boolean;
  anuncios?: any;
  imagens?: string[]; // URLs simuladas vindas do Supabase Storage
};

// (FRONT) Tipo que define o que o contexto de veículos fornece para o app
type VeiculosContextType = {
  veiculos: Veiculo[];
  addVeiculo: (data: Partial<Veiculo>) => Promise<void>;
  updateVeiculo: (id: string, updates: Partial<Veiculo>) => Promise<void>;
  deleteVeiculo: (id: string) => Promise<void>;
  getVeiculo: (id: string) => Veiculo | undefined;
  filteredVeiculos: Veiculo[];
  isLoading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
};

// (FRONT) Criação do contexto de veículos
const VeiculosContext = createContext<VeiculosContextType | undefined>(undefined);

// (FRONT + BACK) Provider que gerencia estado e operações de veículos
export const VeiculosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth(); // (FRONT) Obtém usuário logado
  const { currentStore } = useStore(); // (FRONT) Obtém loja selecionada
  const { userRole } = usePermission(); // (FRONT) Obtém papel/permissão do usuário
  const queryClient = useQueryClient(); // (FRONT) Gerencia cache de consultas

  // (FRONT) Estados de busca, ordenação e filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('added_at_desc');
  const [statusFilter, setStatusFilter] = useState('all');

  // (FRONT + BACK) Consulta ao banco usando React Query e Supabase
  const {
    data: veiculos = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['veiculos', user?.id, currentStore], // Chave única para cache
    queryFn: async (): Promise<Veiculo[]> => {
      /*
        BACK: Busca veículos no Supabase filtrando pela loja atual
        BACK: Trata erros e mostra toast em caso de falha
        FRONT: Monta URLs simuladas de imagens vindas do Supabase Storage
      */
      return [];
    },
    enabled: !!user, // Só executa se usuário logado
    retry: 1 // Tenta apenas uma vez em caso de erro
  });

  // (FRONT + BACK) Adiciona um veículo no banco
  const addVeiculo = async (data: Partial<Veiculo>) => {
    /*
      BACK:
        - Chama o serviço addVehicleService para inserir veículo
        - Cria notificação de novo veículo
      FRONT:
        - Atualiza lista de veículos (refetch)
        - Mostra toast de sucesso ou erro
    */
  };

  // (FRONT + BACK) Atualiza informações de um veículo no banco
  const updateVeiculo = async (id: string, updates: Partial<Veiculo>) => {
    /*
      BACK:
        - Chama updateVehicleService para atualizar dados
        - Cria notificação de atualização
      FRONT:
        - Atualiza lista de veículos (refetch)
        - Mostra toast de sucesso ou erro
    */
  };

  // (FRONT + BACK) Remove veículo do banco
  const deleteVeiculo = async (id: string) => {
    /*
      BACK:
        - Chama deleteVehicleService para remover veículo
      FRONT:
        - Atualiza lista de veículos (refetch)
        - Mostra toast de sucesso ou erro
    */
  };

  // (FRONT) Busca veículo específico pelo ID
  const getVeiculo = (id: string) => {
    /*
      FRONT: Retorna veículo que tenha o mesmo ID do solicitado
    */
    return undefined;
  };

  // (FRONT) Lista de veículos filtrada e ordenada para exibição
  const filteredVeiculos = veiculos
    .filter(v => {
      /*
        FRONT:
          - Filtra veículos com base no termo de busca (placa, modelo, cor)
          - Filtra também pelo status (ativo, vendido, etc.)
      */
      return true;
    })
    .sort((a, b) => {
      /*
        FRONT:
          - Ordena veículos com base no campo e direção escolhidos
      */
      return 0;
    });

  // (FRONT) Retorna o contexto para o app
  return (
    <VeiculosContext.Provider
      value={{
        veiculos,
        addVeiculo,
        updateVeiculo,
        deleteVeiculo,
        getVeiculo,
        filteredVeiculos,
        isLoading,
        searchTerm,
        setSearchTerm,
        sortOption,
        setSortOption,
        statusFilter,
        setStatusFilter
      }}
    >
      {children}
    </VeiculosContext.Provider>
  );
};

// (FRONT) Hook para acessar o contexto de veículos
export const useVeiculos = () => {
  /*
    FRONT:
      - Garante que o hook só seja usado dentro de VeiculosProvider
      - Retorna o contexto com dados e funções
  */
  const context = useContext(VeiculosContext);
  if (!context) throw new Error("useVeiculos precisa estar dentro de VeiculosProvider");
  return context;
};