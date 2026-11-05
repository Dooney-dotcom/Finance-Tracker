-- Each category carries its own chart colour, chosen by its owner.
-- Stored as lowercase #rrggbb so it can only ever be used as a colour value.
alter table public.categories
  add column color text check (color ~ '^#[0-9a-f]{6}$');

-- Suggested starting colours for the owner's existing categories, most distinct
-- hues first by all-time spend. Red, blue and ochre stay reserved for expense,
-- income and "needs attention".
update public.categories c
set color = v.color
from (values
  ('expense', 'Home', '#6250d6'),
  ('expense', 'Food / Groceries', '#eb6834'),
  ('expense', 'Shopping', '#1baf7a'),
  ('expense', 'Restaurants / Takeaway', '#e87ba4'),
  ('expense', 'Insurance', '#008300'),
  ('expense', 'Transport', '#0f8b8d'),
  ('expense', 'University', '#8b5a2b'),
  ('expense', 'Travel', '#b8a400'),
  ('expense', 'Entertainment', '#a33ea1'),
  ('expense', 'Health', '#4a4e9e'),
  ('expense', 'Subscriptions', '#c0a062'),
  ('expense', 'Taxes / Bills', '#7a8a99'),
  ('expense', 'Other', '#9c9a92'),
  ('expense', 'Clothing', '#d65db1'),
  ('expense', 'Leisure', '#5b8c00'),
  ('expense', 'Work', '#3d6b6e'),
  ('expense', 'Sports', '#7d5ba6'),
  ('income', 'Transport', '#0f8b8d')
) as v(kind, name, color)
where c.kind = v.kind and c.name = v.name;
