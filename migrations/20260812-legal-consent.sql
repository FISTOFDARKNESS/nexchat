-- Requisito legal: consentimento de idade (18+) e aceite dos Termos/Políticas
-- Obrigatório antes da criação de conta. Idempotente (compatível com schema UUID de produção).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "acceptedTermsAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "confirmedAgeAt" TIMESTAMPTZ;