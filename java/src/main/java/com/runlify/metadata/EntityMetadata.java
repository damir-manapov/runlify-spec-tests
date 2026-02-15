package com.runlify.metadata;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Describes a single entity (catalog, document, info registry, or sum registry).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record EntityMetadata(
    String type,
    String name,
    List<FieldMetadata> fields,

    // Registry-specific
    List<FieldMetadata> dimensions,
    List<FieldMetadata> resources,
    Boolean registrarDepended,
    String period,

    // Document-specific
    List<String> registries,
    List<Object> tabularSections,
    List<Object> tabularSectionsV2,

    // Display / sorting
    String titleField,
    String keyField,
    String sortField,
    String sortOrder,
    Boolean searchEnabled,

    // Constraints
    List<List<String>> uniqueConstraints,

    // Permissions
    Boolean deletable,
    Boolean editable,
    Boolean creatableByUser,
    Boolean updatableByUser,
    Boolean removableByUser
) {
    public EntityMetadata {
        fields = fields != null ? fields : List.of();
        dimensions = dimensions != null ? dimensions : List.of();
        resources = resources != null ? resources : List.of();
        registries = registries != null ? registries : List.of();
        uniqueConstraints = uniqueConstraints != null ? uniqueConstraints : List.of();
        tabularSections = tabularSections != null ? tabularSections : List.of();
        tabularSectionsV2 = tabularSectionsV2 != null ? tabularSectionsV2 : List.of();
    }

    public boolean isCatalog()      { return "catalog".equals(type); }
    public boolean isDocument()     { return "document".equals(type); }
    public boolean isInfoRegistry() { return "infoRegistry".equals(type); }
    public boolean isSumRegistry()  { return "sumRegistry".equals(type); }
    public boolean isRegistry()     { return isInfoRegistry() || isSumRegistry(); }

    public boolean isRegistrarDepended() {
        return Boolean.TRUE.equals(registrarDepended);
    }

    public boolean isSearchEnabled() {
        return Boolean.TRUE.equals(searchEnabled);
    }

    /** Find the ID field for this entity. */
    public FieldMetadata idField() {
        return fields.stream()
            .filter(f -> "id".equals(f.category()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException(
                "Entity '" + name + "' has no id field"));
    }
}
