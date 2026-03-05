## App Name
Harbor — a weekly cash flow budgeting app

## Tagline
"Plan ahead. Stay ahead."

## Color Palette
- #1B3A5C — Deep navy (primary, headers, nav)
- #2A9D8F — Teal (accent, CTAs, active states)
- #E8F4F3 — Light teal wash (card backgrounds)
- #F8FAFC — Off white (page background)
- #E63946 — Coral red (negative balances, expenses)
- #2DC653 — Green (positive balances, income)

## Feature Backlog (build in this order)
1. Nav bar with Harbor branding + color palette applied app-wide
2. Collapsible category rows (collapsed shows category total per week)
3. Dashboard page — 3 cards: CC balances, projected month end balance, upcoming bills next 7 days
4. Savings Goals page — track a named target with current vs goal amount + progress bar
5. CC weekly close ledger — move weekly CC charges to a pending balance, mark as paid
6. Login / Account page (stub for now, Supabase later)

## Design Notes
- Water/nautical theme — clean, trustworthy, modern fintech feel
- Sans-serif fonts
- Cards with subtle shadows, rounded corners
- Green for positive/income, coral red for negative/expenses
- Weeks run Saturday→Friday
- Budget weeks can bleed across month boundaries (3 day rule)
- Biweekly items use an anchor date for correct week calculation

## Tech Stack
- Next.js 16, React 19, TypeScript, Tailwind CSS
- localStorage for persistence (Supabase migration planned)
- Three routes: / (budget), /setup (onboarding), /settings (manage items)