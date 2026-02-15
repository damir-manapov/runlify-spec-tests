package com.runlify.graphql;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CrudDataFetcherFactoryTest {

    @Test
    void generateCuid_startsWithC() {
        var id = CrudDataFetcherFactory.generateCuid();
        assertTrue(id.startsWith("c"), "CUID should start with 'c'");
    }

    @Test
    void generateCuid_unique() {
        var id1 = CrudDataFetcherFactory.generateCuid();
        var id2 = CrudDataFetcherFactory.generateCuid();
        assertNotEquals(id1, id2, "Two CUIDs should be different");
    }

    @Test
    void generateCuid_nonEmpty() {
        var id = CrudDataFetcherFactory.generateCuid();
        assertTrue(id.length() > 5, "CUID should be reasonably long");
    }
}
