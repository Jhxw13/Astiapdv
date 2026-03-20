/**
 * VYN CRM - AuthContext v2.1
 * Corrigido: caixa redireciona para /caixa, login navega por cargo
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authAPI } from '@/lib/api';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cargo: 'admin' | 'gerente' | 'vendedor' | 'caixa';
  ativo: number;
}

interface AuthContextType {
  usuario: Usuario | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<{ ok: boolean; destino?: string; erro?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isGerente: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

const STORAGE_KEY = 'vyncrm_usuario';

/** Retorna a rota inicial para cada cargo */
export function destinoPorCargo(cargo: string): string {
  if (cargo === 'caixa') return '/caixa';
  return '/dashboard';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo) {
      try { setUsuario(JSON.parse(salvo)); } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, senha: string) => {
    setLoading(true);
    try {
      const u = await authAPI.login(email, senha);
      if (u) {
        setUsuario(u);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        return { ok: true, destino: destinoPorCargo(u.cargo) };
      }
      return { ok: false, erro: 'E-mail ou senha incorretos' };
    } catch (e: any) {
      return { ok: false, erro: e.message || 'Erro ao conectar com o servidor' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{
      usuario, loading, login, logout,
      isAdmin: usuario?.cargo === 'admin',
      isGerente: usuario?.cargo === 'admin' || usuario?.cargo === 'gerente',
    }}>
      {children}
    </AuthContext.Provider>
  );
}
