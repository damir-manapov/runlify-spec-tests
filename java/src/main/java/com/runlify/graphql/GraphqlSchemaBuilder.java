package com.runlify.graphql;

import com.runlify.metadata.EntityMetadata;
import com.runlify.metadata.EntityNames;
import com.runlify.metadata.FieldMetadata;
import com.runlify.metadata.ProjectMetadata;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
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
            var singular = EntityNames.singularName(entity);
            var plural = EntityNames.pluralName(entity);

            // Object type
            sb.append(buildObjectType(entity, singular));
            sb.append("\n");

            // Filter input
            sb.append(buildFilterInput(entity, singular));
            sb.append("\n");

            // Query fields
            queryFields.add(buildFindOneQuery(entity, singular));
            queryFields.add(buildFindAllQuery(singular, plural));
            queryFields.add(buildCountQuery(singular, plural));

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

    /** Field types that get automatic _lte/_gte/_lt/_gt range filters. */
    private static final List<String> RANGE_TYPES = List.of("int", "float", "bigint", "datetime", "date");

    /** Field types that get automatic _in/_not_in list filters. */
    private static final List<String> LIST_TYPES = List.of("string", "int", "float");

    private String buildFilterInput(EntityMetadata entity, String singular) {
        var sb = new StringBuilder();
        sb.append("input %sFilter {\n".formatted(singular));

        for (var field : entity.fields()) {
            if (field.isHidden()) continue;
            emitFieldFilters(sb, field);
        }

        if (entity.isSearchEnabled()) {
            sb.append("  q: String\n");
        }
        sb.append("  ids: [%s]\n".formatted(entity.idField().graphqlType()));
        sb.append("}\n");
        return sb.toString();
    }

    /** Emit all filter fields for a single entity field (metadata-declared + auto-generated). */
    private void emitFieldFilters(StringBuilder sb, FieldMetadata field) {
        var type = field.type();
        var emitted = new HashSet<String>();

        // Metadata-declared filters
        for (var f : field.filters()) {
            if (emitted.add(f)) emitFilter(sb, field, f);
        }

        // Auto-generated: _in / _not_in for string, int, float
        if (LIST_TYPES.contains(type)) {
            if (emitted.add("in"))     emitFilter(sb, field, "in");
            if (emitted.add("not_in")) emitFilter(sb, field, "not_in");
        }

        // Auto-generated: _lte / _gte / _lt / _gt for numeric and date types
        if (RANGE_TYPES.contains(type)) {
            for (var f : List.of("lte", "gte", "lt", "gt")) {
                if (emitted.add(f)) emitFilter(sb, field, f);
            }
        }

        // _defined for optional link fields
        if (field.isLink() && !field.isRequired()) {
            sb.append("  %s_defined: Boolean\n".formatted(field.name()));
        }
    }

    /** Emit a single filter field in SDL. */
    private void emitFilter(StringBuilder sb, FieldMetadata field, String filter) {
        var name = field.name();
        var gql = field.graphqlType();
        switch (filter) {
            case "equal"  -> sb.append("  %s: %s\n".formatted(name, gql));
            case "in"     -> sb.append("  %s_in: [%s]\n".formatted(name, gql));
            case "not_in" -> sb.append("  %s_not_in: [%s]\n".formatted(name, gql));
            default       -> sb.append("  %s_%s: %s\n".formatted(name, filter, gql));
        }
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

    private String buildCountQuery(String singular, String plural) {
        return "_all%sMeta(filter: %sFilter): ListMetadata"
            .formatted(plural, singular);
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

}
