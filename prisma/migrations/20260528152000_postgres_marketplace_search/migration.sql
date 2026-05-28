-- Enable trigram indexes for the default Postgres marketplace search path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Speeds up keyword search across listing text fields without requiring an external search service.
CREATE INDEX "DomainListing_postgres_search_trgm_idx"
ON "DomainListing"
USING GIN (
  LOWER(
    "domain" || ' ' ||
    "category" || ' ' ||
    "description" || ' ' ||
    "seoTitle" || ' ' ||
    "seoDescription" || ' ' ||
    COALESCE("registrar", '')
  ) gin_trgm_ops
);

-- Speeds up keyword search across appraisal summary/rationale text.
CREATE INDEX "Appraisal_postgres_search_trgm_idx"
ON "Appraisal"
USING GIN (
  LOWER(
    "domain" || ' ' ||
    "brandabilityNotes" || ' ' ||
    "generatedSummary"
  ) gin_trgm_ops
);

-- Supports the domain-label length filter in the marketplace UI.
CREATE INDEX "DomainListing_label_length_idx"
ON "DomainListing" ((length(split_part("domain", '.', 1))));
