-- Store opening cash balance for first register shift
ALTER TABLE pos_outlets
  ADD COLUMN opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER store_close_time;
