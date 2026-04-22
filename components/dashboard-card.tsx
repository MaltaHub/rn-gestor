import { Card } from "@/components/atoms/card";

export function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <h3>{title}</h3>
      <strong>{value}</strong>
    </Card>
  );
}
