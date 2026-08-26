import { SetMetadata } from '@nestjs/common';

// Marca uma rota como exigindo User.accessLevel === 'admin' -- checado
// pelo mesmo AuthGuard global, depois que a sessão já foi validada. Ver
// User.accessLevel no schema pra por que este campo existe (antes dele,
// não havia permissão nenhuma: todo login autenticado enxergava e editava
// tudo, inclusive financeiro e custo/hora de outra pessoa).
export const IS_ADMIN_ONLY_KEY = 'isAdminOnly';
export const AdminOnly = () => SetMetadata(IS_ADMIN_ONLY_KEY, true);
