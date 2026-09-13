import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PixPaymentData = {
  paymentId: string;
  payload: string;
  encodedImage: string;
  expirationDate: string | null;
  status?: string;
};

export function PixPaymentDialog({
  open,
  saleId,
  onOpenChange,
  onPaid,
}: {
  open: boolean;
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PixPaymentData | null>(null);

  async function createPayment() {
    if (!saleId) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("create-pix-payment", {
        body: { saleId },
      });
      if (error) throw error;
      if (!result?.payload || !result?.encodedImage) throw new Error(result?.error || "Não foi possível gerar o Pix.");
      setData(result as PixPaymentData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o Pix.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPayload() {
    if (!data?.payload) return;
    await navigator.clipboard.writeText(data.payload);
    toast.success("Pix Copia e Cola copiado");
  }

  function close(value: boolean) {
    if (!value) {
      setData(null);
      onPaid?.();
    }
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento via Pix</DialogTitle>
          <DialogDescription>
            Gere o QR Code dinâmico pelo Asaas e aguarde a confirmação automática do pagamento.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="space-y-4">
            <div className="panel p-4 text-sm text-muted-foreground">
              A venda fica aguardando pagamento. Os créditos só serão descontados quando o Asaas enviar a confirmação de recebimento.
            </div>
            <Button className="w-full" onClick={createPayment} disabled={loading || !saleId}>
              {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Gerando Pix…</> : "Gerar QR Code Pix"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center rounded-xl border bg-white p-5">
              <img
                src={`data:image/png;base64,${data.encodedImage}`}
                alt="QR Code Pix"
                className="size-56 max-w-full"
              />
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-sm font-medium">Pix Copia e Cola</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{data.payload}</p>
              <Button variant="outline" className="mt-3 w-full" onClick={copyPayload}>
                <Copy className="mr-2 size-4" />Copiar código
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Check className="size-4 shrink-0 text-primary" />
              A confirmação será feita automaticamente pelo webhook do Asaas.
            </div>
            {data.expirationDate && (
              <p className="text-center text-xs text-muted-foreground">
                Expira em {new Date(data.expirationDate).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
