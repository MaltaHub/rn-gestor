
import React from "react";
import { Filter } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";

interface HistoryFilterProps {
  fieldFilter: string;
  setFieldFilter: (value: string) => void;
  uniqueFieldNames: string[];
  getFieldLabel: (fieldName: string) => string;
}

export const HistoryFilter: React.FC<HistoryFilterProps> = ({
  fieldFilter,
  setFieldFilter,
  uniqueFieldNames,
  getFieldLabel
}) => {
  return (
    <div className="w-48">
      <Select value={fieldFilter} onValueChange={setFieldFilter}>
        <SelectTrigger>
          <div className="flex items-center">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filtrar por campo" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os campos</SelectItem>
          {uniqueFieldNames.map(fieldName => (
            <SelectItem key={fieldName} value={fieldName}>
              {getFieldLabel(fieldName)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
