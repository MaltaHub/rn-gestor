Política de Privacidade do Agente GPT "RN Agent Assistent"
===========================================================

Última atualização: 20 de junho de 2025

1. Introdução
-------------

O agente GPT chamado "RN Agent Assistent" foi desenvolvido para auxiliar na aplicação de regras de negócio configuráveis, acessadas dinamicamente por meio de um arquivo hospedado no GitHub. Esta Política de Privacidade descreve como as informações são tratadas durante o uso deste agente.

2. Coleta de Dados
------------------

Este agente **não coleta, armazena ou compartilha** dados pessoais dos usuários. Todas as interações ocorrem em tempo real, com base no conteúdo do arquivo externo e nas entradas fornecidas pelo usuário durante o uso.

3. Fonte de Dados Externa
-------------------------

O agente acessa regras de negócio por meio de um arquivo privado JSON hospedado no domínio:

https://raw.githubusercontent.com

Esse arquivo contém apenas informações de lógica empresarial e **não deve incluir dados pessoais ou sensíveis**.

4. Compartilhamento de Dados
----------------------------

Nenhuma informação fornecida ao agente é compartilhada com terceiros. A única comunicação externa feita por meio de **ações personalizadas (Custom Actions)** é a leitura do arquivo `rules.json` e `types.ts` previamente autorizado pelo criador do agente.

5. Segurança
------------

O agente utiliza apenas URLs explícitas e controladas para chamadas HTTP externas, garantindo que não haja comunicação com domínios não autorizados. É responsabilidade do criador manter o conteúdo de `rules.json` e `types.ts` seguro, livre de dados confidenciais e atualizado.

6. Alterações na Política
--------------------------

Esta política poderá ser atualizada conforme o agente for modificado ou novas funcionalidades forem adicionadas. Recomenda-se revisar este documento sempre que houver mudanças relevantes.

7. Contato
----------

Para dúvidas, sugestões ou solicitações relacionadas à privacidade deste agente, entre em contato com o responsável pelo projeto:

Responsável: MaltaHub  
Repositório: https://github.com/MaltaHub/rn-gestor  
E-mail de contato: kaicagora@gmail.com
