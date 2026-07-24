-- 009_add_appointment_portfolio_multi.sql
-- Allows a single Appointment to cover more than one portfolio (23 Jul
-- 2026, Mark's request — see Status.md §45). A broker discussing both
-- Discovery and Money & Medicine products in one meeting is a real
-- scenario — brokers themselves aren't limited to one portfolio (§41's
-- whole premise), so an appointment shouldn't artificially be either.
--
-- Appointment.portfolioId stays NOT NULL and becomes the PRIMARY
-- portfolio (first one selected at booking) rather than going vestigial
-- the way Lead.portfolioId/User.portfolioId did — every appointment
-- always has at least one portfolio chosen at booking time, so there's no
-- "unknown yet" case to accommodate here the way there was for Lead.
--
-- Run this directly against the live Neon database — schema.postgres.sql
-- alone does not reach an already-existing database.

CREATE TABLE IF NOT EXISTS AppointmentPortfolio (
    id            UUID            NOT NULL DEFAULT gen_random_uuid(),
    appointmentId UUID            NOT NULL,
    portfolioId   UUID            NOT NULL,
    createdAt     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_AppointmentPortfolio           PRIMARY KEY (id),
    CONSTRAINT FK_AppointmentPortfolio_Appt      FOREIGN KEY (appointmentId) REFERENCES Appointment(id),
    CONSTRAINT FK_AppointmentPortfolio_Portfolio FOREIGN KEY (portfolioId)   REFERENCES Portfolio(id),
    CONSTRAINT UQ_AppointmentPortfolio           UNIQUE (appointmentId, portfolioId)
);

-- Backfill every existing appointment's single portfolioId into the new
-- table, so the full set is always complete going forward — no appointment
-- ends up with zero rows here just because it predates this migration.
INSERT INTO AppointmentPortfolio (appointmentId, portfolioId)
SELECT id, portfolioId FROM Appointment
ON CONFLICT (appointmentId, portfolioId) DO NOTHING;
