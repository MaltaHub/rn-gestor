import { ComponentPropsWithoutRef } from "react";

type CardProps = ComponentPropsWithoutRef<"article">;

export function Card({ className, ...props }: CardProps) {
  return <article className={className ? `card ${className}` : "card"} {...props} />;
}
