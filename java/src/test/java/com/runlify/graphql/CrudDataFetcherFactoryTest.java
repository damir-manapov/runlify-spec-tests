package com.runlify.graphql;

import com.runlify.metadata.EntityMetadata;
import com.runlify.metadata.FieldMetadata;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CrudDataFetcherFactoryTest {

    // -----------------------------------------------------------------------
    // generateCuid
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // applyDefaults
    // -----------------------------------------------------------------------

    @Test
    void applyDefaults_stringLiteral() {
        var entity = entityWithFields(List.of(
            idField(),
            fieldWithDefault("status", "string", "'unposted'")
        ));
        var args = new LinkedHashMap<String, Object>();

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertEquals("unposted", args.get("status"));
    }

    @Test
    void applyDefaults_integerLiteral() {
        var entity = entityWithFields(List.of(
            idField(),
            fieldWithDefault("count", "int", "0")
        ));
        var args = new LinkedHashMap<String, Object>();

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertEquals(0, args.get("count"));
    }

    @Test
    void applyDefaults_doubleLiteral() {
        var entity = entityWithFields(List.of(
            idField(),
            fieldWithDefault("rate", "float", "3.14")
        ));
        var args = new LinkedHashMap<String, Object>();

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertEquals(3.14, args.get("rate"));
    }

    @Test
    void applyDefaults_skipsExistingKeys() {
        var entity = entityWithFields(List.of(
            idField(),
            fieldWithDefault("status", "string", "'unposted'")
        ));
        var args = new LinkedHashMap<String, Object>();
        args.put("status", "posted");

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertEquals("posted", args.get("status"), "Should not overwrite existing value");
    }

    @Test
    void applyDefaults_skipsIdField() {
        var id = new FieldMetadata("id", "string", "id",
            null, null, null, null, null, null, null,
            null, null, "cuid()", null, null, null,
            null, null, null, null, null);
        var entity = entityWithFields(List.of(id));
        var args = new LinkedHashMap<String, Object>();

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertFalse(args.containsKey("id"), "Should not apply defaults to id field");
    }

    @Test
    void applyDefaults_skipsFieldsWithoutDefault() {
        var entity = entityWithFields(List.of(
            idField(),
            scalar("name", "string")
        ));
        var args = new LinkedHashMap<String, Object>();

        CrudDataFetcherFactory.applyDefaults(entity, args);

        assertFalse(args.containsKey("name"));
    }

    // -----------------------------------------------------------------------
    // populateSearch
    // -----------------------------------------------------------------------

    @Test
    void populateSearch_combinesSearchableFields() {
        var entity = entityWithFields(List.of(
            idField(),
            searchable("name", "string"),
            searchable("code", "string")
        ));
        var data = new LinkedHashMap<String, Object>();
        data.put("name", "Widget");
        data.put("code", "W-001");

        CrudDataFetcherFactory.populateSearch(entity, data);

        assertEquals("Widget W-001", data.get("search"));
    }

    @Test
    void populateSearch_ignoresNonSearchable() {
        var entity = entityWithFields(List.of(
            idField(),
            searchable("name", "string"),
            scalar("price", "float")
        ));
        var data = new LinkedHashMap<String, Object>();
        data.put("name", "Widget");
        data.put("price", 9.99);

        CrudDataFetcherFactory.populateSearch(entity, data);

        assertEquals("Widget", data.get("search"));
    }

    @Test
    void populateSearch_handlesNullValues() {
        var entity = entityWithFields(List.of(
            idField(),
            searchable("name", "string"),
            searchable("code", "string")
        ));
        var data = new LinkedHashMap<String, Object>();
        data.put("name", "Widget");
        // code not in data

        CrudDataFetcherFactory.populateSearch(entity, data);

        assertEquals("Widget", data.get("search"));
    }

    @Test
    void populateSearch_emptyWhenNoSearchableFields() {
        var entity = entityWithFields(List.of(
            idField(),
            scalar("name", "string")
        ));
        var data = new LinkedHashMap<String, Object>();
        data.put("name", "Widget");

        CrudDataFetcherFactory.populateSearch(entity, data);

        assertEquals("", data.get("search"));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static FieldMetadata idField() {
        return new FieldMetadata("id", "int", "id",
            true, null, null, null, null, null, null,
            true, "autoincrement()", null, null, null, null,
            null, null, null, null, null);
    }

    private static FieldMetadata scalar(String name, String type) {
        return new FieldMetadata(name, type, "scalar",
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }

    private static FieldMetadata searchable(String name, String type) {
        return new FieldMetadata(name, type, "scalar",
            null, null, null, null, null, true, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }

    private static FieldMetadata fieldWithDefault(String name, String type, String defaultExpr) {
        return new FieldMetadata(name, type, "scalar",
            null, null, null, null, null, null, null,
            null, null, defaultExpr, null, null, null,
            null, null, null, null, null);
    }

    private static EntityMetadata entityWithFields(List<FieldMetadata> fields) {
        return new EntityMetadata("catalog", "items", fields,
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }
}
