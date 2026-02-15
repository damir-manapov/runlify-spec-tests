package com.runlify.metadata;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EntityNamesTest {

    // -----------------------------------------------------------------------
    // singularize
    // -----------------------------------------------------------------------

    @Test
    void singularize_regularPlural() {
        assertEquals("item", EntityNames.singularize("items"));
    }

    @Test
    void singularize_esEnding() {
        assertEquals("price", EntityNames.singularize("prices"));
    }

    @Test
    void singularize_iesEnding() {
        assertEquals("category", EntityNames.singularize("categories"));
    }

    @Test
    void singularize_sesEnding() {
        assertEquals("address", EntityNames.singularize("addresses"));
    }

    @Test
    void singularize_xesEnding() {
        assertEquals("box", EntityNames.singularize("boxes"));
    }

    @Test
    void singularize_zesEnding() {
        assertEquals("buzz", EntityNames.singularize("buzzes"));
    }

    @Test
    void singularize_doubleS_noChange() {
        assertEquals("boss", EntityNames.singularize("boss"));
    }

    @Test
    void singularize_camelCase() {
        assertEquals("invoiceTotal", EntityNames.singularize("invoiceTotals"));
    }

    @Test
    void singularize_noTrailingS_noChange() {
        assertEquals("datum", EntityNames.singularize("datum"));
    }

    // -----------------------------------------------------------------------
    // pascalSingular
    // -----------------------------------------------------------------------

    @Test
    void pascalSingular_basic() {
        assertEquals("Item", EntityNames.pascalSingular("items"));
    }

    @Test
    void pascalSingular_camelCase() {
        assertEquals("InvoiceTotal", EntityNames.pascalSingular("invoiceTotals"));
    }

    @Test
    void pascalSingular_iesEnding() {
        assertEquals("Category", EntityNames.pascalSingular("categories"));
    }

    // -----------------------------------------------------------------------
    // tableName / singularName / pluralName (via EntityMetadata)
    // -----------------------------------------------------------------------

    @Test
    void tableName_fromEntity() {
        assertEquals("Item", EntityNames.tableName(entity("catalog", "items")));
    }

    @Test
    void singularName_fromEntity() {
        assertEquals("Item", EntityNames.singularName(entity("catalog", "items")));
    }

    @Test
    void pluralName_fromEntity() {
        assertEquals("Items", EntityNames.pluralName(entity("catalog", "items")));
    }

    @Test
    void pluralName_camelCase() {
        assertEquals("InvoiceTotals",
            EntityNames.pluralName(entity("sumRegistry", "invoiceTotals")));
    }

    @Test
    void pluralName_preservesOriginalForm() {
        // pluralName just capitalises, doesn't re-pluralise
        assertEquals("Categories",
            EntityNames.pluralName(entity("catalog", "categories")));
    }

    private static EntityMetadata entity(String type, String name) {
        return new EntityMetadata(type, name, null,
            null, null, null, null, null, null, null,
            null, null, null, null, null, null,
            null, null, null, null, null);
    }
}
