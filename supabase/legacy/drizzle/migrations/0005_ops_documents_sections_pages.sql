-- Where each Operations Plan section starts inside a document's text, and where each PDF page starts,
-- so search can say which section (and page) a match is in for one large plan.
ALTER TABLE public.ops_documents ADD COLUMN IF NOT EXISTS sections jsonb;
ALTER TABLE public.ops_documents ADD COLUMN IF NOT EXISTS pages jsonb;
COMMENT ON COLUMN public.ops_documents.sections IS 'Detected section starts: [{category_id, code, title, start}] as character offsets into content';
COMMENT ON COLUMN public.ops_documents.pages IS 'PDF page start offsets into content (index 0 = page 1)';