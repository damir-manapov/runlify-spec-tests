package com.runlify.metadata;

/**
 * Centralised naming conventions for converting entity metadata names
 * to SQL table names, GraphQL type names, etc.
 */
public final class EntityNames {

    private EntityNames() {}

    /** SQL table name / GraphQL singular type: "items" → "Item" */
    public static String tableName(EntityMetadata entity) {
        return pascalSingular(entity.name());
    }

    /** GraphQL singular type name: "items" → "Item" */
    public static String singularName(EntityMetadata entity) {
        return pascalSingular(entity.name());
    }

    /** GraphQL plural type name (capitalise as-is): "items" → "Items" */
    public static String pluralName(EntityMetadata entity) {
        var name = entity.name();
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    /** PascalCase singular: "items" → "Item", "invoiceTotals" → "InvoiceTotal" */
    public static String pascalSingular(String name) {
        var singular = singularize(name);
        return Character.toUpperCase(singular.charAt(0)) + singular.substring(1);
    }

    /**
     * Naive singularize — handles common patterns from runlify metadata:
     * "items" → "item", "categories" → "category", "prices" → "price",
     * "invoiceTotals" → "invoiceTotal"
     */
    static String singularize(String name) {
        if (name.endsWith("ies")) {
            // categories → category
            return name.substring(0, name.length() - 3) + "y";
        }
        if (name.endsWith("ses") || name.endsWith("zes") || name.endsWith("xes")) {
            // addresses → address (but not "prices" which ends in "ces")
            return name.substring(0, name.length() - 2);
        }
        if (name.endsWith("s") && !name.endsWith("ss")) {
            // items → item, prices → price, invoiceTotals → invoiceTotal
            return name.substring(0, name.length() - 1);
        }
        return name;
    }
}
