package com.runlify.graphql;

import com.runlify.metadata.EntityMetadata;
import com.runlify.metadata.FieldMetadata;
import com.runlify.metadata.ProjectMetadata;
import com.runlify.schema.SchemaGenerator;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Builds a GraphQL SDL schema string from project metadata.
 *
 * Naming conventions (matching runlify TypeScript output):
 * <ul>
 *   <li>Type name = PascalCase singular: "items" → "Item"</li>
 *   <li>Plural = PascalCase of entity name as-is: "items" → "Items"</li>
 *   <li>create + singular: createItem</li>
 *   <li>update + singular: updateItem</li>
 *   <li>remove + singular: removeItem</li>
 *   <li>findOne = singular: Item(id: ...)</li>
 *   <li>findAll = "all" + plural: allItems(...)</li>
 *   <li>count = "_all" + plural + "Meta": _allItemsMeta</li>
 *   <li>sliceOfTheLast + singular: sliceOfTheLastPrice</li>
 *   <li>sliceOfTheFirst + singular: sliceOfTheFirstPrice</li>
 * </ul>
 */
@Component
public class GraphqlSchemaBuilder {

    /**
     * Generate the complete SDL for the project.
     */
    public String buildSdl(ProjectMetadata metadata) {
        var sb = new StringBuilder();
        var queryFields = new ArrayList<String>();
        var mutationFields = new ArrayList<String>();

        // ListMetadata type (shared)
        sb.append("type ListMetadata {\n  count: Int\n}\n\n");

        for (var entity : metadata.allEntities()) {
            var singular = singularName(entity);
            var plural = pluralName(entity);

            // Object type
            sb.append(buildObjectType(entity, singular));
            sb.append("\n");

            // Filter input
            sb.append(buildFilterInput(entity, singular));
            sb.append("\n");

            // Query fields
            queryFields.add(buildFindOneQuery(entity, singular));
            queryFields.add(buildFindAllQuery(singular, plural));
            queryFields.add(buildCountQuery(plural));

            // Slice queries for periodic info registries
            if (entity.isInfoRegistry() && entity.period() != null) {
                queryFields.add(buildSliceQuery("sliceOfTheLast", entity, singular));
                queryFields.add(buildSliceQuery("sliceOfTheFirst", entity, singular));
            }

            // Mutation fields
            mutationFields.add(buildCreateMutation(entity, singular));
            mutationFields.add(buildUpdateMutation(entity, singular));
            mutationFields.add(buildRemoveMutation(entity, singular));
        }

        // Query type
        sb.append("type Query {\n");
        for (var f : queryFields) {
            sb.append("  ").append(f).append("\n");
        }
        sb.append("}\n\n");

        // Mutation type
        sb.append("type Mutation {\n");
        for (var f : mutationFields) {
            sb.append("  ").append(f).append("\n");
        }
        sb.append("}\n");

        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Object type
    // -----------------------------------------------------------------------

    private String buildObjectType(EntityMetadata entity, String singular) {
        var sb = new StringBuilder();
        sb.append("type %s {\n".formatted(singular));
        for (var field : entity.fields()) {
            sb.append("  %s: %s\n".formatted(field.name(), field.graphqlType()));
        }
        sb.append("}\n");
        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Filter input
    // -----------------------------------------------------------------------

    private String buildFilterInput(EntityMetadata entity, String singular) {
        var sb = new StringBuilder();
        sb.append("input %sFilter {\n".formatted(singular));

        for (var field : entity.fields()) {
            if (field.isHidden()) continue;
            for (var filter : field.filters()) {
                switch (filter) {
                    case "equal" -> sb.append("  %s: %s\n".formatted(
                        field.name(), field.graphqlType()));
                    case "lte" -> sb.append("  %s_lte: %s\n".formatted(
                        field.name(), field.graphqlType()));
                    case "gte" -> sb.append("  %s_gte: %s\n".formatted(
                        field.name(), field.graphqlType()));
                    case "in" -> sb.append("  %s_in: [%s]\n".formatted(
                        field.name(), field.graphqlType()));
                    case "not_in" -> sb.append("  %s_not_in: [%s]\n".formatted(
                        field.name(), field.graphqlType()));
                    default -> { /* skip unknown filters */ }
                }
            }
            // _defined filter for optional link fields
            if (field.isLink() && !field.isRequired()) {
                sb.append("  %s_defined: Boolean\n".formatted(field.name()));
            }
        }

        // Global filters
        if (entity.isSearchEnabled()) {
            sb.append("  q: String\n");
        }
        var idField = entity.idField();
        sb.append("  ids: [%s]\n".formatted(idField.graphqlType()));

        sb.append("}\n");
        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Query fields
    // -----------------------------------------------------------------------

    private String buildFindOneQuery(EntityMetadata entity, String singular) {
        var idField = entity.idField();
        return "%s(id: %s!): %s".formatted(singular, idField.graphqlType(), singular);
    }

    private String buildFindAllQuery(String singular, String plural) {
        return "all%s(page: Int, perPage: Int, sortField: String, sortOrder: String, filter: %sFilter): [%s]"
            .formatted(plural, singular, singular);
    }

    private String buildCountQuery(String plural) {
        return "_all%sMeta(filter: %sFilter): ListMetadata"
            .formatted(plural, singularFromPlural(plural));
    }

    private String buildSliceQuery(String prefix, EntityMetadata entity, String singular) {
        var args = entity.dimensions().stream()
            .map(d -> "%s: %s".formatted(d.name(), d.graphqlType()))
            .collect(Collectors.joining(", "));
        return "%s%s(%s): %s".formatted(prefix, singular, args, singular);
    }

    // -----------------------------------------------------------------------
    // Mutation fields
    // -----------------------------------------------------------------------

    private String buildCreateMutation(EntityMetadata entity, String singular) {
        var args = new ArrayList<String>();
        for (var field : entity.fields()) {
            if (field.isHidden()) continue;
            // Auto-generated IDs are optional on create
            if (field.isId() && field.isAutoGenerated() && !field.isRequiredOnInput()) continue;
            var required = field.isRequiredOnInput() ? "!" : "";
            args.add("%s: %s%s".formatted(field.name(), field.graphqlType(), required));
        }
        return "create%s(%s): %s".formatted(singular, String.join(", ", args), singular);
    }

    private String buildUpdateMutation(EntityMetadata entity, String singular) {
        var args = new ArrayList<String>();
        var idField = entity.idField();
        args.add("id: %s!".formatted(idField.graphqlType()));

        for (var field : entity.fields()) {
            if (field.isId() || field.isHidden()) continue;
            if (!field.isUpdatableByUser()) continue;
            args.add("%s: %s".formatted(field.name(), field.graphqlType()));
        }
        return "update%s(%s): %s".formatted(singular, String.join(", ", args), singular);
    }

    private String buildRemoveMutation(EntityMetadata entity, String singular) {
        var idField = entity.idField();
        return "remove%s(id: %s!): %s".formatted(singular, idField.graphqlType(), singular);
    }

    // -----------------------------------------------------------------------
    // Naming helpers
    // -----------------------------------------------------------------------

    /** PascalCase singular: "items" → "Item" */
    public static String singularName(EntityMetadata entity) {
        return SchemaGenerator.pascalSingular(entity.name());
    }

    /** PascalCase plural (= capitalize the entity name as-is): "items" → "Items" */
    public static String pluralName(EntityMetadata entity) {
        var name = entity.name();
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    /** Reverse: "Items" → "Item" (for the filter input reference in count query) */
    private String singularFromPlural(String plural) {
        // We stored singular names in the type, so just singularize the plural
        return SchemaGenerator.pascalSingular(plural.substring(0, 1).toLowerCase() + plural.substring(1));
    }
}
