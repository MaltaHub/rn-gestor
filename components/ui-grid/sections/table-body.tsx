import type { ReactNode } from "react";

type GridTableBodySectionProps = {
  children: ReactNode;
};

export function GridTableBodySection({ children }: GridTableBodySectionProps) {
  return <>{children}</>;
}
