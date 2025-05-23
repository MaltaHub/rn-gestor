
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardHeader } from "@/components/ui/card";
import { Vehicle } from "@/types";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  isLoading: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isSaving: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export const VehicleHeader: React.FC<VehicleHeaderProps> = ({
  vehicle,
  isLoading,
  isDeleting,
  isEditing,
  isSaving,
  canEdit,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <Link to="/inventory">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-xl font-bold">{vehicle.model} {vehicle.year}</h2>
          <StatusBadge status={vehicle.status} />
        </div>
      </CardHeader>
    </Card>
  );
};
