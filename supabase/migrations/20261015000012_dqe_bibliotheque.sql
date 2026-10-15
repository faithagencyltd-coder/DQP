-- PLANORA BTP — 12. DQE et BPU construits directement à partir de la bibliothèque des travaux.
alter table public.quotes drop constraint quotes_source_kind_check;
alter table public.quotes add constraint quotes_source_kind_check
  check (source_kind in ('dqe', 'metre', 'devis', 'modele', 'import', 'manuel', 'bibliotheque'));
