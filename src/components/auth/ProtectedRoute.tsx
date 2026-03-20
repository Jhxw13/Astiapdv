import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { isRestrictedStoreAdmin } from "@/lib/admin-access";

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: string[]; // cargos permitidos; se omitido, qualquer logado passa
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { usuario, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!usuario) return <Navigate to="/auth" replace />;

  // Admin secundário da loja fica restrito somente à tela de Configurações.
  if (isRestrictedStoreAdmin(usuario) && location.pathname !== "/configuracoes") {
    return <Navigate to="/configuracoes" replace />;
  }

  // Verifica se o cargo do usuário tem permissão
  if (roles && !roles.includes(usuario.cargo)) {
    // Redireciona para a área correta em vez de 403
    if (usuario.cargo === 'caixa') return <Navigate to="/caixa" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
