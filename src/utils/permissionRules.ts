
const VIEW_LEVEL = 1;
const WORK_LEVEL = 2;
const EDIT_LEVEL = 5;
const ADMIN_LEVEL = 10;

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
            "Administrador": VIEW_LEVEL,
            "Gestor": VIEW_LEVEL,
            "Usuario": VIEW_LEVEL,
            "Gerente": VIEW_LEVEL,
            "Consultor": VIEW_LEVEL
        },
        type: "page"
    },
    vehicle_details: {
        roles:
        {
            "Usuario": VIEW_LEVEL,
            "Gerente": EDIT_LEVEL,
            "Consultor": WORK_LEVEL,
            "Gestor": EDIT_LEVEL,
            "Administrador": VIEW_LEVEL
        },
        type: "page"
    },
    add_vehicle: {
        roles:
        {
            "Gestor": WORK_LEVEL,
            "Gerente": WORK_LEVEL
        },
        type: "page"
    },
    sales: {
        roles:
        {
            "Consultor": WORK_LEVEL,
            "Gestor": VIEW_LEVEL,
            "Gerente": EDIT_LEVEL
        },
        type: "page"
    },
    sales_dashboard: {
        roles:
        {
            "Gestor": EDIT_LEVEL,
            "Gerente": VIEW_LEVEL,
            "Administrador": VIEW_LEVEL
        },
        type: "page"
    },
    edit_vehicle: {
        roles:
        {
            "Gestor": EDIT_LEVEL,
            "Gerente": EDIT_LEVEL,
            "Consultor": WORK_LEVEL // Consultores só editam alguns campos
        },
        type: "functionality"
    },
    advertisements: {
        roles:
        {
            "Gestor": EDIT_LEVEL,
            "Gerente": EDIT_LEVEL,
            "Consultor": VIEW_LEVEL
        },
        type: "page"
    },
    pendings: {
        roles: {
            "Administrador": VIEW_LEVEL,
            "Gestor": VIEW_LEVEL,
            "Usuario": VIEW_LEVEL,
            "Gerente": VIEW_LEVEL,
            "Consultor": VIEW_LEVEL
        },
        type: "page"
    },
    admin_panel: {
        roles: {
            "Administrador": ADMIN_LEVEL
        },
        type: "page"
    }
};
