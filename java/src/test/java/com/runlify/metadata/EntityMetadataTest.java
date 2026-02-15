package com.runlify.metadata;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class EntityMetadataTest {

    // -----------------------------------------------------------------------
    // Type predicates
    // -----------------------------------------------------------------------

    @Test
    void isCatalog() {
        assertTrue(entity("catalog", "items").isCatalog());
        assertFalse(entity("document", "invoices").isCatalog());
    }

    @Test
    void isDocument() {
        assertTrue(entity("document", "invoices").isDocument());
        assertFalse(entity("catalog", "items").isDocument());
    }

    @Test
    void isInfoRegistry() {
        assertTrue(entity("infoRegistry", "prices").isInfoRegistry());
        assertFalse(entity("sumRegistry", "totals").isInfoRegistry());
    }

    @Test
    void isSumRegistry() {
        assertTrue(entity("sumRegistry", "totals").isSumRegistry());
        assertFalse(entity("infoRegistry", "prices").isSumRegistry());
    }

    @Test
    void isRegistry_trueForInfoAndSum() {
        assertTrue(entity("infoRegistry", "prices").isRegistry());
        assertTrue(entity("sumRegistry", "totals").isRegistry());
    }

    @Test
    void isRegistry_falseForCatalogAndDocument() {
        assertFalse(entity("catalog", "items").isRegistry());
        assertFalse(entity("document", "invoices").isRegistry());
    }

    // -----------------------------------------------------------------------
    // idField
    // -----------------------------------------------------------------------

    @Test
    void idField_findsIdCategory() {
        var id = field("id", "int", "id");
        var name = field("name", "string", "scalar");
        var entity = entityWithFields("catalog", "items", List.of(id, name));

        assertEquals("id", entity.idField().name());
        assertEquals("int", entity.idField().type());
    }

    @Test
    void idField_throwsWhenMissing() {
        var name = field("name", "string", "scalar");
        var entity = entityWithFields("catalog", "items", List.of(name));

        var ex = assertThrows(IllegalStateException.class, entity::idField);
        assertTrue(ex.getMessage().contains("items"));
    }

    // -----------------------------------------------------------------------
    // Null-safe compact constructor
    // -----------------------------------------------------------------------

    @Test
    void nullLists_defaultToEmpty() {
        var entity = entity("catalog", "items");

        assertAll(
            () -> assertNotNull(entity.fields()),
            () -> assertTrue(entity.fields().isEmpty()),
            () -> assertNotNull(entity.dimensions()),
            () -> assertTrue(entity.dimensions().isEmpty()),
            () -> assertNotNull(entity.resources()),
            () -> assertTrue(entity.resources().isEmpty()),
            () -> assertNotNull(entity.registries()),
            () -> assertTrue(entity.registries().isEmpty()),
            () -> assertNotNull(entity.uniqueConstraints()),
            () -> assertTrue(entity.uniqueConstraints().isEmpty()),
            () -> assertNotNull(entity.tabularSections()),
            () -> assertTrue(entity.tabularSections().isEmpty()),
            () -> assertNotNull(entity.tabularSectionsV2()),
            () -> assertTrue(entity.tabularSectionsV2().isEmpty())
        );
    }

    // -----------------------------------------------------------------------
    // Boolean accessors
    // -----------------------------------------------------------------------

    @Test
    void isSearchEnabled_falseWhenNull() {
        assertFalse(entity("catalog", "items").isSearchEnabled());
    }

    @Test
    void isSearchEnabled_trueWhenTrue() {
        var entity = new EntityMetadata("catalog", "items", null,
            null, null, null, null, null, null, null,
            null, null, null, null, true, null,
            null, null, null, null, null);
        assertTrue(entity.isSearchEnabled());
    }

    @Test
    void isRegistrarDepended_falseWhenNull() {
        assertFalse(entity("sumRegistry", "totals").isRegistrarDepended());
    }

    @Test
    void isRegistrarDepended_trueWhenTrue() {
        var entity = new EntityMetadata("sumRegistry", "totals", null,
            null, null, true, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
        assertTrue(entity.isRegistrarDepended());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static EntityMetadata entity(String type, String name) {
        return new EntityMetadata(type, name, null,
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }

    private static EntityMetadata entityWithFields(String type, String name, List<FieldMetadata> fields) {
        return new EntityMetadata(type, name, fields,
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }

    private static FieldMetadata field(String name, String type, String category) {
        return new FieldMetadata(name, type, category,
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }
}
