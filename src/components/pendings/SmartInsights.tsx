
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, AlertTriangle, Target } from "lucide-react";

interface SmartInsight {
  id: string;
  type: 'performance' | 'alert' | 'opportunity' | 'trend';
  title: string;
  description: string;
  action?: string;
  priority: 'high' | 'medium' | 'low';
  data?: any;
}

interface SmartInsightsProps {
  insights: SmartInsight[];
  onActionClick: (insight: SmartInsight) => void;
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ insights, onActionClick }) => {
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'performance':
        return <TrendingUp className="h-4 w-4" />;
      case 'alert':
        return <AlertTriangle className="h-4 w-4" />;
      case 'opportunity':
        return <Target className="h-4 w-4" />;
      case 'trend':
        return <Brain className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  // Insights fictícios baseados nos dados reais
  const defaultInsights: SmartInsight[] = [
    {
      id: '1',
      type: 'alert',
      title: 'Veículos críticos sem anúncios',
      description: '15 veículos estão há mais de 10 dias sem anúncios no OLX',
      action: 'Criar anúncios prioritários',
      priority: 'high'
    },
    {
      id: '2',
      type: 'performance',
      title: 'Performance RN Multimarcas',
      description: 'RN Multimarcas tem 65% mais pendências que Roberto Automóveis',
      action: 'Analisar workflow',
      priority: 'medium'
    },
    {
      id: '3',
      type: 'opportunity',
      title: 'Oportunidade de automação',
      description: 'Whatsapp tem 0 anúncios - potencial para automação',
      action: 'Configurar integração',
      priority: 'low'
    },
    {
      id: '4',
      type: 'trend',
      title: 'Tendência de pendências',
      description: 'Aumento de 20% nas pendências na última semana',
      action: 'Investigar causas',
      priority: 'medium'
    }
  ];

  const displayInsights = insights.length > 0 ? insights : defaultInsights;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Insights Inteligentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayInsights.map((insight) => (
            <div key={insight.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-start gap-3 flex-1">
                <div className="flex-shrink-0 mt-1">
                  {getInsightIcon(insight.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{insight.title}</h4>
                    <Badge variant={getPriorityColor(insight.priority)}>
                      {insight.priority === 'high' ? 'Alta' : 
                       insight.priority === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                </div>
              </div>
              {insight.action && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onActionClick(insight)}
                >
                  {insight.action}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartInsights;
