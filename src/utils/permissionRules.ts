// Define the available app areas
export type AppArea = "inventory" | "vehicle_details" | "add_vehicle" | "sales" | "edit_vehicle";

// Define the rules for each area and role
export const permissionRules: Record<AppArea, { 
    requiredRoles: string[]; requiredLevel: number }> = {
    
  inventory: { requiredRoles: ["Gestor", "Usuario"], requiredLevel: 1 },
  vehicle_details: { requiredRoles: ["Usuario"], requiredLevel: 1 },
  add_vehicle: { requiredRoles: ["Gestor"], requiredLevel: 2 },
  sales: { requiredRoles: ["Vendedor"], requiredLevel: 1 },
  edit_vehicle: { requiredRoles: ["Gestor"], requiredLevel: 3 },
};
