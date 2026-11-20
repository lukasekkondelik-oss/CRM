-- Štítky na osobách a firmách (sdílejí se stejnou sadou štítků jako dealy).
create table public.person_labels (
  person_id  uuid not null references public.persons (id) on delete cascade,
  label_id   uuid not null references public.labels (id) on delete cascade,
  primary key (person_id, label_id)
);
create table public.organization_labels (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  label_id         uuid not null references public.labels (id) on delete cascade,
  primary key (organization_id, label_id)
);
create index person_labels_label_idx on public.person_labels (label_id);
create index organization_labels_label_idx on public.organization_labels (label_id);

alter table public.person_labels enable row level security;
alter table public.organization_labels enable row level security;

create policy person_labels_workspace on public.person_labels for all to authenticated
  using (exists (select 1 from public.persons p where p.id = person_labels.person_id and p.workspace_id = (select public.current_workspace_id())))
  with check (
    exists (select 1 from public.persons p where p.id = person_labels.person_id and p.workspace_id = (select public.current_workspace_id()))
    and exists (select 1 from public.labels l where l.id = person_labels.label_id and l.workspace_id = (select public.current_workspace_id()))
  );

create policy organization_labels_workspace on public.organization_labels for all to authenticated
  using (exists (select 1 from public.organizations o where o.id = organization_labels.organization_id and o.workspace_id = (select public.current_workspace_id())))
  with check (
    exists (select 1 from public.organizations o where o.id = organization_labels.organization_id and o.workspace_id = (select public.current_workspace_id()))
    and exists (select 1 from public.labels l where l.id = organization_labels.label_id and l.workspace_id = (select public.current_workspace_id()))
  );

revoke all on public.person_labels, public.organization_labels from anon;
