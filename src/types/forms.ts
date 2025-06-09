import { Vehicle } from "@/types";

export type VehicleFormData = Omit<Vehicle, 'id' | 'added_at' | 'status'> & {
  marca?: string;
  specifications: {
    engine?: string;
    transmission?: string;
    fuel?: string;
    renavam?: string;
    chassi?: string;
    tipoCarroceria?: string;
    municipio?: string;
    uf?: string;
    valorFipe?: string;
  };
};
