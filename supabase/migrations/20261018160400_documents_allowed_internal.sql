-- document_reads_allowed is internal: it would otherwise tell any signed-in person whether any
-- wedding is unlocked. claim_document_read and document_reads_left use it on the person's behalf.
revoke execute on function public.document_reads_allowed(uuid) from public, anon, authenticated;
