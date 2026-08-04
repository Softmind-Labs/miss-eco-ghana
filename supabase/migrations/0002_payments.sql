-- Hubtel payment tracking.
--
-- Design notes worth knowing before changing anything here:
--
--  * fee_ghs (from 0001) is what we EXPECTED them to pay, locked at submission time.
--    amount_paid_ghs is what actually arrived. Keeping both is what lets you spot
--    underpayments and reconcile against the Hubtel dashboard.
--
--  * client_reference is both the idempotency key AND a security token. Hubtel does
--    not sign its callbacks, so anyone who learns a reference could try to forge one.
--    It must stay a random 32-char value — never a sequential invoice number.
--
--  * notified_at exists so the "payment received" email is sent exactly once, even if
--    Hubtel delivers the same callback several times. See the callback function.

alter table public.registrations
    add column payment_status        text not null default 'pending'
        check (payment_status in ('pending', 'paid', 'failed')),
    add column client_reference      text,
    add column hubtel_transaction_id text,
    add column amount_paid_ghs       numeric(10, 2),
    add column payment_method        text,
    add column paid_at               timestamptz,
    add column notified_at           timestamptz;

-- One live checkout per registration. Partial, because rows only get a reference
-- once a checkout has actually been initiated.
create unique index registrations_client_reference_key
    on public.registrations (client_reference)
    where client_reference is not null;

-- The callback looks rows up by reference on every delivery, including retries.
create index registrations_payment_status_idx
    on public.registrations (payment_status);

-- Both states, clearly separated, so nobody has to remember a filter.
-- security_invoker keeps RLS in force through the view — without it a view can
-- quietly hand out rows the underlying table's policies would refuse.
create view public.registrations_paid with (security_invoker = true) as
    select * from public.registrations where payment_status = 'paid';

create view public.registrations_unpaid with (security_invoker = true) as
    select * from public.registrations where payment_status <> 'paid';

comment on view public.registrations_paid   is 'Completed entries — money received.';
comment on view public.registrations_unpaid is 'Submitted but unpaid. Abandoned checkouts live here; chase or ignore.';
