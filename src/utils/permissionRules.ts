// Cada constante representa o nível mínimo de acesso
const LEVEL_1 = 1;
const LEVEL_2 = 2;
const LEVEL_5 = 5;
const LEVEL_9 = 9; // Ajustado para o máximo disponível

// Quanto maior o nível, mais permissões o usuário possui.

// Define the available app areas
import { AppArea } from "@/types/permission";

// Define the rules for each area and role
export const permissionRules: Record<AppArea, {
    roles: Record<string, number>, // Cada cargo mapeado para o nível mínimo necessário
    type: "page" | "functionality" // Define se é uma página ou funcionalidade
}> = {
    inventory: {
        roles:
        {
            "Administrador": LEVEL_1,
            "Gestor": LEVEL_1,
            "Usuario": LEVEL_1,
            "Gerente": LEVEL_1,
            "Consultor": LEVEL_1
        },
        type: "page"
    },
    vehicle_details: {
        roles:
        {
            "Usuario": LEVEL_1,
            "Gerente": LEVEL_5,
            "Consultor": LEVEL_2,
            "Gestor": LEVEL_5,
            "Administrador": LEVEL_1
        },
        type: "page"
    },
    add_vehicle: {
        roles:
        {
            "Gestor": LEVEL_2,
            "Gerente": LEVEL_2
        },
        type: "page"
    },
    sales: {
        roles:
        {
            "Consultor": LEVEL_2,
            "Gestor": LEVEL_1,
            "Gerente": LEVEL_5
        },
        type: "page"
    },
    sales_dashboard: {
        roles:
        {
            "Gestor": LEVEL_5,
            "Gerente": LEVEL_1,
            "Administrador": LEVEL_1
        },
        type: "page"
    },
    edit_vehicle: {
        roles:
        {
            "Gestor": LEVEL_5,
            "Gerente": LEVEL_5,
            "Consultor": LEVEL_2 // Consultores só editam alguns campos
        },
        type: "functionality"
    },
    advertisements: {
        roles:
        {
            "Gestor": LEVEL_5,
            "Gerente": LEVEL_5,
            "Consultor": LEVEL_1
        },
        type: "page"
    },
    pendings: {
        roles: {
            "Administrador": LEVEL_1,
            "Gestor": LEVEL_1,
            "Usuario": LEVEL_1,
            "Gerente": LEVEL_1,
            "Consultor": LEVEL_1
        },
        type: "page"
    },
    admin_panel: {
        roles: {
            "Administrador": LEVEL_9 // Usando nível 9 agora
        },
        type: "page"
    }
};
