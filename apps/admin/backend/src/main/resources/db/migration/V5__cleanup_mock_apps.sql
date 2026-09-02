-- ══════════════════════════════════════════════════════════════
--  admin · V5 · limpieza de apps de prueba (mocks)
--  Deja únicamente las apps reales del ecosistema (admin y gastos).
--  Las apps nuevas se auto-registran al arrancar (después de migrar),
--  así que esta limpieza puntual no las afecta. CASCADE borra sus grants.
-- ══════════════════════════════════════════════════════════════
DELETE FROM application WHERE slug NOT IN ('admin', 'gastos');
