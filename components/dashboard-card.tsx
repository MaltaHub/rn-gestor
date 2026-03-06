export function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="card">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </article>
  );
}
