# Documentação

| Onde | O que é |
|---|---|
| [processo-documental.md](processo-documental.md) | Como funciona a documentação dos veículos: os 4 eixos (nota de entrada, CRLV, nota de saída, perícia), estados do CRLV, troca e finalização. |
| [acesso-ao-banco-e-rls.md](acesso-ao-banco-e-rls.md) | Por que o navegador nunca fala direto com o banco e como as rotas da API controlam o acesso. |
| [work-records/](work-records/) | Um registro por mudança grande (`AAAA-MM-DD-titulo.md`, modelo em `_modelo.md`): pedido, o que mudou, como foi verificado e o que ficou pendente. Comece pelo mais recente. |
| [archive/](archive/) | Diagnósticos e planos antigos (março–maio de 2026). Só para consulta: o código atual pode ter mudado. |

Relatórios gerados sob demanda (não versionados): `node scripts/css-audit.mjs` grava
`docs/css-audit.md` e `docs/ui-inventory.md`.
