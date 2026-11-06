# Documentação

| Onde | O que é |
|---|---|
| [processo-documental.md](processo-documental.md) | Como funciona a documentação dos veículos: os 4 eixos (nota de entrada, CRLV, nota de saída, perícia), estados do CRLV, troca e finalização. |
| [project-control/work-records/](project-control/work-records/) | Um registro por mudança grande (`AAAA-MM-DD-titulo.md`): pedido, o que mudou, como foi verificado e o que ficou pendente. Comece pelo mais recente. |
| [project-control/](project-control/) | Estratégia de acesso ao banco/RLS e o inventário de ferramentas do agente (`tool-registry.*`). |
| [refactor-metrics/](refactor-metrics/) | Base usada pelo portão de qualidade do CI (`npm run metrics:gate`). |
| [archive/](archive/) | Diagnósticos e planos antigos (março–maio de 2026). Só para consulta: o código atual pode ter mudado. |

Relatórios gerados sob demanda (não versionados): `node scripts/css-audit.mjs` grava
`docs/css-audit.md` e `docs/ui-inventory.md`.
