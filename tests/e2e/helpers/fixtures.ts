// Fixtures determinísticas para uso nos specs visuais. Datas e IDs
// fixos para garantir snapshots estáveis.

const FIXED_DATE = "2026-01-15T12:00:00.000Z";

export const CARROS_FIXTURE = {
  rows: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      placa: "ABC1A23",
      nome: "Onix - Loja 1",
      modelo_id: "11111111-1111-4111-8111-111111111101",
      local: "Loja 1",
      estado_venda: "DISPONÍVEL",
      estado_anuncio: "ANUNCIADO",
      estado_veiculo: "PRONTO",
      em_estoque: true,
      cor: "Branco",
      ano_fab: 2022,
      ano_mod: 2023,
      hodometro: 42000,
      preco_original: 75990,
      created_at: FIXED_DATE,
      updated_at: FIXED_DATE
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      placa: "DEF2B45",
      nome: "HB20 - Loja 2",
      modelo_id: "11111111-1111-4111-8111-111111111102",
      local: "Loja 2",
      estado_venda: "DISPONÍVEL",
      estado_anuncio: "ANUNCIADO",
      estado_veiculo: "PREPARAÇÃO",
      em_estoque: true,
      cor: "Prata",
      ano_fab: 2021,
      ano_mod: 2022,
      hodometro: 58000,
      preco_original: 65990,
      created_at: FIXED_DATE,
      updated_at: FIXED_DATE
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      placa: "GHI3C67",
      nome: "T-Cross - Galpao",
      modelo_id: "11111111-1111-4111-8111-111111111103",
      local: "Galpão",
      estado_venda: "NOVO",
      estado_anuncio: "",
      estado_veiculo: "PRONTO",
      em_estoque: true,
      cor: "Preto",
      ano_fab: 2024,
      ano_mod: 2025,
      hodometro: 12000,
      preco_original: 124990,
      created_at: FIXED_DATE,
      updated_at: FIXED_DATE
    }
  ],
  total: 3,
  page: 1,
  pageSize: 50
};

const ROOT_FOLDER_FIXTURE = {
  id: "folder-00000001",
  name: "Documentos",
  slug: "documentos",
  description: "Documentos administrativos",
  parentFolderId: null,
  fileCount: 4,
  childFolderCount: 0,
  physicalName: "Documentos",
  displayName: "Documentos",
  automationKey: null,
  automationRepositoryKey: null,
  managedCarroId: null,
  isAutomationRepository: false,
  isManagedFolder: false,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE
};

const SECONDARY_FOLDER_FIXTURE = {
  id: "folder-00000002",
  name: "Fotos do estoque",
  slug: "fotos-do-estoque",
  description: "Fotos para anuncios",
  parentFolderId: null,
  fileCount: 12,
  childFolderCount: 2,
  physicalName: "Fotos do estoque",
  displayName: "Fotos do estoque",
  automationKey: null,
  automationRepositoryKey: null,
  managedCarroId: null,
  isAutomationRepository: false,
  isManagedFolder: false,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE
};

export const FOLDERS_FIXTURE = {
  folders: [ROOT_FOLDER_FIXTURE, SECONDARY_FOLDER_FIXTURE]
};

export const FOLDER_DETAIL_FIXTURE = {
  folder: ROOT_FOLDER_FIXTURE,
  breadcrumb: [ROOT_FOLDER_FIXTURE],
  childFolders: [],
  files: []
};

export const LOOKUPS_WITH_DATA = {
  sale_statuses: [
    { code: "DISPONÍVEL", name: "Disponível" },
    { code: "RESERVADO", name: "Reservado" },
    { code: "VENDIDO", name: "Vendido" }
  ],
  announcement_statuses: [
    { code: "ANUNCIADO", name: "Anunciado" },
    { code: "PAUSADO", name: "Pausado" }
  ],
  locations: [
    { code: "Loja 1", name: "Loja 1" },
    { code: "Loja 2", name: "Loja 2" },
    { code: "Galpão", name: "Galpão" }
  ],
  vehicle_states: [
    { code: "PRONTO", name: "Pronto" },
    { code: "PREPARAÇÃO", name: "Preparação" }
  ],
  canais_cliente: [
    { code: "instagram", name: "Instagram" },
    { code: "indicacao", name: "Indicação" }
  ],
  user_roles: [
    { code: "ADMINISTRADOR", name: "Administrador" },
    { code: "VENDEDOR", name: "Vendedor" }
  ],
  user_statuses: [
    { code: "APROVADO", name: "Aprovado" },
    { code: "PENDENTE", name: "Pendente" }
  ],
  usuarios: [
    { code: "44444444-4444-4444-8444-444444444444", name: "Modo local ADMINISTRADOR" }
  ]
};
