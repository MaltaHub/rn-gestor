
import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
  const handleCollaboratorClick = (userId: string) => {
    if (userId) {
      navigate(`/collaborator/${userId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-8 w-8 border-2 border-vehicleApp-red border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-vehicleApp-red" />
        <p className="text-vehicleApp-mediumGray">{error}</p>
      </div>
    );
  }

  if (filteredHistory.length === 0) {
    return (
      <div className="border rounded-md p-8 text-center">
        <p className="text-vehicleApp-mediumGray">Nenhuma alteração registrada</p>
      </div>
    );
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[180px]">Campo</TableHead>
              <TableHead>Alteração</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="text-right">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {getFieldLabel(item.field_name)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <div className="text-sm">
                      <span className="text-vehicleApp-mediumGray mr-1">De:</span>
                      <span className="line-through decoration-vehicleApp-red/50">
                        {item.old_value ? formatValue(item.field_name, item.old_value) : <em>vazio</em>}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-vehicleApp-mediumGray mr-1">Para:</span>
                      <span className="font-medium">
                        {formatValue(item.field_name, item.new_value)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span 
                    className="font-semibold cursor-pointer hover:text-vehicleApp-red hover:underline"
                    onClick={() => handleCollaboratorClick(item.changed_by)}
                  >
                    {item.name || 'Usuário'}
                  </span>
                </TableCell>
                <TableCell className="text-right text-vehicleApp-mediumGray text-sm">
                  {format(new Date(item.changed_at), "dd/MM/yyyy 'às' HH:mm")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink 
                  isActive={page === currentPage}
                  onClick={() => setCurrentPage(page)}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};
