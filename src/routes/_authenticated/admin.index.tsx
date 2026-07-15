import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos pendentes</h1>
        <p className="text-sm text-muted-foreground">
          A fila de pedidos aparece aqui quando o checkout público for ativado.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fila limpa</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nenhum pedido pendente. O checkout público e o aceite chegam nas próximas fases.
        </CardContent>
      </Card>
    </div>
  );
}
