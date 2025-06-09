
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Camera, FileText, Car, ExternalLink } from 'lucide-react';
import { VehiclePendency } from '@/hooks/useVehiclePendencies';
import { useNavigate } from 'react-router-dom';

interface PendencyCardProps {
  pendency: VehiclePendency;
  onResolve?: (pendencyId: string) => void;
}

const PendencyCard: React.FC<PendencyCardProps> = ({ pendency, onResolve }) => {
  const navigate = useNavigate();

  const getTypeIcon = () => {
    switch (pendency.type) {
      case 'missing_photos':
        return <Camera className="h-4 w-4" />;
      case 'missing_ads':
        return <FileText className="h-4 w-4" />;
      case 'incomplete_info':
        return <AlertTriangle className="h-4 w-4" />;
      case 'document_pending':
        return <Car className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSeverityColor = () => {
    switch (pendency.severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getTypeLabel = () => {
    switch (pendency.type) {
      case 'missing_photos':
        return 'Fotos Faltantes';
      case 'missing_ads':
        return 'Anúncios Faltantes';
      case 'incomplete_info':
        return 'Info. Incompletas';
      case 'document_pending':
        return 'Doc. Pendente';
      default:
        return 'Pendência';
    }
  };

  const handleViewVehicle = () => {
    navigate(`/vehicle/${pendency.vehicleId}`);
  };

  const handleCreateAd = () => {
    if (pendency.type === 'missing_ads') {
      navigate('/advertisements');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Hoje';
    if (diffDays === 2) return 'Ontem';
    if (diffDays <= 7) return `${diffDays} dias atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getTypeIcon()}
            <CardTitle className="text-sm font-medium">{pendency.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getSeverityColor() as any} className="text-xs">
              {getTypeLabel()}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {pendency.severity.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{pendency.description}</p>
        
        {pendency.missingPlatforms && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Plataformas faltantes:</p>
            <div className="flex flex-wrap gap-1">
              {pendency.missingPlatforms.map(platform => (
                <Badge key={platform} variant="outline" className="text-xs">
                  {platform}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>{pendency.store}</span>
          <span>{formatDate(pendency.createdAt)}</span>
        </div>

        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleViewVehicle}
            className="flex-1"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver Veículo
          </Button>
          
          {pendency.type === 'missing_ads' && (
            <Button 
              size="sm" 
              onClick={handleCreateAd}
              className="flex-1"
            >
              Criar Anúncio
            </Button>
          )}
          
          {onResolve && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => onResolve(pendency.id)}
            >
              Resolver
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PendencyCard;
