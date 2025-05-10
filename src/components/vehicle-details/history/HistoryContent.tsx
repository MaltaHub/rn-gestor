
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClockIcon, AlertCircle } from "lucide-react";
import { HistoryItem } from "./HistoryItem";

interface HistoryContentProps {
  isLoading: boolean;
  error: string | null;
  filteredHistory: Array<{
    id: string;
    vehicle_id: string;
    field_name: string;
    old_value: string | null;
    new_value: string;
    changed_by: string;
    changed_at: string;
    name: string | null;
    user_id: string | null;
  }>;
  formatValue: (fieldName: string, value: string) => string;
  getFieldLabel: (fieldName: string) => string;
}

export const HistoryContent: React.FC<HistoryContentProps> = ({
  isLoading,
  error,
  filteredHistory,
  formatValue,
  getFieldLabel
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <ClockIcon className="h-6 w-6 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
        <AlertCircle className="h-6 w-6 text-vehicleApp-red" />
        <p className="text-vehicleApp-mediumGray">{error}</p>
      </div>
    );
  }

  if (filteredHistory.length === 0) {
    return (
      <p className="text-center text-vehicleApp-mediumGray py-4">
        Nenhuma alteração registrada
      </p>
    );
  }

  return (
    <ScrollArea className="h-[300px] pr-4">
      <div className="space-y-4">
        {filteredHistory.map((item, index) => (
          <HistoryItem
            key={item.id}
            item={item}
            index={index}
            totalItems={filteredHistory.length}
            formatValue={formatValue}
            getFieldLabel={getFieldLabel}
          />
        ))}
      </div>
    </ScrollArea>
  );
};
