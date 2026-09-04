-- ══════════════════════════════════════════════════════════════
--  electrolineras · V8 · calificación de estaciones (estrellas 1–5)
--  Un usuario califica una vez por estación (puede cambiar su voto).
--  El comentario sigue en station_comment; aquí solo la nota.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE station_rating (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id  BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    stars       SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (station_id, owner_email)
);
CREATE INDEX idx_rating_station ON station_rating (station_id);
