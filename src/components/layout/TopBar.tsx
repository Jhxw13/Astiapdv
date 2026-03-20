import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, User, Settings, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { PainelLiberacoes, usePendenteCount } from "@/components/ui/PainelLiberacoes";

interface TopBarProps {
  title?: string;
}

export function TopBar({ title = "Dashboard" }: TopBarProps) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [painelAberto, setPainelAberto] = useState(false);
  const pendentes = usePendenteCount();

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  const isGerente = usuario?.cargo === "admin" || usuario?.cargo === "gerente";

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shadow-soft">
      <div className="flex items-center space-x-4">
        <SidebarTrigger className="lg:hidden" />
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Bem-vindo, {usuario?.nome || "Usuário"}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <ThemeToggle />

        {/* Botão de liberações — visível para todos, badge só aparece quando há pendentes */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPainelAberto(o => !o)}
            className={pendentes > 0 ? "text-amber-500 hover:text-amber-600" : ""}
            title="Liberações pendentes"
          >
            <Shield className="w-5 h-5" />
            {pendentes > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse leading-none">
                {pendentes > 9 ? "9+" : pendentes}
              </span>
            )}
          </Button>

          {painelAberto && (
            <>
              {/* Overlay para fechar clicando fora */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPainelAberto(false)}
              />
              <div className="relative z-50">
                <PainelLiberacoes onClose={() => setPainelAberto(false)} />
              </div>
            </>
          )}
        </div>

        {/* Bell genérico (futuro: outros alertas) */}
        <Button variant="ghost" size="icon">
          <Bell className="w-5 h-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{usuario?.nome}</p>
                <p className="text-xs text-muted-foreground capitalize">{usuario?.cargo}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" />Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
