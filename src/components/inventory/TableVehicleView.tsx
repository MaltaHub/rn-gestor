
import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VehicleWithIndicators } from "@/types";
import { StatusBadge } from "@/components/vehicle-details/StatusBadge";
import { VehicleIndicators } from "@/components/vehicle-indicators/VehicleIndicators";

interface TableVehicleViewProps {
  vehicles: VehicleWithIndicators[];
  onVehicleClick: (vehicleId: string) => void;
}

export const TableVehicleView: React.FC<TableVehicleViewProps> = ({
  vehicles,
  onVehicleClick
}) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Indicadores</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>Placa</TableHead>
            <TableHead>Ano</TableHead>
            <TableHead>Cor</TableHead>
            <TableHead>KM</TableHead>
            <TableHead>Local</TableHead>
            <TableHead>Documentação</TableHead>
            <TableHead>Preço</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((vehicle) => (
            <TableRow 
              key={vehicle.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onVehicleClick(vehicle.id)}
            >
              <TableCell>
                <VehicleIndicators vehicle={vehicle} />
              </TableCell>
              <TableCell className="font-medium">{vehicle.model}</TableCell>
              <TableCell className="text-vehicleApp-mediumGray">{vehicle.plate}</TableCell>
              <TableCell>{vehicle.year}</TableCell>
              <TableCell>{vehicle.color}</TableCell>
              <TableCell>{vehicle.mileage.toLocaleString()} km</TableCell>
              <TableCell>
                {vehicle.local && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {vehicle.local}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {vehicle.documentacao && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    {vehicle.documentacao}
                  </span>
                )}
              </TableCell>
              <TableCell className={`font-bold ${
                vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'
              }`}>
                R$ {vehicle.price.toLocaleString()}
              </TableCell>
              <TableCell>
                <StatusBadge status={vehicle.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
