-- Tabla para días libres del equipo
CREATE TABLE IF NOT EXISTS rest_days (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL,
  date date NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, date)
);

ALTER TABLE rest_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON rest_days
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
