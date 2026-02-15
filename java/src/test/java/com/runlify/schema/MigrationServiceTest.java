package com.runlify.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MigrationServiceTest {

    @Test
    void extractSchema_fromQueryParam() {
        assertEquals("test_schema",
            MigrationService.extractSchema("jdbc:postgresql://localhost:5432/test?schema=test_schema"));
    }

    @Test
    void extractSchema_fromCurrentSchema() {
        assertEquals("myschema",
            MigrationService.extractSchema("jdbc:postgresql://localhost/db?currentSchema=myschema"));
    }

    @Test
    void extractSchema_withMultipleParams() {
        assertEquals("s1",
            MigrationService.extractSchema("jdbc:postgresql://host/db?sslmode=require&schema=s1&timeout=30"));
    }

    @Test
    void extractSchema_noSchemaParam() {
        assertNull(MigrationService.extractSchema("jdbc:postgresql://localhost:5432/test"));
    }

    @Test
    void extractSchema_nullUrl() {
        assertNull(MigrationService.extractSchema(null));
    }
}
