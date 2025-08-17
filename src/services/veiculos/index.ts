import { api } from "../../lib/axiosClient";

// Concertar a interface
export interface Vehicle {
  [key: string]: string;
}

export async function fetchAll() {
  const { data } = await api.get<{vehicles:[],name:string}>("/vehicles");
  return data;
}

export async function create(payload: Partial<Vehicle>): Promise<Vehicle> {
  const { data } = await api.post("/vehicles", payload);
  return data as Vehicle;
}

export async function update(
  id: string,
  payload: Partial<Vehicle>
): Promise<Vehicle> {
  const { data } = await api.put(`/vehicles/${id}`, payload);
  return data as Vehicle;
}

export async function remove(id: string): Promise<{ success: boolean }> {
  const { data } = await api.delete(`/vehicles/${id}`);
  return data as { success: boolean };
}
