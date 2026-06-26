-- Relax the par constraint to allow mini-golf pars (Par 2)
ALTER TABLE golf_holes DROP CONSTRAINT IF EXISTS golf_holes_par_check;
ALTER TABLE golf_holes ADD CONSTRAINT golf_holes_par_check CHECK (par >= 2 AND par <= 6);
