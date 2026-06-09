-- Índice para drenar pendientes con keyset pagination (type + idpk).
-- Antes: findPendingRoutes hacía seq scan de PackageEvent y cargaba TODAS las
-- filas 'pending-route' (≈178k en prod) a RAM en cada cost-update → OOM del
-- master. Con este índice la consulta por tipo + cursor (idpk) es eficiente.
CREATE INDEX "PackageEvent_type_idpk_idx" ON "PackageEvent"("type", "idpk");
