//Essa função é um atalho para escrever classes do Tailwind de forma limpa, condicional 
// e sem conflitos — juntando a lógica do clsx com o "desempate" do tailwind-merge.

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
