-- idx_match_rooms_room_code duplicates match_rooms_room_code_key (the UNIQUE
-- constraint's own backing index) on the same single column, room_code. The
-- unique index already serves every lookup and uniqueness check on room_code,
-- so this one is pure write-maintenance cost with zero query benefit.
drop index if exists public.idx_match_rooms_room_code;
