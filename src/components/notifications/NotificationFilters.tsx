
import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, List } from "lucide-react";

interface NotificationFiltersProps {
  activeFilter: 'all' | 'unread' | 'read';
  onFilterChange: (filter: 'all' | 'unread' | 'read') => void;
  totalCount: number;
  unreadCount: number;
}

export const NotificationFilters: React.FC<NotificationFiltersProps> = ({
  activeFilter,
  onFilterChange,
  totalCount,
  unreadCount
}) => {
  const readCount = totalCount - unreadCount;

  return (
    <div className="flex gap-2 mb-4">
      <Button
        variant={activeFilter === 'all' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onFilterChange('all')}
        className="flex items-center gap-2"
      >
        <List className="h-4 w-4" />
        Todas
        <Badge variant="secondary" className="ml-1">
          {totalCount}
        </Badge>
      </Button>
      
      <Button
        variant={activeFilter === 'unread' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onFilterChange('unread')}
        className="flex items-center gap-2"
      >
        <Circle className="h-4 w-4" />
        Não lidas
        {unreadCount > 0 && (
          <Badge variant="destructive" className="ml-1">
            {unreadCount}
          </Badge>
        )}
      </Button>
      
      <Button
        variant={activeFilter === 'read' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onFilterChange('read')}
        className="flex items-center gap-2"
      >
        <CheckCircle2 className="h-4 w-4" />
        Lidas
        <Badge variant="secondary" className="ml-1">
          {readCount}
        </Badge>
      </Button>
    </div>
  );
};
