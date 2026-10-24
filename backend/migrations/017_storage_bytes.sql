-- Legados permanecem desconhecidos até conferência segura do arquivo e hash.
-- A migration não acessa arquivos nem presume que tamanho ausente seja zero.
ALTER TABLE source_documents ADD COLUMN byte_size INTEGER CHECK(byte_size IS NULL OR byte_size >= 0);
