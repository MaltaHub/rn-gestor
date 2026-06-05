export function VendedorSoon({ title }: { title: string }) {
  return (
    <div className="vendedor-soon" data-testid={`vendedor-soon-${title.toLowerCase()}`}>
      <strong>{title}</strong>
      <p>Em breve.</p>
    </div>
  );
}
