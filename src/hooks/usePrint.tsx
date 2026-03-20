import { useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export const usePrint = () => {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) {
      toast({
        title: "Erro",
        description: "Componente de impressão não encontrado",
        variant: "destructive"
      });
      return;
    }

    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;

    // Criar estilos específicos para impressão
    const printStyles = `
      <style>
        @media print {
          body {
            margin: 0;
            padding: 0;
            font-family: 'Courier New', monospace;
          }
          .receipt-print {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 10px !important;
            font-size: 12px !important;
            line-height: 1.2 !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      </style>
    `;

    // Substituir o conteúdo da página
    document.body.innerHTML = printStyles + printContent;

    // Imprimir
    window.print();

    // Restaurar o conteúdo original
    document.body.innerHTML = originalContent;
    
    // Recarregar os scripts (necessário após substituir o innerHTML)
    window.location.reload();
  };

  const handlePrintWithPrompt = () => {
    const confirmPrint = window.confirm("Deseja imprimir este cupom?");
    if (confirmPrint) {
      handlePrint();
    }
  };

  return {
    printRef,
    handlePrint,
    handlePrintWithPrompt
  };
};