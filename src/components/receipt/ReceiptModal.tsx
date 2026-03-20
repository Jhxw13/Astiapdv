import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt } from "./Receipt";
import { usePrint } from "@/hooks/usePrint";
import { Printer, Download, X } from "lucide-react";

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: {
    saleNumber: number;
    customer: string | null;
    seller: string;
    items: ReceiptItem[];
    total: number;
    paymentMethod: string;
    date: string;
  } | null;
}

export const ReceiptModal = ({ isOpen, onClose, saleData }: ReceiptModalProps) => {
  const { printRef, handlePrintWithPrompt } = usePrint();

  // Verificar se saleData é null ou undefined
  if (!saleData) {
    return null;
  }

  const handleDownloadPDF = () => {
    // Para implementação futura com html2pdf ou similar
    console.log("Download PDF - Em desenvolvimento");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Cupom Fiscal
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Visualize e imprima o cupom da venda #{saleData.saleNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-muted/30">
            <Receipt
              ref={printRef}
              saleNumber={saleData.saleNumber}
              customerName={saleData.customer || "Cliente Não Identificado"}
              sellerName={saleData.seller}
              items={saleData.items.map(item => ({
                productName: item.name,
                quantity: item.quantity,
                price: item.price,
                total: item.total
              }))}
              total={saleData.total}
              paymentMethod={saleData.paymentMethod}
              date={new Date(saleData.date)}
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handlePrintWithPrompt}
              className="flex-1 btn-gradient"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button 
              variant="outline"
              onClick={handleDownloadPDF}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};