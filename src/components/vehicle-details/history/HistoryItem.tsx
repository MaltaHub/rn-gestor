
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface HistoryItemProps {
  item: {
    id: string;
    field_name: string;
    old_value: string | null;
    new_value: string;
    changed_by: string;
    changed_at: string;
    name: string | null;
    user_id: string | null;
  };
  index: number;
  totalItems: number;
  formatValue: (fieldName: string, value: string) => string;
  getFieldLabel: (fieldName: string) => string;
}

export const HistoryItem: React.FC<HistoryItemProps> = ({ 
  item, 
  index, 
  totalItems,
  formatValue,
  getFieldLabel
}) => {
  const navigate = useNavigate();
  
  const handleCollaboratorClick = (userId: string) => {
    if (userId) {
      navigate(`/collaborator/${userId}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {getFieldLabel(item.field_name)}
          </Badge>
          <span className="text-sm text-vehicleApp-darkGray">
            por{" "}
            <span 
              className="font-semibold cursor-pointer hover:text-vehicleApp-red hover:underline"
              onClick={() => handleCollaboratorClick(item.changed_by)}
            >
              {item.name || 'Usuário'}
            </span>
          </span>
        </div>
        <span className="text-xs text-vehicleApp-mediumGray">
          {format(new Date(item.changed_at), "dd/MM/yyyy 'às' HH:mm")}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 pl-1">
        <div className="text-sm">
          <span className="text-vehicleApp-mediumGray">De: </span>
          <span className="font-medium line-through decoration-vehicleApp-red/50">
            {item.old_value ? formatValue(item.field_name, item.old_value) : <em>vazio</em>}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-vehicleApp-mediumGray">Para: </span>
          <span className="font-medium text-vehicleApp-darkGray">
            {formatValue(item.field_name, item.new_value)}
          </span>
        </div>
      </div>
      
      {index < totalItems - 1 && <Separator className="mt-3" />}
    </div>
  );
};
