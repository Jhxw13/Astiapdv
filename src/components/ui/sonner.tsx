// Sonner substituído para não depender do pacote 'sonner' externo
// Usa o sistema de toast nativo do @radix-ui/react-toast já instalado
import { useToast } from "@/hooks/use-toast"

// Re-exporta toast para compatibilidade com imports existentes
export { useToast as toast }

const Toaster = () => {
  // O Toaster real está em @/components/ui/toaster (já importado no App.tsx)
  // Este é um stub para não quebrar imports de sonner
  return null
}

export { Toaster }
