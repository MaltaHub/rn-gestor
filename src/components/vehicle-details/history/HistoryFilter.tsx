
import React from "react";
import { Filter, SortAsc, SortDesc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HistoryFilterProps {
  fieldFilter: string;
  setFieldFilter: (value: string) => void;
  uniqueFieldNames: string[];
  getFieldLabel: (fieldName: string) => string;
  sortDirection: "asc" | "desc";
  setSortDirection: (direction: "asc" | "desc") => void;
}

export const HistoryFilter: React.FC<HistoryFilterProps> = ({
  fieldFilter,
  setFieldFilter,
  uniqueFieldNames,
  getFieldLabel,
  sortDirection,
  setSortDirection
}) => {
  return (
    <div className="flex items-center gap-2">
      <Select value={fieldFilter} onValueChange={setFieldFilter}>
        <SelectTrigger className="w-[180px]">
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
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
            >
              {sortDirection === "desc" ? (
                <SortDesc className="h-4 w-4" />
              ) : (
                <SortAsc className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Ordenar por {sortDirection === "desc" ? "mais recentes" : "mais antigos"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
