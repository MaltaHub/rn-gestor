
# Regras de Negócio - Sistema de Cargos e Permissões

Este documento revisa as regras de negócio implementadas e ainda pendentes no sistema de gerenciamento de cargos e permissões.

## Regras Implementadas

### Cargos Padrão
- [x] O sistema possui quatro cargos padrão: Usuário, Vendedor, Gerente e Administrador
- [x] O cargo de Gerente não pode ser criado ou excluído
- [x] O cargo de Administrador só pode existir um no sistema

### Hierarquia e Restrições
- [x] Somente Administradores podem editar permissões dos cargos
- [x] Administradores não podem editar as permissões do cargo Gerente
- [x] Administradores não podem editar as permissões do cargo Administrador
- [x] Gerentes só podem alterar cargos de Vendedores
- [x] Não é possível alterar o cargo de um Administrador
- [x] Quando um novo Administrador é promovido, o Administrador atual é rebaixado para Vendedor

### Exclusão de Cargos
- [x] O cargo Usuário não pode ser excluído
- [x] O cargo Gerente não pode ser excluído
- [x] O cargo de Administrador não pode ser excluído enquanto houver usuários com esse cargo
- [x] Ao excluir um cargo, os usuários com esse cargo são movidos para o cargo "Usuário"
- [x] Apenas Administradores podem excluir cargos

### Permissões
- [x] Cada cargo tem níveis de permissão definidos para cada área do sistema
- [x] Os níveis de permissão variam de 0 (sem acesso) a 10 (acesso total)
- [x] Algumas áreas têm níveis mínimos garantidos (ex: visualização do estoque)
- [x] Perfis sem cargo definido recebem o cargo "Usuário" por padrão

### Validações de Segurança
- [x] Validação tanto no cliente quanto no servidor para todas as operações críticas
- [x] Confirmação adicional para ações potencialmente destrutivas (ex: promoção para Administrador)

## Regras Não Implementadas ou Parcialmente Implementadas

### Backend
- [ ] **Validação automática de cargos únicos**: Não há uma restrição de unicidade no banco de dados para evitar duplicidade de cargos
- [ ] **Trigger para validar número de Administradores**: Falta um trigger no banco de dados para garantir que exista apenas um Administrador
- [ ] **Trigger para validar existência de pelo menos um Gerente**: Não há validação automática para garantir que exista pelo menos um Gerente

### Frontend
- [ ] **Feedback visual** quando um usuário tenta acessar funcionalidades sem permissão
- [ ] **Paginação** na listagem de cargos e usuários para melhor performance com grandes volumes de dados
- [ ] **Exportação de relatórios** sobre permissões e cargos

## Verificação de consistência

### Validações críticas no backend
1. [x] Verificar se o usuário tem permissão antes de executar qualquer alteração
2. [x] Verificar se o cargo a ser excluído não é protegido
3. [x] Ao promover para Administrador, rebaixar o Administrador atual
4. [ ] Trigger para impedir exclusão do último Gerente

### Validações críticas no frontend
1. [x] Desabilitar botões de ações não permitidas
2. [x] Mostrar avisos antes de executar ações críticas
3. [x] Validar dados antes de enviar para o backend
4. [x] Tratar erros do backend e exibir mensagens adequadas

## Recomendações
1. Implementar as validações de backend pendentes usando triggers no banco de dados
2. Criar testes automatizados para as regras de negócio críticas
3. Melhorar o feedback visual para usuários sem permissão
4. Implementar logs de auditoria para alterações de cargos e permissões
5. Adicionar paginação nas listagens para melhor desempenho
