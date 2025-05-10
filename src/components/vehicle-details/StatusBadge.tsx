
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Vehicle } from "@/types";

interface StatusBadgeProps {
  status: Vehicle['status'];
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let color: "default" | "secondary" | "destructive" = "default";
  let label = "";
  
  switch (status) {
    case "available":
      color = "default";
      label = "Disponível";
      break;
    case "reserved":
      color = "secondary";
      label = "Reservado";
      break;
    case "sold":
      color = "destructive";
      label = "Vendido";
      break;
  }
  
  return <Badge variant={color}>{label}</Badge>;
};
