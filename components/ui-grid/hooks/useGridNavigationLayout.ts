import { useState } from "react";

export function useGridNavigationLayout() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Form de registro flutuante aberto (Novo/Editar/Inserir em massa).
  const [showFormPanel, setShowFormPanel] = useState(false);

  return { page, setPage, pageSize, setPageSize, showFormPanel, setShowFormPanel };
}
