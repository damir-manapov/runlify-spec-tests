package com.runlify.metadata;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/**
 * Root model for metadata.json — the single source of truth
 * that describes the entire application schema.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProjectMetadata(
    String name,
    String prefix,
    List<EntityMetadata> catalogs,
    List<EntityMetadata> documents,
    List<EntityMetadata> infoRegistries,
    List<EntityMetadata> sumRegistries,
    String defaultLanguage
) {
    public ProjectMetadata {
        catalogs = catalogs != null ? catalogs : List.of();
        documents = documents != null ? documents : List.of();
        infoRegistries = infoRegistries != null ? infoRegistries : List.of();
        sumRegistries = sumRegistries != null ? sumRegistries : List.of();
    }

    /** All entities across all types, for convenient iteration. */
    public List<EntityMetadata> allEntities() {
        var all = new java.util.ArrayList<EntityMetadata>();
        all.addAll(catalogs);
        all.addAll(documents);
        all.addAll(infoRegistries);
        all.addAll(sumRegistries);
        return List.copyOf(all);
    }
}
