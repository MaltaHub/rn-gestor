
import { useState } from 'react';

/**
 * Simplified hook to replace useRoles
 */
export const useRoles = () => {
  return {
    roles: ['Usuário', 'Vendedor', 'Gerente', 'Administrador'],
    isLoading: false,
    error: null
  };
};

export default useRoles;
