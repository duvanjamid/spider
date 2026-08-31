package com.spider.alertas.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/** ObjectMapper único (con soporte de fechas java.time). */
public final class Json {
    public static final ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule());
    private Json() {}
}
