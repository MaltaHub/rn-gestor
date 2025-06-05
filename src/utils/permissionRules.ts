// Define the available app areas
import { AppArea } from "@/types/permission";

// Define the rules for each area and role
export const permissionRules: Record<AppArea, { 
    roles: Record<string, number>, // Cada cargo mapeado para o nível mínimo necessário
    type: "page" | "functionality" // Define se é uma página ou funcionalidade
}> = {
    inventory: { roles: { "Gestor": 3, "Usuario": 1, "Gerente": 7 }, type: "page" },
    vehicle_details: { roles: { "Usuario": 1 }, type: "page" },
    add_vehicle: { roles: { "Gestor": 2, "Gerente": 3 }, type: "page" },
    sales: { roles: { "Vendedor": 1 }, type: "page" },
    edit_vehicle: { roles: { "Gestor": 3 }, type: "functionality" },
    advertisements: { roles: { "Gestor": 2, "Gerente": 9 }, type: "page" }
};
