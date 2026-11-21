# Project memory

## Product intent & audience

- Betting/gambling game platform with an operator admin panel
- Players sign up, sign in, place bets, cash out, deposit/withdraw funds, redeem promos
- Operators (admins) review deposit/withdrawal requests, make manual balance adjustments, and monitor site activity
- HarakaPay integration handles automatic deposits

## Brand personality & voice

- Operator-facing admin copy is clear and task-focused ("simplifies task for me")
- Player-facing game UI present (game header, sign-in page) but tone not yet specified

## Visual design & UX direction

- Vite + React stack; builds verified via `npm run build`
- Favicon image is the canonical logo asset (broken logo PNG was removed and replaced everywhere: game header, sign-in page, admin sidebar, admin mobile header, admin sign-in gate)
- Admin panel uses a tabbed layout grouped by function (e.g. "Insights" group contains Activity feed + Audit log)
- Admin features include searchable, filterable, paginated lists with Refresh buttons
- Responsive admin UI with mobile header variant
- Auth gating on admin panel (sign-in gate component)

## Decisions, constraints & rationale

- Logo: use favicon image everywhere instead of a separate logo PNG; old broken asset removed
- Activity tracking and audit logging are server-side and tamper-proof (players cannot forge or hide entries)
- Activity feed tracks: sign-ups, sign-ins, bets placed, cash-outs, losses, deposit/withdrawal requests, approvals, rejections, balance changes, promo redemptions
- Audit log records every operator action automatically (deposit/withdrawal reviews, manual balance adjustments) with admin identity, target player, and details
- Activity feed shows overview metrics: events in last 24h/7d, active players, total events, top actions
- `log_sign_in` is called after successful sign-in
- Database migration applied for activity tracking + audit log tables
- Batch independent operations in parallel where possible

## Open questions & assumptions

- Database backend assumed to be Supabase or similar (migrations, server-side functions like `log_sign_in`)
- Exact game mechanics and player-facing UI design not yet detailed
- Promo system details (creation, rules, limits) not yet explored
- HarakaPay integration details not yet documented
- Color palette, typography, and broader visual system not yet specified beyond favicon-as-logo